import { useMemo, useState, type FormEvent } from 'react';
import { MEALS, portion, pricePer100 } from '../lib/nutrition';
import { lookupBarcode, searchProducts, type OffFood } from '../lib/openFoodFacts';
import { toast } from '../lib/toast';
import type { Food, Meal } from '../lib/types';
import { useTable } from '../lib/useTable';
import { eur, fmtDate, num, parseNum, today } from '../lib/utils';
import BarcodeScanner from './BarcodeScanner';
import FoodSheet, { type FoodDraft } from './FoodSheet';
import Sheet from './Sheet';
import { Empty } from './ui';

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Kcal y proteína por 100 g, en corto. */
export const per100 = (f: Pick<Food, 'kcal' | 'protein' | 'carbs' | 'fat'>) =>
  `${num(Math.round(Number(f.kcal)))} kcal · P ${num(Number(f.protein))} · H ${num(Number(f.carbs))} · G ${num(Number(f.fat))}`;

type Mode = { kind: 'pick' } | { kind: 'scan' } | { kind: 'manual'; draft?: FoodDraft } | { kind: 'amount'; food: Food | OffFood };

/**
 * Apuntar algo en el diario: de tus alimentos, buscándolo en Open Food Facts, escaneando su
 * código de barras o creándolo a mano. Después se elige cuánto y en qué comida.
 */
