import { SEED } from '../lib/defaults';
import type { NewRow, Row, TableName, User } from '../lib/types';
import type { Backend } from './types';

// Modo demo: cuentas y datos en localStorage de este navegador. Sirve para probar
// la app sin servidor; no es seguro para datos reales (cualquiera con acceso al
// navegador puede leerlos).

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

const makeRow = <T extends TableName>(row: NewRow<T>, userId: string) =>
  ({ ...row, id: crypto.randomUUID(), user_id: userId, created_at: new Date().toISOString() }) as Row<T>;

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

  return {
    mode: 'local',

    async getUser() {
      return current();
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
      for (const [table, seedRows] of Object.entries(SEED) as [TableName, NewRow<TableName>[]][]) {
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

    async insert<T extends TableName>(table: T, row: NewRow<T>) {
      const created = makeRow<T>(row, uid());
      save(table, [...rows(table), created]);
      return created;
    },

    async update<T extends TableName>(table: T, id: string, patch: Partial<NewRow<T>>) {
      save(table, rows(table).map((r) => (r.id === id ? ({ ...r, ...patch } as Row<T>) : r)));
    },

    async remove(table, id) {
      save(table, rows(table).filter((r) => r.id !== id));
      for (const [child, fk] of CASCADE[table] ?? []) {
        save(child, rows(child).filter((r) => (r as unknown as Record<string, unknown>)[fk] !== id));
      }
    },
  };
}
