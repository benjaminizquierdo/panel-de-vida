import Attachments from '../../components/Attachments';
import { pickProject } from '../../lib/useProjects';
import { useTable } from '../../lib/useTable';
import { NoProject, ProjectLabel } from './projects';
import type { BlockProps } from '..';

/** Notas, enlaces y documentos de un proyecto (pestaña «Notas y adjuntos» y bloque). */
export default function ProjectNotes({ projectId }: { projectId: string }) {
  const items = useTable('project_items');
  return (
    <Attachments
      folder={projectId}
      notePlaceholder="Escribe una nota: una idea, un acuerdo con el cliente, un resumen…"
      store={{
        items: items.rows.filter((i) => i.project_id === projectId),
        add: (item) => items.add({ ...item, project_id: projectId, parent_id: null, image_url: null, status: 'pendiente' }),
        update: items.update,
        remove: items.remove,
      }}
    />
  );
}

/** Bloque «Notas y adjuntos» de un proyecto. */
export function ProjectNotesBlock({ block }: BlockProps) {
  const projects = useTable('projects');
  const { project, chosen } = pickProject(block, projects.rows);
  if (!project) return <NoProject block={block} />;
  return (
    <div className="stack">
      <ProjectLabel project={project} chosen={chosen} />
      <ProjectNotes projectId={project.id} />
    </div>
  );
}
