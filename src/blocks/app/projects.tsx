import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { confirmDelete, Empty, IconButton, Progress } from '../../components/ui';
import { PROJECT_COLORS } from '../../lib/defaults';
import type { NewRow, Priority, Project, ProjectStatus, Task, TaskStatus } from '../../lib/types';
import { useTable } from '../../lib/useTable';
import { fmtDate, pct, today } from '../../lib/utils';

const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: 'pendiente', label: 'Pendiente' },
  { id: 'en_curso', label: 'En curso' },
  { id: 'hecha', label: 'Hecha' },
];

const PRIORITY_RANK: Record<Priority, number> = { alta: 0, media: 1, baja: 2 };
const PRIORITY_LABEL: Record<Priority, string> = { alta: 'Alta', media: 'Media', baja: 'Baja' };
const STATUS_LABEL: Record<ProjectStatus, string> = { activo: 'Activo', pausado: 'Pausado', completado: 'Completado' };

export function UpcomingDeadlines() {
  const day = today();
  const tasks = useTable('tasks');
  const projects = useTable('projects');
  const projectName = (id: string | null) => projects.rows.find((p) => p.id === id)?.name;
  const upcoming = tasks.rows
    .filter((t) => t.status !== 'hecha' && t.due_date)
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!))
    .slice(0, 5);

  if (upcoming.length === 0) return <Empty>{tasks.loading ? 'Cargando…' : 'No hay tareas con fecha límite pendientes.'}</Empty>;
  return (
    <ul className="list">
      {upcoming.map((t) => (
        <li key={t.id}>
          <span>
            {t.title}
            {projectName(t.project_id) && <span className="muted"> · {projectName(t.project_id)}</span>}
          </span>
          <span className={`due ${t.due_date! < day ? 'overdue' : ''}`}>{fmtDate(t.due_date!)}</span>
        </li>
      ))}
    </ul>
  );
}

export function ActiveProjects() {
  const tasks = useTable('tasks');
  const projects = useTable('projects');
  const active = projects.rows.filter((p) => p.status === 'activo');

  if (active.length === 0) return <Empty>{projects.loading ? 'Cargando…' : 'Sin proyectos activos.'}</Empty>;
  return (
    <ul className="list">
      {active.map((p) => {
        const own = tasks.rows.filter((t) => t.project_id === p.id);
        const done = own.filter((t) => t.status === 'hecha').length;
        return (
          <li key={p.id} className="list-progress">
            <span>
              <span className="dot" style={{ background: p.color }} /> {p.name}
            </span>
            <span className="muted">
              {done}/{own.length}
            </span>
            <Progress value={pct(done, own.length)} label={`Progreso de ${p.name}`} />
          </li>
        );
      })}
    </ul>
  );
}

export function ProjectList() {
  const projects = useTable('projects');
  const tasks = useTable('tasks');

  const removeProject = async (p: Project) => {
    if (!confirmDelete(`el proyecto «${p.name}» y todas sus tareas`)) return;
    await projects.remove(p.id);
    await tasks.reload();
  };

  return (
    <div className="stack">
      {projects.rows.length === 0 && !projects.loading && <Empty>Crea tu primer proyecto abajo.</Empty>}
      <ul className="project-list">
        {projects.rows.map((p) => {
          const own = tasks.rows.filter((t) => t.project_id === p.id);
          const done = own.filter((t) => t.status === 'hecha').length;
          return (
            <li key={p.id} className="project">
              <strong className="project-name">
                <span className="dot" style={{ background: p.color }} />
                {p.name}
              </strong>
              {p.description && <p className="muted small">{p.description}</p>}
              <Progress value={pct(done, own.length)} label={`Progreso de ${p.name}`} />
              <div className="row between">
                <select
                  className="sm"
                  value={p.status}
                  onChange={(e) => void projects.update(p.id, { status: e.target.value as ProjectStatus })}
                  aria-label={`Estado de ${p.name}`}
                >
                  {Object.entries(STATUS_LABEL).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
                <span className="muted small">
                  {done}/{own.length} hechas
                </span>
                <IconButton label={`Eliminar ${p.name}`} onClick={() => void removeProject(p)} danger>
                  ✕
                </IconButton>
              </div>
            </li>
          );
        })}
      </ul>
      <NewProject onAdd={projects.add} />
    </div>
  );
}

function NewProject({ onAdd }: { onAdd: (p: NewRow<'projects'>) => Promise<unknown> }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(PROJECT_COLORS[0]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await onAdd({ name: name.trim(), description: description.trim(), status: 'activo', color });
    setName('');
    setDescription('');
  };

  return (
    <form onSubmit={submit} className="stack subpanel">
      <strong>Nuevo proyecto</strong>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del proyecto" aria-label="Nombre del proyecto" required />
      <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción (opcional)" aria-label="Descripción" />
      <div className="swatches" role="radiogroup" aria-label="Color">
        {PROJECT_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={color === c}
            aria-label={`Color ${c}`}
            className="swatch"
            style={{ background: c }}
            onClick={() => setColor(c)}
          />
        ))}
      </div>
      <button className="btn primary">Crear proyecto</button>
    </form>
  );
}

