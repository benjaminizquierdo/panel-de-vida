import { useMemo, useState, type FormEvent } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Empty, Progress } from '../../components/ui';
import { filterValue } from '../../lib/blockKinds';
import { categoryPath, inCategory, topLevelId } from '../../lib/categories';
import { monthsLeft, spendingPace, subscriptions, upcomingCharges } from '../../lib/insights';
import { usePageMonth } from '../../lib/pageContext';
import { FREQUENCY_LABEL } from '../../lib/recurring';
import { toast } from '../../lib/toast';
import { tooltipStyle, useChartColors } from '../../lib/useChartColors';
import { useTable } from '../../lib/useTable';
import { addDays, eur, fmtDate, fmtMonth, monthKey, parseNum, pct, sumBy, today } from '../../lib/utils';
import type { BlockProps } from '..';

/** Cargos e ingresos periódicos de los próximos 30 días. */
export function UpcomingCharges() {
  const day = today();
  const recurring = useTable('recurring_transactions');
  const list = upcomingCharges(recurring.rows, day, addDays(day, 30));
  const out = sumBy(list.filter((c) => c.rule.type === 'gasto'), (c) => c.rule.amount);
  const income = sumBy(list.filter((c) => c.rule.type === 'ingreso'), (c) => c.rule.amount);

  if (list.length === 0) return <Empty>{recurring.loading ? 'Cargando…' : 'No hay cargos periódicos en los próximos 30 días. Crea tus suscripciones, alquiler o nómina en Finanzas › Periódicos.'}</Empty>;
  return (
    <>
      <ul className="list">
        {list.map((c) => (
          <li key={`${c.rule.id}${c.date}`}>
            <span>
              {c.rule.note}
              <span className="muted small"> · {c.date === day ? 'hoy' : c.date === addDays(day, 1) ? 'mañana' : fmtDate(c.date)}</span>
            </span>
            <span className={`tx-amount ${c.rule.type}`}>
              {c.rule.type === 'gasto' ? '−' : '+'}
              {eur(Number(c.rule.amount))}
            </span>
          </li>
        ))}
      </ul>
      <p className="small muted">
        En 30 días: <strong className="tx-amount gasto">−{eur(out)}</strong>
        {income > 0 && (
          <>
            {' '}
            y <strong className="tx-amount ingreso">+{eur(income)}</strong>
          </>
        )}
      </p>
    </>
  );
}

/** Gastos periódicos activos: cuánto cuestan al mes y al año. */
export function Subscriptions() {
  const recurring = useTable('recurring_transactions');
  const { items, monthly, yearly } = subscriptions(recurring.rows);
  if (items.length === 0) return <Empty>{recurring.loading ? 'Cargando…' : 'Sin gastos periódicos activos todavía.'}</Empty>;
  const top = items[0];
  return (
    <>
      <div className="stats stats-2">
        <div className="stat">
          <span className="stat-label">Al mes</span>
          <strong className="stat-value">{eur(monthly)}</strong>
        </div>
        <div className="stat">
          <span className="stat-label">Al año</span>
          <strong className="stat-value">{eur(yearly)}</strong>
        </div>
      </div>
      <ul className="list">
        {items.map((i) => (
          <li key={i.rule.id}>
            <span>
              {i.rule.note}
              <span className="muted small"> · {FREQUENCY_LABEL[i.rule.frequency].toLowerCase()}</span>
            </span>
            <span className="small">
              {eur(i.monthly)}/mes <span className="muted">· {eur(i.yearly)}/año</span>
            </span>
          </li>
        ))}
      </ul>
      {items.length > 1 && (
        <p className="muted small">
          La más cara es «{top.rule.note}»: {pct(top.monthly, monthly)} % del total. Quitarla te ahorraría {eur(top.yearly)} al año.
        </p>
      )}
    </>
  );
}

/** Previsión del gasto del mes frente al presupuesto. */
export function SpendingPace({ block }: BlockProps) {
  const day = today();
  const txs = useTable('transactions');
  const recurring = useTable('recurring_transactions');
  const budgets = useTable('budgets');
  const categories = useTable('finance_categories');
  const filter = filterValue(block.content, 'category');
  const byId = useMemo(() => new Map(categories.rows.map((c) => [c.id, c])), [categories.rows]);
  const matches = inCategory(byId, filter);
  const pace = spendingPace({ transactions: txs.rows, rules: recurring.rows, day, matches: filter ? matches : undefined });
  const budget = filter
    ? sumBy(budgets.rows.filter((b) => b.category_id === filter), (b) => b.monthly_limit)
    : sumBy(budgets.rows, (b) => b.monthly_limit);
  const ratio = budget > 0 ? pace.projected / budget : null;

  if (txs.loading) return <Empty>Cargando…</Empty>;
  return (
    <div className="stack">
      {filter && <p className="muted small">Solo {categoryPath(byId, filter)}</p>}
      <div className="row between">
        <span className="muted small">
          Llevas <strong>{eur(pace.spent)}</strong> (día {pace.elapsed} de {pace.total})
        </span>
      </div>
      <p className={`pace-forecast ${ratio === null ? '' : ratio > 1 ? 'text-danger' : 'text-ok'}`}>
        A este ritmo acabarás el mes en <strong>{eur(pace.projected)}</strong>
        {budget > 0 && <> de {eur(budget)}</>}
      </p>
      {budget > 0 && <Progress value={(pace.spent / budget) * 100} tone={ratio !== null && ratio > 1 ? 'danger' : undefined} label="Gastado frente al presupuesto" />}
      <p className="muted small">
        {ratio === null
          ? 'Ponle un presupuesto (bloque «Presupuesto por categoría») para saber si llegas.'
          : ratio > 1
            ? `Te pasarías ${eur(pace.projected - budget)}. Para llegar justo, gasta como mucho ${eur(Math.max(0, (budget - pace.spent - pace.pendingFixed) / Math.max(1, pace.total - pace.elapsed)))} al día lo que queda de mes.`
            : `Te sobrarían ${eur(budget - pace.projected)}.`}
        {pace.pendingFixed > 0 && ` Incluye ${eur(pace.pendingFixed)} de cargos fijos que faltan por cobrar.`}
      </p>
    </div>
  );
}

