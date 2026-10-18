import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { backend } from '../backend';
import { onDataChanged } from './events';
import { toast } from './toast';
import type { NewRow, Row, TableName } from './types';

async function attempt<R>(fn: () => Promise<R>): Promise<R | undefined> {
  try {
    return await fn();
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e), 'error');
    return undefined;
  }
}

// Una copia de cada tabla compartida por todos los bloques de la pantalla: si un bloque añade
// un movimiento, los demás bloques que leen movimientos lo ven al momento.

interface Snapshot<T extends TableName> {
  rows: Row<T>[];
  loading: boolean;
}

interface Store<T extends TableName> {
  snapshot: Snapshot<T>;
  listeners: Set<() => void>;
  /** Para descartar respuestas de una carga anterior que llegan tarde. */
  generation: number;
  /** Cuándo empezó la última carga (ms). */
  loadedAt: number;
}

/** Al abrir una página se recargan sus tablas, salvo que se hayan cargado hace menos de esto. */
const FRESH_MS = 2000;

const stores = new Map<TableName, Store<TableName>>();

function storeOf<T extends TableName>(table: T): Store<T> {
  let store = stores.get(table) as Store<T> | undefined;
  if (!store) {
    store = { snapshot: { rows: [], loading: true }, listeners: new Set(), generation: 0, loadedAt: 0 };
    stores.set(table, store as unknown as Store<TableName>);
  }
  return store;
}

function setRows<T extends TableName>(table: T, update: (rows: Row<T>[]) => Row<T>[], loading?: boolean) {
  const store = storeOf(table);
  loading ??= store.snapshot.loading;
  store.snapshot = { rows: update(store.snapshot.rows), loading };
  store.listeners.forEach((l) => l());
}

async function load<T extends TableName>(table: T) {
  const store = storeOf(table);
  const generation = ++store.generation;
  store.loadedAt = Date.now();
  const rows = await attempt(() => backend.list(table));
  if (generation !== store.generation) return;
  setRows(table, (prev) => rows ?? prev, false);
}

/** Olvida los datos en memoria (al cambiar de usuario, para que no se vean los del anterior). */
export function resetTables() {
  for (const store of stores.values()) {
    store.generation++;
    store.loadedAt = 0;
    store.snapshot = { rows: [], loading: true };
    store.listeners.forEach((l) => l());
  }
}

/** Vuelve a pedir todas las tablas ya usadas (p. ej. antes de reintentar un bloque que ha fallado por sus datos). */
export async function reloadTables() {
  await Promise.all([...stores.keys()].map((table) => load(table)));
}

// Al avisar de cambios (el asistente ha guardado algo), se recargan las tablas que están a la vista.
let watching = false;
function watchChanges() {
  if (watching) return;
  watching = true;
  onDataChanged(() => {
    for (const [table, store] of stores) if (store.listeners.size > 0) void load(table);
  });
}

/**
 * Filas de una tabla del usuario actual, con altas/cambios/bajas que actualizan a todos los que la leen.
 * Las operaciones devuelven `undefined` si fallan (el error ya se ha mostrado como aviso).
 */
export function useTable<T extends TableName>(table: T) {
  const store = storeOf(table);
  const subscribe = useCallback(
    (listener: () => void) => {
      const s = storeOf(table);
      // Cada bloque que se monta la recarga si hace rato que no se cargó: así, al cambiar de página, se
      // ven los cambios hechos en otro dispositivo, y los bloques de una misma página comparten la carga.
      if (Date.now() - s.loadedAt > FRESH_MS) void load(table);
      s.listeners.add(listener);
      return () => s.listeners.delete(listener);
    },
    [table],
  );
  const { rows, loading } = useSyncExternalStore(subscribe, () => store.snapshot);

  useEffect(watchChanges, []);

  const reload = useCallback(() => load(table), [table]);

  const add = useCallback(
    (row: NewRow<T>) =>
      attempt(async () => {
        const created = await backend.insert(table, row);
        setRows(table, (prev) => [...prev, created]);
        return created;
      }),
    [table],
  );

  const update = useCallback(
    (id: string, patch: Partial<NewRow<T>>) =>
      attempt(async () => {
        await backend.update(table, id, patch);
        setRows(table, (prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
        return true;
      }),
    [table],
  );

  /** Varios cambios a la vez, visibles al momento (p. ej. recolocar bloques); si alguno falla, se recarga. */
  const updateMany = useCallback(
    (items: { id: string; patch: Partial<NewRow<T>> }[]) =>
      attempt(async () => {
        if (items.length === 0) return true;
        const patches = new Map(items.map((i) => [i.id, i.patch]));
        setRows(table, (prev) => prev.map((r) => (patches.has(r.id) ? { ...r, ...patches.get(r.id) } : r)));
        try {
          await Promise.all(items.map((i) => backend.update(table, i.id, i.patch)));
        } catch (e) {
          void load(table);
          throw e;
        }
        return true;
      }),
    [table],
  );

  const remove = useCallback(
    (id: string) =>
      attempt(async () => {
        await backend.remove(table, id);
        setRows(table, (prev) => prev.filter((r) => r.id !== id));
        return true;
      }),
    [table],
  );

  return { rows, loading, add, update, updateMany, remove, reload };
}

export type TableApi<T extends TableName> = ReturnType<typeof useTable<T>>;