export default function FoodPicker({ date, meal, onClose }: { date: string; meal: Meal; onClose: () => void }) {
  const foods = useTable('foods');
  const logs = useTable('food_logs');
  const [mode, setMode] = useState<Mode>({ kind: 'pick' });
  const [tab, setTab] = useState<'mios' | 'buscar'>(foods.rows.length ? 'mios' : 'buscar');
  const [filter, setFilter] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<OffFood[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [looking, setLooking] = useState(false);

  // Tus alimentos: favoritos, luego los últimos que has apuntado, luego por nombre.
  const mine = useMemo(() => {
    const last = new Map<string, string>();
    for (const l of logs.rows) if (l.food_id && (last.get(l.food_id) ?? '') < (l.created_at ?? '')) last.set(l.food_id, l.created_at ?? '');
    const q = normalize(filter.trim());
    return foods.rows
      .filter((f) => !q || normalize(`${f.name} ${f.brand}`).includes(q))
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || (last.get(b.id) ?? '').localeCompare(last.get(a.id) ?? '') || a.name.localeCompare(b.name));
  }, [foods.rows, logs.rows, filter]);

  /** Un producto de Open Food Facts que ya tienes guardado se usa desde tu catálogo (con tu precio). */
  const pickOff = (p: OffFood) => {
    const saved = p.barcode ? foods.rows.find((f) => f.barcode === p.barcode) : undefined;
    setMode({ kind: 'amount', food: saved ?? p });
  };

  const search = async (e: FormEvent) => {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true);
    try {
      setResults(await searchProducts(query));
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
    setSearching(false);
  };

  const scanned = async (code: string) => {
    const saved = foods.rows.find((f) => f.barcode === code);
    if (saved) return setMode({ kind: 'amount', food: saved });
    setMode({ kind: 'pick' });
    setLooking(true);
    try {
      const found = await lookupBarcode(code);
      if (found) setMode({ kind: 'amount', food: found });
      else {
        toast('Ese producto no está en Open Food Facts: créalo a mano (solo la primera vez)');
        setMode({ kind: 'manual', draft: { barcode: code } });
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
    setLooking(false);
  };

  if (mode.kind === 'scan') return <BarcodeScanner onCode={(c) => void scanned(c)} onClose={() => setMode({ kind: 'pick' })} />;
  if (mode.kind === 'manual') {
    return <FoodSheet draft={mode.draft} onClose={() => setMode({ kind: 'pick' })} onSaved={(f) => setMode({ kind: 'amount', food: f })} />;
  }
  if (mode.kind === 'amount') return <AmountSheet food={mode.food} date={date} meal={meal} onBack={() => setMode({ kind: 'pick' })} onDone={onClose} />;

  const mealLabel = MEALS.find((m) => m.id === meal)!;
  return (
    <Sheet title={`Añadir a ${mealLabel.label.toLowerCase()}${date === today() ? '' : ` · ${fmtDate(date)}`}`} onClose={onClose}>
      <div className="stack">
        <div className="row wrap">
          <button type="button" className="btn primary" onClick={() => setMode({ kind: 'scan' })} disabled={looking}>
            {looking ? 'Buscando el producto…' : '📷 Escanear código'}
          </button>
          <button type="button" className="btn ghost" onClick={() => setMode({ kind: 'manual' })}>
            ＋ A mano
          </button>
        </div>
        <div className="segmented" role="tablist" aria-label="Dónde buscar">
          <button type="button" role="tab" aria-selected={tab === 'mios'} onClick={() => setTab('mios')}>
            Mis alimentos <span className="count">{foods.rows.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === 'buscar'} onClick={() => setTab('buscar')}>
            Buscar producto
          </button>
        </div>

        {tab === 'mios' ? (
          <>
            <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrar tus alimentos…" aria-label="Filtrar tus alimentos" />
            {mine.length === 0 ? (
              <Empty>{foods.rows.length ? 'Ninguno coincide.' : 'Aún no tienes alimentos guardados: búscalos, escanéalos o créalos a mano.'}</Empty>
            ) : (
              <ul className="food-list">
                {mine.slice(0, 60).map((f) => (
                  <li key={f.id}>
                    <button type="button" className="food-row" onClick={() => setMode({ kind: 'amount', food: f })}>
                      <span className="food-name">
                        {f.favorite && '⭐ '}
                        {f.name}
                        {f.brand && <span className="muted small"> · {f.brand}</span>}
                      </span>
                      <span className="muted small">{per100(f)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <form className="inline-form" onSubmit={search}>
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Yogur griego, pechuga de pavo…" aria-label="Buscar en Open Food Facts" maxLength={100} />
              <button className="btn ghost sm" disabled={searching || query.trim().length < 2}>
                {searching ? 'Buscando…' : 'Buscar'}
              </button>
            </form>
            {results === null ? (
              <p className="muted small">Productos de supermercados de España, de Open Food Facts (base de datos abierta). Valores por 100 g.</p>
            ) : results.length === 0 ? (
              <Empty>No se ha encontrado nada. Prueba con otras palabras, escanea el código o créalo a mano.</Empty>
            ) : (
              <OffResults results={results} saved={foods.rows} onPick={pickOff} />
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}

/** Resultados de Open Food Facts con su foto, marca y valores por 100 g. */
export function OffResults({ results, saved, onPick, actionLabel = 'Elegir' }: { results: OffFood[]; saved: Food[]; onPick: (p: OffFood) => void; actionLabel?: string }) {
  return (
    <ul className="food-list">
      {results.map((p, i) => {
        const mine = p.barcode && saved.some((f) => f.barcode === p.barcode);
        return (
          <li key={p.barcode ?? `${p.name}${i}`}>
            <button type="button" className="food-row has-img" onClick={() => onPick(p)} aria-label={`${actionLabel} ${p.name}`}>
              {p.image_url ? <img src={p.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="food-img-empty" aria-hidden>🛒</span>}
              <span className="food-row-text">
                <span className="food-name">
                  {p.name}
                  {p.brand && <span className="muted small"> · {p.brand}</span>}
                </span>
                <span className="muted small">
                  {per100(p)}
                  {mine && ' · ✓ en tus alimentos'}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const isSaved = (f: Food | OffFood): f is Food => 'id' in f;

/** Cuánto, en qué comida y (si es un producto nuevo) cuánto cuesta. */
function AmountSheet({ food, date, meal: initialMeal, onBack, onDone }: { food: Food | OffFood; date: string; meal: Meal; onBack: () => void; onDone: () => void }) {
  const foods = useTable('foods');
  const logs = useTable('food_logs');
  const serving = food.serving_g ? Number(food.serving_g) : null;
  const [grams, setGrams] = useState(String(serving ?? 100));
  const [meal, setMeal] = useState<Meal>(initialMeal);
  const [price, setPrice] = useState(isSaved(food) && food.price !== null ? String(food.price).replace('.', ',') : '');
  const [priceGrams, setPriceGrams] = useState(isSaved(food) ? String(food.price_grams ?? '') : String((food as OffFood).package_g ?? ''));
  const [busy, setBusy] = useState(false);
  const g = parseNum(grams);
  const priced = { ...food, price: isSaved(food) ? food.price : parseNum(price), price_grams: isSaved(food) ? food.price_grams : parseNum(priceGrams) };
  const p = g && g > 0 ? portion(priced, g) : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!g || g <= 0 || g > 5000) return toast('Escribe cuántos gramos (o ml), por ejemplo 125', 'error');
    setBusy(true);
    let saved: Food | undefined = isSaved(food) ? food : undefined;
    if (!saved) {
      // Producto de Open Food Facts: se guarda en tu catálogo (con tu precio) para la próxima vez.
      const off = food as OffFood;
      const pr = parseNum(price);
      const pg = parseNum(priceGrams);
      const { package_g: _pkg, ...rest } = off;
      saved = await foods.add({ ...rest, price: pr === null ? null : Math.round(pr * 100) / 100, price_grams: pr === null ? null : pg && pg >= 1 ? pg : null, store: '', favorite: false });
      if (!saved) return setBusy(false);
    }
    const values = portion(saved, g);
    const created = await logs.add({ date, meal, food_id: saved.id, name: saved.name, grams: Math.round(g * 10) / 10, ...values });
    setBusy(false);
    if (created) {
      toast(`${saved.name}: ${num(values.kcal)} kcal en ${MEALS.find((m) => m.id === meal)!.label.toLowerCase()}`);
      onDone();
    }
  };

  const chips = [...new Set([serving, 50, 100, 150, 200].filter((v): v is number => !!v))];
  const p100 = pricePer100(priced);
  return (
    <Sheet
      title={food.name}
      onClose={onDone}
      footer={
        <>
          <button type="button" className="btn ghost sm" onClick={onBack}>
            ← Otro alimento
          </button>
          <button className="btn primary" form="amount-form" disabled={busy}>
            Apuntar
          </button>
        </>
      }
    >
      <form id="amount-form" className="stack" onSubmit={submit}>
        <div className="food-head">
          {food.image_url && <img src={food.image_url} alt="" referrerPolicy="no-referrer" />}
          <span>
            {food.brand && <span className="muted">{food.brand} · </span>}
            <span className="muted small">{per100(food)} por 100 g</span>
          </span>
        </div>
        <label className="field">
          <span>Cantidad (g o ml)</span>
          <input inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} className="num-input" autoFocus />
        </label>
        <div className="row wrap" role="group" aria-label="Cantidades rápidas">
          {chips.map((c) => (
            <button key={c} type="button" className="filter-chip" aria-pressed={g === c} onClick={() => setGrams(String(c))}>
              {c === serving ? `1 ración (${num(c)} g)` : `${c} g`}
            </button>
          ))}
        </div>
        <div className="segmented" role="group" aria-label="Comida">
          {MEALS.map((m) => (
            <button key={m.id} type="button" aria-pressed={meal === m.id} onClick={() => setMeal(m.id)}>
              {m.icon} <span className="meal-label">{m.label}</span>
            </button>
          ))}
        </div>
        {!isSaved(food) && (
          <fieldset className="field">
            <legend>¿Cuánto te cuesta? (opcional, se recordará)</legend>
            <div className="goal-grid">
              <label className="field">
                <span>Precio (€)</span>
                <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="1,35" />
              </label>
              <label className="field">
                <span>Por (g o ml)</span>
                <input inputMode="decimal" value={priceGrams} onChange={(e) => setPriceGrams(e.target.value)} placeholder="500" />
              </label>
            </div>
          </fieldset>
        )}
        {p && (
          <div className="portion-preview">
            <strong>{num(p.kcal)} kcal</strong>
            <span>P {num(p.protein)} g</span>
            <span>H {num(p.carbs)} g</span>
            <span>G {num(p.fat)} g</span>
            {p.cost !== null && <span>{eur(p.cost)}</span>}
          </div>
        )}
        {p100 === null && isSaved(food) && <p className="muted small">Sin precio: ponlo en «Mis alimentos» para saber cuánto gastas en comida.</p>}
      </form>
    </Sheet>
  );
}
