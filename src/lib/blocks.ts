// Contenido de los bloques básicos (notas, checklist, enlaces) y orden de filas. Funciones puras
// (sin React) para poder probarlas: tests/blocks.test.ts. El catálogo de tipos está en blockKinds.ts.

import { weekStart } from './utils';

export interface NotesContent {
  text: string;
}

export type ChecklistReset = 'nunca' | 'diario' | 'semanal';

export interface ChecklistItem {
  id: string;
  text: string;
  /** Día en que se marcó; con reinicio diario o semanal deja de contar al cambiar de día o de semana. */
  done_on: string | null;
}

export interface ChecklistContent {
  items: ChecklistItem[];
  reset: ChecklistReset;
}

export interface LinkItem {
  id: string;
  title: string;
  url: string;
}

export interface LinksContent {
  links: LinkItem[];
}

export const RESET_LABEL: Record<ChecklistReset, string> = {
  nunca: 'No se reinicia',
  diario: 'Se reinicia cada día',
  semanal: 'Se reinicia cada lunes',
};

// ---------------------------------------------------------------- Lectura tolerante del contenido
// El contenido viene de la base de datos como JSON: si falta algo (o lo escribió una versión
// anterior), se completa en lugar de romper la página.

const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
const arr = (v: unknown) => (Array.isArray(v) ? v : []);
const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

export const readNotes = (c: unknown): NotesContent => ({ text: str(obj(c).text) });

export function readChecklist(c: unknown): ChecklistContent {
  const o = obj(c);
  const reset = o.reset === 'diario' || o.reset === 'semanal' ? o.reset : 'nunca';
  const items = arr(o.items)
    .map(obj)
    .filter((i) => typeof i.id === 'string' && typeof i.text === 'string')
    .map((i) => ({ id: i.id as string, text: i.text as string, done_on: typeof i.done_on === 'string' ? i.done_on : null }));
  return { items, reset };
}

export function readLinks(c: unknown): LinksContent {
  const links = arr(obj(c).links)
    .map(obj)
    .filter((l) => typeof l.id === 'string' && typeof l.url === 'string')
    .map((l) => ({ id: l.id as string, title: str(l.title), url: l.url as string }));
  return { links };
}

// ---------------------------------------------------------------- Checklist

/** ¿Cuenta como hecho hoy? Con reinicio, solo si se marcó hoy (diario) o esta semana (semanal). */
export function isDone(item: ChecklistItem, reset: ChecklistReset, today: string): boolean {
  if (!item.done_on) return false;
  if (reset === 'diario') return item.done_on === today;
  if (reset === 'semanal') return weekStart(item.done_on) === weekStart(today);
  return true;
}

// ---------------------------------------------------------------- Enlaces

/**
 * Normaliza lo que escribe el usuario («example.com», «https://…») a una URL http(s).
 * Devuelve null si no es una web: así nunca se enlaza un `javascript:` ni un `data:`.
 */
export function normalizeUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw || /\s/.test(raw)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.') && url.hostname !== 'localhost') return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Nombre corto para mostrar: el dominio sin «www.». */
export const linkHost = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

// ---------------------------------------------------------------- Orden

/**
 * Mueve un elemento una posición (dir = -1 sube, +1 baja) y devuelve los cambios de
 * sort_order que hay que guardar (solo los que cambian). Renumera 0, 1, 2… para que
 * empates o huecos de versiones anteriores no impidan mover.
 */
export function moveBy<T extends { id: string; sort_order: number }>(sorted: T[], id: string, dir: -1 | 1) {
  const from = sorted.findIndex((r) => r.id === id);
  const to = from + dir;
  if (from < 0 || to < 0 || to >= sorted.length) return [];
  const next = [...sorted];
  [next[from], next[to]] = [next[to], next[from]];
  return next.map((r, i) => ({ id: r.id, sort_order: i })).filter((r, i) => next[i].sort_order !== r.sort_order);
}

export const bySortOrder = <T extends { sort_order: number; created_at?: string }>(a: T, b: T) =>
  a.sort_order - b.sort_order || (a.created_at ?? '').localeCompare(b.created_at ?? '');

/** sort_order para añadir al final. */
export const nextSortOrder = (rows: { sort_order: number }[]) => rows.reduce((m, r) => Math.max(m, r.sort_order + 1), 0);
