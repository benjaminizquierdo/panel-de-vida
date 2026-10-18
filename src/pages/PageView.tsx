import { lazy, Suspense, useMemo, useState } from 'react';
import BlockCatalog from '../components/BlockCatalog';
import BlockFrame from '../components/BlockFrame';
import ErrorBoundary from '../components/ErrorBoundary';
import PageCanvas from '../components/PageCanvas';
import { BlockSettings, type BlockPatch } from '../components/PageSheets';
import ProjectHeader, { type ProjectTab } from '../components/ProjectHeader';
import ProjectSheet from '../components/ProjectSheet';
import Sheet from '../components/Sheet';
import { Card, Empty } from '../components/ui';
import { blockKind, type BlockKind } from '../lib/blockKinds';
import { nextSortOrder } from '../lib/blocks';
import { COLS, moveInOrder, placeNew, readingOrder, type Rect } from '../lib/layout';
import { PageMonthContext, useNav } from '../lib/pageContext';
import { ancestors, childrenOf } from '../lib/pages';
import { toast } from '../lib/toast';
import type { Block, UserTab } from '../lib/types';
import { DESKTOP, useMediaQuery } from '../lib/useMediaQuery';
import { useTable } from '../lib/useTable';
import { monthKey, today } from '../lib/utils';

const MAX_BLOCKS = 50;

const ProjectNotes = lazy(() => import('../blocks/app/projectNotes'));

const rectOf = (b: Block): Rect => ({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h });
const layoutPatch = (changed: Rect[]) => changed.map(({ id, x, y, w, h }) => ({ id, patch: { x, y, w, h } }));

/**
 * Una página («categoría»): sus bloques y, en modo personalizar, el catálogo para añadir más,
 * mover y redimensionar (ordenador) u ordenar con flechas (móvil).
 */
