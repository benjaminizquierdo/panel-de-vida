import { useEffect, useId, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { confirmDelete, Empty, IconButton, Progress, Stat } from '../../components/ui';
import { categoryOptions, categoryPath, categoryTree, topLevelId } from '../../lib/categories';
import { useNav, usePageMonth } from '../../lib/pageContext';
import { FREQUENCY_LABEL } from '../../lib/recurring';
import { toast } from '../../lib/toast';
import type { FinanceCategory, NewRow, Transaction, TxType } from '../../lib/types';
import { tooltipStyle, useChartColors } from '../../lib/useChartColors';
import { useTable } from '../../lib/useTable';
import { addMonths, eur, fmtDate, fmtMonth, fmtMonthShort, monthKey, parseNum, pct, sumBy, today } from '../../lib/utils';
import FinanceCategories from '../../pages/FinanceCategories';
import FinanceImport from '../../pages/FinanceImport';
import FinanceRecurring, { newScheduleDraft, runRecurring, ScheduleFields, scheduleError, scheduleOf, type ScheduleDraft } from '../../pages/FinanceRecurring';

const byNewest = (a: Transaction, b: Transaction) => b.date.localeCompare(a.date) || (b.created_at ?? '').localeCompare(a.created_at ?? '');

/** Movimientos del mes de la página, y sus totales. */
function useMonth() {
  const { month } = usePageMonth();
  const txs = useTable('transactions');
  const monthTx = txs.rows.filter((t) => monthKey(t.date) === month).sort(byNewest);
  const expenses = monthTx.filter((t) => t.type === 'gasto');
  return {
    month,
    txs,
    monthTx,
    expenses,
    income: sumBy(monthTx.filter((t) => t.type === 'ingreso'), (t) => t.amount),
    spent: sumBy(expenses, (t) => t.amount),
  };
}

export function MonthPicker() {
  const { month, setMonth } = usePageMonth();
  const current = monthKey(today());
  return (
    <div className="row month-nav">
      <IconButton label="Mes anterior" onClick={() => setMonth(addMonths(month, -1))}>
        ←
      </IconButton>
      <strong className="month-label">{fmtMonth(month)}</strong>
      <IconButton label="Mes siguiente" onClick={() => setMonth(addMonths(month, 1))} disabled={month >= current}>
        →
      </IconButton>
      {month !== current && (
        <button type="button" className="btn ghost sm" onClick={() => setMonth(current)}>
          Mes actual
        </button>
      )}
    </div>
  );
}

export function MonthSummary() {
  const { income, spent } = useMonth();
  const budgets = useTable('budgets');
  const budgetTotal = sumBy(budgets.rows, (b) => b.monthly_limit);
  const balance = income - spent;
  return (
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
  );
}

export function NewTransactionBlock() {
  const txs = useTable('transactions');
  const categories = useTable('finance_categories');
  const recurring = useTable('recurring_transactions');
  const nav = useNav();
  const manage = nav.pageOf('finanzas_categorias');
  return (
    <NewTransaction
      categories={categories.rows}
      onAdd={txs.add}
      onAddRecurring={async (rule) => {
        if (!(await recurring.add(rule))) return false;
        toast(`«${rule.note}» se apuntará ${FREQUENCY_LABEL[rule.frequency].toLowerCase()}`);
        await runRecurring();
        return true;
      }}
      onManage={manage ? () => nav.go(manage.id) : undefined}
    />
  );
}

function NewTransaction({ categories, onAdd, onAddRecurring, onManage }: {
  categories: FinanceCategory[];
  onAdd: (t: NewRow<'transactions'>) => Promise<unknown>;
  onAddRecurring: (rule: NewRow<'recurring_transactions'>) => Promise<boolean>;
  onManage?: () => void;
}) {
  const [type, setType] = useState<TxType>('gasto');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [periodic, setPeriodic] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleDraft>(newScheduleDraft);
  const selectId = useId();

  const togglePeriodic = (on: boolean) => {
    // La fecha ya elegida pasa a ser la primera del periódico.
    if (on) setSchedule((s) => ({ ...s, date }));
    else setDate(schedule.date);
    setPeriodic(on);
  };

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
    const invalid = periodic && scheduleError(schedule);
    if (invalid) {
      toast(invalid, 'error');
      return;
    }
    const base = { type, amount: Math.round(value * 100) / 100, category_id: selected, note: note.trim() };
    // Si es periódico no se apunta a mano: se crea el periódico y él genera el movimiento de esa fecha.
    const created = periodic
      ? await onAddRecurring({
          ...base,
          note: base.note || (categories.find((cat) => cat.id === selected)?.name ?? 'Periódico'),
          ...scheduleOf(schedule),
          active: true,
        })
      : await onAdd({ ...base, date });
    if (created) {
      setAmount('');
      setNote('');
      if (periodic) {
        setDate(schedule.date);
        setSchedule(newScheduleDraft());
        setPeriodic(false);
      }
    }
  };

  return (
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
        {!periodic && (
          <label className="field">
            <span>Fecha</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value || today())} />
          </label>
        )}
      </div>
      {/* El botón va fuera del <label>: dentro, la etiqueta apuntaría al botón y no al selector. */}
      <div className="field">
        <span className="row between">
          <label htmlFor={selectId}>Categoría</label>
          {onManage && (
            <button type="button" className="link-btn" onClick={onManage}>
              Gestionar
            </button>
          )}
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
        <span>{periodic ? 'Concepto' : 'Nota'}</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={120}
          placeholder={periodic ? (type === 'gasto' ? 'Netflix, alquiler, gimnasio…' : 'Nómina, alquiler cobrado…') : 'Opcional'}
        />
      </label>
      <label className="check">
        <input type="checkbox" checked={periodic} onChange={(e) => togglePeriodic(e.target.checked)} />
        <span>
          Es periódico <span className="muted small">(suscripción, alquiler, nómina…)</span>
        </span>
      </label>
      {periodic && (
        <div className="subpanel stack">
          <ScheduleFields value={schedule} onChange={setSchedule} />
        </div>
      )}
      <button className="btn primary">{periodic ? `Crear ${type} periódico` : `Añadir ${type}`}</button>
    </form>
  );
}

