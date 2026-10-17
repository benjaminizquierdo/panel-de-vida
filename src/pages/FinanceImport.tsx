import { useMemo, useState, type ChangeEvent } from 'react';
import { backend } from '../backend';
import IconSelect from '../components/IconSelect';
import { Card } from '../components/ui';
import { BANKS, bankById, type Bank, type BankId } from '../lib/banks';
import { categoryOptions } from '../lib/categories';
import { parseCsv } from '../lib/csv';
import { notifyDataChanged } from '../lib/events';
import { normalizeMerchant, suggestCategory, txType, type ImportRow, type ReadResult } from '../lib/importer';
import { toast } from '../lib/toast';
import type { FinanceCategory, NewRow, Transaction, TxType } from '../lib/types';
import { useTable } from '../lib/useTable';
import { eur, fmtDate, fmtMonth, monthKey } from '../lib/utils';

type Step = { kind: 'file' } | { kind: 'preview'; fileName: string; source: BankId; result: ReadResult };

const BANK_KEY = 'pv:import-bank';

const savedBank = (): Bank => {
  try {
    return bankById(localStorage.getItem(BANK_KEY)) ?? BANKS[0];
  } catch {
    return BANKS[0];
  }
};

const bankLogo = (bank: Bank) => <img src={bank.logo} alt="" className="bank-logo" width={24} height={24} />;

