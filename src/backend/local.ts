import { defaultFinanceRows, seedData, type SeedRow } from '../lib/defaults';
import { COLS } from '../lib/layout';
import type { PageSeed } from '../lib/pageTemplates';
import { subtree } from '../lib/pages';
import { dueDates } from '../lib/recurring';
import type { Block, FinanceCategory, Row, TableName, TxType, User, UserTab } from '../lib/types';
import { addDays, today } from '../lib/utils';
import { MAX_DEMO_FILE_BYTES, type Backend } from './types';

// Modo demo: cuentas y datos en localStorage de este navegador. Sirve para probar
// la app sin servidor; no es seguro para datos reales (cualquiera con acceso al
// navegador puede leerlos). Replica las reglas del esquema SQL que afectan a la UI.

interface StoredUser extends User {
  passHash: string;
}

const KEY_USERS = 'pv:users';
const KEY_SESSION = 'pv:session';
const dataKey = (uid: string, table: TableName) => `pv:data:${uid}:${table}`;
/** Igual que user_settings.pages_seeded (007_disenador.sql). */
const seededKey = (uid: string) => `pv:pages-seeded:${uid}`;

/** Proyecto migrado a 008_tipos_proyecto.sql (página Proyectos con «Foco de hoy»). */
const migrated008Key = (uid: string) => `pv:migrated-008:${uid}`;
/** Adjuntos del modo demo: el archivo entero como data URL. */
const fileKey = (path: string) => `pv:file:${path}`;

/** Igual que los `on delete cascade` del esquema SQL (se aplican en cadena). */
const CASCADE: Partial<Record<TableName, [TableName, string][]>> = {
  tasks: [['task_items', 'task_id']],
  projects: [
    ['tasks', 'project_id'],
    ['project_items', 'project_id'],
    ['project_logs', 'project_id'],
    ['tabs', 'project_id'],
  ],
  project_items: [['project_items', 'parent_id']],
  habits: [['habit_logs', 'habit_id']],
  finance_categories: [
    ['finance_categories', 'parent_id'],
    ['budgets', 'category_id'],
  ],
  tabs: [
    ['blocks', 'tab_id'],
    ['tabs', 'parent_id'],
  ],
};

/** Igual que los `on delete set null`: el gasto de un proyecto borrado se queda en Finanzas. */
const SET_NULL: Partial<Record<TableName, [TableName, string][]>> = {
  projects: [['transactions', 'project_id']],
};

/** Tablas cuyos cambios cuentan como actividad de su proyecto (trigger touch_project() de la 008). */
const TOUCHES_PROJECT = new Set<TableName>(['tasks', 'task_items', 'project_items', 'project_logs', 'transactions']);

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const toUser = (u: StoredUser): User => ({ id: u.id, email: u.email, name: u.name });

const makeRow = <T extends TableName>(row: SeedRow<T>, userId: string) =>
  ({ id: crypto.randomUUID(), ...row, user_id: userId, created_at: new Date().toISOString() }) as Row<T>;

const field = (row: unknown, key: string) => (row as Record<string, unknown>)[key];

/**
 * Cuentas demo creadas antes de las categorías personalizables guardaban la
 * categoría como texto. Igual que la migración 003: crea las categorías y enlaza por id.
 */
function migrateLegacyData(userId: string) {
  if (localStorage.getItem(dataKey(userId, 'finance_categories')) !== null) return;
  const { categories, budgets: defaultBudgets } = defaultFinanceRows();
  const cats = categories.map((c) => makeRow<'finance_categories'>(c, userId));
  const find = (type: TxType, name: string) =>
    cats.find((c) => c.type === type && !c.parent_id && c.name.toLowerCase() === name.toLowerCase());
  const ensure = (type: TxType, name: string) => {
    let cat = find(type, name);
    if (!cat) {
      cat = makeRow<'finance_categories'>({ parent_id: null, type, name, icon: '🏷️', color: '#64748b', sort_order: 100, archived: false }, userId);
      cats.push(cat);
    }
    return cat.id;
  };

  const txs = read<Row<'transactions'>[]>(dataKey(userId, 'transactions'), []).map((t) => {
    const legacy = field(t, 'category');
    if (typeof legacy !== 'string') return t;
    const { category: _drop, ...rest } = t as Row<'transactions'> & { category: string };
    return { ...rest, category_id: ensure(t.type, legacy) };
  });
  const oldBudgets = read<(Row<'budgets'> & { category?: string })[]>(dataKey(userId, 'budgets'), []);
  const budgets = oldBudgets.length
    ? oldBudgets.map(({ category, ...b }) => (category ? { ...b, category_id: ensure('gasto', category) } : b))
    : defaultBudgets.map((b) => makeRow<'budgets'>(b, userId));

  write(dataKey(userId, 'finance_categories'), cats);
  write(dataKey(userId, 'transactions'), txs);
  write(dataKey(userId, 'budgets'), budgets);
}

