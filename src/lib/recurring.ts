// Calendario de los movimientos periódicos. Debe dar exactamente las mismas fechas que
// recurring_next_date() en supabase/migrations/005_periodicos.sql (los dos tests usan los mismos casos).

import type { Frequency, RecurringTransaction } from './types';
import { addDays, iso, parseISO } from './utils';

const daysInMonth = (year: number, month0: number) => new Date(year, month0 + 1, 0).getDate();

/** Siguiente fecha tras `date`. Si el mes no tiene el día pedido (31, 29 de febrero…), su último día. */
export function nextOccurrence(date: string, frequency: Frequency, day: number, month: number): string {
  if (frequency === 'semanal') return addDays(date, 7);
  const d = parseISO(date);
  if (frequency === 'mensual') {
    const year = d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear();
    const m = (d.getMonth() + 1) % 12;
    return iso(new Date(year, m, Math.min(day, daysInMonth(year, m))));
  }
  const year = d.getFullYear() + 1;
  return iso(new Date(year, month - 1, Math.min(day, daysInMonth(year, month - 1))));
}

type Schedule = Pick<RecurringTransaction, 'frequency' | 'anchor_day' | 'anchor_month' | 'next_date' | 'end_date'>;

/** Fechas que tocan hasta `until` (incluido) y la próxima fecha pendiente después de ellas. */
export function dueDates(rule: Schedule, until: string): { dates: string[]; next: string } {
  const dates: string[] = [];
  let d = rule.next_date;
  while (d <= until && (!rule.end_date || d <= rule.end_date) && dates.length < 500) {
    dates.push(d);
    d = nextOccurrence(d, rule.frequency, rule.anchor_day, rule.anchor_month);
  }
  return { dates, next: d };
}

/** Primera fecha del calendario igual o posterior a `date` (para reanudar sin crear lo atrasado). */
export function firstOnOrAfter(rule: Schedule, date: string): string {
  let d = rule.next_date;
  for (let guard = 0; d < date && guard < 1000; guard++) d = nextOccurrence(d, rule.frequency, rule.anchor_day, rule.anchor_month);
  return d;
}

/** Día y mes de referencia a partir de la primera (o la próxima) fecha. */
export const scheduleFrom = (date: string) => {
  const d = parseISO(date);
  return { anchor_day: d.getDate(), anchor_month: d.getMonth() + 1, next_date: date };
};

/** Importe equivalente al mes, para sumar gastos e ingresos fijos. */
export const monthlyAmount = (rule: Pick<RecurringTransaction, 'amount' | 'frequency'>) =>
  rule.frequency === 'mensual' ? Number(rule.amount) : rule.frequency === 'semanal' ? (Number(rule.amount) * 52) / 12 : Number(rule.amount) / 12;

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  semanal: 'Cada semana',
  mensual: 'Cada mes',
  anual: 'Cada año',
};

/** «Cada mes, el día 5», «Cada semana, los lunes», «Cada año, el 5 de noviembre». */
export function describeSchedule(rule: Schedule): string {
  if (rule.frequency === 'semanal') {
    return `Cada semana, los ${parseISO(rule.next_date).toLocaleDateString('es-ES', { weekday: 'long' })}`;
  }
  if (rule.frequency === 'mensual') {
    return rule.anchor_day >= 29 ? `Cada mes, el día ${rule.anchor_day} (o el último)` : `Cada mes, el día ${rule.anchor_day}`;
  }
  const sample = new Date(2001, rule.anchor_month - 1, Math.min(rule.anchor_day, daysInMonth(2001, rule.anchor_month - 1)));
  return `Cada año, el ${rule.anchor_day} de ${sample.toLocaleDateString('es-ES', { month: 'long' })}`;
}
