import { useState, type FormEvent, type ReactNode } from 'react';
import { bySortOrder, moveBy, nextSortOrder } from '../lib/blocks';
import type { TabId } from '../lib/tabs';
import { toast } from '../lib/toast';
import type { UserTab } from '../lib/types';
import { useTable } from '../lib/useTable';
import CustomTab from '../pages/CustomTab';
import Sheet from './Sheet';

const MAX_TABS = 12;

export const TAB_ICONS = [
  '📄', '📝', '🏋️', '🏃', '🧘', '🚴', '🍎', '🥗', '😴', '💊', '📚', '🎓', '💼', '💡', '🎯', '🗓️',
  '✈️', '🏠', '💰', '🛒', '🎵', '🎮', '🌱', '🐶', '❤️', '⭐', '🔧', '🎨',
];

const activeKey = (section: TabId) => `pv:subtab:${section}`;

const readActive = (section: TabId) => {
  try {
    return localStorage.getItem(activeKey(section));
  } catch {
    return null;
  }
};

/**
 * Pestaña principal con sus sub-pestañas: la vista fija (`children`) y las que crea el usuario.
 * «Personalizar» activa el modo de edición: crear, renombrar, ordenar y borrar sub-pestañas y sus bloques.
 */
export default function SectionTabs({ section, label, icon, children }: {
  section: TabId;
  label: string;
  icon: string;
  children: ReactNode;
}) {
  const tabs = useTable('tabs');
  const [activeId, setActiveId] = useState<string | null>(() => readActive(section));
  const [editing, setEditing] = useState(false);
  const [editor, setEditor] = useState<{ tab: UserTab | null } | null>(null);

  const mine = tabs.rows.filter((t) => t.section === section).sort(bySortOrder);
  // Si la recordada ya no existe (borrada en otro dispositivo), se vuelve a la vista fija.
  const active = mine.find((t) => t.id === activeId) ?? null;

  const select = (id: string | null) => {
    setActiveId(id);
    try {
      if (id) localStorage.setItem(activeKey(section), id);
      else localStorage.removeItem(activeKey(section));
    } catch {
      // sin almacenamiento: solo no se recuerda
    }
  };

  const move = async (tab: UserTab, dir: -1 | 1) => {
    for (const change of moveBy(mine, tab.id, dir)) await tabs.update(change.id, { sort_order: change.sort_order });
  };

  const save = async (values: { name: string; icon: string }) => {
    if (editor?.tab) {
      if (await tabs.update(editor.tab.id, values)) setEditor(null);
      return;
    }
    if (mine.length >= MAX_TABS) return toast(`Como mucho ${MAX_TABS} sub-pestañas por sección`, 'error');
    const created = await tabs.add({ section, parent_id: null, ...values, sort_order: nextSortOrder(mine) });
    if (created) {
      setEditor(null);
      select(created.id);
      toast(`Sub-pestaña «${created.name}» creada: añade tus bloques`);
    }
  };

  const remove = async (tab: UserTab) => {
    if (!window.confirm(`¿Eliminar la sub-pestaña «${tab.name}» y todos sus bloques? No se puede deshacer.`)) return;
    if (await tabs.remove(tab.id)) {
      setEditor(null);
      select(null);
    }
  };

  const hasBar = mine.length > 0 || editing;

  return (
    <div className="stack-lg">
      <div className={`subtabs ${hasBar ? '' : 'is-compact'}`}>
        {hasBar && (
          <nav className="subtab-list" aria-label={`Sub-pestañas de ${label}`}>
            <button type="button" className="subtab" aria-current={!active ? 'page' : undefined} onClick={() => select(null)}>
              <span aria-hidden>{icon}</span> {label}
            </button>
            {mine.map((t) => (
              <button key={t.id} type="button" className="subtab" aria-current={active?.id === t.id ? 'page' : undefined} onClick={() => select(t.id)}>
                <span aria-hidden>{t.icon}</span> {t.name}
              </button>
            ))}
          </nav>
        )}
        {/* Fuera de la fila desplazable: en el móvil, al final de la fila quedaría escondido. */}
        <div className="row subtab-actions">
          {editing && (
            <button type="button" className="btn ghost sm subtab-add" onClick={() => setEditor({ tab: null })}>
              + Sub-pestaña
            </button>
          )}
          <button type="button" className={`btn sm ${editing ? 'primary' : 'ghost'}`} aria-pressed={editing} onClick={() => setEditing(!editing)}>
            {editing ? '✓ Listo' : '✎ Personalizar'}
          </button>
        </div>
      </div>

      {editing && (
        <p className="customize-hint" role="status">
          {active
            ? 'Modo personalizar: añade, ordena o quita bloques y cambia el nombre de la sub-pestaña. Pulsa «Listo» al terminar.'
            : `La vista «${label}» es fija. Crea una sub-pestaña con «+ Sub-pestaña» para añadir tus propios bloques.`}
        </p>
      )}

      {active ? (
        <CustomTab
          key={active.id}
          tab={active}
          editing={editing}
          onCustomize={() => setEditing(true)}
          onEditTab={() => setEditor({ tab: active })}
          onMove={(dir) => void move(active, dir)}
          canMove={{ left: mine[0]?.id !== active.id, right: mine[mine.length - 1]?.id !== active.id }}
        />
      ) : tabs.loading && activeId ? (
        // Hasta saber si la sub-pestaña recordada existe, no se enseña la vista fija para no dar un salto.
        <p className="empty">Cargando…</p>
      ) : (
        children
      )}

      {editor && (
        <TabEditor
          tab={editor.tab}
          sectionLabel={label}
          onClose={() => setEditor(null)}
          onSave={save}
          onDelete={editor.tab ? () => void remove(editor.tab!) : undefined}
        />
      )}
    </div>
  );
}

function TabEditor({ tab, sectionLabel, onClose, onSave, onDelete }: {
  tab: UserTab | null;
  sectionLabel: string;
  onClose: () => void;
  onSave: (values: { name: string; icon: string }) => Promise<unknown>;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(tab?.name ?? '');
  const [icon, setIcon] = useState(tab?.icon ?? TAB_ICONS[0]);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast('Ponle un nombre, por ejemplo «Gym»', 'error');
    setBusy(true);
    await onSave({ name: name.trim(), icon: icon.trim() || TAB_ICONS[0] });
    setBusy(false);
  };

  return (
    <Sheet
      title={tab ? `Editar «${tab.name}»` : `Nueva sub-pestaña en ${sectionLabel}`}
      onClose={onClose}
      footer={
        <>
          {onDelete && (
            <button type="button" className="btn ghost sm danger-text" onClick={onDelete}>
              Eliminar
            </button>
          )}
          <button className="btn primary" form="tab-form" disabled={busy}>
            {tab ? 'Guardar' : 'Crear'}
          </button>
        </>
      }
    >
      <form id="tab-form" className="stack" onSubmit={submit}>
        <label className="field">
          <span>Nombre</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Gym, Estudio, Viaje…" required />
        </label>
        <fieldset className="field">
          <legend>Icono</legend>
          <div className="icon-grid">
            {TAB_ICONS.map((i) => (
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
      </form>
    </Sheet>
  );
}
