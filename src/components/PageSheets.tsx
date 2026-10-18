import { useState, type FormEvent } from 'react';
import { blockKind, filterValue, filterValues, hasFixedHeight, optionValue, type BlockFilter } from '../lib/blockKinds';
import { categoryOptions } from '../lib/categories';
import { useTable } from '../lib/useTable';
import { COLS } from '../lib/layout';
import { pageTree, subtree, type PageNode } from '../lib/pages';
import { kindOf } from '../lib/projectKinds';
import type { Restorable } from '../lib/pageTemplates';
import { toast } from '../lib/toast';
import type { Block, UserTab } from '../lib/types';
import Sheet from './Sheet';

export const PAGE_ICONS = [
  '📄', '📝', '🏠', '📋', '💪', '🎯', '💶', '🏋️', '🏃', '🧘', '🚴', '🍎', '🥗', '😴', '💊', '📚', '🎓', '💼', '💡',
  '🗓️', '✈️', '🛒', '🎵', '🎮', '🌱', '🐶', '❤️', '⭐', '🔧', '🎨', '🏦', '🔁', '🏷️', '🧳', '🎬', '📈',
];

export interface PageValues {
  name: string;
  icon: string;
  parentId: string | null;
}

/** Lista plana del árbol con sangría, para elegir «Dentro de…». */
function flatten(nodes: PageNode[], depth = 0): { page: UserTab; depth: number }[] {
  return nodes.flatMap((n) => [{ page: n.page, depth }, ...flatten(n.children, depth + 1)]);
}

