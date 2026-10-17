// Fechas como cadenas locales 'YYYY-MM-DD' (igual que el tipo `date` de Postgres).

export const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const today = () => iso(new Date());

export const parseISO = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (s: string, n: number) => {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};

/** Lunes de la semana que contiene `s`. */
export const weekStart = (s = today()) => {
  const d = parseISO(s);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return iso(d);
};

export const monthKey = (s: string) => s.slice(0, 7);

export const addMonths = (key: string, n: number) => {
  const d = parseISO(`${key}-01`);
  d.setMonth(d.getMonth() + n);
  return monthKey(iso(d));
};

/** Los últimos `n` días terminando en `end`, del más antiguo al más reciente. */
export const lastDays = (n: number, end = today()) =>
  Array.from({ length: n }, (_, i) => addDays(end, i - (n - 1)));

export const fmtDay = (s: string) =>
  parseISO(s).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' });

export const fmtDate = (s: string) =>
  parseISO(s).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

export const fmtMonth = (key: string) =>
  parseISO(`${key}-01`).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

export const fmtMonthShort = (key: string) =>
  parseISO(`${key}-01`).toLocaleDateString('es-ES', { month: 'short' });

const eurFormat = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
export const eur = (n: number) => eurFormat.format(n);

const numFormat = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
export const num = (n: number) => numFormat.format(n);

/** Suma un campo numérico; Number() cubre el caso de que Postgres devuelva `numeric` como texto. */
export const sumBy = <T>(items: T[], pick: (item: T) => number | string | null) =>
  items.reduce((acc, item) => acc + (Number(pick(item)) || 0), 0);

/** Acepta "12,5" y "12.5". Devuelve null si no es un número. */
export const parseNum = (v: string): number | null => {
  if (v.trim() === '') return null;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** Días seguidos cumplidos hasta hoy (o hasta ayer si hoy aún no está marcado). */
export const streak = (dates: Set<string>, end = today()) => {
  let d = dates.has(end) ? end : addDays(end, -1);
  let n = 0;
  while (dates.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
};

export const pct = (value: number, total: number) =>
  total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;

export const greeting = () => {
  const h = new Date().getHours();
  return h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
};
