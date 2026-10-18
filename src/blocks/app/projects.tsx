import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import ProjectSheet, { STATUS_LABEL } from '../../components/ProjectSheet';
import TaskSheet, { deleteTask } from '../../components/TaskSheet';
import { HealthLight } from '../../components/projectUi';
import { confirmDelete, Empty, IconButton, Progress } from '../../components/ui';
import { filterValue } from '../../lib/blockKinds';
import { daysUntil } from '../../lib/insights';
import { useNav } from '../../lib/pageContext';
import { fieldNumber, fieldText, keyDateOf, kindOf, phaseOf, PHASE_FIELD, PROJECT_KINDS, projectKind, type ProjectField } from '../../lib/projectKinds';
import { budgetOf, compareTasks, focusTasks, healthOf, isOverdue, nextStep, progressOf, totalHours } from '../../lib/projects';
import type { NewRow, Priority, Project, ProjectStatus, Task, TaskStatus } from '../../lib/types';
import { toast } from '../../lib/toast';
import { pickProject, useProjectData } from '../../lib/useProjects';
import { fmtHours, sumTime, taskKind, taskTime } from '../../lib/tasks';
import { useTable } from '../../lib/useTable';
import { eur, fmtDate, num, parseISO, pct, today } from '../../lib/utils';
import { HeaderAction } from '../header';
import type { BlockProps } from '..';

const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: 'pendiente', label: 'Pendiente' },
  { id: 'en_curso', label: 'En curso' },
  { id: 'hecha', label: 'Hecha' },
];

const PRIORITY_RANK: Record<Priority, number> = { alta: 0, media: 1, baja: 2 };
const PRIORITY_LABEL: Record<Priority, string> = { alta: 'Alta', media: 'Media', baja: 'Baja' };

