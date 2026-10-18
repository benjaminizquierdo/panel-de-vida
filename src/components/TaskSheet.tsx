import { useState, type FormEvent } from 'react';
import { backend } from '../backend';
import { dayOf } from '../lib/projects';
import { fmtHours, hours, TASK_KINDS, taskKind, taskTime } from '../lib/tasks';
import { toast } from '../lib/toast';
import type { Priority, Project, Task, TaskStatus } from '../lib/types';
import { useTable, type TableApi } from '../lib/useTable';
import { fmtDate, parseNum } from '../lib/utils';
import Attachments from './Attachments';
import Sheet from './Sheet';
import { Progress } from './ui';

export const STATUS_OPTIONS: { id: TaskStatus; label: string }[] = [
  { id: 'pendiente', label: 'Pendiente' },
  { id: 'en_curso', label: 'En curso' },
  { id: 'hecha', label: 'Hecha' },
];
export const PRIORITY_OPTIONS: { id: Priority; label: string }[] = [
  { id: 'alta', label: 'Alta' },
  { id: 'media', label: 'Media' },
  { id: 'baja', label: 'Baja' },
];

/** Carpeta de los documentos de una tarea dentro de la del usuario. */
const taskFolder = (taskId: string) => `tareas/${taskId}`;

/**
 * Borra una tarea con sus documentos del almacén (las notas y enlaces caen en cascada).
 * Devuelve true si se ha borrado.
 */
export async function deleteTask(task: Task, tasks: TableApi<'tasks'>, items: TableApi<'task_items'>) {
  const files = items.rows.filter((i) => i.task_id === task.id && i.file_path).map((i) => i.file_path!);
  if (!(await tasks.remove(task.id))) return false;
  if (files.length) void backend.removeFiles(files).catch(() => {});
  void items.reload();
  return true;
}

/** Texto de un número de horas para un campo ('' si no tiene). */
const hoursText = (v: number | string | null | undefined) => {
  const h = hours(v);
  return h === null ? '' : String(h).replace('.', ',');
};

/**
 * Ficha de una tarea, al estilo de un «work item»: título, tipo, estado, prioridad, fecha,
 * proyecto, estimación y horas dedicadas, descripción, y sus notas, enlaces y documentos.
 */