export function createLocalBackend(): Backend {
  const listeners = new Set<(u: User | null) => void>();

  const current = (): User | null => {
    const id = read<string | null>(KEY_SESSION, null);
    const user = read<StoredUser[]>(KEY_USERS, []).find((u) => u.id === id);
    return user ? toUser(user) : null;
  };

  const emit = () => {
    const user = current();
    listeners.forEach((l) => l(user));
  };

  const uid = () => {
    const user = current();
    if (!user) throw new Error('Sesión no iniciada');
    return user.id;
  };

  const rows = <T extends TableName>(table: T) => read<Row<T>[]>(dataKey(uid(), table), []);
  const save = <T extends TableName>(table: T, data: Row<T>[]) => write(dataKey(uid(), table), data);

  /** Comprobaciones que en Supabase hacen las claves foráneas y los triggers. */
  const checkCategory = (cat: FinanceCategory) => {
    const all = rows('finance_categories');
    if (cat.parent_id) {
      const parent = all.find((c) => c.id === cat.parent_id);
      if (!parent) throw new Error('La categoría principal no existe');
      if (parent.type !== cat.type) throw new Error('Una subcategoría debe ser del mismo tipo que su categoría');
      if (parent.parent_id) throw new Error('Solo hay dos niveles: no se puede crear una subcategoría dentro de otra subcategoría');
      if (all.some((c) => c.parent_id === cat.id)) throw new Error('Una categoría con subcategorías no puede pasar a ser subcategoría');
    }
    const duplicate = all.some(
      (c) =>
        c.id !== cat.id &&
        !c.archived &&
        !cat.archived &&
        c.type === cat.type &&
        c.parent_id === cat.parent_id &&
        c.name.trim().toLowerCase() === cat.name.trim().toLowerCase(),
    );
    if (duplicate) throw new Error(`Ya existe una categoría «${cat.name}» en ese nivel`);
  };

  /** Lo que comprueban las restricciones y el trigger de tabs y blocks en 007_disenador.sql. */
  const checkPage = (page: UserTab, all: UserTab[]) => {
    const name = page.name?.trim() ?? '';
    if (name.length < 1 || page.name.length > 40) throw new Error('El nombre de la página tiene que tener entre 1 y 40 caracteres');
    if (page.parent_id) {
      if (!all.some((p) => p.id === page.parent_id)) throw new Error('La página madre no existe');
      if (subtree(all, page.id).has(page.parent_id)) throw new Error('Una página no puede ir dentro de sí misma ni de una de sus subpáginas');
    }
    if (page.template && all.some((p) => p.id !== page.id && p.template === page.template)) {
      throw new Error('Esa categoría por defecto ya existe');
    }
    if (page.project_id) {
      if (page.parent_id) throw new Error('La página de un proyecto no puede ir dentro de otra');
      if (!rows('projects').some((p) => p.id === page.project_id)) throw new Error('El proyecto no existe');
      if (all.some((p) => p.id !== page.id && p.project_id === page.project_id)) throw new Error('Ese proyecto ya tiene su página');
    }
  };

  /** Lo que comprueban las restricciones de project_items y project_logs en la 008. */
  const checkProjectRow = (table: TableName, row: unknown, all: unknown[]) => {
    const projectId = field(row, 'project_id');
    if (!rows('projects').some((p) => p.id === projectId)) throw new Error('El proyecto no existe');
    if (table === 'project_items') {
      for (const key of ['url', 'image_url']) {
        const v = field(row, key);
        if (v !== null && v !== undefined && !/^https?:\/\//.test(String(v))) throw new Error('Los enlaces tienen que empezar por http:// o https://');
      }
    }
    if (table === 'project_logs') {
      const kind = field(row, 'kind');
      const value = Number(field(row, 'value'));
      if (kind === 'horas' && !(value > 0 && value <= 24)) throw new Error('Las horas tienen que estar entre 0 y 24');
      if (kind === 'check' && all.some((r) => field(r, 'id') !== field(row, 'id') && field(r, 'kind') === 'check' && field(r, 'project_id') === projectId && field(r, 'date') === field(row, 'date'))) {
        throw new Error('Ese día ya está marcado');
      }
    }
  };

  /** Lo que comprueban las restricciones de task_items en la 009. */
  const checkTaskItem = (row: unknown) => {
    if (!rows('tasks').some((t) => t.id === field(row, 'task_id'))) throw new Error('La tarea no existe');
    const url = field(row, 'url');
    if (url !== null && url !== undefined && !/^https?:\/\//.test(String(url))) throw new Error('Los enlaces tienen que empezar por http:// o https://');
  };

  /** Proyecto al que pertenece una fila (el de su tarea, en las notas y adjuntos de una tarea). */
  const projectOfRow = (table: TableName, row: unknown) =>
    table === 'task_items' ? rows('tasks').find((t) => t.id === field(row, 'task_id'))?.project_id : field(row, 'project_id');

  /** Como el trigger touch_project(): la actividad de un proyecto es su último cambio. */
  const touchProjects = (ids: unknown[]) => {
    const set = new Set(ids.filter((id): id is string => typeof id === 'string'));
    if (set.size === 0) return;
    const now = new Date().toISOString();
    save('projects', rows('projects').map((p) => (set.has(p.id) ? { ...p, last_activity_at: now } : p)));
  };

  /** Como el trigger tasks_set_completed_at(). */
  const withCompletedAt = <T,>(row: T, before?: unknown): T => {
    const status = field(row, 'status');
    if (status !== 'hecha') return { ...row, completed_at: null };
    if (before && field(before, 'status') === 'hecha') return { ...row, completed_at: field(before, 'completed_at') ?? new Date().toISOString() };
    return { ...row, completed_at: field(row, 'completed_at') ?? new Date().toISOString() };
  };

  /** Borra filas y lo que cuelga de ellas, en cadena, como las claves foráneas. */
  const removeRows = (table: TableName, ids: string[]) => {
    if (ids.length === 0) return;
    const gone = new Set(ids);
    save(table, rows(table).filter((r) => !gone.has(r.id)));
    for (const [child, fk] of CASCADE[table] ?? []) {
      removeRows(child, rows(child).filter((r) => gone.has(field(r, fk) as string)).map((r) => r.id));
    }
    for (const [child, fk] of SET_NULL[table] ?? []) {
      save(child, rows(child).map((r) => (gone.has(field(r, fk) as string) ? { ...r, [fk]: null } : r)));
    }
  };

  const checkBlock = (block: Block, pages: UserTab[]) => {
    if (!pages.some((t) => t.id === block.tab_id)) throw new Error('La página de este bloque no existe');
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(block.type)) throw new Error('Tipo de bloque no válido');
    const { x, y, w, h } = block;
    if (![x, y, w, h].every(Number.isInteger) || x < 0 || y < 0 || w < 1 || h < 1 || h > 1000 || x + w > COLS) {
      throw new Error('El bloque no cabe en la rejilla');
    }
  };

  const checkTransaction = (tx: unknown) => {
    const cat = rows('finance_categories').find((c) => c.id === field(tx, 'category_id'));
    if (!cat || cat.type !== field(tx, 'type')) throw new Error('La categoría no corresponde al tipo de movimiento');
  };

  /**
   * Como el final de 008_tipos_proyecto.sql, una sola vez por cuenta: en la página Proyectos de
   * siempre, el tablero general deja paso a «Foco de hoy».
   */
  const migrate008 = (userId: string) => {
    if (localStorage.getItem(migrated008Key(userId))) return;
    localStorage.setItem(migrated008Key(userId), '1');
    const page = rows('tabs').find((t) => t.template === 'proyectos');
    if (!page) return;
    const blocks = rows('blocks');
    const own = blocks.filter((b) => b.tab_id === page.id);
    // Una página recién creada con la plantilla nueva ya tiene «Foco de hoy».
    if (own.some((b) => b.type === 'foco_hoy')) return;
    const general = new Set(own.filter((b) => b.type === 'tablero' && !b.content?.project).map((b) => b.id));
    const next = blocks
      .filter((b) => !general.has(b.id))
      .map((b) => (b.tab_id === page.id && b.type === 'proyectos' ? { ...b, x: 0, w: COLS, y: b.y + 6 } : b));
    next.push(makeRow<'blocks'>({ tab_id: page.id, type: 'foco_hoy', title: '🎯 Foco de hoy', content: {}, x: 0, y: 0, w: COLS, h: 6, sort_order: -1 }, userId));
    save('blocks', next);
  };

  /** Como insert_page_tree(): valida todo antes de guardar nada (todo o nada). */
  const insertTree = (seeds: PageSeed[], parentId: string | null) => {
    const userId = uid();
    const pages = rows('tabs');
    const blocks = rows('blocks');
    const newPages: UserTab[] = [];
    const newBlocks: Block[] = [];
    const add = (list: PageSeed[], parent: string | null) => {
      const siblings = [...pages, ...newPages].filter((p) => (p.parent_id ?? null) === parent && !p.section);
      let order = siblings.reduce((m, p) => Math.max(m, p.sort_order + 1), 0);
      for (const seed of list) {
        const page = makeRow<'tabs'>(
          {
            section: null,
            parent_id: parent,
            name: seed.name,
            icon: seed.icon || '📄',
            template: seed.template ?? null,
            project_id: seed.project_id ?? null,
            sort_order: order++,
          },
          userId,
        );
        checkPage(page, [...pages, ...newPages, page]);
        newPages.push(page);
        seed.blocks.forEach((b, i) => {
          const block = makeRow<'blocks'>({ tab_id: page.id, type: b.type, title: b.title, content: b.content, x: b.x, y: b.y, w: b.w, h: b.h, sort_order: i }, userId);
          checkBlock(block, [...pages, ...newPages]);
          newBlocks.push(block);
        });
        add(seed.children ?? [], page.id);
      }
    };
    add(seeds, parentId);
    save('tabs', [...pages, ...newPages]);
    save('blocks', [...blocks, ...newBlocks]);
    return newPages.length;
  };

  return {
    mode: 'local',

    async getUser() {
      const user = current();
      if (user) migrateLegacyData(user.id);
      return user;
    },

    onAuthChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },

    async signUp(email, password, name) {
      const users = read<StoredUser[]>(KEY_USERS, []);
      const normalized = email.trim().toLowerCase();
      if (users.some((u) => u.email === normalized)) throw new Error('Ya existe una cuenta con ese email');

      const user: StoredUser = {
        id: crypto.randomUUID(),
        email: normalized,
        name: name.trim() || normalized.split('@')[0],
        passHash: await sha256(password),
      };
      write(KEY_USERS, [...users, user]);
      for (const [table, seedRows] of Object.entries(seedData()) as [TableName, SeedRow<TableName>[]][]) {
        write(dataKey(user.id, table), seedRows.map((r) => makeRow(r, user.id)));
      }
      write(KEY_SESSION, user.id);
      emit();
      return { needsConfirmation: false };
    },

    async signIn(email, password) {
      const normalized = email.trim().toLowerCase();
      const user = read<StoredUser[]>(KEY_USERS, []).find((u) => u.email === normalized);
      if (!user || user.passHash !== (await sha256(password))) {
        throw new Error('Email o contraseña incorrectos');
      }
      migrateLegacyData(user.id);
      write(KEY_SESSION, user.id);
      emit();
    },

    async signOut() {
      localStorage.removeItem(KEY_SESSION);
      emit();
    },

    async list<T extends TableName>(table: T) {
      return rows(table);
    },

    async insert<T extends TableName>(table: T, row: SeedRow<T>) {
      let created = makeRow<T>(row, uid());
      if (table === 'finance_categories') checkCategory(created as FinanceCategory);
      if (table === 'transactions') checkTransaction(created);
      if (table === 'tabs') checkPage(created as UserTab, [...rows('tabs'), created as UserTab]);
      if (table === 'blocks') checkBlock(created as Block, rows('tabs'));
      if (table === 'project_items' || table === 'project_logs') checkProjectRow(table, created, rows(table));
      if (table === 'task_items') checkTaskItem(created);
      if (table === 'tasks') created = withCompletedAt(created);
      if (table === 'projects') created = { kind: 'general', fields: {}, ...created, last_activity_at: new Date().toISOString() } as Row<T>;
      save(table, [...rows(table), created]);
      if (TOUCHES_PROJECT.has(table)) touchProjects([projectOfRow(table, created)]);
      return created;
    },

    async insertMany<T extends TableName>(table: T, newRows: SeedRow<T>[], options?: { skipDuplicates?: boolean }) {
      const existing = rows(table);
      // Igual que la restricción única (user_id, source, external_id) de 004_importacion.sql.
      const keyOf = (r: unknown) => `${field(r, 'source') ?? 'manual'}|${field(r, 'external_id')}`;
      const seen = new Set(existing.filter((r) => field(r, 'external_id')).map(keyOf));
      const created: Row<T>[] = [];
      for (const row of newRows) {
        if (field(row, 'external_id')) {
          if (seen.has(keyOf(row))) {
            if (options?.skipDuplicates) continue;
            throw new Error('Ese movimiento ya estaba importado');
          }
          seen.add(keyOf(row));
        }
        const r = makeRow<T>(row, uid());
        if (table === 'transactions') checkTransaction(r);
        created.push(r);
      }
      save(table, [...existing, ...created]);
      return created.length;
    },

    async update<T extends TableName>(table: T, id: string, patch: Partial<SeedRow<T>>) {
      const before = rows(table).find((r) => r.id === id);
      const next = rows(table).map((r) => {
        if (r.id !== id) return r;
        let row = { ...r, ...patch } as Row<T>;
        if (table === 'tasks') row = withCompletedAt(row, r);
        if (table === 'projects' && !('last_activity_at' in patch)) row = { ...row, last_activity_at: new Date().toISOString() };
        return row;
      });
      const updated = next.find((r) => r.id === id);
      if (table === 'finance_categories') checkCategory(updated as FinanceCategory);
      if (table === 'tabs' && updated) checkPage(updated as UserTab, next as UserTab[]);
      if (table === 'blocks' && updated) checkBlock(updated as Block, rows('tabs'));
      if ((table === 'project_items' || table === 'project_logs') && updated) checkProjectRow(table, updated, next);
      if (table === 'task_items' && updated) checkTaskItem(updated);
      save(table, next);
      if (TOUCHES_PROJECT.has(table)) touchProjects([projectOfRow(table, before), projectOfRow(table, updated)]);
    },

    async remove(table, id) {
      if (table === 'finance_categories') {
        const ids = [id, ...rows('finance_categories').filter((c) => c.parent_id === id).map((c) => c.id)];
        if (rows('transactions').some((t) => ids.includes(t.category_id))) {
          throw new Error('Esta categoría tiene movimientos: archívala o fusiónala con otra');
        }
        if (rows('recurring_transactions').some((r) => ids.includes(r.category_id))) {
          throw new Error('Esta categoría la usa un movimiento periódico: cámbialo de categoría o fusiónala con otra');
        }
        // Las subcategorías caen en cascada: también sus presupuestos.
        save('budgets', rows('budgets').filter((b) => !ids.includes(b.category_id)));
      }
      const before = rows(table).find((r) => r.id === id);
      const project = before && projectOfRow(table, before);
      removeRows(table, [id]);
      if (TOUCHES_PROJECT.has(table)) touchProjects([project]);
    },

    async mergeCategory(sourceId, targetId) {
      // Mismo algoritmo que merge_finance_category() en 003_categorias.sql.
      let cats = rows('finance_categories');
      const src = cats.find((c) => c.id === sourceId);
      const tgt = cats.find((c) => c.id === targetId);
      if (!src || !tgt) throw new Error('Categoría no encontrada');
      if (src.id === tgt.id) throw new Error('Elige una categoría distinta');
      if (src.type !== tgt.type) throw new Error('Solo se puede fusionar con una categoría del mismo tipo (gasto o ingreso)');
      if (tgt.parent_id === src.id) throw new Error('No se puede fusionar con una de sus propias subcategorías');

      const childIds = cats.filter((c) => c.parent_id === src.id).map((c) => c.id);
      let txs = rows('transactions');
      let budgets = rows('budgets');
      // Los periódicos siguen a sus movimientos: los del origen (y, si el destino es subcategoría, los de sus hijas).
      const movedRecurring = tgt.parent_id ? [src.id, ...childIds] : [src.id];
      save(
        'recurring_transactions',
        rows('recurring_transactions').map((r) => (movedRecurring.includes(r.category_id) ? { ...r, category_id: tgt.id } : r)),
      );
      if (!tgt.parent_id) {
        cats = cats.map((c) => (c.parent_id === src.id ? { ...c, parent_id: tgt.id } : c));
      } else {
        txs = txs.map((t) => (childIds.includes(t.category_id) ? { ...t, category_id: tgt.id } : t));
        budgets = budgets.filter((b) => !childIds.includes(b.category_id));
        cats = cats.filter((c) => !childIds.includes(c.id));
      }

      let moved = 0;
      txs = txs.map((t) => (t.category_id === src.id ? (moved++, { ...t, category_id: tgt.id }) : t));
      const targetHasBudget = budgets.some((b) => b.category_id === tgt.id);
      budgets = targetHasBudget
        ? budgets.filter((b) => b.category_id !== src.id)
        : budgets.map((b) => (b.category_id === src.id ? { ...b, category_id: tgt.id } : b));

      save('finance_categories', cats.filter((c) => c.id !== src.id));
      save('transactions', txs);
      save('budgets', budgets);
      return moved;
    },

    async seedPages(pages) {
      // Mismo algoritmo que seed_default_pages() en 007_disenador.sql.
      const userId = uid();
      if (localStorage.getItem(seededKey(userId))) {
        migrate008(userId);
        return 0;
      }
      const created = insertTree(pages, null);
      localStorage.setItem(seededKey(userId), '1');
      const all = rows('tabs');
      save(
        'tabs',
        all.map((t) => {
          if (!t.section) return t;
          const home = all.find((d) => d.template === t.section);
          return { ...t, section: null, parent_id: home?.id ?? null, sort_order: t.sort_order + 1000 };
        }),
      );
      // Bloques de la versión anterior sin posición: en dos columnas, en su orden (como la migración).
      const byTab = new Map<string, Block[]>();
      for (const b of rows('blocks')) byTab.set(b.tab_id, [...(byTab.get(b.tab_id) ?? []), b]);
      const placed = new Map<string, Partial<Block>>();
      for (const list of byTab.values()) {
        list
          .filter((b) => b.x === undefined)
          .sort((a, b) => a.sort_order - b.sort_order)
          .forEach((b, n) => placed.set(b.id, { x: (n % 2) * 6, y: Math.floor(n / 2) * 6, w: 6, h: 6 }));
      }
      if (placed.size) save('blocks', rows('blocks').map((b) => ({ ...b, ...placed.get(b.id) })));
      migrate008(userId);
      return created;
    },

    async insertPages(pages, parentId) {
      return insertTree(pages, parentId);
    },

    async uploadFile(path, file) {
      if (file.size > MAX_DEMO_FILE_BYTES) throw new Error('En el modo demo los archivos pueden ocupar como mucho 1 MB');
      if (path.split('/')[0] !== uid()) throw new Error('Solo puedes subir archivos a tu carpeta');
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('No se ha podido leer el archivo'));
        reader.readAsDataURL(file);
      });
      try {
        localStorage.setItem(fileKey(path), dataUrl);
      } catch {
        throw new Error('No queda sitio en este navegador para más archivos (modo demo)');
      }
    },

    async fileUrl(path) {
      if (path.split('/')[0] !== uid()) throw new Error('Archivo no encontrado');
      const dataUrl = localStorage.getItem(fileKey(path));
      if (!dataUrl) throw new Error('Archivo no encontrado');
      // Los navegadores no dejan abrir un data: en una pestaña; una URL de blob, sí.
      return URL.createObjectURL(await (await fetch(dataUrl)).blob());
    },

    async removeFiles(paths) {
      const me = uid();
      for (const path of paths) if (path.split('/')[0] === me) localStorage.removeItem(fileKey(path));
    },

    async generateRecurring(until) {
      // Mismo algoritmo que generate_recurring_for_user() en 005_periodicos.sql.
      const limit = until < addDays(today(), 1) ? until : addDays(today(), 1);
      const txs = rows('transactions');
      const keys = new Set(txs.map((t) => `${t.source ?? 'manual'}|${t.external_id}`));
      let created = 0;
      const rules = rows('recurring_transactions').map((r) => {
        if (!r.active || r.next_date > limit) return r;
        const { dates, next } = dueDates(r, limit);
        for (const date of dates) {
          const external_id = `${r.id}:${date}`;
          if (keys.has(`recurrente|${external_id}`)) continue;
          keys.add(`recurrente|${external_id}`);
          txs.push(
            makeRow<'transactions'>(
              { type: r.type, amount: r.amount, category_id: r.category_id, note: r.note, date, source: 'recurrente', external_id },
              uid(),
            ),
          );
          created++;
        }
        return { ...r, next_date: next, active: !r.end_date || next <= r.end_date };
      });
      save('transactions', txs);
      save('recurring_transactions', rules);
      return created;
    },
  };
}
