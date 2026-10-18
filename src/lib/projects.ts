// Cálculos de los proyectos: progreso, semáforo, siguiente paso, foco de hoy, rachas de los
// retos y series de los gráficos. Funciones puras para poder probarlas: tests/projects.test.ts.

import { chainStats } from './insights';
import { fieldNumber, fieldText, kindOf, phaseOf, type ProjectKind } from './projectKinds';
import type { Priority, Project, ProjectItem, ProjectLog, Task, Transaction } from './types';
import { addDays, fmtDate, iso, num, pct, weekStart } from './utils';

/** Lo que tiene un proyecto. */
export interface ProjectData {
  tasks: Task[];
  items: ProjectItem[];
  logs: ProjectLog[];
}

/** Agrupa tareas, elementos y registros por proyecto. */
export function dataByProject(tasks: Task[], items: ProjectItem[], logs: ProjectLog[]): Map<string, ProjectData> {
  const out = new Map<string, ProjectData>();
  const of = (id: string) => {
    let d = out.get(id);
    if (!d) out.set(id, (d = { tasks: [], items: [], logs: [] }));
    return d;
  };
  for (const t of tasks) if (t.project_id) of(t.project_id).tasks.push(t);
  for (const i of items) of(i.project_id).items.push(i);
  for (const l of logs) of(l.project_id).logs.push(l);
  return out;
}

export const EMPTY_DATA: ProjectData = { tasks: [], items: [], logs: [] };

/** Día local ('YYYY-MM-DD') de una marca de tiempo de la base de datos. */
export const dayOf = (timestamp: string | null | undefined) => (timestamp ? iso(new Date(timestamp)) : null);

// ---------------------------------------------------------------- Tareas y foco

const PRIORITY_RANK: Record<Priority, number> = { alta: 0, media: 1, baja: 2 };

/**
 * Orden de prioridad: vencidas, luego las de hoy, luego por prioridad, por fecha más cercana
 * (sin fecha al final), las que ya están en curso antes y, a igualdad, las más antiguas.
 */
