import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { backend } from '../backend';
import Sheet from '../components/Sheet';
import { Card, Empty, IconButton } from '../components/ui';
import { categoryOptions, categoryPath, categoryTree, siblingsOf } from '../lib/categories';
import { CATEGORY_COLORS, CATEGORY_ICONS } from '../lib/defaults';
import { notifyDataChanged } from '../lib/events';
import { toast } from '../lib/toast';
import type { FinanceCategory, Transaction, TxType } from '../lib/types';
import type { TableApi } from '../lib/useTable';

/** Qué se edita en la hoja: una categoría existente o una nueva (con su padre, si es subcategoría). */
type Editing = { category: FinanceCategory } | { parentId: string | null };

const TYPE_LABEL: Record<TxType, string> = { gasto: 'Gastos', ingreso: 'Ingresos' };

export default function FinanceCategories({ categories, transactions }: {
  categories: TableApi<'finance_categories'>;
  transactions: Transaction[];
}) {
  const [type, setType] = useState<TxType>('gasto');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [removing, setRemoving] = useState<FinanceCategory | null>(null);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of transactions) m.set(t.category_id, (m.get(t.category_id) ?? 0) + 1);
    return m;
  }, [transactions]);

  const tree = categoryTree(categories.rows, type, showArchived);
  const archivedCount = categories.rows.filter((c) => c.type === type && c.archived).length;

  /** Sube o baja una posición entre sus hermanas y renumera el orden. */
  const move = async (cat: FinanceCategory, dir: -1 | 1) => {
    const siblings = siblingsOf(categories.rows, cat);
    const i = siblings.findIndex((s) => s.id === cat.id);
    const j = i + dir;
    if (j < 0 || j >= siblings.length) return;
    [siblings[i], siblings[j]] = [siblings[j], siblings[i]];
    for (const [index, s] of siblings.entries()) {
      if (s.sort_order !== index + 1) await categories.update(s.id, { sort_order: index + 1 });
    }
  };

  const toggleArchived = async (cat: FinanceCategory) => {
    const ok = await categories.update(cat.id, { archived: !cat.archived });
    if (ok) toast(cat.archived ? `«${cat.name}» vuelve a estar activa` : `«${cat.name}» archivada: ya no aparece al añadir movimientos`);
  };

  const row = (cat: FinanceCategory, index: number, total: number) => (
    <div className={`cat-row ${cat.archived ? 'is-archived' : ''}`}>
      <span className="cat-chip lg" style={{ '--cat': cat.color } as CSSProperties} aria-hidden>
        {cat.icon}
      </span>
      <span className="cat-name">
        {cat.name}
        {cat.archived && <span className="badge">archivada</span>}
        <span className="muted small">{counts.get(cat.id) ?? 0} mov.</span>
      </span>
      <span className="cat-actions">
        <IconButton label={`Subir ${cat.name}`} onClick={() => void move(cat, -1)} disabled={index === 0}>
          ↑
        </IconButton>
        <IconButton label={`Bajar ${cat.name}`} onClick={() => void move(cat, 1)} disabled={index === total - 1}>
          ↓
        </IconButton>
        <IconButton label={`Editar ${cat.name}`} onClick={() => setEditing({ category: cat })}>
          ✎
        </IconButton>
      </span>
    </div>
  );

  return (
    <div className="stack">
      <Card
        title="Categorías"
        action={
          <button className="btn primary sm" onClick={() => setEditing({ parentId: null })}>
            + Nueva categoría
          </button>
        }
      >
        <div className="row between wrap">
          <div className="segmented" role="tablist" aria-label="Tipo de categoría">
            {(['gasto', 'ingreso'] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={type === t} onClick={() => setType(t)}>
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>
          {archivedCount > 0 && (
            <label className="check small">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Mostrar archivadas ({archivedCount})
            </label>
          )}
        </div>

        {tree.length === 0 ? (
          <Empty>{categories.loading ? 'Cargando…' : 'No hay categorías. Crea la primera.'}</Empty>
        ) : (
          <ul className="cat-list">
            {tree.map((parent, i) => (
              <li key={parent.id}>
                {row(parent, i, tree.length)}
                {parent.children.length > 0 && (
                  <ul className="cat-children">
                    {parent.children.map((child, j) => (
                      <li key={child.id}>{row(child, j, parent.children.length)}</li>
                    ))}
                  </ul>
                )}
                {!parent.archived && (
                  <button className="link-btn add-sub" onClick={() => setEditing({ parentId: parent.id })}>
                    + Subcategoría en {parent.name}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="muted small">
        Archivar oculta la categoría al añadir movimientos, pero conserva su historial en los informes. Para eliminar una categoría
        con movimientos hay que fusionarla con otra.
      </p>

      {editing && (
        <CategoryEditor
          key={'category' in editing ? editing.category.id : `nueva-${editing.parentId}`}
          editing={editing}
          type={type}
          all={categories.rows}
          onClose={() => setEditing(null)}
          onSave={async (values) => {
            const ok =
              'category' in editing
                ? await categories.update(editing.category.id, values)
                : await categories.add({
                    ...values,
                    type,
                    archived: false,
                    sort_order: categories.rows.filter((c) => c.type === type && c.parent_id === values.parent_id).length + 1,
                  });
            if (ok) setEditing(null);
          }}
          onToggleArchived={async (cat) => {
            await toggleArchived(cat);
            setEditing(null);
          }}
          onRemove={(cat) => {
            setEditing(null);
            setRemoving(cat);
          }}
        />
      )}

      {removing && (
        <CategoryRemover
          category={removing}
          all={categories.rows}
          counts={counts}
          onClose={() => setRemoving(null)}
          onDelete={async () => {
            const ok = await categories.remove(removing.id);
            if (ok) {
              toast(`«${removing.name}» eliminada`);
              notifyDataChanged(); // subcategorías y presupuestos caen en cascada
              setRemoving(null);
            }
          }}
          onMerge={async (targetId) => {
            try {
              const moved = await backend.mergeCategory(removing.id, targetId);
              const byId = new Map(categories.rows.map((c) => [c.id, c]));
              toast(`«${removing.name}» fusionada con «${categoryPath(byId, targetId)}» (${moved} movimientos)`);
              notifyDataChanged();
              setRemoving(null);
            } catch (e) {
              toast(e instanceof Error ? e.message : String(e), 'error');
            }
          }}
          onArchive={async () => {
            await toggleArchived(removing);
            setRemoving(null);
          }}
        />
      )}
    </div>
  );
}

interface EditorValues {
  name: string;
  icon: string;
  color: string;
  parent_id: string | null;
}

function CategoryEditor({ editing, type, all, onClose, onSave, onToggleArchived, onRemove }: {
  editing: Editing;
  type: TxType;
  all: FinanceCategory[];
  onClose: () => void;
  onSave: (values: EditorValues) => Promise<void>;
  onToggleArchived: (cat: FinanceCategory) => Promise<void>;
  onRemove: (cat: FinanceCategory) => void;
}) {
  const existing = 'category' in editing ? editing.category : null;
  const initialParent = existing ? existing.parent_id : (editing as { parentId: string | null }).parentId;
  const parentCat = all.find((c) => c.id === initialParent);
  const catType = existing?.type ?? type;

  const [name, setName] = useState(existing?.name ?? '');
  const [icon, setIcon] = useState(existing?.icon ?? parentCat?.icon ?? '🏷️');
  const [color, setColor] = useState(existing?.color ?? parentCat?.color ?? CATEGORY_COLORS[0]);
  const [parentId, setParentId] = useState<string | null>(initialParent ?? null);
  const [busy, setBusy] = useState(false);

  const hasChildren = !!existing && all.some((c) => c.parent_id === existing.id);
  // Incluye el padre actual aunque esté archivado: si no, guardar movería la subcategoría sin avisar.
  const parentChoices = all.filter(
    (c) => c.type === catType && !c.parent_id && c.id !== existing?.id && (!c.archived || c.id === initialParent),
  );

  const title = existing ? `Editar «${existing.name}»` : parentCat ? `Nueva subcategoría en ${parentCat.name}` : `Nueva categoría de ${TYPE_LABEL[catType].toLowerCase()}`;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    await onSave({ name: name.trim(), icon: icon.trim() || '🏷️', color, parent_id: parentId });
    setBusy(false);
  };

  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={
        <>
          {existing && (
            <div className="row">
              <button type="button" className="btn ghost sm" onClick={() => void onToggleArchived(existing)}>
                {existing.archived ? 'Restaurar' : 'Archivar'}
              </button>
              <button type="button" className="btn ghost sm danger-text" onClick={() => onRemove(existing)}>
                Eliminar…
              </button>
            </div>
          )}
          <button className="btn primary" form="category-form" disabled={busy || !name.trim()}>
            {existing ? 'Guardar' : 'Crear'}
          </button>
        </>
      }
    >
      <form id="category-form" onSubmit={submit} className="stack">
        <div className="cat-preview">
          <span className="cat-chip xl" style={{ '--cat': color } as CSSProperties} aria-hidden>
            {icon || '🏷️'}
          </span>
          <label className="field grow">
            <span>Nombre</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Mascotas" required />
          </label>
        </div>

        <fieldset className="field">
          <legend>Icono</legend>
          <div className="icon-grid">
            {CATEGORY_ICONS.map((i) => (
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

        <fieldset className="field">
          <legend>Color</legend>
          <div className="swatches" role="radiogroup" aria-label="Color">
            {CATEGORY_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                aria-label={`Color ${c}`}
                className="swatch"
                style={{ background: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </fieldset>

        <label className="field">
          <span>Dentro de</span>
          <select
            value={parentId ?? ''}
            onChange={(e) => setParentId(e.target.value || null)}
            disabled={hasChildren}
          >
            <option value="">— Ninguna (categoría principal)</option>
            {parentChoices.map((p) => (
              <option key={p.id} value={p.id}>
                {p.icon} {p.name}
              </option>
            ))}
          </select>
          {hasChildren && <span className="muted small">Tiene subcategorías, así que solo puede ser categoría principal.</span>}
        </label>
      </form>
    </Sheet>
  );
}

function CategoryRemover({ category, all, counts, onClose, onDelete, onMerge, onArchive }: {
  category: FinanceCategory;
  all: FinanceCategory[];
  counts: Map<string, number>;
  onClose: () => void;
  onDelete: () => Promise<void>;
  onMerge: (targetId: string) => Promise<void>;
  onArchive: () => Promise<void>;
}) {
  const children = all.filter((c) => c.parent_id === category.id);
  const used = [category, ...children].reduce((n, c) => n + (counts.get(c.id) ?? 0), 0);
  const targets = categoryOptions(all, category.type).filter((o) => o.id !== category.id && !children.some((c) => c.id === o.id));
  const [target, setTarget] = useState(targets[0]?.id ?? '');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };

  return (
    <Sheet title={`Eliminar «${category.name}»`} onClose={onClose}>
      {used === 0 ? (
        <div className="stack">
          <p>
            No tiene movimientos.
            {children.length > 0 && ` Se eliminarán también sus ${children.length} subcategorías.`} Esta acción no se puede deshacer.
          </p>
          <button className="btn danger" disabled={busy} onClick={() => void run(onDelete)}>
            Eliminar
          </button>
        </div>
      ) : (
        <div className="stack">
          <p>
            Tiene <strong>{used} movimientos</strong>
            {children.length > 0 && ' (contando sus subcategorías)'}. Para eliminarla, elige a qué categoría pasan:
          </p>
          {targets.length === 0 ? (
            <Empty>No hay otra categoría del mismo tipo. Crea una antes, o archívala.</Empty>
          ) : (
            <>
              <label className="field">
                <span>Pasar los movimientos a</span>
                <select value={target} onChange={(e) => setTarget(e.target.value)}>
                  {targets.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              {children.length > 0 && (
                <p className="muted small">
                  Sus subcategorías pasarán a la categoría elegida (si eliges una subcategoría, también se fundirán en ella).
                </p>
              )}
              <button className="btn danger" disabled={busy || !target} onClick={() => void run(() => onMerge(target))}>
                Fusionar y eliminar
              </button>
            </>
          )}
          {!category.archived && (
            <button className="btn ghost" disabled={busy} onClick={() => void run(onArchive)}>
              Mejor archivarla (conserva el historial)
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}
