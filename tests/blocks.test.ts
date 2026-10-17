// Pruebas de los bloques de las sub-pestañas (src/lib/blocks.ts).
// Uso: npm run test:lib

import { isDone, linkHost, moveBy, nextSortOrder, normalizeUrl, readChecklist, readLinks, readNotes } from '../src/lib/blocks.ts';

let failures = 0;
const ok = (cond: unknown, msg: string) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) failures++;
};

// ---------------------------------------------------------------- Checklist con reinicio

// 2026-10-18 es domingo: su semana empieza el lunes 12.
const item = (done_on: string | null) => ({ id: 'a', text: 'Estirar', done_on });
ok(!isDone(item(null), 'nunca', '2026-10-18'), 'sin marcar no está hecho');
ok(isDone(item('2026-01-01'), 'nunca', '2026-10-18'), 'sin reinicio sigue hecho para siempre');
ok(isDone(item('2026-10-18'), 'diario', '2026-10-18'), 'diario: marcado hoy está hecho');
ok(!isDone(item('2026-10-17'), 'diario', '2026-10-18'), 'diario: marcado ayer ya no cuenta');
ok(isDone(item('2026-10-12'), 'semanal', '2026-10-18'), 'semanal: marcado el lunes sigue hecho el domingo');
ok(!isDone(item('2026-10-11'), 'semanal', '2026-10-12'), 'semanal: lo del domingo no cuenta el lunes siguiente');

// ---------------------------------------------------------------- Enlaces

const urls: [string, string | null][] = [
  ['example.com', 'https://example.com/'],
  ['  https://hevy.com/routine/1  ', 'https://hevy.com/routine/1'],
  ['http://wikipedia.org/wiki/Sentadilla', 'http://wikipedia.org/wiki/Sentadilla'],
  ['www.youtube.com/watch?v=abc', 'https://www.youtube.com/watch?v=abc'],
  ['javascript:alert(1)', null],
  ['JavaScript:alert(1)', null],
  ['data:text/html,<script>alert(1)</script>', null],
  ['ftp://example.com', null],
  ['hola', null],
  ['dos palabras.com', null],
  ['', null],
];
for (const [input, expected] of urls) {
  const got = normalizeUrl(input);
  ok(got === expected, `normalizeUrl(${JSON.stringify(input)}) = ${expected}${got !== expected ? ` (da ${got})` : ''}`);
}
ok(linkHost('https://www.youtube.com/watch?v=abc') === 'youtube.com', 'el dominio se muestra sin www');

// ---------------------------------------------------------------- Contenido tolerante

ok(readNotes(null).text === '' && readNotes({ text: 'hola' }).text === 'hola', 'notas: vacío o con texto');
const cl = readChecklist({ reset: 'raro', items: [{ id: '1', text: 'a', done_on: '2026-10-18' }, { id: 2, text: 'b' }, 'x'] });
ok(cl.reset === 'nunca' && cl.items.length === 1 && cl.items[0].done_on === '2026-10-18', 'checklist: descarta lo mal formado y usa «nunca» por defecto');
ok(readLinks({ links: [{ id: '1', url: 'https://a.com' }, { id: '2' }] }).links.length === 1, 'enlaces: descarta los que no tienen URL');
ok(readLinks({ links: [{ id: '1', url: 'https://a.com' }] }).links[0].title === '', 'enlaces: título vacío si falta');

// ---------------------------------------------------------------- Orden

const rows = [
  { id: 'a', sort_order: 0 },
  { id: 'b', sort_order: 1 },
  { id: 'c', sort_order: 2 },
];
ok(JSON.stringify(moveBy(rows, 'b', -1)) === JSON.stringify([{ id: 'b', sort_order: 0 }, { id: 'a', sort_order: 1 }]), 'subir b intercambia con a y solo guarda esos dos');
ok(JSON.stringify(moveBy(rows, 'b', 1)) === JSON.stringify([{ id: 'c', sort_order: 1 }, { id: 'b', sort_order: 2 }]), 'bajar b intercambia con c');
ok(moveBy(rows, 'a', -1).length === 0 && moveBy(rows, 'c', 1).length === 0, 'el primero no sube y el último no baja');
const tied = [
  { id: 'a', sort_order: 0 },
  { id: 'b', sort_order: 0 },
  { id: 'c', sort_order: 0 },
];
const fixed = moveBy(tied, 'c', -1);
const applied = tied.map((r) => ({ ...r, ...fixed.find((f) => f.id === r.id) })).sort((x, y) => x.sort_order - y.sort_order);
ok(applied.map((r) => r.id).join('') === 'acb', `con empates, c queda delante de b (${applied.map((r) => r.id).join('')})`);
ok(nextSortOrder(rows) === 3 && nextSortOrder([]) === 0, 'el siguiente orden va al final');

console.log(failures ? `\n${failures} comprobación(es) fallida(s)` : '\nTodas las comprobaciones pasan');
Deno.exit(failures ? 1 : 0);
