// Valida supabase/schema.sql en Postgres (PGlite) con un stub mínimo del entorno de Supabase:
// que el esquema se ejecuta, que cada usuario solo ve y toca sus datos, y las restricciones.
// Uso: npm run test:db
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const db = new PGlite();

// Lo que Supabase ya trae: esquema auth, auth.uid() leyendo el JWT, roles y privilegios por defecto.
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
`);

await db.exec(schema);
console.log('✓ schema.sql se ejecuta sin errores');

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';
await db.exec(`insert into auth.users values ('${A}', 'a@x.com'), ('${B}', 'b@x.com');`);

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) failures++;
};
const as = async (uid) => {
  await db.exec(`reset role; set role authenticated;`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
};
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const fails = async (sql, params) => {
  try {
    await db.query(sql, params);
    return null;
  } catch (e) {
    return e.message;
  }
};

// Datos iniciales del trigger
const seeded = await one(`select
  (select count(*) from public.habits where user_id = $1)::int as habits,
  (select count(*) from public.budgets where user_id = $1)::int as budgets,
  (select count(*) from public.goals where user_id = $1)::int as goals`, [A]);
ok(seeded.habits === 5 && seeded.budgets === 8 && seeded.goals === 2, `trigger crea datos iniciales: ${JSON.stringify(seeded)}`);

// Usuario A crea datos; user_id se rellena solo
await as(A);
ok((await one(`select count(*)::int n from public.habits`)).n === 5, 'A ve solo sus 5 hábitos (no los 10 totales)');
const pA = await one(`insert into public.projects (name) values ('Proyecto de A') returning id, user_id`);
ok(pA.user_id === A, 'user_id se asigna automáticamente al usuario autenticado');
await db.query(`insert into public.tasks (title, project_id) values ('Tarea de A', $1)`, [pA.id]);
await db.query(`insert into public.tasks (title) values ('Tarea suelta de A')`);
await db.query(`insert into public.transactions (type, amount, category) values ('gasto', 12.5, 'Comida')`);
const hA = await one(`select id from public.habits limit 1`);
await db.query(`insert into public.habit_logs (habit_id, date) values ($1, current_date)`, [hA.id]);

// Usuario B no ve ni modifica nada de A
await as(B);
ok((await one(`select count(*)::int n from public.projects`)).n === 0, 'B no ve los proyectos de A');
ok((await one(`select count(*)::int n from public.tasks`)).n === 0, 'B no ve las tareas de A');
ok((await one(`select count(*)::int n from public.transactions`)).n === 0, 'B no ve los movimientos de A');
ok((await one(`select count(*)::int n from public.habit_logs`)).n === 0, 'B no ve el historial de hábitos de A');
const upd = await db.query(`update public.projects set name = 'hackeado' where id = $1`, [pA.id]);
ok(upd.affectedRows === 0, 'B no puede modificar un proyecto de A');
const del = await db.query(`delete from public.transactions`);
ok(del.affectedRows === 0, 'B no puede borrar movimientos de A');
ok(!!(await fails(`insert into public.projects (user_id, name) values ($1, 'falso')`, [A])), 'B no puede insertar filas a nombre de A');
ok(!!(await fails(`insert into public.tasks (title, project_id) values ('intrusa', $1)`, [pA.id])), 'B no puede colgar una tarea de un proyecto de A');
ok(!!(await fails(`insert into public.habit_logs (habit_id, date) values ($1, current_date)`, [hA.id])), 'B no puede marcar un hábito de A');

// Restricciones de datos
await as(A);
ok(!!(await fails(`insert into public.transactions (type, amount, category) values ('gasto', -5, 'Comida')`)), 'importes negativos rechazados');
ok(!!(await fails(`insert into public.health_logs (date, energy) values (current_date, 9)`)), 'energía fuera de 1-5 rechazada');
await db.query(`insert into public.health_logs (date, energy) values (current_date, 4)`);
ok(!!(await fails(`insert into public.health_logs (date, energy) values (current_date, 3)`)), 'un solo registro de salud por día');

// Borrado en cascada
await db.query(`delete from public.projects where id = $1`, [pA.id]);
ok((await one(`select count(*)::int n from public.tasks`)).n === 1, 'borrar un proyecto borra sus tareas (la suelta se queda)');
await db.query(`delete from public.habits where id = $1`, [hA.id]);
ok((await one(`select count(*)::int n from public.habit_logs`)).n === 0, 'borrar un hábito borra su historial');

// Anónimos sin acceso
await db.exec(`reset role; set role anon;`);
ok(!!(await fails(`select * from public.habits`)), 'usuarios no autenticados no pueden leer nada');

await db.exec(`reset role;`);
console.log(failures ? `\n${failures} comprobación(es) fallida(s)` : '\nTodas las comprobaciones pasan');
process.exit(failures ? 1 : 0);
