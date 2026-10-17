// Herramientas del asistente. Todas usan el cliente de Supabase con la sesión del
// usuario, así que Row Level Security limita cada lectura y escritura a sus datos.
// El asistente puede añadir y modificar, nunca borrar.

import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';

// Mantener sincronizado con src/lib/defaults.ts.
export const EXPENSE_CATEGORIES = ['Vivienda', 'Comida', 'Transporte', 'Ocio', 'Salud', 'Suscripciones', 'Ropa', 'Otros'];
export const INCOME_CATEGORIES = ['Nómina', 'Freelance', 'Regalos', 'Otros ingresos'];

export interface ToolContext {
  db: SupabaseClient;
  userId: string;
  today: string;
  /** Frases en lenguaje natural de lo que se ha guardado, para mostrarlas en la app. */
  actions: string[];
}

type Input = Record<string, unknown>;

// ---------------------------------------------------------------- Esquemas
// strict: true exige que todas las propiedades sean obligatorias. Los textos y
// fechas opcionales usan la cadena vacía como «sin valor»; solo números,
// booleanos y enums son «valor o null». La API admite como mucho 16 parámetros
// de tipo unión entre todas las herramientas strict (tests/assistant.test.ts lo vigila).

type Schema = Record<string, unknown>;
const str = (description: string): Schema => ({ type: 'string', description });
const num = (description: string): Schema => ({ type: 'number', description });
const int = (description: string): Schema => ({ type: 'integer', description });
const bool = (description: string): Schema => ({ type: 'boolean', description });
const oneOf = (values: string[], description: string): Schema => ({ type: 'string', enum: values, description });
const date = (description: string) => str(`${description}. Formato AAAA-MM-DD.`);
const optText = (description: string) => str(`${description}; cadena vacía si no aplica`);
const optDate = (description: string) => str(`${description}. Formato AAAA-MM-DD, o cadena vacía si no aplica.`);
const nullable = (schema: Schema): Schema => ({ anyOf: [schema, { type: 'null' }] });
const object = (properties: Record<string, Schema>): Anthropic.Beta.BetaTool.InputSchema => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const QUERYABLE = {
  movimientos: { table: 'transactions', columns: 'date, type, amount, category, note', dateColumn: 'date' },
  habitos_cumplidos: { table: 'habit_logs', columns: 'habit_id, date', dateColumn: 'date' },
  salud: { table: 'health_logs', columns: 'date, sleep_hours, energy, exercise_minutes, weight, notes', dateColumn: 'date' },
  tareas: { table: 'tasks', columns: 'id, title, status, priority, due_date, project_id', dateColumn: 'due_date' },
  proyectos: { table: 'projects', columns: 'id, name, description, status', dateColumn: null },
  objetivos: { table: 'goals', columns: 'id, title, horizon, area, current, target, unit, due_date', dateColumn: null },
  presupuestos: { table: 'budgets', columns: 'category, monthly_limit', dateColumn: null },
  destacados: { table: 'highlights', columns: 'date, text, done', dateColumn: 'date' },
  revisiones: { table: 'reviews', columns: 'week_start, wins, challenges, lessons, next_focus', dateColumn: 'week_start' },
} as const;

type QueryableName = keyof typeof QUERYABLE;

