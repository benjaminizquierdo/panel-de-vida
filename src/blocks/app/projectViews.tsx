import { useMemo, useRef, useState, type FormEvent } from 'react';
import { backend } from '../../backend';
import { confirmDelete, Empty, IconButton, Progress } from '../../components/ui';
import { normalizeUrl, linkHost } from '../../lib/blocks';
import { categoryOptions, categoryPath } from '../../lib/categories';
import { weekColumns } from '../../lib/insights';
import { useUser } from '../../lib/pageContext';
import { fieldNumber, fieldText } from '../../lib/projectKinds';
import { budgetOf, byOrder, dayOf, moduleRatio, streakStats, totalHours, valueLogs, valueProgress } from '../../lib/projects';
import { toast } from '../../lib/toast';
import type { ItemStatus, NewRow, Project, ProjectItem } from '../../lib/types';
import { pickProject, useProjectData } from '../../lib/useProjects';
import { useTable } from '../../lib/useTable';
import { addDays, eur, fmtDate, num, parseNum, pct, today } from '../../lib/utils';
import type { BlockProps } from '..';
import { DayGrid } from './insights';
import { maxFileBytes, openFile, uploadFile, useFileUrl } from '../../components/Attachments';
import { NoProject, ProjectLabel } from './projects';

const MAX_ITEMS = 200;

/** Campos de un elemento nuevo (cada bloque rellena los suyos). */
const itemBase = (project: Project): Omit<NewRow<'project_items'>, 'kind' | 'sort_order'> => ({
  project_id: project.id,
  parent_id: null,
  title: '',
  body: '',
  url: null,
  image_url: null,
  status: 'pendiente',
  file_path: null,
  file_size: null,
  file_type: '',
});

const nextOrder = (items: ProjectItem[]) => items.reduce((m, i) => Math.max(m, i.sort_order + 1), 0);

// ---------------------------------------------------------------- Temario

export function Syllabus({ block }: BlockProps) {
  const { projects, items, dataOf } = useProjectData();
  const { project, chosen } = pickProject(block, projects.rows);
  const [title, setTitle] = useState('');
  if (!project) return <NoProject block={block} kinds={['estudios']} />;
  const own = dataOf(project.id).items;
  const modules = own.filter((i) => i.kind === 'modulo').sort(byOrder);
  const topics = own.filter((i) => i.kind === 'tema');
  const overall = modules.length ? modules.reduce((a, m) => a + moduleRatio(m, own), 0) / modules.length : 0;

  const addModule = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (own.length >= MAX_ITEMS) return toast(`Como mucho ${MAX_ITEMS} elementos por proyecto`, 'error');
    if (await items.add({ ...itemBase(project), kind: 'modulo', title: title.trim().slice(0, 500), sort_order: nextOrder(modules) })) setTitle('');
  };

  return (
    <div className="stack">
      <ProjectLabel project={project} chosen={chosen} />
      {modules.length > 0 && (
        <div className="stack-sm">
          <div className="row between">
            <strong>{Math.round(overall * 100)} % del temario</strong>
            <span className="muted small">
              {topics.filter((t) => t.status === 'hecho').length}/{topics.length} temas
            </span>
          </div>
          <Progress value={overall * 100} tone={overall >= 1 ? 'ok' : undefined} label="Progreso del temario" />
        </div>
      )}
      {modules.length === 0 && <Empty>Añade los módulos o unidades del temario y, dentro de cada uno, sus temas.</Empty>}
      <ul className="syllabus">
        {modules.map((m, i) => (
          <ModuleItem key={m.id} project={project} module={m} index={i} topics={topics.filter((t) => t.parent_id === m.id).sort(byOrder)} full={own.length >= MAX_ITEMS} />
        ))}
      </ul>
      <form className="inline-form" onSubmit={addModule}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nuevo módulo: «Unidad 1 · Redes»" aria-label="Nuevo módulo" maxLength={500} />
        <button className="btn ghost sm" disabled={!title.trim()}>
          Añadir módulo
        </button>
      </form>
    </div>
  );
}