/** Gasto del mes de la página por categoría principal, en un gráfico circular. */
export function CategoryDonut() {
  const { month } = usePageMonth();
  const txs = useTable('transactions');
  const categories = useTable('finance_categories');
  const c = useChartColors();
  const byId = useMemo(() => new Map(categories.rows.map((cat) => [cat.id, cat])), [categories.rows]);
  const totals = new Map<string, number>();
  for (const t of txs.rows) {
    if (t.type !== 'gasto' || monthKey(t.date) !== month) continue;
    const top = topLevelId(byId, t.category_id);
    totals.set(top, (totals.get(top) ?? 0) + Number(t.amount));
  }
  const total = [...totals.values()].reduce((a, b) => a + b, 0);
  const data = [...totals.entries()]
    .map(([id, value]) => ({ id, name: byId.get(id)?.name ?? 'Sin categoría', icon: byId.get(id)?.icon ?? '🏷️', color: byId.get(id)?.color ?? '#64748b', value }))
    .sort((a, b) => b.value - a.value);

  if (data.length === 0) return <Empty>{txs.loading ? 'Cargando…' : `Sin gastos en ${fmtMonth(month).toLowerCase()}.`}</Empty>;
  return (
    <div className="donut">
      <div className="chart chart-fill donut-chart">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="92%" paddingAngle={1} stroke="none" animationDuration={500}>
              {data.map((d) => (
                <Cell key={d.id} fill={d.color} />
              ))}
            </Pie>
            <Tooltip {...tooltipStyle(c)} formatter={(v) => eur(Number(v))} />
          </PieChart>
        </ResponsiveContainer>
        <span className="donut-total">
          <strong>{eur(total)}</strong>
          <span className="muted small">{fmtMonth(month)}</span>
        </span>
      </div>
      <ul className="donut-legend small">
        {data.slice(0, 6).map((d) => (
          <li key={d.id}>
            <span className="dot" style={{ background: d.color }} /> {d.icon} {d.name}
            <span className="muted">
              {' '}
              {eur(d.value)} · {pct(d.value, total)} %
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Hucha: un objetivo de ahorro con aportaciones y lo que hay que apartar al mes. */
export function SavingsJar({ block }: BlockProps) {
  const goals = useTable('goals');
  const chosen = filterValue(block.content, 'goal');
  const savings = goals.rows.filter((g) => g.unit.trim() === '€' || g.area === 'finanzas');
  const goal = savings.find((g) => g.id === chosen) ?? savings[0];
  const [amount, setAmount] = useState('');

  if (!goal) return <Empty>{goals.loading ? 'Cargando…' : 'Crea un objetivo con unidad «€» (por ejemplo, «Fondo de emergencia») y aparecerá aquí.'}</Empty>;
  const current = Number(goal.current);
  const target = Number(goal.target);
  const left = Math.max(0, target - current);
  const perMonth = goal.due_date ? left / monthsLeft(goal.due_date, today()) : null;

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const n = parseNum(amount);
    if (n === null || n === 0) return toast('Escribe cuánto apartas (o un número negativo si sacas)', 'error');
    if (await goals.update(goal.id, { current: Math.max(0, Math.round((current + n) * 100) / 100) })) {
      setAmount('');
      toast(n > 0 ? `+${eur(n)} en «${goal.title}»` : `${eur(n)} de «${goal.title}»`);
    }
  };

  return (
    <div className="stack">
      <div className="row between">
        <strong>🐷 {goal.title}</strong>
        <span className="muted small">{pct(current, target)} %</span>
      </div>
      <Progress value={pct(current, target)} tone={current >= target ? 'ok' : undefined} label={`Ahorro de ${goal.title}`} />
      <p className="small">
        {eur(current)} de {eur(target)}
        {left > 0 ? (
          <span className="muted">
            {' '}
            · faltan {eur(left)}
            {perMonth !== null && ` · aparta ${eur(perMonth)} al mes para llegar el ${fmtDate(goal.due_date!)}`}
          </span>
        ) : (
          <span className="text-ok"> · ¡conseguido! 🎉</span>
        )}
      </p>
      <form onSubmit={add} className="inline-form">
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50" aria-label={`Aportar a ${goal.title} (€)`} />
        <button className="btn primary">Aportar</button>
      </form>
      {!chosen && savings.length > 1 && <p className="muted small">Elige otro objetivo en ⚙.</p>}
    </div>
  );
}
