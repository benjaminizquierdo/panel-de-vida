import { useState, type CSSProperties, type FormEvent } from 'react';
import { backend } from '../backend';
import { PROJECT_COLORS } from '../lib/defaults';
import { useNav } from '../lib/pageContext';
import { cleanFields, PHASE_FIELD, PROJECT_KINDS, projectKind, projectPageSeed, visibleFields, type ProjectField, type ProjectKind } from '../lib/projectKinds';
import { toast } from '../lib/toast';
import type { Project, ProjectStatus } from '../lib/types';
import { useTable } from '../lib/useTable';
import Sheet from './Sheet';

export const STATUS_LABEL: Record<ProjectStatus, string> = { activo: 'Activo', pausado: 'Pausado', completado: 'Terminado' };

/**
 * Crear un proyecto (primero se elige el tipo y luego se rellenan sus campos) o editar uno:
 * nombre, campos, fase, estado, tipo, restablecer su vista y eliminarlo.
 */
export default function ProjectSheet({ project, onClose }: { project?: Project; onClose: () => void }) {
  const nav = useNav();
  const projects = useTable('projects');
  const tabs = useTable('tabs');
  const blocks = useTable('blocks');
  const tasks = useTable('tasks');
  const items = useTable('project_items');
  const taskItems = useTable('task_items');
  const logs = useTable('project_logs');
  const transactions = useTable('transactions');

  const [kindId, setKindId] = useState<string | null>(project ? projectKind(project.kind).id : null);
  const kind = kindId ? projectKind(kindId) : null;
  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [color, setColor] = useState(project?.color ?? '');
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? 'activo');
  const [values, setValues] = useState<Record<string, unknown>>(() => ({ ...(project?.fields ?? {}) }));
  const [busy, setBusy] = useState(false);

  const page = project ? tabs.rows.find((t) => t.project_id === project.id) : undefined;

  /** Cambia los bloques de la página del proyecto por la plantilla de su tipo. */
  const resetView = async (p: Project) => {
    if (!page) return;
    for (const b of blocks.rows.filter((b) => b.tab_id === page.id)) await blocks.remove(b.id);
    for (const [i, b] of projectPageSeed(p).blocks.entries()) await blocks.add({ tab_id: page.id, sort_order: i, ...b });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!kind) return;
    if (!name.trim()) return toast('Ponle un nombre al proyecto', 'error');
    setBusy(true);
    const row = {
      name: name.trim().slice(0, 200),
      description: description.trim(),
      color: color || kind.color,
      kind: kind.id,
      fields: cleanFields(kind, values),
    };
    if (!project) {
      const created = await projects.add({ ...row, status: 'activo' });
      setBusy(false);
      if (!created) return;
      toast(`Proyecto «${created.name}» creado`);
      onClose();
      nav.openProject(created);
      return;
    }
    const changedKind = projectKind(project.kind).id !== kind.id;
    const saved = await projects.update(project.id, { ...row, status });
    if (saved && changedKind && page && window.confirm(`¿Cambiar también la vista del proyecto por la de «${kind.name}»? Se quitan sus bloques actuales y se ponen los de ese tipo. Tus tareas, notas y registros no se borran.`)) {
      await resetView({ ...project, ...row });
    }
    setBusy(false);
    if (saved) onClose();
  };

  const remove = async () => {
    if (!project) return;
    if (!window.confirm(`¿Eliminar el proyecto «${project.name}» con sus tareas, notas, archivos, registros y su página? No se puede deshacer. Sus gastos se quedan en Finanzas, sin proyecto.`)) return;
    setBusy(true);
    const ownTasks = new Set(tasks.rows.filter((t) => t.project_id === project.id).map((t) => t.id));
    const files = [
      ...items.rows.filter((i) => i.project_id === project.id && i.file_path).map((i) => i.file_path!),
      ...taskItems.rows.filter((i) => ownTasks.has(i.task_id) && i.file_path).map((i) => i.file_path!),
    ];
    try {
      await backend.removeFiles(files);
    } catch {
      // Si los archivos no se pueden borrar ahora, el proyecto se borra igualmente.
    }
    const back = nav.returnTo;
    const ok = await projects.remove(project.id);
    setBusy(false);
    if (!ok) return;
    await Promise.all([tasks.reload(), items.reload(), taskItems.reload(), logs.reload(), tabs.reload(), blocks.reload(), transactions.reload()]);
    toast(`Proyecto «${project.name}» eliminado`);
    onClose();
    if (back && nav.current?.project_id === project.id) nav.go(back.id);
  };

  if (!kind) {
    return (
      <Sheet title="Nuevo proyecto · ¿de qué tipo?" onClose={onClose}>
        <ul className="kind-grid">
          {PROJECT_KINDS.map((k) => (
            <li key={k.id}>
              <button
                type="button"
                className="kind-choice"
                style={{ '--kind': k.color } as CSSProperties}
                onClick={() => {
                  setKindId(k.id);
                  setColor(k.color);
                }}
              >
                <span className="kind-icon" aria-hidden>
                  {k.icon}
                </span>
                <span className="kind-text">
                  <strong>{k.name}</strong>
                  <span className="muted small">{k.description}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    );
  }

  const fields = visibleFields(kind, values);
  return (
    <Sheet
      title={project ? `Ajustes de «${project.name}»` : `Nuevo proyecto · ${kind.icon} ${kind.name}`}
      onClose={onClose}
      footer={
        <>
          {project ? (
            <button type="button" className="btn ghost sm danger-text" onClick={() => void remove()} disabled={busy}>
              Eliminar
            </button>
          ) : (
            <button type="button" className="btn ghost sm" onClick={() => setKindId(null)}>
              ← Cambiar tipo
            </button>
          )}
          <button className="btn primary" form="project-form" disabled={busy}>
            {project ? 'Guardar' : 'Crear proyecto'}
          </button>
        </>
      }
    >
      <form id="project-form" className="stack" onSubmit={submit}>
        <label className="field">
          <span>Nombre</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder={PLACEHOLDER[kind.id] ?? 'Nombre del proyecto'} required />
        </label>
        <label className="field">
          <span>Descripción (opcional)</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} placeholder="Para qué es, qué quieres conseguir…" />
        </label>
        {fields.map((f) => (
          <FieldInput key={f.key} field={f} value={values[f.key]} onChange={(v) => setValues((prev) => ({ ...prev, [f.key]: v }))} />
        ))}
        {kind.phases && (
          <label className="field">
            <span>Fase</span>
            <select value={String(values[PHASE_FIELD] ?? kind.phases[0].value)} onChange={(e) => setValues((prev) => ({ ...prev, [PHASE_FIELD]: e.target.value }))}>
              {kind.phases.map((ph) => (
                <option key={ph.value} value={ph.value}>
                  {ph.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="field">
          <span>Color</span>
          <div className="swatches" role="radiogroup" aria-label="Color">
            {[...new Set([kind.color, ...PROJECT_COLORS])].map((c) => (
              <button key={c} type="button" role="radio" aria-checked={(color || kind.color) === c} aria-label={`Color ${c}`} className="swatch" style={{ background: c }} onClick={() => setColor(c)} />
            ))}
          </div>
        </div>
        {project && (
          <>
            <div className="field">
              <span>Estado</span>
              <div className="segmented" role="group" aria-label="Estado">
                {(Object.keys(STATUS_LABEL) as ProjectStatus[]).map((s) => (
                  <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}>
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>
            <label className="field">
              <span>Tipo</span>
              <select value={kind.id} onChange={(e) => setKindId(e.target.value)}>
                {PROJECT_KINDS.map((k: ProjectKind) => (
                  <option key={k.id} value={k.id}>
                    {k.icon} {k.name}
                  </option>
                ))}
              </select>
              <span className="muted small">Al cambiar de tipo, los datos que ya tienes se conservan.</span>
            </label>
          </>
        )}
      </form>
      {project && page && (
        <div className="stack subpanel">
          <button
            type="button"
            className="btn ghost"
            disabled={busy}
            onClick={async () => {
              if (!window.confirm(`¿Restablecer la vista de «${project.name}» con la plantilla de «${projectKind(project.kind).name}»? Se quitan sus bloques actuales. Tus datos no se borran.`)) return;
              setBusy(true);
              await resetView(project);
              setBusy(false);
              toast('Vista restablecida');
              onClose();
            }}
          >
            ↺ Restablecer la vista de su tipo
          </button>
        </div>
      )}
    </Sheet>
  );
}

const PLACEHOLDER: Record<string, string> = {
  profesional: 'Web de Acme',
  estudios: 'Certificación AWS',
  reto: 'Correr 3 veces por semana',
  creativo: 'Cortometraje',
  salud: 'Bajar a 78 kg',
  hogar: 'Mudanza',
  aprendizaje: 'Aprender japonés',
  viaje: 'Japón 2027',
};

/** Un campo propio del tipo de proyecto. */
function FieldInput({ field, value, onChange }: { field: ProjectField; value: unknown; onChange: (v: string) => void }) {
  const v = value === undefined || value === null ? '' : String(value);
  const listId = field.suggestions ? `sug-${field.key}` : undefined;
  return (
    <label className="field">
      <span>
        {field.label}
        {field.unit && <span className="muted"> ({field.unit})</span>}
      </span>
      {field.type === 'select' ? (
        <select value={v || field.choices?.[0]?.value} onChange={(e) => onChange(e.target.value)}>
          {field.choices?.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      ) : field.type === 'date' ? (
        <input type="date" value={v} onChange={(e) => onChange(e.target.value)} />
      ) : field.type === 'number' ? (
        <input inputMode="decimal" value={v} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} className="num-input" min={field.min} max={field.max} />
      ) : (
        <>
          <input value={v} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} maxLength={200} list={listId} />
          {field.suggestions && (
            <datalist id={listId}>
              {field.suggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          )}
        </>
      )}
    </label>
  );
}
