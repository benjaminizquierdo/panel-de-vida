// Pruebas de los tipos de tarea y su tiempo (src/lib/tasks.ts).
// Uso: npm run test:lib

import { fmtHours, hours, sumTime, TASK_KINDS, taskKind, taskTime } from '../src/lib/tasks.ts';

let failures = 0;
const ok = (cond: unknown, msg: string) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) failures++;
};

ok(new Set(TASK_KINDS.map((k) => k.id)).size === TASK_KINDS.length, 'cada tipo de tarea tiene un id distinto');
ok(TASK_KINDS.every((k) => /^[a-z][a-z0-9_]{0,39}$/.test(k.id)), 'los ids tienen la forma que exige la base de datos');
ok(taskKind(undefined).id === 'tarea' && taskKind('raro').id === 'tarea', 'las tareas de antes (o de un tipo desconocido) son «Tarea»');
ok(taskKind('error').name === 'Error', 'tipo error');

ok(hours('2.50') === 2.5 && hours(null) === null && hours('') === null, 'las horas que llegan como texto se leen como número');
const t1 = taskTime({ estimate_hours: 4, spent_hours: 1.5 });
ok(t1.remaining === 2.5 && !t1.over && t1.ratio === 0.375, `quedan 2,5 h de 4 (${JSON.stringify(t1)})`);
const t2 = taskTime({ estimate_hours: 2, spent_hours: 3 });
ok(t2.over && t2.remaining === 0 && t2.ratio === 1, 'si se pasa de la estimación, no quedan horas y se avisa');
const t3 = taskTime({ estimate_hours: null, spent_hours: null });
ok(t3.estimate === null && t3.spent === 0 && t3.remaining === null, 'sin estimación no hay restante');

ok(fmtHours(0.5) === '30 min' && fmtHours(1.5) === '1,5 h' && fmtHours(8) === '8 h', 'formato corto de horas');
const sum = sumTime([{ estimate_hours: 2, spent_hours: 1 }, { estimate_hours: '1.5' as unknown as number, spent_hours: null }, { estimate_hours: null, spent_hours: 0.25 }]);
ok(sum.estimate === 3.5 && sum.spent === 1.25, `suma de una columna (${JSON.stringify(sum)})`);

console.log(failures ? `\n${failures} comprobación(es) fallida(s)` : '\nTodas las comprobaciones pasan');
Deno.exit(failures ? 1 : 0);
