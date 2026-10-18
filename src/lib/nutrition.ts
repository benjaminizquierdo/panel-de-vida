// Cálculos de cuerpo y nutrición: raciones, precios, totales del día, tendencia del peso y lectura
// de los productos de Open Food Facts. Funciones puras para poder probarlas: tests/nutrition.test.ts.

import type { Food, FoodLog, HealthLog, Meal, NutritionGoals } from './types';
import { addDays, parseISO } from './utils';

export const MEALS: { id: Meal; label: string; icon: string }[] = [
  { id: 'desayuno', label: 'Desayuno', icon: '☕' },
  { id: 'comida', label: 'Comida', icon: '🍽️' },
  { id: 'merienda', label: 'Merienda', icon: '🍎' },
  { id: 'cena', label: 'Cena', icon: '🌙' },
  { id: 'otros', label: 'Otros', icon: '🍫' },
];

/** Objetivos de partida hasta que el usuario ponga los suyos. */
export const DEFAULT_GOALS: Omit<NutritionGoals, 'id'> = {
  kcal: 2000,
  protein_g: 120,
  carbs_g: 220,
  fat_g: 65,
  water_ml: 2000,
  steps: 8000,
  weight_target: null,
  weight_target_date: null,
};

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
/** `numeric` de Postgres llega como texto: se lee como número (null si no hay). */
export const numOrNull = (v: unknown) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** La comida que toca según la hora. */
export function mealAt(hour: number): Meal {
  if (hour < 11) return 'desayuno';
  if (hour < 16) return 'comida';
  if (hour < 19.5) return 'merienda';
  if (hour < 23.5) return 'cena';
  return 'otros';
}

/** Precio por 100 g, si se sabe. */
export function pricePer100(food: Pick<Food, 'price' | 'price_grams'>) {
  const price = numOrNull(food.price);
  const grams = numOrNull(food.price_grams);
  return price === null || !grams ? null : (price / grams) * 100;
}

/** Lo que aporta (y cuesta) una cantidad de un alimento. */
export function portion(food: Pick<Food, 'kcal' | 'protein' | 'carbs' | 'fat' | 'price' | 'price_grams'>, grams: number) {
  const k = grams / 100;
  const p100 = pricePer100(food);
  return {
    kcal: r1(Number(food.kcal) * k),
    protein: r1(Number(food.protein) * k),
    carbs: r1(Number(food.carbs) * k),
    fat: r1(Number(food.fat) * k),
    cost: p100 === null ? null : r2(p100 * k),
  };
}

export interface Totals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  cost: number;
  /** Entradas sin precio conocido (el coste del día es «al menos»). */
  unpriced: number;
}

const ZERO: Totals = { kcal: 0, protein: 0, carbs: 0, fat: 0, cost: 0, unpriced: 0 };

export function sumLogs(logs: Pick<FoodLog, 'kcal' | 'protein' | 'carbs' | 'fat' | 'cost'>[]): Totals {
  const t = logs.reduce<Totals>(
    (a, l) => ({
      kcal: a.kcal + Number(l.kcal),
      protein: a.protein + Number(l.protein),
      carbs: a.carbs + Number(l.carbs),
      fat: a.fat + Number(l.fat),
      cost: a.cost + (numOrNull(l.cost) ?? 0),
      unpriced: a.unpriced + (numOrNull(l.cost) === null ? 1 : 0),
    }),
    ZERO,
  );
  return { kcal: Math.round(t.kcal), protein: r1(t.protein), carbs: r1(t.carbs), fat: r1(t.fat), cost: r2(t.cost), unpriced: t.unpriced };
}

/** Totales del día y por comida. */
export function dayTotals(logs: FoodLog[], date: string) {
  const day = logs.filter((l) => l.date === date);
  return { total: sumLogs(day), byMeal: new Map(MEALS.map((m) => [m.id, sumLogs(day.filter((l) => l.meal === m.id))])) };
}

