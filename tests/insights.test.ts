// Pruebas de los cálculos que cruzan datos (src/lib/insights.ts).
// Uso: npm run test:lib

import {
  chainStats,
  correlations,
  daysUntil,
  dayScore,
  habitRatios,
  monthGrid,
  monthsLeft,
  periodProgress,
  spendingPace,
  subscriptions,
  upcomingCharges,
  weekColumns,
} from '../src/lib/insights.ts';
import type { Habit, HabitLog, HealthLog, RecurringTransaction, Transaction } from '../src/lib/types.ts';
import { addDays, lastDays } from '../src/lib/utils.ts';

let failures = 0;
const ok = (cond: unknown, msg: string) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) failures++;
};

const TODAY = '2026-10-18'; // domingo
const habit = (id: string, name: string): Habit => ({ id, name, icon: '✅', active: true });
const log = (habit_id: string, date: string): HabitLog => ({ id: `${habit_id}${date}`, habit_id, date });
const tx = (date: string, amount: number, extra: Partial<Transaction> = {}): Transaction => ({
  id: `${date}${amount}${Math.random()}`,
  date,
  type: 'gasto',
  amount,
  category_id: 'ocio',
  note: '',
  ...extra,
});
const rule = (extra: Partial<RecurringTransaction>): RecurringTransaction => ({
  id: 'r',
  type: 'gasto',
  amount: 10,
  category_id: 'subs',
  note: 'Netflix',
  frequency: 'mensual',
  anchor_day: 25,
  anchor_month: 10,
  next_date: '2026-10-25',
  end_date: null,
  active: true,
  ...extra,
});

// ---------------------------------------------------------------- Hábitos por día y rachas

const gym = habit('gym', 'Gym');
const read = habit('leer', 'Leer');
const ratios = habitRatios([gym, read], [log('gym', TODAY), log('leer', TODAY), log('gym', '2026-10-17')], ['2026-10-16', '2026-10-17', TODAY]);
ok(ratios.get(TODAY) === 1 && ratios.get('2026-10-17') === 0.5 && ratios.get('2026-10-16') === 0, 'parte de hábitos cumplidos cada día');
ok(habitRatios([], [], [TODAY]).size === 0, 'sin hábitos no hay valor (no es un 0 %)');

