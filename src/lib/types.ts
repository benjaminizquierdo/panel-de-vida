export type ProjectStatus = 'activo' | 'pausado' | 'completado';
export type TaskStatus = 'pendiente' | 'en_curso' | 'hecha';
export type Priority = 'alta' | 'media' | 'baja';
export type GoalHorizon = 'anual' | 'trimestral';
export type LifeArea = 'proyectos' | 'salud' | 'finanzas' | 'personal';
export type TxType = 'gasto' | 'ingreso';

interface Base {
  id: string;
  user_id?: string;
  created_at?: string;
}

/** Valor de un campo propio de un tipo de proyecto (ver lib/projectKinds.ts). */
export type ProjectFieldValue = string | number;

export interface Project extends Base {
  name: string;
  description: string;
  status: ProjectStatus;
  color: string;
  /** Tipo de proyecto (lib/projectKinds.ts). Uno desconocido se trata como «General». */
  kind: string;
  /** Campos propios del tipo: cliente, fecha de examen, presupuesto… */
  fields: Record<string, ProjectFieldValue>;
  /** Último cambio en el proyecto o en algo suyo (lo mantienen los triggers de 008_tipos_proyecto.sql). */
  last_activity_at?: string;
}

export interface Task extends Base {
  project_id: string | null;
  title: string;
  status: TaskStatus;
  priority: Priority;
  due_date: string | null;
  /** Cuándo se marcó como hecha (lo pone la base de datos). */
  completed_at?: string | null;
  /** Tipo de tarea (lib/tasks.ts): tarea, error, mejora… */
  kind?: string;
  description?: string;
  /** Horas estimadas y horas ya dedicadas. */
  estimate_hours?: number | null;
  spent_hours?: number | null;
}

/** Nota, enlace o documento de la ficha de una tarea (009_detalle_tareas.sql). */
export interface TaskItem extends Base {
  task_id: string;
  /** 'nota', 'enlace' o 'archivo'. */
  kind: string;
  title: string;
  body: string;
  url: string | null;
  file_path: string | null;
  file_size: number | null;
  file_type: string;
  sort_order: number;
}

export type ItemStatus = 'pendiente' | 'en_curso' | 'hecho';

/**
 * Elemento de un proyecto: 'modulo' y 'tema' (temario), 'recurso', 'idea', 'referencia', 'nota',
 * 'enlace' o 'archivo'. Cada bloque usa los campos que necesita.
 */
export interface ProjectItem extends Base {
  project_id: string;
  /** Módulo del que cuelga un tema. */
  parent_id: string | null;
  kind: string;
  title: string;
  body: string;
  url: string | null;
  image_url: string | null;
  status: ItemStatus;
  /** Ruta en Storage (bucket «adjuntos»): <user_id>/<project_id>/<archivo>. */
  file_path: string | null;
  file_size: number | null;
  file_type: string;
  sort_order: number;
}

/** Registro de un proyecto: 'horas' dedicadas, 'valor' medido (kg, km…) o 'check' (día cumplido de un reto). */
export interface ProjectLog extends Base {
  project_id: string;
  kind: string;
  date: string;
  value: number;
  note: string;
}

export interface Habit extends Base {
  name: string;
  icon: string;
  active: boolean;
}

export interface HabitLog extends Base {
  habit_id: string;
  date: string;
}

export interface HealthLog extends Base {
  date: string;
  sleep_hours: number | null;
  energy: number | null;
  exercise_minutes: number | null;
  weight: number | null;
  notes: string;
  /** Agua bebida, pasos y kcal quemadas en actividad (010_nutricion.sql). */
  water_ml?: number | null;
  steps?: number | null;
  active_kcal?: number | null;
}

/** Objetivos diarios de nutrición y actividad, y peso objetivo (una fila por usuario). */
export interface NutritionGoals extends Base {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  water_ml: number;
  steps: number;
  weight_target: number | null;
  weight_target_date: string | null;
}

/** Alimento del catálogo del usuario. Valores por 100 g; el precio es el de un envase de `price_grams` g. */
export interface Food extends Base {
  name: string;
  brand: string;
  barcode: string | null;
  /** 'manual' o 'off' (Open Food Facts). */
  source: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  sugars: number | null;
  salt: number | null;
  serving_g: number | null;
  price: number | null;
  price_grams: number | null;
  store: string;
  image_url: string | null;
  favorite: boolean;
}

export type Meal = 'desayuno' | 'comida' | 'merienda' | 'cena' | 'otros';

/** Lo que se comió: nombre y valores calculados al apuntarlo. */
export interface FoodLog extends Base {
  date: string;
  meal: Meal;
  food_id: string | null;
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  cost: number | null;
}

export interface Goal extends Base {
  title: string;
  horizon: GoalHorizon;
  area: LifeArea;
  target: number;
  current: number;
  unit: string;
  due_date: string | null;
}

