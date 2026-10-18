// Árbol de páginas («categorías») del usuario. Funciones puras: tests/pages.test.ts.

import { bySortOrder } from './blocks';
import type { UserTab } from './types';

export interface PageNode {
  page: UserTab;
  children: PageNode[];
}

/** Hijas directas de `parentId` (null: las de primer nivel), en su orden. */
export const childrenOf = (pages: UserTab[], parentId: string | null) =>
  pages.filter((p) => (p.parent_id ?? null) === parentId).sort(bySortOrder);

/** Árbol completo. Una página cuya madre ya no existe se trata como de primer nivel. */
export function pageTree(pages: UserTab[]): PageNode[] {
  const ids = new Set(pages.map((p) => p.id));
  const build = (parentId: string | null, seen: Set<string>): PageNode[] =>
    pages
      .filter((p) => (parentId === null ? !p.parent_id || !ids.has(p.parent_id) : p.parent_id === parentId))
      .filter((p) => !seen.has(p.id))
      .sort(bySortOrder)
      .map((page) => ({ page, children: build(page.id, new Set([...seen, page.id])) }));
  return build(null, new Set());
}

/** Camino desde la categoría principal hasta la madre de `id` (para las migas de pan). */
export function ancestors(pages: UserTab[], id: string): UserTab[] {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const path: UserTab[] = [];
  const seen = new Set([id]);
  for (let cur = byId.get(byId.get(id)?.parent_id ?? ''); cur && !seen.has(cur.id); cur = byId.get(cur.parent_id ?? '')) {
    seen.add(cur.id);
    path.unshift(cur);
  }
  return path;
}

/** `id` y todas sus subpáginas, a cualquier profundidad. */
export function subtree(pages: UserTab[], id: string): Set<string> {
  const out = new Set([id]);
  for (let added = true; added; ) {
    added = false;
    for (const p of pages) {
      if (p.parent_id && out.has(p.parent_id) && !out.has(p.id)) {
        out.add(p.id);
        added = true;
      }
    }
  }
  return out;
}

/** ¿Se puede colgar `id` de `parentId`? No dentro de sí misma ni de una de sus subpáginas. */
export const canMoveInto = (pages: UserTab[], id: string, parentId: string | null) => !parentId || !subtree(pages, id).has(parentId);

/**
 * Coloca `id` como hija de `parentId` en la posición `index` (entre sus nuevas hermanas) y
 * devuelve los cambios que hay que guardar: solo las páginas cuyo padre u orden cambian.
 */
export function placePage(pages: UserTab[], id: string, parentId: string | null, index: number) {
  const siblings = childrenOf(pages, parentId).filter((p) => p.id !== id);
  const moving = pages.find((p) => p.id === id);
  if (!moving || !canMoveInto(pages, id, parentId)) return [];
  const at = Math.max(0, Math.min(index, siblings.length));
  const next = [...siblings.slice(0, at), moving, ...siblings.slice(at)];
  return next
    .map((p, i) => ({ id: p.id, parent_id: parentId, sort_order: i }))
    .filter((c) => {
      const p = pages.find((x) => x.id === c.id)!;
      return p.sort_order !== c.sort_order || (p.parent_id ?? null) !== c.parent_id;
    });
}

/** Página que se abre al entrar: la recordada si sigue existiendo; si no, la primera. */
export function initialPage(pages: UserTab[], remembered: string | null): UserTab | undefined {
  return pages.find((p) => p.id === remembered) ?? pageTree(pages)[0]?.page;
}
