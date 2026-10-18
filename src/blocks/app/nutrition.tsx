import { useMemo, useState, type FormEvent } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import FoodPicker from '../../components/FoodPicker';
import GoalsSheet from '../../components/GoalsSheet';
import { Empty, IconButton, Progress } from '../../components/ui';
import { dailySeries, dayTotals, mealAt, MEALS, numOrNull, remaining, weightSeries, weightStatus } from '../../lib/nutrition';
import { toast } from '../../lib/toast';
import type { Meal } from '../../lib/types';
import { tooltipStyle, useChartColors } from '../../lib/useChartColors';
import { useDayHealth, useGoals } from '../../lib/useNutrition';
import { useTable } from '../../lib/useTable';
import { addDays, eur, fmtDate, fmtDay, lastDays, num, parseNum, pct, today } from '../../lib/utils';
import { HeaderAction } from '../header';

const MARGIN = { top: 8, right: 8, left: -16, bottom: 0 };

/** Botón de los objetivos, en la cabecera del bloque. */
function GoalsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <HeaderAction>
        <button type="button" className="btn ghost sm" onClick={() => setOpen(true)}>
          🎯 Objetivos
        </button>
      </HeaderAction>
      {open && <GoalsSheet onClose={() => setOpen(false)} />}
    </>
  );
}

