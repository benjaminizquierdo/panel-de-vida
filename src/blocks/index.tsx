import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { Block } from '../lib/types';
import ChecklistBlock from './ChecklistBlock';
import LinksBlock from './LinksBlock';
import NotesBlock from './NotesBlock';

export interface BlockProps {
  block: Block;
  /** Guarda el contenido nuevo del bloque. Devuelve false si ha fallado (el aviso ya se ha mostrado). */
  onSave: (content: Record<string, unknown>) => Promise<boolean>;
}

type AnyBlock = ComponentType<BlockProps> | LazyExoticComponent<ComponentType<BlockProps>>;

// Los bloques de la app se cargan al usarlos (los de gráficos arrastran recharts).
const today = () => import('./app/today');
const projects = () => import('./app/projects');
const habits = () => import('./app/habits');
const goals = () => import('./app/goals');
const finance = () => import('./app/finance');

const from = <M,>(load: () => Promise<M>, pick: (m: M) => ComponentType<BlockProps>) => lazy(() => load().then((m) => ({ default: pick(m) })));

/** Componente de cada tipo de bloque (sus datos y textos están en lib/blockKinds.ts). */
export const BLOCK_COMPONENTS: Record<string, AnyBlock> = {
  notas: NotesBlock,
  checklist: ChecklistBlock,
  enlaces: LinksBlock,

  saludo: from(today, (m) => m.Greeting),
  lo_mas_importante: from(today, (m) => m.DailyHighlight),
  resumen_hoy: from(today, (m) => m.TodaySummary),

  proximas_fechas: from(projects, (m) => m.UpcomingDeadlines),
  proyectos_activos: from(projects, (m) => m.ActiveProjects),
  proyectos: from(projects, (m) => m.ProjectList),
  tablero: from(projects, (m) => m.TaskBoard),

  habitos_hoy: from(habits, (m) => m.HabitsToday),
  habitos_semana: from(habits, (m) => m.HabitWeek),
  registro_salud: from(habits, (m) => m.HealthForm),
  salud_medias: from(habits, (m) => m.HealthAverages),
  grafico_sueno: from(habits, (m) => m.SleepChart),
  grafico_ejercicio: from(habits, (m) => m.ExerciseChart),
  constancia_salud: from(habits, (m) => m.HealthConsistency),

  objetivos: from(goals, (m) => m.GoalList),
  objetivos_resumen: from(goals, (m) => m.GoalSummary),
  nuevo_objetivo: from(goals, (m) => m.NewGoal),
  revision_semanal: from(goals, (m) => m.WeeklyReview),

  fin_mes: from(finance, (m) => m.MonthPicker),
  fin_resumen: from(finance, (m) => m.MonthSummary),
  fin_nuevo: from(finance, (m) => m.NewTransactionBlock),
  fin_presupuesto: from(finance, (m) => m.BudgetBlock),
  fin_meses: from(finance, (m) => m.SixMonthsChart),
  fin_movimientos: from(finance, (m) => m.MonthTransactions),
  fin_periodicos: from(finance, (m) => m.RecurringBlock),
  fin_categorias: from(finance, (m) => m.CategoriesBlock),
  fin_importar: from(finance, (m) => m.ImportBlock),
};
