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
  grant usage on schema auth to anon, authenticated;
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

// ---------------------------------------------------------------- 004: importación

await asAdmin();
await db.exec(migration('004_importacion.sql'));
ok(true, '004_importacion.sql se ejecuta sin errores sobre una base con datos');

await as(A);
ok((await one(`select count(*)::int n from public.transactions where source = 'manual' and external_id is null`)).n >= 3, 'los movimientos existentes quedan como «manual» sin id externo');
const importSql = `insert into public.transactions (type, amount, category_id, source, external_id)
  values ('gasto', 9.99, $1, 'trade_republic', $2) on conflict (user_id, source, external_id) do nothing returning id`;
ok((await db.query(importSql, [otrosA, 'tr-001'])).rows.length === 1, 'importar un movimiento nuevo lo inserta');
ok((await db.query(importSql, [otrosA, 'tr-001'])).rows.length === 0, 'importar el mismo id otra vez no lo duplica');
await db.query(`insert into public.transactions (type, amount, category_id) values ('gasto', 1, $1), ('gasto', 1, $1)`, [otrosA]);
ok(true, 'los movimientos manuales (sin id externo) nunca chocan entre sí');
ok(!!(await fails(`insert into public.transactions (type, amount, category_id, source) values ('gasto', 1, $1, 'Origen raro!')`, [otrosA])), 'el origen solo admite minúsculas, números y _');

await db.query(`insert into public.import_rules (pattern, category_id) values ('MERCADONA', $1)`, [superA]);
ok(!!(await fails(`insert into public.import_rules (pattern, category_id) values ('mercadona', $1)`, [otrosA])), 'no se repite el mismo comercio (sin distinguir mayúsculas)');
await as(B);
ok((await one(`select count(*)::int n from public.import_rules`)).n === 0, 'B no ve las reglas de A');
ok(!!(await fails(`insert into public.import_rules (pattern, category_id) values ('LIDL', $1)`, [superA])), 'B no puede crear una regla con una categoría de A');
ok(!!(await fails(`insert into public.transactions (type, amount, category_id, source, external_id) values ('gasto', 1, $1, 'trade_republic', 'tr-001')`, [comidaA])), 'B no puede importar en categorías de A');
const sameIdB = await db.query(
  `insert into public.transactions (type, amount, category_id, source, external_id)
   select 'gasto', 1, id, 'trade_republic', 'tr-001' from public.finance_categories where name = 'Otros' returning id`,
);
ok(sameIdB.rows.length === 1, 'el mismo id externo en otro usuario no choca');
await as(A);
await db.query(`delete from public.finance_categories where id = $1`, [superA]).catch(() => {});
await db.query(`update public.transactions set category_id = $1 where category_id = $2`, [otrosA, superA]);
await db.query(`delete from public.finance_categories where id = $1`, [superA]);
ok((await one(`select count(*)::int n from public.import_rules`)).n === 0, 'borrar una categoría borra sus reglas');

// ---------------------------------------------------------------- 005: periódicos

await asAdmin();
await db.exec(migration('005_periodicos.sql'));
ok(true, '005_periodicos.sql se ejecuta sin errores (sin pg_cron, sigue adelante)');

// Calendario: los mismos casos que tests/recurring.test.ts para nextOccurrence().
const next = async (d, f, day, month = 1) => (await one(`select public.recurring_next_date($1::date, $2, $3, $4)::text as d`, [d, f, day, month])).d;
const calendar = [
  ['2026-01-31', 'mensual', 31, 1, '2026-02-28'],
  ['2026-02-28', 'mensual', 31, 1, '2026-03-31'],
  ['2028-01-30', 'mensual', 30, 1, '2028-02-29'],
  ['2026-12-15', 'mensual', 15, 1, '2027-01-15'],
  ['2026-10-17', 'semanal', 17, 1, '2026-10-24'],
  ['2028-02-29', 'anual', 29, 2, '2029-02-28'],
  ['2031-02-28', 'anual', 29, 2, '2032-02-29'],
];
for (const [d, f, day, month, expected] of calendar) {
  const got = await next(d, f, day, month);
  ok(got === expected, `recurring_next_date(${d}, ${f}, día ${day}) = ${expected}${got !== expected ? ` (da ${got})` : ''}`);
}

