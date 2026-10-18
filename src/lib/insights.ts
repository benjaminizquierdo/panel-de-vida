// Cálculos de los bloques que cruzan datos (hábitos, salud, tareas, finanzas). Funciones puras
// para poder probarlas: tests/insights.test.ts.

import { dueDates, monthlyAmount } from './recurring';
import type { Habit, HabitLog, HealthLog, Highlight, RecurringTransaction, Task, Transaction } from './types';
import { addDays, lastDays, monthKey, parseISO, weekStart } from './utils';

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const variance = (xs: number[]) => {
  const m = mean(xs);
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1);
};

export const daysInMonth = (key: string) => {
  const d = parseISO(`${key}-01`);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
};

// ---------------------------------------------------------------- Hábitos por día

/** Parte de los hábitos (0-1) cumplidos cada día. Sin hábitos, no hay valor. */
export function habitRatios(habits: Habit[], logs: HabitLog[], days: string[]): Map<string, number> {
  const ids = new Set(habits.map((h) => h.id));
  const doneByDay = new Map<string, Set<string>>();
  for (const l of logs) {
    if (!ids.has(l.habit_id)) continue;
    if (!doneByDay.has(l.date)) doneByDay.set(l.date, new Set());
    doneByDay.get(l.date)!.add(l.habit_id);
  }
  const out = new Map<string, number>();
  if (ids.size === 0) return out;
  for (const d of days) out.set(d, (doneByDay.get(d)?.size ?? 0) / ids.size);
  return out;
}

/** Racha actual (hasta hoy, o hasta ayer si hoy aún no está), mejor racha y total de días. */
export function chainStats(dates: Set<string>, end: string) {
  let current = 0;
  for (let d = dates.has(end) ? end : addDays(end, -1); dates.has(d); d = addDays(d, -1)) current++;
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of [...dates].filter((x) => x <= end).sort()) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return { current, best, total: [...dates].filter((x) => x <= end).length };
}

/** Columnas de semanas (de lunes a domingo) que terminan en la semana de `end`: para los mapas de constancia. */
export function weekColumns(end: string, weeks: number): string[][] {
  const lastMonday = weekStart(end);
  return Array.from({ length: weeks }, (_, w) => {
    const monday = addDays(lastMonday, (w - (weeks - 1)) * 7);
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  });
}

/** Cuadrícula de un mes (semanas de lunes a domingo); null en los huecos de antes del 1 y después del último. */
export function monthGrid(key: string): (string | null)[][] {
  const first = `${key}-01`;
  const lead = (parseISO(first).getDay() + 6) % 7;
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth(key) }, (_, i) => addDays(first, i))];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

// ---------------------------------------------------------------- Correlaciones

export interface Insight {
  habit: Habit;
  metric: 'sueño' | 'energía' | 'gasto';
  /** Media los días que se cumple el hábito y los que no. */
  withHabit: number;
  without: number;
  daysWith: number;
  daysWithout: number;
  /** Fuerza de la diferencia (d de Cohen): de 0,3 en adelante se considera apreciable. */
  strength: number;
  text: string;
}

const fmt1 = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 1 });
const fmtEur = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

/** Mínimo de días a cada lado para comparar; con menos, la diferencia podría ser casualidad. */
export const MIN_DAYS = 5;

/**
 * Compara, para cada hábito, el sueño, la energía y el gasto variable (sin periódicos) de los días
 * en que se cumple frente a los que no, en los últimos `window` días. Solo devuelve diferencias
 * apreciables con datos suficientes, de la más fuerte a la más débil.
 */
