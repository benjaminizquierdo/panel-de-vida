import { HEALTH_LABEL, type HealthLevel } from '../lib/projects';

/** Semáforo de un proyecto: un punto de color con el motivo (como texto o al pasar por encima). */
export function HealthLight({ health, showReason }: { health: { level: HealthLevel; reason: string }; showReason?: boolean }) {
  const label = `${HEALTH_LABEL[health.level]}: ${health.reason}`;
  return (
    <span className={`health health-${health.level}`} title={label}>
      <span className="health-dot" role="img" aria-label={label} />
      {showReason && <span className="small">{health.reason}</span>}
    </span>
  );
}
