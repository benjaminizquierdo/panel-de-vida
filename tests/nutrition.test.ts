// Pruebas de los cálculos de cuerpo y nutrición (src/lib/nutrition.ts).
// Uso: npm run test:lib

import {
  dayTotals,
  fromOffProduct,
  isValidBarcode,
  macroKcal,
  mealAt,
  packageGrams,
  portion,
  pricePer100,
  remaining,
  weightRate,
  weightSeries,
  weightStatus,
} from '../src/lib/nutrition.ts';
import type { FoodLog } from '../src/lib/types.ts';
import { cleanQuery, searchUrl } from '../supabase/functions/food-search/search.ts';
import { addDays } from '../src/lib/utils.ts';

let failures = 0;
const ok = (cond: unknown, msg: string) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) failures++;
};

const TODAY = '2026-10-18';
const yogur = { kcal: 97, protein: 9, carbs: 4, fat: 5, price: 1.35, price_grams: 500 };

// ---------------------------------------------------------------- Raciones y precios

ok(pricePer100(yogur) === 0.27, 'precio por 100 g: 1,35 € el envase de 500 g → 0,27 €');
ok(pricePer100({ price: 2, price_grams: null }) === null && pricePer100({ price: null, price_grams: 500 }) === null, 'sin precio o sin peso del envase, no hay precio por 100 g');
const p = portion(yogur, 125);
ok(p.kcal === 121.3 && p.protein === 11.3 && p.fat === 6.3 && p.cost === 0.34, `una ración de 125 g (${JSON.stringify(p)})`);
ok(portion({ ...yogur, price: null }, 125).cost === null, 'sin precio, la ración no tiene coste');
ok(portion({ kcal: '97' as unknown as number, protein: '9.5' as unknown as number, carbs: 0, fat: 0, price: '1.35' as unknown as number, price_grams: '500' as unknown as number }, 200).protein === 19, 'los números que llegan como texto de Postgres también valen');

ok(mealAt(8) === 'desayuno' && mealAt(14) === 'comida' && mealAt(18) === 'merienda' && mealAt(21.5) === 'cena' && mealAt(23.8) === 'otros', 'la comida que toca según la hora');

// ---------------------------------------------------------------- Totales del día

const log = (date: string, meal: FoodLog['meal'], kcal: number, protein: number, cost: number | null): FoodLog => ({ id: `${date}${meal}${kcal}`, date, meal, food_id: null, name: 'x', grams: 100, kcal, protein, carbs: 10, fat: 5, cost });
const logs = [log(TODAY, 'desayuno', 300, 20, 0.5), log(TODAY, 'comida', 750.4, 45.25, null), log(TODAY, 'comida', 200, 5, 1.2), log(addDays(TODAY, -1), 'cena', 900, 40, 2)];
const day = dayTotals(logs, TODAY);
ok(day.total.kcal === 1250 && day.total.protein === 70.3 && day.total.cost === 1.7 && day.total.unpriced === 1, `totales de hoy (${JSON.stringify(day.total)})`);
ok(day.byMeal.get('comida')!.kcal === 950 && day.byMeal.get('cena')!.kcal === 0, 'y por comida, sin mezclar días');
const left = remaining(day.total, { kcal: 2000, protein_g: 120, carbs_g: 220, fat_g: 65 });
ok(left.kcal === 750 && left.protein === 49.7, 'lo que queda para los objetivos');
ok(remaining({ ...day.total, kcal: 2300 }, { kcal: 2000, protein_g: 0, carbs_g: 0, fat_g: 0 }).kcal === -300, 'negativo si te pasas');
ok(macroKcal({ protein_g: 120, carbs_g: 220, fat_g: 65 }) === 1945, 'kcal que suman los macros objetivo');

// ---------------------------------------------------------------- Peso

// Bajando 0,5 kg por semana durante 4 semanas, con ruido de ±0,3 kg.
const noise = [0.3, -0.2, 0.1, -0.3, 0.2, 0, -0.1];
const health = Array.from({ length: 28 }, (_, i) => ({ date: addDays(TODAY, i - 27), weight: Math.round((82 - (0.5 / 7) * i + noise[i % 7]) * 10) / 10 }));
const series = weightSeries([...health, { date: addDays(TODAY, -40), weight: null }]);
ok(series.length === 28 && series[0].avg === series[0].weight, 'la serie solo usa días con peso; el primero es su propia media');
ok(Math.abs(series.at(-1)!.avg - (82 - (0.5 / 7) * 24)) < 0.2, `la media de 7 días suaviza el ruido (${series.at(-1)!.avg})`);
const rate = weightRate(series, TODAY);
ok(rate !== null && Math.abs(rate + 0.5) < 0.08, `ritmo ≈ −0,5 kg/semana (${rate})`);
ok(weightRate(series.slice(-2), TODAY) === null, 'con menos de 3 pesos no hay ritmo');