/** Lo que queda (negativo si te has pasado) de cada objetivo del día. */
export const remaining = (t: Totals, g: Pick<NutritionGoals, 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g'>) => ({
  kcal: Math.round(g.kcal - t.kcal),
  protein: r1(g.protein_g - t.protein),
  carbs: r1(g.carbs_g - t.carbs),
  fat: r1(g.fat_g - t.fat),
});

/** Kcal que suman los macros objetivo (4 kcal/g proteína e hidratos, 9 kcal/g grasa). */
export const macroKcal = (g: Pick<NutritionGoals, 'protein_g' | 'carbs_g' | 'fat_g'>) => g.protein_g * 4 + g.carbs_g * 4 + g.fat_g * 9;

/** Media diaria de los últimos `days` días que tienen algo apuntado (para el gráfico y la constancia). */
export function dailySeries(logs: FoodLog[], days: string[]) {
  const byDay = new Map<string, FoodLog[]>();
  for (const l of logs) byDay.set(l.date, [...(byDay.get(l.date) ?? []), l]);
  return days.map((date) => {
    const list = byDay.get(date);
    return { date, totals: list ? sumLogs(list) : null };
  });
}

// ---------------------------------------------------------------- Peso

export interface WeightPoint {
  date: string;
  weight: number;
  /** Media de los últimos 7 días con peso (hasta ese día). */
  avg: number;
}

