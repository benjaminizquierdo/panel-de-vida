import { useEffect, useState, type DragEvent } from 'react';
import { ancestors, canMoveInto, childrenOf, pageTree, type PageNode } from '../lib/pages';
import type { UserTab } from '../lib/types';
import { IconButton } from './ui';

type Drop = { id: string; where: 'before' | 'inside' | 'after' };

const expandedKey = (userId: string) => `pv:expanded:${userId}`;

function readExpanded(userId: string): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(expandedKey(userId)) ?? '[]');
    return new Set(Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

/**
 * Árbol de categorías. En el ordenador es una columna fija; en el móvil, un panel que se abre
 * con ☰. Las páginas se reordenan arrastrándolas (en el ordenador): soltar sobre la mitad de
 * otra la mete dentro; arriba o abajo, antes o después.
 */
export default function Sidebar({ userId, pages, currentId, open, draggable, restorable, onClose, onGo, onCreate, onRestore, onPlace }: {
  userId: string;
  pages: UserTab[];
  currentId: string | undefined;
  open: boolean;
  draggable: boolean;
  restorable: number;
  onClose: () => void;
  onGo: (id: string) => void;
  /** Nueva página dentro de `parentId` (null: categoría principal). */
  onCreate: (parentId: string | null) => void;
  onRestore: () => void;
  /** Colocar `id` dentro de `parentId` en la posición `index`. */
  onPlace: (id: string, parentId: string | null, index: number) => void;
}) {
  const [expanded, setExpanded] = useState(() => readExpanded(userId));
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);

  // La rama de la página abierta siempre se ve desplegada.
  useEffect(() => {
    if (!currentId) return;
    const path = ancestors(pages, currentId).map((p) => p.id);
    if (path.some((id) => !expanded.has(id))) setExpanded((prev) => new Set([...prev, ...path]));
  }, [currentId, pages, expanded]);

  const toggle = (id: string) => {
    const next = new Set(expanded);
    if (!next.delete(id)) next.add(id);
    setExpanded(next);
    try {
      localStorage.setItem(expandedKey(userId), JSON.stringify([...next]));
    } catch {
      // sin almacenamiento: solo no se recuerda
    }
  };

  const whereOf = (e: DragEvent<HTMLElement>): Drop['where'] => {
    const r = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientY - r.top) / r.height;
    return pos < 0.25 ? 'before' : pos > 0.75 ? 'after' : 'inside';
  };

  const finishDrop = (target: UserTab, where: Drop['where']) => {
    if (!dragId || dragId === target.id) return;
    if (where === 'inside') {
      if (!canMoveInto(pages, dragId, target.id)) return;
      onPlace(dragId, target.id, childrenOf(pages, target.id).length);
      if (!expanded.has(target.id)) toggle(target.id);
      return;
    }
    const parent = target.parent_id ?? null;
    if (!canMoveInto(pages, dragId, parent)) return;
    const siblings = childrenOf(pages, parent).filter((p) => p.id !== dragId);
    const index = siblings.findIndex((p) => p.id === target.id) + (where === 'after' ? 1 : 0);
    onPlace(dragId, parent, index);
  };

  const renderNode = (node: PageNode, depth: number) => {
    const { page } = node;
    const hasChildren = node.children.length > 0;
    const isOpen = expanded.has(page.id);
    const target = drop?.id === page.id ? drop.where : null;
    return (
      <li key={page.id}>
        <div
          className={`tree-row ${target ? `drop-${target}` : ''} ${dragId === page.id ? 'is-dragging' : ''}`}
          style={{ paddingLeft: `${depth * 14 + 4}px` }}
          draggable={draggable}
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', page.name);
            e.dataTransfer.effectAllowed = 'move';
            setDragId(page.id);
          }}
          onDragEnd={() => {
            setDragId(null);
            setDrop(null);
          }}
          onDragOver={(e) => {
            if (!dragId || dragId === page.id) return;
            const where = whereOf(e);
            const parent = where === 'inside' ? page.id : (page.parent_id ?? null);
            if (!canMoveInto(pages, dragId, parent)) return;
            e.preventDefault();
            if (drop?.id !== page.id || drop.where !== where) setDrop({ id: page.id, where });
          }}
          onDragLeave={() => setDrop((d) => (d?.id === page.id ? null : d))}
          onDrop={(e) => {
            e.preventDefault();
            finishDrop(page, whereOf(e));
            setDrop(null);
            setDragId(null);
          }}
        >
          {hasChildren ? (
            <button type="button" className="tree-toggle" aria-expanded={isOpen} aria-label={`${isOpen ? 'Plegar' : 'Desplegar'} ${page.name}`} onClick={() => toggle(page.id)}>
              {isOpen ? '▾' : '▸'}
            </button>
          ) : (
            <span className="tree-toggle" aria-hidden />
          )}
          <button
            type="button"
            className="tree-link"
            aria-current={currentId === page.id ? 'page' : undefined}
            title={page.name}
            onClick={() => onGo(page.id)}
          >
            <span aria-hidden>{page.icon}</span>
            <span className="tree-name">{page.name}</span>
          </button>
          <IconButton label={`Nueva subpágina en ${page.name}`} onClick={() => onCreate(page.id)}>
            ＋
          </IconButton>
        </div>
        {hasChildren && isOpen && <ul className="tree">{node.children.map((c) => renderNode(c, depth + 1))}</ul>}
      </li>
    );
  };

  return (
    <>
      {open && <div className="drawer-backdrop" onClick={onClose} aria-hidden />}
      <aside className={`sidebar ${open ? 'is-open' : ''}`} aria-label="Categorías">
        <div className="sidebar-head">
          <strong>Categorías</strong>
          <span className="drawer-close">
            <IconButton label="Cerrar el menú" onClick={onClose}>
              ✕
            </IconButton>
          </span>
        </div>
        <nav aria-label="Categorías y subpáginas">
          <ul className="tree">{pageTree(pages).map((n) => renderNode(n, 0))}</ul>
        </nav>
        <div className="sidebar-foot stack">
          <button type="button" className="btn ghost sm" onClick={() => onCreate(null)}>
            ＋ Nueva categoría
          </button>
          {restorable > 0 && (
            <button type="button" className="link-btn small" onClick={onRestore}>
              ↺ Recuperar categorías por defecto ({restorable})
            </button>
          )}
          {draggable && pages.length > 1 && <p className="muted small">Arrastra una categoría para ordenarla o meterla dentro de otra.</p>}
        </div>
      </aside>
    </>
  );
}
