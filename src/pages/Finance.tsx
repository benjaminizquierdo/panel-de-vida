import { useEffect, useState, type FormEvent } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, confirmDelete, Empty, IconButton, Progress, Stat } from '../components/ui';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../lib/defaults';
import { toast } from '../lib/toast';
import type { Budget, NewRow, TxType } from '../lib/types';
import { tooltipStyle, useChartColors } from '../lib/useChartColors';
import { useTable } from '../lib/useTable';
import { addMonths, eur, fmtDate, fmtMonth, fmtMonthShort, monthKey, parseNum, pct, sumBy, today } from '../lib/utils';

export default function Finance() {
  const txs = useTable('transactions');
  const budgets = useTable('budgets');
  const c = useChartColors();
  const currentMonth = monthKey(today());
  const [month, setMonth] = useState(currentMonth);

  const monthTx = txs.rows
    .filter((t) => monthKey(t.date) === month)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  const expenses = monthTx.filter((t) => t.type === 'gasto');
  const income = sumBy(monthTx.filter((t) => t.type === 'ingreso'), (t) => t.amount);
  const spent = sumBy(expenses, (t) => t.amount);
  const budgetTotal = sumBy(budgets.rows, (b) => b.monthly_limit);

  const spentBy = new Map<string, number>();
  for (const t of expenses) spentBy.set(t.category, (spentBy.get(t.category) ?? 0) + Number(t.amount));

  // Categorías con presupuesto + las que tienen gasto pero no presupuesto.
  const budgetRows: { category: string; budget?: Budget; spent: number }[] = [
    ...budgets.rows.map((b) => ({ category: b.category, budget: b, spent: spentBy.get(b.category) ?? 0 })),
    ...[...spentBy.keys()]
      .filter((cat) => !budgets.rows.some((b) => b.category === cat))
      .map((cat) => ({ category: cat, spent: spentBy.get(cat) ?? 0 })),
  ];

  const chart = Array.from({ length: 6 }, (_, i) => addMonths(currentMonth, i - 5)).map((key) => {
    const rows = txs.rows.filter((t) => monthKey(t.date) === key);
    return {
      mes: fmtMonthShort(key),
      Ingresos: sumBy(rows.filter((t) => t.type === 'ingreso'), (t) => t.amount),
      Gastos: sumBy(rows.filter((t) => t.type === 'gasto'), (t) => t.amount),
    };
  });

  const saveLimit = (category: string, budget: Budget | undefined, value: number) => {
    if (budget) void budgets.update(budget.id, { monthly_limit: value });
    else void budgets.add({ category, monthly_limit: value });
  };

  const balance = income - spent;

  return (
    <div className="stack-lg">
      <div className="page-head row between">
        <h1>Finanzas</h1>
        <div className="row">
          <IconButton label="Mes anterior" onClick={() => setMonth(addMonths(month, -1))}>
            ←
          </IconButton>
          <strong className="month-label">{fmtMonth(month)}</strong>
          <IconButton label="Mes siguiente" onClick={() => setMonth(addMonths(month, 1))} disabled={month >= currentMonth}>
            →
          </IconButton>
        </div>
      </div>

      <div className="stats stats-3">
        <Stat label="Ingresos" value={eur(income)} />
        <Stat
          label="Gastos"
          value={eur(spent)}
          hint={budgetTotal > 0 ? `${pct(spent, budgetTotal)} % del presupuesto (${eur(budgetTotal)})` : undefined}
          tone={budgetTotal > 0 && spent > budgetTotal ? 'danger' : undefined}
        />
        <Stat
          label="Balance"
          value={eur(balance)}
          hint={income > 0 ? `Ahorro: ${pct(Math.max(0, balance), income)} % de los ingresos` : undefined}
          tone={balance < 0 ? 'danger' : balance > 0 ? 'ok' : undefined}
        />
      </div>

      <div className="grid-sidebar">
        <div className="stack">
          <NewTransaction onAdd={txs.add} />
          <Card title="Presupuesto por categoría">
            {budgetRows.length === 0 ? (
              <Empty>Sin categorías todavía.</Empty>
            ) : (
              <ul className="budget-list">
                {budgetRows.map((r) => (
                  <BudgetRow
                    key={r.category}
                    category={r.category}
                    limit={r.budget ? Number(r.budget.monthly_limit) : 0}
                    spent={r.spent}
                    onSave={(v) => saveLimit(r.category, r.budget, v)}
                  />
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="stack">
          <Card title="Últimos 6 meses">
            <div className="chart">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chart} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={c.grid} vertical={false} />
                  <XAxis dataKey="mes" tick={{ fill: c.text, fontSize: 12 }} />
                  <YAxis tick={{ fill: c.text, fontSize: 11 }} tickFormatter={(v: number) => `${Math.round(v)} €`} width={64} />
                  <Tooltip {...tooltipStyle(c)} formatter={(v) => eur(Number(v))} cursor={{ fill: c.grid, opacity: 0.4 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Ingresos" fill={c.c2} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Gastos" fill={c.c1} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title={`Movimientos de ${fmtMonth(month)}`}>
            {monthTx.length === 0 ? (
              <Empty>{txs.loading ? 'Cargando…' : 'No hay movimientos este mes.'}</Empty>
            ) : (
              <ul className="tx-list">
                {monthTx.map((t) => (
                  <li key={t.id}>
                    <span className="tx-date muted">{fmtDate(t.date)}</span>
                    <span className="tx-desc">
                      <strong>{t.category}</strong>
                      {t.note && <span className="muted"> · {t.note}</span>}
                    </span>
                    <span className={`tx-amount ${t.type}`}>
                      {t.type === 'gasto' ? '−' : '+'}
                      {eur(Number(t.amount))}
                    </span>
                    <IconButton
                      label="Eliminar movimiento"
                      danger
                      onClick={() => {
                        if (confirmDelete(`este movimiento de ${eur(Number(t.amount))}`)) void txs.remove(t.id);
                      }}
                    >
                      ✕
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function NewTransaction({ onAdd }: { onAdd: (t: NewRow<'transactions'>) => Promise<unknown> }) {
  const [type, setType] = useState<TxType>('gasto');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');

  const categories = type === 'gasto' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  const changeType = (t: TxType) => {
    setType(t);
    setCategory((t === 'gasto' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES)[0]);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = parseNum(amount);
    if (value === null || value <= 0) {
      toast('El importe tiene que ser mayor que 0', 'error');
      return;
    }
    const created = await onAdd({ type, amount: Math.round(value * 100) / 100, category, date, note: note.trim() });
    if (created) {
      setAmount('');
      setNote('');
    }
  };

  return (
    <Card title="Nuevo movimiento">
      <form onSubmit={submit} className="stack">
        <div className="segmented">
          <button type="button" aria-pressed={type === 'gasto'} onClick={() => changeType('gasto')}>
            Gasto
          </button>
          <button type="button" aria-pressed={type === 'ingreso'} onClick={() => changeType('ingreso')}>
            Ingreso
          </button>
        </div>
        <div className="field-row">
          <label className="field">
            <span>Importe (€)</span>
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" required />
          </label>
          <label className="field">
            <span>Fecha</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value || today())} />
          </label>
        </div>
        <label className="field">
          <span>Categoría</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((cat) => (
              <option key={cat}>{cat}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Nota</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" />
        </label>
        <button className="btn primary">Añadir {type}</button>
      </form>
    </Card>
  );
}

function BudgetRow({ category, limit, spent, onSave }: {
  category: string;
  limit: number;
  spent: number;
  onSave: (value: number) => void;
}) {
  const [value, setValue] = useState(limit ? String(limit) : '');
  useEffect(() => setValue(limit ? String(limit) : ''), [limit]);

  const commit = () => {
    const n = parseNum(value) ?? 0;
    if (n < 0) {
      toast('El presupuesto no puede ser negativo', 'error');
      return;
    }
    if (n !== limit) onSave(n);
  };

  const over = limit > 0 && spent > limit;

  return (
    <li className="budget">
      <div className="row between">
        <strong>{category}</strong>
        <span className={`small ${over ? 'text-danger' : 'muted'}`}>
          {eur(spent)}
          {limit > 0 ? ` de ${eur(limit)}` : ' · sin presupuesto'}
        </span>
      </div>
      <div className="row">
        <Progress value={limit > 0 ? (spent / limit) * 100 : 0} tone={over ? 'danger' : undefined} label={`Presupuesto de ${category}`} />
        <input
          className="num-input"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          placeholder="—"
          aria-label={`Límite mensual de ${category}`}
        />
      </div>
    </li>
  );
}