export interface Review extends Base {
  week_start: string;
  wins: string;
  challenges: string;
  lessons: string;
  next_focus: string;
}

export interface FinanceCategory extends Base {
  /** null en las categorías de primer nivel; solo hay dos niveles. */
  parent_id: string | null;
  type: TxType;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
  archived: boolean;
}

export interface Transaction extends Base {
  date: string;
  type: TxType;
  amount: number;
  category_id: string;
  note: string;
  /** Origen: 'manual' (por defecto), 'trade_republic', 'csv'… */
  source?: string;
  /** Identificador en el origen; evita importar dos veces el mismo movimiento. */
  external_id?: string | null;
  /** Proyecto al que pertenece el gasto (p. ej. un viaje). */
  project_id?: string | null;
}

export type Frequency = 'semanal' | 'mensual' | 'anual';

/** Gasto o ingreso que se crea solo cada semana, mes o año (supabase/migrations/005_periodicos.sql). */
export interface RecurringTransaction extends Base {
  type: TxType;
  amount: number;
  category_id: string;
  /** Concepto: «Netflix», «Nómina»… */
  note: string;
  frequency: Frequency;
  /** Día del mes (1-31) en que toca; si el mes es más corto, su último día. */
  anchor_day: number;
  /** Mes (1-12) en que toca, para los anuales. */
  anchor_month: number;
  /** Próxima fecha que falta por crear. */
  next_date: string;
  end_date: string | null;
  active: boolean;
}

/** «Si el comercio contiene `pattern` → categoría», para las importaciones. */
export interface ImportRule extends Base {
  pattern: string;
  category_id: string;
}

export interface Budget extends Base {
  category_id: string;
  monthly_limit: number;
}

export interface Highlight extends Base {
  date: string;
  text: string;
  done: boolean;
}

/** Sub-pestaña creada por el usuario dentro de una pestaña principal fija (006_pestanas.sql). */
/** Página («categoría») del árbol del usuario. Las de primer nivel tienen `parent_id` null. */
export interface UserTab extends Base {
  /** Obsoleta (migración 006): sub-pestaña de una pestaña fija. La 007 la pasa a `parent_id`. */
  section: string | null;
  parent_id: string | null;
  name: string;
  icon: string;
  sort_order: number;
  /** Categoría por defecto de la que sale (ver lib/pageTemplates.ts); null en las creadas por el usuario. */
  template: string | null;
  /** Página de un proyecto (no sale en el menú). */
  project_id?: string | null;
}

/** Tipo de bloque: ver lib/blockKinds.ts. Los desconocidos (de una versión más nueva) se muestran como aviso. */
export type BlockType = string;

/** Bloque de una página. `content` tiene la forma que define su tipo; x, y, w, h: rejilla de 12 columnas. */
export interface Block extends Base {
  tab_id: string;
  type: BlockType;
  title: string;
  content: Record<string, unknown>;
  sort_order: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Cada clave es el nombre de una tabla de Supabase (ver supabase/migrations). */
export interface Tables {
  tabs: UserTab;
  blocks: Block;
  finance_categories: FinanceCategory;
  import_rules: ImportRule;
  recurring_transactions: RecurringTransaction;
  projects: Project;
  tasks: Task;
  task_items: TaskItem;
  project_items: ProjectItem;
  project_logs: ProjectLog;
  habits: Habit;
  habit_logs: HabitLog;
  health_logs: HealthLog;
  nutrition_goals: NutritionGoals;
  foods: Food;
  food_logs: FoodLog;
  goals: Goal;
  reviews: Review;
  transactions: Transaction;
  budgets: Budget;
  highlights: Highlight;
}

export type TableName = keyof Tables;
export type Row<T extends TableName> = Tables[T];
export type NewRow<T extends TableName> = Omit<Tables[T], 'id' | 'user_id' | 'created_at'>;

export interface User {
  id: string;
  email: string;
  name: string;
}

// ---------- Asistente (ver supabase/functions/assistant/index.ts)

/** Mensaje del historial de la API de Claude. La app lo guarda y lo reenvía sin tocarlo. */
export interface TranscriptMessage {
  role: 'user' | 'assistant' | 'system';
  content: unknown;
}

export interface AssistantRequest {
  message: string;
  history: TranscriptMessage[];
  today: string;
}

export interface AssistantResponse {
  reply: string;
  /** Mensajes nuevos que hay que añadir al final del historial. */
  appended: TranscriptMessage[];
  /** Cuántos mensajes del principio del historial ha descartado el servidor. */
  dropped: number;
  /** Lo que el asistente ha guardado, en frases legibles. */
  actions: string[];
  /** Mensajes que le quedan hoy al usuario. */
  remaining: number;
}

export class AssistantError extends Error {
  readonly actions: string[];
  readonly remaining?: number;

  constructor(message: string, actions: string[] = [], remaining?: number) {
    super(message);
    this.actions = actions;
    this.remaining = remaining;
  }
}
