import { useState, type FormEvent } from 'react';
import { pricePer100 } from '../lib/nutrition';
import { toast } from '../lib/toast';
import type { Food, NewRow } from '../lib/types';
import { useTable } from '../lib/useTable';
import { eur, parseNum } from '../lib/utils';
import Sheet from './Sheet';

export type FoodDraft = Partial<Omit<Food, 'id'>> & { package_g?: number | null };

const NUM_FIELDS = [
  { key: 'kcal', label: 'Kcal', max: 1000, required: true },
  { key: 'protein', label: 'Proteína (g)', max: 100, required: true },
  { key: 'carbs', label: 'Hidratos (g)', max: 100, required: true },
  { key: 'fat', label: 'Grasa (g)', max: 100, required: true },
  { key: 'fiber', label: 'Fibra (g)', max: 100 },
  { key: 'sugars', label: 'Azúcares (g)', max: 100 },
  { key: 'salt', label: 'Sal (g)', max: 100 },
] as const;

const text = (v: number | string | null | undefined) => (v === null || v === undefined ? '' : String(v).replace('.', ','));

/**
 * Crear o editar un alimento del catálogo: valores por 100 g, ración habitual y precio. `draft`
 * viene rellenado cuando sale de Open Food Facts o de un código escaneado. Llama a `onSaved` con
 * el alimento guardado (y entonces no se cierra sola).
 */
export default function FoodSheet({ food, draft, onClose, onSaved }: {
  food?: Food;
  draft?: FoodDraft;
  onClose: () => void;
  onSaved?: (food: Food) => void;
}) {
  const foods = useTable('foods');
  const start: FoodDraft = food ?? draft ?? {};
  const [name, setName] = useState(start.name ?? '');
  const [brand, setBrand] = useState(start.brand ?? '');
  const [barcode, setBarcode] = useState(start.barcode ?? '');
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(NUM_FIELDS.map((f) => [f.key, text(start[f.key])])));
  const [serving, setServing] = useState(text(start.serving_g));
  const [price, setPrice] = useState(text(start.price));
  const [priceGrams, setPriceGrams] = useState(text(start.price_grams ?? draft?.package_g));
  const [store, setStore] = useState(start.store ?? '');
  const [busy, setBusy] = useState(false);
  const fromOff = start.source === 'off';

  const p100 = pricePer100({ price: parseNum(price), price_grams: parseNum(priceGrams) });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast('Ponle un nombre al alimento', 'error');
    const nums: Record<string, number | null> = {};
    for (const f of NUM_FIELDS) {
      const v = values[f.key].trim() ? parseNum(values[f.key]) : null;
      if (values[f.key].trim() && (v === null || v < 0 || v > f.max)) return toast(`${f.label} por 100 g: entre 0 y ${f.max}`, 'error');
      nums[f.key] = v === null ? ('required' in f ? 0 : null) : Math.round(v * 100) / 100;
    }
    const s = serving.trim() ? parseNum(serving) : null;
    const pr = price.trim() ? parseNum(price) : null;
    const pg = priceGrams.trim() ? parseNum(priceGrams) : null;
    if (serving.trim() && (s === null || s <= 0 || s > 5000)) return toast('La ración es un peso en gramos (por ejemplo 125)', 'error');
    if (price.trim() && (pr === null || pr < 0)) return toast('El precio tiene que ser un número (por ejemplo 1,35)', 'error');
    if (pr !== null && (pg === null || pg < 1)) return toast('Di de cuántos gramos es ese precio (el peso del envase)', 'error');
    const code = barcode.replace(/\D/g, '');
    if (barcode.trim() && !/^\d{6,14}$/.test(code)) return toast('El código de barras son entre 6 y 14 números', 'error');

    const row: NewRow<'foods'> = {
      name: name.trim().slice(0, 200),
      brand: brand.trim().slice(0, 200),
      barcode: code || null,
      source: fromOff ? 'off' : 'manual',
      kcal: nums.kcal!,
      protein: nums.protein!,
      carbs: nums.carbs!,
      fat: nums.fat!,
      fiber: nums.fiber,
      sugars: nums.sugars,
      salt: nums.salt,
      serving_g: s,
      price: pr === null ? null : Math.round(pr * 100) / 100,
      price_grams: pr === null ? null : pg,
      store: store.trim().slice(0, 100),
      image_url: start.image_url ?? null,
      favorite: food?.favorite ?? false,
    };
    setBusy(true);
    let saved: Food | undefined;
    if (food) {
      if (await foods.update(food.id, row)) saved = { ...food, ...row };
    } else {
      saved = await foods.add(row);
    }
    setBusy(false);
    if (!saved) return;
    toast(food ? 'Alimento guardado' : `«${saved.name}» añadido a tus alimentos`);
    // Con onSaved, quien la abrió decide qué viene después (p. ej. elegir la cantidad).
    if (onSaved) onSaved(saved);
    else onClose();
  };

  return (
    <Sheet
      title={food ? `Editar «${food.name}»` : fromOff ? 'Guardar producto' : 'Nuevo alimento'}
      onClose={onClose}
      footer={
        <button className="btn primary" form="food-form" disabled={busy}>
          {food ? 'Guardar' : 'Añadir a mis alimentos'}
        </button>
      }
    >
      <form id="food-form" className="stack" onSubmit={submit}>
        {start.image_url && <img className="food-sheet-img" src={start.image_url} alt="" referrerPolicy="no-referrer" />}
        <label className="field">
          <span>Nombre</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder="Pechuga de pollo" required />
        </label>
        <div className="goal-grid">
          <label className="field">
            <span>Marca (opcional)</span>
            <input value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={200} placeholder="Hacendado" />
          </label>
          <label className="field">
            <span>Código de barras (opcional)</span>
            <input inputMode="numeric" value={barcode} onChange={(e) => setBarcode(e.target.value)} maxLength={20} />
          </label>
        </div>
        <fieldset className="field">
          <legend>Por cada 100 g{fromOff && <span className="muted small"> · de Open Food Facts, revísalo si quieres</span>}</legend>
          <div className="macro-grid">
            {NUM_FIELDS.map((f) => (
              <label key={f.key} className="field">
                <span>{f.label}</span>
                <input inputMode="decimal" value={values[f.key]} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} placeholder={'required' in f ? '0' : '—'} />
              </label>
            ))}
          </div>
        </fieldset>
        <label className="field">
          <span>Ración habitual (g)</span>
          <input inputMode="decimal" value={serving} onChange={(e) => setServing(e.target.value)} placeholder="Opcional: 125" className="num-input" />
        </label>
        <fieldset className="field">
          <legend>Precio (lo que te cuesta, para saber cuánto gastas en comida)</legend>
          <div className="goal-grid">
            <label className="field">
              <span>Precio (€)</span>
              <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="1,35" />
            </label>
            <label className="field">
              <span>Por (g o ml)</span>
              <input inputMode="decimal" value={priceGrams} onChange={(e) => setPriceGrams(e.target.value)} placeholder="500" />
            </label>
            <label className="field">
              <span>Tienda</span>
              <input value={store} onChange={(e) => setStore(e.target.value)} maxLength={100} placeholder="Mercadona" list="food-stores" />
              <datalist id="food-stores">
                {['Mercadona', 'Carrefour', 'Lidl', 'Aldi', 'Dia', 'Alcampo', 'Eroski', 'Consum'].map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </label>
          </div>
          {p100 !== null && <span className="muted small">{eur(p100)} por 100 g · {eur(p100 * 10)} el kilo</span>}
        </fieldset>
      </form>
    </Sheet>
  );
}
