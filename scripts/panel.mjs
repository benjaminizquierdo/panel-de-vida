#!/usr/bin/env node
// Línea de comandos para leer y escribir en tu Panel de Vida (backend Supabase).
// Inicia sesión con PANEL_EMAIL / PANEL_PASSWORD, así que solo accede a TUS datos
// (Row Level Security). Pensado para que un asistente pueda registrar cosas por ti.
//
// Uso:  npm run panel -- <comando> [argumentos]
//
//   list <tabla> [n]                 Últimas n filas (por defecto 20)
//   add <tabla> '<json>'             Inserta una fila
//   update <tabla> <id> '<json>'     Modifica una fila
//   delete <tabla> <id>              Elimina una fila
//   gasto <importe> <categoría> [nota…] [--fecha AAAA-MM-DD]     (categoría o subcategoría, por nombre)
//   ingreso <importe> <categoría> [nota…] [--fecha AAAA-MM-DD]
//   habito <nombre o parte> [--fecha AAAA-MM-DD]    Marca un hábito como hecho
//   salud '<json>' [--fecha AAAA-MM-DD]             sleep_hours, energy (1-5), exercise_minutes, weight, notes
//   tarea <título…> [--proyecto <nombre>] [--prioridad alta|media|baja] [--limite AAAA-MM-DD]
//   destacado <texto…>                              Lo más importante de hoy
//   resumen                                         Resumen del día y del mes
//
// Tablas: projects, tasks, habits, habit_logs, health_logs, goals, reviews,
//         highlights, transactions, budgets, finance_categories, tabs, blocks

import { createClient } from '@supabase/supabase-js';

const TABLES = [
  'projects', 'tasks', 'habits', 'habit_logs', 'health_logs',
  'goals', 'reviews', 'highlights', 'transactions', 'budgets', 'finance_categories',
  'tabs', 'blocks',
];

const { VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: key, PANEL_EMAIL: email, PANEL_PASSWORD: password } = process.env;

const die = (msg) => {
  console.error(`Error: ${msg}`);
  process.exit(1);
};

if (!url || !key) die('faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env.local');
if (!email || !password) die('faltan PANEL_EMAIL y PANEL_PASSWORD en .env.local');

// --opcion valor  →  opts.opcion; el resto son posicionales.
const argv = process.argv.slice(2);
const opts = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) opts[argv[i].slice(2)] = argv[++i];
  else pos.push(argv[i]);
}
const [cmd, ...args] = pos;

const localDate = (d = new Date()) => d.toLocaleDateString('sv-SE'); // AAAA-MM-DD en hora local
const day = opts.fecha ?? localDate();
if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) die(`fecha no válida: ${day}`);

const table = (name) => {
  if (!TABLES.includes(name)) die(`tabla desconocida: ${name}. Usa una de: ${TABLES.join(', ')}`);
  return name;
};

const json = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return die(`JSON no válido: ${text}`);
  }
};

const amount = (text) => {
  const n = Number(String(text).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) die(`importe no válido: ${text}`);
  return Math.round(n * 100) / 100;
};

const sb = createClient(url, key, { auth: { persistSession: false } });

const { data: auth, error: authError } = await sb.auth.signInWithPassword({ email, password });
if (authError) die(`no se pudo iniciar sesión: ${authError.message}`);
const userId = auth.user.id;

const check = ({ data, error }) => {
  if (error) die(error.message);
  return data;
};

const print = (value) => console.log(JSON.stringify(value, null, 2));

// Busca por nombre sin distinguir mayúsculas ni acentos; falla si no hay exactamente un resultado claro.
const normalize = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const findByName = (rows, field, query, what) => {
  const q = normalize(query);
  const exact = rows.filter((r) => normalize(r[field]) === q);
  const partial = rows.filter((r) => normalize(r[field]).includes(q));
  const matches = exact.length ? exact : partial;
  if (matches.length === 0) die(`no encuentro ${what} «${query}». Opciones: ${rows.map((r) => r[field]).join(', ')}`);
  if (matches.length > 1) die(`«${query}» coincide con varios: ${matches.map((r) => r[field]).join(', ')}`);
  return matches[0];
};

