import { useState, type FormEvent, type ReactNode } from 'react';
import { Empty, Stat } from '../../components/ui';
import { useNav, useUser } from '../../lib/pageContext';
import { useHabits } from '../../lib/useHabits';
import { useTable } from '../../lib/useTable';
import { eur, greeting, monthKey, parseISO, pct, sumBy, today } from '../../lib/utils';

export function Greeting() {
  const user = useUser();
  return (
    <div className="greeting">
      <h2>
        {greeting()}, {user.name}
      </h2>
      <p className="muted">{parseISO(today()).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
    </div>
  );
}

export function DailyHighlight() {
  const day = today();
  const highlights = useTable('highlights');
  const current = highlights.rows.find((h) => h.date === day);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    if (current) await highlights.update(current.id, { text: value });
    else await highlights.add({ date: day, text: value, done: false });
    setEditing(false);
    setText('');
  };

  if (highlights.loading) return <Empty>Cargando…</Empty>;
  if (current && !editing) {
    return (
      <div className="row between">
        <label className="check check-lg">
          <input type="checkbox" checked={current.done} onChange={() => void highlights.update(current.id, { done: !current.done })} />
          <span className={current.done ? 'done' : ''}>{current.text}</span>
        </label>
        <button
          className="btn ghost sm"
          onClick={() => {
            setText(current.text);
            setEditing(true);
          }}
        >
          Cambiar
        </button>
      </div>
    );
  }
  return (
    <form onSubmit={save} className="inline-form">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Si solo pudieras hacer una cosa hoy, ¿cuál sería?"
        aria-label="Lo más importante de hoy"
        autoFocus={editing}
      />
      <button className="btn primary">Fijar</button>
      {editing && (
        <button type="button" className="btn ghost" onClick={() => setEditing(false)}>
          Cancelar
        </button>
      )}
    </form>
  );
}

/** Cifra que lleva a su categoría (si el usuario la conserva). */
function StatLink({ template, children }: { template: string; children: ReactNode }) {
  const nav = useNav();
  const target = nav.pageOf(template);
  if (!target) return <div>{children}</div>;
  return (
    <button className="stat-link" onClick={() => nav.go(target.id)} title={`Ir a ${target.name}`}>
      {children}
    </button>
  );
}

export function TodaySummary() {
  const day = today();
  const month = monthKey(day);
  const { active, isDone } = useHabits();
  const tasks = useTable('tasks');
  const txs = useTable('transactions');
  const budgets = useTable('budgets');
  const goals = useTable('goals');

  const openTasks = tasks.rows.filter((t) => t.status !== 'hecha');
  const overdue = openTasks.filter((t) => t.due_date && t.due_date < day);
  const habitsDone = active.filter((h) => isDone(h.id, day)).length;
  const spent = sumBy(
    txs.rows.filter((t) => t.type === 'gasto' && monthKey(t.date) === month),
    (t) => t.amount,
  );
  const budgetTotal = sumBy(budgets.rows, (b) => b.monthly_limit);
  const goalAvg = goals.rows.length ? Math.round(goals.rows.reduce((acc, g) => acc + pct(g.current, g.target), 0) / goals.rows.length) : 0;

  return (
    <div className="stats">
      <StatLink template="habitos">
        <Stat label="Hábitos de hoy" value={`${habitsDone}/${active.length}`} tone={active.length > 0 && habitsDone === active.length ? 'ok' : undefined} />
      </StatLink>
      <StatLink template="proyectos">
        <Stat
          label="Tareas abiertas"
          value={openTasks.length}
          hint={overdue.length > 0 ? `${overdue.length} vencida${overdue.length > 1 ? 's' : ''}` : 'Ninguna vencida'}
          tone={overdue.length > 0 ? 'danger' : undefined}
        />
      </StatLink>
      <StatLink template="finanzas">
        <Stat
          label="Gastado este mes"
          value={eur(spent)}
          hint={budgetTotal > 0 ? `de ${eur(budgetTotal)} presupuestados` : undefined}
          tone={budgetTotal > 0 && spent > budgetTotal ? 'danger' : undefined}
        />
      </StatLink>
      <StatLink template="objetivos">
        <Stat label="Progreso de objetivos" value={`${goalAvg} %`} hint={`${goals.rows.length} objetivos`} />
      </StatLink>
    </div>
  );
}