function ModuleItem({ project, module, index, topics, full }: { project: Project; module: ProjectItem; index: number; topics: ProjectItem[]; full: boolean }) {
  const items = useTable('project_items');
  const [topic, setTopic] = useState('');
  const ratio = moduleRatio(module, [module, ...topics]);
  const done = topics.filter((t) => t.status === 'hecho').length;

  const addTopic = async (e: FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;
    if (full) return toast(`Como mucho ${MAX_ITEMS} elementos por proyecto`, 'error');
    if (await items.add({ ...itemBase(project), parent_id: module.id, kind: 'tema', title: topic.trim().slice(0, 500), sort_order: nextOrder(topics) })) setTopic('');
  };

  return (
    <li className="module">
      <details open={ratio < 1}>
        <summary>
          <span className="module-title">
            <span className="muted small">{index + 1}.</span> {module.title}
          </span>
          <span className="module-pct small">{Math.round(ratio * 100)} %</span>
        </summary>
        <Progress value={ratio * 100} tone={ratio >= 1 ? 'ok' : undefined} label={`Progreso de ${module.title}`} />
        {topics.length > 0 ? (
          <ul className="list">
            {topics.map((t) => (
              <li key={t.id}>
                <label className="check">
                  <input type="checkbox" checked={t.status === 'hecho'} onChange={(e) => void items.update(t.id, { status: e.target.checked ? 'hecho' : 'pendiente' })} />
                  <span className={t.status === 'hecho' ? 'done' : ''}>{t.title}</span>
                </label>
                <IconButton label={`Quitar el tema ${t.title}`} onClick={() => void items.remove(t.id)}>
                  ✕
                </IconButton>
              </li>
            ))}
          </ul>
        ) : (
          <label className="check small">
            <input type="checkbox" checked={module.status === 'hecho'} onChange={(e) => void items.update(module.id, { status: e.target.checked ? 'hecho' : 'pendiente' })} />
            <span>Módulo estudiado (o añade sus temas abajo)</span>
          </label>
        )}
        <div className="row between">
          <form className="inline-form grow" onSubmit={addTopic}>
            <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Nuevo tema…" aria-label={`Nuevo tema en ${module.title}`} maxLength={500} />
            <button className="btn ghost sm" disabled={!topic.trim()}>
              Añadir
            </button>
          </form>
          <IconButton
            label={`Eliminar el módulo ${module.title}`}
            onClick={() => {
              if (confirmDelete(`el módulo «${module.title}»${topics.length ? ` y sus ${topics.length} temas` : ''}`)) void items.remove(module.id).then(() => items.reload());
            }}
            danger
          >
            ✕
          </IconButton>
        </div>
        {topics.length > 0 && (
          <span className="muted small">
            {done}/{topics.length} temas
          </span>
        )}
      </details>
    </li>
  );
}

// ---------------------------------------------------------------- Horas