/** Crear una página o cambiar su nombre, icono y lugar; también restablecerla y eliminarla. */
export function PageSettings({ page, pages, parentId, onClose, onSave, onMove, onAddChild, onReset, onDelete }: {
  page: UserTab | null;
  pages: UserTab[];
  /** Al crear: dónde va. */
  parentId?: string | null;
  onClose: () => void;
  onSave: (values: PageValues) => Promise<unknown>;
  /** Subir o bajar entre sus hermanas (undefined en la dirección en que no se puede). */
  onMove?: { up?: () => void; down?: () => void };
  onAddChild?: () => void;
  onReset?: () => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(page?.name ?? '');
  const [icon, setIcon] = useState(page?.icon ?? PAGE_ICONS[0]);
  const [parent, setParent] = useState<string>((page ? page.parent_id : parentId) ?? '');
  const [busy, setBusy] = useState(false);
  // No se puede mover una página dentro de sí misma ni de sus subpáginas.
  const blocked = page ? subtree(pages, page.id) : new Set<string>();
  const options = flatten(pageTree(pages)).filter((o) => !blocked.has(o.page.id));
  const parentName = pages.find((p) => p.id === (parentId ?? ''))?.name;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast('Ponle un nombre, por ejemplo «Viajes»', 'error');
    setBusy(true);
    await onSave({ name: name.trim(), icon: icon.trim() || PAGE_ICONS[0], parentId: parent || null });
    setBusy(false);
  };

  return (
    <Sheet
      title={page ? `Ajustes de «${page.name}»` : parentName ? `Nueva subpágina en ${parentName}` : 'Nueva categoría'}
      onClose={onClose}
      footer={
        <>
          {onDelete && (
            <button type="button" className="btn ghost sm danger-text" onClick={onDelete}>
              Eliminar
            </button>
          )}
          <button className="btn primary" form="page-form" disabled={busy}>
            {page ? 'Guardar' : 'Crear'}
          </button>
        </>
      }
    >
      <form id="page-form" className="stack" onSubmit={submit}>
        <label className="field">
          <span>Nombre</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Viajes, Gym, Estudios…" required />
        </label>
        <fieldset className="field">
          <legend>Icono</legend>
          <div className="icon-grid">
            {PAGE_ICONS.map((i) => (
              <button key={i} type="button" className="icon-choice" aria-pressed={icon === i} aria-label={`Icono ${i}`} onClick={() => setIcon(i)}>
                {i}
              </button>
            ))}
          </div>
          <input
            className="icon-input"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            maxLength={4}
            aria-label="Otro icono (escribe o pega un emoji)"
            title="Escribe o pega cualquier emoji"
          />
        </fieldset>
        <label className="field">
          <span>Dentro de</span>
          <select value={parent} onChange={(e) => setParent(e.target.value)}>
            <option value="">— Categoría principal (en el menú) —</option>
            {options.map((o) => (
              <option key={o.page.id} value={o.page.id}>
                {'  '.repeat(o.depth)}
                {o.page.icon} {o.page.name}
              </option>
            ))}
          </select>
        </label>
      </form>
      {page && onMove && (onMove.up || onMove.down) && (
        <div className="field">
          <span>Orden en el menú</span>
          <div className="row">
            <button type="button" className="btn ghost sm" onClick={onMove.up} disabled={!onMove.up}>
              ↑ Subir
            </button>
            <button type="button" className="btn ghost sm" onClick={onMove.down} disabled={!onMove.down}>
              ↓ Bajar
            </button>
          </div>
        </div>
      )}
      {page && (onAddChild || onReset) && (
        <div className="stack subpanel">
          {onAddChild && (
            <button type="button" className="btn ghost" onClick={onAddChild}>
              ＋ Añadir una subpágina
            </button>
          )}
          {onReset && (
            <button type="button" className="btn ghost" onClick={onReset}>
              ↺ Restablecer el diseño original
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}

const WIDTHS = [
  { w: 3, label: '¼' },
  { w: 4, label: '⅓' },
  { w: 6, label: '½' },
  { w: 8, label: '⅔' },
  { w: 9, label: '¾' },
  { w: 12, label: 'Todo' },
];

export interface BlockPatch {
  title: string;
  content: Record<string, unknown>;
  w: number;
  h: number;
}

/** Título, ajustes propios del tipo y tamaño de un bloque. */
export function BlockSettings({ block, onClose, onSave, onDelete }: {
  block: Block;
  onClose: () => void;
  onSave: (patch: BlockPatch) => Promise<void>;
  onDelete: () => void;
}) {
  const kind = blockKind(block.type);
  const [title, setTitle] = useState(block.title);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries((kind?.options ?? []).map((o) => [o.key, optionValue(kind, block.content, o.key)])),
  );
  const [filters, setFilters] = useState<Record<string, string | string[]>>(() =>
    Object.fromEntries((kind?.filters ?? []).map((f) => [f.key, f.source === 'habits' ? filterValues(block.content, f.key) : filterValue(block.content, f.key)])),
  );
  const [w, setW] = useState(block.w);
  const [fixed, setFixed] = useState(() => hasFixedHeight(kind, block.content));
  const [h, setH] = useState(String(block.h));
  const [busy, setBusy] = useState(false);
  const minW = kind?.minW ?? 2;
  const minH = kind?.minH ?? 2;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const height = Number(h);
    if (fixed && (!Number.isInteger(height) || height < 1 || height > 1000)) return toast('El alto tiene que ser un número de filas entre 1 y 1000', 'error');
    setBusy(true);
    await onSave({ title: title.trim(), content: { ...block.content, ...values, ...filters, fixedHeight: fixed }, w, h: fixed ? height : block.h });
    setBusy(false);
  };

  return (
    <Sheet
      title={`Ajustes del bloque ${kind?.name ?? ''}`.trim()}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost sm danger-text" onClick={onDelete}>
            Quitar bloque
          </button>
          <button className="btn primary" form="block-form" disabled={busy}>
            Guardar
          </button>
        </>
      }
    >
      <form id="block-form" className="stack" onSubmit={submit}>
        <label className="field">
          <span>Título</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder={kind?.frame === false ? 'No se muestra en este bloque' : 'Sin título'} />
        </label>
        {kind?.options?.map((o) => {
          const choice = o.choices.find((c) => c.value === values[o.key]);
          return (
            <div key={o.key} className="field">
              <span>{o.label}</span>
              <div className="segmented" role="group" aria-label={o.label}>
                {o.choices.map((c) => (
                  <button key={c.value} type="button" aria-pressed={values[o.key] === c.value} onClick={() => setValues((v) => ({ ...v, [o.key]: c.value }))}>
                    {c.label}
                  </button>
                ))}
              </div>
              {choice && <span className="muted small">{choice.hint}</span>}
            </div>
          );
        })}
        {kind?.filters?.map((f) => (
          <FilterField key={f.key} filter={f} value={filters[f.key]} onChange={(v) => setFilters((prev) => ({ ...prev, [f.key]: v }))} />
        ))}
        <div className="field">
          <span>Ancho</span>
          <div className="segmented" role="group" aria-label="Ancho">
            {WIDTHS.filter((o) => o.w >= minW && o.w <= COLS).map((o) => (
              <button key={o.w} type="button" aria-pressed={w === o.w} onClick={() => setW(o.w)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Alto</span>
          <div className="segmented" role="group" aria-label="Alto">
            <button type="button" aria-pressed={!fixed} onClick={() => setFixed(false)}>
              Automático
            </button>
            <button type="button" aria-pressed={fixed} onClick={() => setFixed(true)}>
              Fijo
            </button>
          </div>
          <span className="muted small">{fixed ? 'Si el contenido no cabe, se desplaza dentro del bloque.' : 'El bloque mide lo que ocupe su contenido.'}</span>
        </div>
        {fixed && (
          <label className="field">
            <span>Alto en filas (cada fila, unos 28 px)</span>
            <input type="number" min={minH} max={1000} value={h} onChange={(e) => setH(e.target.value)} className="num-input" />
          </label>
        )}
        <p className="muted small">En el ordenador también puedes arrastrar el borde o la esquina del bloque: al estirarlo hacia abajo, su alto pasa a ser fijo. En el móvil los bloques ocupan todo el ancho y miden lo que su contenido.</p>
      </form>
    </Sheet>
  );
}

/** Filtro de un bloque con las opciones sacadas de los datos del usuario. */
function FilterField({ filter, value, onChange }: { filter: BlockFilter; value: string | string[] | undefined; onChange: (v: string | string[]) => void }) {
  const projects = useTable('projects');
  const categories = useTable('finance_categories');
  const habits = useTable('habits');
  const goals = useTable('goals');

  if (filter.source === 'habits') {
    const chosen = Array.isArray(value) ? value : [];
    const active = habits.rows.filter((h) => h.active);
    return (
      <fieldset className="field">
        <legend>{filter.label}</legend>
        <span className="muted small">{chosen.length === 0 ? `${filter.allLabel ?? 'Todos'}. Marca algunos para mostrar solo esos.` : `${chosen.length} elegidos.`}</span>
        <div className="check-list">
          {active.map((h) => (
            <label key={h.id} className="check">
              <input
                type="checkbox"
                checked={chosen.includes(h.id)}
                onChange={(e) => onChange(e.target.checked ? [...chosen, h.id] : chosen.filter((id) => id !== h.id))}
              />
              <span>
                {h.icon} {h.name}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  const options =
    filter.source === 'project'
      ? // Primero los proyectos de los tipos para los que está pensado el bloque.
        [...projects.rows]
          .sort((a, b) => Number(!filter.projectKinds?.includes(a.kind)) - Number(!filter.projectKinds?.includes(b.kind)))
          .map((p) => ({ id: p.id, label: `${kindOf(p).icon} ${p.name}${p.status === 'activo' ? '' : ' (no activo)'}` }))
      : filter.source === 'expense_category'
        ? categoryOptions(categories.rows, 'gasto')
        : filter.source === 'habit'
          ? habits.rows.filter((h) => h.active).map((h) => ({ id: h.id, label: `${h.icon} ${h.name}` }))
          : goals.rows.filter((g) => g.unit.trim() === '€' || g.area === 'finanzas').map((g) => ({ id: g.id, label: g.title }));
  const current = typeof value === 'string' ? value : '';
  return (
    <label className="field">
      <span>{filter.label}</span>
      <select value={current} onChange={(e) => onChange(e.target.value)}>
        <option value="">
          {filter.allLabel ?? (options.length === 0 ? 'No hay ninguno todavía' : filter.source === 'project' ? 'El primero activo de su tipo' : 'El primero de la lista')}
        </option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Categorías por defecto que se han borrado y se pueden recuperar con su diseño original. */
export function RestoreSheet({ items, onClose, onRestore }: {
  items: Restorable[];
  onClose: () => void;
  onRestore: (item: Restorable) => Promise<unknown>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <Sheet title="Recuperar categorías por defecto" onClose={onClose}>
      {items.length === 0 ? (
        <p className="empty">Tienes todas las categorías por defecto.</p>
      ) : (
        <ul className="list">
          {items.map((it) => (
            <li key={it.seed.template}>
              <span>
                <span aria-hidden>{it.seed.icon}</span> {it.seed.name}
                {(it.seed.children?.length ?? 0) > 0 && <span className="muted small"> · con {it.seed.children!.map((c) => c.name).join(', ')}</span>}
              </span>
              <button
                type="button"
                className="btn sm primary"
                disabled={busy !== null}
                onClick={async () => {
                  setBusy(it.seed.template!);
                  await onRestore(it);
                  setBusy(null);
                }}
              >
                {busy === it.seed.template ? 'Recuperando…' : 'Recuperar'}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="muted small">Tus datos (movimientos, hábitos, tareas…) nunca se borran al quitar una categoría: al recuperarla vuelves a verlos.</p>
    </Sheet>
  );
}
