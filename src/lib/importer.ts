// Conversión de un CSV bancario en movimientos para la vista previa de importación.
// Funciones puras (sin React ni red) para poder probarlas: tests/importer.test.ts.

import { parseAmount, parseDateCell } from './csv';
import type { FinanceCategory, ImportRule, TxType } from './types';

export interface ImportRow {
  /** Identificador estable en el origen (external_id): evita duplicados al reimportar. */
  key: string;
  date: string;
  /** Con signo: negativo = gasto. */
  amount: number;
  /** Nota que se guardará en el movimiento. */
  text: string;
  /** Texto con el que se buscan y crean reglas de categoría. */
  merchant: string;
  /** Agrupación para incluir o excluir en bloque (en Trade Republic, el tipo de operación). */
  group: string;
  mcc: string | null;
  excludedByDefault: boolean;
}

export interface ReadResult {
  rows: ImportRow[];
  /** Filas que no se han podido leer, con el motivo. */
  errors: string[];
}

export const txType = (row: ImportRow): TxType => (row.amount < 0 ? 'gasto' : 'ingreso');

/** Normaliza el nombre de un comercio para compararlo: mayúsculas, sin acentos ni espacios repetidos. */
export const normalizeMerchant = (s: string) =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------- Trade Republic

const TR_REQUIRED = ['date', 'type', 'amount', 'transaction_id'];

export const isTradeRepublic = (header: string[]) => {
  const h = header.map((c) => c.trim().toLowerCase());
  return TR_REQUIRED.every((c) => h.includes(c)) && h.includes('account_type');
};

/** Nombre legible de un tipo de operación de Trade Republic (se conserva el original al lado). */
export function groupLabel(type: string): string {
  const t = type.toUpperCase();
  if (t.includes('CARD')) return 'Pagos con tarjeta';
  if (t.includes('INTEREST')) return 'Intereses';
  if (t.includes('DIVIDEND')) return 'Dividendos';
  if (t.includes('SAVEBACK') || t.includes('ROUND_UP') || t.includes('ROUNDUP')) return 'Saveback y redondeos';
  if (t.includes('TRANSFER') && /IN(BOUND)?\b|INCOMING|_IN_|DEPOSIT/.test(t)) return 'Transferencias recibidas';
  if (t.includes('TRANSFER') && /OUT(BOUND)?\b|OUTGOING|_OUT_|WITHDRAW/.test(t)) return 'Transferencias enviadas';
  if (t.includes('TRANSFER')) return 'Transferencias';
  if (/BUY|SELL|SAVINGS_PLAN|TRADE|ORDER/.test(t)) return 'Compraventa de valores';
  if (t.includes('FEE')) return 'Comisiones';
  if (t.includes('TAX')) return 'Impuestos';
  const text = type.replace(/_/g, ' ').toLowerCase().trim();
  return text ? text[0].toUpperCase() + text.slice(1) : 'Otros';
}

/**
 * Lee el export oficial de Trade Republic. Por defecto deja fuera la compraventa de
 * valores (categoría DELIVERY o filas con participaciones): no son gastos ni ingresos.
 */
export function readTradeRepublic(table: string[][]): ReadResult {
  const [header, ...body] = table;
  const col = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name);
  const idx = Object.fromEntries(
    ['datetime', 'date', 'category', 'type', 'name', 'shares', 'amount', 'description', 'transaction_id', 'counterparty_name', 'mcc_code'].map(
      (n) => [n, col(n)],
    ),
  ) as Record<string, number>;
  const get = (r: string[], name: string) => (idx[name] >= 0 ? (r[idx[name]] ?? '').trim() : '');

  const rows: ImportRow[] = [];
  const errors: string[] = [];
  body.forEach((r, i) => {
    const line = i + 2;
    const date = parseDateCell(get(r, 'date')) ?? parseDateCell(get(r, 'datetime'));
    const amount = parseAmount(get(r, 'amount'));
    if (!date) return errors.push(`Línea ${line}: fecha no válida («${get(r, 'date')}»)`);
    if (amount === null) return errors.push(`Línea ${line}: importe no válido («${get(r, 'amount')}»)`);

    const type = get(r, 'type') || get(r, 'category') || 'OTROS';
    const shares = parseAmount(get(r, 'shares'));
    const merchant = get(r, 'counterparty_name') || get(r, 'description') || get(r, 'name') || groupLabel(type);
    rows.push({
      key: get(r, 'transaction_id') || genericKey(date, amount, merchant, rows),
      date,
      amount,
      text: merchant,
      merchant,
      group: type,
      mcc: get(r, 'mcc_code') || null,
      excludedByDefault: amount === 0 || get(r, 'category').toUpperCase() === 'DELIVERY' || (shares !== null && shares !== 0),
    });
  });
  return { rows, errors };
}

// ---------------------------------------------------------------- CSV de cualquier banco

export interface Mapping {
  date: number;
  amount: number;
  description: number;
  /** Columna con el identificador del movimiento, si el banco lo da. */
  id: number;
  /** Para bancos que exportan los gastos en positivo. */
  invert: boolean;
}

const find = (header: string[], patterns: RegExp[]) => {
  const h = header.map((c) => normalizeMerchant(c));
  for (const p of patterns) {
    const i = h.findIndex((c) => p.test(c));
    if (i >= 0) return i;
  }
  return -1;
};