/** Anillo de progreso (SVG) con un texto en el centro. */
function Ring({ value, over, children }: { value: number; over?: boolean; children: React.ReactNode }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const v = Math.min(1, Math.max(0, value));
  return (
    <div className="ring">
      <svg viewBox="0 0 120 120" aria-hidden>
        <circle cx="60" cy="60" r={r} className="ring-track" />
        <circle cx="60" cy="60" r={r} className={`ring-value ${over ? 'is-over' : ''}`} strokeDasharray={`${c * v} ${c}`} transform="rotate(-90 60 60)" />
      </svg>
      <div className="ring-text">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------- Macros de hoy

/** Kcal y macros de hoy frente a los objetivos, y lo que queda. */
export function MacrosToday() {
  const logs = useTable('food_logs');
  const { goals } = useGoals();
  const day = today();
  const { total } = dayTotals(logs.rows, day);
  const left = remaining(total, goals);
  const over = left.kcal < 0;
  const macros = [
    { key: 'protein', label: 'Proteína', value: total.protein, goal: goals.protein_g, left: left.protein },
    { key: 'carbs', label: 'Hidratos', value: total.carbs, goal: goals.carbs_g, left: left.carbs },
    { key: 'fat', label: 'Grasa', value: total.fat, goal: goals.fat_g, left: left.fat },
  ];

  return (
    <div className="macros-today">
      <GoalsButton />
      <Ring value={total.kcal / goals.kcal} over={over}>
        <strong>{num(total.kcal)}</strong>
        <span className="muted small">de {num(goals.kcal)} kcal</span>
      </Ring>
      <div className="macros-side">
        <p className={`macros-left ${over ? 'text-danger' : ''}`}>
          {over ? `Te has pasado ${num(-left.kcal)} kcal` : total.kcal === 0 ? 'Aún no has apuntado nada hoy' : `Te quedan ${num(left.kcal)} kcal`}
        </p>
        <ul className="macro-bars">
          {macros.map((m) => (
            <li key={m.key} className={`macro-${m.key}`}>
              <div className="row between">
                <span className="small">{m.label}</span>
                <span className="small muted">
                  {num(m.value)} / {num(m.goal)} g
                </span>
              </div>
              <Progress value={pct(m.value, m.goal)} tone={m.value > m.goal * 1.1 ? 'danger' : undefined} label={`${m.label}: ${num(m.value)} de ${num(m.goal)} g`} />
            </li>
          ))}
        </ul>
        {left.protein > 0 && total.kcal > 0 && <p className="muted small">Te faltan {num(left.protein)} g de proteína.</p>}
        {total.cost > 0 && (
          <p className="muted small">
            Hoy has comido por {total.unpriced ? 'al menos ' : ''}
            {eur(total.cost)}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Diario de comidas

/** Lo que comes cada día, por comidas, con sus kcal, macros y coste. */
export function FoodDiary() {
  const logs = useTable('food_logs');
  const day0 = today();
  const [date, setDate] = useState(day0);
  const [adding, setAdding] = useState<Meal | null>(null);
  const { total, byMeal } = dayTotals(logs.rows, date);
  const own = logs.rows.filter((l) => l.date === date).sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));

  const copyYesterday = async (meal: Meal) => {
    const prev = logs.rows.filter((l) => l.date === addDays(date, -1) && l.meal === meal);
    for (const l of prev) {
      const { id: _id, user_id: _u, created_at: _c, ...rest } = l;
      await logs.add({ ...rest, date });
    }
    toast(`${prev.length} alimento${prev.length === 1 ? '' : 's'} copiado${prev.length === 1 ? '' : 's'} de ayer`);
  };

  return (
    <div className="stack diary">
      <HeaderAction>
        <span className="row week-nav">
          <IconButton label="Día anterior" onClick={() => setDate(addDays(date, -1))}>
            ←
          </IconButton>
          <button type="button" className="link-btn" onClick={() => setDate(day0)} disabled={date === day0}>
            {date === day0 ? 'Hoy' : fmtDay(date)}
          </button>
          <IconButton label="Día siguiente" onClick={() => setDate(addDays(date, 1))} disabled={date >= day0}>
            →
          </IconButton>
        </span>
      </HeaderAction>
      <p className="diary-total">
        <strong>{num(total.kcal)} kcal</strong>
        <span className="muted small">
          {' '}
          · P {num(total.protein)} g · H {num(total.carbs)} g · G {num(total.fat)} g{total.cost > 0 && ` · ${total.unpriced ? '≥ ' : ''}${eur(total.cost)}`}
        </span>
      </p>
      {MEALS.map((m) => {
        const items = own.filter((l) => l.meal === m.id);
        const sub = byMeal.get(m.id)!;
        const hadYesterday = items.length === 0 && logs.rows.some((l) => l.date === addDays(date, -1) && l.meal === m.id);
        if (m.id === 'otros' && items.length === 0) {
          return (
            <button key={m.id} type="button" className="link-btn small meal-add-other" onClick={() => setAdding('otros')}>
              ＋ Otros (picoteo, bebidas…)
            </button>
          );
        }
        return (
          <section key={m.id} className="meal">
            <header className="row between">
              <h3>
                {m.icon} {m.label}
                {sub.kcal > 0 && <span className="muted small"> · {num(sub.kcal)} kcal</span>}
              </h3>
              <span className="row">
                {hadYesterday && (
                  <button type="button" className="link-btn small" onClick={() => void copyYesterday(m.id)}>
                    Repetir ayer
                  </button>
                )}
                <button type="button" className="btn ghost sm" onClick={() => setAdding(m.id)} aria-label={`Añadir a ${m.label.toLowerCase()}`}>
                  ＋
                </button>
              </span>
            </header>
            {items.length > 0 && (
              <ul className="list meal-items">
                {items.map((l) => (
                  <li key={l.id}>
                    <span className="meal-item">
                      <span>{l.name}</span>
                      <span className="muted small">
                        {num(Number(l.grams))} g · P {num(Number(l.protein))} · H {num(Number(l.carbs))} · G {num(Number(l.fat))}
                        {numOrNull(l.cost) !== null && ` · ${eur(Number(l.cost))}`}
                      </span>
                    </span>
                    <span className="row">
                      <strong className="small">{num(Math.round(Number(l.kcal)))}</strong>
                      <IconButton label={`Quitar ${l.name}`} onClick={() => void logs.remove(l.id)}>
                        ✕
                      </IconButton>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      {adding && <FoodPicker date={date} meal={adding} onClose={() => setAdding(null)} />}
      {own.length === 0 && date === day0 && (
        <button type="button" className="btn primary" onClick={() => setAdding(mealAt(new Date().getHours() + new Date().getMinutes() / 60))}>
          ＋ Apuntar lo primero de hoy
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Agua

const GLASS = 250;

/** Contador de agua de hoy: un toque por vaso. */
export function WaterToday() {
  const { goals } = useGoals();
  const { log, set } = useDayHealth(today());
  const ml = log?.water_ml ?? 0;
  const add = (delta: number) => void set((current) => ({ water_ml: Math.max(0, Math.min(20000, (current?.water_ml ?? 0) + delta)) }));
  const glasses = Math.ceil(goals.water_ml / GLASS);
  const done = Math.floor(ml / GLASS);

  return (
    <div className="stack water">
      <div className="row between">
        <span>
          <strong className="score-value">{num(ml / 1000)}</strong> <span className="muted">de {num(goals.water_ml / 1000)} L</span>
        </span>
        {ml >= goals.water_ml && <span className="text-ok small">¡Objetivo cumplido! 💧</span>}
      </div>
      <div className="glasses" aria-label={`${done} de ${glasses} vasos`}>
        {Array.from({ length: Math.min(16, Math.max(glasses, done)) }, (_, i) => (
          <span key={i} className={`glass ${i < done ? 'is-full' : ''}`} aria-hidden>
            💧
          </span>
        ))}
      </div>
      <div className="row wrap">
        <button type="button" className="btn primary sm" onClick={() => add(GLASS)}>
          ＋ Vaso (250 ml)
        </button>
        <button type="button" className="btn ghost sm" onClick={() => add(500)}>
          ＋ Botella (500 ml)
        </button>
        <button type="button" className="btn ghost sm" onClick={() => add(-GLASS)} disabled={ml === 0}>
          − Vaso
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Pasos y kcal quemadas

/** Pasos y kcal quemadas de hoy (a mano; con la APK los traerá Health Connect). */
export function ActivityToday() {
  const { goals } = useGoals();
  const day = today();
  const { log, health, set } = useDayHealth(day);
  const [steps, setSteps] = useState('');
  const [kcal, setKcal] = useState('');
  const byDate = new Map(health.rows.map((h) => [h.date, h]));
  const week = lastDays(7, day).map((d) => ({ d, steps: byDate.get(d)?.steps ?? 0 }));
  const max = Math.max(goals.steps, ...week.map((w) => w.steps), 1);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const s = steps.trim() ? parseNum(steps) : null;
    const k = kcal.trim() ? parseNum(kcal) : null;
    if (steps.trim() && (s === null || s < 0 || s > 200000)) return toast('Los pasos son un número entre 0 y 200.000', 'error');
    if (kcal.trim() && (k === null || k < 0 || k > 20000)) return toast('Las kcal quemadas son un número entre 0 y 20.000', 'error');
    if (s === null && k === null) return;
    const patch = { ...(s !== null ? { steps: Math.round(s) } : {}), ...(k !== null ? { active_kcal: Math.round(k) } : {}) };
    if (await set(patch)) {
      setSteps('');
      setKcal('');
      toast('Actividad de hoy guardada');
    }
  };

  const todaySteps = log?.steps ?? 0;
  return (
    <div className="stack">
      <div className="stats stats-2">
        <div className="stat">
          <span className="stat-label">Pasos</span>
          <strong className="stat-value">{num(todaySteps)}</strong>
          <span className="stat-hint">de {num(goals.steps)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Kcal quemadas</span>
          <strong className="stat-value">{log?.active_kcal ? num(log.active_kcal) : '—'}</strong>
          <span className="stat-hint">en actividad</span>
        </div>
      </div>
      <Progress value={pct(todaySteps, goals.steps)} tone={todaySteps >= goals.steps ? 'ok' : undefined} label="Pasos de hoy frente al objetivo" />
      <div className="mini-bars" aria-label="Pasos de los últimos 7 días">
        {week.map((w) => (
          <span key={w.d} className="mini-bar" title={`${fmtDay(w.d)}: ${num(w.steps)} pasos`}>
            <span className={w.steps >= goals.steps ? 'is-ok' : ''} style={{ height: `${Math.max(4, (w.steps / max) * 100)}%` }} />
            <span className="muted small">{fmtDay(w.d).slice(0, 2)}</span>
          </span>
        ))}
      </div>
      <form className="inline-form wrap" onSubmit={save}>
        <input inputMode="numeric" value={steps} onChange={(e) => setSteps(e.target.value)} placeholder={todaySteps ? num(todaySteps) : 'Pasos: 8500'} aria-label="Pasos de hoy" />
        <input inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} placeholder="Kcal quemadas" aria-label="Kcal quemadas hoy" />
        <button className="btn ghost sm">Guardar</button>
      </form>
      <p className="muted small">De momento a mano. Con la app de Android se rellenará solo desde Health Connect.</p>
    </div>
  );
}

// ---------------------------------------------------------------- Peso

/** Registrar el peso y ver lo cerca que estás del objetivo, a qué ritmo y cuándo llegarías. */
export function WeightLog() {
  const health = useTable('health_logs');
  const { goals } = useGoals();
  const day = today();
  const { log, set } = useDayHealth(day);
  const [value, setValue] = useState('');
  const [editing, setEditing] = useState(false);
  const points = useMemo(() => weightSeries(health.rows), [health.rows]);
  const st = weightStatus(points, goals, day);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const w = parseNum(value);
    if (w === null || w < 20 || w > 400) return toast('Escribe tu peso en kg, por ejemplo 78,4', 'error');
    if (await set({ weight: Math.round(w * 10) / 10 })) {
      setValue('');
      toast(`Peso de hoy: ${num(w)} kg`);
    }
  };

  const rateText = st.rate === null ? null : `${st.rate > 0 ? '+' : ''}${num(st.rate)} kg/semana`;
  return (
    <div className="stack">
      <GoalsButton />
      <div className="weight-main">
        <span>
          <strong className="score-value">{st.current === null ? '—' : num(st.current)}</strong> <span className="muted">kg</span>
        </span>
        <span className="muted small">{st.last ? `media de 7 días · último: ${num(st.last.weight)} kg el ${fmtDate(st.last.date)}` : 'Apunta tu peso para empezar'}</span>
      </div>
      {st.target !== null && st.current !== null ? (
        <>
          <Progress value={st.progress * 100} tone={st.left === 0 ? 'ok' : undefined} label="Camino recorrido hacia el peso objetivo" />
          <p className="small">
            {st.left === 0 ? (
              <span className="text-ok">¡Has llegado a tu objetivo de {num(st.target)} kg! 🎉</span>
            ) : (
              <>
                Te faltan <strong>{num(st.left!)} kg</strong> para {num(st.target)} kg
                {st.onWay === true && st.eta && <> · a este ritmo ({rateText}) llegarías hacia el <strong>{fmtDate(st.eta)}</strong></>}
                {st.onWay === false && <span className="text-danger"> · vas en la dirección contraria ({rateText})</span>}
                {st.onWay === null && <span className="muted"> · registra unos días más para ver tu ritmo</span>}
              </>
            )}
          </p>
          {st.needed !== null && goals.weight_target_date && (
            <p className="muted small">
              Para llegar el {fmtDate(goals.weight_target_date)} necesitas {num(Math.abs(st.needed))} kg/semana
              {st.rate !== null && st.onWay ? (Math.abs(st.rate) >= Math.abs(st.needed) ? ': vas bien ✓' : ': vas algo lento') : ''}.
            </p>
          )}
        </>
      ) : (
        st.current !== null && (
          <button type="button" className="link-btn small" onClick={() => setEditing(true)}>
            Pon tu peso objetivo para ver cuánto te falta
          </button>
        )
      )}
      <form className="inline-form" onSubmit={save}>
        <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={log?.weight ? `Hoy: ${num(Number(log.weight))}` : 'Peso de hoy (kg)'} aria-label="Peso de hoy (kg)" className="num-input" />
        <button className="btn primary sm">Apuntar</button>
      </form>
      {editing && <GoalsSheet onClose={() => setEditing(false)} />}
    </div>
  );
}

/** Evolución del peso (cada registro y su media de 7 días) con la línea del objetivo. */
export function WeightChart() {
  const c = useChartColors();
  const health = useTable('health_logs');
  const { goals } = useGoals();
  const day = today();
  const points = useMemo(() => weightSeries(health.rows).filter((p) => p.date >= addDays(day, -89)), [health.rows, day]);
  const st = weightStatus(weightSeries(health.rows), goals, day);
  if (points.length < 2) return <Empty>{health.loading ? 'Cargando…' : 'Apunta tu peso unos días (bloque «Peso») y aquí verás su evolución.'}</Empty>;
  const target = st.target;
  const all = [...points.map((p) => p.weight), ...(target === null ? [] : [target])];
  const data = points.map((p) => ({ dia: fmtDate(p.date), Peso: p.weight, Media: p.avg }));
  return (
    <div className="chart-block">
      {st.left !== null && (
        <p className="muted small chart-caption">
          {st.left === 0 ? '¡Objetivo conseguido!' : `Faltan ${num(st.left)} kg`}
          {st.rate !== null && ` · ${st.rate > 0 ? '+' : ''}${num(st.rate)} kg/semana`}
        </p>
      )}
      <div className="chart chart-fill">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={MARGIN}>
            <CartesianGrid stroke={c.grid} vertical={false} />
            <XAxis dataKey="dia" tick={{ fill: c.text, fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis domain={[Math.floor(Math.min(...all) - 1), Math.ceil(Math.max(...all) + 1)]} tick={{ fill: c.text, fontSize: 11 }} />
            <Tooltip {...tooltipStyle(c)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {target !== null && <ReferenceLine y={target} stroke={c.c3} strokeDasharray="5 4" label={{ value: `Objetivo ${num(target)} kg`, fill: c.text, fontSize: 11, position: 'insideTopRight' }} />}
            <Line type="monotone" dataKey="Peso" unit=" kg" stroke={c.grid} strokeWidth={0} dot={{ r: 2.5, fill: c.text }} isAnimationActive={false} />
            <Line type="monotone" dataKey="Media" name="Media 7 días" unit=" kg" stroke={c.c1} strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Kcal y proteína de los últimos 14 días frente a los objetivos. */
export function MacrosChart() {
  const c = useChartColors();
  const logs = useTable('food_logs');
  const { goals } = useGoals();
  const days = lastDays(14);
  const series = dailySeries(logs.rows, days);
  const logged = series.filter((s) => s.totals);
  if (logged.length === 0) return <Empty>{logs.loading ? 'Cargando…' : 'Cuando apuntes comidas en el diario, aquí verás tus kcal y tu proteína de cada día.'}</Empty>;
  const data = series.map((s) => ({ dia: fmtDay(s.date), Kcal: s.totals?.kcal ?? null, Proteína: s.totals?.protein ?? null }));
  const avg = Math.round(logged.reduce((a, s) => a + s.totals!.kcal, 0) / logged.length);
  const avgP = Math.round(logged.reduce((a, s) => a + s.totals!.protein, 0) / logged.length);
  return (
    <div className="chart-block">
      <p className="muted small chart-caption">
        Media de los días apuntados: {num(avg)} kcal ({num(Math.abs(avg - goals.kcal))} {avg > goals.kcal ? 'por encima' : 'por debajo'} de tu objetivo) y {num(avgP)} g de proteína ·{' '}
        {logged.length} de 14 días
      </p>
      <div className="chart chart-fill">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={MARGIN}>
            <CartesianGrid stroke={c.grid} vertical={false} />
            <XAxis dataKey="dia" tick={{ fill: c.text, fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis yAxisId="k" tick={{ fill: c.text, fontSize: 11 }} />
            <YAxis yAxisId="p" orientation="right" hide domain={[0, Math.max(goals.protein_g * 1.6, 10)]} />
            <Tooltip {...tooltipStyle(c)} cursor={{ fill: c.grid, opacity: 0.4 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine yAxisId="k" y={goals.kcal} stroke={c.c3} strokeDasharray="5 4" />
            <Bar yAxisId="k" dataKey="Kcal" unit=" kcal" fill={c.c1} radius={[4, 4, 0, 0]} />
            <Line yAxisId="p" type="monotone" dataKey="Proteína" unit=" g" stroke={c.c2} strokeWidth={2} connectNulls dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