/** Registro de horas dedicadas frente a las estimadas. */
export function HoursLog({ block }: BlockProps) {
  const { projects, logs, dataOf } = useProjectData();
  const { project, chosen } = pickProject(block, projects.rows);
  const day = today();
  const [hours, setHours] = useState('');
  const [date, setDate] = useState(day);
  const [note, setNote] = useState('');
  if (!project) return <NoProject block={block} kinds={['profesional', 'estudios', 'aprendizaje']} />;
  const own = dataOf(project.id).logs.filter((l) => l.kind === 'horas').sort((a, b) => b.date.localeCompare(a.date) || (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  const total = totalHours(own);
  const estimated = fieldNumber(project, 'horas_estimadas') ?? fieldNumber(project, 'horas_objetivo');
  const week = own.filter((l) => l.date >= addDays(day, -6)).reduce((a, l) => a + Number(l.value), 0);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const n = parseNum(hours);
    if (n === null || n <= 0 || n > 24) return toast('Escribe las horas de una sesión: entre 0 y 24 (1,5 = hora y media)', 'error');
    if (await logs.add({ project_id: project.id, kind: 'horas', date: date || day, value: Math.round(n * 100) / 100, note: note.trim().slice(0, 500) })) {
      setHours('');
      setNote('');
      toast(`+${num(n)} h en «${project.name}»`);
    }
  };

  return (
    <div className="stack">
      <ProjectLabel project={project} chosen={chosen} />
      <div className="stats stats-2">
        <div className="stat">
          <span className="stat-label">Total</span>
          <strong className="stat-value">{num(total)} h</strong>
          {estimated ? <span className="stat-hint">de {num(estimated)} h previstas</span> : null}
        </div>
        <div className="stat">
          <span className="stat-label">Últimos 7 días</span>
          <strong className="stat-value">{num(Math.round(week * 100) / 100)} h</strong>
        </div>
      </div>
      {estimated ? (
        <>
          <Progress value={pct(total, estimated)} tone={total > estimated ? 'danger' : undefined} label="Horas reales frente a estimadas" />
          <p className="muted small">
            {total > estimated ? (
              <span className="text-danger">Te has pasado {num(Math.round((total - estimated) * 100) / 100)} h de lo previsto.</span>
            ) : (
              `Quedan ${num(Math.round((estimated - total) * 100) / 100)} h de lo previsto.`
            )}
          </p>
        </>
      ) : (
        <p className="muted small">Pon las horas previstas en ⚙ Proyecto para comparar.</p>
      )}
      <form className="inline-form wrap" onSubmit={add}>
        <input inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="1,5" aria-label="Horas" className="num-input" />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Día" max={day} />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Qué has hecho (opcional)" aria-label="Nota" maxLength={500} />
        <button className="btn primary sm">Apuntar</button>
      </form>
      {own.length > 0 && (
        <ul className="list">
          {own.slice(0, 5).map((l) => (
            <li key={l.id}>
              <span>
                <strong>{num(Number(l.value))} h</strong>
                <span className="muted small"> · {fmtDate(l.date)}</span>
                {l.note && <span className="small"> · {l.note}</span>}
              </span>
              <IconButton label="Borrar este registro" onClick={() => void logs.remove(l.id)}>
                ✕
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Retos

/** Marcar el día, racha actual y mejor racha, y mapa de calor de los últimos 6 meses. */
export function ChallengeStreak({ block }: BlockProps) {
  const { projects, logs, dataOf } = useProjectData();
  const { project, chosen } = pickProject(block, projects.rows);
  const day = today();
  const own = project ? dataOf(project.id).logs.filter((l) => l.kind === 'check') : [];
  const dates = new Set(own.map((l) => l.date));
  if (!project) return <NoProject block={block} kinds={['reto']} />;
  const s = streakStats(project, dates, day);
  const yesterday = addDays(day, -1);
  const end = fieldText(project, 'fin');

  const toggle = async (d: string) => {
    const existing = own.find((l) => l.date === d);
    if (existing) await logs.remove(existing.id);
    else if (await logs.add({ project_id: project.id, kind: 'check', date: d, value: 1, note: '' })) toast(d === day ? '🔥 ¡Hecho hoy!' : `Marcado el ${fmtDate(d)}`);
  };

  const unit = (n: number) => `${s.unit}${n === 1 ? '' : 's'}`;
  return (
    <div className="stack">
      <ProjectLabel project={project} chosen={chosen} />
      <div className="streak-main">
        <button type="button" className={`streak-btn ${s.doneToday ? 'is-done' : ''}`} aria-pressed={s.doneToday} onClick={() => void toggle(day)}>
          {s.doneToday ? '✓ Hecho hoy' : 'Marcar hoy'}
        </button>
        <div className="chain-stats">
          <span>
            <strong>🔥 {s.current}</strong>
            <span className="muted small">{unit(s.current)} de racha</span>
          </span>
          <span>
            <strong>🏆 {s.best}</strong>
            <span className="muted small">mejor racha</span>
          </span>
          <span>
            <strong>{Math.round(s.adherence * 100)} %</strong>
            <span className="muted small">constancia (4 sem.)</span>
          </span>
        </div>
      </div>
      {s.unit === 'semana' && (
        <p className="small">
          Esta semana: <strong>{s.done}</strong> de {s.target} {s.done >= s.target ? '✓' : ''}
        </p>
      )}
      <DayGrid columns={weekColumns(day, 26)} value={(d) => (dates.has(d) ? 1 : 0)} label={(d) => `${fmtDate(d)}: ${dates.has(d) ? 'hecho' : 'no'}`} />
      <div className="row between wrap">
        {!dates.has(yesterday) && (dayOf(project.created_at) ?? day) <= yesterday ? (
          <button type="button" className="link-btn small" onClick={() => void toggle(yesterday)}>
            ¿Se te olvidó ayer? Marcar ayer
          </button>
        ) : (
          <span />
        )}
        {end && <span className="muted small">{end >= day ? `Termina el ${fmtDate(end)}` : `Terminó el ${fmtDate(end)}`}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Valores medidos

/** Registro de un valor (kg, km, min…) y lo que falta para el objetivo. */
export function ValueLog({ block }: BlockProps) {
  const { projects, logs, dataOf } = useProjectData();
  const { project, chosen } = pickProject(block, projects.rows);
  const day = today();
  const [value, setValue] = useState('');
  const [date, setDate] = useState(day);
  if (!project) return <NoProject block={block} kinds={['salud']} />;
  const own = valueLogs(dataOf(project.id).logs);
  const v = valueProgress(project, own);
  const unit = fieldText(project, 'unidad');

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const n = parseNum(value);
    if (n === null) return toast(`Escribe un número${unit ? ` (en ${unit})` : ''}`, 'error');
    if (await logs.add({ project_id: project.id, kind: 'valor', date: date || day, value: Math.round(n * 100) / 100, note: '' })) setValue('');
  };

  const recent = [...own].reverse().slice(0, 6);
  return (
    <div className="stack">
      <ProjectLabel project={project} chosen={chosen} />
      <div className="value-main">
        <strong className="score-value">{v.current === null ? '—' : num(v.current)}</strong>
        <span className="muted">{unit}</span>
      </div>
      {v.target !== null ? (
        <>
          <Progress value={v.ratio * 100} tone={v.left === 0 ? 'ok' : undefined} label="Avance hacia el objetivo" />
          <p className="small">
            Objetivo: <strong>{num(v.target)} {unit}</strong>
            {v.left !== null && (v.left === 0 ? <span className="text-ok"> · ¡conseguido! 🎉</span> : <span className="muted"> · faltan {num(Math.round(v.left * 100) / 100)} {unit}</span>)}
          </p>
        </>
      ) : (
        <p className="muted small">Pon el objetivo en ⚙ Proyecto para ver cuánto te falta.</p>
      )}
      <form className="inline-form wrap" onSubmit={add}>
        <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={v.current === null ? '80' : num(v.current)} aria-label={`Nuevo valor${unit ? ` (${unit})` : ''}`} className="num-input" />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Día" max={day} />
        <button className="btn primary sm">Apuntar</button>
      </form>
      {recent.length > 0 && (
        <ul className="list">
          {recent.map((l, i) => {
            const prev = recent[i + 1];
            const diff = prev ? Math.round((Number(l.value) - Number(prev.value)) * 100) / 100 : null;
            return (
              <li key={l.id}>
                <span>
                  <strong>
                    {num(Number(l.value))} {unit}
                  </strong>
                  <span className="muted small"> · {fmtDate(l.date)}</span>
                  {diff !== null && diff !== 0 && (
                    <span className="small muted">
                      {' '}
                      {diff > 0 ? '▲' : '▼'} {num(Math.abs(diff))}
                    </span>
                  )}
                </span>
                <IconButton label="Borrar este registro" onClick={() => void logs.remove(l.id)}>
                  ✕
                </IconButton>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Ideas

/** Lluvia de ideas: apuntar al vuelo y pasar las buenas a tareas. */
export function Ideas({ block }: BlockProps) {
  const { projects, items, tasks, dataOf } = useProjectData();
  const { project, chosen } = pickProject(block, projects.rows);
  const [text, setText] = useState('');
  if (!project) return <NoProject block={block} kinds={['creativo']} />;
  const own = dataOf(project.id).items;
  const ideas = own.filter((i) => i.kind === 'idea').sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    if (own.length >= MAX_ITEMS) return toast(`Como mucho ${MAX_ITEMS} elementos por proyecto`, 'error');
    if (await items.add({ ...itemBase(project), kind: 'idea', title: text.trim().slice(0, 500), sort_order: nextOrder(ideas) })) setText('');
  };

  const toTask = async (idea: ProjectItem) => {
    if (await tasks.add({ title: idea.title, project_id: project.id, priority: 'media', status: 'pendiente', due_date: null })) {
      await items.remove(idea.id);
      toast(`«${idea.title}» ahora es una tarea`);
    }
  };

  return (
    <div className="stack">
      <ProjectLabel project={project} chosen={chosen} />
      <form className="inline-form" onSubmit={add}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Una idea, sin filtro…" aria-label="Nueva idea" maxLength={500} />
        <button className="btn ghost sm" disabled={!text.trim()}>
          Apuntar
        </button>
      </form>
      {ideas.length === 0 ? (
        <Empty>Aún no hay ideas. Apunta todo lo que se te ocurra: luego eliges.</Empty>
      ) : (
        <ul className="idea-list">
          {ideas.map((i) => (
            <li key={i.id} className="idea">
              <span className="idea-text">💡 {i.title}</span>
              <span className="row">
                <button type="button" className="btn ghost sm" onClick={() => void toTask(i)} title="Convertir en tarea del proyecto">
                  → Tarea
                </button>
                <IconButton label={`Borrar la idea ${i.title}`} onClick={() => void items.remove(i.id)}>
                  ✕
                </IconButton>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Referencias

const looksLikeImage = (url: string) => /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i.test(url);

/** Galería de referencias: imágenes subidas o pegadas y enlaces de inspiración. */
export function References({ block }: BlockProps) {
  const user = useUser();
  const { projects, items, dataOf } = useProjectData();
  const { project, chosen } = pickProject(block, projects.rows);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  if (!project) return <NoProject block={block} kinds={['creativo']} />;
  const own = dataOf(project.id).items;
  const refs = own.filter((i) => i.kind === 'referencia').sort(byOrder);
  const full = own.length >= MAX_ITEMS;

  const addUrl = async (e: FormEvent) => {
    e.preventDefault();
    const href = normalizeUrl(url);
    if (!href) return toast('Pega la dirección de una imagen o de una web', 'error');
    if (full) return toast(`Como mucho ${MAX_ITEMS} elementos por proyecto`, 'error');
    const image = looksLikeImage(href);
    if (await items.add({ ...itemBase(project), kind: 'referencia', title: title.trim().slice(0, 500), url: image ? null : href, image_url: image ? href : null, sort_order: nextOrder(refs) })) {
      setUrl('');
      setTitle('');
    }
  };

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true);
    let order = nextOrder(refs);
    for (const file of [...list]) {
      if (!file.type.startsWith('image/')) {
        toast(`«${file.name}» no es una imagen`, 'error');
        continue;
      }
      const stored = await uploadFile(user.id, project.id, file);
      if (!stored) continue;
      const created = await items.add({ ...itemBase(project), kind: 'referencia', title: file.name.replace(/\.[^.]+$/, '').slice(0, 500), sort_order: order++, ...stored });
      if (!created) void backend.removeFiles([stored.file_path]).catch(() => {});
    }
    setUploading(false);
    if (input.current) input.current.value = '';
  };

  const remove = async (r: ProjectItem) => {
    if (!confirmDelete(`la referencia «${r.title || 'sin título'}»`)) return;
    if ((await items.remove(r.id)) && r.file_path) void backend.removeFiles([r.file_path]).catch(() => {});
  };

  return (
    <div className="stack">
      <ProjectLabel project={project} chosen={chosen} />
      {refs.length === 0 ? (
        <Empty>Sube imágenes o pega enlaces que te inspiren.</Empty>
      ) : (
        <ul className="gallery">
          {refs.map((r) => (
            <ReferenceCard key={r.id} item={r} onRemove={() => void remove(r)} />
          ))}
        </ul>
      )}
      <form className="link-form" onSubmit={addUrl}>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Dirección de una imagen o web" aria-label="Dirección de la referencia" inputMode="url" maxLength={2000} />
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título (opcional)" aria-label="Título de la referencia" maxLength={200} />
        <button className="btn ghost sm" disabled={!url.trim()}>
          Añadir
        </button>
      </form>
      <label className={`btn ghost file-drop ${uploading ? 'is-busy' : ''}`}>
        {uploading ? 'Subiendo…' : `🖼️ Subir imágenes (hasta ${Math.round(maxFileBytes() / 1024 / 1024)} MB)`}
        <input ref={input} type="file" accept="image/*" multiple className="sr-only" disabled={uploading || full} onChange={(e) => void upload(e.target.files)} />
      </label>
    </div>
  );
}

function ReferenceCard({ item, onRemove }: { item: ProjectItem; onRemove: () => void }) {
  const stored = useFileUrl(item.file_path);
  const image = item.file_path ? stored : item.image_url && normalizeUrl(item.image_url);
  const link = item.url ? normalizeUrl(item.url) : null;
  const open = () => {
    if (item.file_path) void openFile(item.file_path);
    else if (link || image) window.open((link || image)!, '_blank', 'noopener,noreferrer');
  };
  const label = item.title || (link ? linkHost(link) : 'Referencia');
  return (
    <li className="ref-card">
      <button type="button" className="ref-open" onClick={open} aria-label={`Abrir ${label}`}>
        {image ? <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="ref-placeholder">{link ? '🔗' : '🖼️'}</span>}
      </button>
      <span className="ref-caption">
        <span className="small">{label}</span>
        <IconButton label={`Quitar ${label}`} onClick={onRemove}>
          ✕
        </IconButton>
      </span>
    </li>
  );
}

// ---------------------------------------------------------------- Recursos

const RESOURCE_STATUS: { value: ItemStatus; label: string }[] = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'en_curso', label: 'En curso' },
  { value: 'hecho', label: 'Terminado' },
];
const STATUS_ORDER: Record<ItemStatus, number> = { en_curso: 0, pendiente: 1, hecho: 2 };

/** Libros, cursos, vídeos… con su estado y tus notas. */
export function Resources({ block }: BlockProps) {
  const { projects, items, dataOf } = useProjectData();
  const { project, chosen } = pickProject(block, projects.rows);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  if (!project) return <NoProject block={block} kinds={['aprendizaje']} />;
  const own = dataOf(project.id).items;
  const res = own.filter((i) => i.kind === 'recurso').sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || byOrder(a, b));
  const done = res.filter((r) => r.status === 'hecho').length;

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const href = url.trim() ? normalizeUrl(url) : null;
    if (url.trim() && !href) return toast('La dirección no es válida (o déjala vacía)', 'error');
    if (own.length >= MAX_ITEMS) return toast(`Como mucho ${MAX_ITEMS} elementos por proyecto`, 'error');
    if (await items.add({ ...itemBase(project), kind: 'recurso', title: title.trim().slice(0, 500), url: href, sort_order: nextOrder(res) })) {
      setTitle('');
      setUrl('');
    }
  };

  return (
    <div className="stack">
      <ProjectLabel project={project} chosen={chosen} />
      {res.length > 0 && (
        <>
          <div className="row between">
            <span className="small">
              <strong>{done}</strong> de {res.length} terminados
            </span>
            <span className="muted small">{res.filter((r) => r.status === 'en_curso').length} en curso</span>
          </div>
          <Progress value={pct(done, res.length)} tone={done === res.length ? 'ok' : undefined} label="Recursos terminados" />
        </>
      )}
      {res.length === 0 && <Empty>Añade libros, cursos, vídeos o apps con los que vas a aprender.</Empty>}
      <ul className="resource-list">
        {res.map((r) => (
          <ResourceItem key={r.id} item={r} />
        ))}
      </ul>
      <form className="link-form" onSubmit={add}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Recurso: «Genki I», «Curso de Python»…" aria-label="Nuevo recurso" maxLength={500} />
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Dirección (opcional)" aria-label="Dirección del recurso" inputMode="url" maxLength={2000} />
        <button className="btn ghost sm" disabled={!title.trim()}>
          Añadir
        </button>
      </form>
    </div>
  );
}

function ResourceItem({ item }: { item: ProjectItem }) {
  const items = useTable('project_items');
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(item.body);
  const href = item.url ? normalizeUrl(item.url) : null;

  return (
    <li className={`resource status-${item.status}`}>
      <div className="resource-head">
        <span className="resource-title">
          {href ? (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {item.title}
            </a>
          ) : (
            item.title
          )}
        </span>
        <select className="sm" value={item.status} onChange={(e) => void items.update(item.id, { status: e.target.value as ItemStatus })} aria-label={`Estado de ${item.title}`}>
          {RESOURCE_STATUS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div className="row between">
        <button type="button" className="link-btn small" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Ocultar notas' : item.body ? `📝 Notas (${item.body.length > 40 ? `${item.body.slice(0, 40)}…` : item.body})` : '＋ Notas'}
        </button>
        <IconButton
          label={`Eliminar ${item.title}`}
          onClick={() => {
            if (confirmDelete(`el recurso «${item.title}»`)) void items.remove(item.id);
          }}
          danger
        >
          ✕
        </IconButton>
      </div>
      {open && (
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== item.body && void items.update(item.id, { body: notes.slice(0, 20000) })}
          rows={3}
          maxLength={20000}
          placeholder="Lo que has aprendido, citas, capítulos pendientes… (se guarda al salir)"
          aria-label={`Notas de ${item.title}`}
          autoFocus
        />
      )}
    </li>
  );
}

// ---------------------------------------------------------------- Presupuesto

/** Presupuesto del proyecto frente a sus gastos (movimientos de Finanzas vinculados a él). */
export function ProjectBudget({ block }: BlockProps) {
  const projects = useTable('projects');
  const transactions = useTable('transactions');
  const categories = useTable('finance_categories');
  const { project, chosen } = pickProject(block, projects.rows);
  const day = today();
  const options = categoryOptions(categories.rows.filter((c) => !c.archived), 'gasto');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState(day);
  const byId = useMemo(() => new Map(categories.rows.map((c) => [c.id, c])), [categories.rows]);
  if (!project) return <NoProject block={block} kinds={['viaje']} />;
  const b = budgetOf(project, transactions.rows);
  // Por defecto, la categoría del último gasto del proyecto (o la primera).
  const lastCategory = [...b.own].sort((x, y) => (y.created_at ?? '').localeCompare(x.created_at ?? ''))[0]?.category_id;
  const selected = options.some((o) => o.id === category) ? category : (options.find((o) => o.id === lastCategory) ?? options[0])?.id ?? '';
  const perCategory = [...b.own.reduce((m, t) => m.set(t.category_id, (m.get(t.category_id) ?? 0) + Number(t.amount)), new Map<string, number>())].sort((x, y) => y[1] - x[1]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const n = parseNum(amount);
    if (n === null || n <= 0) return toast('El importe tiene que ser mayor que 0', 'error');
    if (!selected) return toast('Crea antes una categoría de gastos en Finanzas', 'error');
    if (await transactions.add({ type: 'gasto', amount: Math.round(n * 100) / 100, category_id: selected, note: note.trim() || project.name, date: date || day, project_id: project.id })) {
      setAmount('');
      setNote('');
      toast(`Gasto de ${eur(n)} apuntado en Finanzas y en «${project.name}»`);
    }
  };

  return (
    <div className="stack">
      <ProjectLabel project={project} chosen={chosen} />
      <div className="stats stats-2">
        <div className="stat">
          <span className="stat-label">Gastado</span>
          <strong className="stat-value">{eur(b.spent)}</strong>
          {b.budget !== null && <span className="stat-hint">de {eur(b.budget)}</span>}
        </div>
        <div className="stat">
          <span className="stat-label">{b.left !== null && b.left < 0 ? 'Te has pasado' : 'Queda'}</span>
          <strong className={`stat-value ${b.left !== null && b.left < 0 ? 'text-danger' : ''}`}>{b.left === null ? '—' : eur(Math.abs(b.left))}</strong>
        </div>
      </div>
      {b.budget !== null ? (
        <Progress value={pct(b.spent, b.budget)} tone={b.spent > b.budget ? 'danger' : undefined} label="Gastado frente al presupuesto" />
      ) : (
        <p className="muted small">Pon el presupuesto en ⚙ Proyecto para ver cuánto te queda.</p>
      )}
      {perCategory.length > 1 && (
        <ul className="list small">
          {perCategory.map(([id, total]) => (
            <li key={id}>
              <span>{categoryPath(byId, id)}</span>
              <span>{eur(total)}</span>
            </li>
          ))}
        </ul>
      )}
      <form className="inline-form wrap" onSubmit={add}>
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="120" aria-label="Importe (€)" className="num-input" />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Concepto: vuelos, hotel…" aria-label="Concepto" maxLength={200} />
        <select value={selected} onChange={(e) => setCategory(e.target.value)} aria-label="Categoría">
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Fecha" />
        <button className="btn primary sm">Apuntar gasto</button>
      </form>
      <p className="muted small">Los gastos se guardan también en Finanzas (cuentan en tu presupuesto mensual).</p>
      {b.own.length > 0 && (
        <ul className="list">
          {[...b.own]
            .sort((x, y) => y.date.localeCompare(x.date))
            .slice(0, 8)
            .map((t) => (
              <li key={t.id}>
                <span>
                  {t.note || categoryPath(byId, t.category_id)}
                  <span className="muted small"> · {fmtDate(t.date)}</span>
                </span>
                <span className="row">
                  <span className="tx-amount gasto">−{eur(Number(t.amount))}</span>
                  <IconButton
                    label="Quitar este gasto del proyecto"
                    onClick={() => void transactions.update(t.id, { project_id: null }).then((ok) => ok && toast('El gasto sigue en Finanzas, ya sin proyecto'))}
                  >
                    ✕
                  </IconButton>
                </span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
