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

export interface Project extends Base {
  name: string;
  description: string;
  status: ProjectStatus;
  color: string;
}

export interface Task extends Base {
  project_id: string | null;
  title: string;
  status: TaskStatus;
  priority: Priority;
  due_date: string | null;
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
export interface UserTab extends Base {
  /** Id de la pestaña principal (ver lib/tabs.ts). Null queda para pestañas principales propias (futuro). */
  section: string | null;
  parent_id: string | null;
  name: string;
  icon: string;
  sort_order: number;
}

export type BlockType = 'notas' | 'checklist' | 'enlaces';

/** Bloque de una sub-pestaña. `content` tiene la forma que define su tipo en lib/blocks.ts. */
export interface Block extends Base {
  tab_id: string;
  type: BlockType;
  title: string;
  content: Record<string, unknown>;
  sort_order: number;
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
  habits: Habit;
  habit_logs: HabitLog;
  health_logs: HealthLog;
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
