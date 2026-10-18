import { useState, type FormEvent } from 'react';
import BarcodeScanner from '../../components/BarcodeScanner';
import { OffResults, per100 } from '../../components/FoodPicker';
import FoodSheet, { type FoodDraft } from '../../components/FoodSheet';
import { confirmDelete, Empty, IconButton } from '../../components/ui';
import { pricePer100 } from '../../lib/nutrition';
import { lookupBarcode, searchProducts, type OffFood } from '../../lib/openFoodFacts';
import { toast } from '../../lib/toast';
import type { Food } from '../../lib/types';
import { useTable } from '../../lib/useTable';
import { eur } from '../../lib/utils';
import { HeaderAction } from '../header';

/** Buscador de productos de supermercado (Open Food Facts): macros por 100 g, y guardarlos con su precio. */
export function ProductSearch() {
  const foods = useTable('foods');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<OffFood[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [draft, setDraft] = useState<FoodDraft | null>(null);
  const [editing, setEditing] = useState<Food | null>(null);

  const search = async (e: FormEvent) => {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setBusy(true);
    try {
      setResults(await searchProducts(query));
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
    setBusy(false);
  };

  /** Si ya lo tienes, se abre el tuyo (con tu precio); si no, se prepara para guardarlo. */
  const open = (p: OffFood) => {
    const saved = p.barcode ? foods.rows.find((f) => f.barcode === p.barcode) : undefined;
    if (saved) setEditing(saved);
    else setDraft(p);
  };

  const scanned = async (code: string) => {
    setScanning(false);
    const saved = foods.rows.find((f) => f.barcode === code);
    if (saved) return setEditing(saved);
    setBusy(true);
    try {
      const found = await lookupBarcode(code);
      if (found) {
        setResults([found]);
        setDraft(found);
      } else {
        toast('Ese producto no está en Open Food Facts: créalo a mano');
        setDraft({ barcode: code });
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
    setBusy(false);
  };

  return (
    <div className="stack">
      <form className="inline-form" onSubmit={search}>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar: yogur griego, avena, atún…" aria-label="Buscar productos" maxLength={100} />
        <button className="btn primary sm" disabled={busy || query.trim().length < 2}>
          {busy ? 'Buscando…' : 'Buscar'}
        </button>
        <IconButton label="Escanear código de barras" onClick={() => setScanning(true)}>
          📷
        </IconButton>
      </form>
      {results === null ? (
        <p className="muted small">Productos de supermercados de España con sus macros por 100 g (Open Food Facts, base de datos abierta). Al guardarlos les pones tu precio y quedan en «Mis alimentos».</p>
      ) : results.length === 0 ? (
        <Empty>Sin resultados. Prueba con otras palabras o escanea el código de barras.</Empty>
      ) : (
        <OffResults results={results} saved={foods.rows} onPick={open} actionLabel="Guardar" />
      )}
      {scanning && <BarcodeScanner onCode={(c) => void scanned(c)} onClose={() => setScanning(false)} />}
      {draft && <FoodSheet draft={draft} onClose={() => setDraft(null)} />}
      {editing && <FoodSheet food={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** Tu catálogo de alimentos: macros por 100 g, precio por kilo, favoritos. */
export function MyFoods() {
  const foods = useTable('foods');
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<Food | 'new' | null>(null);
  const q = filter.trim().toLowerCase();
  const list = foods.rows
    .filter((f) => !q || `${f.name} ${f.brand} ${f.store}`.toLowerCase().includes(q))
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name));

  return (
    <div className="stack">
      <HeaderAction>
        <button type="button" className="btn ghost sm" onClick={() => setEditing('new')}>
          ＋ Alimento
        </button>
      </HeaderAction>
      {foods.rows.length > 6 && <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrar…" aria-label="Filtrar alimentos" />}
      {foods.rows.length === 0 ? (
        <Empty>{foods.loading ? 'Cargando…' : 'Aún no tienes alimentos. Búscalos en el buscador de productos, escanéalos o créalos con «＋ Alimento».'}</Empty>
      ) : (
        <ul className="list food-catalog">
          {list.map((f) => {
            const p100 = pricePer100(f);
            return (
              <li key={f.id}>
                <IconButton label={f.favorite ? `Quitar ${f.name} de favoritos` : `Marcar ${f.name} como favorito`} onClick={() => void foods.update(f.id, { favorite: !f.favorite })}>
                  {f.favorite ? '⭐' : '☆'}
                </IconButton>
                <button type="button" className="food-row" onClick={() => setEditing(f)}>
                  <span className="food-name">
                    {f.name}
                    {f.brand && <span className="muted small"> · {f.brand}</span>}
                  </span>
                  <span className="muted small">
                    {per100(f)}
                    {p100 !== null && ` · ${eur(p100 * 10)}/kg${f.store ? ` en ${f.store}` : ''}`}
                  </span>
                </button>
                <IconButton
                  label={`Eliminar ${f.name}`}
                  onClick={() => {
                    if (confirmDelete(`«${f.name}» de tus alimentos (lo que ya comiste no se borra)`)) void foods.remove(f.id);
                  }}
                  danger
                >
                  ✕
                </IconButton>
              </li>
            );
          })}
        </ul>
      )}
      {editing && <FoodSheet food={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
