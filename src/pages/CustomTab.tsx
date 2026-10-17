import { useState, type FormEvent } from 'react';
import { BLOCK_COMPONENTS } from '../blocks';
import Sheet from '../components/Sheet';
import { Card, Empty, IconButton } from '../components/ui';
import { blockKind, BLOCK_KINDS, bySortOrder, moveBy, nextSortOrder, readChecklist, RESET_LABEL, type BlockKind, type ChecklistReset } from '../lib/blocks';
import { toast } from '../lib/toast';
import type { Block, UserTab } from '../lib/types';
import { useTable } from '../lib/useTable';

const MAX_BLOCKS = 30;

/** Sub-pestaña creada por el usuario: sus bloques y, en modo personalizar, las herramientas para montarla. */
export default function CustomTab({ tab, editing, onCustomize, onEditTab, onMove, canMove }: {
  tab: UserTab;
  editing: boolean;
  onCustomize: () => void;
  onEditTab: () => void;
  onMove: (dir: -1 | 1) => void;
  canMove: { left: boolean; right: boolean };
}) {
  const blocks = useTable('blocks');
  const [gallery, setGallery] = useState(false);
  const [settings, setSettings] = useState<Block | null>(null);
  const mine = blocks.rows.filter((b) => b.tab_id === tab.id).sort(bySortOrder);

  const add = async (kind: BlockKind) => {
    if (mine.length >= MAX_BLOCKS) return toast(`Como mucho ${MAX_BLOCKS} bloques por sub-pestaña`, 'error');
    const created = await blocks.add({ tab_id: tab.id, type: kind.type, title: kind.name, content: kind.empty(), sort_order: nextSortOrder(mine) });
    if (created) {
      setGallery(false);
      toast(`Bloque «${kind.name}» añadido`);
    }
  };

  const move = async (block: Block, dir: -1 | 1) => {
    for (const change of moveBy(mine, block.id, dir)) await blocks.update(change.id, { sort_order: change.sort_order });
  };

  const remove = async (block: Block) => {
    const name = block.title || blockKind(block.type)?.name || 'este bloque';
    if (!window.confirm(`¿Eliminar el bloque «${name}» y su contenido? No se puede deshacer.`)) return;
    if (await blocks.remove(block.id)) setSettings(null);
  };

  return (
    <div className="stack">
      <div className="page-head row between">
        <h1>
          <span aria-hidden>{tab.icon}</span> {tab.name}
        </h1>
        {editing && (
          <div className="row">
            <IconButton label="Mover la sub-pestaña a la izquierda" onClick={() => onMove(-1)} disabled={!canMove.left}>
              ←
            </IconButton>
            <IconButton label="Mover la sub-pestaña a la derecha" onClick={() => onMove(1)} disabled={!canMove.right}>
              →
            </IconButton>
            <button type="button" className="btn ghost sm" onClick={onEditTab}>
              ✎ Nombre e icono
            </button>
          </div>
        )}
      </div>

      {blocks.loading ? (
        <Empty>Cargando…</Empty>
      ) : mine.length === 0 && !editing ? (
        <Card>
          <Empty>Esta sub-pestaña aún está vacía.</Empty>
          <div className="row center">
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                onCustomize();
                setGallery(true);
              }}
            >
              + Añadir el primer bloque
            </button>
          </div>
        </Card>
      ) : (
        <div className="block-grid">
          {mine.map((b, i) => {
            const Component = BLOCK_COMPONENTS[b.type];
            const kind = blockKind(b.type);
            const name = b.title || kind?.name || 'Bloque';
            return (
              <Card
                key={b.id}
                className={`block ${editing ? 'is-editing' : ''}`}
                title={
                  b.title || editing ? (
                    <span>
                      <span aria-hidden>{kind?.icon}</span> {b.title || <span className="muted">Sin título</span>}
                    </span>
                  ) : undefined
                }
                action={
                  editing ? (
                    <div className="row block-tools">
                      <IconButton label={`Subir ${name}`} onClick={() => void move(b, -1)} disabled={i === 0}>
                        ↑
                      </IconButton>
                      <IconButton label={`Bajar ${name}`} onClick={() => void move(b, 1)} disabled={i === mine.length - 1}>
                        ↓
                      </IconButton>
                      <IconButton label={`Ajustes de ${name}`} onClick={() => setSettings(b)}>
                        ⚙
                      </IconButton>
                    </div>
                  ) : undefined
                }
              >
                {Component ? (
                  <Component block={b} onSave={async (content) => !!(await blocks.update(b.id, { content }))} />
                ) : (
                  <Empty>Este tipo de bloque no lo entiende esta versión de la app.</Empty>
                )}
              </Card>
            );
          })}
          {editing && (
            <button type="button" className="block-add" onClick={() => setGallery(true)}>
              <span aria-hidden>＋</span>
              Añadir bloque
            </button>
          )}
        </div>
      )}

      {gallery && <BlockGallery onClose={() => setGallery(false)} onPick={(k) => void add(k)} />}
      {settings && (
        <BlockSettings
          key={settings.id}
          // La versión más reciente: los elementos de la checklist pueden haber cambiado desde que se abrió.
          block={mine.find((b) => b.id === settings.id) ?? settings}
          onClose={() => setSettings(null)}
          onSave={async (patch) => {
            if (await blocks.update(settings.id, patch)) setSettings(null);
          }}
          onDelete={() => void remove(settings)}
        />
      )}
    </div>
  );
}