export function correlations(
  { habits, logs, health, transactions }: { habits: Habit[]; logs: HabitLog[]; health: HealthLog[]; transactions: Transaction[] },
  end: string,
  window = 90,
): Insight[] {
  const days = lastDays(window, end);
  const inWindow = new Set(days);
  const healthByDay = new Map(health.filter((h) => inWindow.has(h.date)).map((h) => [h.date, h]));
  const spendByDay = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== 'gasto' || t.source === 'recurrente' || !inWindow.has(t.date)) continue;
    spendByDay.set(t.date, (spendByDay.get(t.date) ?? 0) + Number(t.amount));
  }
  // El gasto solo se compara desde el primer día con algún movimiento (antes no se usaba la app).
  const firstSpend = [...spendByDay.keys()].sort()[0];
  const done = new Map<string, Set<string>>();
  for (const l of logs) {
    if (!inWindow.has(l.date)) continue;
    if (!done.has(l.habit_id)) done.set(l.habit_id, new Set());
    done.get(l.habit_id)!.add(l.date);
  }

  const metrics: { metric: Insight['metric']; value: (d: string) => number | null; min: number }[] = [
    { metric: 'sueño', value: (d) => (healthByDay.get(d)?.sleep_hours == null ? null : Number(healthByDay.get(d)!.sleep_hours)), min: 0.25 },
    { metric: 'energía', value: (d) => (healthByDay.get(d)?.energy == null ? null : Number(healthByDay.get(d)!.energy)), min: 0.3 },
    { metric: 'gasto', value: (d) => (firstSpend && d >= firstSpend && d < end ? (spendByDay.get(d) ?? 0) : null), min: 3 },
  ];

  const out: Insight[] = [];
  for (const habit of habits) {
    const doneDays = done.get(habit.id);
    if (!doneDays?.size) continue;
    // Solo desde que se empezó a marcar el hábito.
    const start = [...doneDays].sort()[0];
    for (const m of metrics) {
      const yes: number[] = [];
      const no: number[] = [];
      for (const d of days) {
        if (d < start) continue;
        const v = m.value(d);
        if (v === null) continue;
        (doneDays.has(d) ? yes : no).push(v);
      }
      if (yes.length < MIN_DAYS || no.length < MIN_DAYS) continue;
      const a = mean(yes);
      const b = mean(no);
      const sd = Math.sqrt((variance(yes) + variance(no)) / 2);
      // Sin ninguna variación pero con diferencia, la separación es total.
      const strength = sd > 0 ? Math.abs(a - b) / sd : a !== b ? 10 : 0;
      if (Math.abs(a - b) < m.min || strength < 0.3) continue;
      if (m.metric === 'gasto' && Math.abs(a - b) / Math.max(a, b) < 0.15) continue;
      const more = a > b;
      const name = `«${habit.name}»`;
      const text =
        m.metric === 'sueño'
          ? `Los días que cumples ${name} duermes ${fmt1(Math.abs(a - b))} h ${more ? 'más' : 'menos'} (${fmt1(a)} h frente a ${fmt1(b)} h).`
          : m.metric === 'energía'
            ? `Los días que cumples ${name} tu energía es ${fmt1(Math.abs(a - b))} ${fmt1(Math.abs(a - b)) === '1' ? 'punto' : 'puntos'} ${more ? 'mayor' : 'menor'} (${fmt1(a)} frente a ${fmt1(b)} sobre 5).`
            : `Los días que cumples ${name} gastas ${fmtEur(Math.abs(a - b))} ${more ? 'más' : 'menos'} (${fmtEur(a)} frente a ${fmtEur(b)} al día).`;
      out.push({ habit, metric: m.metric, withHabit: a, without: b, daysWith: yes.length, daysWithout: no.length, strength, text });
    }
  }
  return out.sort((x, y) => y.strength - x.strength);
}

// ---------------------------------------------------------------- Puntuación del día

export interface ScorePart {
  label: string;
  /** 0-1 */
  value: number;
  weight: number;
  detail: string;
}

/**
 * Nota del día (0-100): media ponderada de hábitos cumplidos (40), lo más importante del día (20),
 * tareas que vencían ese día hechas (20) y gasto variable dentro del presupuesto diario (20).
 * Lo que no aplica ese día (sin hábitos, sin tareas, sin presupuesto) no cuenta.
 */
export function dayScore(
  day: string,
  { habits, logs, highlights, tasks, transactions, monthlyBudget }: {
    habits: Habit[];
    logs: HabitLog[];
    highlights: Highlight[];
    tasks: Task[];
    transactions: Transaction[];
    monthlyBudget: number;
  },
): { score: number | null; parts: ScorePart[] } {
  const parts: ScorePart[] = [];
  const ratio = habitRatios(habits, logs, [day]).get(day);
  if (ratio !== undefined) {
    const done = Math.round(ratio * habits.length);
    parts.push({ label: 'Hábitos', value: ratio, weight: 40, detail: `${done} de ${habits.length}` });
  }
  const h = highlights.find((x) => x.date === day);
  parts.push({ label: 'Lo más importante', value: h?.done ? 1 : 0, weight: 20, detail: !h ? 'sin fijar' : h.done ? 'hecho' : 'pendiente' });
  const due = tasks.filter((t) => t.due_date === day);
  if (due.length) {
    const doneTasks = due.filter((t) => t.status === 'hecha').length;
    parts.push({ label: 'Tareas del día', value: doneTasks / due.length, weight: 20, detail: `${doneTasks} de ${due.length}` });
  }
  if (monthlyBudget > 0) {
    const allowance = monthlyBudget / daysInMonth(monthKey(day));
    const spent = transactions
      .filter((t) => t.type === 'gasto' && t.date === day && t.source !== 'recurrente')
      .reduce((a, t) => a + Number(t.amount), 0);
    const value = spent <= allowance ? 1 : Math.max(0, 1 - (spent - allowance) / allowance);
    parts.push({ label: 'Gasto', value, weight: 20, detail: `${fmtEur(spent)} de ${fmtEur(allowance)} al día` });
  }
  const total = parts.reduce((a, p) => a + p.weight, 0);
  const score = total ? Math.round((parts.reduce((a, p) => a + p.value * p.weight, 0) / total) * 100) : null;
  return { score, parts };
}

