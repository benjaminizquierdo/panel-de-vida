import { useState, type CSSProperties, type FormEvent } from 'react';
import { backend } from '../backend';
import Sheet from '../components/Sheet';
import { Card, confirmDelete, Empty, IconButton, Stat } from '../components/ui';
import { categoryOptions, categoryPath } from '../lib/categories';
import { notifyDataChanged } from '../lib/events';
import { describeSchedule, dueDates, firstOnOrAfter, monthlyAmount, scheduleFrom } from '../lib/recurring';
import { toast } from '../lib/toast';
import type { FinanceCategory, Frequency, NewRow, RecurringTransaction, TxType } from '../lib/types';
import type { TableApi } from '../lib/useTable';
import { eur, fmtDate, parseNum, today } from '../lib/utils';

/** Tras crear o cambiar periódicos: genera los que ya tocan y refresca la app si ha creado alguno. */
export async function runRecurring() {
  try {
    const n = await backend.generateRecurring(today());
    if (n > 0) {
      toast(`${n} ${n === 1 ? 'movimiento creado' : 'movimientos creados'} a partir de tus periódicos`);
      notifyDataChanged();
    }
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e), 'error');
  }
}

type Editing = { rule: RecurringTransaction } | { type: TxType };

export default function FinanceRecurring({ categories, recurring }: {
  categories: FinanceCategory[];
  recurring: TableApi<'recurring_transactions'>;
}) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const byId = new Map(categories.map((c) => [c.id, c]));

  const active = recurring.rows.filter((r) => r.active);
  const fixedOut = active.filter((r) => r.type === 'gasto').reduce((s, r) => s + monthlyAmount(r), 0);
  const fixedIn = active.filter((r) => r.type === 'ingreso').reduce((s, r) => s + monthlyAmount(r), 0);
  const sorted = [...recurring.rows].sort((a, b) => Number(b.active) - Number(a.active) || a.next_date.localeCompare(b.next_date));

  const toggleActive = async (r: RecurringTransaction) => {
    // Al reanudar no se crea lo que pasó mientras estaba en pausa.
    const patch = r.active ? { active: false } : { active: true, next_date: firstOnOrAfter(r, today()) };
    if (await recurring.update(r.id, patch)) {
      toast(r.active ? `«${r.note}» en pausa` : `«${r.note}» reanudado: el próximo será el ${fmtDate(patch.next_date!)}`);
      if (!r.active) await runRecurring();
    }
  };

  return (
    <div className="stack">
      <div className="stats stats-3">
        <Stat label="Gastos fijos al mes" value={eur(fixedOut)} />
        <Stat label="Ingresos fijos al mes" value={eur(fixedIn)} />
        <Stat label="Balance fijo" value={eur(fixedIn - fixedOut)} tone={fixedIn - fixedOut < 0 ? 'danger' : fixedIn > fixedOut ? 'ok' : undefined} />
      </div>

      <Card
        title="Movimientos periódicos"
        action={
          <div className="row">
            <button className="btn ghost sm" onClick={() => setEditing({ type: 'ingreso' })}>
              + Ingreso
            </button>
            <button className="btn primary sm" onClick={() => setEditing({ type: 'gasto' })}>
              + Gasto
            </button>
          </div>
        }
      >
        <p className="muted small">
          Se apuntan solos cada semana, mes o año: suscripciones, alquiler, nómina, cuotas… Si un mes no lo pagaste, borra ese
          movimiento y no se volverá a crear.
        </p>
        {sorted.length === 0 ? (
          <Empty>{recurring.loading ? 'Cargando…' : 'Aún no tienes periódicos. Crea el primero, por ejemplo una suscripción.'}</Empty>
        ) : (
          <ul className="recurring-list">
            {sorted.map((r) => {
              const cat = byId.get(r.category_id);
              return (
                <li key={r.id} className={`recurring-row ${r.active ? '' : 'is-paused'}`}>
                  <span className="cat-chip lg" style={{ '--cat': cat?.color ?? '#64748b' } as CSSProperties} aria-hidden>
                    {cat?.icon ?? '🔁'}
                  </span>
                  <span className="recurring-main">
                    <strong>{r.note}</strong>
                    <span className="muted small">
                      {categoryPath(byId, r.category_id)} · {describeSchedule(r)}
                    </span>
                    <span className="small">
                      {r.active ? `Próximo: ${fmtDate(r.next_date)}` : 'En pausa'}
                      {r.end_date && ` · hasta el ${fmtDate(r.end_date)}`}
                    </span>
                  </span>
                  <span className={`tx-amount ${r.type}`}>
                    {r.type === 'gasto' ? '−' : '+'}
                    {eur(Number(r.amount))}
                  </span>
                  <span className="row">
                    <label className="switch" title={r.active ? 'Pausar' : 'Reanudar'}>
                      <input
                        type="checkbox"
                        checked={r.active}
                        onChange={() => void toggleActive(r)}
                        aria-label={`${r.active ? 'Pausar' : 'Reanudar'} ${r.note}`}
                      />
                      <span aria-hidden />
                    </label>
                    <IconButton label={`Editar ${r.note}`} onClick={() => setEditing({ rule: r })}>
                      ✎
                    </IconButton>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {editing && (
        <RecurringEditor
          key={'rule' in editing ? editing.rule.id : `nuevo-${editing.type}`}
          editing={editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onCreate={async (row) => {
            if (await recurring.add(row)) {
              setEditing(null);
              await runRecurring();
            }
          }}
          onUpdate={async (id, patch) => {
            if (await recurring.update(id, patch)) {
              setEditing(null);
              await runRecurring();
            }
          }}
          onDelete={async (rule) => {
            if (!confirmDelete(`el periódico «${rule.note}» (los movimientos ya creados se conservan)`)) return;
            if (await recurring.remove(rule.id)) setEditing(null);
          }}
        />
      )}
    </div>
  );
}

/** Lo que se edita del calendario de un periódico, antes de convertirlo en columnas. */
export interface ScheduleDraft {
  frequency: Frequency;
  /** Primera fecha (al crear) o próxima (al editar). */
  date: string;
  hasEnd: boolean;
  endDate: string;
}

export const newScheduleDraft = (date = today()): ScheduleDraft => ({ frequency: 'mensual', date, hasEnd: false, endDate: '' });

/** Columnas del periódico a partir del borrador. */
export const scheduleOf = (d: ScheduleDraft) => ({
  frequency: d.frequency,
  ...scheduleFrom(d.date),
  end_date: d.hasEnd && d.endDate ? d.endDate : null,
});

export const scheduleError = (d: ScheduleDraft) =>
  d.hasEnd && d.endDate && d.endDate < d.date ? 'La fecha de fin no puede ser anterior a la primera' : null;

const FREQUENCY_SHORT: Record<Frequency, string> = { semanal: 'Semanal', mensual: 'Mensual', anual: 'Anual' };

/** Frecuencia, fecha y fin opcional. Lo comparten el editor de periódicos y el formulario de nuevo movimiento. */
export function ScheduleFields({ value, onChange, dateLabel = 'Primera fecha', countPending = true }: {
  value: ScheduleDraft;
  onChange: (v: ScheduleDraft) => void;
  dateLabel?: string;
  /** Avisar de cuántos movimientos se crearán al guardarlo (solo al crear). */
  countPending?: boolean;
}) {
  const set = (patch: Partial<ScheduleDraft>) => onChange({ ...value, ...patch });
  const schedule = scheduleOf(value);
  const pending = countPending ? dueDates(schedule, today()).dates.length : 0;

  return (
    <>
      <div className="field">
        <span>Frecuencia</span>
        <div className="segmented" role="group" aria-label="Frecuencia">
          {(Object.keys(FREQUENCY_SHORT) as Frequency[]).map((f) => (
            <button key={f} type="button" aria-pressed={value.frequency === f} onClick={() => set({ frequency: f })}>
              {FREQUENCY_SHORT[f]}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span>{dateLabel}</span>
        <input type="date" value={value.date} onChange={(e) => set({ date: e.target.value || today() })} />
        <span className="muted small">
          {describeSchedule(schedule)}.
          {pending > 0 && ` Al crearlo se apuntará${pending === 1 ? ' el de esta fecha' : `n ${pending} movimientos (desde esta fecha hasta hoy)`}.`}
          {countPending && pending === 0 && ' El primero se apuntará ese día.'}
        </span>
      </label>
      <label className="check small">
        <input type="checkbox" checked={value.hasEnd} onChange={(e) => set({ hasEnd: e.target.checked })} />
        Termina en una fecha (préstamo, cuotas…)
      </label>
      {value.hasEnd && (
        <label className="field">
          <span>Último</span>
          <input type="date" value={value.endDate} min={value.date} onChange={(e) => set({ endDate: e.target.value })} />
        </label>
      )}
    </>
  );
}

function RecurringEditor({ editing, categories, onClose, onCreate, onUpdate, onDelete }: {
  editing: Editing;
  categories: FinanceCategory[];
  onClose: () => void;
  onCreate: (row: NewRow<'recurring_transactions'>) => Promise<void>;
  onUpdate: (id: string, patch: Partial<NewRow<'recurring_transactions'>>) => Promise<void>;
  onDelete: (rule: RecurringTransaction) => Promise<void>;
}) {
  const rule = 'rule' in editing ? editing.rule : null;
  const [type, setType] = useState<TxType>(rule?.type ?? (editing as { type: TxType }).type);
  const [amount, setAmount] = useState(rule ? String(rule.amount) : '');
  const [note, setNote] = useState(rule?.note ?? '');
  const [categoryId, setCategoryId] = useState(rule?.category_id ?? '');
  const [draft, setDraft] = useState<ScheduleDraft>(
    rule
      ? { frequency: rule.frequency, date: rule.next_date, hasEnd: !!rule.end_date, endDate: rule.end_date ?? '' }
      : newScheduleDraft(),
  );
  const [busy, setBusy] = useState(false);

  const options = categoryOptions(categories, type);
  const selected = options.some((o) => o.id === categoryId) ? categoryId : (options[0]?.id ?? '');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = parseNum(amount);
    if (value === null || value <= 0) return toast('El importe tiene que ser mayor que 0', 'error');
    if (!note.trim()) return toast('Ponle un concepto, por ejemplo «Netflix»', 'error');
    if (!selected) return toast('Elige una categoría', 'error');
    const invalid = scheduleError(draft);
    if (invalid) return toast(invalid, 'error');
    setBusy(true);
    const { anchor_day, anchor_month, next_date, ...schedule } = scheduleOf(draft);
    const values = { type, amount: Math.round(value * 100) / 100, note: note.trim(), category_id: selected, ...schedule };
    if (rule) {
      // Solo se recalcula el calendario si se ha cambiado la fecha o la frecuencia.
      const scheduleChanged = draft.date !== rule.next_date || draft.frequency !== rule.frequency;
      await onUpdate(rule.id, scheduleChanged ? { ...values, anchor_day, anchor_month, next_date } : values);
    } else {
      await onCreate({ ...values, anchor_day, anchor_month, next_date, active: true });
    }
    setBusy(false);
  };

  return (
    <Sheet
      title={rule ? `Editar «${rule.note}»` : type === 'gasto' ? 'Nuevo gasto periódico' : 'Nuevo ingreso periódico'}
      onClose={onClose}
      footer={
        <>
          {rule && (
            <button type="button" className="btn ghost sm danger-text" onClick={() => void onDelete(rule)}>
              Eliminar
            </button>
          )}
          <button className="btn primary" form="recurring-form" disabled={busy}>
            {rule ? 'Guardar' : 'Crear'}
          </button>
        </>
      }
    >
      <form id="recurring-form" onSubmit={submit} className="stack">
        <div className="segmented">
          {(['gasto', 'ingreso'] as const).map((t) => (
            <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)}>
              {t === 'gasto' ? 'Gasto' : 'Ingreso'}
            </button>
          ))}
        </div>
        <label className="field">
          <span>Concepto</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder={type === 'gasto' ? 'Netflix, alquiler, gimnasio…' : 'Nómina, alquiler cobrado…'} required />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Importe (€)</span>
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" required />
          </label>
          <label className="field">
            <span>Categoría</span>
            <select value={selected} onChange={(e) => setCategoryId(e.target.value)}>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <ScheduleFields value={draft} onChange={setDraft} dateLabel={rule ? 'Próxima fecha' : 'Primera fecha'} countPending={!rule} />
      </form>
    </Sheet>
  );
}
