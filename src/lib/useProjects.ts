import { useMemo } from 'react';
import { blockKind, filterValue } from './blockKinds';
import { EMPTY_DATA, dataByProject } from './projects';
import type { Block, Project } from './types';
import { useTable } from './useTable';

/** Proyectos con sus tareas, elementos y registros, agrupados por proyecto. */
export function useProjectData() {
  const projects = useTable('projects');
  const tasks = useTable('tasks');
  const items = useTable('project_items');
  const logs = useTable('project_logs');
  const byProject = useMemo(() => dataByProject(tasks.rows, items.rows, logs.rows), [tasks.rows, items.rows, logs.rows]);
  return {
    projects,
    tasks,
    items,
    logs,
    dataOf: (id: string) => byProject.get(id) ?? EMPTY_DATA,
    loading: projects.loading,
  };
}

/**
 * Proyecto que muestra un bloque: el elegido en sus ajustes o, si no hay ninguno elegido (o se
 * ha borrado), el primero activo de los tipos para los que está pensado el bloque.
 */
export function pickProject(block: Block, projects: Project[]): { project: Project | undefined; chosen: boolean } {
  const id = filterValue(block.content, 'project');
  const chosen = projects.find((p) => p.id === id);
  if (chosen) return { project: chosen, chosen: true };
  const kinds = blockKind(block.type)?.filters?.find((f) => f.source === 'project')?.projectKinds ?? [];
  const active = projects.filter((p) => p.status === 'activo');
  const project = kinds.length ? active.find((p) => kinds.includes(p.kind)) : active[0];
  return { project, chosen: false };
}
