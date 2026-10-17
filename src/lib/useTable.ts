import { useCallback, useEffect, useState } from 'react';
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

/**
 * Filas de una tabla del usuario actual, con altas/cambios/bajas que actualizan el estado local.
 * Las operaciones devuelven `undefined` si fallan (el error ya se ha mostrado como aviso).
 */
export function useTable<T extends TableName>(table: T) {
  const [rows, setRows] = useState<Row<T>[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    await attempt(async () => setRows(await backend.list(table)));
    setLoading(false);
  }, [table]);

  useEffect(() => {
    void reload();
    return onDataChanged(() => void reload());
  }, [reload]);

  const add = useCallback(
    (row: NewRow<T>) =>
      attempt(async () => {
        const created = await backend.insert(table, row);
        setRows((prev) => [...prev, created]);
        return created;
      }),
    [table],
  );

  const update = useCallback(
    (id: string, patch: Partial<NewRow<T>>) =>
      attempt(async () => {
        await backend.update(table, id, patch);
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
        return true;
      }),
    [table],
  );

  const remove = useCallback(
    (id: string) =>
      attempt(async () => {
        await backend.remove(table, id);
        setRows((prev) => prev.filter((r) => r.id !== id));
        return true;
      }),
    [table],
  );

  return { rows, loading, add, update, remove, reload };
}
