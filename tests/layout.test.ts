// Pruebas de la rejilla del panel libre (src/lib/layout.ts).
// Uso: npm run test:lib

import { bottom, changes, compact, createHeightTracker, moveInOrder, placeNew, readingOrder, type Rect } from '../src/lib/layout.ts';

let failures = 0;
const ok = (cond: unknown, msg: string) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) failures++;
};

const r = (id: string, x: number, y: number, w: number, h: number): Rect => ({ id, x, y, w, h });
const at = (items: Rect[], id: string) => {
  const it = items.find((i) => i.id === id)!;
  return `${it.x},${it.y}`;
};
const ids = (items: Rect[]) => readingOrder(items).map((i) => i.id).join('');
const overlapFree = (items: Rect[]) =>
  items.every((a, i) => items.every((b, j) => i === j || !(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h)));

// ---------------------------------------------------------------- Compactar

const holes = compact([r('a', 0, 3, 6, 2), r('b', 6, 10, 6, 2), r('c', 0, 8, 12, 2)]);
ok(at(holes, 'a') === '0,0' && at(holes, 'c') === '0,2', 'los bloques suben a rellenar los huecos de arriba');
ok(at(holes, 'b') === '6,4', 'sin adelantar a uno ancho que tenían encima');
ok(overlapFree(compact([r('a', 0, 0, 6, 4), r('b', 3, 1, 6, 2), r('c', 2, 2, 8, 3)])), 'tres bloques solapados quedan sin solaparse');
const outside = compact([r('a', 10, 0, 6, 0), r('b', -3, 0, 20, 2)]);
ok(outside.every((i) => i.x >= 0 && i.x + i.w <= 12 && i.h >= 1), 'los que se salían de la rejilla se ajustan a ella');
ok(at(compact([r('a', 0, 0, 6, 6), r('b', 0, 6, 12, 2), r('c', 0, 9, 6, 1)]), 'c') === '0,8', 'un bloque no salta por encima de otro que lo tapa');
ok(bottom(holes) === 6, 'bottom: primera fila libre');

// ---------------------------------------------------------------- Bloques nuevos

ok(JSON.stringify(placeNew([], 4, 5)) === '{"x":0,"y":0,"w":4,"h":5}', 'en una página vacía, arriba a la izquierda');
ok(JSON.stringify(placeNew([r('a', 0, 0, 6, 4)], 4, 3)) === '{"x":6,"y":0,"w":4,"h":3}', 'si cabe al lado, al lado');
ok(JSON.stringify(placeNew([r('a', 0, 0, 12, 4)], 4, 3)) === '{"x":0,"y":4,"w":4,"h":3}', 'si no, debajo de todo');
ok(placeNew([], 40, 2).w === 12, 'como mucho, el ancho de la rejilla');

// ---------------------------------------------------------------- Mover con flechas (móvil)

const row = [r('a', 0, 0, 4, 3), r('b', 4, 0, 4, 3), r('c', 8, 0, 4, 3)];
ok(ids(moveInOrder(row, 'c', -1)!) === 'acb', 'en una fila, subir intercambia con el de la izquierda');
ok(ids(moveInOrder(row, 'a', 1)!) === 'bac', 'bajar intercambia con el de la derecha');
ok(moveInOrder(row, 'a', -1) === null && moveInOrder(row, 'c', 1) === null, 'el primero no sube y el último no baja');
const stack = [r('a', 0, 0, 12, 2), r('b', 0, 2, 6, 4)];
const up = moveInOrder(stack, 'b', -1)!;
ok(ids(up) === 'ba' && overlapFree(up), 'en columna, el de abajo pasa arriba sin solaparse');
const column = [r('a', 0, 0, 6, 4), r('b', 6, 0, 6, 2), r('c', 6, 2, 6, 2)];
ok(ids(moveInOrder(column, 'c', -1)!) === 'acb', 'dos bloques apilados en la misma columna se intercambian');
// Finanzas: «Nuevo movimiento» (estrecho) baja por debajo de «Últimos 6 meses» (ancho), que está a su lado.
const finance = [r('mes', 0, 0, 12, 2), r('nuevo', 0, 2, 4, 18), r('meses', 4, 2, 8, 11), r('presu', 0, 20, 4, 21), r('movs', 4, 13, 8, 14)];
const down = moveInOrder(finance, 'nuevo', 1)!;
ok(down && ids(down).startsWith('mesmesesnuevo') && overlapFree(down), `un estrecho baja un puesto junto a uno ancho: ${down && ids(down)}`);
const blocked = [r('a', 0, 0, 6, 6), r('b', 6, 0, 6, 2), r('c', 6, 2, 6, 2), r('d', 0, 6, 12, 2)];
ok(moveInOrder(blocked, 'd', -1) === null, 'si con esos tamaños no se puede, lo dice (null) en vez de hacer otra cosa');

// ---------------------------------------------------------------- Cambios a guardar

const diff = changes([r('a', 0, 0, 6, 2), r('b', 6, 0, 6, 2)], [r('a', 0, 0, 6, 2), r('b', 0, 2, 6, 2)]);
ok(diff.length === 1 && diff[0].id === 'b' && diff[0].y === 2, 'solo se guardan los bloques que cambian');

// ---------------------------------------------------------------- Seguro contra bucles de altura

let clock = 0;
const toRows = (px: number) => Math.ceil(px / 10);
const tr = createHeightTracker(toRows, () => clock);
ok(tr.measure('a', 100) === 10 && tr.measure('a', 100) === null, 'la primera medida fija el alto; repetirla no cambia nada');
clock = 5000;
ok(tr.measure('a', 150) === 15 && tr.measure('a', 120) === 12, 'los cambios normales (más contenido, menos contenido) se aplican');
// Bucle: 15 ↔ 12 cada 50 ms (como una barra de desplazamiento que aparece y desaparece).
clock = 10000;
const seen: (number | null)[] = [];
for (let i = 0; i < 12; i++) {
  clock += 50;
  seen.push(tr.measure('b', i % 2 ? 120 : 150));
}
const applied = seen.filter((v) => v !== null);
ok(tr.isLocked('b') && applied.at(-1) === 15 && seen.slice(6).every((v) => v === null), `un bloque que va y viene se queda con el alto mayor y deja de cambiar (${JSON.stringify(seen)})`);
clock += 50;
ok(tr.measure('b', 300) === 30, 'aunque esté asegurado, si su contenido crece de verdad, crece');
ok(tr.measure('b', 120) === null, 'pero no vuelve a encoger hasta que cambia el ancho');
tr.reset();
ok(!tr.isLocked('b') && tr.measure('b', 120) === 12, 'al cambiar el ancho del panel se quita el seguro');
ok(!tr.isLocked('a'), 'los bloques que no van y vienen nunca se aseguran');
const tw = createHeightTracker(toRows, () => clock);
tw.setWidth(1000);
for (let i = 0; i < 6; i++) {
  clock += 50;
  tw.setWidth(i % 2 ? 1000 : 985);
  tw.measure('c', i % 2 ? 120 : 150);
}
ok(tw.isLocked('c'), 'los 15 px de una barra de desplazamiento que va y viene no quitan el seguro');
tw.setWidth(1300);
ok(!tw.isLocked('c'), 'cambiar el tamaño de la ventana sí');

console.log(failures ? `\n${failures} comprobación(es) fallida(s)` : '\nTodas las comprobaciones pasan');
Deno.exit(failures ? 1 : 0);
