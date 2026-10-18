// Catálogo de tipos de bloque del diseñador: nombre, descripción, grupo, tamaño inicial y
// ajustes. Sin React, para poder probarlo (tests/pages.test.ts). Cada tipo tiene su
// componente en src/blocks/index.tsx. La base de datos no limita los tipos: un tipo que esta
// versión no conoce se muestra como aviso en lugar de romper la página.

export type BlockGroup = 'basicos' | 'inicio' | 'proyectos' | 'habitos' | 'objetivos' | 'finanzas';

export const BLOCK_GROUPS: { id: BlockGroup; label: string; hint: string }[] = [
  { id: 'basicos', label: 'Básicos', hint: 'Para montar cualquier página a tu manera' },
  { id: 'inicio', label: 'Tu día', hint: 'Lo de hoy y el tiempo que pasa, juntando toda la app' },
  { id: 'proyectos', label: 'Proyectos y tareas', hint: '' },
  { id: 'habitos', label: 'Hábitos y salud', hint: '' },
  { id: 'objetivos', label: 'Objetivos', hint: '' },
  { id: 'finanzas', label: 'Finanzas', hint: '' },
];

/** Ajuste de un bloque que se elige entre varias opciones (se guarda en `content[key]`). */
export interface BlockOption {
  key: string;
  label: string;
  choices: { value: string; label: string; hint: string }[];
}

/**
 * Filtro que se elige entre tus propios datos (se guarda en `content[key]`): con él, un bloque de
 * la app muestra solo lo de una categoría, un proyecto, unos hábitos… dentro de tu página.
 */
export interface BlockFilter {
  key: string;
  label: string;
  source: 'project' | 'expense_category' | 'habits' | 'habit' | 'savings_goal';
  /** Texto de «sin filtro» (todos). Sin él, hay que elegir uno. */
  allLabel?: string;
  /** Con source 'project': tipos de proyecto que se ofrecen primero (lib/projectKinds.ts). */
  projectKinds?: string[];
}

export const AREA_OPTION: BlockOption = {
  key: 'area',
  label: 'Área',
  choices: [
    { value: 'todas', label: 'Todas', hint: 'Objetivos de todas las áreas.' },
    { value: 'proyectos', label: 'Proyectos', hint: 'Solo los del área Proyectos.' },
    { value: 'salud', label: 'Salud', hint: 'Solo los del área Salud.' },
    { value: 'finanzas', label: 'Finanzas', hint: 'Solo los del área Finanzas.' },
    { value: 'personal', label: 'Personal', hint: 'Solo los del área Personal.' },
  ],
};

const PROJECT_FILTER: BlockFilter = { key: 'project', label: 'Proyecto', source: 'project', allLabel: 'Todos los proyectos' };
/** Bloques de un solo proyecto. Sin elegir, muestran el primero activo de esos tipos. */
const oneProject = (...projectKinds: string[]): BlockFilter[] => [{ key: 'project', label: 'Proyecto', source: 'project', projectKinds }];
const CATEGORY_FILTER: BlockFilter = { key: 'category', label: 'Categoría de gasto', source: 'expense_category', allLabel: 'Todas las categorías' };

export interface BlockKind {
  type: string;
  name: string;
  icon: string;
  description: string;
  group: BlockGroup;
  /** Tamaño al añadirlo, en columnas (de 12) y filas de la rejilla (ver PageCanvas). */
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  /**
   * true: alto fijo (gráficos). Si no, el bloque mide lo que ocupa su contenido hasta que el
   * usuario lo estira a mano (entonces se guarda `content.fixedHeight = true`).
   */
  fixedHeight?: boolean;
  /** false: sin tarjeta alrededor (saludos, cifras, selectores), solo su contenido. */
  frame?: boolean;
  /** Contenido inicial. */
  empty?: () => Record<string, unknown>;
  options?: BlockOption[];
  filters?: BlockFilter[];
  /** false: no se ofrece en el catálogo (pantallas completas que viven en su categoría por defecto). */
  catalog?: boolean;
  /** Se marca como «Nuevo» en el catálogo. */
  isNew?: boolean;
}

