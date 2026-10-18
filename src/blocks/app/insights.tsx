import { useMemo, useState } from 'react';
import { Empty, IconButton, Progress } from '../../components/ui';
import { filterValue, filterValues } from '../../lib/blockKinds';
import { chainStats, correlations, dayScore, habitRatios, MIN_DAYS, weekColumns } from '../../lib/insights';
import { useHabits } from '../../lib/useHabits';
import { useTable } from '../../lib/useTable';
import { addDays, fmtDate, fmtDay, lastDays, parseISO, sumBy, today } from '../../lib/utils';
import type { BlockProps } from '..';
import { HeaderAction } from '../header';

const METRIC_ICON = { sueño: '😴', energía: '⚡', gasto: '💶' } as const;

/** «Qué te funciona»: cómo cambian sueño, energía y gasto los días que cumples cada hábito. */
export function Correlations() {
  const { active, logs } = useHabits();
  const health = useTable('health_logs');
  const txs = useTable('transactions');
  const found = useMemo(
    () => correlations({ habits: active, logs: logs.rows, health: health.rows, transactions: txs.rows }, today()).slice(0, 6),
    [active, logs.rows, health.rows, txs.rows],
  );

  if (logs.loading || health.loading) return <Empty>Cargando…</Empty>;
  if (found.length === 0) {
    return (
      <Empty>
        Aún no hay patrones claros. Hacen falta al menos {MIN_DAYS} días con el hábito y {MIN_DAYS} sin él, y registrar tu sueño y energía (bloque «Registro
        diario de salud») o tus gastos. Cuantos más días apuntes, más cosas descubrirá.
      </Empty>
    );
  }
  return (
    <>
      <ul className="insight-list">
        {found.map((f) => (
          <li key={`${f.habit.id}-${f.metric}`}>
            <span className="insight-icon" aria-hidden>
              {METRIC_ICON[f.metric]}
            </span>
            <span>
              {f.text}
              <span className="muted small">
                {' '}
                · {f.daysWith} días con el hábito y {f.daysWithout} sin él
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="muted small">Últimos 90 días. Indica qué va junto, no qué lo causa: úsalo como pista.</p>
    </>
  );
}

const scoreTone = (score: number) => (score >= 70 ? 'ok' : score >= 40 ? 'warn' : 'danger');

/** Nota de 0 a 100 del día y de los últimos 7 días. */
export function DayScore() {
  const { active, logs } = useHabits();
  const highlights = useTable('highlights');
  const tasks = useTable('tasks');
  const txs = useTable('transactions');
  const budgets = useTable('budgets');
  const data = {
    habits: active,
    logs: logs.rows,
    highlights: highlights.rows,
    tasks: tasks.rows,
    transactions: txs.rows,
    monthlyBudget: sumBy(budgets.rows, (b) => b.monthly_limit),
  };
  const day = today();
  const { score, parts } = dayScore(day, data);
  const week = lastDays(7, day).map((d) => ({ d, score: dayScore(d, data).score }));

  if (score === null) return <Empty>Añade hábitos o un presupuesto para tener puntuación.</Empty>;
  return (
    <div className="score">
      <div className="score-main">
        <strong className={`score-value tone-${scoreTone(score)}`}>{score}</strong>
        <span className="muted small">de 100 hoy</span>
      </div>
      <ul className="score-parts">
        {parts.map((p) => (
          <li key={p.label}>
            <span className="row between">
              <span>{p.label}</span>
              <span className="muted small">{p.detail}</span>
            </span>
            <Progress value={p.value * 100} tone={p.value >= 1 ? 'ok' : undefined} label={`${p.label}: ${p.detail}`} />
          </li>
        ))}
      </ul>
      <div className="score-week" aria-label="Puntuación de los últimos 7 días">
        {week.map((w) => (
          <span key={w.d} className="score-day" title={`${fmtDay(w.d)}: ${w.score ?? '—'}`}>
            <span className={`score-bar tone-${w.score === null ? 'none' : scoreTone(w.score)}`} style={{ height: `${Math.max(6, w.score ?? 0)}%` }} />
            <span className="small muted">{parseISO(w.d).toLocaleDateString('es-ES', { weekday: 'narrow' })}</span>
          </span>
        ))}
      </div>
      <details className="small muted">
        <summary>¿Cómo se calcula?</summary>
        Hábitos cumplidos (40 %), lo más importante del día hecho (20 %), tareas que vencían ese día hechas (20 %) y gasto variable dentro del
        presupuesto diario (20 %). Lo que no aplica ese día no cuenta.
      </details>
    </div>
  );
}

/** Intensidad 0-4 para colorear un día según la parte de hábitos cumplidos. */
const level = (ratio: number | undefined) => (ratio === undefined || ratio === 0 ? 0 : Math.min(4, Math.ceil(ratio * 4)));

/** Mapa de un año (o 26 semanas) con un cuadrado por día. */
export function DayGrid({ columns, value, label, year }: {
  columns: string[][];
  value: (d: string) => number | undefined;
  label: (d: string) => string;
  /** Si se indica, los días de otros años quedan vacíos. */
  year?: number;
}) {
  const day = today();
  let lastMonth = -1;
  return (
    <div className="day-grid-wrap">
      <div className="day-grid" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }} role="img" aria-label="Mapa de días">
        {columns.map((week, w) => {
          const firstOfMonth = week.find((d) => parseISO(d).getDate() === 1 && (year === undefined || parseISO(d).getFullYear() === year));
          const month = firstOfMonth ? parseISO(firstOfMonth).getMonth() : w === 0 ? parseISO(week[6]).getMonth() : -1;
          const show = month >= 0 && month !== lastMonth;
          if (show) lastMonth = month;
          return (
            <div key={week[0]} className="day-col">
              <span className="day-month small muted">{show ? parseISO(`2001-${String(month + 1).padStart(2, '0')}-01`).toLocaleDateString('es-ES', { month: 'short' }) : ''}</span>
              {week.map((d) => {
                const outside = (year !== undefined && parseISO(d).getFullYear() !== year) || d > day;
                return <span key={d} className={`day-cell lvl-${outside ? 'x' : level(value(d))} ${d === day ? 'is-today' : ''}`} title={outside ? undefined : label(d)} />;
              })}
            </div>
          );
        })}
      </div>
      <div className="day-legend small muted" aria-hidden>
        Menos <span className="day-cell lvl-0" /> <span className="day-cell lvl-1" /> <span className="day-cell lvl-2" /> <span className="day-cell lvl-3" />{' '}
        <span className="day-cell lvl-4" /> Más
      </div>
    </div>
  );
}

/** Año en píxeles: cada día con el color de la parte de hábitos cumplidos. */
export function YearPixels({ block }: BlockProps) {
  const { active, logs } = useHabits();
  const [year, setYear] = useState(() => parseISO(today()).getFullYear());
  const chosen = filterValues(block.content, 'habits');
  const habits = chosen.length ? active.filter((h) => chosen.includes(h.id)) : active;
  const first = `${year}-01-01`;
  const last = `${year}-12-31`;
  const weeks = Math.round((parseISO(last).getTime() - parseISO(first).getTime()) / (7 * 86_400_000)) + 2;
  const columns = weekColumns(last, weeks).filter((w) => w.some((d) => d.startsWith(String(year))));
  const days = columns.flat().filter((d) => d.startsWith(String(year)));
  const ratios = habitRatios(habits, logs.rows, days);
  const counted = days.filter((d) => d <= today());
  const perfect = counted.filter((d) => ratios.get(d) === 1).length;

  if (habits.length === 0) return <Empty>{logs.loading ? 'Cargando…' : 'Añade hábitos para ver tu año en píxeles.'}</Empty>;
  return (
    <>
      <HeaderAction>
        <div className="row">
          <IconButton label="Año anterior" onClick={() => setYear(year - 1)}>
            ←
          </IconButton>
          <span className="small">{year}</span>
          <IconButton label="Año siguiente" onClick={() => setYear(year + 1)} disabled={year >= parseISO(today()).getFullYear()}>
            →
          </IconButton>
        </div>
      </HeaderAction>
      <DayGrid
        columns={columns}
        year={year}
        value={(d) => ratios.get(d)}
        label={(d) => `${fmtDate(d)}: ${Math.round((ratios.get(d) ?? 0) * habits.length)} de ${habits.length} hábitos`}
      />
      <p className="muted small">
        {perfect} {perfect === 1 ? 'día perfecto' : 'días perfectos'} en {year}
        {chosen.length ? ` con ${habits.map((h) => h.name).join(', ')}` : ''}.
      </p>
    </>
  );
}

/** Cadena de un hábito: 26 semanas, racha actual y mejor racha. */
export function HabitChain({ block }: BlockProps) {
  const { active, logs, isDone } = useHabits();
  const chosen = filterValue(block.content, 'habit');
  const habit = active.find((h) => h.id === chosen) ?? active[0];
  const day = today();
  const dates = useMemo(() => new Set(logs.rows.filter((l) => l.habit_id === habit?.id).map((l) => l.date)), [logs.rows, habit?.id]);

  if (!habit) return <Empty>{logs.loading ? 'Cargando…' : 'Añade un hábito para ver su cadena.'}</Empty>;
  const stats = chainStats(dates, day);
  const since = addDays(day, -181);
  const last26 = [...dates].filter((d) => d >= since && d <= day).length;
  return (
    <>
      <p className="chain-title">
        <span aria-hidden>{habit.icon}</span> <strong>{habit.name}</strong>
        {!chosen && <span className="muted small"> · elige otro hábito en ⚙</span>}
      </p>
      <div className="chain-stats">
        <span>
          <strong>🔥 {stats.current}</strong>
          <span className="muted small">racha actual</span>
        </span>
        <span>
          <strong>🏆 {stats.best}</strong>
          <span className="muted small">mejor racha</span>
        </span>
        <span>
          <strong>{last26}</strong>
          <span className="muted small">días en 6 meses</span>
        </span>
      </div>
      <DayGrid
        columns={weekColumns(day, 26)}
        value={(d) => (dates.has(d) ? 1 : 0)}
        label={(d) => `${fmtDate(d)}: ${dates.has(d) ? 'hecho' : 'no'}`}
      />
      {!isDone(habit.id, day) && <p className="muted small">Hoy aún no lo has marcado: márcalo para no romper la cadena.</p>}
    </>
  );
}
