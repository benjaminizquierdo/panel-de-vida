// Tipos de tarea de la ficha de cada tarea (al estilo de los «work items» de DevOps) y cálculos
// de su tiempo. Sin React, para poder probarlo (tests/tasks.test.ts). Añadir un tipo = añadir
// una entrada a TASK_KINDS (la base de datos solo exige que el id tenga forma de identificador).

import type { Task } from './types';

export interface TaskKind {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export const TASK_KINDS: TaskKind[] = [
  { id: 'tarea', name: 'Tarea', icon: '✅', color: '#2563eb' },
  { id: 'error', name: 'Error', icon: '🐞', color: '#dc2626' },
  { id: 'mejora', name: 'Mejora', icon: '✨', color: '#7c3aed' },
  { id: 'investigacion', name: 'Investigación', icon: '🔎', color: '#0891b2' },
  { id: 'diseno', name: 'Diseño', icon: '🎨', color: '#db2777' },
  { id: 'documentacion', name: 'Documentación', icon: '📝', color: '#d97706' },
  { id: 'reunion', name: 'Reunión', icon: '👥', color: '#16a34a' },
];

/** Tipo de una tarea; uno desconocido (o el de las tareas de antes) es «Tarea». */
export const taskKind = (id: string | undefined) => TASK_KINDS.find((k) => k.id === id) ?? TASK_KINDS[0];

/** Horas guardadas como número (Postgres devuelve `numeric` como texto) o null. */
export const hours = (v: number | string | null | undefined) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Tiempo de una tarea: estimado, dedicado, restante y si se ha pasado. */
export function taskTime(task: Pick<Task, 'estimate_hours' | 'spent_hours'>) {
  const estimate = hours(task.estimate_hours);
  const spent = hours(task.spent_hours) ?? 0;
  const remaining = estimate === null ? null : Math.round(Math.max(0, estimate - spent) * 100) / 100;
  return { estimate, spent, remaining, over: estimate !== null && spent > estimate, ratio: estimate ? Math.min(1, spent / estimate) : 0 };
}

/** «1,5 h», «45 min»: formato corto para las tarjetas. */
export function fmtHours(h: number) {
  if (h > 0 && h < 1) return `${Math.round(h * 60)} min`;
  return `${(Math.round(h * 100) / 100).toLocaleString('es-ES')} h`;
}

/** Suma de horas estimadas y dedicadas de un grupo de tareas (p. ej. una columna del kanban). */
export function sumTime(tasks: Pick<Task, 'estimate_hours' | 'spent_hours'>[]) {
  let estimate = 0;
  let spent = 0;
  for (const t of tasks) {
    estimate += hours(t.estimate_hours) ?? 0;
    spent += hours(t.spent_hours) ?? 0;
  }
  return { estimate: Math.round(estimate * 100) / 100, spent: Math.round(spent * 100) / 100 };
}
