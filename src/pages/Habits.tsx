import { useEffect, useState, type FormEvent } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, confirmDelete, Empty, IconButton, Progress, Stat } from '../components/ui';
import { toast } from '../lib/toast';
import type { HealthLog } from '../lib/types';
import { tooltipStyle, useChartColors } from '../lib/useChartColors';
import { useHabits } from '../lib/useHabits';
import { useTable } from '../lib/useTable';
import { fmtDay, lastDays, num, parseNum, pct, sumBy, today } from '../lib/utils';

export default function Habits() {
  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1>Hábitos y salud</h1>
      </div>
      <HabitTracker />
      <HealthTracker />
    </div>
  );
}

function HabitTracker() {
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
    <Card
      title="Hábitos · últimos 7 días"
      action={<span className="muted small">{pct(doneThisWeek, active.length * days.length)} % cumplido</span>}
    >
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
                        <button
                          className={`cell ${done ? 'on' : ''}`}
                          aria-pressed={done}
                          aria-label={`${h.name}, ${fmtDay(d)}`}
                          onClick={() => void toggle(h.id, d)}
                        >
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
    </Card>
  );
}

interface HealthForm {
  sleep: string;
  energy: string;
  exercise: string;
  weight: string;
  notes: string;
}

const EMPTY_FORM: HealthForm = { sleep: '', energy: '', exercise: '', weight: '', notes: '' };

const toForm = (h: HealthLog | undefined): HealthForm =>
  h
    ? {
        sleep: h.sleep_hours?.toString() ?? '',
        energy: h.energy?.toString() ?? '',
        exercise: h.exercise_minutes?.toString() ?? '',
        weight: h.weight?.toString() ?? '',
        notes: h.notes,
      }
    : EMPTY_FORM;

const ENERGY_LABELS = ['Agotado', 'Bajo', 'Normal', 'Bien', 'A tope'];

function HealthTracker() {
  const health = useTable('health_logs');
  const c = useChartColors();
  const [date, setDate] = useState(today());
  const existing = health.rows.find((h) => h.date === date);
  const [form, setForm] = useState<HealthForm>(EMPTY_FORM);

  useEffect(() => setForm(toForm(existing)), [existing, date]);

  const set = (key: keyof HealthForm) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

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

  const byDate = new Map(health.rows.map((h) => [h.date, h]));
  const week = lastDays(7).map((d) => byDate.get(d)).filter((h): h is HealthLog => !!h);
  const avg = (vals: (number | null)[]) => {
    const xs = vals.filter((v): v is number => v !== null && v !== undefined).map(Number);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  const avgSleep = avg(week.map((h) => h.sleep_hours));
  const avgEnergy = avg(week.map((h) => h.energy));
  const exerciseWeek = sumBy(week, (h) => h.exercise_minutes);

  const chart = lastDays(14).map((d) => {
    const h = byDate.get(d);
    return {
      dia: fmtDay(d),
      Sueño: h?.sleep_hours ?? null,
      Energía: h?.energy ?? null,
      Ejercicio: h?.exercise_minutes ?? 0,
    };
  });
  const hasData = health.rows.length > 0;

  return (
    <div className="grid-2">
      <Card title="Registro diario de salud">
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
                  <button
                    key={v}
                    type="button"
                    aria-pressed={form.energy === v}
                    onClick={() => set('energy')(form.energy === v ? '' : v)}
                    title={label}
                  >
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
      </Card>

      <div className="stack">
        <div className="stats stats-3">
          <Stat label="Sueño medio (7 d)" value={avgSleep === null ? '—' : `${num(avgSleep)} h`} />
          <Stat label="Energía media (7 d)" value={avgEnergy === null ? '—' : `${num(avgEnergy)} / 5`} />
          <Stat label="Ejercicio (7 d)" value={`${num(exerciseWeek)} min`} />
        </div>
        <Card title="Sueño y energía · 14 días">
          {!hasData ? (
            <Empty>Los gráficos aparecerán cuando registres algunos días.</Empty>
          ) : (
            <div className="chart">
              <ResponsiveContainer width="100%" height={220}>
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
          )}
        </Card>
        <Card title="Ejercicio · 14 días">
          {!hasData ? (
            <Empty>Sin datos todavía.</Empty>
          ) : (
            <div className="chart">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chart} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke={c.grid} vertical={false} />
                  <XAxis dataKey="dia" tick={{ fill: c.text, fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: c.text, fontSize: 11 }} />
                  <Tooltip {...tooltipStyle(c)} cursor={{ fill: c.grid, opacity: 0.4 }} />
                  <Bar dataKey="Ejercicio" unit=" min" fill={c.c2} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
        <Card title="Constancia del registro">
          <Progress value={pct(week.length, 7)} label="Días registrados esta semana" />
          <p className="muted small">{week.length} de los últimos 7 días registrados</p>
        </Card>
      </div>
    </div>
  );
}