export default function FinanceImport({ categories, transactions, onDone }: {
  categories: FinanceCategory[];
  transactions: Transaction[];
  onDone: () => void;
}) {
  const [step, setStep] = useState<Step>({ kind: 'file' });
  const [bank, setBankState] = useState<Bank>(savedBank);
  const [error, setError] = useState<string | null>(null);

  const setBank = (id: string) => {
    const next = bankById(id);
    if (!next) return;
    setBankState(next);
    setError(null);
    try {
      localStorage.setItem(BANK_KEY, next.id);
    } catch {
      // sin almacenamiento (modo privado): solo no se recuerda
    }
  };

  const openFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo
    if (!file) return;
    setError(null);
    try {
      const table = parseCsv(await file.text());
      if (table.length < 2) throw new Error('El archivo no tiene movimientos.');
      if (!bank.matches(table[0])) {
        const other = BANKS.find((b) => b.matches(table[0]));
        throw new Error(
          other
            ? `Este archivo es de ${other.name}, no de ${bank.name}. Elige ${other.name} en el selector de banco.`
            : `Este archivo no parece un export de ${bank.name}. Comprueba que es el CSV de transacciones que descarga la app del banco.`,
        );
      }
      setStep({ kind: 'preview', fileName: file.name, source: bank.id, result: bank.read(table) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido leer el archivo.');
    }
  };

  if (step.kind === 'preview') {
    return (
      <PreviewStep
        key={step.fileName}
        step={step}
        categories={categories}
        transactions={transactions}
        onBack={() => setStep({ kind: 'file' })}
        onDone={onDone}
      />
    );
  }

  return (
    <div className="stack">
      <Card title="Importar movimientos bancarios">
        <p>Elige tu banco y sube el archivo de movimientos que exporta. Antes de guardar verás todos los movimientos para revisarlos.</p>
        <IconSelect
          label="Banco"
          options={BANKS.map((b) => ({ value: b.id, label: b.name, icon: bankLogo(b) }))}
          value={bank.id}
          onChange={setBank}
        />
        <label className="file-drop">
          <input type="file" accept=".csv,text/csv" onChange={(e) => void openFile(e)} />
          <span className="file-drop-icon" aria-hidden>
            📄
          </span>
          <strong>Elegir archivo CSV de {bank.name}</strong>
          <span className="muted small">Se lee en tu navegador; solo se guardan los movimientos que confirmes.</span>
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </Card>
      <Card title={`Cómo exportar desde ${bank.name}`}>
        <ol className="steps">
          {bank.howTo.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        {bank.tip && <p className="muted small">Consejo: {bank.tip}</p>}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- Vista previa

const merchantKey = (row: ImportRow) => `${txType(row)}|${normalizeMerchant(row.merchant)}`;

type Grouping = 'tipo' | 'mes' | 'lista';

const GROUPING_LABEL: Record<Grouping, string> = { tipo: 'Por tipo', mes: 'Por mes y tipo', lista: 'Sin agrupar' };
const GROUPING_KEY = 'pv:import-grouping';

const savedGrouping = (): Grouping => {
  try {
    const v = localStorage.getItem(GROUPING_KEY);
    return v === 'mes' || v === 'lista' ? v : 'tipo';
  } catch {
    return 'tipo';
  }
};

interface RowGroup {
  id: string;
  label: string;
  /** Tipo de operación original (Trade Republic), si el nombre legible es distinto. */
  code?: string;
  rows: ImportRow[];
  children?: RowGroup[];
}

/** Por tipo de operación, de más a menos movimientos. */
function byType(rows: ImportRow[], label: (group: string) => string, prefix = ''): RowGroup[] {
  const m = new Map<string, ImportRow[]>();
  for (const r of rows) {
    const list = m.get(r.group);
    if (list) list.push(r);
    else m.set(r.group, [r]);
  }
  return [...m]
    .map(([group, list]) => ({ id: `${prefix}${group}`, label: label(group), code: label(group) !== group ? group : undefined, rows: list }))
    .sort((a, b) => b.rows.length - a.rows.length);
}

/** Las filas llegan ordenadas de más reciente a más antigua, así que los meses también. */
function groupRows(rows: ImportRow[], grouping: Grouping, label: (group: string) => string): RowGroup[] {
  if (grouping === 'tipo') return byType(rows, label);
  if (grouping === 'lista') return [];
  const months = new Map<string, ImportRow[]>();
  for (const r of rows) {
    const key = monthKey(r.date);
    const list = months.get(key);
    if (list) list.push(r);
    else months.set(key, [r]);
  }
  return [...months].map(([key, list]) => {
    const name = fmtMonth(key);
    return { id: key, label: name[0].toUpperCase() + name.slice(1), rows: list, children: byType(list, label, `${key}|`) };
  });
}

function PreviewStep({ step, categories, transactions, onBack, onDone }: {
  step: Extract<Step, { kind: 'preview' }>;
  categories: FinanceCategory[];
  transactions: Transaction[];
  onBack: () => void;
  onDone: () => void;
}) {
  const { source, result } = step;
  const bank = bankById(source) ?? BANKS[0];
  const rules = useTable('import_rules');

  const existing = useMemo(
    () => new Set(transactions.filter((t) => t.source === source && t.external_id).map((t) => t.external_id as string)),
    [transactions, source],
  );
  const rows = useMemo(() => [...result.rows].sort((a, b) => b.date.localeCompare(a.date)), [result.rows]);

  const [included, setIncluded] = useState<Set<string>>(
    () => new Set(rows.filter((r) => !r.excludedByDefault && !existing.has(r.key)).map((r) => r.key)),
  );
  /** Categoría elegida a mano por comercio (y tipo): se aplica a todas sus filas. */
  const [chosen, setChosen] = useState<Map<string, string>>(new Map());
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);

  const firstOf = (type: TxType, preferred: string) =>
    categories.find((c) => c.type === type && !c.archived && c.name === preferred)?.id ??
    categoryOptions(categories, type)[0]?.id ??
    '';
  const [fallbackChoice, setFallback] = useState<Partial<Record<TxType, string>>>({});
  // Si aún no se ha elegido (o las categorías llegaron después), «Otros» o la primera disponible.
  const fallback: Record<TxType, string> = {
    gasto: fallbackChoice.gasto || firstOf('gasto', 'Otros'),
    ingreso: fallbackChoice.ingreso || firstOf('ingreso', 'Otros ingresos'),
  };

  const suggested = useMemo(
    () => new Map(rows.map((r) => [r.key, suggestCategory(r, categories, rules.rows)])),
    [rows, categories, rules.rows],
  );
  const categoryOf = (r: ImportRow) => chosen.get(merchantKey(r)) ?? suggested.get(r.key) ?? fallback[txType(r)];

  const [grouping, setGroupingState] = useState<Grouping>(savedGrouping);
  const setGrouping = (g: Grouping) => {
    setGroupingState(g);
    setOpen(new Set());
    try {
      localStorage.setItem(GROUPING_KEY, g);
    } catch {
      // sin almacenamiento (modo privado): solo no se recuerda
    }
  };
  const [open, setOpen] = useState<Set<string>>(new Set());
  const groups = useMemo(
    () => groupRows(rows, grouping, bank.groupLabel ?? ((group) => group)),
    [rows, grouping, bank],
  );
  const allGroupIds = groups.flatMap((g) => [g.id, ...(g.children ?? []).map((c) => c.id)]);
  const allOpen = allGroupIds.length > 0 && allGroupIds.every((id) => open.has(id));

  const toggle = (keys: string[], on: boolean) =>
    setIncluded((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (on && !existing.has(k)) next.add(k);
        else next.delete(k);
      }
      return next;
    });

  // `existing` se comprueba también aquí por si los movimientos guardados terminaron de cargar después.
  const selected = rows.filter((r) => included.has(r.key) && !existing.has(r.key));
  const totalOut = selected.filter((r) => r.amount < 0).reduce((s, r) => s + r.amount, 0);
  const totalIn = selected.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);
  const duplicates = rows.filter((r) => existing.has(r.key)).length;
  const missingCategory = selected.some((r) => !categoryOf(r));

  const rememberCount = [...chosen.keys()].filter((k) => selected.some((r) => merchantKey(r) === k)).length;

  const runImport = async () => {
    setBusy(true);
    try {
      if (remember) await saveRules();
      const payload: NewRow<'transactions'>[] = selected.map((r) => ({
        type: txType(r),
        amount: Math.round(Math.abs(r.amount) * 100) / 100,
        category_id: categoryOf(r),
        note: r.text.slice(0, 300),
        date: r.date,
        source,
        external_id: r.key.slice(0, 200),
      }));
      const inserted = await backend.insertMany('transactions', payload, { skipDuplicates: true });
      const skipped = payload.length - inserted;
      toast(`${inserted} movimientos importados${skipped > 0 ? ` (${skipped} ya existían)` : ''}`);
      notifyDataChanged();
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  /** Guarda «comercio → categoría» de las elecciones hechas a mano, actualizando las reglas que ya existían. */
  const saveRules = async () => {
    for (const [key, categoryId] of chosen) {
      const row = selected.find((r) => merchantKey(r) === key);
      if (!row) continue;
      const pattern = row.merchant.trim().slice(0, 100);
      if (pattern.length < 2) continue;
      const current = rules.rows.find((r) => normalizeMerchant(r.pattern) === normalizeMerchant(pattern));
      if (current) {
        if (current.category_id !== categoryId) await rules.update(current.id, { category_id: categoryId });
      } else {
        await rules.add({ pattern, category_id: categoryId });
      }
    }
  };

  /** Casilla que marca o desmarca varias filas (todas, un grupo); a medias si solo hay algunas. Los ya importados no cuentan. */
  const selectionCheck = (groupRows: ImportRow[], text: string, label: string) => {
    const keys = groupRows.map((r) => r.key).filter((k) => !existing.has(k));
    const on = keys.filter((k) => included.has(k)).length;
    return (
      <label className="check small">
        <input
          type="checkbox"
          checked={keys.length > 0 && on === keys.length}
          ref={(el) => {
            if (el) el.indeterminate = on > 0 && on < keys.length;
          }}
          disabled={keys.length === 0}
          onChange={(e) => toggle(keys, e.target.checked)}
          aria-label={label}
        />
        {text}
      </label>
    );
  };

  const renderRow = (r: ImportRow, showGroup: boolean) => {
    const dup = existing.has(r.key);
    const type = txType(r);
    return (
      <li key={r.key} className={`import-row ${dup ? 'is-dup' : ''} ${included.has(r.key) && !dup ? '' : 'is-off'}`}>
        <input
          type="checkbox"
          checked={included.has(r.key) && !dup}
          disabled={dup}
          onChange={(e) => toggle([r.key], e.target.checked)}
          aria-label={`Importar ${r.text} del ${fmtDate(r.date)}`}
        />
        <span className="import-desc">
          <strong>{r.text}</strong>
          <span className="muted small">
            {fmtDate(r.date)}
            {showGroup && bank.groupLabel && ` · ${bank.groupLabel(r.group)}`}
            {dup && ' · ya importado'}
          </span>
        </span>
        <span className={`tx-amount ${type}`}>{eur(r.amount)}</span>
        <select
          className="import-cat"
          value={categoryOf(r)}
          disabled={dup}
          onChange={(e) => setChosen((prev) => new Map(prev).set(merchantKey(r), e.target.value))}
          aria-label={`Categoría de ${r.text}`}
        >
          {categoryOptions(categories, type).map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </li>
    );
  };

  const renderGroup = (g: RowGroup) => {
    const isOpen = open.has(g.id);
    const total = g.rows.reduce((s, r) => s + r.amount, 0);
    const picked = g.rows.filter((r) => included.has(r.key) && !existing.has(r.key)).length;
    const dups = g.rows.filter((r) => existing.has(r.key)).length;
    return (
      <li key={g.id} className={`import-group ${g.children ? '' : 'is-leaf'}`}>
        <div className="import-group-head">
          {selectionCheck(g.rows, '', `Importar todo: ${g.label}`)}
          <button
            type="button"
            className="import-group-toggle"
            aria-expanded={isOpen}
            onClick={() =>
              setOpen((prev) => {
                const next = new Set(prev);
                if (isOpen) next.delete(g.id);
                else next.add(g.id);
                return next;
              })
            }
          >
            <span className="import-group-title">
              <strong>{g.label}</strong>
              <span className="muted small">
                {g.rows.length} {g.rows.length === 1 ? 'movimiento' : 'movimientos'} · {picked} {picked === 1 ? 'marcado' : 'marcados'}
                {dups > 0 && ` · ${dups} ya importados`}
                {g.code && ` · ${g.code}`}
              </span>
            </span>
            <span className={`tx-amount ${total < 0 ? 'gasto' : 'ingreso'}`}>{eur(total)}</span>
            <span className="chevron" aria-hidden>
              ›
            </span>
          </button>
        </div>
        {isOpen &&
          (g.children ? (
            <ul className="import-groups nested">{g.children.map((c) => renderGroup(c))}</ul>
          ) : (
            <ul className="import-list">{g.rows.map((r) => renderRow(r, false))}</ul>
          ))}
      </li>
    );
  };

  return (
    <div className="stack">
      <Card
        title={
          <span className="row">
            {bankLogo(bank)} Revisar «{step.fileName}»
          </span>
        }
        action={
          <button className="btn ghost sm" onClick={onBack}>
            ← Otro archivo
          </button>
        }
      >
        <p className="muted small">
          Formato de {bank.name} detectado. {rows.length} movimientos leídos
          {duplicates > 0 && ` · ${duplicates} ya importados antes (se saltan)`}
          {result.errors.length > 0 && ` · ${result.errors.length} filas no se han podido leer`}
        </p>
        {result.errors.length > 0 && (
          <details className="small">
            <summary>Ver filas con problemas</summary>
            <ul>
              {result.errors.slice(0, 20).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </details>
        )}

        <div className="field-row">
          {(['gasto', 'ingreso'] as const).map((t) => (
            <label key={t} className="field">
              <span>{t === 'gasto' ? 'Categoría si no hay propuesta (gastos)' : 'Categoría si no hay propuesta (ingresos)'}</span>
              <select value={fallback[t]} onChange={(e) => setFallback({ ...fallback, [t]: e.target.value })}>
                {categoryOptions(categories, t).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </Card>

      <Card title="Movimientos">
        <p className="muted small">
          Marca qué importar, uno a uno o por grupos. La categoría se propone por tus reglas o por el tipo de comercio; si cambias
          la de un comercio, se aplica a todos sus movimientos.
        </p>
        <div className="import-toolbar">
          <div className="segmented" role="group" aria-label="Agrupar movimientos">
            {(Object.keys(GROUPING_LABEL) as Grouping[]).map((g) => (
              <button key={g} type="button" aria-pressed={grouping === g} onClick={() => setGrouping(g)}>
                {GROUPING_LABEL[g]}
              </button>
            ))}
          </div>
          <div className="row">
            {selectionCheck(rows, 'Todos', 'Seleccionar todos los movimientos')}
            {grouping !== 'lista' && (
              <button type="button" className="link-btn" onClick={() => setOpen(allOpen ? new Set() : new Set(allGroupIds))}>
                {allOpen ? 'Contraer todo' : 'Desplegar todo'}
              </button>
            )}
          </div>
        </div>

        {grouping === 'lista' ? (
          <ul className="import-list">{rows.map((r) => renderRow(r, true))}</ul>
        ) : (
          <ul className="import-groups">{groups.map((g) => renderGroup(g))}</ul>
        )}
      </Card>

      <div className="import-bar card">
        <span>
          <strong>{selected.length} movimientos</strong>
          <span className="muted small">
            {' '}
            · gastos {eur(totalOut)} · ingresos {eur(totalIn)}
          </span>
        </span>
        {rememberCount > 0 && (
          <label className="check small">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Recordar la categoría de {rememberCount} {rememberCount === 1 ? 'comercio' : 'comercios'} para la próxima vez
          </label>
        )}
        <button className="btn primary" disabled={busy || selected.length === 0 || missingCategory} onClick={() => void runImport()}>
          {busy ? 'Importando…' : `Importar ${selected.length}`}
        </button>
      </div>
    </div>
  );
}