await as(A);
const today = (await one(`select current_date::text as d`)).d;
const ago = (await one(`select (current_date - interval '2 month')::date::text as d`)).d;
const otrosIngresos = await catId('Otros ingresos', 'ingreso');
const rule = await one(
  `insert into public.recurring_transactions (type, amount, category_id, note, frequency, anchor_day, next_date)
   values ('gasto', 12.99, $1, 'Netflix', 'mensual', extract(day from $2::date), $2) returning id`,
  [otrosA, ago],
);
const generated = (await one(`select public.generate_my_recurring(current_date) as n`)).n;
ok(generated === 3, `genera los 3 meses pendientes desde hace 2 meses (${generated})`);
ok((await one(`select public.generate_my_recurring(current_date) as n`)).n === 0, 'volver a generar no duplica nada');
const after = await one(`select next_date::text as d, active from public.recurring_transactions where id = $1`, [rule.id]);
ok(after.d > today && after.active, `la próxima fecha queda en el futuro (${after.d})`);
const txRule = await one(`select count(*)::int n, min(note) note, min(source) src from public.transactions where external_id like $1`, [`${rule.id}:%`]);
ok(txRule.n === 3 && txRule.note === 'Netflix' && txRule.src === 'recurrente', 'los movimientos generados llevan concepto, origen «recurrente» e id externo');
await db.query(`delete from public.transactions where external_id = $1`, [`${rule.id}:${ago}`]);
await db.query(`update public.recurring_transactions set next_date = $1 where id = $2`, [ago, rule.id]);
ok((await one(`select public.generate_my_recurring(current_date) as n`)).n === 1, 'si se rebobina, solo se recrea el que faltaba (el resto ya existen)');

const ended = await one(
  `insert into public.recurring_transactions (type, amount, category_id, note, frequency, anchor_day, next_date, end_date)
   values ('ingreso', 100, $1, 'Beca', 'mensual', 1, $2, $2) returning id`,
  [otrosIngresos, ago],
);
await db.query(`select public.generate_my_recurring(current_date)`);
ok((await one(`select active from public.recurring_transactions where id = $1`, [ended.id])).active === false, 'al pasar su fecha de fin, el periódico se desactiva');
ok((await one(`select count(*)::int n from public.transactions where external_id like $1`, [`${ended.id}:%`])).n === 1, 'y no genera nada después de su fin');
ok((await one(`select public.generate_my_recurring(current_date + 30) as n`)).n === 0, 'no se pueden generar movimientos más allá de mañana');
ok(!!(await fails(`insert into public.recurring_transactions (type, amount, category_id, note, frequency, anchor_day, next_date) values ('ingreso', 1, $1, 'x', 'mensual', 1, current_date)`, [otrosA])), 'un periódico de ingreso no puede usar una categoría de gasto');

await as(B);
ok((await one(`select count(*)::int n from public.recurring_transactions`)).n === 0, 'B no ve los periódicos de A');
ok((await one(`select public.generate_my_recurring(current_date) as n`)).n === 0, 'B generando solo afecta a los suyos');
ok(!!(await fails(`select public.generate_recurring_for_user($1, current_date)`, [A])), 'los clientes no pueden generar para otro usuario');
ok(!!(await fails(`select public.generate_recurring_all()`)), 'ni lanzar la generación global');
await asAdmin();
ok((await one(`select public.generate_recurring_all() as n`)).n === 0, 'la tarea diaria (como administrador) funciona y no duplica');

await as(A);
const suscripciones = await catId('Suscripciones');
await db.query(`select public.merge_finance_category($1, $2)`, [otrosA, suscripciones]);
ok((await one(`select category_id from public.recurring_transactions where id = $1`, [rule.id])).category_id === suscripciones, 'fusionar categorías mueve también sus periódicos');
ok(!!(await fails(`delete from public.finance_categories where id = $1`, [suscripciones])), 'no se puede borrar una categoría que usan movimientos o periódicos');

// ---------------------------------------------------------------- 006: sub-pestañas y bloques

await asAdmin();
await db.exec(migration('006_pestanas.sql'));
ok(true, '006_pestanas.sql se ejecuta sin errores');

