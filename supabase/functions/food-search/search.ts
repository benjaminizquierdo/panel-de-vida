// Búsqueda de productos en Open Food Facts por nombre (search.openfoodfacts.org). Sin dependencias,
// para poder probarlo: tests/nutrition.test.ts.

/** Campos que se piden: los que usa fromOffProduct() en src/lib/nutrition.ts. */
export const FIELDS = [
  'code',
  'product_name',
  'product_name_es',
  'generic_name',
  'generic_name_es',
  'brands',
  'quantity',
  'serving_quantity',
  'nutriments',
  'image_front_small_url',
];

export const PAGE_SIZE = 20;

/** Texto de búsqueda limpio (2-100 caracteres, sin la sintaxis de consulta del buscador) o null. */
export function cleanQuery(q: unknown): string | null {
  if (typeof q !== 'string') return null;
  const text = q.replace(/[:"()[\]{}^~*?\/]+/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length >= 2 && text.length <= 100 ? text : null;
}

/** Dirección de la búsqueda: productos vendidos en España, con nombre en español primero. */
export function searchUrl(text: string) {
  const params = new URLSearchParams({
    q: `${text} countries_tags:"en:spain"`,
    langs: 'es',
    page_size: String(PAGE_SIZE),
    fields: FIELDS.join(','),
  });
  return `https://search.openfoodfacts.org/search?${params}`;
}
