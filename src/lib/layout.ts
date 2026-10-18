// Rejilla del panel libre: 12 columnas, los bloques se recolocan hacia arriba para no dejar
// huecos (igual que hace react-grid-layout al pintarlos). Funciones puras: tests/layout.test.ts.

export const COLS = 12;

export interface Rect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(n) || 0));

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Orden de lectura (de arriba abajo y de izquierda a derecha): el orden en que se apilan en el móvil. */
export const readingOrder = <T extends Rect>(items: T[]) =>
  [...items].sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));

/** Ajusta tamaños y posiciones a la rejilla y sube cada bloque hasta chocar con otro (sin solapes). */
export function compact<T extends Rect>(items: T[]): T[] {
  const placed: T[] = [];
  for (const item of readingOrder(items)) {
    const w = clamp(item.w, 1, COLS);
    const box = { ...item, w, x: clamp(item.x, 0, COLS - w), h: clamp(item.h, 1, 1000), y: clamp(item.y, 0, 10000) };
    while (box.y > 0 && !placed.some((p) => overlaps(p, { ...box, y: box.y - 1 }))) box.y--;
    for (let hit = placed.find((p) => overlaps(p, box)); hit; hit = placed.find((p) => overlaps(p, box))) box.y = hit.y + hit.h;
    placed.push(box);
  }
  return placed;
}

/** Primera fila libre por debajo de todos los bloques. */
export const bottom = (items: Rect[]) => items.reduce((m, r) => Math.max(m, r.y + r.h), 0);

/** Sitio para un bloque nuevo de w×h: el primer hueco libre (de arriba abajo, de izquierda a derecha). */
export function placeNew(items: Rect[], w: number, h: number): { x: number; y: number; w: number; h: number } {
  const width = clamp(w, 1, COLS);
  const end = bottom(items);
  for (let y = 0; y < end; y++) {
    for (let x = 0; x + width <= COLS; x++) {
      const box = { id: '', x, y, w: width, h };
      if (!items.some((r) => overlaps(r, box))) return { x, y, w: width, h };
    }
  }
  return { x: 0, y: end, w: width, h };
}

/**
 * Sube (dir = -1) o baja (+1) un bloque un puesto en el orden de lectura intercambiando su sitio
 * con el vecino. Es lo que hacen las flechas del móvil, donde no se puede arrastrar. Devuelve null
 * si con esos tamaños no se puede (p. ej., un bloque ancho no cabe delante de otro estrecho que
 * siempre sube a ocupar el hueco de al lado).
 */
export function moveInOrder<T extends Rect>(items: T[], id: string, dir: -1 | 1): T[] | null {
  const order = readingOrder(compact(items));
  const from = order.findIndex((r) => r.id === id);
  const to = from + dir;
  if (from < 0 || to < 0 || to >= order.length) return null;
  const a = order[from];
  const b = order[to];
  // `first` es el que tiene que quedar delante: ocupa el sitio de arriba a la izquierda de los dos.
  const first = dir < 0 ? a : b;
  const second = dir < 0 ? b : a;
  const top = Math.min(a.y, b.y);
  const left = Math.min(a.x, b.x);
  const place = (fx: number, sx: number, sy: number) =>
    compact(
      order.map((r) => {
        if (r.id === first.id) return { ...r, x: fx, y: top };
        if (r.id === second.id) return { ...r, x: sx, y: sy };
        return r;
      }),
    );
  const candidates: T[][] = [];
  // Si caben los dos en una fila: uno al lado del otro. Si no, uno encima del otro.
  if (first.w + second.w <= COLS) {
    const fx = Math.min(left, COLS - first.w - second.w);
    candidates.push(place(fx, fx + first.w, top));
  }
  candidates.push(place(Math.min(left, COLS - first.w), Math.min(Math.max(a.x, b.x), COLS - second.w), top + first.h));
  const indexIn = (layout: T[]) => readingOrder(layout).findIndex((r) => r.id === id);
  return candidates.find((c) => indexIn(c) === to) ?? candidates.find((c) => (indexIn(c) - from) * dir > 0) ?? null;
}

/** Bloques cuya posición o tamaño ha cambiado, con sus valores nuevos (lo que hay que guardar). */
export function changes(before: Rect[], after: Rect[]): Rect[] {
  const old = new Map(before.map((r) => [r.id, r]));
  return after
    .filter((r) => {
      const o = old.get(r.id);
      return !o || o.x !== r.x || o.y !== r.y || o.w !== r.w || o.h !== r.h;
    })
    .map(({ id, x, y, w, h }) => ({ id, x, y, w, h }));
}