export function BudgetBlock() {
  const { expenses } = useMonth();
  const budgets = useTable('budgets');
  const categories = useTable('finance_categories');
  const byId = useMemo(() => new Map(categories.rows.map((cat) => [cat.id, cat])), [categories.rows]);

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
  const rows = [
    ...categoryTree(categories.rows, 'gasto'),
    // Archivadas que aún tienen gasto este mes: se siguen mostrando para que el total cuadre.
    ...categoryTree(categories.rows, 'gasto', true).filter((cat) => cat.archived && spentByTop.has(cat.id)),
  ].map((cat) => ({ cat, budget: budgetFor(cat.id), spent: spentByTop.get(cat.id) ?? 0 }));

  if (rows.length === 0) return <Empty>{categories.loading ? 'Cargando…' : 'Sin categorías de gasto todavía.'}</Empty>;
  return (
    <ul className="budget-list">
      {rows.map((r) => (
        <BudgetRow
          key={r.cat.id}
          category={r.cat}
          limit={r.budget ? Number(r.budget.monthly_limit) : 0}
          spent={r.spent}
          breakdown={r.cat.children.filter((child) => spentByCategory.has(child.id)).map((child) => `${child.icon} ${child.name} ${eur(spentByCategory.get(child.id)!)}`)}
          onSave={(v) => {
            if (r.budget) void budgets.update(r.budget.id, { monthly_limit: v });
            else void budgets.add({ category_id: r.cat.id, monthly_limit: v });
          }}
        />
      ))}
    </ul>
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

export function SixMonthsChart() {
  const txs = useTable('transactions');
  const c = useChartColors();
  const current = monthKey(today());
  const chart = Array.from({ length: 6 }, (_, i) => addMonths(current, i - 5)).map((key) => {
    const rows = txs.rows.filter((t) => monthKey(t.date) === key);
    return {
      mes: fmtMonthShort(key),
      Ingresos: sumBy(rows.filter((t) => t.type === 'ingreso'), (t) => t.amount),
      Gastos: sumBy(rows.filter((t) => t.type === 'gasto'), (t) => t.amount),
    };
  });
  return (
    <div className="chart chart-fill">
      <ResponsiveContainer width="100%" height="100%">
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
  );
}

export function MonthTransactions() {
  const { month, txs, monthTx } = useMonth();
  const categories = useTable('finance_categories');
  const byId = useMemo(() => new Map(categories.rows.map((cat) => [cat.id, cat])), [categories.rows]);

  if (monthTx.length === 0) return <Empty>{txs.loading ? 'Cargando…' : `No hay movimientos en ${fmtMonth(month).toLowerCase()}.`}</Empty>;
  return (
    <ul className="tx-list" aria-label={`Movimientos de ${fmtMonth(month)}`}>
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
              {t.source === 'recurrente' && (
                <span className="muted" title="Movimiento periódico" aria-label="(periódico)">
                  {' '}
                  🔁
                </span>
              )}
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
  );
}

export function RecurringBlock() {
  const categories = useTable('finance_categories');
  const recurring = useTable('recurring_transactions');
  return <FinanceRecurring categories={categories.rows} recurring={recurring} />;
}

export function CategoriesBlock() {
  const categories = useTable('finance_categories');
  const txs = useTable('transactions');
  return <FinanceCategories categories={categories} transactions={txs.rows} />;
}

export function ImportBlock() {
  const categories = useTable('finance_categories');
  const txs = useTable('transactions');
  const nav = useNav();
  const finance = nav.pageOf('finanzas');
  return (
    <FinanceImport
      categories={categories.rows}
      transactions={txs.rows}
      onDone={() => {
        void txs.reload();
        if (finance && nav.current?.id !== finance.id) nav.go(finance.id);
      }}
    />
  );
}
