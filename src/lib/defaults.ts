import type { NewRow, TableName } from './types';

// Mantener sincronizado con la función seed_new_user() de supabase/schema.sql.

export const EXPENSE_CATEGORIES = [
  'Vivienda',
  'Comida',
  'Transporte',
  'Ocio',
  'Salud',
  'Suscripciones',
  'Ropa',
  'Otros',
];

export const INCOME_CATEGORIES = ['Nómina', 'Freelance', 'Regalos', 'Otros ingresos'];

export const PROJECT_COLORS = ['#4f46e5', '#0d9488', '#d97706', '#db2777', '#2563eb', '#65a30d'];

export const AREA_LABELS = {
  proyectos: 'Proyectos',
  salud: 'Salud',
  finanzas: 'Finanzas',
  personal: 'Personal',
} as const;

/** Datos con los que empieza cada cuenta nueva. */
export const SEED: { [T in TableName]?: NewRow<T>[] } = {
  habits: [
    { name: 'Beber 2 L de agua', icon: '💧', active: true },
    { name: 'Ejercicio', icon: '🏃', active: true },
    { name: 'Leer 20 min', icon: '📖', active: true },
    { name: 'Meditar', icon: '🧘', active: true },
    { name: 'Dormir antes de las 24:00', icon: '🌙', active: true },
  ],
  budgets: [
    { category: 'Vivienda', monthly_limit: 700 },
    { category: 'Comida', monthly_limit: 300 },
    { category: 'Transporte', monthly_limit: 100 },
    { category: 'Ocio', monthly_limit: 150 },
    { category: 'Salud', monthly_limit: 50 },
    { category: 'Suscripciones', monthly_limit: 40 },
    { category: 'Ropa', monthly_limit: 60 },
    { category: 'Otros', monthly_limit: 100 },
  ],
  goals: [
    { title: 'Fondo de emergencia', horizon: 'anual', area: 'finanzas', target: 3000, current: 0, unit: '€', due_date: null },
    { title: 'Leer 12 libros', horizon: 'anual', area: 'personal', target: 12, current: 0, unit: 'libros', due_date: null },
  ],
};
