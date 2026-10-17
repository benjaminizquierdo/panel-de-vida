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

export interface Transaction extends Base {
  date: string;
  type: TxType;
  amount: number;
  category: string;
  note: string;
}

export interface Budget extends Base {
  category: string;
  monthly_limit: number;
}

export interface Highlight extends Base {
  date: string;
  text: string;
  done: boolean;
}

/** Cada clave es el nombre de una tabla de Supabase (ver supabase/schema.sql). */
export interface Tables {
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
