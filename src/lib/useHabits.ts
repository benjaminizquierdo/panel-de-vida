import { useMemo } from 'react';
import { useTable } from './useTable';
import { streak } from './utils';

export function useHabits() {
  const habits = useTable('habits');
  const logs = useTable('habit_logs');

  const done = useMemo(() => new Set(logs.rows.map((l) => `${l.habit_id}|${l.date}`)), [logs.rows]);

  const isDone = (habitId: string, date: string) => done.has(`${habitId}|${date}`);

  const toggle = (habitId: string, date: string) => {
    const log = logs.rows.find((l) => l.habit_id === habitId && l.date === date);
    return log ? logs.remove(log.id) : logs.add({ habit_id: habitId, date });
  };

  const streakOf = (habitId: string) =>
    streak(new Set(logs.rows.filter((l) => l.habit_id === habitId).map((l) => l.date)));

  const active = habits.rows.filter((h) => h.active);

  return { habits, logs, active, isDone, toggle, streakOf };
}