/** Pesos registrados en orden, con su media de 7 días (suaviza el agua, la sal, la báscula…). */
export function weightSeries(health: Pick<HealthLog, 'date' | 'weight'>[]): WeightPoint[] {
  const points = health
    .map((h) => ({ date: h.date, weight: numOrNull(h.weight) }))
    .filter((p): p is { date: string; weight: number } => p.weight !== null && p.weight > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  return points.map((p) => {
    const since = addDays(p.date, -6);
    const win = points.filter((q) => q.date >= since && q.date <= p.date);
    return { ...p, avg: r1(win.reduce((a, q) => a + q.weight, 0) / win.length) };
  });
}

const dayNumber = (d: string) => Math.round(parseISO(d).getTime() / 86_400_000);

/**
 * Ritmo en kg por semana (regresión lineal de los pesos de los últimos `window` días). null si
 * hay menos de 3 pesos o abarcan menos de una semana.
 */
export function weightRate(points: WeightPoint[], end: string, window = 28): number | null {
  const since = addDays(end, -(window - 1));
  const pts = points.filter((p) => p.date >= since && p.date <= end);
  if (pts.length < 3 || dayNumber(pts.at(-1)!.date) - dayNumber(pts[0].date) < 7) return null;
  const xs = pts.map((p) => dayNumber(p.date));
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = pts.reduce((a, p) => a + p.weight, 0) / pts.length;
  let num = 0;
  let den = 0;
  pts.forEach((p, i) => {
    num += (xs[i] - mx) * (p.weight - my);
    den += (xs[i] - mx) ** 2;
  });
  return den === 0 ? null : r2((num / den) * 7);
}

export interface WeightStatus {
  /** Peso de referencia: la media de 7 días del último registro. */
  current: number | null;
  last: WeightPoint | null;
  target: number | null;
  /** Lo que falta (siempre positivo), 0 si ya has llegado. */
  left: number | null;
  /** 'bajar' o 'subir' hacia el objetivo. */
  direction: 'bajar' | 'subir' | null;
  /** kg por semana (negativo = bajando). */
  rate: number | null;
  /** ¿Vas en la dirección del objetivo? */
  onWay: boolean | null;
  /** Fecha estimada de llegada al ritmo actual. */
  eta: string | null;
  /** Ritmo necesario para llegar en la fecha objetivo (kg por semana). */
  needed: number | null;
  /** Parte recorrida desde el primer peso registrado (0-1). */
  progress: number;
}

export function weightStatus(points: WeightPoint[], goals: Pick<NutritionGoals, 'weight_target' | 'weight_target_date'> | undefined, end: string): WeightStatus {
  const last = points.at(-1) ?? null;
  const current = last?.avg ?? null;
  const target = numOrNull(goals?.weight_target);
  const rate = weightRate(points, end);
  if (current === null || target === null) {
    return { current, last, target, left: null, direction: null, rate, onWay: null, eta: null, needed: null, progress: 0 };
  }
  const direction = target < current ? 'bajar' : 'subir';
  const left = r1(Math.abs(current - target));
  const reached = left < 0.1;
  const onWay = rate === null ? null : reached ? true : direction === 'bajar' ? rate < 0 : rate > 0;
  const eta = !reached && onWay && rate ? addDays(end, Math.ceil((left / Math.abs(rate)) * 7)) : null;
  const due = goals?.weight_target_date;
  const weeks = due && due > end ? (dayNumber(due) - dayNumber(end)) / 7 : null;
  const needed = weeks && !reached ? r2((direction === 'bajar' ? -left : left) / weeks) : null;
  const start = points[0].avg;
  const span = Math.abs(start - target);
  const progress = reached ? 1 : span === 0 ? 0 : Math.min(1, Math.max(0, (Math.abs(start - target) - left) / span));
  return { current, last, target, left: reached ? 0 : left, direction, rate, onWay, eta, needed, progress };
}

// ---------------------------------------------------------------- Open Food Facts

/** ¿Es un código EAN-8, UPC-A, EAN-13 o GTIN-14 con su dígito de control correcto? */
export function isValidBarcode(code: string) {
  if (!/^(\d{8}|\d{12,14})$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((a, d, i) => a + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

const clamp = (n: number | null, max: number) => (n === null ? null : r2(Math.min(max, Math.max(0, n))));

/** Alimento listo para guardar a partir de un producto de Open Food Facts (null si no sirve). */
export function fromOffProduct(p: Record<string, unknown> | null | undefined): Omit<Food, 'id' | 'favorite' | 'price' | 'price_grams' | 'store'> | null {
  if (!p) return null;
  const n = (p.nutriments ?? {}) as Record<string, unknown>;
  const kcal = numOrNull(n['energy-kcal_100g']) ?? (numOrNull(n['energy-kj_100g']) ?? numOrNull(n['energy_100g']) ?? NaN) / 4.184;
  const name = String(p.product_name_es || p.product_name || p.generic_name_es || p.generic_name || '').trim();
  if (!name || !Number.isFinite(kcal)) return null;
  const image = String(p.image_front_small_url || p.image_small_url || p.image_url || '');
  const code = String(p.code ?? '');
  const serving = numOrNull(p.serving_quantity);
  return {
    name: name.slice(0, 200),
    // El buscador nuevo devuelve las marcas como lista; la API de productos, como texto.
    brand: (Array.isArray(p.brands) ? String(p.brands[0] ?? '') : String(p.brands ?? '').split(',')[0]).trim().slice(0, 200),
    barcode: /^[0-9]{6,14}$/.test(code) ? code : null,
    source: 'off',
    kcal: clamp(kcal, 1000)!,
    protein: clamp(numOrNull(n.proteins_100g), 100) ?? 0,
    carbs: clamp(numOrNull(n.carbohydrates_100g), 100) ?? 0,
    fat: clamp(numOrNull(n.fat_100g), 100) ?? 0,
    fiber: clamp(numOrNull(n.fiber_100g), 100),
    sugars: clamp(numOrNull(n.sugars_100g), 100),
    salt: clamp(numOrNull(n.salt_100g), 100),
    serving_g: serving && serving > 0 && serving <= 5000 ? r1(serving) : null,
    image_url: image.startsWith('https://') && image.length <= 1000 ? image : null,
  };
}

/** Peso del envase («500 g», «1 kg», «750 ml») para el precio, si se puede leer. */
export function packageGrams(quantity: unknown): number | null {
  const m = String(quantity ?? '').replace(',', '.').match(/(\d+(?:\.\d+)?)\s*(kg|g|l|cl|ml)\b/i);
  if (!m) return null;
  const v = Number(m[1]);
  const unit = m[2].toLowerCase();
  const g = unit === 'kg' || unit === 'l' ? v * 1000 : unit === 'cl' ? v * 10 : v;
  return g >= 1 && g <= 100000 ? r1(g) : null;
}