export const BLOCK_KINDS: BlockKind[] = [
  // ------------------------------------------------------------ Básicos
  {
    type: 'notas',
    name: 'Notas',
    icon: '📝',
    description: 'Texto libre: apuntes, tu rutina, ideas… Se guarda solo mientras escribes.',
    group: 'basicos',
    w: 4,
    h: 8,
    empty: () => ({ text: '' }),
  },
  {
    type: 'checklist',
    name: 'Checklist',
    icon: '☑️',
    description: 'Lista de cosas por hacer. Puede reiniciarse sola cada día o cada semana.',
    group: 'basicos',
    w: 4,
    h: 8,
    empty: () => ({ items: [], reset: 'nunca' }),
    options: [
      {
        key: 'reset',
        label: 'Reinicio',
        choices: [
          { value: 'nunca', label: 'Nunca', hint: 'Lo que marques se queda marcado.' },
          { value: 'diario', label: 'Cada día', hint: 'Cada día empieza sin marcar: ideal para rutinas diarias.' },
          { value: 'semanal', label: 'Cada semana', hint: 'Cada lunes empieza sin marcar: ideal para tareas semanales.' },
        ],
      },
    ],
  },
  {
    type: 'enlaces',
    name: 'Enlaces',
    icon: '🔗',
    description: 'Accesos directos a webs, documentos o vídeos que usas a menudo.',
    group: 'basicos',
    w: 4,
    h: 7,
    empty: () => ({ links: [] }),
  },

  // ------------------------------------------------------------ Tu día
  { type: 'saludo', name: 'Saludo', icon: '👋', description: 'Buenos días y la fecha de hoy.', group: 'inicio', w: 12, h: 3, frame: false, catalog: false },
  {
    type: 'lo_mas_importante',
    name: 'Lo más importante de hoy',
    icon: '⭐',
    description: 'La única cosa que harías hoy si solo pudieras hacer una.',
    group: 'inicio',
    w: 12,
    h: 5,
  },
  {
    type: 'resumen_hoy',
    name: 'Resumen de hoy',
    icon: '📊',
    description: 'Hábitos de hoy, tareas abiertas, gasto del mes y progreso de objetivos.',
    group: 'inicio',
    w: 12,
    h: 5,
    frame: false,
  },

  // ------------------------------------------------------------ Proyectos y tareas
  { type: 'proximas_fechas', name: 'Próximas fechas límite', icon: '⏰', description: 'Las 5 tareas pendientes con la fecha más cercana.', group: 'proyectos', w: 6, h: 10, filters: [PROJECT_FILTER] },
  { type: 'proyectos_activos', name: 'Proyectos activos', icon: '🚀', description: 'Progreso de cada proyecto activo.', group: 'proyectos', w: 6, h: 9 },
  {
    type: 'proyectos',
    name: 'Mis proyectos',
    icon: '📁',
    description: 'Tarjetas de tus proyectos con su progreso, siguiente tarea y semáforo; filtros por tipo y estado, y «+ Nuevo proyecto».',
    group: 'proyectos',
    w: 12,
    h: 14,
    minW: 4,
    isNew: true,
  },
  {
    type: 'tablero',
    name: 'Kanban de tareas',
    icon: '🗂️',
    description: 'Tareas en columnas Pendiente · En curso · Hecha, de un proyecto o de todos.',
    group: 'proyectos',
    w: 8,
    h: 19,
    minW: 4,
    filters: [PROJECT_FILTER],
  },

  // ------------------------------------------------------------ Hábitos y salud
  { type: 'habitos_hoy', name: 'Hábitos de hoy', icon: '✅', description: 'Marca los hábitos de hoy y mira tus rachas.', group: 'habitos', w: 6, h: 12, filters: [{ key: 'habits', label: 'Hábitos', source: 'habits', allLabel: 'Todos los hábitos' }] },
  {
    type: 'habitos_semana',
    name: 'Hábitos · últimos 7 días',
    icon: '📅',
    description: 'Tabla de la semana para marcar, crear y borrar hábitos.',
    group: 'habitos',
    w: 12,
    h: 16,
    minW: 6,
    catalog: false,
  },
  {
    type: 'registro_salud',
    name: 'Registro diario de salud',
    icon: '🩺',
    description: 'Sueño, ejercicio, peso, energía y notas de cada día.',
    group: 'habitos',
    w: 6,
    h: 20,
    minW: 4,
    catalog: false,
  },
  { type: 'salud_medias', name: 'Medias de salud', icon: '📊', description: 'Sueño, energía y ejercicio de los últimos 7 días.', group: 'habitos', w: 6, h: 4, frame: false, catalog: false },
  { type: 'grafico_sueno', name: 'Sueño y energía · 14 días', icon: '😴', description: 'Gráfico de líneas de las dos últimas semanas.', group: 'habitos', w: 6, h: 11, minH: 7, fixedHeight: true },
  { type: 'grafico_ejercicio', name: 'Ejercicio · 14 días', icon: '🏃', description: 'Minutos de ejercicio de cada día.', group: 'habitos', w: 6, h: 9, minH: 7, fixedHeight: true },
  { type: 'constancia_salud', name: 'Constancia del registro', icon: '📈', description: 'Cuántos de los últimos 7 días has registrado.', group: 'habitos', w: 6, h: 5, catalog: false },

  // ------------------------------------------------------------ Objetivos
  {
    type: 'objetivos',
    name: 'Objetivos',
    icon: '🎯',
    description: 'Tus objetivos con su progreso, para ir sumando avances.',
    group: 'objetivos',
    w: 8,
    h: 13,
    minW: 3,
    empty: () => ({ horizon: 'todos' }),
    options: [
      {
        key: 'horizon',
        label: 'Qué objetivos',
        choices: [
          { value: 'todos', label: 'Todos', hint: 'Anuales y trimestrales.' },
          { value: 'anual', label: 'Anuales', hint: 'Solo los objetivos anuales.' },
          { value: 'trimestral', label: 'Trimestrales', hint: 'Solo los objetivos trimestrales.' },
        ],
      },
      AREA_OPTION,
    ],
  },
  { type: 'objetivos_resumen', name: 'Progreso de objetivos', icon: '🏁', description: 'Lista compacta de 5 objetivos con su barra de progreso.', group: 'objetivos', w: 6, h: 9, options: [AREA_OPTION] },
  { type: 'nuevo_objetivo', name: 'Nuevo objetivo', icon: '➕', description: 'Formulario para crear un objetivo.', group: 'objetivos', w: 4, h: 17, minW: 3, catalog: false },
  {
    type: 'revision_semanal',
    name: 'Revisión semanal',
    icon: '🗒️',
    description: 'Logros, dificultades, aprendizajes y foco de cada semana.',
    group: 'objetivos',
    w: 12,
    h: 19,
    minW: 4,
  },

  // ------------------------------------------------------------ Finanzas
  {
    type: 'fin_mes',
    name: 'Selector de mes',
    icon: '🗓️',
    description: 'Cambia el mes que muestran los bloques de finanzas de esta página.',
    group: 'finanzas',
    w: 12,
    h: 2,
    frame: false,
  },
  { type: 'fin_resumen', name: 'Resumen del mes', icon: '💶', description: 'Ingresos, gastos y balance del mes.', group: 'finanzas', w: 12, h: 5, frame: false },
  { type: 'fin_nuevo', name: 'Nuevo movimiento', icon: '➕', description: 'Apunta un gasto o un ingreso (también periódicos).', group: 'finanzas', w: 4, h: 18, minW: 3, filters: [CATEGORY_FILTER] },
  { type: 'fin_presupuesto', name: 'Presupuesto por categoría', icon: '🎯', description: 'Gasto del mes frente al límite de cada categoría.', group: 'finanzas', w: 4, h: 21, minW: 3, filters: [CATEGORY_FILTER] },
  { type: 'fin_meses', name: 'Últimos 6 meses', icon: '📊', description: 'Ingresos y gastos de los últimos seis meses.', group: 'finanzas', w: 8, h: 11, minH: 7, fixedHeight: true, filters: [CATEGORY_FILTER] },
  { type: 'fin_movimientos', name: 'Movimientos del mes', icon: '🧾', description: 'Lista de movimientos del mes, con opción de borrar.', group: 'finanzas', w: 8, h: 14, minW: 4, filters: [CATEGORY_FILTER] },
  {
    type: 'fin_periodicos',
    name: 'Movimientos periódicos',
    icon: '🔁',
    description: 'Suscripciones, alquiler, nómina… que se apuntan solos.',
    group: 'finanzas',
    w: 12,
    h: 15,
    minW: 6,
    frame: false,
    catalog: false,
  },
  {
    type: 'fin_categorias',
    name: 'Categorías de finanzas',
    icon: '🏷️',
    description: 'Crea, ordena, archiva y fusiona categorías y subcategorías.',
    group: 'finanzas',
    w: 12,
    h: 26,
    minW: 6,
    frame: false,
    catalog: false,
  },
  {
    type: 'fin_importar',
    name: 'Importar movimientos bancarios',
    icon: '🏦',
    description: 'Sube el CSV de tu banco y elige qué movimientos importar.',
    group: 'finanzas',
    w: 12,
    h: 22,
    minW: 6,
    frame: false,
    catalog: false,
  },

  // ------------------------------------------------------------ Nuevos: cruzan datos de toda la app
  {
    type: 'agenda_hoy',
    name: 'Agenda de hoy',
    icon: '📅',
    description: 'En una lista: lo más importante, las tareas que vencen, los hábitos pendientes y los cargos de hoy.',
    group: 'inicio',
    w: 6,
    h: 12,
    isNew: true,
  },
  {
    type: 'puntuacion_dia',
    name: 'Puntuación del día',
    icon: '🏅',
    description: 'Una nota de 0 a 100 con tus hábitos, lo más importante, tus tareas y tu gasto, y su evolución en la semana.',
    group: 'inicio',
    w: 4,
    h: 10,
    isNew: true,
  },
  {
    type: 'progreso_anio',
    name: 'Progreso del año',
    icon: '⏳',
    description: 'Cuánto llevas de semana, mes y año, frente a cuánto llevas de tus objetivos.',
    group: 'inicio',
    w: 4,
    h: 8,
    isNew: true,
  },
  {
    type: 'cuenta_atras',
    name: 'Cuenta atrás',
    icon: '⏱️',
    description: 'Los días que faltan para lo que esperas: un viaje, un examen, un cumpleaños…',
    group: 'inicio',
    w: 4,
    h: 7,
    isNew: true,
    empty: () => ({ events: [] }),
  },
  {
    type: 'calendario_mes',
    name: 'Calendario del mes',
    icon: '🗓️',
    description: 'Tus tareas con fecha, cargos periódicos y revisiones semanales en una vista mensual.',
    group: 'inicio',
    w: 8,
    h: 16,
    minW: 4,
    isNew: true,
  },
  {
    type: 'correlaciones',
    name: 'Qué te funciona',
    icon: '🔗',
    description: 'Descubre cómo cambian tu sueño, tu energía y tu gasto los días que cumples cada hábito.',
    group: 'habitos',
    w: 6,
    h: 10,
    isNew: true,
  },
  {
    type: 'cadena_habito',
    name: 'Cadena de un hábito',
    icon: '🔥',
    description: 'Las últimas 26 semanas de un hábito en un mapa, con tu racha actual y tu mejor racha.',
    group: 'habitos',
    w: 6,
    h: 8,
    minW: 4,
    isNew: true,
    filters: [{ key: 'habit', label: 'Hábito', source: 'habit' }],
  },
  {
    type: 'anio_pixeles',
    name: 'Año en píxeles',
    icon: '🟩',
    description: 'Cada día del año es un cuadrado con el color de cuántos hábitos cumpliste.',
    group: 'habitos',
    w: 12,
    h: 9,
    minW: 6,
    isNew: true,
    filters: [{ key: 'habits', label: 'Hábitos', source: 'habits', allLabel: 'Todos los hábitos' }],
  },
  {
    type: 'proximos_cargos',
    name: 'Próximos cargos',
    icon: '💳',
    description: 'Lo que se te va a cobrar (y lo que vas a cobrar) en los próximos 30 días, según tus periódicos.',
    group: 'finanzas',
    w: 4,
    h: 11,
    isNew: true,
  },
  {
    type: 'suscripciones',
    name: 'Suscripciones',
    icon: '📺',
    description: 'Cuánto te cuestan al mes y al año tus gastos periódicos, del más caro al más barato.',
    group: 'finanzas',
    w: 4,
    h: 11,
    isNew: true,
  },
  {
    type: 'ritmo_gasto',
    name: 'Ritmo de gasto',
    icon: '📉',
    description: 'A este ritmo, ¿cómo acabarás el mes frente a tu presupuesto? Tiene en cuenta los cargos fijos que faltan.',
    group: 'finanzas',
    w: 4,
    h: 8,
    isNew: true,
    filters: [CATEGORY_FILTER],
  },
  {
    type: 'gasto_categorias',
    name: 'Gasto por categoría',
    icon: '🍩',
    description: 'Gráfico circular del gasto del mes por categoría.',
    group: 'finanzas',
    w: 4,
    h: 12,
    minH: 8,
    fixedHeight: true,
    isNew: true,
  },
  {
    type: 'hucha',
    name: 'Hucha',
    icon: '🐷',
    description: 'Ahorra para una meta: progreso, lo que falta y cuánto apartar al mes para llegar a tiempo.',
    group: 'finanzas',
    w: 4,
    h: 8,
    isNew: true,
    filters: [{ key: 'goal', label: 'Objetivo de ahorro', source: 'savings_goal' }],
  },

  // ------------------------------------------------------------ Nuevos: tipos de proyecto
  {
    type: 'foco_hoy',
    name: 'Foco de hoy',
    icon: '🎯',
    description: 'La tarea más prioritaria de todos tus proyectos (vencidas, de hoy, prioridad alta…) y las dos siguientes.',
    group: 'proyectos',
    w: 12,
    h: 6,
    isNew: true,
  },
  { type: 'proyecto_resumen', name: 'Resumen del proyecto', icon: '📌', description: 'Progreso, semáforo, siguiente paso y los datos propios del proyecto (cliente, examen, destino…).', group: 'proyectos', w: 12, h: 6, isNew: true, filters: oneProject() },
  { type: 'proyecto_fases', name: 'Fases', icon: '🪜', description: 'Las fases del proyecto (propuesta → entregado, idea → publicado): pulsa una para avanzar.', group: 'proyectos', w: 12, h: 4, isNew: true, filters: oneProject('profesional', 'creativo') },
  { type: 'proyecto_cuenta_atras', name: 'Cuenta atrás del proyecto', icon: '⏳', description: 'Días que faltan para la entrega, el examen o la salida del viaje.', group: 'proyectos', w: 4, h: 6, isNew: true, filters: oneProject('profesional', 'estudios', 'viaje', 'reto', 'salud') },
  { type: 'proyecto_checklist', name: 'Checklist de tareas', icon: '☑️', description: 'Las tareas de un proyecto como lista simple: escribe, marca y listo.', group: 'proyectos', w: 6, h: 10, isNew: true, filters: oneProject('hogar', 'viaje', 'creativo') },
  { type: 'proyecto_temario', name: 'Temario', icon: '📖', description: 'Módulos con sus temas: marca lo estudiado y mira el % de cada módulo.', group: 'proyectos', w: 8, h: 14, minW: 4, isNew: true, filters: oneProject('estudios') },
  { type: 'proyecto_horas', name: 'Registro de horas', icon: '⏱️', description: 'Apunta las horas dedicadas y compáralas con las estimadas.', group: 'proyectos', w: 4, h: 10, isNew: true, filters: oneProject('profesional', 'estudios', 'aprendizaje') },
  { type: 'proyecto_racha', name: 'Racha del reto', icon: '🔥', description: 'Marca el día, mira tu racha actual y tu mejor racha, y el mapa de calor de 6 meses.', group: 'proyectos', w: 12, h: 12, minW: 4, isNew: true, filters: oneProject('reto') },
  { type: 'proyecto_valor', name: 'Registro de valores', icon: '⚖️', description: 'Apunta tu peso, km o minutos y mira cuánto te falta para el objetivo.', group: 'proyectos', w: 4, h: 12, isNew: true, filters: oneProject('salud') },
  { type: 'proyecto_ideas', name: 'Lluvia de ideas', icon: '💡', description: 'Apunta ideas al vuelo y convierte las buenas en tareas.', group: 'proyectos', w: 6, h: 10, isNew: true, filters: oneProject('creativo') },
  { type: 'proyecto_referencias', name: 'Galería de referencias', icon: '🖼️', description: 'Imágenes y enlaces de inspiración: sube una imagen o pega una dirección.', group: 'proyectos', w: 6, h: 12, isNew: true, filters: oneProject('creativo') },
  { type: 'proyecto_recursos', name: 'Recursos', icon: '📚', description: 'Libros, cursos o vídeos con su estado (pendiente, en curso, terminado) y tus notas.', group: 'proyectos', w: 8, h: 12, minW: 4, isNew: true, filters: oneProject('aprendizaje') },
  { type: 'proyecto_presupuesto', name: 'Presupuesto del proyecto', icon: '💶', description: 'Presupuesto frente a gastado. Los gastos se apuntan en Finanzas, vinculados al proyecto.', group: 'proyectos', w: 8, h: 14, minW: 4, isNew: true, filters: oneProject('viaje') },
  { type: 'proyecto_notas', name: 'Notas y adjuntos', icon: '📎', description: 'Notas, enlaces y documentos de un proyecto.', group: 'proyectos', w: 6, h: 12, isNew: true, filters: oneProject() },
  { type: 'grafico_avance', name: 'Avance del proyecto', icon: '📈', description: 'Gráfico de tareas creadas frente a hechas, acumuladas semana a semana.', group: 'proyectos', w: 6, h: 10, minH: 7, fixedHeight: true, isNew: true, filters: [PROJECT_FILTER] },
  { type: 'grafico_tareas_semana', name: 'Tareas completadas por semana', icon: '📊', description: 'Cuántas tareas terminas cada semana (las últimas 8).', group: 'proyectos', w: 6, h: 10, minH: 7, fixedHeight: true, isNew: true, filters: [PROJECT_FILTER] },
  { type: 'grafico_horas', name: 'Horas por semana', icon: '🕒', description: 'Gráfico de las horas dedicadas cada semana, con el total frente a las estimadas.', group: 'proyectos', w: 6, h: 10, minH: 7, fixedHeight: true, isNew: true, filters: [PROJECT_FILTER] },
  { type: 'grafico_evolucion', name: 'Evolución hacia el objetivo', icon: '📉', description: 'Gráfico de tus valores medidos con la línea del objetivo.', group: 'proyectos', w: 8, h: 11, minH: 7, fixedHeight: true, isNew: true, filters: oneProject('salud') },
  { type: 'grafico_proyectos', name: 'Proyectos por tipo', icon: '🍩', description: 'Gráfico circular de tus proyectos por tipo, y cuántos hay activos, pausados y terminados.', group: 'proyectos', w: 6, h: 13, minH: 9, fixedHeight: true, isNew: true },
];

export const blockKind = (type: string) => BLOCK_KINDS.find((k) => k.type === type);

/** Valor de un ajuste del bloque, o el primero de sus opciones si no está o no es válido. */
export function optionValue(kind: BlockKind | undefined, content: Record<string, unknown>, key: string): string {
  const option = kind?.options?.find((o) => o.key === key);
  const value = content[key];
  return option?.choices.some((c) => c.value === value) ? (value as string) : (option?.choices[0]?.value ?? '');
}

/** ¿Tiene el bloque un alto fijo? Si no, en el ordenador mide lo que ocupe su contenido. */
export function hasFixedHeight(kind: BlockKind | undefined, content: Record<string, unknown>): boolean {
  return typeof content.fixedHeight === 'boolean' ? content.fixedHeight : !!kind?.fixedHeight;
}

/** Valor de un filtro guardado: id elegido ('' = todos) o, en los de varios, la lista de ids. */
export const filterValue = (content: Record<string, unknown>, key: string): string => (typeof content[key] === 'string' ? (content[key] as string) : '');
export const filterValues = (content: Record<string, unknown>, key: string): string[] =>
  Array.isArray(content[key]) ? (content[key] as unknown[]).filter((v): v is string => typeof v === 'string') : [];
