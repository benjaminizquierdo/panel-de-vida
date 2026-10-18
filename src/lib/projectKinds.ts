// Tipos de proyecto. Cada tipo es solo configuración: sus campos (los dibuja un formulario
// genérico), sus fases, cómo se mide su progreso y su semáforo, su fecha clave y la plantilla de
// bloques de su página. Añadir un tipo = añadir una entrada a PROJECT_KINDS (no hace falta
// migración: la base de datos solo exige que el id tenga forma de identificador).
// Sin React, para poder probarlo (tests/projects.test.ts).

import { b, layout, type BlockSeed, type PageSeed } from './pageTemplates';
import type { Project, ProjectFieldValue } from './types';

export type FieldType = 'text' | 'date' | 'number' | 'select';

export interface ProjectField {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  /** Unidad que se muestra junto al número: 'h', '€'… */
  unit?: string;
  /** Opciones de los 'select' (la primera es la de por defecto). */
  choices?: { value: string; label: string }[];
  /** Solo se pide si otro campo tiene ese valor (p. ej. «veces por semana» si la frecuencia es semanal). */
  showIf?: { key: string; value: string };
  /** Sugerencias al escribir un 'text'. */
  suggestions?: string[];
  min?: number;
  max?: number;
}

/**
 * Cómo se calcula el progreso: por tareas hechas, temas del temario, recursos terminados, fase
 * alcanzada, avance hacia un valor objetivo o constancia de un reto (ver lib/projects.ts).
 */
export type ProgressRule = 'tasks' | 'modules' | 'resources' | 'phases' | 'value' | 'streak';

export interface ProjectKind {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  fields: ProjectField[];
  /** Fases por las que pasa (se guardan en `fields.fase`). */
  phases?: { value: string; label: string }[];
  progress: ProgressRule;
  /**
   * true: el proyecto se lleva con tareas. Su semáforo se pone amarillo si no tiene ninguna
   * pendiente; en los demás tipos solo cuenta la actividad.
   */
  usesTasks: boolean;
  /** Campo de fecha que alimenta la cuenta atrás: entrega, examen, salida… */
  keyDate?: { field: string; label: string };
  /** Bloques de la página del proyecto la primera vez que se abre. */
  blocks: BlockSeed[];
}

export const PHASE_FIELD = 'fase';

