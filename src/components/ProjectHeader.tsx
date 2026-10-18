import type { CSSProperties, ReactNode } from 'react';
import { useNav } from '../lib/pageContext';
import { kindOf } from '../lib/projectKinds';
import { healthOf, progressOf } from '../lib/projects';
import type { Project, ProjectStatus } from '../lib/types';
import { useProjectData } from '../lib/useProjects';
import { today } from '../lib/utils';
import { STATUS_LABEL } from './ProjectSheet';
import { HealthLight } from './projectUi';
import { Progress } from './ui';

export type ProjectTab = 'vista' | 'notas';

/** Cabecera de la página de un proyecto: volver, tipo, estado, semáforo, progreso y pestañas. */
export default function ProjectHeader({ project, tab, onTab, actions, onSettings }: {
  project: Project;
  tab: ProjectTab;
  onTab: (tab: ProjectTab) => void;
  /** Botones de personalizar (solo en la pestaña de la vista). */
  actions: ReactNode;
  onSettings: () => void;
}) {
  const nav = useNav();
  const { projects, dataOf } = useProjectData();
  const kind = kindOf(project);
  const day = today();
  const data = dataOf(project.id);
  const health = healthOf(project, data, day);
  const progress = progressOf(project, data, day);

  return (
    <>
      {nav.returnTo && (
        <nav className="breadcrumbs" aria-label="Estás en">
          <button type="button" className="link-btn" onClick={() => nav.go(nav.returnTo!.id)}>
            ← {nav.returnTo.icon} {nav.returnTo.name}
          </button>
        </nav>
      )}
      <div className="row between wrap">
        <h1 className="project-title">
          <span className="project-icon" style={{ '--kind': project.color || kind.color } as CSSProperties} aria-hidden>
            {kind.icon}
          </span>
          <span>{project.name}</span>
        </h1>
        <div className="row page-actions">
          <button type="button" className="btn ghost sm" onClick={onSettings}>
            ⚙ Proyecto
          </button>
          {tab === 'vista' && actions}
        </div>
      </div>
      <div className="project-meta">
        <span className="badge kind-badge" style={{ '--kind': kind.color } as CSSProperties}>
          {kind.icon} {kind.name}
        </span>
        <select
          className="sm"
          value={project.status}
          onChange={(e) => void projects.update(project.id, { status: e.target.value as ProjectStatus })}
          aria-label={`Estado de ${project.name}`}
        >
          {(Object.keys(STATUS_LABEL) as ProjectStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <HealthLight health={health} showReason />
        <span className="project-meta-progress">
          <Progress value={progress.value} label={`Progreso de ${project.name}`} />
          <span className="muted small">
            {progress.value} %{progress.label && ` · ${progress.label}`}
          </span>
        </span>
      </div>
      {project.description && <p className="muted">{project.description}</p>}
      <nav className="subpages project-tabs" role="tablist" aria-label={`Secciones de ${project.name}`}>
        <button type="button" role="tab" className="subtab" aria-selected={tab === 'vista'} onClick={() => onTab('vista')}>
          {kind.icon} Vista
        </button>
        <button type="button" role="tab" className="subtab" aria-selected={tab === 'notas'} onClick={() => onTab('notas')}>
          📎 Notas y adjuntos
        </button>
      </nav>
    </>
  );
}
