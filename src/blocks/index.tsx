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
const insights = () => import('./app/insights');
const time = () => import('./app/time');
const money = () => import('./app/money');
const projectViews = () => import('./app/projectViews');
const projectNotes = () => import('./app/projectNotes');
const projectCharts = () => import('./app/projectCharts');
const nutrition = () => import('./app/nutrition');
const foods = () => import('./app/foods');

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
  proyectos: from(projects, (m) => m.ProjectCards),
  tablero: from(projects, (m) => m.TaskBoard),
  foco_hoy: from(projects, (m) => m.FocusToday),
  proyecto_resumen: from(projects, (m) => m.ProjectSummary),
  proyecto_fases: from(projects, (m) => m.ProjectPhases),
  proyecto_cuenta_atras: from(projects, (m) => m.ProjectCountdown),
  proyecto_checklist: from(projects, (m) => m.ProjectChecklist),
  proyecto_temario: from(projectViews, (m) => m.Syllabus),
  proyecto_horas: from(projectViews, (m) => m.HoursLog),
  proyecto_racha: from(projectViews, (m) => m.ChallengeStreak),
  proyecto_valor: from(projectViews, (m) => m.ValueLog),
  proyecto_ideas: from(projectViews, (m) => m.Ideas),
  proyecto_referencias: from(projectViews, (m) => m.References),
  proyecto_recursos: from(projectViews, (m) => m.Resources),
  proyecto_presupuesto: from(projectViews, (m) => m.ProjectBudget),
  proyecto_notas: from(projectNotes, (m) => m.ProjectNotesBlock),
  grafico_avance: from(projectCharts, (m) => m.ProgressChart),
  grafico_tareas_semana: from(projectCharts, (m) => m.TasksPerWeekChart),
  grafico_horas: from(projectCharts, (m) => m.HoursChart),
  grafico_evolucion: from(projectCharts, (m) => m.EvolutionChart),
  grafico_proyectos: from(projectCharts, (m) => m.ProjectsDonut),

  nut_resumen: from(nutrition, (m) => m.MacrosToday),
  nut_diario: from(nutrition, (m) => m.FoodDiary),
  nut_buscador: from(foods, (m) => m.ProductSearch),
  nut_alimentos: from(foods, (m) => m.MyFoods),
  peso: from(nutrition, (m) => m.WeightLog),
  grafico_peso: from(nutrition, (m) => m.WeightChart),
  grafico_macros: from(nutrition, (m) => m.MacrosChart),
  agua: from(nutrition, (m) => m.WaterToday),
  actividad: from(nutrition, (m) => m.ActivityToday),

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

  agenda_hoy: from(time, (m) => m.TodayAgenda),
  progreso_anio: from(time, (m) => m.YearProgress),
  cuenta_atras: from(time, (m) => m.Countdown),
  calendario_mes: from(time, (m) => m.MonthCalendar),
  puntuacion_dia: from(insights, (m) => m.DayScore),
  correlaciones: from(insights, (m) => m.Correlations),
  cadena_habito: from(insights, (m) => m.HabitChain),
  anio_pixeles: from(insights, (m) => m.YearPixels),
  proximos_cargos: from(money, (m) => m.UpcomingCharges),
  suscripciones: from(money, (m) => m.Subscriptions),
  ritmo_gasto: from(money, (m) => m.SpendingPace),
  gasto_categorias: from(money, (m) => m.CategoryDonut),
  hucha: from(money, (m) => m.SavingsJar),
};