const commands = {
  async list() {
    const t = table(args[0]);
    const n = Number(args[1] ?? 20);
    print(check(await sb.from(t).select('*').order('created_at', { ascending: false }).limit(n)));
  },

  async add() {
    print(check(await sb.from(table(args[0])).insert(json(args[1])).select().single()));
  },

  async update() {
    print(check(await sb.from(table(args[0])).update(json(args[2])).eq('id', args[1]).select().single()));
  },

  async delete() {
    check(await sb.from(table(args[0])).delete().eq('id', args[1]));
    print({ eliminado: args[1] });
  },

  async gasto() {
    await commands.movimiento('gasto');
  },

  async ingreso() {
    await commands.movimiento('ingreso');
  },

  async movimiento(type) {
    const [importe, categoryName, ...note] = args;
    if (!importe || !categoryName) die(`uso: ${type} <importe> <categoría> [nota]`);
    const categories = check(await sb.from('finance_categories').select('id, name').eq('type', type).eq('archived', false));
    const category = findByName(categories, 'name', categoryName, 'la categoría');
    const row = { type, amount: amount(importe), category_id: category.id, note: note.join(' '), date: day };
    print(check(await sb.from('transactions').insert(row).select().single()));
  },

  async habito() {
    if (!args.length) die('uso: habito <nombre>');
    const habits = check(await sb.from('habits').select('id, name').eq('active', true));
    const habit = findByName(habits, 'name', args.join(' '), 'el hábito');
    const row = { user_id: userId, habit_id: habit.id, date: day };
    check(await sb.from('habit_logs').upsert(row, { onConflict: 'habit_id,date', ignoreDuplicates: true }));
    print({ hecho: habit.name, fecha: day });
  },

  async salud() {
    const fields = json(args[0] ?? '{}');
    const row = { user_id: userId, date: day, ...fields };
    print(check(await sb.from('health_logs').upsert(row, { onConflict: 'user_id,date' }).select().single()));
  },

  async tarea() {
    if (!args.length) die('uso: tarea <título> [--proyecto nombre]');
    let projectId = null;
    if (opts.proyecto) {
      const projects = check(await sb.from('projects').select('id, name'));
      projectId = findByName(projects, 'name', opts.proyecto, 'el proyecto').id;
    }
    const priority = opts.prioridad ?? 'media';
    if (!['alta', 'media', 'baja'].includes(priority)) die(`prioridad no válida: ${priority}`);
    const row = { title: args.join(' '), project_id: projectId, priority, status: 'pendiente', due_date: opts.limite ?? null };
    print(check(await sb.from('tasks').insert(row).select().single()));
  },

  async destacado() {
    if (!args.length) die('uso: destacado <texto>');
    const row = { user_id: userId, date: day, text: args.join(' '), done: false };
    print(check(await sb.from('highlights').upsert(row, { onConflict: 'user_id,date' }).select().single()));
  },

  async resumen() {
    const month = day.slice(0, 7);
    const [y, m] = month.split('-').map(Number);
    const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const [habits, logs, tasks, txs, budgets, highlight] = await Promise.all([
      sb.from('habits').select('id, name').eq('active', true).then(check),
      sb.from('habit_logs').select('habit_id').eq('date', day).then(check),
      sb.from('tasks').select('title, status, due_date').neq('status', 'hecha').then(check),
      sb.from('transactions').select('type, amount').gte('date', `${month}-01`).lt('date', nextMonth).then(check),
      sb.from('budgets').select('monthly_limit').then(check),
      sb.from('highlights').select('text, done').eq('date', day).maybeSingle().then(check),
    ]);
    const done = new Set(logs.map((l) => l.habit_id));
    const sum = (rows) => Math.round(rows.reduce((a, r) => a + Number(r.amount), 0) * 100) / 100;
    print({
      fecha: day,
      destacado: highlight,
      habitos: habits.map((h) => ({ nombre: h.name, hecho: done.has(h.id) })),
      tareas_abiertas: tasks.length,
      tareas_vencidas: tasks.filter((t) => t.due_date && t.due_date < day).map((t) => t.title),
      mes: {
        gastos: sum(txs.filter((t) => t.type === 'gasto')),
        ingresos: sum(txs.filter((t) => t.type === 'ingreso')),
        presupuesto: budgets.reduce((a, b) => a + Number(b.monthly_limit), 0),
      },
    });
  },
};

if (!cmd || !(cmd in commands) || cmd === 'movimiento') {
  die(`comando desconocido: ${cmd ?? '(ninguno)'}. Comandos: ${Object.keys(commands).filter((c) => c !== 'movimiento').join(', ')}`);
}

await commands[cmd]();
await sb.auth.signOut();
