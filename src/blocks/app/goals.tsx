import { useEffect, useState, type FormEvent } from 'react';
import { confirmDelete, Empty, IconButton, Progress } from '../../components/ui';
import { blockKind, optionValue } from '../../lib/blockKinds';
import { AREA_LABELS } from '../../lib/defaults';
import { toast } from '../../lib/toast';
import type { Goal, GoalHorizon, LifeArea, NewRow, Review } from '../../lib/types';
import { useTable } from '../../lib/useTable';
import { addDays, fmtDate, num, parseNum, pct, weekStart } from '../../lib/utils';
import type { BlockProps } from '..';
import { HeaderAction } from '../header';

const HORIZON_LABEL: Record<GoalHorizon, string> = { anual: 'Anual', trimestral: 'Trimestral' };

export function GoalList({ block }: BlockProps) {
  const goals = useTable('goals');
  const horizon = optionValue(blockKind(block.type), block.content, 'horizon');
  const items = goals.rows.filter((g) => horizon === 'todos' || g.horizon === horizon);

  if (items.length === 0) return <Empty>{goals.loading ? 'Cargando…' : 'Ninguno todavía.'}</Empty>;
  return (
    <ul className="goal-list">
      {items.map((g) => (
        <GoalItem
          key={g.id}
          goal={g}
          showHorizon={horizon === 'todos'}
          onUpdate={(patch) => goals.update(g.id, patch)}
          onRemove={() => {
            if (confirmDelete(`el objetivo «${g.title}»`)) void goals.remove(g.id);
          }}
        />
      ))}
    </ul>
  );
}

function GoalItem({ goal, showHorizon, onUpdate, onRemove }: {
  goal: Goal;
  showHorizon: boolean;
  onUpdate: (patch: Partial<NewRow<'goals'>>) => Promise<unknown>;
  onRemove: () => void;
}) {
  const [value, setValue] = useState(String(goal.current));
  useEffect(() => setValue(String(goal.current)), [goal.current]);

  const progress = pct(goal.current, goal.target);
  const reached = Number(goal.current) >= Number(goal.target);

  const save = (e: FormEvent) => {
    e.preventDefault();
    const n = parseNum(value);
    if (n === null) {
      toast('Escribe un número válido', 'error');
      return;
    }
    if (n !== Number(goal.current)) void onUpdate({ current: n });
  };

  return (
    <li className="goal">
      <div className="row between">
        <div>
          <strong>
            {reached ? '✅ ' : ''}
            {goal.title}
          </strong>
          <div className="task-meta">
            <span className="tag">{AREA_LABELS[goal.area]}</span>
            {showHorizon && <span className="tag">{HORIZON_LABEL[goal.horizon]}</span>}
            {goal.due_date && <span className="due">hasta {fmtDate(goal.due_date)}</span>}
          </div>
        </div>
        <IconButton label={`Eliminar ${goal.title}`} onClick={onRemove} danger>
          ✕
        </IconButton>
      </div>
      <Progress value={progress} tone={reached ? 'ok' : undefined} label={`Progreso de ${goal.title}`} />
      <form onSubmit={save} className="row between">
        <span className="muted small">
          {num(Number(goal.current))} / {num(Number(goal.target))} {goal.unit} · {progress} %
        </span>
        <span className="row">
          <IconButton label="Restar 1" onClick={() => void onUpdate({ current: Math.max(0, Number(goal.current) - 1) })}>
            −
          </IconButton>
          <input
            className="num-input"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={save}
            aria-label={`Progreso actual de ${goal.title}`}
          />
          <IconButton label="Sumar 1" onClick={() => void onUpdate({ current: Number(goal.current) + 1 })}>
            +
          </IconButton>
        </span>
      </form>
    </li>
  );
}

export function GoalSummary() {
  const goals = useTable('goals');
  if (goals.rows.length === 0) return <Empty>{goals.loading ? 'Cargando…' : 'Aún no tienes objetivos.'}</Empty>;
  return (
    <ul className="list">
      {goals.rows.slice(0, 5).map((g) => (
        <li key={g.id} className="list-progress">
          <span>{g.title}</span>
          <span className="muted">{pct(g.current, g.target)} %</span>
          <Progress value={pct(g.current, g.target)} tone={g.current >= g.target ? 'ok' : undefined} label={`Progreso de ${g.title}`} />
        </li>
      ))}
    </ul>
  );
}

