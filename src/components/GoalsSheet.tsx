import { useState, type FormEvent } from 'react';
import { macroKcal } from '../lib/nutrition';
import { toast } from '../lib/toast';
import { useGoals } from '../lib/useNutrition';
import { num, parseNum } from '../lib/utils';
import Sheet from './Sheet';

const FIELDS = [
  { key: 'kcal', label: 'Kcal al día', min: 500, max: 10000 },
  { key: 'protein_g', label: 'Proteína (g)', min: 0, max: 1000 },
  { key: 'carbs_g', label: 'Hidratos (g)', min: 0, max: 2000 },
  { key: 'fat_g', label: 'Grasa (g)', min: 0, max: 1000 },
  { key: 'water_ml', label: 'Agua (ml)', min: 0, max: 10000 },
  { key: 'steps', label: 'Pasos', min: 0, max: 100000 },
] as const;

type Key = (typeof FIELDS)[number]['key'];

/** Objetivos diarios (kcal, macros, agua, pasos) y peso objetivo. */
export default function GoalsSheet({ onClose }: { onClose: () => void }) {
  const { goals, save } = useGoals();
  const [values, setValues] = useState<Record<Key, string>>(() => Object.fromEntries(FIELDS.map((f) => [f.key, String(goals[f.key])])) as Record<Key, string>);
  const [weight, setWeight] = useState(goals.weight_target === null ? '' : String(goals.weight_target).replace('.', ','));
  const [due, setDue] = useState(goals.weight_target_date ?? '');
  const [busy, setBusy] = useState(false);

  const n = (k: Key) => parseNum(values[k]) ?? 0;
  const fromMacros = macroKcal({ protein_g: n('protein_g'), carbs_g: n('carbs_g'), fat_g: n('fat_g') });

  /** Reparte las kcal en 30 % proteína, 40 % hidratos y 30 % grasa. */
  const split = () => {
    const kcal = n('kcal');
    setValues((v) => ({ ...v, protein_g: String(Math.round((kcal * 0.3) / 4)), carbs_g: String(Math.round((kcal * 0.4) / 4)), fat_g: String(Math.round((kcal * 0.3) / 9)) }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const patch: Record<string, number | string | null> = {};
    for (const f of FIELDS) {
      const v = parseNum(values[f.key]);
      if (v === null || v < f.min || v > f.max) return toast(`${f.label}: entre ${num(f.min)} y ${num(f.max)}`, 'error');
      patch[f.key] = Math.round(v);
    }
    const w = weight.trim() ? parseNum(weight) : null;
    if (weight.trim() && (w === null || w < 20 || w > 400)) return toast('El peso objetivo tiene que estar entre 20 y 400 kg', 'error');
    patch.weight_target = w === null ? null : Math.round(w * 10) / 10;
    patch.weight_target_date = w === null || !due ? null : due;
    setBusy(true);
    const ok = await save(patch);
    setBusy(false);
    if (ok) {
      toast('Objetivos guardados');
      onClose();
    }
  };

  return (
    <Sheet
      title="Tus objetivos"
      onClose={onClose}
      footer={
        <button className="btn primary" form="goals-form" disabled={busy}>
          Guardar
        </button>
      }
    >
      <form id="goals-form" className="stack" onSubmit={submit}>
        <div className="goal-grid">
          {FIELDS.map((f) => (
            <label key={f.key} className="field">
              <span>{f.label}</span>
              <input inputMode="numeric" value={values[f.key]} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
            </label>
          ))}
        </div>
        <p className="muted small">
          Tus macros suman {num(fromMacros)} kcal{Math.abs(fromMacros - n('kcal')) > 100 ? ' (no cuadra con tu objetivo de kcal)' : ''}.{' '}
          <button type="button" className="link-btn" onClick={split}>
            Repartir 30 / 40 / 30
          </button>
        </p>
        <div className="goal-grid">
          <label className="field">
            <span>Peso objetivo (kg)</span>
            <input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="Opcional" />
          </label>
          <label className="field">
            <span>Para cuándo (opcional)</span>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} disabled={!weight.trim()} />
          </label>
        </div>
      </form>
    </Sheet>
  );
}
