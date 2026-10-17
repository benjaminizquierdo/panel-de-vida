import { useMemo, useState, type ChangeEvent } from 'react';
import { backend } from '../backend';
import { Card, Empty } from '../components/ui';
import { categoryOptions } from '../lib/categories';
import { parseCsv } from '../lib/csv';
import { notifyDataChanged } from '../lib/events';
import {
  groupLabel,
  guessMapping,
  isTradeRepublic,
  normalizeMerchant,
  readGeneric,
  readTradeRepublic,
  suggestCategory,
  txType,
  type ImportRow,
  type Mapping,
  type ReadResult,
} from '../lib/importer';
import { toast } from '../lib/toast';
import type { FinanceCategory, NewRow, Transaction, TxType } from '../lib/types';
import { useTable } from '../lib/useTable';
import { eur, fmtDate } from '../lib/utils';

type Source = 'trade_republic' | 'csv';

type Step =
  | { kind: 'file' }
  | { kind: 'mapping'; fileName: string; table: string[][]; mapping: Mapping }
  | { kind: 'preview'; fileName: string; source: Source; result: ReadResult };

export default function FinanceImport({ categories, transactions, onDone }: {
  categories: FinanceCategory[];
  transactions: Transaction[];
  onDone: () => void;
}) {
  const [step, setStep] = useState<Step>({ kind: 'file' });
  const [error, setError] = useState<string | null>(null);

  const openFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo
    if (!file) return;
    setError(null);
    try {
      const table = parseCsv(await file.text());
      if (table.length < 2) throw new Error('El archivo no tiene movimientos.');
      if (isTradeRepublic(table[0])) {
        setStep({ kind: 'preview', fileName: file.name, source: 'trade_republic', result: readTradeRepublic(table) });
      } else {
        setStep({ kind: 'mapping', fileName: file.name, table, mapping: guessMapping(table[0]) });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido leer el archivo.');
    }
  };

  if (step.kind === 'mapping') {
    return (
      <MappingStep
        step={step}
        onBack={() => setStep({ kind: 'file' })}
        onChange={(mapping) => setStep({ ...step, mapping })}
        onContinue={() =>
          setStep({ kind: 'preview', fileName: step.fileName, source: 'csv', result: readGeneric(step.table, step.mapping) })
        }
      />
    );
  }

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
      <Card title="Importar movimientos">
        <p>
          Sube el CSV de tu banco. El de <strong>Trade Republic</strong> se reconoce solo; con otros bancos podrás indicar qué
          columna es cada cosa. Antes de guardar verás todos los movimientos para revisarlos.
        </p>
        <label className="file-drop">
          <input type="file" accept=".csv,text/csv" onChange={(e) => void openFile(e)} />
          <span className="file-drop-icon" aria-hidden>
            📄
          </span>
          <strong>Elegir archivo CSV</strong>
          <span className="muted small">Se lee en tu navegador; solo se guardan los movimientos que confirmes.</span>
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </Card>
      <Card title="Cómo exportar desde Trade Republic">
        <ol className="steps">
          <li>En la app de Trade Republic, abre tu perfil y busca la opción de exportar transacciones (en algunas versiones está en Documentos o Extractos).</li>
          <li>Elige el periodo y el formato CSV, y guárdalo en tu dispositivo.</li>
          <li>Súbelo aquí. Si lo vuelves a importar más adelante, los movimientos ya guardados se detectan y se saltan.</li>
        </ol>
        <p className="muted small">Consejo: no abras y guardes el CSV con Excel antes de importarlo; puede cambiar el formato de fechas e importes.</p>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- Paso 2: columnas (otros bancos)

function MappingStep({ step, onBack, onChange, onContinue }: {
  step: Extract<Step, { kind: 'mapping' }>;
  onBack: () => void;
  onChange: (m: Mapping) => void;
  onContinue: () => void;
}) {
  const { table, mapping } = step;
  const header = table[0];
  const sample = readGeneric(table.slice(0, 6), mapping);
  const ready = mapping.date >= 0 && mapping.amount >= 0 && mapping.description >= 0;

  const select = (key: 'date' | 'amount' | 'description' | 'id', label: string, optional = false) => (
    <label className="field">
      <span>{label}</span>
      <select value={mapping[key]} onChange={(e) => onChange({ ...mapping, [key]: Number(e.target.value) })}>
        <option value={-1}>{optional ? '— No tiene' : '— Elige una columna'}</option>
        {header.map((h, i) => (
          <option key={i} value={i}>
            {h || `Columna ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <Card title={`Columnas de «${step.fileName}»`}>
      <p className="muted">No es un CSV de Trade Republic. Indica qué columna es cada cosa (las he adivinado por el nombre):</p>
      <div className="field-row">
        {select('date', 'Fecha')}
        {select('amount', 'Importe')}
      </div>
      <div className="field-row">
        {select('description', 'Descripción')}
        {select('id', 'Identificador (opcional)', true)}
      </div>
      <label className="check small">
        <input type="checkbox" checked={mapping.invert} onChange={(e) => onChange({ ...mapping, invert: e.target.checked })} />
        Mi banco pone los gastos en positivo (invertir signo)
      </label>

      <div className="stack">
        <strong className="small">Así se leerán las primeras filas:</strong>
        {!ready ? (
          <Empty>Elige al menos fecha, importe y descripción.</Empty>
        ) : (
          <ul className="list">
            {sample.rows.map((r) => (
              <li key={r.key}>
                <span>
                  <span className="muted small">{fmtDate(r.date)}</span> {r.text}
                </span>
                <span className={`tx-amount ${txType(r)}`}>{eur(r.amount)}</span>
              </li>
            ))}
            {sample.errors.map((e) => (
              <li key={e} className="text-danger small">
                {e}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="row between">
        <button className="btn ghost" onClick={onBack}>
          ← Otro archivo
        </button>
        <button className="btn primary" disabled={!ready} onClick={onContinue}>
          Continuar
        </button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- Paso 3: vista previa

const merchantKey = (row: ImportRow) => `${txType(row)}|${normalizeMerchant(row.merchant)}`;

function PreviewStep({ step, categories, transactions, onBack, onDone }: {
  step: Extract<Step, { kind: 'preview' }>;
  categories: FinanceCategory[];
  transactions: Transaction[];
  onBack: () => void;
  onDone: () => void;
}) {
  const { source, result } = step;
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

  const groups = useMemo(() => {
    const m = new Map<string, { rows: ImportRow[]; total: number }>();
    for (const r of rows) {
      const g = m.get(r.group) ?? { rows: [], total: 0 };
      g.rows.push(r);
      g.total += r.amount;
      m.set(r.group, g);
    }
    return [...m.entries()].sort((a, b) => b[1].rows.length - a[1].rows.length);
  }, [rows]);

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

  return (
    <div className="stack">
      <Card
        title={`Revisar «${step.fileName}»`}
        action={
          <button className="btn ghost sm" onClick={onBack}>
            ← Otro archivo
          </button>
        }
      >
        <p className="muted small">
          {source === 'trade_republic' ? 'Formato de Trade Republic detectado. ' : ''}
          {rows.length} movimientos leídos
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

        <div className="stack">
          <strong className="small">Qué importar</strong>
          <ul className="group-list">
            {groups.map(([group, g]) => {
              const keys = g.rows.map((r) => r.key).filter((k) => !existing.has(k));
              const on = keys.filter((k) => included.has(k)).length; // keys ya excluye los importados
              return (
                <li key={group}>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={keys.length > 0 && on === keys.length}
                      ref={(el) => {
                        if (el) el.indeterminate = on > 0 && on < keys.length;
                      }}
                      disabled={keys.length === 0}
                      onChange={(e) => toggle(keys, e.target.checked)}
                    />
                    <span>
                      {source === 'trade_republic' ? groupLabel(group) : group}{' '}
                      <span className="muted small">
                        {g.rows.length} · {eur(g.total)}
                        {source === 'trade_republic' && ` · ${group}`}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>

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
          La categoría se propone por tus reglas o por el tipo de comercio. Si cambias la de un comercio, se aplica a todos sus
          movimientos.
        </p>
        <ul className="import-list">
          {rows.map((r) => {
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
                    {source === 'trade_republic' && ` · ${groupLabel(r.group)}`}
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
          })}
        </ul>
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