export function NewGoal() {
  const goals = useTable('goals');
  const [title, setTitle] = useState('');
  const [horizon, setHorizon] = useState<GoalHorizon>('trimestral');
  const [area, setArea] = useState<LifeArea>('personal');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('');
  const [due, setDue] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const t = parseNum(target);
    if (!title.trim()) return;
    if (t === null || t <= 0) {
      toast('La meta tiene que ser un número mayor que 0', 'error');
      return;
    }
    const created = await goals.add({ title: title.trim(), horizon, area, target: t, current: 0, unit: unit.trim(), due_date: due || null });
    if (created) {
      setTitle('');
      setTarget('');
      setUnit('');
      setDue('');
    }
  };

  return (
    <form onSubmit={submit} className="stack">
      <label className="field">
        <span>Objetivo</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Correr una media maratón" required />
      </label>
      <div className="field-row">
        <label className="field">
          <span>Horizonte</span>
          <select value={horizon} onChange={(e) => setHorizon(e.target.value as GoalHorizon)}>
            <option value="trimestral">Trimestral</option>
            <option value="anual">Anual</option>
          </select>
        </label>
        <label className="field">
          <span>Área</span>
          <select value={area} onChange={(e) => setArea(e.target.value as LifeArea)}>
            {Object.entries(AREA_LABELS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span>Meta</span>
          <input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="21" required />
        </label>
        <label className="field">
          <span>Unidad</span>
          <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="km" />
        </label>
      </div>
      <label className="field">
        <span>Fecha límite (opcional)</span>
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      </label>
      <button className="btn primary">Crear objetivo</button>
    </form>
  );
}

type ReviewDraft = Pick<Review, 'wins' | 'challenges' | 'lessons' | 'next_focus'>;

const EMPTY_REVIEW: ReviewDraft = { wins: '', challenges: '', lessons: '', next_focus: '' };

const REVIEW_FIELDS: { key: keyof ReviewDraft; label: string; placeholder: string }[] = [
  { key: 'wins', label: '🏆 Logros', placeholder: '¿Qué salió bien esta semana?' },
  { key: 'challenges', label: '🧗 Dificultades', placeholder: '¿Qué costó o se quedó sin hacer?' },
  { key: 'lessons', label: '💡 Aprendizajes', placeholder: '¿Qué harías distinto?' },
  { key: 'next_focus', label: '🎯 Foco de la próxima semana', placeholder: 'Las 1–3 cosas que más importan' },
];

export function WeeklyReview() {
  const reviews = useTable('reviews');
  const thisWeek = weekStart();
  const [week, setWeek] = useState(thisWeek);
  const existing = reviews.rows.find((r) => r.week_start === week);
  const [draft, setDraft] = useState<ReviewDraft>(EMPTY_REVIEW);

  useEffect(() => {
    setDraft(existing ? { wins: existing.wins, challenges: existing.challenges, lessons: existing.lessons, next_focus: existing.next_focus } : EMPTY_REVIEW);
  }, [existing, week]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const ok = existing ? await reviews.update(existing.id, draft) : await reviews.add({ week_start: week, ...draft });
    if (ok) toast('Revisión guardada');
  };

  const past = reviews.rows
    .filter((r) => r.week_start !== week)
    .sort((a, b) => b.week_start.localeCompare(a.week_start))
    .slice(0, 8);

  const label = (ws: string) => `${fmtDate(ws)} – ${fmtDate(addDays(ws, 6))}`;

  return (
    <>
      <HeaderAction>
        <div className="row">
          <IconButton label="Semana anterior" onClick={() => setWeek(addDays(week, -7))}>
            ←
          </IconButton>
          <span className="small">{week === thisWeek ? 'Esta semana' : label(week)}</span>
          <IconButton label="Semana siguiente" onClick={() => setWeek(addDays(week, 7))} disabled={week >= thisWeek}>
            →
          </IconButton>
        </div>
      </HeaderAction>
      <form onSubmit={save} className="stack">
        <div className="review-grid">
          {REVIEW_FIELDS.map((f) => (
            <label key={f.key} className="field">
              <span>{f.label}</span>
              <textarea rows={3} value={draft[f.key]} placeholder={f.placeholder} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} />
            </label>
          ))}
        </div>
        <div className="row between">
          <span className="muted small">
            {existing ? 'Guardada' : 'Sin guardar'} · semana del {label(week)}
          </span>
          <button className="btn primary">{existing ? 'Actualizar revisión' : 'Guardar revisión'}</button>
        </div>
      </form>

      {past.length > 0 && (
        <div className="past-reviews">
          <span className="muted small">Revisiones anteriores:</span>
          {past.map((r) => (
            <button key={r.id} className="chip" onClick={() => setWeek(r.week_start)}>
              {label(r.week_start)}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