// ---------------------------------------------------------------- Finanzas

export interface Charge {
  date: string;
  rule: RecurringTransaction;
}

/** Cargos e ingresos periódicos entre `from` y `until` (incluidos), por fecha. */
export function upcomingCharges(rules: RecurringTransaction[], from: string, until: string): Charge[] {
  const out: Charge[] = [];
  for (const rule of rules) {
    if (!rule.active) continue;
    for (const date of dueDates(rule, until).dates) if (date >= from) out.push({ date, rule });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || Number(b.rule.amount) - Number(a.rule.amount));
}

/** Gastos periódicos activos con su coste al mes y al año, del más caro al más barato. */
export function subscriptions(rules: RecurringTransaction[]) {
  const items = rules
    .filter((r) => r.active && r.type === 'gasto')
    .map((rule) => ({ rule, monthly: monthlyAmount(rule), yearly: monthlyAmount(rule) * 12 }))
    .sort((a, b) => b.monthly - a.monthly);
  return { items, monthly: items.reduce((a, i) => a + i.monthly, 0), yearly: items.reduce((a, i) => a + i.yearly, 0) };
}

/**
 * Previsión del gasto del mes: lo fijo ya cobrado + lo fijo que queda por cobrar + el gasto
 * variable al ritmo que llevas. `matches` limita a una categoría (con sus subcategorías).
 */
export function spendingPace(
  { transactions, rules, day, matches }: { transactions: Transaction[]; rules: RecurringTransaction[]; day: string; matches?: (categoryId: string) => boolean },
) {
  const key = monthKey(day);
  const total = daysInMonth(key);
  const elapsed = parseISO(day).getDate();
  const ok = (id: string) => !matches || matches(id);
  const month = transactions.filter((t) => t.type === 'gasto' && monthKey(t.date) === key && t.date <= day && ok(t.category_id));
  const fixed = month.filter((t) => t.source === 'recurrente').reduce((a, t) => a + Number(t.amount), 0);
  const variable = month.filter((t) => t.source !== 'recurrente').reduce((a, t) => a + Number(t.amount), 0);
  const monthEnd = `${key}-${String(total).padStart(2, '0')}`;
  const pendingFixed = upcomingCharges(rules, addDays(day, 1), monthEnd)
    .filter((c) => c.rule.type === 'gasto' && ok(c.rule.category_id))
    .reduce((a, c) => a + Number(c.rule.amount), 0);
  const projected = fixed + pendingFixed + (variable / elapsed) * total;
  return { spent: fixed + variable, fixed, variable, pendingFixed, projected, elapsed, total };
}

// ---------------------------------------------------------------- Tiempo

/** Días que faltan hasta `date` (negativo si ya pasó). */
export const daysUntil = (date: string, from: string) => Math.round((parseISO(date).getTime() - parseISO(from).getTime()) / 86_400_000);

/** Parte transcurrida (0-1) de la semana, el mes y el año, contando el día de hoy como empezado. */
export function periodProgress(day: string) {
  const d = parseISO(day);
  const year = d.getFullYear();
  const yearDays = (new Date(year + 1, 0, 1).getTime() - new Date(year, 0, 1).getTime()) / 86_400_000;
  const dayOfYear = Math.round((d.getTime() - new Date(year, 0, 1).getTime()) / 86_400_000) + 1;
  return {
    week: ((d.getDay() + 6) % 7) / 7 + 1 / 7,
    month: d.getDate() / daysInMonth(monthKey(day)),
    year: dayOfYear / yearDays,
    dayOfYear,
    yearDays,
  };
}

/** Meses (enteros o empezados) que quedan hasta `due`, como mínimo 1. */
export const monthsLeft = (due: string, from: string) => {
  const a = parseISO(from);
  const b = parseISO(due);
  return Math.max(1, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + (b.getDate() >= a.getDate() ? 0 : -1) + 1);
};