export const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'registrar_movimiento',
    description: 'Registra un gasto o un ingreso en euros. Úsalo cada vez que el usuario mencione dinero que ha gastado o recibido.',
    strict: true,
    input_schema: object({
      tipo: oneOf(['gasto', 'ingreso'], 'Gasto o ingreso'),
      importe: num('Importe en euros, mayor que 0'),
      categoria: oneOf([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES], 'Categoría: de gasto para gastos, de ingreso para ingresos'),
      nota: str('Descripción breve (p. ej. «cena con amigos»); cadena vacía si no hay'),
      fecha: date('Día del movimiento'),
    }),
  },
  {
    name: 'marcar_habito',
    description: 'Marca un hábito como cumplido un día concreto. El id debe salir del contexto.',
    strict: true,
    input_schema: object({
      habito_id: str('id del hábito'),
      fecha: date('Día en que se cumplió'),
    }),
  },
  {
    name: 'registrar_salud',
    description:
      'Guarda datos de salud de un día. Solo cambia los campos que no son null. Los minutos de ejercicio se SUMAN a los ya registrados ese día; sueño, energía y peso se sobrescriben; la nota se añade a las anteriores.',
    strict: true,
    input_schema: object({
      fecha: date('Día del registro'),
      horas_sueno: nullable(num('Horas dormidas (0-24)')),
      energia: nullable(int('Nivel de energía de 1 (agotado) a 5 (a tope)')),
      minutos_ejercicio_sumar: nullable(int('Minutos de ejercicio que añadir a los del día')),
      peso: nullable(num('Peso en kg')),
      nota: optText('Nota breve sobre cómo se ha sentido'),
    }),
  },
  {
    name: 'crear_tarea',
    description: 'Crea una tarea pendiente, opcionalmente dentro de un proyecto del contexto.',
    strict: true,
    input_schema: object({
      titulo: str('Título de la tarea'),
      proyecto_id: optText('id del proyecto (vacío si es una tarea suelta)'),
      prioridad: oneOf(['alta', 'media', 'baja'], 'Prioridad; media si no se indica'),
      fecha_limite: optDate('Fecha límite'),
    }),
  },
  {
    name: 'actualizar_tarea',
    description:
      'Cambia una tarea existente: estado (p. ej. marcarla como hecha), prioridad, fecha límite o título. Solo cambia los campos que no son null ni vacíos.',
    strict: true,
    input_schema: object({
      tarea_id: str('id de la tarea'),
      estado: nullable(oneOf(['pendiente', 'en_curso', 'hecha'], 'Nuevo estado')),
      prioridad: nullable(oneOf(['alta', 'media', 'baja'], 'Nueva prioridad')),
      fecha_limite: optDate('Nueva fecha límite'),
      titulo: optText('Nuevo título'),
    }),
  },
  {
    name: 'crear_proyecto',
    description: 'Crea un proyecto nuevo (activo).',
    strict: true,
    input_schema: object({
      nombre: str('Nombre del proyecto'),
      descripcion: str('Descripción breve; cadena vacía si no hay'),
    }),
  },
  {
    name: 'crear_objetivo',
    description: 'Crea un objetivo medible con una meta numérica.',
    strict: true,
    input_schema: object({
      titulo: str('Qué se quiere conseguir'),
      horizonte: oneOf(['anual', 'trimestral'], 'Plazo del objetivo'),
      area: oneOf(['proyectos', 'salud', 'finanzas', 'personal'], 'Área de vida'),
      meta: num('Valor numérico que hay que alcanzar, mayor que 0'),
      unidad: str('Unidad de la meta (km, €, libros…); cadena vacía si no tiene'),
      fecha_limite: optDate('Fecha límite'),
    }),
  },
  {
    name: 'actualizar_objetivo',
    description: 'Actualiza el progreso de un objetivo: fija el valor actual o suma una cantidad. Usa uno de los dos y deja el otro en null.',
    strict: true,
    input_schema: object({
      objetivo_id: str('id del objetivo'),
      valor_actual: nullable(num('Nuevo valor total de progreso')),
      sumar: nullable(num('Cantidad que añadir al progreso actual')),
    }),
  },
  {
    name: 'fijar_destacado',
    description: 'Fija «lo más importante del día» o lo marca como hecho. Solo cambia los campos que no son null ni vacíos.',
    strict: true,
    input_schema: object({
      fecha: date('Día'),
      texto: optText('La tarea más importante del día'),
      hecho: nullable(bool('Si ya está hecha')),
    }),
  },
  {
    name: 'consultar',
    description:
      'Lee datos del usuario que no estén en el contexto: movimientos de un periodo (incluye totales por categoría), historial de hábitos o de salud, tareas, proyectos, objetivos, presupuestos, destacados o revisiones semanales. Úsalo para cualquier cifra antes de responder en vez de suponerla.',
    strict: true,
    input_schema: object({
      tabla: oneOf(Object.keys(QUERYABLE), 'Qué datos leer'),
      desde: optDate('Primer día del periodo (incluido)'),
      hasta: optDate('Último día del periodo (incluido)'),
    }),
  },
];

// ---------------------------------------------------------------- Utilidades

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isDate = (v: unknown): v is string => typeof v === 'string' && DATE_RE.test(v) && !Number.isNaN(Date.parse(v));

const eurFormat = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const eur = (n: number) => eurFormat.format(n);

