import type { NewRow, TableName, TxType } from './types';

// Mantener sincronizado con supabase/migrations: create_default_finance_categories() y seed_new_user().

export const PROJECT_COLORS = ['#4f46e5', '#0d9488', '#d97706', '#db2777', '#2563eb', '#65a30d'];

export const CATEGORY_COLORS = [
  '#6366f1', '#0ea5e9', '#0d9488', '#10b981', '#16a34a', '#65a30d', '#f59e0b',
  '#f97316', '#ef4444', '#ec4899', '#db2777', '#8b5cf6', '#64748b',
];

export const CATEGORY_ICONS = [
  '🏠', '🍽️', '🛒', '🍴', '☕', '🚌', '🚗', '⛽', '✈️', '🎉', '🎬', '🎮', '📚', '💊', '🏥', '🏋️',
  '📺', '📱', '💡', '👕', '🐶', '👶', '🎁', '💼', '💻', '💰', '📈', '🏦', '🧾', '📦', '➕', '🏷️',
];

export const AREA_LABELS = {
  proyectos: 'Proyectos',
  salud: 'Salud',
  finanzas: 'Finanzas',
  personal: 'Personal',
} as const;

interface DefaultCategory {
  type: TxType;
  name: string;
  icon: string;
  color: string;
  budget?: number;
  children?: { name: string; icon: string }[];
}

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { type: 'gasto', name: 'Vivienda', icon: '🏠', color: '#6366f1', budget: 700 },
  {
    type: 'gasto',
    name: 'Comida',
    icon: '🍽️',
    color: '#f59e0b',
    budget: 300,
    children: [
      { name: 'Supermercado', icon: '🛒' },
      { name: 'Restaurantes', icon: '🍴' },
    ],
  },
  { type: 'gasto', name: 'Transporte', icon: '🚌', color: '#0ea5e9', budget: 100 },
  { type: 'gasto', name: 'Ocio', icon: '🎉', color: '#ec4899', budget: 150 },
  { type: 'gasto', name: 'Salud', icon: '💊', color: '#10b981', budget: 50 },
  { type: 'gasto', name: 'Suscripciones', icon: '📺', color: '#8b5cf6', budget: 40 },
  { type: 'gasto', name: 'Ropa', icon: '👕', color: '#f97316', budget: 60 },
  { type: 'gasto', name: 'Otros', icon: '📦', color: '#64748b', budget: 100 },
  { type: 'ingreso', name: 'Nómina', icon: '💼', color: '#16a34a' },
  { type: 'ingreso', name: 'Freelance', icon: '💻', color: '#0d9488' },
  { type: 'ingreso', name: 'Regalos', icon: '🎁', color: '#db2777' },
  { type: 'ingreso', name: 'Otros ingresos', icon: '➕', color: '#64748b' },
];

/** Fila inicial; `id` permite que otras filas del mismo alta la referencien. */
export type SeedRow<T extends TableName> = NewRow<T> & { id?: string };

/** Categorías por defecto (con ids nuevos) y sus presupuestos. */
export function defaultFinanceRows() {
  const categories: SeedRow<'finance_categories'>[] = [];
  const budgets: SeedRow<'budgets'>[] = [];
  const order: Record<TxType, number> = { gasto: 0, ingreso: 0 };
  for (const c of DEFAULT_CATEGORIES) {
    const id = crypto.randomUUID();
    categories.push({ id, parent_id: null, type: c.type, name: c.name, icon: c.icon, color: c.color, sort_order: ++order[c.type], archived: false });
    c.children?.forEach((child, i) =>
      categories.push({
        id: crypto.randomUUID(),
        parent_id: id,
        type: c.type,
        name: child.name,
        icon: child.icon,
        color: c.color,
        sort_order: i + 1,
        archived: false,
      }),
    );
    if (c.budget) budgets.push({ category_id: id, monthly_limit: c.budget });
  }
  return { categories, budgets };
}

/** Datos con los que empieza cada cuenta nueva en modo demo (en Supabase lo hace seed_new_user()). */
export function seedData(): { [T in TableName]?: SeedRow<T>[] } {
  const { categories, budgets } = defaultFinanceRows();
  return {
    habits: [
      { name: 'Beber 2 L de agua', icon: '💧', active: true },
      { name: 'Ejercicio', icon: '🏃', active: true },
      { name: 'Leer 20 min', icon: '📖', active: true },
      { name: 'Meditar', icon: '🧘', active: true },
      { name: 'Dormir antes de las 24:00', icon: '🌙', active: true },
    ],
    finance_categories: categories,
    budgets,
    goals: [
      { title: 'Fondo de emergencia', horizon: 'anual', area: 'finanzas', target: 3000, current: 0, unit: '€', due_date: null },
      { title: 'Leer 12 libros', horizon: 'anual', area: 'personal', target: 12, current: 0, unit: 'libros', due_date: null },
    ],
  };
}