export function compareTasks(day: string) {
  const urgency = (t: Task) => (t.due_date && t.due_date < day ? 0 : t.due_date === day ? 1 : 2);
  return (a: Task, b: Task) =>
    urgency(a) - urgency(b) ||
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
    (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') ||
    Number(b.status === 'en_curso') - Number(a.status === 'en_curso') ||
    (a.created_at ?? '').localeCompare(b.created_at ?? '');
}

/** Tareas abiertas de todos los proyectos activos (y las sueltas), de la más prioritaria a la menos. */
export function focusTasks(tasks: Task[], projects: Project[], day: string): Task[] {
  const active = new Set(projects.filter((p) => p.status === 'activo').map((p) => p.id));
  return tasks.filter((t) => t.status !== 'hecha' && (!t.project_id || active.has(t.project_id))).sort(compareTasks(day));
}

export const isOverdue = (t: Task, day: string) => t.status !== 'hecha' && !!t.due_date && t.due_date < day;

// ---------------------------------------------------------------- Retos

export interface StreakStats {
  /** Racha actual y mejor racha, en días (cada día) o semanas cumplidas (X veces por semana). */
  current: number;
  best: number;
  unit: 'día' | 'semana';
  /** Lo hecho en el periodo actual (hoy: 0 o 1; esta semana: veces) frente a lo que toca. */
  done: number;
  target: number;
  doneToday: boolean;
  /** Constancia de las últimas 4 semanas (0-1). */
  adherence: number;
  total: number;
}

/** Racha de un reto a partir de los días marcados. */
export function streakStats(project: Pick<Project, 'fields' | 'created_at'>, dates: Set<string>, day: string): StreakStats {
  const weekly = fieldText(project, 'frecuencia') === 'semanal';
  const target = weekly ? Math.min(7, Math.max(1, Math.round(fieldNumber(project, 'veces') ?? 3))) : 1;
  const start = dayOf(project.created_at) ?? day;
  const total = [...dates].filter((d) => d <= day).length;
  const doneToday = dates.has(day);

  if (!weekly) {
    const { current, best } = chainStats(dates, day);
    // Constancia de los últimos 28 días (o desde que empezó el reto, o desde el primer día marcado si es anterior).
    const earliest = [start, ...[...dates].sort().slice(0, 1)].sort()[0];
    const firstDay = earliest > addDays(day, -27) ? earliest : addDays(day, -27);
    let days = 0;
    let hits = 0;
    for (let d = firstDay; d <= day; d = addDays(d, 1)) {
      // Hoy solo cuenta si ya está hecho: el día aún no ha terminado.
      if (d === day && !doneToday) continue;
      days++;
      if (dates.has(d)) hits++;
    }
    return { current, best, unit: 'día', done: doneToday ? 1 : 0, target, doneToday, adherence: days ? hits / days : 0, total };
  }

  const countIn = (monday: string) => {
    let n = 0;
    for (let i = 0; i < 7; i++) if (dates.has(addDays(monday, i))) n++;
    return n;
  };
  const thisWeek = weekStart(day);
  const done = countIn(thisWeek);
  // Racha actual: semanas seguidas cumplidas, contando esta solo si ya está cumplida.
  let current = 0;
  for (let w = done >= target ? thisWeek : addDays(thisWeek, -7); countIn(w) >= target; w = addDays(w, -7)) current++;
  // Mejor racha: desde la primera semana con algo marcado.
  const first = [...dates].sort()[0];
  let best = 0;
  let run = 0;
  if (first) {
    for (let w = weekStart(first); w <= thisWeek; w = addDays(w, 7)) {
      run = countIn(w) >= target ? run + 1 : w === thisWeek ? run : 0;
      best = Math.max(best, run);
    }
  }
  // Constancia: las 4 semanas completas anteriores (desde que existe el reto), y esta si ya se ha cumplido.
  const weeks: string[] = [];
  for (let i = 4; i >= 1; i--) {
    const w = addDays(thisWeek, -7 * i);
    if (addDays(w, 6) >= start) weeks.push(w);
  }
  if (done >= target || weeks.length === 0) weeks.push(thisWeek);
  const adherence = weeks.reduce((a, w) => a + Math.min(1, countIn(w) / target), 0) / weeks.length;
  return { current, best, unit: 'semana', done, target, doneToday, adherence, total };
}

// ---------------------------------------------------------------- Valores medidos

/** Registros de valor en orden (los del mismo día, en el orden en que se apuntaron). */
export const valueLogs = (logs: ProjectLog[]) =>
  logs.filter((l) => l.kind === 'valor').sort((a, b) => a.date.localeCompare(b.date) || (a.created_at ?? '').localeCompare(b.created_at ?? ''));

/** Avance de un objetivo medible: de dónde se parte, dónde se está y cuánto falta. */
export function valueProgress(project: Pick<Project, 'fields'>, logs: ProjectLog[]) {
  const values = valueLogs(logs);
  const initial = fieldNumber(project, 'inicial') ?? (values[0] ? Number(values[0].value) : null);
  const target = fieldNumber(project, 'objetivo');
  const current = values.length ? Number(values.at(-1)!.value) : initial;
  if (target === null || initial === null || current === null) return { initial, current, target, left: null, ratio: 0 };
  const span = target - initial;
  const ratio = span === 0 ? (current === target ? 1 : 0) : Math.min(1, Math.max(0, (current - initial) / span));
  // Lo que falta, en la dirección del objetivo (0 si ya se ha llegado o pasado).
  const left = span >= 0 ? Math.max(0, target - current) : Math.max(0, current - target);
  return { initial, current, target, left, ratio };
}

// ---------------------------------------------------------------- Temario y recursos

/** Parte hecha (0-1) de un módulo: por sus temas, o por su propio estado si no tiene temas. */
export function moduleRatio(module: ProjectItem, items: ProjectItem[]) {
  const topics = items.filter((i) => i.kind === 'tema' && i.parent_id === module.id);
  if (topics.length === 0) return module.status === 'hecho' ? 1 : module.status === 'en_curso' ? 0.5 : 0;
  return topics.filter((t) => t.status === 'hecho').length / topics.length;
}

export const byOrder = <T extends { sort_order: number; created_at?: string }>(a: T, b: T) =>
  a.sort_order - b.sort_order || (a.created_at ?? '').localeCompare(b.created_at ?? '');

// ---------------------------------------------------------------- Progreso

export interface ProgressInfo {
  /** 0-100 */
  value: number;
  label: string;
}

export function progressOf(project: Project, data: ProjectData, day: string): ProgressInfo {
  const kind = kindOf(project);
  switch (kind.progress) {
    case 'modules': {
      const modules = data.items.filter((i) => i.kind === 'modulo');
      if (modules.length === 0) return { value: 0, label: 'Sin temario todavía' };
      const topics = data.items.filter((i) => i.kind === 'tema');
      const ratio = modules.reduce((a, m) => a + moduleRatio(m, data.items), 0) / modules.length;
      const label = topics.length
        ? `${topics.filter((t) => t.status === 'hecho').length}/${topics.length} temas`
        : `${modules.filter((m) => m.status === 'hecho').length}/${modules.length} módulos`;
      return { value: Math.round(ratio * 100), label };
    }
    case 'resources': {
      const res = data.items.filter((i) => i.kind === 'recurso');
      if (res.length === 0) return { value: 0, label: 'Sin recursos todavía' };
      const done = res.filter((r) => r.status === 'hecho').length;
      return { value: pct(done, res.length), label: `${done}/${res.length} terminados` };
    }
    case 'phases': {
      const ph = phaseOf(project);
      if (!ph) return { value: 0, label: '' };
      return { value: Math.round((ph.index / Math.max(1, ph.phases.length - 1)) * 100), label: ph.phase.label };
    }
    case 'value': {
      const v = valueProgress(project, data.logs);
      const unit = fieldText(project, 'unidad');
      if (v.target === null) return { value: 0, label: 'Ponle un objetivo' };
      if (v.current === null) return { value: 0, label: `Objetivo: ${num(v.target)} ${unit}`.trim() };
      return { value: Math.round(v.ratio * 100), label: `${num(v.current)} de ${num(v.target)} ${unit}`.trim() };
    }
    case 'streak': {
      const s = streakStats(project, new Set(data.logs.filter((l) => l.kind === 'check').map((l) => l.date)), day);
      return { value: Math.round(s.adherence * 100), label: `🔥 ${s.current} ${s.unit}${s.current === 1 ? '' : 's'}` };
    }
    case 'tasks':
    default: {
      if (data.tasks.length === 0) return { value: 0, label: 'Sin tareas' };
      const done = data.tasks.filter((t) => t.status === 'hecha').length;
      return { value: pct(done, data.tasks.length), label: `${done}/${data.tasks.length} tareas` };
    }
  }
}

// ---------------------------------------------------------------- Semáforo

export type HealthLevel = 'verde' | 'amarillo' | 'rojo' | 'gris';

export const HEALTH_LABEL: Record<HealthLevel, string> = { verde: 'Al día', amarillo: 'Necesita atención', rojo: 'Con retraso', gris: 'Sin seguimiento' };

/** Días sin actividad para que el semáforo se ponga amarillo. */
export const STALE_DAYS = 7;

/** Última actividad: la que guarda la base de datos o lo último que se ve en sus datos, lo más reciente. */
export function lastActivity(project: Project, data: ProjectData): string | null {
  const stamps = [
    project.last_activity_at,
    project.created_at,
    ...data.tasks.flatMap((t) => [t.created_at, t.completed_at]),
    ...data.items.map((i) => i.created_at),
    ...data.logs.map((l) => l.created_at),
  ].filter((s): s is string => !!s);
  return stamps.length ? stamps.reduce((a, b) => (new Date(a) > new Date(b) ? a : b)) : null;
}

/**
 * Rojo: tareas vencidas. Amarillo: sin tareas pendientes (en los tipos que se llevan con tareas)
 * o sin actividad en 7 días. Verde: al día. Gris: pausado o terminado.
 */
export function healthOf(project: Project, data: ProjectData, day: string, now = Date.now()): { level: HealthLevel; reason: string } {
  if (project.status === 'pausado') return { level: 'gris', reason: 'Pausado' };
  if (project.status === 'completado') return { level: 'gris', reason: 'Terminado' };
  const kind = kindOf(project);
  const overdue = data.tasks.filter((t) => isOverdue(t, day)).length;
  if (overdue > 0) return { level: 'rojo', reason: overdue === 1 ? '1 tarea vencida' : `${overdue} tareas vencidas` };
  if (kind.usesTasks && !data.tasks.some((t) => t.status !== 'hecha')) return { level: 'amarillo', reason: 'Sin tareas pendientes' };
  const last = lastActivity(project, data);
  const idle = last ? Math.floor((now - new Date(last).getTime()) / 86_400_000) : 0;
  if (idle >= STALE_DAYS) return { level: 'amarillo', reason: `Sin actividad en ${idle} días` };
  return { level: 'verde', reason: 'Al día' };
}

// ---------------------------------------------------------------- Siguiente paso

/** Lo siguiente que toca hacer en el proyecto, en una frase. */
export function nextStep(project: Project, data: ProjectData, day: string): string | null {
  const kind: ProjectKind = kindOf(project);
  const open = data.tasks.filter((t) => t.status !== 'hecha').sort(compareTasks(day));
  if (open[0]) return `${open[0].title}${open[0].due_date ? ` · ${open[0].due_date < day ? 'venció el ' : ''}${fmtDate(open[0].due_date)}` : ''}`;

  switch (kind.progress) {
    case 'modules': {
      const modules = data.items.filter((i) => i.kind === 'modulo').sort(byOrder);
      for (const m of modules) {
        const topic = data.items.filter((i) => i.kind === 'tema' && i.parent_id === m.id && i.status !== 'hecho').sort(byOrder)[0];
        if (topic) return `Siguiente tema: ${topic.title}`;
        if (moduleRatio(m, data.items) < 1) return `Siguiente módulo: ${m.title}`;
      }
      return modules.length ? '¡Temario completado!' : 'Añade los módulos del temario';
    }
    case 'resources': {
      const res = data.items.filter((i) => i.kind === 'recurso').sort(byOrder);
      const now = res.find((r) => r.status === 'en_curso') ?? res.find((r) => r.status === 'pendiente');
      return now ? `${now.status === 'en_curso' ? 'Ahora' : 'Siguiente'}: ${now.title}` : res.length ? '¡Todo terminado!' : 'Añade tu primer recurso';
    }
    case 'streak': {
      const s = streakStats(project, new Set(data.logs.filter((l) => l.kind === 'check').map((l) => l.date)), day);
      if (s.unit === 'semana') return s.done >= s.target ? `Semana cumplida (${s.done}/${s.target})` : `Esta semana: ${s.done}/${s.target}`;
      return s.doneToday ? 'Hoy ya está ✓' : 'Márcalo hoy para no romper la racha';
    }
    case 'value': {
      const v = valueProgress(project, data.logs);
      const unit = fieldText(project, 'unidad');
      if (!valueLogs(data.logs).length) return 'Registra tu primer valor';
      if (v.left === null) return null;
      return v.left === 0 ? '¡Objetivo conseguido! 🎉' : `Faltan ${num(v.left)} ${unit}`.trim();
    }
    case 'phases': {
      const ph = phaseOf(project);
      const next = ph?.phases[ph.index + 1];
      return next ? `Siguiente fase: ${next.label}` : ph ? '¡Publicado! 🎉' : null;
    }
    default:
      return data.tasks.length ? '¡Todas las tareas hechas!' : 'Añade la primera tarea';
  }
}

// ---------------------------------------------------------------- Series para los gráficos

/** Lunes de las últimas `weeks` semanas, terminando en la de `day`. */
export const lastWeeks = (weeks: number, day: string) => Array.from({ length: weeks }, (_, i) => addDays(weekStart(day), (i - (weeks - 1)) * 7));

/** Suma por semana de unos valores con fecha. */
export function weeklySum(entries: { date: string; value: number }[], weeks: number, day: string) {
  const mondays = lastWeeks(weeks, day);
  const totals = new Map(mondays.map((m) => [m, 0]));
  for (const e of entries) {
    const w = weekStart(e.date);
    if (totals.has(w) && e.date <= day) totals.set(w, totals.get(w)! + Number(e.value));
  }
  return mondays.map((week) => ({ week, value: Math.round(totals.get(week)! * 100) / 100 }));
}

/** Tareas completadas cada semana. */
export const tasksDonePerWeek = (tasks: Task[], weeks: number, day: string) =>
  weeklySum(
    tasks.flatMap((t) => (t.status === 'hecha' && dayOf(t.completed_at) ? [{ date: dayOf(t.completed_at)!, value: 1 }] : [])),
    weeks,
    day,
  );

/** Avance del proyecto: tareas creadas y hechas acumuladas al final de cada semana. */
export function burnup(tasks: Task[], weeks: number, day: string) {
  return lastWeeks(weeks, day).map((monday) => {
    const end = addDays(monday, 6) < day ? addDays(monday, 6) : day;
    return {
      week: monday,
      creadas: tasks.filter((t) => (dayOf(t.created_at) ?? '') <= end).length,
      hechas: tasks.filter((t) => t.status === 'hecha' && (dayOf(t.completed_at) ?? '9999') <= end).length,
    };
  });
}

/** Horas registradas en un proyecto. */
export const totalHours = (logs: ProjectLog[]) => Math.round(logs.filter((l) => l.kind === 'horas').reduce((a, l) => a + Number(l.value), 0) * 100) / 100;

/** Presupuesto y gasto de un proyecto (sus movimientos de gasto en Finanzas). */
export function budgetOf(project: Pick<Project, 'id' | 'fields'>, transactions: Transaction[]) {
  const own = transactions.filter((t) => t.project_id === project.id && t.type === 'gasto');
  const spent = Math.round(own.reduce((a, t) => a + Number(t.amount), 0) * 100) / 100;
  const budget = fieldNumber(project, 'presupuesto');
  return { own, spent, budget, left: budget === null ? null : Math.round((budget - spent) * 100) / 100 };
}