const dayLabel = (d: string, today: string) => {
  if (d === today) return 'hoy';
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
};

const text = (v: unknown, field: string) => {
  if (typeof v !== 'string' || !v.trim()) throw new Error(`Falta «${field}»`);
  return v.trim();
};

/** Fecha opcional: null, undefined o cadena vacía significan «sin fecha». */
const optionalDate = (v: unknown, field: string) => {
  if (v === null || v === undefined || v === '') return null;
  if (!isDate(v)) throw new Error(`«${field}» debe tener formato AAAA-MM-DD`);
  return v;
};

const positive = (v: unknown, field: string) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) throw new Error(`«${field}» debe ser un número mayor que 0`);
  return v;
};

/** Lanza el error de Supabase con un mensaje legible; devuelve los datos si no hay error. */
const check = <T>({ data, error }: { data: T; error: { message: string } | null }): T => {
  if (error) throw new Error(error.message);
  return data;
};

/** Como check(), para un insert(...).select('id').single(): devuelve el id de la fila creada. */
const createdId = (res: { data: { id: string } | null; error: { message: string } | null }) => {
  const row = check(res);
  if (!row) throw new Error('No se ha podido guardar');
  return row.id;
};

const findOwn = async (ctx: ToolContext, table: string, id: unknown, columns: string, what: string) => {
  const row = check(await ctx.db.from(table).select(columns).eq('id', text(id, `${what}_id`)).maybeSingle());
  if (!row) throw new Error(`No existe ese ${what}. Usa un id del contexto o de «consultar».`);
  return row as unknown as Record<string, unknown>;
};

// ---------------------------------------------------------------- Ejecución