const st = weightStatus(series, { weight_target: 78, weight_target_date: addDays(TODAY, 56) }, TODAY);
ok(st.direction === 'bajar' && st.onWay === true && st.left !== null && st.left > 2 && st.left < 3, `objetivo 78 kg: bajar ~2,3 kg y vas bien (${JSON.stringify({ c: st.current, l: st.left })})`);
ok(st.eta !== null && st.eta > TODAY && st.eta < addDays(TODAY, 60), `llegada estimada al ritmo actual: ${st.eta}`);
ok(st.needed !== null && st.needed < 0 && Math.abs(st.needed + st.left! / 8) < 0.01, `ritmo necesario para llegar en 8 semanas (${st.needed} kg/sem)`);
ok(st.progress > 0.3 && st.progress < 0.7, `parte recorrida desde el primer peso (${st.progress.toFixed(2)})`);
const up = weightStatus(series, { weight_target: 85, weight_target_date: null }, TODAY);
ok(up.direction === 'subir' && up.onWay === false && up.eta === null, 'si el objetivo es subir y estás bajando, no hay fecha de llegada');
const done = weightStatus(series, { weight_target: series.at(-1)!.avg, weight_target_date: null }, TODAY);
ok(done.left === 0 && done.progress === 1, 'objetivo alcanzado');
ok(weightStatus([], { weight_target: 70, weight_target_date: null }, TODAY).current === null, 'sin pesos todavía');

// ---------------------------------------------------------------- Open Food Facts

ok(isValidBarcode('8480000123458') === false && isValidBarcode('4006381333931') && isValidBarcode('96385074') && !isValidBarcode('123'), 'dígito de control de EAN-13 y EAN-8');
const off = fromOffProduct({
  code: '8480000591869',
  product_name_es: 'Yogur griego natural',
  product_name: 'Greek yogurt',
  brands: 'Hacendado, Mercadona',
  serving_quantity: '125',
  image_front_small_url: 'https://images.openfoodfacts.org/x.jpg',
  nutriments: { 'energy-kcal_100g': 97.4, proteins_100g: 9, carbohydrates_100g: 4.1, fat_100g: 5, salt_100g: 0.1 },
});
ok(off && off.name === 'Yogur griego natural' && off.brand === 'Hacendado' && off.kcal === 97.4 && off.serving_g === 125 && off.barcode === '8480000591869', `producto de Open Food Facts en español (${JSON.stringify(off)})`);
const kj = fromOffProduct({ product_name: 'Pan', nutriments: { 'energy-kj_100g': 1046 }, image_url: 'http://inseguro.com/a.jpg' });
ok(kj && kj.kcal === 250 && kj.protein === 0 && kj.image_url === null && kj.barcode === null, 'energía solo en kJ → kcal; imagen sin https descartada');
ok(fromOffProduct({ nutriments: { 'energy-kcal_100g': 10 } }) === null && fromOffProduct({ product_name: 'Sin datos' }) === null, 'sin nombre o sin energía no sirve');
ok(fromOffProduct({ product_name: 'Raro', nutriments: { 'energy-kcal_100g': 5000, proteins_100g: 140 } })!.protein === 100, 'valores imposibles se recortan a lo que admite la base de datos');
ok(fromOffProduct({ product_name: 'Yogur', brands: ['Milbona', 'Lidl'], nutriments: { 'energy-kcal_100g': 60 } })!.brand === 'Milbona', 'las marcas del buscador llegan como lista');
ok(cleanQuery('  yogur   griego ') === 'yogur griego' && cleanQuery('a') === null && cleanQuery(42) === null, 'texto de búsqueda limpio (2-100 caracteres)');
ok(cleanQuery('leche" OR brands:(x)') === 'leche OR brands x', 'sin la sintaxis de consulta del buscador');
const url = new URL(searchUrl('yogur griego'));
ok(url.hostname === 'search.openfoodfacts.org' && url.searchParams.get('q') === 'yogur griego countries_tags:"en:spain"' && url.searchParams.get('langs') === 'es', 'la búsqueda pide productos de España en español');
ok(packageGrams('500 g') === 500 && packageGrams('1,5 kg') === 1500 && packageGrams('75 cl') === 750 && packageGrams('6 x') === null, 'peso del envase a partir del texto');

console.log(failures ? `\n${failures} comprobación(es) fallida(s)` : '\nTodas las comprobaciones pasan');
Deno.exit(failures ? 1 : 0);