export const PROJECT_KINDS: ProjectKind[] = [
  {
    id: 'profesional',
    name: 'Profesional',
    icon: '💼',
    color: '#2563eb',
    description: 'Un trabajo para un cliente: entrega, horas estimadas frente a reales y kanban.',
    fields: [
      { key: 'cliente', label: 'Cliente', type: 'text', placeholder: 'Acme S.L.' },
      { key: 'entrega', label: 'Fecha de entrega', type: 'date' },
      { key: 'horas_estimadas', label: 'Horas estimadas', type: 'number', unit: 'h', min: 0, max: 100000 },
    ],
    phases: [
      { value: 'propuesta', label: 'Propuesta' },
      { value: 'en_curso', label: 'En curso' },
      { value: 'en_revision', label: 'En revisión' },
      { value: 'entregado', label: 'Entregado' },
    ],
    progress: 'tasks',
    usesTasks: true,
    keyDate: { field: 'entrega', label: 'Entrega' },
    blocks: layout([
      b('proyecto_resumen', 0, 0, 12),
      b('proyecto_fases', 0, 1, 12),
      b('tablero', 0, 2, 8),
      b('proyecto_horas', 8, 2, 4),
      b('proyecto_cuenta_atras', 8, 3, 4),
      b('grafico_avance', 0, 4, 6),
      b('grafico_horas', 6, 4, 6),
    ]),
  },
  {
    id: 'estudios',
    name: 'Estudios',
    icon: '🎓',
    color: '#7c3aed',
    description: 'Un curso o certificación: temario por módulos, cuenta atrás al examen y horas de estudio.',
    fields: [
      { key: 'curso', label: 'Curso o certificación', type: 'text', placeholder: 'AWS Solutions Architect' },
      { key: 'examen', label: 'Fecha de examen', type: 'date' },
      { key: 'horas_objetivo', label: 'Horas de estudio previstas', type: 'number', unit: 'h', min: 0, max: 100000 },
    ],
    progress: 'modules',
    usesTasks: false,
    keyDate: { field: 'examen', label: 'Examen' },
    blocks: layout([
      b('proyecto_resumen', 0, 0, 12),
      b('proyecto_temario', 0, 1, 8),
      b('proyecto_cuenta_atras', 8, 1, 4),
      b('proyecto_horas', 8, 2, 4),
      b('grafico_horas', 0, 3, 12),
    ]),
  },
  {
    id: 'reto',
    name: 'Hábito / reto',
    icon: '🔥',
    color: '#ea580c',
    description: 'Algo que quieres hacer con constancia: racha actual, mejor racha y mapa de calor.',
    fields: [
      {
        key: 'frecuencia',
        label: 'Frecuencia',
        type: 'select',
        choices: [
          { value: 'diaria', label: 'Cada día' },
          { value: 'semanal', label: 'X veces por semana' },
        ],
      },
      { key: 'veces', label: 'Veces por semana', type: 'number', min: 1, max: 7, showIf: { key: 'frecuencia', value: 'semanal' } },
      { key: 'fin', label: 'Termina el (opcional)', type: 'date' },
    ],
    progress: 'streak',
    usesTasks: false,
    keyDate: { field: 'fin', label: 'Fin del reto' },
    blocks: layout([b('proyecto_resumen', 0, 0, 12), b('proyecto_racha', 0, 1, 12)]),
  },
  {
    id: 'creativo',
    name: 'Creativo',
    icon: '🎨',
    color: '#db2777',
    description: 'Una obra tuya: lluvia de ideas, galería de referencias y fases hasta publicarla.',
    fields: [],
    phases: [
      { value: 'idea', label: 'Idea' },
      { value: 'boceto', label: 'Boceto' },
      { value: 'produccion', label: 'Producción' },
      { value: 'publicado', label: 'Publicado' },
    ],
    progress: 'phases',
    usesTasks: false,
    blocks: layout([
      b('proyecto_resumen', 0, 0, 12),
      b('proyecto_fases', 0, 1, 12),
      b('proyecto_ideas', 0, 2, 6),
      b('proyecto_referencias', 6, 2, 6),
      b('proyecto_checklist', 0, 3, 6),
    ]),
  },
  {
    id: 'salud',
    name: 'Salud y deporte',
    icon: '💪',
    color: '#16a34a',
    description: 'Un objetivo medible (kg, km, minutos…): registra valores y mira su evolución.',
    fields: [
      { key: 'unidad', label: 'Unidad', type: 'text', placeholder: 'kg', suggestions: ['kg', 'km', 'min', 'pasos', 'reps', '%'] },
      { key: 'inicial', label: 'Valor inicial', type: 'number' },
      { key: 'objetivo', label: 'Objetivo', type: 'number' },
      { key: 'fecha_objetivo', label: 'Para cuándo (opcional)', type: 'date' },
    ],
    progress: 'value',
    usesTasks: false,
    keyDate: { field: 'fecha_objetivo', label: 'Fecha objetivo' },
    blocks: layout([b('proyecto_resumen', 0, 0, 12), b('proyecto_valor', 0, 1, 4), b('grafico_evolucion', 4, 1, 8)]),
  },
  {
    id: 'hogar',
    name: 'Personal / hogar',
    icon: '🏠',
    color: '#0d9488',
    description: 'Una lista de cosas por hacer, sin campos extra: mudanza, reforma, papeleo…',
    fields: [],
    progress: 'tasks',
    usesTasks: true,
    blocks: layout([b('proyecto_resumen', 0, 0, 12), b('proyecto_checklist', 0, 1, 12)]),
  },
  {
    id: 'aprendizaje',
    name: 'Aprendizaje libre',
    icon: '📚',
    color: '#d97706',
    description: 'Libros, idiomas o cursos online: lista de recursos con su estado y tus notas.',
    fields: [],
    progress: 'resources',
    usesTasks: false,
    blocks: layout([b('proyecto_resumen', 0, 0, 12), b('proyecto_recursos', 0, 1, 8), b('proyecto_horas', 8, 1, 4)]),
  },
  {
    id: 'viaje',
    name: 'Viaje / evento',
    icon: '✈️',
    color: '#0891b2',
    description: 'Fechas, presupuesto (con sus gastos en Finanzas) y checklist de preparación.',
    fields: [
      { key: 'destino', label: 'Destino o lugar', type: 'text', placeholder: 'Japón' },
      { key: 'inicio', label: 'Fecha de inicio', type: 'date' },
      { key: 'fin', label: 'Fecha de fin', type: 'date' },
      { key: 'presupuesto', label: 'Presupuesto', type: 'number', unit: '€', min: 0, max: 10000000 },
    ],
    progress: 'tasks',
    usesTasks: true,
    keyDate: { field: 'inicio', label: 'Salida' },
    blocks: layout([
      b('proyecto_resumen', 0, 0, 12),
      b('proyecto_cuenta_atras', 0, 1, 4),
      b('proyecto_presupuesto', 4, 1, 8),
      b('proyecto_checklist', 0, 2, 4, { title: 'Preparación' }),
    ]),
  },
  {
    id: 'general',
    name: 'General',
    icon: '📁',
    color: '#4f46e5',
    description: 'Lo mínimo: tareas en un kanban. Para lo que no encaje en otro tipo.',
    fields: [],
    progress: 'tasks',
    usesTasks: true,
    blocks: layout([b('proyecto_resumen', 0, 0, 12), b('tablero', 0, 1, 12)]),
  },
];