await as(A);
const gym = await one(`insert into public.tabs (section, name, icon) values ('habitos', 'Gym', '🏋️') returning id, user_id`);
ok(gym.user_id === A, 'la sub-pestaña queda a nombre de quien la crea');
const note = await one(
  `insert into public.blocks (tab_id, type, title, content) values ($1, 'notas', 'Rutina', '{"text": "Lunes: pierna"}') returning id`,
  [gym.id],
);
await db.query(`insert into public.blocks (tab_id, type, content) values ($1, 'checklist', '{"items": [], "reset": "diario"}')`, [gym.id]);
ok((await one(`select content->>'text' t from public.blocks where id = $1`, [note.id])).t === 'Lunes: pierna', 'el contenido del bloque se guarda como JSON');
ok(!!(await fails(`insert into public.tabs (section, name) values ('ajustes', 'X')`)), 'solo se pueden crear sub-pestañas en las secciones fijas');
ok(!!(await fails(`insert into public.tabs (section, name) values ('habitos', '   ')`)), 'el nombre no puede estar vacío');
ok(!!(await fails(`insert into public.tabs (section, name) values ('habitos', $1)`, ['x'.repeat(41)])), 'ni pasar de 40 caracteres');
ok(!!(await fails(`insert into public.tabs (section, parent_id, name) values ('habitos', $1, 'X')`, [gym.id])), 'una sub-pestaña no puede colgar a la vez de una sección y de otra pestaña');
ok(!!(await fails(`insert into public.blocks (tab_id, type) values ($1, 'video')`, [gym.id])), 'tipo de bloque desconocido rechazado');
ok(!!(await fails(`insert into public.blocks (tab_id, type, content) values ($1, 'notas', '[1, 2]')`, [gym.id])), 'el contenido tiene que ser un objeto JSON');
ok(!!(await fails(`insert into public.blocks (tab_id, type, content) values ($1, 'notas', $2)`, [gym.id, JSON.stringify({ text: 'x'.repeat(70000) })])), 'un bloque no puede pasar de 64 KB');

await as(B);
ok((await one(`select count(*)::int n from public.tabs`)).n === 0, 'B no ve las sub-pestañas de A');
ok((await one(`select count(*)::int n from public.blocks`)).n === 0, 'B no ve los bloques de A');
ok(!!(await fails(`insert into public.blocks (tab_id, type) values ($1, 'notas')`, [gym.id])), 'B no puede añadir bloques a una pestaña de A');
ok((await db.query(`update public.blocks set content = '{"text": "hackeado"}' where id = $1`, [note.id])).affectedRows === 0, 'B no puede modificar un bloque de A');
ok((await db.query(`delete from public.tabs where id = $1`, [gym.id])).affectedRows === 0, 'B no puede borrar una pestaña de A');
const tabB = await one(`insert into public.tabs (section, name) values ('habitos', 'Mía') returning id`);

await as(A);
ok(!!(await fails(`update public.blocks set tab_id = $1 where id = $2`, [tabB.id, note.id])), 'A no puede mover un bloque a una pestaña de B');
await db.query(`delete from public.tabs where id = $1`, [gym.id]);
ok((await one(`select count(*)::int n from public.blocks`)).n === 0, 'borrar una sub-pestaña borra sus bloques');

// ---------------------------------------------------------------- 007: diseñador de categorías

// B tiene una sub-pestaña de la 006 («Mía», en Hábitos) con tres bloques en lista.
await as(B);
for (const n of [0, 1, 2]) {
  await db.query(`insert into public.blocks (tab_id, type, sort_order) values ($1, 'notas', $2)`, [tabB.id, n]);
}

await asAdmin();
await db.exec(migration('007_disenador.sql'));
ok(true, '007_disenador.sql se ejecuta sin errores sobre una base con datos');

await as(B);
const legacy = (await db.query(`select x, y, w from public.blocks where tab_id = $1 order by sort_order`, [tabB.id])).rows;
ok(
  JSON.stringify(legacy) === JSON.stringify([{ x: 0, y: 0, w: 6 }, { x: 6, y: 0, w: 6 }, { x: 0, y: 6, w: 6 }]),
  `los bloques que ya existían se reparten en dos columnas: ${JSON.stringify(legacy)}`,
);

const START = { name: 'Inicio', icon: '🏠', template: 'inicio', blocks: [{ type: 'saludo', title: '', x: 0, y: 0, w: 12, h: 2 }] };
const PAGES = JSON.stringify([
  START,
  {
    name: 'Hábitos y salud',
    icon: '💪',
    template: 'habitos',
    blocks: [],
    children: [{ name: 'Gráficos', icon: '📈', template: 'habitos_graficos', blocks: [{ type: 'notas', content: { text: 'hola' }, x: 6, y: 0, w: 6, h: 4 }] }],
  },
]);
ok((await one(`select public.seed_default_pages($1) n`, [PAGES])).n === 3, 'crea las categorías por defecto con sus subpáginas');
ok((await one(`select public.seed_default_pages($1) n`, [PAGES])).n === 0, 'la segunda vez no crea nada');
const habB = await one(`select id from public.tabs where template = 'habitos'`);
const mia = await one(`select parent_id, section from public.tabs where name = 'Mía'`);
ok(mia.parent_id === habB.id && mia.section === null, 'la sub-pestaña antigua pasa a ser subpágina de su categoría');
const seededBlock = await one(
  `select b.type, b.x, b.w, b.h, b.content->>'text' t from public.blocks b join public.tabs p on p.id = b.tab_id where p.template = 'habitos_graficos'`,
);
ok(seededBlock.type === 'notas' && seededBlock.x === 6 && seededBlock.w === 6 && seededBlock.h === 4 && seededBlock.t === 'hola', 'los bloques se crean con su posición, tamaño y contenido');
const order = (await db.query(`select name from public.tabs where parent_id is null order by sort_order`)).rows.map((r) => r.name);
ok(order.join(',') === 'Inicio,Hábitos y salud', `las categorías quedan en su orden: ${order}`);

