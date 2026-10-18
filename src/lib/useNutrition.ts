import { useRef } from 'react';
import { DEFAULT_GOALS } from './nutrition';
import type { HealthLog, NewRow, NutritionGoals } from './types';
import { useTable } from './useTable';

/** Objetivos de nutrición del usuario (o los de partida si aún no ha guardado los suyos). */
export function useGoals() {
  const goals = useTable('nutrition_goals');
  const row = goals.rows[0];
  const value: Omit<NutritionGoals, 'id'> = row
    ? { ...row, weight_target: row.weight_target === null ? null : Number(row.weight_target) }
    : DEFAULT_GOALS;
  const save = async (patch: Partial<NewRow<'nutrition_goals'>>) =>
    row ? goals.update(row.id, patch) : !!(await goals.add({ ...DEFAULT_GOALS, ...patch }));
  return { goals: value, saved: !!row, loading: goals.loading, save };
}

type DayPatch = Partial<Pick<HealthLog, 'water_ml' | 'steps' | 'active_kcal' | 'weight'>>;

/**
 * Registro de salud de un día (agua, pasos, kcal quemadas, peso) con un `set` que lo crea si no
 * existe. Los cambios seguidos (varios vasos de agua) esperan al anterior: así no se crean dos
 * registros del mismo día.
 */
export function useDayHealth(date: string) {
  const health = useTable('health_logs');
  const log = health.rows.find((h) => h.date === date);
  const pending = useRef<Promise<unknown>>(Promise.resolve());
  const inFlight = useRef(0);
  // Lo último que se sabe del registro: lo que llega de fuera solo se acepta sin cambios en curso.
  const latest = useRef<HealthLog | undefined>(log);
  if (inFlight.current === 0) latest.current = log;

  const set = (patch: DayPatch | ((log: HealthLog | undefined) => DayPatch)) => {
    inFlight.current++;
    const run = pending.current
      .then(async () => {
        const current = latest.current;
        const values = typeof patch === 'function' ? patch(current) : patch;
        if (current) {
          const ok = await health.update(current.id, values);
          if (ok) latest.current = { ...current, ...values };
          return ok;
        }
        const created = await health.add({ date, sleep_hours: null, energy: null, exercise_minutes: null, weight: null, notes: '', ...values });
        if (created) latest.current = created;
        return created;
      })
      .finally(() => {
        inFlight.current--;
      });
    pending.current = run.catch(() => {});
    return run;
  };

  return { log, health, set };
}