export default function PageView({ page, pages, startEditing, onEditPage, onAddChild }: {
  page: UserTab;
  pages: UserTab[];
  startEditing: boolean;
  onEditPage: () => void;
  onAddChild: () => void;
}) {
  const nav = useNav();
  const desktop = useMediaQuery(DESKTOP);
  const blocks = useTable('blocks');
  const projects = useTable('projects');
  // Página de un proyecto: cabecera propia, pestaña de notas y bloques fijados a él.
  const project = page.project_id ? projects.rows.find((p) => p.id === page.project_id) : undefined;
  const [tab, setTab] = useState<ProjectTab>('vista');
  const [projectSheet, setProjectSheet] = useState(false);
  const [editing, setEditing] = useState(startEditing);
  const [catalog, setCatalog] = useState(false);
  const [settings, setSettings] = useState<string | null>(null);
  const [month, setMonth] = useState(() => monthKey(today()));
  const monthCtx = useMemo(() => ({ month, setMonth }), [month]);

  const mine = blocks.rows.filter((b) => b.tab_id === page.id);
  const order = readingOrder(mine).map((b) => b.id);
  const path = ancestors(pages, page.id);
  const children = childrenOf(pages, page.id);

  const add = async (kind: BlockKind, at?: { x: number; y: number }, moved: Rect[] = []) => {
    if (mine.length >= MAX_BLOCKS) return toast(`Como mucho ${MAX_BLOCKS} bloques por página`, 'error');
    if (moved.length) await blocks.updateMany(layoutPatch(moved));
    const pos = at ? { ...at, w: Math.min(kind.w, COLS - at.x), h: kind.h } : placeNew(mine.map(rectOf), kind.w, kind.h);
    // En la página de un proyecto, los bloques que se pueden fijar a un proyecto van a ese.
    const forProject = !!page.project_id && !!kind.filters?.some((f) => f.source === 'project');
    const created = await blocks.add({
      tab_id: page.id,
      type: kind.type,
      title: kind.frame === false ? '' : kind.name,
      content: { ...(kind.empty?.() ?? {}), ...(forProject ? { project: page.project_id } : {}) },
      sort_order: nextSortOrder(mine),
      ...pos,
    });
    if (created) {
      setCatalog(false);
      // Si el bloque se puede filtrar (una categoría, un hábito…), se abren sus ajustes para elegirlo.
      if (kind.filters?.some((f) => !(forProject && f.source === 'project'))) setSettings(created.id);
      toast(`Bloque «${kind.name}» añadido`);
    }
  };

  const remove = async (b: Block) => {
    const name = b.title || blockKind(b.type)?.name || 'este bloque';
    const kind = blockKind(b.type);
    // Los bloques de la app solo muestran datos: quitarlos no borra nada. Los básicos guardan su contenido.
    const keepsData = kind?.group !== 'basicos';
    const question = keepsData
      ? `¿Quitar el bloque «${name}» de esta página? Tus datos no se borran.`
      : `¿Quitar el bloque «${name}» y su contenido? No se puede deshacer.`;
    if (!window.confirm(question)) return;
    if (await blocks.remove(b.id)) setSettings(null);
  };

  const move = (b: Block, dir: -1 | 1) => {
    const next = moveInOrder(mine.map(rectOf), b.id, dir);
    if (!next) return toast('Con esos tamaños no se puede mover más: ordénalo desde el ordenador', 'error');
    const before = new Map(mine.map((m) => [m.id, m]));
    void blocks.updateMany(layoutPatch(next.filter((r) => {
      const o = before.get(r.id)!;
      return o.x !== r.x || o.y !== r.y;
    })));
  };

  const saveSettings = async (b: Block, patch: BlockPatch) => {
    const x = Math.min(b.x, COLS - patch.w);
    if (await blocks.update(b.id, { ...patch, x })) setSettings(null);
  };

  const editingBlock = settings ? mine.find((b) => b.id === settings) : undefined;

  return (
    <PageMonthContext.Provider value={monthCtx}>
      <div className={`page ${editing && desktop ? 'with-catalog' : ''}`}>
        <div className="page-main stack-lg">
          <header className="page-head">
            {page.project_id ? (
              project ? (
                <ProjectHeader
                  project={project}
                  tab={tab}
                  onTab={(t) => {
                    setTab(t);
                    setEditing(false);
                  }}
                  onSettings={() => setProjectSheet(true)}
                  actions={
                    <>
                      {editing && !desktop && (
                        <button type="button" className="btn ghost sm" onClick={() => setCatalog(true)}>
                          ＋ Bloque
                        </button>
                      )}
                      <button type="button" className={`btn sm ${editing ? 'primary' : 'ghost'}`} aria-pressed={editing} onClick={() => setEditing(!editing)}>
                        {editing ? '✓ Listo' : '✎ Personalizar'}
                      </button>
                    </>
                  }
                />
              ) : (
                <Empty>Cargando…</Empty>
              )
            ) : (
              <>
            {path.length > 0 && (
              <nav className="breadcrumbs" aria-label="Estás en">
                {path.map((p) => (
                  <span key={p.id}>
                    <button type="button" className="link-btn" onClick={() => nav.go(p.id)}>
                      {p.icon} {p.name}
                    </button>
                    <span aria-hidden> › </span>
                  </span>
                ))}
              </nav>
            )}
            <div className="row between wrap">
              <h1>
                <span aria-hidden>{page.icon}</span> {page.name}
              </h1>
              <div className="row page-actions">
                {editing && (
                  <button type="button" className="btn ghost sm" onClick={onEditPage}>
                    ⚙ Página
                  </button>
                )}
                {editing && !desktop && (
                  <button type="button" className="btn ghost sm" onClick={() => setCatalog(true)}>
                    ＋ Bloque
                  </button>
                )}
                <button type="button" className={`btn sm ${editing ? 'primary' : 'ghost'}`} aria-pressed={editing} onClick={() => setEditing(!editing)}>
                  {editing ? '✓ Listo' : '✎ Personalizar'}
                </button>
              </div>
            </div>
            {(children.length > 0 || editing) && (
              <nav className="subpages" aria-label={`Subpáginas de ${page.name}`}>
                {children.map((c) => (
                  <button key={c.id} type="button" className="subtab" onClick={() => nav.go(c.id)}>
                    <span aria-hidden>{c.icon}</span> {c.name}
                  </button>
                ))}
                {editing && (
                  <button type="button" className="subtab subtab-add" onClick={onAddChild}>
                    ＋ Subpágina
                  </button>
                )}
              </nav>
            )}
              </>
            )}
            {editing && (
              <p className="customize-hint" role="status">
                {desktop
                  ? 'Modo personalizar: arrastra los bloques por su cabecera, cambia su tamaño desde la esquina y añade más desde el catálogo. Pulsa «Listo» al terminar.'
                  : 'Modo personalizar: añade bloques con «＋ Bloque», ordénalos con las flechas y cambia sus ajustes con ⚙. El diseño libre (arrastrar y redimensionar) está en el ordenador.'}
              </p>
            )}
          </header>

          {page.project_id && tab === 'notas' ? (
            <ErrorBoundary scope="las notas y adjuntos">
              <Suspense fallback={<Empty>Cargando…</Empty>}>
                <section className="card">
                  <ProjectNotes projectId={page.project_id} />
                </section>
              </Suspense>
            </ErrorBoundary>
          ) : blocks.loading ? (
            <Empty>Cargando…</Empty>
          ) : mine.length === 0 && !editing ? (
            <Card>
              <Empty>Esta página aún está vacía.</Empty>
              <div className="row center">
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => {
                    setEditing(true);
                    if (!desktop) setCatalog(true);
                  }}
                >
                  ＋ Añadir el primer bloque
                </button>
              </div>
            </Card>
          ) : (
            <>
              {mine.length === 0 && (
                <div className="canvas-empty">{desktop ? 'Arrastra aquí un bloque del catálogo, o haz clic en uno.' : 'Pulsa «＋ Bloque» para añadir el primero.'}</div>
              )}
              <PageCanvas
                blocks={mine}
                desktop={desktop}
                editing={editing}
                onLayout={(changed, fixed) => {
                  const patches = layoutPatch(changed).map((c) => {
                    const b = mine.find((m) => m.id === c.id);
                    return c.id === fixed && b ? { ...c, patch: { ...c.patch, content: { ...b.content, fixedHeight: true } } } : c;
                  });
                  void blocks.updateMany(patches);
                }}
                onDropKind={(type, at, moved) => {
                  const kind = blockKind(type);
                  if (kind) void add(kind, at, moved);
                }}
                renderBlock={(b, measure) => {
                  const i = order.indexOf(b.id);
                  return (
                    <BlockFrame
                      block={b}
                      editing={editing}
                      desktop={desktop}
                      onMeasure={measure}
                      onSave={async (content) => !!(await blocks.update(b.id, { content }))}
                      onSettings={() => setSettings(b.id)}
                      onRemove={() => void remove(b)}
                      onMove={{ up: i > 0 ? () => move(b, -1) : undefined, down: i < order.length - 1 ? () => move(b, 1) : undefined }}
                    />
                  );
                }}
              />
            </>
          )}
        </div>

        {editing && desktop && (
          <aside className="catalog-panel" aria-label="Catálogo de bloques">
            <h2>Añadir bloques</h2>
            <BlockCatalog desktop onPick={(k) => void add(k)} />
          </aside>
        )}
      </div>

      {catalog && !desktop && (
        <Sheet title="Añadir un bloque" onClose={() => setCatalog(false)}>
          <BlockCatalog desktop={false} onPick={(k) => void add(k)} />
        </Sheet>
      )}
      {projectSheet && project && <ProjectSheet project={project} onClose={() => setProjectSheet(false)} />}
      {editingBlock && (
        <BlockSettings
          key={editingBlock.id}
          block={editingBlock}
          onClose={() => setSettings(null)}
          onSave={(patch) => saveSettings(editingBlock, patch)}
          onDelete={() => void remove(editingBlock)}
        />
      )}
    </PageMonthContext.Provider>
  );
}