const chain = chainStats(new Set(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-16', '2026-10-17']), TODAY);
ok(chain.current === 2 && chain.best === 4 && chain.total === 6, `racha actual 2 (hasta ayer), mejor 4, total 6: ${JSON.stringify(chain)}`);

const cols = weekColumns(TODAY, 3);
ok(cols.length === 3 && cols[2][0] === '2026-10-12' && cols[2][6] === TODAY && cols[0][0] === '2026-09-28', 'columnas de semanas de lunes a domingo, la última con hoy');
const oct = monthGrid('2026-10');
ok(oct[0][0] === null && oct[0][3] === '2026-10-01' && oct.flat().filter(Boolean).length === 31 && oct.every((w) => w.length === 7), 'octubre de 2026 empieza en jueves y tiene 31 días');

// ---------------------------------------------------------------- Correlaciones

// 30 días: los días de gym duermes 7,5 h y los demás 6,5 h; gastas 5 € en vez de 20 €.
const days = lastDays(30, TODAY);
const gymDays = days.filter((_, i) => i % 2 === 0);
const health: HealthLog[] = days.map((d, i) => ({
  id: d,
  date: d,
  sleep_hours: gymDays.includes(d) ? 7.5 + (i % 3) * 0.1 : 6.5 + (i % 3) * 0.1,
  energy: 3,
  exercise_minutes: null,
  weight: null,
  notes: '',
}));
const spend = days.map((d) => tx(d, gymDays.includes(d) ? 5 : 20));
const found = correlations({ habits: [gym], logs: gymDays.map((d) => log('gym', d)), health, transactions: spend }, TODAY);
const sleep = found.find((f) => f.metric === 'sueño');
ok(sleep && Math.abs(sleep.withHabit - sleep.without - 1) < 0.01 && sleep.text.includes('duermes 1 h más'), `detecta que con gym duermes 1 h más: «${sleep?.text}»`);
const money = found.find((f) => f.metric === 'gasto');
ok(money && money.text.replace(/\s/g, ' ').includes('gastas 15 € menos'), `y que gastas menos: «${money?.text}»`);
ok(!found.some((f) => f.metric === 'energía'), 'sin diferencia de energía, no inventa una');
const fewDays = correlations({ habits: [gym], logs: gymDays.slice(0, 3).map((d) => log('gym', d)), health, transactions: [] }, TODAY);
ok(fewDays.length === 0, 'con menos de 5 días a cada lado no saca conclusiones');
const recurrent = correlations({ habits: [gym], logs: gymDays.map((d) => log('gym', d)), health: [], transactions: days.map((d) => tx(d, gymDays.includes(d) ? 900 : 0, { source: gymDays.includes(d) ? 'recurrente' : undefined })) }, TODAY);
ok(recurrent.length === 0, 'los cargos periódicos (alquiler, suscripciones) no cuentan como gasto del día');

// ---------------------------------------------------------------- Puntuación del día

const full = dayScore(TODAY, {
  habits: [gym, read],
  logs: [log('gym', TODAY), log('leer', TODAY)],
  highlights: [{ id: 'h', date: TODAY, text: 'x', done: true }],
  tasks: [{ id: 't', project_id: null, title: 't', status: 'hecha', priority: 'media', due_date: TODAY }],
  transactions: [tx(TODAY, 10)],
  monthlyBudget: 930,
});
ok(full.score === 100, `un día perfecto da 100 (${full.score})`);
const half = dayScore(TODAY, { habits: [gym, read], logs: [log('gym', TODAY)], highlights: [], tasks: [], transactions: [], monthlyBudget: 0 });
ok(half.score === 33 && half.parts.length === 2, `sin tareas ni presupuesto solo cuentan hábitos y lo más importante: 50 %·40 + 0·20 → ${half.score}`);
const over = dayScore(TODAY, { habits: [], logs: [], highlights: [{ id: 'h', date: TODAY, text: 'x', done: true }], tasks: [], transactions: [tx(TODAY, 60)], monthlyBudget: 930 });
ok(over.parts.find((p) => p.label === 'Gasto')!.value === 0 && over.score === 50, 'gastar el doble del presupuesto diario deja el gasto a 0');

// ---------------------------------------------------------------- Finanzas

const rules = [
  rule({ id: 'netflix', amount: 12.99 }),
  rule({ id: 'gym', note: 'Gimnasio', amount: 30, anchor_day: 1, next_date: '2026-11-01' }),
  rule({ id: 'seguro', note: 'Seguro', amount: 240, frequency: 'anual', anchor_day: 5, anchor_month: 1, next_date: '2027-01-05' }),
  rule({ id: 'pausado', note: 'Pausado', active: false, next_date: '2026-10-20' }),
  rule({ id: 'nomina', type: 'ingreso', note: 'Nómina', amount: 1500, next_date: '2026-10-30', anchor_day: 30 }),
];
const next30 = upcomingCharges(rules, TODAY, addDays(TODAY, 30));
ok(next30.map((c) => c.rule.id).join(',') === 'netflix,nomina,gym', `próximos 30 días por fecha, sin los pausados: ${next30.map((c) => `${c.rule.id}@${c.date}`).join(' ')}`);
const subs = subscriptions(rules);
ok(subs.items.map((i) => i.rule.id).join(',') === 'gym,seguro,netflix' && Math.abs(subs.monthly - (30 + 20 + 12.99)) < 0.01, `suscripciones del más caro al más barato al mes (seguro anual = 20 €/mes): ${subs.monthly.toFixed(2)}`);
ok(Math.abs(subs.yearly - subs.monthly * 12) < 0.01, 'y su coste al año');

// Día 10 de un mes de 30: 100 € variables, 500 € de alquiler ya cobrado, 12,99 € por cobrar el 25.
const pace = spendingPace({
  transactions: [tx('2026-09-01', 500, { source: 'recurrente' }), tx('2026-09-05', 60), tx('2026-09-09', 40), tx('2026-08-30', 999)],
  rules: [rule({ next_date: '2026-09-25' })],
  day: '2026-09-10',
});
ok(pace.spent === 600 && Math.abs(pace.projected - (500 + 10 + 300)) < 0.01, `previsión = fijo cobrado + fijo pendiente + variable al ritmo actual (${pace.projected})`);
const onlyOcio = spendingPace({ transactions: [tx('2026-09-05', 60), tx('2026-09-06', 40, { category_id: 'super' })], rules: [], day: '2026-09-10', matches: (id) => id === 'ocio' });
ok(onlyOcio.variable === 60, 'filtrada por categoría');

// ---------------------------------------------------------------- Tiempo

ok(daysUntil('2026-12-24', TODAY) === 67 && daysUntil('2026-10-17', TODAY) === -1, 'días que faltan (y negativos si ya pasó)');
const p = periodProgress(TODAY);
ok(p.dayOfYear === 291 && Math.abs(p.week - 1) < 1e-9 && Math.abs(p.month - 18 / 31) < 1e-9, `progreso: día 291 del año, domingo = semana completa (${p.dayOfYear})`);
ok(monthsLeft('2027-03-31', TODAY) === 6 && monthsLeft('2026-10-25', TODAY) === 1 && monthsLeft('2026-01-01', TODAY) === 1, 'meses que quedan para una meta (mínimo 1)');

console.log(failures ? `\n${failures} comprobación(es) fallida(s)` : '\nTodas las comprobaciones pasan');
Deno.exit(failures ? 1 : 0);
