// Productos de Open Food Facts (base de datos abierta y gratuita, licencia ODbL). Por código de
// barras se pregunta directamente; por nombre, a través del backend (ver backend.searchFoods).

import { FIELDS } from '../../supabase/functions/food-search/search';
import { backend } from '../backend';
import { fromOffProduct, packageGrams } from './nutrition';

export type OffFood = NonNullable<ReturnType<typeof fromOffProduct>> & {
  /** Peso del envase leído de la etiqueta, para calcular el precio por 100 g. */
  package_g: number | null;
};

const toFood = (p: Record<string, unknown>): OffFood | null => {
  const food = fromOffProduct(p);
  return food && { ...food, package_g: packageGrams(p.quantity) };
};

/** Producto por su código de barras; null si Open Food Facts no lo tiene (o le faltan datos). */
export async function lookupBarcode(code: string): Promise<OffFood | null> {
  let res: Response;
  try {
    res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}?fields=${FIELDS.join(',')}`);
  } catch {
    throw new Error('No se ha podido contactar con Open Food Facts. Comprueba tu conexión.');
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Open Food Facts no responde ahora mismo. Prueba en unos minutos.');
  const data = await res.json();
  return data.status === 1 || data.product ? toFood({ code, ...data.product }) : null;
}

// El buscador de Open Food Facts admite pocas búsquedas por minuto: se busca al pulsar (nunca
// mientras se escribe), se recuerdan las respuestas y se espera un poco entre búsquedas.
const MIN_GAP_MS = 4000;
let lastSearch = 0;
const cache = new Map<string, OffFood[]>();

export async function searchProducts(query: string): Promise<OffFood[]> {
  const key = query.trim().toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;
  const wait = lastSearch + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastSearch = Date.now();
  const hits = await backend.searchFoods(query.trim());
  const foods = hits.map(toFood).filter((f): f is OffFood => f !== null);
  cache.set(key, foods);
  return foods;
}
