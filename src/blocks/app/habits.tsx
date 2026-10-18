import { useEffect, useState, type FormEvent } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { confirmDelete, Empty, IconButton, Progress, Stat } from '../../components/ui';
import { toast } from '../../lib/toast';
import type { HealthLog } from '../../lib/types';
import { tooltipStyle, useChartColors } from '../../lib/useChartColors';
import { useHabits } from '../../lib/useHabits';
import { useTable } from '../../lib/useTable';
import { fmtDay, lastDays, num, parseNum, pct, sumBy, today } from '../../lib/utils';
import { HeaderAction } from '../header';

export function HabitsToday() {
  const day = today();
  const { habits, active, isDone, toggle, streakOf } = useHabits();

  if (active.length === 0) return <Empty>{habits.loading ? 'Cargando…' : 'Aún no tienes hábitos. Créalos en el bloque «Hábitos · últimos 7 días».'}</Empty>;
  return (
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
  );
}

export function HabitWeek() {
  const { habits, active, isDone, toggle, streakOf } = useHabits();
  const days = lastDays(7);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('✅');

  const doneThisWeek = active.reduce((acc, h) => acc + days.filter((d) => isDone(h.id, d)).length, 0);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await habits.add({ name: name.trim(), icon: icon.trim() || '✅', active: true });
    setName('');
  };

  return (
    <>
      <HeaderAction>
        <span className="muted small">{pct(doneThisWeek, active.length * days.length)} % cumplido</span>
      </HeaderAction>
      {active.length === 0 && !habits.loading ? (
        <Empty>Añade tu primer hábito abajo.</Empty>
      ) : (
        <div className="table-scroll">
          <table className="habit-table">
            <thead>
              <tr>
                <th scope="col">Hábito</th>
                {days.map((d) => (
                  <th key={d} scope="col" className={d === today() ? 'is-today' : ''}>
                    {fmtDay(d)}
                  </th>
                ))}
                <th scope="col">Racha</th>
                <th scope="col">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {active.map((h) => (
                <tr key={h.id}>
                  <th scope="row">
                    <span aria-hidden>{h.icon}</span> {h.name}
                  </th>
                  {days.map((d) => {
                    const done = isDone(h.id, d);
                    return (
                      <td key={d}>
                        <button className={`cell ${done ? 'on' : ''}`} aria-pressed={done} aria-label={`${h.name}, ${fmtDay(d)}`} onClick={() => void toggle(h.id, d)}>
                          {done ? '✓' : ''}
                        </button>
                      </td>
                    );
                  })}
                  <td className="streak-cell">{streakOf(h.id) > 0 ? `🔥 ${streakOf(h.id)}` : '—'}</td>
                  <td>
                    <IconButton
                      label={`Eliminar ${h.name}`}
                      danger
                      onClick={() => {
                        if (confirmDelete(`el hábito «${h.name}» y su historial`)) void habits.remove(h.id);
                      }}
                    >
                      ✕
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form onSubmit={add} className="inline-form">
        <input className="icon-input" value={icon} onChange={(e) => setIcon(e.target.value)} aria-label="Icono (emoji)" maxLength={4} />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nuevo hábito…" aria-label="Nombre del hábito" required />
        <button className="btn primary">Añadir</button>
      </form>
    </>
  );
}

interface HealthDraft {
  sleep: string;
  energy: string;
  exercise: string;
  weight: string;
  notes: string;
}

const EMPTY_DRAFT: HealthDraft = { sleep: '', energy: '', exercise: '', weight: '', notes: '' };

const toDraft = (h: HealthLog | undefined): HealthDraft =>
  h
    ? {
        sleep: h.sleep_hours?.toString() ?? '',
        energy: h.energy?.toString() ?? '',
        exercise: h.exercise_minutes?.toString() ?? '',
        weight: h.weight?.toString() ?? '',
        notes: h.notes,
      }
    : EMPTY_DRAFT;

const ENERGY_LABELS = ['Agotado', 'Bajo', 'Normal', 'Bien', 'A tope'];

export function HealthForm() {
  const health = useTable('health_logs');
  const [date, setDate] = useState(today());
  const existing = health.rows.find((h) => h.date === date);
  const [form, setForm] = useState<HealthDraft>(EMPTY_DRAFT);

  useEffect(() => setForm(toDraft(existing)), [existing, date]);

  const set = (key: keyof HealthDraft) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const row = {
      date,
      sleep_hours: parseNum(form.sleep),
      energy: form.energy ? Number(form.energy) : null,
      exercise_minutes: parseNum(form.exercise),
      weight: parseNum(form.weight),
      notes: form.notes.trim(),
    };
    const ok = existing ? await health.update(existing.id, row) : await health.add(row);
    if (ok) toast('Registro de salud guardado');
  };

  return (
    <form onSubmit={save} className="stack">
      <label className="field">
        <span>Día</span>
        <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} />
      </label>
      <div className="field-row">
        <label className="field">
          <span>Sueño (horas)</span>
          <input inputMode="decimal" value={form.sleep} onChange={(e) => set('sleep')(e.target.value)} placeholder="7,5" />
        </label>
        <label className="field">
          <span>Ejercicio (min)</span>
          <input inputMode="numeric" value={form.exercise} onChange={(e) => set('exercise')(e.target.value)} placeholder="30" />
        </label>
        <label className="field">
          <span>Peso (kg)</span>
          <input inputMode="decimal" value={form.weight} onChange={(e) => set('weight')(e.target.value)} placeholder="Opcional" />
        </label>
      </div>
      <fieldset className="field">
        <legend>Energía</legend>
        <div className="segmented">
          {ENERGY_LABELS.map((label, i) => {
            const v = String(i + 1);
            return (
              <button key={v} type="button" aria-pressed={form.energy === v} onClick={() => set('energy')(form.energy === v ? '' : v)} title={label}>
                {v} <span className="small">{label}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
      <label className="field">
        <span>Notas</span>
        <textarea rows={2} value={form.notes} onChange={(e) => set('notes')(e.target.value)} placeholder="¿Cómo te has sentido?" />
      </label>
      <button className="btn primary">{existing ? 'Actualizar' : 'Guardar'}</button>
    </form>
  );
}

/** Registros de salud por día y los de los últimos 7 días. */
function useHealth() {
  const health = useTable('health_logs');
  const byDate = new Map(health.rows.map((h) => [h.date, h]));
  const week = lastDays(7)
    .map((d) => byDate.get(d))
    .filter((h): h is HealthLog => !!h);
  return { health, byDate, week };
}

const avg = (vals: (number | null)[]) => {
  const xs = vals.filter((v): v is number => v !== null && v !== undefined).map(Number);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
};

export function HealthAverages() {
  const { week } = useHealth();
  const sleep = avg(week.map((h) => h.sleep_hours));
  const energy = avg(week.map((h) => h.energy));
  return (
    <div className="stats stats-3">
      <Stat label="Sueño medio (7 d)" value={sleep === null ? '—' : `${num(sleep)} h`} />
      <Stat label="Energía media (7 d)" value={energy === null ? '—' : `${num(energy)} / 5`} />
      <Stat label="Ejercicio (7 d)" value={`${num(sumBy(week, (h) => h.exercise_minutes))} min`} />
    </div>
  );
}

function useHealthChart() {
  const { health, byDate } = useHealth();
  const chart = lastDays(14).map((d) => {
    const h = byDate.get(d);
    return { dia: fmtDay(d), Sueño: h?.sleep_hours ?? null, Energía: h?.energy ?? null, Ejercicio: h?.exercise_minutes ?? 0 };
  });
  return { chart, hasData: health.rows.length > 0 };
}

export function SleepChart() {
  const c = useChartColors();
  const { chart, hasData } = useHealthChart();
  if (!hasData) return <Empty>El gráfico aparecerá cuando registres algunos días.</Empty>;
  return (
    <div className="chart chart-fill">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chart} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis dataKey="dia" tick={{ fill: c.text, fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis yAxisId="h" domain={[0, 12]} tick={{ fill: c.text, fontSize: 11 }} />
          <YAxis yAxisId="e" orientation="right" domain={[0, 5]} hide />
          <Tooltip {...tooltipStyle(c)} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line yAxisId="h" type="monotone" dataKey="Sueño" unit=" h" stroke={c.c1} strokeWidth={2} connectNulls dot={{ r: 3 }} />
          <Line yAxisId="e" type="monotone" dataKey="Energía" unit=" / 5" stroke={c.c3} strokeWidth={2} connectNulls dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ExerciseChart() {
  const c = useChartColors();
  const { chart, hasData } = useHealthChart();
  if (!hasData) return <Empty>Sin datos todavía.</Empty>;
  return (
    <div className="chart chart-fill">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chart} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis dataKey="dia" tick={{ fill: c.text, fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis tick={{ fill: c.text, fontSize: 11 }} />
          <Tooltip {...tooltipStyle(c)} cursor={{ fill: c.grid, opacity: 0.4 }} />
          <Bar dataKey="Ejercicio" unit=" min" fill={c.c2} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HealthConsistency() {
  const { week } = useHealth();
  return (
    <>
      <Progress value={pct(week.length, 7)} label="Días registrados esta semana" />
      <p className="muted small">{week.length} de los últimos 7 días registrados</p>
    </>
  );
}
