// Valida supabase/migrations/*.sql en Postgres (PGlite) con un stub mínimo del entorno de Supabase:
// que las migraciones se ejecutan en orden (también sobre datos ya existentes), que cada usuario
// solo ve y toca sus datos, y las restricciones.
// Uso: npm run test:db
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const migration = (file) => readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8');
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

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) failures++;
};
const as = async (uid) => {
  await db.exec(`reset role; set role authenticated;`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
};
const asAdmin = () => db.exec(`reset role;`);
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const fails = async (sql, params) => {
  try {
    await db.query(sql, params);
    return null;
  } catch (e) {
    return e.message;
  }
};

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';
const C = '00000000-0000-0000-0000-00000000000c';

// ---------------------------------------------------------------- 001 y 002, con datos «antiguos»

await db.exec(migration('001_base.sql'));
await db.exec(migration('002_asistente.sql'));
ok(true, '001_base.sql y 002_asistente.sql se ejecutan sin errores');

await db.exec(`insert into auth.users values ('${A}', 'a@x.com'), ('${B}', 'b@x.com');`);
const seededOld = await one(`select
  (select count(*) from public.habits where user_id = $1)::int as habits,
  (select count(*) from public.budgets where user_id = $1)::int as budgets,
  (select count(*) from public.goals where user_id = $1)::int as goals`, [A]);
ok(seededOld.habits === 5 && seededOld.budgets === 8 && seededOld.goals === 2, `trigger crea datos iniciales: ${JSON.stringify(seededOld)}`);

// Movimientos con la categoría en texto, como los tiene hoy la base real (incluida una inventada).
await as(A);
await db.query(`insert into public.transactions (type, amount, category, note) values
  ('gasto', 12.5, 'Comida', 'almuerzo'), ('gasto', 20, 'Mascotas', 'pienso'), ('ingreso', 1500, 'Nómina', '')`);
await as(B);
await db.query(`insert into public.transactions (type, amount, category) values ('gasto', 5, 'comida')`);

// ---------------------------------------------------------------- 003: categorías

await asAdmin();
await db.exec(migration('003_categorias.sql'));
ok(true, '003_categorias.sql se ejecuta sin errores sobre una base con datos');

const catId = async (name, type = 'gasto', parentName = null) =>
  (
    await one(
      `select c.id from public.finance_categories c left join public.finance_categories p on p.id = c.parent_id
       where c.name = $1 and c.type = $2 and ${parentName ? 'p.name = $3' : 'c.parent_id is null and $3::text is null'}`,
      [name, type, parentName],
    )
  )?.id;

await as(A);
ok((await one(`select count(*)::int n from public.finance_categories`)).n === 15, 'A tiene 14 categorías por defecto + «Mascotas» creada a partir de su movimiento');
const txA = (await db.query(`select t.note, c.name, c.type from public.transactions t join public.finance_categories c on c.id = t.category_id order by t.amount`)).rows;
ok(
  JSON.stringify(txA.map((r) => r.name)) === JSON.stringify(['Comida', 'Mascotas', 'Nómina']),
  `cada movimiento antiguo queda enlazado a su categoría (${txA.map((r) => r.name).join(', ')})`,
);
const budgetsA = await one(`select count(*)::int n, count(*) filter (where c.name = 'Comida')::int comida
  from public.budgets b join public.finance_categories c on c.id = b.category_id`);
ok(budgetsA.n === 8 && budgetsA.comida === 1, 'los 8 presupuestos quedan enlazados por id');
ok(!!(await fails(`select category from public.transactions`)), 'la columna de texto «category» desaparece');
await as(B);
ok((await one(`select c.name from public.transactions t join public.finance_categories c on c.id = t.category_id`)).name === 'Comida', 'la coincidencia ignora mayúsculas («comida» → Comida)');

// Usuario nuevo tras la 003: el alta crea categorías, subcategorías y presupuestos.
await asAdmin();
await db.exec(`insert into auth.users values ('${C}', 'c@x.com');`);
await as(C);
const seededNew = await one(`select
  (select count(*) from public.finance_categories)::int as categorias,
  (select count(*) from public.finance_categories where parent_id is not null)::int as subcategorias,
  (select count(*) from public.budgets)::int as presupuestos,
  (select count(*) from public.habits)::int as habitos`);
ok(
  seededNew.categorias === 14 && seededNew.subcategorias === 2 && seededNew.presupuestos === 8 && seededNew.habitos === 5,
  `alta nueva: categorías, subcategorías, presupuestos y hábitos (${JSON.stringify(seededNew)})`,
);

// Reglas de las categorías
await as(A);
const comidaA = await catId('Comida');
const superA = await catId('Supermercado', 'gasto', 'Comida');
const otrosA = await catId('Otros');
const nominaA = await catId('Nómina', 'ingreso');
ok(!!(await fails(`insert into public.finance_categories (type, name, parent_id) values ('ingreso', 'Raro', $1)`, [comidaA])), 'una subcategoría no puede tener distinto tipo que su categoría');
ok(!!(await fails(`insert into public.finance_categories (type, name, parent_id) values ('gasto', 'Nivel 3', $1)`, [superA])), 'no se admite un tercer nivel');
ok(!!(await fails(`update public.finance_categories set parent_id = $1 where id = $2`, [otrosA, comidaA])), 'una categoría con subcategorías no puede pasar a ser subcategoría');
ok(!!(await fails(`insert into public.transactions (type, amount, category_id) values ('ingreso', 10, $1)`, [comidaA])), 'un ingreso no puede ir a una categoría de gasto');
ok(!!(await fails(`insert into public.finance_categories (type, name) values ('gasto', 'comida')`)), 'no se repiten nombres entre categorías activas');
await db.query(`update public.finance_categories set archived = true where name = 'Mascotas'`);
ok(!(await fails(`insert into public.finance_categories (type, name) values ('gasto', 'Mascotas')`)), 'una categoría archivada deja reutilizar su nombre');
ok(!!(await fails(`delete from public.finance_categories where id = $1`, [comidaA])), 'no se puede borrar una categoría con movimientos');
const vacia = await one(`insert into public.finance_categories (type, name) values ('gasto', 'Vacía') returning id`);
await db.query(`delete from public.finance_categories where id = $1`, [vacia.id]);
ok(!(await one(`select 1 from public.finance_categories where id = $1`, [vacia.id])), 'una categoría sin movimientos sí se borra');

// Aislamiento entre usuarios
await as(B);
ok((await one(`select count(*)::int n from public.finance_categories`)).n === 14, 'B solo ve sus propias categorías');
ok(!!(await fails(`insert into public.finance_categories (type, name, parent_id) values ('gasto', 'Intrusa', $1)`, [comidaA])), 'B no puede crear una subcategoría dentro de una de A');
ok(!!(await fails(`insert into public.transactions (type, amount, category_id) values ('gasto', 1, $1)`, [comidaA])), 'B no puede apuntar un movimiento en una categoría de A');
ok(!!(await fails(`select public.merge_finance_category($1, $2)`, [comidaA, otrosA])), 'B no puede fusionar categorías de A');
ok(!!(await fails(`select public.create_default_finance_categories($1)`, [B])), 'los clientes no pueden llamar a create_default_finance_categories');

// Fusionar
await as(A);
const mascotasA = (await one(`select id from public.finance_categories where name = 'Mascotas' and archived`)).id;
ok((await one(`select public.merge_finance_category($1, $2) as n`, [mascotasA, otrosA])).n === 1, 'fusionar «Mascotas» en «Otros» mueve su movimiento');
ok(!(await one(`select 1 from public.finance_categories where id = $1`, [mascotasA])), 'la categoría fusionada desaparece');
ok(!!(await fails(`select public.merge_finance_category($1, $2)`, [nominaA, otrosA])), 'no se puede fusionar un ingreso con un gasto');
ok(!!(await fails(`select public.merge_finance_category($1, $2)`, [comidaA, superA])), 'no se puede fusionar con una subcategoría propia');
await db.query(`insert into public.transactions (type, amount, category_id) values ('gasto', 30, $1)`, [superA]);
const moved = (await one(`select public.merge_finance_category($1, $2) as n`, [comidaA, otrosA])).n;
const afterMerge = await one(`select
  (select count(*)::int from public.finance_categories where parent_id = $1) as subcats_en_otros,
  (select count(*)::int from public.budgets where category_id = $1) as presupuestos_otros,
  (select count(*)::int from public.transactions where category_id = $1) as tx_otros`, [otrosA]);
ok(moved === 1 && afterMerge.subcats_en_otros === 2, `fusionar «Comida» en «Otros»: sus subcategorías pasan a «Otros» (${JSON.stringify(afterMerge)})`);
ok(afterMerge.presupuestos_otros === 1, 'el destino conserva un único presupuesto');
ok((await one(`select count(*)::int n from public.transactions where category_id = $1`, [superA])).n === 1, 'los movimientos de las subcategorías siguen en ellas');

// ---------------------------------------------------------------- Seguridad general (resto de tablas)

const pA = await one(`insert into public.projects (name) values ('Proyecto de A') returning id, user_id`);
ok(pA.user_id === A, 'user_id se asigna automáticamente al usuario autenticado');
await db.query(`insert into public.tasks (title, project_id) values ('Tarea de A', $1)`, [pA.id]);
await db.query(`insert into public.tasks (title) values ('Tarea suelta de A')`);
const hA = await one(`select id from public.habits limit 1`);
await db.query(`insert into public.habit_logs (habit_id, date) values ($1, current_date)`, [hA.id]);
ok((await one(`select count(*)::int n from public.habits`)).n === 5, 'A ve solo sus 5 hábitos');

await as(B);
ok((await one(`select count(*)::int n from public.projects`)).n === 0, 'B no ve los proyectos de A');
ok((await one(`select count(*)::int n from public.tasks`)).n === 0, 'B no ve las tareas de A');
ok((await one(`select count(*)::int n from public.transactions`)).n === 1, 'B solo ve su propio movimiento');
ok((await one(`select count(*)::int n from public.habit_logs`)).n === 0, 'B no ve el historial de hábitos de A');
ok((await db.query(`update public.projects set name = 'hackeado' where id = $1`, [pA.id])).affectedRows === 0, 'B no puede modificar un proyecto de A');
ok((await db.query(`delete from public.transactions where user_id = $1`, [A])).affectedRows === 0, 'B no puede borrar movimientos de A');
ok(!!(await fails(`insert into public.projects (user_id, name) values ($1, 'falso')`, [A])), 'B no puede insertar filas a nombre de A');
ok(!!(await fails(`insert into public.tasks (title, project_id) values ('intrusa', $1)`, [pA.id])), 'B no puede colgar una tarea de un proyecto de A');
ok(!!(await fails(`insert into public.habit_logs (habit_id, date) values ($1, current_date)`, [hA.id])), 'B no puede marcar un hábito de A');

await as(A);
ok(!!(await fails(`insert into public.transactions (type, amount, category_id) values ('gasto', -5, $1)`, [otrosA])), 'importes negativos rechazados');
ok(!!(await fails(`insert into public.health_logs (date, energy) values (current_date, 9)`)), 'energía fuera de 1-5 rechazada');
await db.query(`insert into public.health_logs (date, energy) values (current_date, 4)`);
ok(!!(await fails(`insert into public.health_logs (date, energy) values (current_date, 3)`)), 'un solo registro de salud por día');
await db.query(`delete from public.projects where id = $1`, [pA.id]);
ok((await one(`select count(*)::int n from public.tasks`)).n === 1, 'borrar un proyecto borra sus tareas (la suelta se queda)');
await db.query(`delete from public.habits where id = $1`, [hA.id]);
ok((await one(`select count(*)::int n from public.habit_logs`)).n === 0, 'borrar un hábito borra su historial');

// ---------------------------------------------------------------- Cupo diario del asistente

const quota = async (limit) => (await one(`select public.assistant_take_quota($1) as r`, [limit])).r;
ok((await quota(3)) === 2 && (await quota(3)) === 1 && (await quota(3)) === 0, 'el cupo baja con cada mensaje (2, 1, 0)');
ok((await quota(3)) === -1, 'agotado el cupo, devuelve -1');
ok((await one(`select messages from public.assistant_usage`)).messages === 3, 'un mensaje rechazado no suma al contador');
ok(!!(await fails(`update public.assistant_usage set messages = 0`)) || (await one(`select messages from public.assistant_usage`)).messages === 3, 'un usuario no puede reiniciar su contador');
ok(!!(await fails(`insert into public.assistant_usage (day, messages) values (current_date + 1, 0)`)), 'un usuario no puede insertar uso a mano');
await as(B);
ok((await quota(3)) === 2, 'el cupo de B es independiente del de A');
ok((await one(`select count(*)::int n from public.assistant_usage`)).n === 1, 'B solo ve su propio uso');

// ---------------------------------------------------------------- Anónimos

await db.exec(`reset role; set role anon;`);
ok(!!(await fails(`select * from public.habits`)), 'usuarios no autenticados no pueden leer nada');
ok(!!(await fails(`select * from public.finance_categories`)), 'ni las categorías');
ok(!!(await fails(`select public.merge_finance_category($1, $2)`, [comidaA, otrosA])), 'ni fusionar categorías');

await asAdmin();
console.log(failures ? `\n${failures} comprobación(es) fallida(s)` : '\nTodas las comprobaciones pasan');
process.exit(failures ? 1 : 0);