await db.query(`delete from public.tabs`);
ok((await one(`select public.seed_default_pages($1) n`, [PAGES])).n === 0, 'si borra las categorías por defecto, no vuelven a aparecer solas');
ok((await one(`select public.insert_page_tree($1) n`, [JSON.stringify([START])])).n === 1, 'pero puede restaurar una');
ok(!!(await fails(`select public.insert_page_tree($1)`, [JSON.stringify([START])])), 'sin duplicar una categoría por defecto');
ok(!!(await fails(`select public.insert_page_tree($1)`, [JSON.stringify([{ name: 'X', blocks: [{ type: 'notas', x: 10, w: 4 }] }])])), 'si un bloque está mal, no se crea nada');
ok((await one(`select count(*)::int n from public.tabs where name = 'X'`)).n === 0, 'ni siquiera la página');

const viajes = await one(`insert into public.tabs (name, icon) values ('Viajes', '✈️') returning id`);
const japon = await one(`insert into public.tabs (name, parent_id) values ('Japón 2027', $1) returning id`, [viajes.id]);
const itinerario = await one(`insert into public.tabs (name, parent_id) values ('Itinerario', $1) returning id`, [japon.id]);
ok((await one(`select public.insert_page_tree($1, $2) n`, [JSON.stringify([{ name: 'Día 1' }]), itinerario.id])).n === 1, 'se pueden anidar páginas en tantos niveles como haga falta');
ok(!!(await fails(`update public.tabs set parent_id = $1 where id = $2`, [itinerario.id, viajes.id])), 'una página no puede ir dentro de una de sus subpáginas');
ok(!!(await fails(`update public.tabs set parent_id = id where id = $1`, [viajes.id])), 'ni dentro de sí misma');
ok(!(await fails(`update public.tabs set parent_id = null where id = $1`, [itinerario.id])), 'una subpágina puede pasar a ser categoría principal');

ok(!!(await fails(`insert into public.blocks (tab_id, type, x, w) values ($1, 'notas', 8, 6)`, [viajes.id])), 'un bloque no puede salirse de la rejilla de 12 columnas');
ok(!!(await fails(`insert into public.blocks (tab_id, type, h) values ($1, 'notas', 0)`, [viajes.id])), 'ni tener altura 0');
ok(!(await fails(`insert into public.blocks (tab_id, type) values ($1, 'fin_resumen')`, [viajes.id])), 'los tipos de bloque nuevos no necesitan otra migración');
ok(!!(await fails(`insert into public.blocks (tab_id, type) values ($1, 'Notas; drop')`, [viajes.id])), 'pero el tipo tiene que tener forma de identificador');
await db.query(`delete from public.tabs where id = $1`, [viajes.id]);
ok((await one(`select count(*)::int n from public.tabs where name = 'Japón 2027'`)).n === 0, 'borrar una página borra sus subpáginas');
ok((await one(`select count(*)::int n from public.tabs where name in ('Itinerario', 'Día 1')`)).n === 2, 'y no las que ya se habían sacado de ella');

await as(A);
ok((await one(`select count(*)::int n from public.user_settings`)).n === 0, 'A no ve los ajustes de B');
ok((await one(`select public.seed_default_pages($1) n`, [PAGES])).n === 3, 'cada usuario recibe sus propias categorías por defecto');
ok(!!(await fails(`select public.insert_page_tree($1, $2)`, [JSON.stringify([{ name: 'Intrusa' }]), habB.id])), 'A no puede crear páginas dentro de una de B');
ok(!!(await fails(`update public.user_settings set user_id = $1`, [B])), 'ni hacerse pasar por B en los ajustes');
await db.exec(`reset role; set role anon;`);
ok(!!(await fails(`select public.seed_default_pages('[]')`)), 'sin sesión no se pueden crear páginas');
await as(A);

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
ok((await one(`select count(*)::int n from public.transactions`)).n === 2, 'B solo ve sus propios 2 movimientos');
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
