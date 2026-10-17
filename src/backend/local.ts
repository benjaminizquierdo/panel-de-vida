import { defaultFinanceRows, seedData, type SeedRow } from '../lib/defaults';
import type { FinanceCategory, Row, TableName, TxType, User } from '../lib/types';
import type { Backend } from './types';

// Modo demo: cuentas y datos en localStorage de este navegador. Sirve para probar
// la app sin servidor; no es seguro para datos reales (cualquiera con acceso al
// navegador puede leerlos). Replica las reglas del esquema SQL que afectan a la UI.

interface StoredUser extends User {
  passHash: string;
}

const KEY_USERS = 'pv:users';
const KEY_SESSION = 'pv:session';
const dataKey = (uid: string, table: TableName) => `pv:data:${uid}:${table}`;

/** Igual que los `on delete cascade` del esquema SQL. */
const CASCADE: Partial<Record<TableName, [TableName, string][]>> = {
  projects: [['tasks', 'project_id']],
  habits: [['habit_logs', 'habit_id']],
  finance_categories: [
    ['finance_categories', 'parent_id'],
    ['budgets', 'category_id'],
  ],
};

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
      const created = makeRow<T>(row, uid());
      if (table === 'finance_categories') checkCategory(created as FinanceCategory);
      if (table === 'transactions') {
        const cat = rows('finance_categories').find((c) => c.id === field(created, 'category_id'));
        if (!cat || cat.type !== field(created, 'type')) throw new Error('La categoría no corresponde al tipo de movimiento');
      }
      save(table, [...rows(table), created]);
      return created;
    },

    async update<T extends TableName>(table: T, id: string, patch: Partial<SeedRow<T>>) {
      const next = rows(table).map((r) => (r.id === id ? ({ ...r, ...patch } as Row<T>) : r));
      if (table === 'finance_categories') checkCategory(next.find((r) => r.id === id) as FinanceCategory);
      save(table, next);
    },

    async remove(table, id) {
      if (table === 'finance_categories') {
        const ids = [id, ...rows('finance_categories').filter((c) => c.parent_id === id).map((c) => c.id)];
        if (rows('transactions').some((t) => ids.includes(t.category_id))) {
          throw new Error('Esta categoría tiene movimientos: archívala o fusiónala con otra');
        }
        // Las subcategorías caen en cascada: también sus presupuestos.
        save('budgets', rows('budgets').filter((b) => !ids.includes(b.category_id)));
      }
      save(table, rows(table).filter((r) => r.id !== id));
      for (const [child, fk] of CASCADE[table] ?? []) {
        save(child, rows(child).filter((r) => field(r, fk) !== id));
      }
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
  };
}