const handlers: Record<string, (input: Input, ctx: ToolContext) => Promise<unknown>> = {
  async registrar_movimiento(input, ctx) {
    const type = input.tipo === 'ingreso' ? 'ingreso' : 'gasto';
    const allowed = type === 'gasto' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
    const category = allowed.includes(input.categoria as string) ? (input.categoria as string) : allowed[allowed.length - 1];
    const amount = Math.round(positive(input.importe, 'importe') * 100) / 100;
    const day = optionalDate(input.fecha, 'fecha') ?? ctx.today;
    const note = typeof input.nota === 'string' ? input.nota.trim() : '';
    check(await ctx.db.from('transactions').insert({ type, amount, category, note, date: day }));
    ctx.actions.push(`${type === 'gasto' ? 'Gasto' : 'Ingreso'} de ${eur(amount)} en ${category}${note ? ` (${note})` : ''} · ${dayLabel(day, ctx.today)}`);
    return { guardado: true, tipo: type, importe: amount, categoria: category, fecha: day };
  },

  async marcar_habito(input, ctx) {
    const habit = await findOwn(ctx, 'habits', input.habito_id, 'id, name', 'hábito');
    const day = optionalDate(input.fecha, 'fecha') ?? ctx.today;
    check(
      await ctx.db
        .from('habit_logs')
        .upsert({ user_id: ctx.userId, habit_id: habit.id, date: day }, { onConflict: 'habit_id,date', ignoreDuplicates: true }),
    );
    ctx.actions.push(`Hábito «${habit.name}» cumplido · ${dayLabel(day, ctx.today)}`);
    return { guardado: true, habito: habit.name, fecha: day };
  },

  async registrar_salud(input, ctx) {
    const day = optionalDate(input.fecha, 'fecha') ?? ctx.today;
    const existing = check(
      await ctx.db.from('health_logs').select('id, exercise_minutes, notes').eq('date', day).maybeSingle(),
    ) as { id: string; exercise_minutes: number | null; notes: string } | null;

    const patch: Record<string, unknown> = {};
    const changes: string[] = [];
    if (typeof input.horas_sueno === 'number') {
      patch.sleep_hours = input.horas_sueno;
      changes.push(`${input.horas_sueno} h de sueño`);
    }
    if (typeof input.energia === 'number') {
      if (input.energia < 1 || input.energia > 5) throw new Error('La energía va de 1 a 5');
      patch.energy = input.energia;
      changes.push(`energía ${input.energia}/5`);
    }
    if (typeof input.minutos_ejercicio_sumar === 'number' && input.minutos_ejercicio_sumar > 0) {
      patch.exercise_minutes = (existing?.exercise_minutes ?? 0) + input.minutos_ejercicio_sumar;
      changes.push(`+${input.minutos_ejercicio_sumar} min de ejercicio (total ${patch.exercise_minutes})`);
    }
    if (typeof input.peso === 'number') {
      patch.weight = input.peso;
      changes.push(`${input.peso} kg`);
    }
    if (typeof input.nota === 'string' && input.nota.trim()) {
      patch.notes = existing?.notes ? `${existing.notes}; ${input.nota.trim()}` : input.nota.trim();
      changes.push('nota');
    }
    if (changes.length === 0) throw new Error('No hay ningún dato de salud que guardar');

    if (existing) check(await ctx.db.from('health_logs').update(patch).eq('id', existing.id));
    else check(await ctx.db.from('health_logs').insert({ date: day, ...patch }));
    ctx.actions.push(`Salud: ${changes.join(', ')} · ${dayLabel(day, ctx.today)}`);
    return { guardado: true, fecha: day, ...patch };
  },

  async crear_tarea(input, ctx) {
    const title = text(input.titulo, 'titulo');
    let projectName: string | null = null;
    if (input.proyecto_id) projectName = (await findOwn(ctx, 'projects', input.proyecto_id, 'id, name', 'proyecto')).name as string;
    const priority = ['alta', 'media', 'baja'].includes(input.prioridad as string) ? input.prioridad : 'media';
    const id = createdId(
      await ctx.db
        .from('tasks')
        .insert({
          title,
          project_id: input.proyecto_id || null,
          priority,
          status: 'pendiente',
          due_date: optionalDate(input.fecha_limite, 'fecha_limite'),
        })
        .select('id')
        .single(),
    );
    ctx.actions.push(`Tarea creada: «${title}»${projectName ? ` en ${projectName}` : ''}`);
    return { guardado: true, id, titulo: title };
  },

  async actualizar_tarea(input, ctx) {
    const task = await findOwn(ctx, 'tasks', input.tarea_id, 'id, title', 'tarea');
    const patch: Record<string, unknown> = {};
    if (input.estado) patch.status = input.estado;
    if (input.prioridad) patch.priority = input.prioridad;
    if (input.fecha_limite) patch.due_date = optionalDate(input.fecha_limite, 'fecha_limite');
    if (typeof input.titulo === 'string' && input.titulo.trim()) patch.title = input.titulo.trim();
    if (Object.keys(patch).length === 0) throw new Error('No hay nada que cambiar en la tarea');
    check(await ctx.db.from('tasks').update(patch).eq('id', task.id));
    const label = patch.status === 'hecha' ? 'Tarea completada' : 'Tarea actualizada';
    ctx.actions.push(`${label}: «${patch.title ?? task.title}»`);
    return { guardado: true, ...patch };
  },

  async crear_proyecto(input, ctx) {
    const name = text(input.nombre, 'nombre');
    const id = createdId(
      await ctx.db
        .from('projects')
        .insert({ name, description: typeof input.descripcion === 'string' ? input.descripcion.trim() : '' })
        .select('id')
        .single(),
    );
    ctx.actions.push(`Proyecto creado: «${name}»`);
    return { guardado: true, id, nombre: name };
  },

  async crear_objetivo(input, ctx) {
    const title = text(input.titulo, 'titulo');
    const id = createdId(
      await ctx.db
        .from('goals')
        .insert({
          title,
          horizon: input.horizonte === 'anual' ? 'anual' : 'trimestral',
          area: input.area,
          target: positive(input.meta, 'meta'),
          current: 0,
          unit: typeof input.unidad === 'string' ? input.unidad.trim() : '',
          due_date: optionalDate(input.fecha_limite, 'fecha_limite'),
        })
        .select('id')
        .single(),
    );
    ctx.actions.push(`Objetivo creado: «${title}»`);
    return { guardado: true, id, titulo: title };
  },

  async actualizar_objetivo(input, ctx) {
    const goal = await findOwn(ctx, 'goals', input.objetivo_id, 'id, title, current, target, unit', 'objetivo');
    const current = Number(goal.current);
    let next: number;
    if (typeof input.valor_actual === 'number') next = input.valor_actual;
    else if (typeof input.sumar === 'number') next = current + input.sumar;
    else throw new Error('Indica valor_actual o sumar');
    next = Math.max(0, Math.round(next * 100) / 100);
    check(await ctx.db.from('goals').update({ current: next }).eq('id', goal.id));
    ctx.actions.push(`Objetivo «${goal.title}»: ${next} / ${Number(goal.target)} ${goal.unit}`.trim());
    return { guardado: true, objetivo: goal.title, valor_actual: next, meta: Number(goal.target) };
  },

  async fijar_destacado(input, ctx) {
    const day = optionalDate(input.fecha, 'fecha') ?? ctx.today;
    const existing = check(
      await ctx.db.from('highlights').select('id, text').eq('date', day).maybeSingle(),
    ) as { id: string; text: string } | null;
    const patch: Record<string, unknown> = {};
    if (typeof input.texto === 'string' && input.texto.trim()) patch.text = input.texto.trim();
    if (typeof input.hecho === 'boolean') patch.done = input.hecho;
    if (Object.keys(patch).length === 0) throw new Error('Indica el texto o si está hecho');

    if (existing) check(await ctx.db.from('highlights').update(patch).eq('id', existing.id));
    else if (patch.text) check(await ctx.db.from('highlights').insert({ date: day, done: false, ...patch }));
    else throw new Error('Ese día no tiene destacado; indica el texto');

    const label = patch.done === true ? 'Destacado completado' : 'Destacado del día';
    ctx.actions.push(`${label}: «${patch.text ?? existing?.text}» · ${dayLabel(day, ctx.today)}`);
    return { guardado: true, fecha: day, ...patch };
  },

  async consultar(input, ctx) {
    const name = input.tabla as QueryableName;
    const spec = QUERYABLE[name];
    if (!spec) throw new Error(`Tabla desconocida. Opciones: ${Object.keys(QUERYABLE).join(', ')}`);
    const from = optionalDate(input.desde, 'desde');
    const to = optionalDate(input.hasta, 'hasta');

    let query = ctx.db.from(spec.table).select(spec.columns).limit(300);
    if (spec.dateColumn) {
      if (from) query = query.gte(spec.dateColumn, from);
      if (to) query = query.lte(spec.dateColumn, to);
      query = query.order(spec.dateColumn, { ascending: false });
    }
    const rows = (check(await query) ?? []) as unknown as Record<string, unknown>[];

    if (name === 'movimientos') {
      const totals = { ingresos: 0, gastos: 0, gastos_por_categoria: {} as Record<string, number> };
      for (const r of rows) {
        const amount = Number(r.amount);
        if (r.type === 'ingreso') totals.ingresos += amount;
        else {
          totals.gastos += amount;
          const cat = String(r.category);
          totals.gastos_por_categoria[cat] = (totals.gastos_por_categoria[cat] ?? 0) + amount;
        }
      }
      const round = (n: number) => Math.round(n * 100) / 100;
      totals.ingresos = round(totals.ingresos);
      totals.gastos = round(totals.gastos);
      for (const k of Object.keys(totals.gastos_por_categoria)) totals.gastos_por_categoria[k] = round(totals.gastos_por_categoria[k]);
      return { filas: rows, total_filas: rows.length, resumen: totals };
    }

    if (name === 'habitos_cumplidos') {
      const habits = (check(await ctx.db.from('habits').select('id, name')) ?? []) as { id: string; name: string }[];
      const names = new Map(habits.map((h) => [h.id, h.name]));
      return { filas: rows.map((r) => ({ habito: names.get(r.habit_id as string) ?? r.habit_id, fecha: r.date })), total_filas: rows.length };
    }

    return { filas: rows, total_filas: rows.length };
  },
};

/** Ejecuta un tool_use y lo convierte en tool_result; los errores vuelven a Claude como is_error. */
export async function runTool(
  block: Anthropic.Beta.BetaToolUseBlock,
  ctx: ToolContext,
): Promise<Anthropic.Beta.BetaToolResultBlockParam> {
  const handler = handlers[block.name];
  try {
    if (!handler) throw new Error(`Herramienta desconocida: ${block.name}`);
    if (typeof block.input !== 'object' || block.input === null) throw new Error('Parámetros no válidos');
    const result = await handler(block.input as Input, ctx);
    return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) };
  } catch (e) {
    return {
      type: 'tool_result',
      tool_use_id: block.id,
      is_error: true,
      content: e instanceof Error ? e.message : String(e),
    };
  }
}