function BlockGallery({ onClose, onPick }: { onClose: () => void; onPick: (kind: BlockKind) => void }) {
  return (
    <Sheet title="Añadir un bloque" onClose={onClose}>
      <ul className="block-gallery">
        {BLOCK_KINDS.map((k) => (
          <li key={k.type}>
            <button type="button" className="block-kind" onClick={() => onPick(k)}>
              <span className="block-kind-icon" aria-hidden>
                {k.icon}
              </span>
              <span className="block-kind-text">
                <strong>{k.name}</strong>
                <span className="muted small">{k.description}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="muted small">Más adelante habrá registros personalizados, gráficos y planes.</p>
    </Sheet>
  );
}

function BlockSettings({ block, onClose, onSave, onDelete }: {
  block: Block;
  onClose: () => void;
  onSave: (patch: Partial<Pick<Block, 'title' | 'content'>>) => Promise<void>;
  onDelete: () => void;
}) {
  const kind = blockKind(block.type);
  const [title, setTitle] = useState(block.title);
  const [reset, setReset] = useState<ChecklistReset>(() => readChecklist(block.content).reset);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const patch: Partial<Pick<Block, 'title' | 'content'>> = { title: title.trim() };
    if (block.type === 'checklist') patch.content = { ...block.content, reset };
    await onSave(patch);
    setBusy(false);
  };

  return (
    <Sheet
      title={`Ajustes del bloque ${kind?.name ?? ''}`.trim()}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost sm danger-text" onClick={onDelete}>
            Eliminar bloque
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
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Sin título" />
        </label>
        {block.type === 'checklist' && (
          <div className="field">
            <span>Reinicio</span>
            <div className="segmented" role="group" aria-label="Reinicio">
              {(Object.keys(RESET_LABEL) as ChecklistReset[]).map((r) => (
                <button key={r} type="button" aria-pressed={reset === r} onClick={() => setReset(r)}>
                  {r === 'nunca' ? 'Nunca' : r === 'diario' ? 'Cada día' : 'Cada semana'}
                </button>
              ))}
            </div>
            <span className="muted small">
              {reset === 'nunca'
                ? 'Lo que marques se queda marcado.'
                : reset === 'diario'
                  ? 'Cada día empieza sin marcar: ideal para rutinas diarias.'
                  : 'Cada lunes empieza sin marcar: ideal para tareas semanales.'}
            </span>
          </div>
        )}
      </form>
    </Sheet>
  );
}