/** Primera suposición de qué columna es cada cosa, por el nombre de la cabecera. */
export function guessMapping(header: string[]): Mapping {
  return {
    date: find(header, [/^FECHA( VALOR| OPERACION)?$/, /FECHA/, /^DATE$/, /DATE/]),
    amount: find(header, [/^IMPORTE$/, /IMPORTE/, /CANTIDAD/, /^AMOUNT$/, /AMOUNT/, /^VALOR$/]),
    description: find(header, [/CONCEPTO/, /DESCRIPCION/, /DESCRIPTION/, /COMERCIO/, /DETALLE/, /MOVIMIENTO/, /^NAME$/]),
    id: find(header, [/^ID$/, /REFERENCIA/, /TRANSACTION.?ID/, /^REF/]),
    invert: false,
  };
}

/** Sin id del banco: fecha + importe + texto, y un contador para distinguir movimientos idénticos el mismo día. */
function genericKey(date: string, amount: number, text: string, previous: ImportRow[]) {
  const base = `${date}|${amount.toFixed(2)}|${normalizeMerchant(text).slice(0, 120)}`;
  const n = previous.filter((r) => r.key === base || r.key.startsWith(`${base}#`)).length;
  return n === 0 ? base : `${base}#${n + 1}`;
}

export function readGeneric(table: string[][], mapping: Mapping): ReadResult {
  const [, ...body] = table;
  const rows: ImportRow[] = [];
  const errors: string[] = [];
  body.forEach((r, i) => {
    const line = i + 2;
    const cell = (c: number) => (c >= 0 ? (r[c] ?? '').trim() : '');
    const date = parseDateCell(cell(mapping.date));
    const raw = parseAmount(cell(mapping.amount));
    if (!date) return errors.push(`Línea ${line}: fecha no válida («${cell(mapping.date)}»)`);
    if (raw === null) return errors.push(`Línea ${line}: importe no válido («${cell(mapping.amount)}»)`);
    const amount = mapping.invert ? -raw : raw;
    const text = cell(mapping.description) || 'Movimiento importado';
    rows.push({
      key: cell(mapping.id) || genericKey(date, amount, text, rows),
      date,
      amount,
      text,
      merchant: text,
      group: amount < 0 ? 'Gastos' : 'Ingresos',
      mcc: null,
      excludedByDefault: amount === 0,
    });
  });
  return { rows, errors };
}

// ---------------------------------------------------------------- Categoría propuesta

/**
 * Códigos MCC (tipo de comercio de los pagos con tarjeta) → nombres de categoría por
 * defecto, de la más específica a la más general. Si el usuario renombró o borró esas
 * categorías, simplemente no hay propuesta.
 */
const MCC_RULES: { codes?: number[]; range?: [number, number]; names: string[] }[] = [
  { codes: [5411, 5422, 5441, 5451, 5462, 5499], names: ['Supermercado', 'Comida'] },
  { codes: [5812, 5813, 5814], names: ['Restaurantes', 'Comida'] },
  { codes: [4111, 4112, 4121, 4131, 4784, 4789, 5541, 5542, 5552, 7523, 7538], names: ['Transporte'] },
  { range: [3000, 3299], names: ['Transporte'] }, // aerolíneas
  { codes: [5122, 5912, 8011, 8021, 8031, 8041, 8042, 8043, 8049, 8050, 8062, 8071, 8099], names: ['Salud'] },
  { codes: [5611, 5621, 5631, 5641, 5651, 5655, 5661, 5681, 5691, 5697, 5698, 5699], names: ['Ropa'] },
  { codes: [4814, 4899, 5815, 5816, 5817, 5818, 5968], names: ['Suscripciones'] },
  { codes: [5945, 7832, 7841, 7911, 7922, 7929, 7932, 7933, 7941, 7991, 7992, 7993, 7994, 7996, 7997, 7998, 7999], names: ['Ocio'] },
  { codes: [4900, 6513], names: ['Vivienda'] },
];

const mccNames = (mcc: string | null): string[] => {
  const code = Number(mcc);
  if (!mcc || !Number.isInteger(code)) return [];
  const rule = MCC_RULES.find(
    (r) => r.codes?.includes(code) || (r.range !== undefined && code >= r.range[0] && code <= r.range[1]),
  );
  return rule?.names ?? [];
};

/** Regla del usuario (el comercio contiene su texto) → código MCC → sin propuesta. Solo categorías activas del tipo correcto. */
export function suggestCategory(row: ImportRow, categories: FinanceCategory[], rules: ImportRule[]): string | null {
  const type = txType(row);
  const active = categories.filter((c) => c.type === type && !c.archived);
  const merchant = normalizeMerchant(row.merchant);
  // La regla con el texto más largo gana: «MERCADONA ONLINE» antes que «MERCADONA».
  const rule = rules
    .filter((r) => merchant.includes(normalizeMerchant(r.pattern)) && active.some((c) => c.id === r.category_id))
    .sort((a, b) => b.pattern.length - a.pattern.length)[0];
  if (rule) return rule.category_id;
  for (const name of mccNames(row.mcc)) {
    const match = active.find((c) => normalizeMerchant(c.name) === normalizeMerchant(name));
    if (match) return match.id;
  }
  return null;
}
