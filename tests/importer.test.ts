// Pruebas de la lectura de CSV y de la propuesta de categorías (src/lib/csv.ts e importer.ts).
// Uso: npm run test:importer

import { detectDelimiter, parseAmount, parseCsv, parseDateCell } from '../src/lib/csv.ts';
import { groupLabel, guessMapping, isTradeRepublic, readGeneric, readTradeRepublic, suggestCategory } from '../src/lib/importer.ts';
import type { FinanceCategory, ImportRule } from '../src/lib/types.ts';

let failures = 0;
const ok = (cond: unknown, msg: string) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) failures++;
};
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------- CSV

ok(detectDelimiter('a;b;c\n1;2;3') === ';' && detectDelimiter('"a,b";c;d') === ';' && detectDelimiter('a,b\n') === ',', 'detecta el separador (también con comas dentro de comillas)');
ok(
  eq(parseCsv('﻿"nombre","nota"\r\n"Ana","dijo ""hola"""\n"Luis","línea 1\nlínea 2"\n\n'), [
    ['nombre', 'nota'],
    ['Ana', 'dijo "hola"'],
    ['Luis', 'línea 1\nlínea 2'],
  ]),
  'parsea comillas escapadas, saltos de línea dentro de comillas, BOM y líneas en blanco',
);

const amounts: [string, number | null][] = [
  ['-12.50', -12.5],
  ['1.234,56', 1234.56],
  ['1,234.56', 1234.56],
  ['12,5 €', 12.5],
  ['(3,00)', -3],
  ['3,00-', -3],
  ['+1500', 1500],
  ['1.234.567', 1234567],
  ['EUR -0,99', -0.99],
  ['abc', null],
  ['', null],
];
for (const [raw, expected] of amounts) ok(parseAmount(raw) === expected, `parseAmount(«${raw}») = ${expected}`);

const dates: [string, string | null][] = [
  ['2026-10-17', '2026-10-17'],
  ['2026-10-17T09:30:00.000Z', '2026-10-17'],
  ['17/10/2026', '2026-10-17'],
  ['17.10.2026', '2026-10-17'],
  ['1-2-26', '2026-02-01'],
  ['31/02/2026', null],
  ['ayer', null],
];
for (const [raw, expected] of dates) ok(parseDateCell(raw) === expected, `parseDateCell(«${raw}») = ${expected}`);

// ---------------------------------------------------------------- Trade Republic (cabecera real del export)

const header =
  '"datetime","date","account_type","category","type","asset_class","name","symbol","shares","price","amount","fee","tax","currency","original_amount","original_currency","fx_rate","description","transaction_id","counterparty_name","counterparty_iban","payment_reference","mcc_code"';
const line = (o: Record<string, string>) =>
  header
    .split(',')
    .map((h) => `"${(o[h.replaceAll('"', '')] ?? '').replaceAll('"', '""')}"`)
    .join(',');
const trCsv = [
  header,
  line({ datetime: '2026-10-15T12:01:00Z', date: '2026-10-15', account_type: 'DEFAULT', category: 'CASH', type: 'CARD_TRANSACTION', amount: '-45.20', currency: 'EUR', description: 'MERCADONA C/ MAYOR', transaction_id: 'tr-1', counterparty_name: 'Mercadona', mcc_code: '5411' }),
  line({ datetime: '2026-10-14T20:00:00Z', date: '2026-10-14', category: 'CASH', type: 'CARD_TRANSACTION', amount: '-18.00', description: 'BAR EL SOL', transaction_id: 'tr-2', counterparty_name: 'Bar El Sol', mcc_code: '5812' }),
  line({ date: '2026-10-01', category: 'CASH', type: 'TRANSFER_INSTANT_INBOUND', amount: '1500.00', description: 'Nómina octubre', transaction_id: 'tr-3', counterparty_name: 'EMPRESA SL' }),
  line({ date: '2026-10-02', category: 'DELIVERY', type: 'BUY', asset_class: 'STOCK', name: 'Apple', symbol: 'US0378331005', shares: '2', price: '210.5', amount: '-421.00', fee: '-1.00', transaction_id: 'tr-4' }),
  line({ date: '2026-10-03', category: 'CASH', type: 'INTEREST_PAYMENT', amount: '3.12', description: 'Intereses', transaction_id: 'tr-5' }),
  line({ date: '2026-10-05', category: 'CASH', type: 'CARD_TRANSACTION', amount: '-9.99', description: 'NETFLIX.COM', transaction_id: 'tr-6', counterparty_name: 'Netflix', mcc_code: '4899' }),
  line({ date: 'fecha rota', amount: '-1', transaction_id: 'tr-7' }),
].join('\n');