const fmtLongDate = (d: string) => parseISO(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

/** Aviso de un bloque de proyecto sin proyecto que mostrar. */
export function NoProject({ block, kinds }: { block: BlockProps['block']; kinds?: string[] }) {
  const projects = useTable('projects');
  if (projects.loading) return <Empty>Cargando…</Empty>;
  const wanted = (kinds ?? []).map((k) => `${projectKind(k).icon} ${projectKind(k).name}`).join(', ');
  return (
    <Empty>
      {filterValue(block.content, 'project') ? 'El proyecto de este bloque ya no existe. ' : ''}
      {wanted ? `Crea un proyecto de tipo ${wanted} o elige uno en ⚙.` : 'Crea un proyecto o elige uno en ⚙.'}
    </Empty>
  );
}

/** Nombre del proyecto del bloque cuando no se está en su página (con enlace para abrirla). */
export function ProjectLabel({ project, chosen }: { project: Project; chosen: boolean }) {
  const nav = useNav();
  if (nav.current?.project_id === project.id) return null;
  return (
    <p className="small muted project-label">
      <button type="button" className="link-btn" onClick={() => nav.openProject(project)}>
        {kindOf(project).icon} {project.name}
      </button>
      {!chosen && ' · elige otro en ⚙'}
    </p>
  );
}

// ---------------------------------------------------------------- Lista y tarjetas

export function UpcomingDeadlines({ block }: BlockProps) {
  const day = today();
  const tasks = useTable('tasks');
  const projects = useTable('projects');
  const only = filterValue(block.content, 'project');
  const projectName = (id: string | null) => (only ? undefined : projects.rows.find((p) => p.id === id)?.name);
  const upcoming = tasks.rows
    .filter((t) => t.status !== 'hecha' && t.due_date && (!only || t.project_id === only))
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
  const nav = useNav();
  const { projects, dataOf } = useProjectData();
  const day = today();
  const active = projects.rows.filter((p) => p.status === 'activo');

  if (active.length === 0) return <Empty>{projects.loading ? 'Cargando…' : 'Sin proyectos activos.'}</Empty>;
  return (
    <ul className="list">
      {active.map((p) => {
        const progress = progressOf(p, dataOf(p.id), day);
        return (
          <li key={p.id} className="list-progress">
            <button type="button" className="link-btn project-link" onClick={() => nav.openProject(p)}>
              <span aria-hidden>{kindOf(p).icon}</span> {p.name}
            </button>
            <span className="muted small">{progress.label}</span>
            <Progress value={progress.value} label={`Progreso de ${p.name}`} />
          </li>
        );
      })}
    </ul>
  );
}

type StatusFilter = ProjectStatus | 'todos';

/** Tarjetas de los proyectos con filtros por tipo y estado, y «+ Nuevo proyecto». */
export function ProjectCards() {
  const nav = useNav();
  const { projects, dataOf } = useProjectData();
  const day = today();
  const [kind, setKind] = useState('todos');
  const [status, setStatus] = useState<StatusFilter>('activo');
  const [creating, setCreating] = useState(false);

  const kindsInUse = PROJECT_KINDS.filter((k) => projects.rows.some((p) => kindOf(p).id === k.id));
  const byKind = projects.rows.filter((p) => kind === 'todos' || kindOf(p).id === kind);
  const visible = byKind.filter((p) => status === 'todos' || p.status === status);
  const count = (s: StatusFilter) => byKind.filter((p) => s === 'todos' || p.status === s).length;

  return (
    <div className="stack">
      <HeaderAction>
        <button type="button" className="btn primary sm" onClick={() => setCreating(true)}>
          ＋ Nuevo proyecto
        </button>
      </HeaderAction>
      {projects.rows.length > 0 && (
        <div className="project-filters">
          {kindsInUse.length > 1 && (
            <div className="filter-chips" role="group" aria-label="Filtrar por tipo">
              <button type="button" className="filter-chip" aria-pressed={kind === 'todos'} onClick={() => setKind('todos')}>
                Todos
              </button>
              {kindsInUse.map((k) => (
                <button key={k.id} type="button" className="filter-chip" aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>
                  {k.icon} {k.name}
                </button>
              ))}
            </div>
          )}
          <div className="segmented" role="group" aria-label="Filtrar por estado">
            {(['activo', 'pausado', 'completado', 'todos'] as StatusFilter[]).map((s) => (
              <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}>
                {s === 'todos' ? 'Todos' : `${STATUS_LABEL[s]}s`}
                <span className="count">{count(s)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {projects.loading && projects.rows.length === 0 ? (
        <Empty>Cargando…</Empty>
      ) : projects.rows.length === 0 ? (
        <div className="stack center-text">
          <Empty>Aún no tienes proyectos. Elige un tipo (profesional, estudios, reto, viaje…) y cada uno tendrá su propia vista.</Empty>
          <div className="row center">
            <button type="button" className="btn primary" onClick={() => setCreating(true)}>
              ＋ Crear el primer proyecto
            </button>
          </div>
        </div>
      ) : visible.length === 0 ? (
        <Empty>No hay proyectos con estos filtros.</Empty>
      ) : (
        <ul className="project-cards">
          {visible.map((p) => {
            const k = kindOf(p);
            const data = dataOf(p.id);
            const progress = progressOf(p, data, day);
            const next = nextStep(p, data, day);
            return (
              <li key={p.id}>
                <button type="button" className="project-card" style={{ '--kind': p.color || k.color } as CSSProperties} onClick={() => nav.openProject(p)}>
                  <span className="project-card-head">
                    <span className="project-icon" aria-hidden>
                      {k.icon}
                    </span>
                    <span className="project-card-title">
                      <strong>{p.name}</strong>
                      <span className="muted small">
                        {k.name}
                        {p.status !== 'activo' && ` · ${STATUS_LABEL[p.status]}`}
                      </span>
                    </span>
                    <HealthLight health={healthOf(p, data, day)} />
                  </span>
                  <Progress value={progress.value} label={`Progreso de ${p.name}`} />
                  <span className="muted small">
                    {progress.value} %{progress.label && ` · ${progress.label}`}
                  </span>
                  {next && <span className="project-next small">→ {next}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {creating && <ProjectSheet onClose={() => setCreating(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------- Foco de hoy

/** La tarea más prioritaria de todos los proyectos activos, y las dos siguientes. */
export function FocusToday() {
  const nav = useNav();
  const projects = useTable('projects');
  const tasks = useTable('tasks');
  const [openId, setOpenId] = useState<string | null>(null);
  const day = today();
  const list = focusTasks(tasks.rows, projects.rows, day);
  const opened = openId ? tasks.rows.find((t) => t.id === openId) : undefined;
  const [top, ...rest] = list;
  const projectOf = (t: Task) => projects.rows.find((p) => p.id === t.project_id);

  const done = async (t: Task) => {
    if (await tasks.update(t.id, { status: 'hecha' })) toast(`✓ «${t.title}» hecha`);
  };

  if (!top) {
    return <Empty>{tasks.loading ? 'Cargando…' : 'Nada pendiente en tus proyectos activos. Cuando añadas tareas, aquí verás la más importante.'}</Empty>;
  }
  const project = projectOf(top);
  const when = top.due_date ? (top.due_date < day ? `Venció el ${fmtDate(top.due_date)}` : top.due_date === day ? 'Para hoy' : `Para el ${fmtDate(top.due_date)}`) : null;
  return (
    <div className="focus">
      <div className="focus-main">
        <button type="button" className="focus-check" aria-label={`Marcar «${top.title}» como hecha`} title="Marcar como hecha" onClick={() => void done(top)}>
          ✓
        </button>
        <div className="focus-text">
          <button type="button" className="link-btn focus-title" onClick={() => setOpenId(top.id)} title="Abrir la ficha de la tarea">
            {top.title}
          </button>
          <div className="task-meta">
            {project && (
              <button type="button" className="tag tag-btn" style={{ '--tag': project.color } as CSSProperties} onClick={() => nav.openProject(project)}>
                {kindOf(project).icon} {project.name}
              </button>
            )}
            <span className={`pill p-${top.priority}`}>{PRIORITY_LABEL[top.priority]}</span>
            {when && <span className={`due ${isOverdue(top, day) ? 'overdue' : ''}`}>{when}</span>}
            {top.status === 'en_curso' && <span className="muted small">En curso</span>}
          </div>
        </div>
        {top.status === 'pendiente' && (
          <button type="button" className="btn ghost sm" onClick={() => void tasks.update(top.id, { status: 'en_curso' })}>
            ▶ Empezar
          </button>
        )}
      </div>
      {rest.length > 0 && (
        <div className="focus-next">
          <span className="muted small">Después</span>
          <ul className="list">
            {rest.slice(0, 2).map((t) => (
              <li key={t.id}>
                <label className="check">
                  <input type="checkbox" checked={false} onChange={() => void done(t)} aria-label={`Marcar «${t.title}» como hecha`} />
                  <span>
                    {t.title}
                    {projectOf(t) && <span className="muted small"> · {projectOf(t)!.name}</span>}
                  </span>
                </label>
                {t.due_date && <span className={`due ${isOverdue(t, day) ? 'overdue' : ''}`}>{fmtDate(t.due_date)}</span>}
              </li>
            ))}
          </ul>
          {list.length > 3 && <span className="muted small">y {list.length - 3} más</span>}
        </div>
      )}
      {opened && <TaskSheet key={opened.id} task={opened} projects={projects.rows} onClose={() => setOpenId(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------- Tareas

/** 'todos' | 'sueltas' (tareas sin proyecto) | id de un proyecto */
type Filter = string;

export function TaskBoard({ block }: BlockProps) {
  const projects = useTable('projects');
  const tasks = useTable('tasks');
  const taskItems = useTable('task_items');
  const [filter, setFilter] = useState<Filter>('todos');
  // Tarea con la ficha abierta.
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = openId ? tasks.rows.find((t) => t.id === openId) : undefined;
  const attachments = useMemo(() => {
    const count = new Map<string, number>();
    for (const i of taskItems.rows) count.set(i.task_id, (count.get(i.task_id) ?? 0) + 1);
    return count;
  }, [taskItems.rows]);
  // Con un proyecto fijado en los ajustes del bloque, el tablero es solo de ese proyecto.
  const fixed = filterValue(block.content, 'project');

  const byId = useMemo(() => new Map(projects.rows.map((p) => [p.id, p])), [projects.rows]);
  // Si el proyecto elegido se borra, se vuelve a «Todas».
  const wanted = fixed || filter;
  const current = wanted === 'todos' || wanted === 'sueltas' || byId.has(wanted) ? wanted : 'todos';

  const visible = tasks.rows
    .filter((t) => current === 'todos' || (current === 'sueltas' ? !t.project_id : t.project_id === current))
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'));

  const move = (t: Task, dir: -1 | 1) => {
    const next = COLUMNS[COLUMNS.findIndex((c) => c.id === t.status) + dir];
    if (next) void tasks.update(t.id, { status: next.id });
  };

  return (
    <div className="stack">
      {fixed && byId.get(fixed) && <ProjectLabel project={byId.get(fixed)!} chosen />}
      {!fixed && (
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
      )}
      <NewTask projects={projects.rows} defaultProject={current !== 'todos' && current !== 'sueltas' ? current : ''} fixed={!!fixed} onAdd={tasks.add} />
      <div className="board">
        {COLUMNS.map((col, i) => {
          const items = visible.filter((t) => t.status === col.id);
          const time = sumTime(items);
          return (
            <section key={col.id} className="column">
              <h3>
                {col.label} <span className="muted">{items.length}</span>
                {time.estimate > 0 && (
                  <span className="column-time muted small" title="Horas dedicadas / estimadas">
                    ⏱ {col.id === 'pendiente' ? fmtHours(time.estimate) : `${fmtHours(time.spent)} / ${fmtHours(time.estimate)}`}
                  </span>
                )}
              </h3>
              {items.length === 0 ? (
                <Empty>—</Empty>
              ) : (
                <ul className="task-list">
                  {items.map((t) => {
                    const project = t.project_id ? byId.get(t.project_id) : undefined;
                    const overdue = isOverdue(t, today());
                    const kind = taskKind(t.kind);
                    const tt = taskTime(t);
                    const files = attachments.get(t.id) ?? 0;
                    return (
                      <li key={t.id} className={`task ${t.status === 'hecha' ? 'is-done' : ''}`} style={{ '--kind': kind.color } as CSSProperties}>
                        <button type="button" className="task-open" onClick={() => setOpenId(t.id)} title="Abrir la ficha de la tarea">
                          <span className="task-kind small" aria-label={`Tipo: ${kind.name}`}>
                            {kind.icon} {kind.name}
                          </span>
                          <span className="task-title">{t.title}</span>
                        </button>
                        <div className="task-meta">
                          {project && !fixed && (
                            <span className="tag" style={{ '--tag': project.color } as CSSProperties}>
                              {project.name}
                            </span>
                          )}
                          <span className={`pill p-${t.priority}`}>{PRIORITY_LABEL[t.priority]}</span>
                          {t.due_date && <span className={`due ${overdue ? 'overdue' : ''}`}>{fmtDate(t.due_date)}</span>}
                          {tt.estimate !== null && (
                            <span className={`task-chip ${tt.over ? 'text-danger' : ''}`} title="Horas dedicadas / estimadas">
                              ⏱ {tt.spent > 0 ? `${fmtHours(tt.spent)} / ${fmtHours(tt.estimate)}` : fmtHours(tt.estimate)}
                            </span>
                          )}
                          {t.description?.trim() && (
                            <span className="task-chip" title="Tiene descripción" aria-label="Tiene descripción">
                              ≡
                            </span>
                          )}
                          {files > 0 && (
                            <span className="task-chip" title={`${files} notas, enlaces o documentos`}>
                              📎 {files}
                            </span>
                          )}
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
                              if (confirmDelete(`la tarea «${t.title}»${files ? ' con sus notas y documentos' : ''}`)) void deleteTask(t, tasks, taskItems);
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
      {opened && <TaskSheet key={opened.id} task={opened} projects={projects.rows} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function NewTask({ projects, defaultProject, fixed, onAdd }: {
  projects: Project[];
  defaultProject: string;
  /** Tablero de un solo proyecto: no se elige proyecto. */
  fixed: boolean;
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
    <form onSubmit={submit} className={`task-form ${fixed ? 'is-fixed-project' : ''}`}>
      <input className="grow" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nueva tarea…" aria-label="Título de la tarea" required />
      {!fixed && (
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="Proyecto">
          <option value="">Sin proyecto</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
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

/** Las tareas de un proyecto como checklist simple. */
export function ProjectChecklist({ block }: BlockProps) {
  const projects = useTable('projects');
  const tasks = useTable('tasks');
  const taskItems = useTable('task_items');
  const { project, chosen } = pickProject(block, projects.rows);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const day = today();

  if (!project) return <NoProject block={block} kinds={['hogar', 'viaje', 'creativo']} />;
  const own = tasks.rows.filter((t) => t.project_id === project.id);
  const open = own.filter((t) => t.status !== 'hecha').sort(compareTasks(day));
  const done = own.filter((t) => t.status === 'hecha');

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (await tasks.add({ title: title.trim().slice(0, 500), project_id: project.id, priority: 'media', status: 'pendiente', due_date: due || null })) {
      setTitle('');
      setDue('');
    }
  };

  const row = (t: Task) => (
    <li key={t.id}>
      <label className="check">
        <input
          type="checkbox"
          checked={t.status === 'hecha'}
          onChange={(e) => void tasks.update(t.id, { status: e.target.checked ? 'hecha' : 'pendiente' })}
        />
        <span className={t.status === 'hecha' ? 'done' : ''}>{t.title}</span>
      </label>
      <span className="row">
        {t.due_date && t.status !== 'hecha' && <span className={`due ${isOverdue(t, day) ? 'overdue' : ''}`}>{fmtDate(t.due_date)}</span>}
        <IconButton label={`Eliminar «${t.title}»`} onClick={() => void deleteTask(t, tasks, taskItems)}>
          ✕
        </IconButton>
      </span>
    </li>
  );

  return (
    <div className="stack">
      <ProjectLabel project={project} chosen={chosen} />
      {own.length > 0 && (
        <div className="row between">
          <span className="muted small">
            {done.length}/{own.length} hechas
          </span>
        </div>
      )}
      {own.length > 0 && <Progress value={pct(done.length, own.length)} tone={done.length === own.length ? 'ok' : undefined} label={`Tareas hechas de ${project.name}`} />}
      {own.length === 0 && <Empty>Sin tareas todavía: escribe la primera abajo.</Empty>}
      <ul className="list check-tasks">
        {open.map(row)}
        {done.map(row)}
      </ul>
      <form className="inline-form wrap" onSubmit={add}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Añadir tarea…" aria-label="Nueva tarea" maxLength={500} />
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Fecha límite (opcional)" />
        <button className="btn ghost sm" disabled={!title.trim()}>
          Añadir
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------- Resumen, fases y cuenta atrás

/** Valor de un campo propio, listo para mostrar. */
export function formatField(field: ProjectField, project: Project): string {
  if (field.type === 'number') {
    const n = fieldNumber(project, field.key);
    if (n === null) return '';
    return field.unit === '€' ? eur(n) : `${num(n)}${field.unit ? ` ${field.unit}` : ''}`;
  }
  const v = fieldText(project, field.key);
  if (!v) return '';
  if (field.type === 'date') return fmtLongDate(v);
  if (field.type === 'select') return field.choices?.find((c) => c.value === v)?.label ?? v;
  return v;
}

/** Progreso, semáforo, siguiente paso y datos propios de un proyecto. */
export function ProjectSummary({ block }: BlockProps) {
  const nav = useNav();
  const { projects, dataOf } = useProjectData();
  const transactions = useTable('transactions');
  const { project, chosen } = pickProject(block, projects.rows);
  const [editing, setEditing] = useState(false);
  const day = today();

  if (!project) return <NoProject block={block} />;
  const kind = kindOf(project);
  const data = dataOf(project.id);
  const progress = progressOf(project, data, day);
  const health = healthOf(project, data, day);
  const next = nextStep(project, data, day);
  const onOwnPage = nav.current?.project_id === project.id;

  const facts = kind.fields
    .filter((f) => f.key !== 'veces' || fieldText(project, 'frecuencia') === 'semanal')
    .map((f) => ({ label: f.label.replace(/ \(opcional\)$/, ''), value: formatField(f, project) }))
    .filter((f) => f.value);
  const ph = phaseOf(project);
  if (ph) facts.unshift({ label: 'Fase', value: ph.phase.label });
  const hours = totalHours(data.logs);
  const estimated = fieldNumber(project, 'horas_estimadas') ?? fieldNumber(project, 'horas_objetivo');
  if (hours > 0 || estimated) facts.push({ label: 'Horas', value: `${num(hours)}${estimated ? ` de ${num(estimated)}` : ''} h` });
  if (kind.id === 'viaje' || fieldNumber(project, 'presupuesto') !== null) {
    const b = budgetOf(project, transactions.rows);
    if (b.spent > 0 || b.budget !== null) facts.push({ label: 'Gastado', value: `${eur(b.spent)}${b.budget !== null ? ` de ${eur(b.budget)}` : ''}` });
  }

  return (
    <div className="project-summary" style={{ '--kind': project.color || kind.color } as CSSProperties}>
      {!onOwnPage && (
        <div className="row between">
          <button type="button" className="link-btn project-link" onClick={() => nav.openProject(project)}>
            <strong>
              {kind.icon} {project.name}
            </strong>
          </button>
          {!chosen && <span className="muted small">elige otro en ⚙</span>}
        </div>
      )}
      <div className="project-summary-main">
        <div className="project-summary-progress">
          <strong className="score-value">{progress.value} %</strong>
          <span className="muted small">{progress.label}</span>
          <Progress value={progress.value} tone={progress.value >= 100 ? 'ok' : undefined} label={`Progreso de ${project.name}`} />
        </div>
        <div className="project-summary-side">
          <HealthLight health={health} showReason />
          {next && (
            <p className="project-next">
              <span className="muted small">Siguiente paso</span>
              <br />
              {next}
            </p>
          )}
        </div>
      </div>
      {facts.length > 0 && (
        <dl className="facts">
          {facts.map((f) => (
            <div key={f.label}>
              <dt className="muted small">{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {facts.length === 0 && kind.fields.length > 0 && (
        <button type="button" className="btn ghost sm" onClick={() => setEditing(true)}>
          Rellenar los datos del proyecto
        </button>
      )}
      {editing && <ProjectSheet project={project} onClose={() => setEditing(false)} />}
    </div>
  );
}

/** Las fases del proyecto; pulsar una la marca como la actual. */
export function ProjectPhases({ block }: BlockProps) {
  const projects = useTable('projects');
  const { project, chosen } = pickProject(block, projects.rows);
  if (!project) return <NoProject block={block} kinds={['profesional', 'creativo']} />;
  const ph = phaseOf(project);
  if (!ph) return <Empty>Los proyectos de tipo {kindOf(project).name} no tienen fases.</Empty>;

  return (
    <div className="stack">
      <ProjectLabel project={project} chosen={chosen} />
      <ol className="phases" aria-label={`Fases de ${project.name}`}>
        {ph.phases.map((p, i) => (
          <li key={p.value} className={i < ph.index ? 'is-done' : i === ph.index ? 'is-current' : ''}>
            <button
              type="button"
              aria-current={i === ph.index ? 'step' : undefined}
              onClick={() => i !== ph.index && void projects.update(project.id, { fields: { ...project.fields, [PHASE_FIELD]: p.value } })}
            >
              <span className="phase-dot" aria-hidden>
                {i < ph.index ? '✓' : i + 1}
              </span>
              <span>{p.label}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Días que faltan para la fecha clave del proyecto (entrega, examen, salida…). */
export function ProjectCountdown({ block }: BlockProps) {
  const projects = useTable('projects');
  const { project, chosen } = pickProject(block, projects.rows);
  const [editing, setEditing] = useState(false);
  if (!project) return <NoProject block={block} kinds={['profesional', 'estudios', 'viaje']} />;
  const kind = kindOf(project);
  const key = keyDateOf(project);
  if (!kind.keyDate) return <Empty>Los proyectos de tipo {kind.name} no tienen una fecha clave.</Empty>;
  if (!key) {
    const label = kind.fields.find((f) => f.key === kind.keyDate!.field)?.label.toLowerCase().replace(/ \(opcional\)$/, '');
    return (
      <div className="stack">
        <ProjectLabel project={project} chosen={chosen} />
        <Empty>Pon la {label} del proyecto para ver la cuenta atrás.</Empty>
        <button type="button" className="btn ghost sm" onClick={() => setEditing(true)}>
          Poner la fecha
        </button>
        {editing && <ProjectSheet project={project} onClose={() => setEditing(false)} />}
      </div>
    );
  }
  const days = daysUntil(key.date, today());
  const end = kind.id === 'viaje' ? fieldText(project, 'fin') : '';
  const length = end && end >= key.date ? daysUntil(end, key.date) + 1 : null;
  return (
    <div className="countdown-big">
      <ProjectLabel project={project} chosen={chosen} />
      <strong className={`countdown-number ${days < 0 ? 'muted' : days <= 7 ? 'tone-warn' : ''}`}>{days === 0 ? '¡Hoy!' : Math.abs(days)}</strong>
      {days !== 0 && <span>{days > 0 ? `día${days === 1 ? '' : 's'} para: ${key.label.toLowerCase()}` : `día${days === -1 ? '' : 's'} desde: ${key.label.toLowerCase()}`}</span>}
      <span className="muted small">
        {key.label}: {fmtLongDate(key.date)}
        {length && ` · ${length} día${length === 1 ? '' : 's'}`}
      </span>
    </div>
  );
}

