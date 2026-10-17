import { useState, type FormEvent } from 'react';
import { Card, Empty, Progress, Stat } from '../components/ui';
import type { TabId } from '../lib/tabs';
import type { User } from '../lib/types';
import { useHabits } from '../lib/useHabits';
import { useTable } from '../lib/useTable';
import { eur, fmtDate, greeting, monthKey, parseISO, pct, sumBy, today } from '../lib/utils';

export default function Home({ user, go }: { user: User; go: (t: TabId) => void }) {
  const day = today();
  const month = monthKey(day);

  const { active, isDone, toggle, streakOf } = useHabits();
  const tasks = useTable('tasks');
  const projects = useTable('projects');
  const txs = useTable('transactions');
  const budgets = useTable('budgets');
  const goals = useTable('goals');

  const openTasks = tasks.rows.filter((t) => t.status !== 'hecha');
  const overdue = openTasks.filter((t) => t.due_date && t.due_date < day);
  const upcoming = openTasks
    .filter((t) => t.due_date)
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!))
    .slice(0, 5);

  const habitsDone = active.filter((h) => isDone(h.id, day)).length;

  const spent = sumBy(
    txs.rows.filter((t) => t.type === 'gasto' && monthKey(t.date) === month),
    (t) => t.amount,
  );
  const budgetTotal = sumBy(budgets.rows, (b) => b.monthly_limit);
  const goalAvg = goals.rows.length
    ? Math.round(goals.rows.reduce((acc, g) => acc + pct(g.current, g.target), 0) / goals.rows.length)
    : 0;

  const activeProjects = projects.rows.filter((p) => p.status === 'activo');
  const projectName = (id: string | null) => projects.rows.find((p) => p.id === id)?.name;

  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1>
          {greeting()}, {user.name}
        </h1>
        <p className="muted">
          {parseISO(day).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      <DailyHighlight />

      <div className="stats">
        <button className="stat-link" onClick={() => go('habitos')}>
          <Stat
            label="Hábitos de hoy"
            value={`${habitsDone}/${active.length}`}
            tone={active.length > 0 && habitsDone === active.length ? 'ok' : undefined}
          />
        </button>
        <button className="stat-link" onClick={() => go('proyectos')}>
          <Stat
            label="Tareas abiertas"
            value={openTasks.length}
            hint={overdue.length > 0 ? `${overdue.length} vencida${overdue.length > 1 ? 's' : ''}` : 'Ninguna vencida'}
            tone={overdue.length > 0 ? 'danger' : undefined}
          />
        </button>
        <button className="stat-link" onClick={() => go('finanzas')}>
          <Stat
            label="Gastado este mes"
            value={eur(spent)}
            hint={budgetTotal > 0 ? `de ${eur(budgetTotal)} presupuestados` : undefined}
            tone={budgetTotal > 0 && spent > budgetTotal ? 'danger' : undefined}
          />
        </button>
        <button className="stat-link" onClick={() => go('objetivos')}>
          <Stat label="Progreso de objetivos" value={`${goalAvg} %`} hint={`${goals.rows.length} objetivos`} />
        </button>
      </div>

      <div className="grid-2">
        <Card title="Hábitos de hoy">
          {active.length === 0 ? (
            <Empty>Aún no tienes hábitos. Créalos en «Hábitos y salud».</Empty>
          ) : (
            <ul className="list">
              {active.map((h) => {
                const s = streakOf(h.id);
                return (
                  <li key={h.id}>
                    <label className="check">
                      <input type="checkbox" checked={isDone(h.id, day)} onChange={() => void toggle(h.id, day)} />
                      <span>
                        {h.icon} {h.name}
                      </span>
                    </label>
                    {s > 0 && <span className="streak">🔥 {s}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Próximas fechas límite">
          {upcoming.length === 0 ? (
            <Empty>No hay tareas con fecha límite pendientes.</Empty>
          ) : (
            <ul className="list">
              {upcoming.map((t) => (
                <li key={t.id}>
                  <span>
                    {t.title}
                    {projectName(t.project_id) && <span className="muted"> · {projectName(t.project_id)}</span>}
                  </span>
                  <span className={`due ${t.due_date! < day ? 'overdue' : ''}`}>{fmtDate(t.due_date!)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Proyectos activos">
          {activeProjects.length === 0 ? (
            <Empty>Sin proyectos activos.</Empty>
          ) : (
            <ul className="list">
              {activeProjects.map((p) => {
                const own = tasks.rows.filter((t) => t.project_id === p.id);
                const done = own.filter((t) => t.status === 'hecha').length;
                return (
                  <li key={p.id} className="list-progress">
                    <span>
                      <span className="dot" style={{ background: p.color }} /> {p.name}
                    </span>
                    <span className="muted">
                      {done}/{own.length}
                    </span>
                    <Progress value={pct(done, own.length)} label={`Progreso de ${p.name}`} />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Objetivos">
          {goals.rows.length === 0 ? (
            <Empty>Define tus objetivos en la pestaña «Objetivos».</Empty>
          ) : (
            <ul className="list">
              {goals.rows.slice(0, 5).map((g) => (
                <li key={g.id} className="list-progress">
                  <span>{g.title}</span>
                  <span className="muted">{pct(g.current, g.target)} %</span>
                  <Progress
                    value={pct(g.current, g.target)}
                    tone={g.current >= g.target ? 'ok' : undefined}
                    label={`Progreso de ${g.title}`}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function DailyHighlight() {
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

  return (
    <Card title="⭐ Lo más importante de hoy" className="highlight">
      {highlights.loading ? (
        <Empty>Cargando…</Empty>
      ) : current && !editing ? (
        <div className="row between">
          <label className="check check-lg">
            <input
              type="checkbox"
              checked={current.done}
              onChange={() => void highlights.update(current.id, { done: !current.done })}
            />
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
      ) : (
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
      )}
    </Card>
  );
}