const table = parseCsv(trCsv);
ok(isTradeRepublic(table[0]), 'reconoce el CSV de Trade Republic por su cabecera');
ok(!isTradeRepublic(['Fecha', 'Concepto', 'Importe']), 'no confunde otro CSV con Trade Republic');
const tr = readTradeRepublic(table);
ok(tr.rows.length === 6 && tr.errors.length === 1 && tr.errors[0].includes('Línea 8'), `lee 6 movimientos y avisa de la fila rota (${tr.errors[0]})`);
const byKey = Object.fromEntries(tr.rows.map((r) => [r.key, r]));
ok(byKey['tr-1'].amount === -45.2 && byKey['tr-1'].date === '2026-10-15' && byKey['tr-1'].text === 'Mercadona', 'usa transaction_id como clave, importe con signo y el comercio como nota');
ok(byKey['tr-4'].excludedByDefault && !byKey['tr-1'].excludedByDefault && !byKey['tr-3'].excludedByDefault, 'la compraventa de acciones queda fuera por defecto; el resto dentro');
ok(byKey['tr-5'].text === 'Intereses', 'sin contraparte usa la descripción');
ok(groupLabel('CARD_TRANSACTION') === 'Pagos con tarjeta' && groupLabel('TRANSFER_INSTANT_INBOUND') === 'Transferencias recibidas' && groupLabel('TRANSFER_INSTANT_OUTBOUND') === 'Transferencias enviadas' && groupLabel('BUY') === 'Compraventa de valores', 'traduce los tipos de operación');

// ---------------------------------------------------------------- Categorías propuestas

const cat = (id: string, name: string, type: 'gasto' | 'ingreso', parent_id: string | null = null, archived = false): FinanceCategory => ({
  id, name, type, parent_id, archived, icon: '', color: '#000000', sort_order: 1,
});
const cats = [
  cat('comida', 'Comida', 'gasto'),
  cat('super', 'Supermercado', 'gasto', 'comida'),
  cat('susc', 'Suscripciones', 'gasto'),
  cat('restaurantes', 'Restaurantes', 'gasto', 'comida', true), // archivada
  cat('nomina', 'Nómina', 'ingreso'),
];
const rules: ImportRule[] = [{ id: 'r1', pattern: 'empresa', category_id: 'nomina' }];

ok(suggestCategory(byKey['tr-1'], cats, []) === 'super', 'MCC 5411 → Supermercado (la más específica)');
ok(suggestCategory(byKey['tr-2'], cats, []) === 'comida', 'MCC 5812 con «Restaurantes» archivada → su categoría padre Comida');
ok(suggestCategory(byKey['tr-6'], cats, []) === 'susc', 'MCC 4899 → Suscripciones');
ok(suggestCategory(byKey['tr-3'], cats, rules) === 'nomina', 'una regla del usuario («empresa») asigna la nómina, sin distinguir mayúsculas');
ok(suggestCategory(byKey['tr-3'], cats, []) === null, 'sin regla ni MCC no hay propuesta');
ok(
  suggestCategory(byKey['tr-1'], cats, [{ id: 'r2', pattern: 'Mercadona', category_id: 'nomina' }]) === 'super',
  'una regla con categoría de otro tipo (ingreso) no se aplica a un gasto',
);
ok(
  suggestCategory(byKey['tr-1'], cats, [
    { id: 'r3', pattern: 'MERC', category_id: 'comida' },
    { id: 'r4', pattern: 'mercadona', category_id: 'susc' },
  ]) === 'susc',
  'gana la regla con el texto más largo',
);

// ---------------------------------------------------------------- CSV de otro banco

const bank = parseCsv('Fecha;Concepto;Importe;Saldo\n15/10/2026;COMPRA LIDL;-23,40;1.000,00\n15/10/2026;COMPRA LIDL;-23,40;976,60\n16/10/2026;BIZUM DE ANA;10,00;986,60\n');
const mapping = guessMapping(bank[0]);
ok(eq(mapping, { date: 0, amount: 2, description: 1, id: -1, invert: false }), `adivina las columnas de un CSV español (${JSON.stringify(mapping)})`);
const generic = readGeneric(bank, mapping);
ok(generic.rows.length === 3 && generic.rows[0].amount === -23.4 && generic.rows[2].amount === 10, 'lee importes con coma decimal y separador de miles');
ok(generic.rows[0].key !== generic.rows[1].key, 'dos movimientos idénticos el mismo día reciben claves distintas');
ok(readGeneric(bank, mapping).rows[1].key === generic.rows[1].key, 'la clave es estable: reimportar el mismo archivo da las mismas claves');
ok(readGeneric(bank, { ...mapping, invert: true }).rows[0].amount === 23.4, '«invertir signo» para bancos que exportan los gastos en positivo');

console.log(failures ? `\n${failures} comprobación(es) fallida(s)` : '\nTodas las comprobaciones pasan');
Deno.exit(failures ? 1 : 0);
