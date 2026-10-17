import { useEffect, useId, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, confirmDelete, Empty, IconButton, Progress, Stat } from '../components/ui';
import { categoryOptions, categoryPath, categoryTree, topLevelId } from '../lib/categories';
import { toast } from '../lib/toast';
import type { Budget, FinanceCategory, NewRow, TxType } from '../lib/types';
import { tooltipStyle, useChartColors } from '../lib/useChartColors';
import { useTable } from '../lib/useTable';
import { addMonths, eur, fmtDate, fmtMonth, fmtMonthShort, monthKey, parseNum, pct, sumBy, today } from '../lib/utils';
import FinanceCategories from './FinanceCategories';

type View = 'resumen' | 'categorias';

export default function Finance() {
  const [view, setView] = useState<View>('resumen');
  const txs = useTable('transactions');
  const budgets = useTable('budgets');
  const categories = useTable('finance_categories');
  const c = useChartColors();
  const currentMonth = monthKey(today());
  const [month, setMonth] = useState(currentMonth);

  const byId = useMemo(() => new Map(categories.rows.map((cat) => [cat.id, cat])), [categories.rows]);

  const monthTx = txs.rows
    .filter((t) => monthKey(t.date) === month)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  const expenses = monthTx.filter((t) => t.type === 'gasto');
  const income = sumBy(monthTx.filter((t) => t.type === 'ingreso'), (t) => t.amount);
  const spent = sumBy(expenses, (t) => t.amount);

  // Gasto por categoría exacta y acumulado por categoría principal (incluye sus subcategorías).
  const spentByCategory = new Map<string, number>();
  const spentByTop = new Map<string, number>();
  for (const t of expenses) {
    const amount = Number(t.amount);
    spentByCategory.set(t.category_id, (spentByCategory.get(t.category_id) ?? 0) + amount);
    const top = topLevelId(byId, t.category_id);
    spentByTop.set(top, (spentByTop.get(top) ?? 0) + amount);
  }

  const budgetFor = (id: string) => budgets.rows.find((b) => b.category_id === id);
  const budgetRows = [
    ...categoryTree(categories.rows, 'gasto'),
    // Archivadas que aún tienen gasto este mes: se siguen mostrando para que el total cuadre.
    ...categoryTree(categories.rows, 'gasto', true).filter((cat) => cat.archived && spentByTop.has(cat.id)),
  ].map((cat) => ({ cat, budget: budgetFor(cat.id), spent: spentByTop.get(cat.id) ?? 0 }));
  const budgetTotal = sumBy(budgetRows, (r) => r.budget?.monthly_limit ?? 0);

  const chart = Array.from({ length: 6 }, (_, i) => addMonths(currentMonth, i - 5)).map((key) => {
    const rows = txs.rows.filter((t) => monthKey(t.date) === key);
    return {
      mes: fmtMonthShort(key),
      Ingresos: sumBy(rows.filter((t) => t.type === 'ingreso'), (t) => t.amount),
      Gastos: sumBy(rows.filter((t) => t.type === 'gasto'), (t) => t.amount),
    };
  });

  const saveLimit = (categoryId: string, budget: Budget | undefined, value: number) => {
    if (budget) void budgets.update(budget.id, { monthly_limit: value });
    else void budgets.add({ category_id: categoryId, monthly_limit: value });
  };

  const balance = income - spent;

  return (
    <div className="stack-lg">
      <div className="page-head row between">
        <h1>Finanzas</h1>
        <div className="segmented page-switch" role="tablist" aria-label="Vista de finanzas">
          <button type="button" role="tab" aria-selected={view === 'resumen'} onClick={() => setView('resumen')}>
            Resumen
          </button>
          <button type="button" role="tab" aria-selected={view === 'categorias'} onClick={() => setView('categorias')}>
            Categorías
          </button>
        </div>
      </div>

      {view === 'categorias' ? (
        <FinanceCategories categories={categories} transactions={txs.rows} />
      ) : (
        <>
          <div className="row month-nav">
            <IconButton label="Mes anterior" onClick={() => setMonth(addMonths(month, -1))}>
              ←
            </IconButton>
            <strong className="month-label">{fmtMonth(month)}</strong>
            <IconButton label="Mes siguiente" onClick={() => setMonth(addMonths(month, 1))} disabled={month >= currentMonth}>
              →
            </IconButton>
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
              <NewTransaction categories={categories.rows} onAdd={txs.add} onManage={() => setView('categorias')} />
              <Card title="Presupuesto por categoría">
                {budgetRows.length === 0 ? (
                  <Empty>{categories.loading ? 'Cargando…' : 'Sin categorías de gasto todavía.'}</Empty>
                ) : (
                  <ul className="budget-list">
                    {budgetRows.map((r) => (
                      <BudgetRow
                        key={r.cat.id}
                        category={r.cat}
                        limit={r.budget ? Number(r.budget.monthly_limit) : 0}
                        spent={r.spent}
                        breakdown={r.cat.children
                          .filter((child) => spentByCategory.has(child.id))
                          .map((child) => `${child.icon} ${child.name} ${eur(spentByCategory.get(child.id)!)}`)}
                        onSave={(v) => saveLimit(r.cat.id, r.budget, v)}
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
                    {monthTx.map((t) => {
                      const cat = byId.get(t.category_id);
                      return (
                        <li key={t.id}>
                          <span className="tx-date muted">{fmtDate(t.date)}</span>
                          <span className="tx-desc">
                            <span className="cat-chip" style={{ '--cat': cat?.color ?? '#64748b' } as CSSProperties} aria-hidden>
                              {cat?.icon ?? '🏷️'}
                            </span>
                            <strong>{categoryPath(byId, t.category_id)}</strong>
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
                      );
                    })}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function NewTransaction({ categories, onAdd, onManage }: {
  categories: FinanceCategory[];
  onAdd: (t: NewRow<'transactions'>) => Promise<unknown>;
  onManage: () => void;
}) {
  const [type, setType] = useState<TxType>('gasto');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const selectId = useId();

  const options = categoryOptions(categories, type);
  // Si la elegida ya no vale (cambio de tipo, archivada, aún sin cargar), se usa la primera.
  const selected = options.some((o) => o.id === categoryId) ? categoryId : (options[0]?.id ?? '');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = parseNum(amount);
    if (value === null || value <= 0) {
      toast('El importe tiene que ser mayor que 0', 'error');
      return;
    }
    if (!selected) {
      toast(`Crea antes una categoría de ${type === 'gasto' ? 'gastos' : 'ingresos'}`, 'error');
      return;
    }
    const created = await onAdd({ type, amount: Math.round(value * 100) / 100, category_id: selected, date, note: note.trim() });
    if (created) {
      setAmount('');
      setNote('');
    }
  };

  return (
    <Card title="Nuevo movimiento">
      <form onSubmit={submit} className="stack">
        <div className="segmented">
          <button type="button" aria-pressed={type === 'gasto'} onClick={() => setType('gasto')}>
            Gasto
          </button>
          <button type="button" aria-pressed={type === 'ingreso'} onClick={() => setType('ingreso')}>
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
        {/* El botón va fuera del <label>: dentro, la etiqueta apuntaría al botón y no al selector. */}
        <div className="field">
          <span className="row between">
            <label htmlFor={selectId}>Categoría</label>
            <button type="button" className="link-btn" onClick={onManage}>
              Gestionar
            </button>
          </span>
          <select id={selectId} value={selected} onChange={(e) => setCategoryId(e.target.value)}>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <label className="field">
          <span>Nota</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" />
        </label>
        <button className="btn primary">Añadir {type}</button>
      </form>
    </Card>
  );
}

function BudgetRow({ category, limit, spent, breakdown, onSave }: {
  category: FinanceCategory;
  limit: number;
  spent: number;
  breakdown: string[];
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
        <strong>
          <span aria-hidden>{category.icon}</span> {category.name}
          {category.archived && <span className="muted small"> (archivada)</span>}
        </strong>
        <span className={`small ${over ? 'text-danger' : 'muted'}`}>
          {eur(spent)}
          {limit > 0 ? ` de ${eur(limit)}` : ' · sin presupuesto'}
        </span>
      </div>
      <div className="row">
        <Progress value={limit > 0 ? (spent / limit) * 100 : 0} tone={over ? 'danger' : undefined} label={`Presupuesto de ${category.name}`} />
        <input
          className="num-input"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          placeholder="—"
          aria-label={`Límite mensual de ${category.name}`}
        />
      </div>
      {breakdown.length > 0 && <p className="muted small">{breakdown.join(' · ')}</p>}
    </li>
  );
}
