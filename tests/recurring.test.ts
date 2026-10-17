// Pruebas del calendario de periódicos (src/lib/recurring.ts). Los casos de nextOccurrence son
// los mismos que prueba tests/schema.test.mjs contra recurring_next_date() en SQL.
// Uso: npm run test:lib

import { describeSchedule, dueDates, firstOnOrAfter, monthlyAmount, nextOccurrence, scheduleFrom } from '../src/lib/recurring.ts';

let failures = 0;
const ok = (cond: unknown, msg: string) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) failures++;
};

const calendar: [string, 'mensual' | 'semanal' | 'anual', number, number, string][] = [
  ['2026-01-31', 'mensual', 31, 1, '2026-02-28'],
  ['2026-02-28', 'mensual', 31, 1, '2026-03-31'],
  ['2028-01-30', 'mensual', 30, 1, '2028-02-29'],
  ['2026-12-15', 'mensual', 15, 1, '2027-01-15'],
  ['2026-10-17', 'semanal', 17, 1, '2026-10-24'],
  ['2028-02-29', 'anual', 29, 2, '2029-02-28'],
  ['2031-02-28', 'anual', 29, 2, '2032-02-29'],
];
for (const [d, f, day, month, expected] of calendar) {
  const got = nextOccurrence(d, f, day, month);
  ok(got === expected, `nextOccurrence(${d}, ${f}, día ${day}) = ${expected}${got !== expected ? ` (da ${got})` : ''}`);
}

const monthly = { frequency: 'mensual' as const, ...scheduleFrom('2026-08-31'), end_date: null };
const due = dueDates(monthly, '2026-12-01');
ok(
  JSON.stringify(due.dates) === JSON.stringify(['2026-08-31', '2026-09-30', '2026-10-31', '2026-11-30']) && due.next === '2026-12-31',
  `un mensual del día 31 cae en el último día de los meses cortos (${due.dates.join(', ')} → ${due.next})`,
);
ok(dueDates({ ...monthly, end_date: '2026-10-15' }, '2026-12-01').dates.length === 2, 'respeta la fecha de fin');
ok(dueDates(monthly, '2026-08-30').dates.length === 0, 'nada pendiente antes de la primera fecha');
ok(firstOnOrAfter(monthly, '2026-11-02') === '2026-11-30' && firstOnOrAfter(monthly, '2026-08-01') === '2026-08-31', 'al reanudar salta a la primera fecha que aún no ha pasado');
ok(Math.abs(monthlyAmount({ amount: 12, frequency: 'semanal' }) - 52) < 1e-9 && monthlyAmount({ amount: 120, frequency: 'anual' }) === 10, 'equivalente mensual de semanales y anuales');
ok(describeSchedule(monthly) === 'Cada mes, el día 31 (o el último)', describeSchedule(monthly));
ok(describeSchedule({ ...monthly, frequency: 'anual', anchor_day: 5, anchor_month: 11 }) === 'Cada año, el 5 de noviembre', 'describe un anual');

console.log(failures ? `\n${failures} comprobación(es) fallida(s)` : '\nTodas las comprobaciones pasan');
Deno.exit(failures ? 1 : 0);
