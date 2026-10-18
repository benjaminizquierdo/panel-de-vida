import { useEffect, useMemo, useState } from 'react';
import { backend } from '../backend';
import { NavContext, UserContext, type Nav } from '../lib/pageContext';
import { childrenOf, initialPage, placePage, subtree } from '../lib/pages';
import { DEFAULT_PAGES, restorable, templateSeed, type Restorable } from '../lib/pageTemplates';
import { nextSortOrder } from '../lib/blocks';
import { toast } from '../lib/toast';
import type { User, UserTab } from '../lib/types';
import { DESKTOP, useMediaQuery } from '../lib/useMediaQuery';
import { resetTables, useTable } from '../lib/useTable';
import PageView from '../pages/PageView';
import Assistant from './Assistant';
import ErrorBoundary from './ErrorBoundary';
import { PageSettings, RestoreSheet, type PageValues } from './PageSheets';
import Sidebar from './Sidebar';

// La última página abierta se recuerda por usuario.
const pageKey = (userId: string) => `pv:page:${userId}`;
// Versión anterior: id de la pestaña fija (p. ej. 'finanzas'), que coincide con la plantilla de su categoría.
const legacyTabKey = (userId: string) => `pv:tab:${userId}`;

const readKey = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/**
 * Espacio de trabajo del usuario. La primera vez crea sus categorías por defecto; si eso falla
 * (p. ej. falta aplicar la migración 007), lanza el error para que se vea la pantalla de error.
 */
export default function Workspace({ user }: { user: User }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let alive = true;
    resetTables();
    backend
      .seedPages(DEFAULT_PAGES)
      .then(() => alive && setReady(true))
      .catch((e) => alive && setError(e));
    return () => {
      alive = false;
    };
  }, []);

  if (error) throw error;
  if (!ready) return <div className="splash">Cargando…</div>;
  return (
    <UserContext.Provider value={user}>
      <Shell user={user} />
    </UserContext.Provider>
  );
}

type SheetState = { kind: 'edit'; page: UserTab } | { kind: 'create'; parentId: string | null } | { kind: 'restore' };