export default function TaskSheet({ task, projects, onClose }: { task: Task; projects: Project[]; onClose: () => void }) {
  const tasks = useTable('tasks');
  const items = useTable('task_items');
  const [title, setTitle] = useState(task.title);
  const [kind, setKind] = useState(taskKind(task.kind).id);
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [due, setDue] = useState(task.due_date ?? '');
  const [projectId, setProjectId] = useState(task.project_id ?? '');
  const [description, setDescription] = useState(task.description ?? '');
  const [estimate, setEstimate] = useState(hoursText(task.estimate_hours));
  const [spent, setSpent] = useState(hoursText(task.spent_hours));
  const [busy, setBusy] = useState(false);

  const k = taskKind(kind);
  const parsedEstimate = estimate.trim() ? parseNum(estimate) : null;
  const parsedSpent = spent.trim() ? parseNum(spent) : null;
  const time = taskTime({ estimate_hours: parsedEstimate, spent_hours: parsedSpent });

  const patch = {
    title: title.trim().slice(0, 500),
    kind,
    status,
    priority,
    due_date: due || null,
    project_id: projectId || null,
    description: description.slice(0, 20000),
    estimate_hours: parsedEstimate === null ? null : Math.round(parsedEstimate * 100) / 100,
    spent_hours: parsedSpent === null ? null : Math.round(parsedSpent * 100) / 100,
  };
  const dirty =
    patch.title !== task.title ||
    patch.kind !== taskKind(task.kind).id ||
    patch.status !== task.status ||
    patch.priority !== task.priority ||
    patch.due_date !== (task.due_date ?? null) ||
    patch.project_id !== (task.project_id ?? null) ||
    patch.description !== (task.description ?? '') ||
    patch.estimate_hours !== hours(task.estimate_hours) ||
    patch.spent_hours !== hours(task.spent_hours);

  const close = () => {
    if (dirty && !window.confirm('Hay cambios sin guardar en la tarea. ¿Cerrar sin guardarlos?')) return;
    onClose();
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!patch.title) return toast('La tarea necesita un título', 'error');
    for (const [label, v, raw] of [['La estimación', parsedEstimate, estimate], ['Las horas dedicadas', parsedSpent, spent]] as const) {
      if (raw.trim() && (v === null || v < 0 || v > 10000)) return toast(`${label} tiene que ser un número de horas (por ejemplo 1,5)`, 'error');
    }
    setBusy(true);
    const ok = await tasks.update(task.id, patch);
    setBusy(false);
    if (ok) {
      toast('Tarea guardada');
      onClose();
    }
  };

  const remove = async () => {
    if (!window.confirm(`¿Eliminar la tarea «${task.title}» con sus notas y documentos? No se puede deshacer.`)) return;
    setBusy(true);
    const ok = await deleteTask(task, tasks, items);
    setBusy(false);
    if (ok) onClose();
  };

  const created = dayOf(task.created_at);
  const completed = dayOf(task.completed_at);

  return (
    <Sheet
      wide
      title={`${k.icon} ${k.name}`}
      onClose={close}
      footer={
        <>
          <button type="button" className="btn ghost sm danger-text" onClick={() => void remove()} disabled={busy}>
            Eliminar tarea
          </button>
          <span className="row">
            {dirty && <span className="muted small">Sin guardar</span>}
            <button className="btn primary" form="task-form" disabled={busy || !dirty}>
              Guardar
            </button>
          </span>
        </>
      }
    >
      <div className="task-sheet">
        <form id="task-form" className="task-sheet-main stack" onSubmit={save}>
          <input className="task-sheet-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={500} aria-label="Título de la tarea" required />
          <label className="field">
            <span>Descripción</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              maxLength={20000}
              placeholder="Qué hay que hacer, cómo, y cuándo se puede dar por hecha…"
            />
          </label>
        </form>

        <aside className="task-sheet-side" aria-label="Detalles de la tarea">
          <label className="field">
            <span>Tipo</span>
            <select form="task-form" value={kind} onChange={(e) => setKind(e.target.value)}>
              {TASK_KINDS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.icon} {t.name}
                </option>
              ))}
            </select>
          </label>
          <div className="task-sheet-pair">
            <label className="field">
              <span>Estado</span>
              <select form="task-form" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Prioridad</span>
              <select form="task-form" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span>Fecha límite</span>
            <input form="task-form" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
          <label className="field">
            <span>Proyecto</span>
            <select form="task-form" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Sin proyecto</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="field task-time">
            <legend>Tiempo</legend>
            <div className="task-sheet-pair">
              <label className="field">
                <span>Estimación (h)</span>
                <input form="task-form" inputMode="decimal" value={estimate} onChange={(e) => setEstimate(e.target.value)} placeholder="2" />
              </label>
              <label className="field">
                <span>Dedicado (h)</span>
                <input form="task-form" inputMode="decimal" value={spent} onChange={(e) => setSpent(e.target.value)} placeholder="0" />
              </label>
            </div>
            {time.estimate !== null && (
              <>
                <Progress value={time.ratio * 100} tone={time.over ? 'danger' : undefined} label="Horas dedicadas frente a la estimación" />
                <span className={`small ${time.over ? 'text-danger' : 'muted'}`}>
                  {time.over ? `Te has pasado ${fmtHours(time.spent - time.estimate)}` : `Quedan ${fmtHours(time.remaining!)}`}
                </span>
              </>
            )}
          </fieldset>
          <p className="muted small">
            {created && `Creada el ${fmtDate(created)}`}
            {completed && status === 'hecha' && ` · hecha el ${fmtDate(completed)}`}
          </p>
        </aside>

        <div className="task-sheet-attachments">
          <Attachments
            compact
            folder={taskFolder(task.id)}
            notePlaceholder="Una nota de seguimiento: lo que has probado, lo que falta, a quién preguntar…"
            store={{
              items: items.rows.filter((i) => i.task_id === task.id),
              add: (item) => items.add({ ...item, task_id: task.id }),
              update: items.update,
              remove: items.remove,
            }}
          />
        </div>
      </div>
    </Sheet>
  );
}