export const DEFAULT_KIND = 'general';

/** Tipo de un proyecto; uno desconocido (de una versión más nueva) se trata como «General». */
export const projectKind = (id: string | undefined) =>
  PROJECT_KINDS.find((k) => k.id === id) ?? PROJECT_KINDS.find((k) => k.id === DEFAULT_KIND)!;

export const kindOf = (p: Pick<Project, 'kind'>) => projectKind(p.kind);

/** Valor de un campo, o el de por defecto si no tiene (la primera opción de un 'select'). */
const valueOrDefault = (kind: ProjectKind, values: Record<string, unknown>, key: string) => {
  const v = values[key];
  if (v !== undefined && v !== '') return String(v);
  return kind.fields.find((f) => f.key === key)?.choices?.[0]?.value ?? '';
};

/** Campos que se ven con los valores actuales (los que dependen de otro, solo si toca). */
export const visibleFields = (kind: ProjectKind, values: Record<string, unknown>) =>
  kind.fields.filter((f) => !f.showIf || valueOrDefault(kind, values, f.showIf.key) === f.showIf.value);

/** Lo que el formulario guarda de cada campo: texto recortado, número o fecha; vacío = no se guarda. */
export function cleanFields(kind: ProjectKind, values: Record<string, unknown>): Record<string, ProjectFieldValue> {
  const out: Record<string, ProjectFieldValue> = {};
  for (const f of visibleFields(kind, values)) {
    const raw = values[f.key];
    if (f.type === 'number') {
      const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(',', '.'));
      if (String(raw ?? '').trim() !== '' && Number.isFinite(n)) out[f.key] = n;
    } else if (f.type === 'select') {
      const v = String(raw ?? '');
      out[f.key] = f.choices?.some((c) => c.value === v) ? v : (f.choices?.[0]?.value ?? '');
    } else {
      const v = String(raw ?? '').trim();
      if (v && (f.type !== 'date' || /^\d{4}-\d{2}-\d{2}$/.test(v))) out[f.key] = f.type === 'text' ? v.slice(0, 200) : v;
    }
  }
  const phase = values[PHASE_FIELD];
  if (kind.phases?.length) out[PHASE_FIELD] = kind.phases.some((p) => p.value === phase) ? String(phase) : kind.phases[0].value;
  return out;
}

/** Valor de un campo como texto ('' si no tiene) o como número (null si no tiene). */
export const fieldText = (p: Pick<Project, 'fields'>, key: string) => {
  const v = p.fields?.[key];
  return v === undefined || v === null ? '' : String(v);
};
export const fieldNumber = (p: Pick<Project, 'fields'>, key: string) => {
  const v = p.fields?.[key];
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Fase actual (la primera si no tiene o ya no existe). */
export function phaseOf(p: Pick<Project, 'fields' | 'kind'>) {
  const phases = projectKind(p.kind).phases ?? [];
  const value = fieldText(p, PHASE_FIELD);
  const index = Math.max(0, phases.findIndex((ph) => ph.value === value));
  return phases.length ? { index, phase: phases[index], phases } : null;
}

/** Fecha clave del proyecto (entrega, examen, salida…), si su tipo la tiene y está rellena. */
export function keyDateOf(p: Pick<Project, 'fields' | 'kind'>) {
  const kd = projectKind(p.kind).keyDate;
  const date = kd ? fieldText(p, kd.field) : '';
  return kd && /^\d{4}-\d{2}-\d{2}$/.test(date) ? { date, label: kd.label } : null;
}

/** La página de un proyecto, con la plantilla de su tipo y todos sus bloques fijados a él. */
export function projectPageSeed(p: Pick<Project, 'id' | 'name' | 'kind'>): PageSeed {
  const kind = projectKind(p.kind);
  return {
    name: p.name.trim().slice(0, 40) || kind.name,
    icon: kind.icon,
    project_id: p.id,
    blocks: kind.blocks.map((block) => ({ ...block, content: { ...block.content, project: p.id } })),
  };
}