function Shell({ user }: { user: User }) {
  const tabs = useTable('tabs');
  const blocks = useTable('blocks');
  const desktop = useMediaQuery(DESKTOP);
  const pages = useMemo(() => tabs.rows.filter((p) => !p.section), [tabs.rows]);
  const [currentId, setCurrentId] = useState<string | null>(() => readKey(pageKey(user.id)));
  const [drawer, setDrawer] = useState(false);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  // Página recién creada: se abre ya en modo personalizar.
  const [fresh, setFresh] = useState<string | null>(null);

  const legacy = readKey(legacyTabKey(user.id));
  const current = initialPage(pages, currentId ?? pages.find((p) => p.template === legacy)?.id ?? null);
  const missing = restorable(pages);

  const go = (id: string) => {
    setCurrentId(id);
    setDrawer(false);
    try {
      localStorage.setItem(pageKey(user.id), id);
    } catch {
      // Sin almacenamiento disponible: la página simplemente no se recuerda.
    }
    window.scrollTo({ top: 0 });
  };

  const nav: Nav = {
    pages,
    current,
    go,
    pageOf: (template) => pages.find((p) => p.template === template),
  };

  const place = async (id: string, parentId: string | null, index: number) => {
    const changes = placePage(pages, id, parentId, index);
    await tabs.updateMany(changes.map(({ id: pid, parent_id, sort_order }) => ({ id: pid, patch: { parent_id, sort_order } })));
  };

  /** Subir (-1) o bajar (+1) una página entre sus hermanas; undefined si ya está en el extremo. */
  const moveFn = (page: UserTab, dir: -1 | 1) => {
    const siblings = childrenOf(pages, page.parent_id ?? null);
    const index = siblings.findIndex((p) => p.id === page.id) + dir;
    return index < 0 || index >= siblings.length ? undefined : () => void place(page.id, page.parent_id ?? null, index);
  };

  const create = async (values: PageValues) => {
    const siblings = pages.filter((p) => (p.parent_id ?? null) === values.parentId);
    const created = await tabs.add({
      section: null,
      parent_id: values.parentId,
      name: values.name,
      icon: values.icon,
      template: null,
      sort_order: nextSortOrder(siblings),
    });
    if (!created) return;
    setSheet(null);
    setFresh(created.id);
    go(created.id);
    toast(`«${created.name}» creada: añade tus bloques`);
  };

  const update = async (page: UserTab, values: PageValues) => {
    if (!(await tabs.update(page.id, { name: values.name, icon: values.icon }))) return;
    if ((page.parent_id ?? null) !== values.parentId) {
      const siblings = pages.filter((p) => (p.parent_id ?? null) === values.parentId && p.id !== page.id);
      await place(page.id, values.parentId, siblings.length);
    }
    setSheet(null);
  };

  const remove = async (page: UserTab) => {
    const inside = subtree(pages, page.id).size - 1;
    const what = inside > 0 ? `la página «${page.name}», sus ${inside} subpágina${inside > 1 ? 's' : ''} y sus bloques` : `la página «${page.name}» y sus bloques`;
    const data = page.template ? ' Tus datos (movimientos, hábitos…) no se borran y podrás recuperarla.' : '';
    if (!window.confirm(`¿Eliminar ${what}?${data} Las notas, checklists y enlaces de esos bloques sí se pierden.`)) return;
    if (!(await tabs.remove(page.id))) return;
    setSheet(null);
    await Promise.all([tabs.reload(), blocks.reload()]);
    const parent = page.parent_id ? pages.find((p) => p.id === page.parent_id) : undefined;
    const next = parent ?? pages.find((p) => !subtree(pages, page.id).has(p.id));
    if (next) go(next.id);
  };

  const reset = async (page: UserTab) => {
    const seed = page.template ? templateSeed(page.template) : undefined;
    if (!seed) return;
    if (!window.confirm(`¿Restablecer el diseño original de «${page.name}»? Se quitan sus bloques actuales y vuelven los de siempre. Tus datos no se borran; las notas y checklists que hayas añadido a esta página, sí.`)) return;
    for (const b of blocks.rows.filter((b) => b.tab_id === page.id)) await blocks.remove(b.id);
    for (const [i, b] of seed.blocks.entries()) await blocks.add({ tab_id: page.id, sort_order: i, ...b });
    setSheet(null);
    toast(`Diseño original de «${page.name}» restablecido`);
  };

  const restore = async (item: Restorable) => {
    try {
      await backend.insertPages([item.seed], item.parentId);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
      return;
    }
    await Promise.all([tabs.reload(), blocks.reload()]);
    toast(`«${item.seed.name}» recuperada`);
  };

  return (
    <NavContext.Provider value={nav}>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <button type="button" className="icon-btn menu-btn" aria-label="Abrir el menú de categorías" aria-expanded={drawer} onClick={() => setDrawer(true)}>
              ☰
            </button>
            <img src="/favicon.svg" alt="" width={28} height={28} />
            <span>Panel de Vida</span>
            {backend.mode === 'local' && <span className="badge">demo</span>}
          </div>
          <div className="topbar-user">
            <span className="muted user-name">{user.name}</span>
            <button className="btn ghost" onClick={() => void backend.signOut()}>
              Salir
            </button>
          </div>
        </header>

        <div className="workspace">
          <Sidebar
            userId={user.id}
            pages={pages}
            currentId={current?.id}
            open={drawer}
            draggable={desktop}
            restorable={missing.length}
            onClose={() => setDrawer(false)}
            onGo={go}
            onCreate={(parentId) => setSheet({ kind: 'create', parentId })}
            onRestore={() => setSheet({ kind: 'restore' })}
            onPlace={(id, parentId, index) => void place(id, parentId, index)}
          />
          <main className="content" key={current?.id ?? 'vacio'}>
            {tabs.loading ? (
              <p className="empty">Cargando…</p>
            ) : current ? (
              <ErrorBoundary scope={`la página «${current.name}»`}>
                <PageView
                  page={current}
                  pages={pages}
                  startEditing={fresh === current.id}
                  onEditPage={() => setSheet({ kind: 'edit', page: current })}
                  onAddChild={() => setSheet({ kind: 'create', parentId: current.id })}
                />
              </ErrorBoundary>
            ) : (
              <section className="card stack welcome">
                <h1>No tienes ninguna categoría</h1>
                <p className="muted">Crea la primera o recupera las de siempre (Inicio, Finanzas…). Tus datos siguen guardados.</p>
                <div className="row wrap">
                  <button type="button" className="btn primary" onClick={() => setSheet({ kind: 'create', parentId: null })}>
                    ＋ Nueva categoría
                  </button>
                  {missing.length > 0 && (
                    <button type="button" className="btn ghost" onClick={() => setSheet({ kind: 'restore' })}>
                      ↺ Recuperar categorías por defecto
                    </button>
                  )}
                </div>
              </section>
            )}
          </main>
        </div>

        <ErrorBoundary scope="el asistente">
          <Assistant key={user.id} user={user} />
        </ErrorBoundary>
      </div>

      {sheet?.kind === 'create' && (
        <PageSettings page={null} pages={pages} parentId={sheet.parentId} onClose={() => setSheet(null)} onSave={create} />
      )}
      {sheet?.kind === 'edit' && (
        <PageSettings
          key={sheet.page.id}
          page={sheet.page}
          pages={pages}
          onClose={() => setSheet(null)}
          onSave={(values) => update(sheet.page, values)}
          onMove={{ up: moveFn(sheet.page, -1), down: moveFn(sheet.page, 1) }}
          onAddChild={() => setSheet({ kind: 'create', parentId: sheet.page.id })}
          onReset={sheet.page.template && templateSeed(sheet.page.template) ? () => void reset(sheet.page) : undefined}
          onDelete={() => void remove(sheet.page)}
        />
      )}
      {sheet?.kind === 'restore' && <RestoreSheet items={missing} onClose={() => setSheet(null)} onRestore={restore} />}
    </NavContext.Provider>
  );
}
