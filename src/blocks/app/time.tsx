import { useState, type FormEvent } from 'react';
import { Empty, IconButton, Progress } from '../../components/ui';
import { daysUntil, monthGrid, periodProgress, upcomingCharges } from '../../lib/insights';
import { toast } from '../../lib/toast';
import { useHabits } from '../../lib/useHabits';
import { useTable } from '../../lib/useTable';
import { addDays, addMonths, eur, fmtDate, fmtMonth, monthKey, parseISO, pct, today } from '../../lib/utils';
import type { BlockProps } from '..';
import { HeaderAction } from '../header';

/** Agenda de hoy: lo pendiente de toda la app en una sola lista. */
export function TodayAgenda() {
  const day = today();
  const { active, isDone, toggle } = useHabits();
  const tasks = useTable('tasks');
  const highlights = useTable('highlights');
  const recurring = useTable('recurring_transactions');
  const txs = useTable('transactions');
  const highlight = highlights.rows.find((h) => h.date === day);
  const due = tasks.rows
    .filter((t) => t.status !== 'hecha' && t.due_date && t.due_date <= day)
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!));
  const habits = active.filter((h) => !isDone(h.id, day));
  // Los de hoy ya se han apuntado solos al entrar (son movimientos); los de mañana salen de los periódicos.
  const charges = [
    ...txs.rows
      .filter((t) => t.source === 'recurrente' && t.date === day)
      .map((t) => ({ id: t.id, note: t.note, type: t.type, amount: Number(t.amount), when: 'hoy' })),
    ...upcomingCharges(recurring.rows, day, addDays(day, 1)).map((c) => ({
      id: `${c.rule.id}${c.date}`,
      note: c.rule.note,
      type: c.rule.type,
      amount: Number(c.rule.amount),
      when: c.date === day ? 'hoy' : 'mañana',
    })),
  ];

  const nothing = (!highlight || highlight.done) && due.length === 0 && habits.length === 0 && charges.length === 0;
  if (tasks.loading || highlights.loading) return <Empty>Cargando…</Empty>;
  return (
    <div className="agenda">
      {highlight && (
        <section>
          <h3>⭐ Lo más importante</h3>
          <label className="check">
            <input type="checkbox" checked={highlight.done} onChange={() => void highlights.update(highlight.id, { done: !highlight.done })} />
            <span className={highlight.done ? 'done' : ''}>{highlight.text}</span>
          </label>
        </section>
      )}
      {due.length > 0 && (
        <section>
          <h3>✅ Tareas para hoy</h3>
          <ul className="list">
            {due.map((t) => (
              <li key={t.id}>
                <label className="check">
                  <input type="checkbox" checked={false} onChange={() => void tasks.update(t.id, { status: 'hecha' })} aria-label={`Marcar «${t.title}» como hecha`} />
                  <span>{t.title}</span>
                </label>
                {t.due_date! < day && <span className="due overdue">vencida {fmtDate(t.due_date!)}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {habits.length > 0 && (
        <section>
          <h3>🔁 Hábitos pendientes</h3>
          <ul className="list">
            {habits.map((h) => (
              <li key={h.id}>
                <label className="check">
                  <input type="checkbox" checked={false} onChange={() => void toggle(h.id, day)} />
                  <span>
                    {h.icon} {h.name}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}
      {charges.length > 0 && (
        <section>
          <h3>💳 Cargos de hoy y mañana</h3>
          <ul className="list">
            {charges.map((c) => (
              <li key={c.id}>
                <span>
                  {c.note} <span className="muted small">· {c.when}</span>
                </span>
                <span className={`tx-amount ${c.type}`}>
                  {c.type === 'gasto' ? '−' : '+'}
                  {eur(c.amount)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {nothing && <Empty>Nada pendiente hoy 🎉</Empty>}
      {!highlight && <p className="muted small">Aún no has fijado lo más importante de hoy.</p>}
    </div>
  );
}

/** Cuánto llevas de semana, mes y año frente a tus objetivos. */
export function YearProgress() {
  const day = today();
  const p = periodProgress(day);
  const goals = useTable('goals');
  const yearly = goals.rows.filter((g) => g.horizon === 'anual');
  const goalPct = yearly.length ? Math.round(yearly.reduce((a, g) => a + pct(g.current, g.target), 0) / yearly.length) : null;
  const yearPct = Math.round(p.year * 100);
  const rows = [
    { label: 'Semana', value: p.week },
    { label: 'Mes', value: p.month },
    { label: `Año ${parseISO(day).getFullYear()}`, value: p.year },
  ];
  return (
    <div className="stack">
      {rows.map((r) => (
        <div key={r.label} className="period">
          <span className="row between">
            <span>{r.label}</span>
            <strong>{Math.round(r.value * 100)} %</strong>
          </span>
          <Progress value={r.value * 100} label={`${r.label}: ${Math.round(r.value * 100)} %`} />
        </div>
      ))}
      {goalPct !== null && (
        <p className={`small ${goalPct >= yearPct ? 'text-ok' : 'muted'}`}>
          Tus objetivos anuales van al {goalPct} %:{' '}
          {goalPct >= yearPct ? 'vas por delante del año 💪' : `${yearPct - goalPct} puntos por detrás del año.`}
        </p>
      )}
      <p className="muted small">
        Día {p.dayOfYear} de {p.yearDays}. Quedan {p.yearDays - p.dayOfYear} días.
      </p>
    </div>
  );
}

interface CountdownEvent {
  id: string;
  title: string;
  date: string;
}

const readEvents = (c: Record<string, unknown>): CountdownEvent[] =>
  (Array.isArray(c.events) ? c.events : [])
    .filter((e): e is CountdownEvent => !!e && typeof e === 'object' && typeof (e as CountdownEvent).id === 'string' && typeof (e as CountdownEvent).date === 'string')
    .map((e) => ({ id: e.id, title: typeof e.title === 'string' ? e.title : '', date: e.date }));

const MAX_EVENTS = 20;

/** Días que faltan para lo que esperas. */
export function Countdown({ block, onSave }: BlockProps) {
  const events = readEvents(block.content).sort((a, b) => a.date.localeCompare(b.date));
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const day = today();

  const save = (next: CountdownEvent[]) => onSave({ ...block.content, events: next });

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date) return toast('Pon un nombre y una fecha', 'error');
    if (events.length >= MAX_EVENTS) return toast(`Como mucho ${MAX_EVENTS} cuentas atrás por bloque`, 'error');
    if (await save([...events, { id: crypto.randomUUID(), title: title.trim().slice(0, 80), date }])) {
      setTitle('');
      setDate('');
    }
  };

  return (
    <div className="stack">
      {events.length === 0 ? (
        <Empty>Añade lo que estás esperando: un viaje, un examen, unas vacaciones…</Empty>
      ) : (
        <ul className="countdown-list">
          {events.map((ev) => {
            const n = daysUntil(ev.date, day);
            return (
              <li key={ev.id} className={n < 0 ? 'is-past' : ''}>
                <strong className="countdown-days">{n === 0 ? '¡Hoy!' : Math.abs(n)}</strong>
                <span className="countdown-text">
                  <span>{ev.title}</span>
                  <span className="muted small">
                    {n > 0 ? `${n === 1 ? 'falta 1 día' : `faltan ${n} días`} · ${fmtDate(ev.date)}` : n < 0 ? `hace ${-n} días · ${fmtDate(ev.date)}` : fmtDate(ev.date)}
                  </span>
                </span>
                <IconButton label={`Quitar ${ev.title}`} onClick={() => void save(events.filter((x) => x.id !== ev.id))} danger>
                  ✕
                </IconButton>
              </li>
            );
          })}
        </ul>
      )}
      <form onSubmit={add} className="inline-form wrap">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Viaje a Japón" aria-label="Qué esperas" maxLength={80} />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Fecha" />
        <button className="btn primary">Añadir</button>
      </form>
    </div>
  );
}

/** Calendario mensual con tareas con fecha, cargos periódicos y revisiones semanales. */
export function MonthCalendar() {
  const day = today();
  const [month, setMonth] = useState(() => monthKey(day));
  const [selected, setSelected] = useState(day);
  const tasks = useTable('tasks');
  const recurring = useTable('recurring_transactions');
  const reviews = useTable('reviews');
  const txs = useTable('transactions');
  const grid = monthGrid(month);
  const end = `${month}-${String(grid.flat().filter(Boolean).length).padStart(2, '0')}`;
  // Los ya cobrados son movimientos; los que faltan salen del calendario de cada periódico.
  const charges = [
    ...txs.rows
      .filter((t) => t.source === 'recurrente' && monthKey(t.date) === month)
      .map((t) => ({ id: t.id, date: t.date, note: t.note, type: t.type, amount: Number(t.amount) })),
    ...upcomingCharges(recurring.rows, `${month}-01`, end).map((c) => ({
      id: `${c.rule.id}${c.date}`,
      date: c.date,
      note: c.rule.note,
      type: c.rule.type,
      amount: Number(c.rule.amount),
    })),
  ];
  const reviewWeeks = new Set(reviews.rows.map((r) => r.week_start));

  const itemsOf = (d: string) => ({
    tasks: tasks.rows.filter((t) => t.due_date === d),
    charges: charges.filter((c) => c.date === d),
    review: reviewWeeks.has(d),
  });
  const sel = itemsOf(selected);

  return (
    <>
      <HeaderAction>
        <div className="row">
          <IconButton label="Mes anterior" onClick={() => setMonth(addMonths(month, -1))}>
            ←
          </IconButton>
          <span className="small month-label">{fmtMonth(month)}</span>
          <IconButton label="Mes siguiente" onClick={() => setMonth(addMonths(month, 1))}>
            →
          </IconButton>
        </div>
      </HeaderAction>
      <div className="calendar" role="grid" aria-label={`Calendario de ${fmtMonth(month)}`}>
        {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => (
          <span key={d} className="calendar-head small muted" role="columnheader">
            {d}
          </span>
        ))}
        {grid.flat().map((d, i) => {
          if (!d) return <span key={`x${i}`} className="calendar-cell is-empty" />;
          const it = itemsOf(d);
          const open = it.tasks.filter((t) => t.status !== 'hecha').length;
          return (
            <button
              key={d}
              type="button"
              className={`calendar-cell ${d === day ? 'is-today' : ''} ${d === selected ? 'is-selected' : ''}`}
              onClick={() => setSelected(d)}
              aria-label={`${fmtDate(d)}: ${it.tasks.length} tareas, ${it.charges.length} cargos`}
              aria-pressed={d === selected}
            >
              <span className="calendar-num">{parseISO(d).getDate()}</span>
              <span className="calendar-marks" aria-hidden>
                {open > 0 && <span className={`mark mark-task ${d < day ? 'overdue' : ''}`} />}
                {it.charges.length > 0 && <span className="mark mark-charge" />}
                {it.review && <span className="mark mark-review" />}
              </span>
            </button>
          );
        })}
      </div>
      <div className="calendar-day">
        <strong className="small">{parseISO(selected).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</strong>
        {sel.tasks.length + sel.charges.length === 0 && !sel.review ? (
          <p className="muted small">Nada este día.</p>
        ) : (
          <ul className="list">
            {sel.tasks.map((t) => (
              <li key={t.id}>
                <span className={t.status === 'hecha' ? 'done' : ''}>✅ {t.title}</span>
              </li>
            ))}
            {sel.charges.map((c) => (
              <li key={c.id}>
                <span>💳 {c.note}</span>
                <span className={`tx-amount ${c.type}`}>
                  {c.type === 'gasto' ? '−' : '+'}
                  {eur(c.amount)}
                </span>
              </li>
            ))}
            {sel.review && (
              <li>
                <span>🗒️ Revisión semanal hecha</span>
              </li>
            )}
          </ul>
        )}
      </div>
      <p className="calendar-legend small muted" aria-hidden>
        <span className="mark mark-task" /> tareas <span className="mark mark-charge" /> cargos <span className="mark mark-review" /> revisión
      </p>
    </>
  );
}