/** 'todos' | 'sueltas' (tareas sin proyecto) | id de un proyecto */
type Filter = string;

export function TaskBoard() {
  const projects = useTable('projects');
  const tasks = useTable('tasks');
  const [filter, setFilter] = useState<Filter>('todos');

  const byId = useMemo(() => new Map(projects.rows.map((p) => [p.id, p])), [projects.rows]);
  // Si el proyecto elegido se borra, se vuelve a «Todas».
  const current = filter === 'todos' || filter === 'sueltas' || byId.has(filter) ? filter : 'todos';

  const visible = tasks.rows
    .filter((t) => current === 'todos' || (current === 'sueltas' ? !t.project_id : t.project_id === current))
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'));

  const move = (t: Task, dir: -1 | 1) => {
    const next = COLUMNS[COLUMNS.findIndex((c) => c.id === t.status) + dir];
    if (next) void tasks.update(t.id, { status: next.id });
  };

  return (
    <div className="stack">
      <label className="field board-filter">
        <span>Ver</span>
        <select value={current} onChange={(e) => setFilter(e.target.value)}>
          <option value="todos">Todas las tareas ({tasks.rows.length})</option>
          <option value="sueltas">Sin proyecto ({tasks.rows.filter((t) => !t.project_id).length})</option>
          {projects.rows.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({tasks.rows.filter((t) => t.project_id === p.id).length})
            </option>
          ))}
        </select>
      </label>
      <NewTask projects={projects.rows} defaultProject={current !== 'todos' && current !== 'sueltas' ? current : ''} onAdd={tasks.add} />
      <div className="board">
        {COLUMNS.map((col, i) => {
          const items = visible.filter((t) => t.status === col.id);
          return (
            <section key={col.id} className="column">
              <h3>
                {col.label} <span className="muted">{items.length}</span>
              </h3>
              {items.length === 0 ? (
                <Empty>—</Empty>
              ) : (
                <ul className="task-list">
                  {items.map((t) => {
                    const project = t.project_id ? byId.get(t.project_id) : undefined;
                    const overdue = t.status !== 'hecha' && !!t.due_date && t.due_date < today();
                    return (
                      <li key={t.id} className={`task ${t.status === 'hecha' ? 'is-done' : ''}`}>
                        <span className="task-title">{t.title}</span>
                        <div className="task-meta">
                          {project && (
                            <span className="tag" style={{ '--tag': project.color } as CSSProperties}>
                              {project.name}
                            </span>
                          )}
                          <span className={`pill p-${t.priority}`}>{PRIORITY_LABEL[t.priority]}</span>
                          {t.due_date && <span className={`due ${overdue ? 'overdue' : ''}`}>{fmtDate(t.due_date)}</span>}
                        </div>
                        <div className="task-actions">
                          <IconButton label="Mover a la columna anterior" onClick={() => move(t, -1)} disabled={i === 0}>
                            ←
                          </IconButton>
                          <IconButton label="Mover a la columna siguiente" onClick={() => move(t, 1)} disabled={i === COLUMNS.length - 1}>
                            →
                          </IconButton>
                          <IconButton
                            label="Eliminar tarea"
                            onClick={() => {
                              if (confirmDelete(`la tarea «${t.title}»`)) void tasks.remove(t.id);
                            }}
                            danger
                          >
                            ✕
                          </IconButton>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function NewTask({ projects, defaultProject, onAdd }: {
  projects: Project[];
  defaultProject: string;
  onAdd: (t: NewRow<'tasks'>) => Promise<unknown>;
}) {
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState(defaultProject);
  const [priority, setPriority] = useState<Priority>('media');
  const [due, setDue] = useState('');

  // Al filtrar por un proyecto, las nuevas tareas van a ese proyecto por defecto.
  const [lastDefault, setLastDefault] = useState(defaultProject);
  if (lastDefault !== defaultProject) {
    setLastDefault(defaultProject);
    setProjectId(defaultProject);
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await onAdd({ title: title.trim(), project_id: projectId || null, priority, status: 'pendiente', due_date: due || null });
    setTitle('');
    setDue('');
  };

  return (
    <form onSubmit={submit} className="task-form">
      <input className="grow" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nueva tarea…" aria-label="Título de la tarea" required />
      <select value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="Proyecto">
        <option value="">Sin proyecto</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} aria-label="Prioridad">
        {Object.entries(PRIORITY_LABEL).map(([id, label]) => (
          <option key={id} value={id}>
            Prioridad {label.toLowerCase()}
          </option>
        ))}
      </select>
      <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Fecha límite" />
      <button className="btn primary">Añadir</button>
    </form>
  );
}
