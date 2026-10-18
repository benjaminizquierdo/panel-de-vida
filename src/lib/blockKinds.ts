// Catálogo de tipos de bloque del diseñador: nombre, descripción, grupo, tamaño inicial y
// ajustes. Sin React, para poder probarlo (tests/pages.test.ts). Cada tipo tiene su
// componente en src/blocks/index.tsx. La base de datos no limita los tipos: un tipo que esta
// versión no conoce se muestra como aviso en lugar de romper la página.

export type BlockGroup = 'basicos' | 'inicio' | 'proyectos' | 'habitos' | 'objetivos' | 'finanzas';

export const BLOCK_GROUPS: { id: BlockGroup; label: string; hint: string }[] = [
  { id: 'basicos', label: 'Básicos', hint: 'Para montar cualquier página a tu manera' },
  { id: 'inicio', label: 'Tu día', hint: 'Resúmenes de toda la app' },
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
  { type: 'saludo', name: 'Saludo', icon: '👋', description: 'Buenos días y la fecha de hoy.', group: 'inicio', w: 12, h: 3, frame: false },
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
  { type: 'proximas_fechas', name: 'Próximas fechas límite', icon: '⏰', description: 'Las 5 tareas pendientes con la fecha más cercana.', group: 'proyectos', w: 6, h: 10 },
  { type: 'proyectos_activos', name: 'Proyectos activos', icon: '🚀', description: 'Progreso de cada proyecto activo.', group: 'proyectos', w: 6, h: 9 },
  {
    type: 'proyectos',
    name: 'Proyectos',
    icon: '📁',
    description: 'Tus proyectos con su estado y progreso, y el formulario para crear uno.',
    group: 'proyectos',
    w: 4,
    h: 19,
    minW: 3,
  },
  {
    type: 'tablero',
    name: 'Tablero de tareas',
    icon: '🗂️',
    description: 'Tareas en columnas Pendiente · En curso · Hecha, con filtro por proyecto.',
    group: 'proyectos',
    w: 8,
    h: 19,
    minW: 4,
  },

  // ------------------------------------------------------------ Hábitos y salud
  { type: 'habitos_hoy', name: 'Hábitos de hoy', icon: '✅', description: 'Marca los hábitos de hoy y mira tus rachas.', group: 'habitos', w: 6, h: 12 },
  {
    type: 'habitos_semana',
    name: 'Hábitos · últimos 7 días',
    icon: '📅',
    description: 'Tabla de la semana para marcar, crear y borrar hábitos.',
    group: 'habitos',
    w: 12,
    h: 16,
    minW: 6,
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
  },
  { type: 'salud_medias', name: 'Medias de salud', icon: '📊', description: 'Sueño, energía y ejercicio de los últimos 7 días.', group: 'habitos', w: 6, h: 4, frame: false },
  { type: 'grafico_sueno', name: 'Sueño y energía · 14 días', icon: '😴', description: 'Gráfico de líneas de las dos últimas semanas.', group: 'habitos', w: 6, h: 11, minH: 7, fixedHeight: true },
  { type: 'grafico_ejercicio', name: 'Ejercicio · 14 días', icon: '🏃', description: 'Minutos de ejercicio de cada día.', group: 'habitos', w: 6, h: 9, minH: 7, fixedHeight: true },
  { type: 'constancia_salud', name: 'Constancia del registro', icon: '📈', description: 'Cuántos de los últimos 7 días has registrado.', group: 'habitos', w: 6, h: 5 },

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
    ],
  },
  { type: 'objetivos_resumen', name: 'Progreso de objetivos', icon: '🏁', description: 'Lista compacta de 5 objetivos con su barra de progreso.', group: 'objetivos', w: 6, h: 9 },
  { type: 'nuevo_objetivo', name: 'Nuevo objetivo', icon: '➕', description: 'Formulario para crear un objetivo.', group: 'objetivos', w: 4, h: 17, minW: 3 },
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
  { type: 'fin_nuevo', name: 'Nuevo movimiento', icon: '➕', description: 'Apunta un gasto o un ingreso (también periódicos).', group: 'finanzas', w: 4, h: 18, minW: 3 },
  { type: 'fin_presupuesto', name: 'Presupuesto por categoría', icon: '🎯', description: 'Gasto del mes frente al límite de cada categoría.', group: 'finanzas', w: 4, h: 21, minW: 3 },
  { type: 'fin_meses', name: 'Últimos 6 meses', icon: '📊', description: 'Ingresos y gastos de los últimos seis meses.', group: 'finanzas', w: 8, h: 11, minH: 7, fixedHeight: true },
  { type: 'fin_movimientos', name: 'Movimientos del mes', icon: '🧾', description: 'Lista de movimientos del mes, con opción de borrar.', group: 'finanzas', w: 8, h: 14, minW: 4 },
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
  },
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
