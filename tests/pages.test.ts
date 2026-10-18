// Pruebas del árbol de páginas (src/lib/pages.ts), del catálogo de bloques y de las
// categorías por defecto (src/lib/blockKinds.ts, src/lib/pageTemplates.ts).
// Uso: npm run test:lib

import { BLOCK_KINDS, blockKind, optionValue } from '../src/lib/blockKinds.ts';
import { compact } from '../src/lib/layout.ts';
import { DEFAULT_PAGES, flatTemplates, restorable, templateSeed } from '../src/lib/pageTemplates.ts';
import { ancestors, canMoveInto, initialPage, pageTree, placePage, subtree } from '../src/lib/pages.ts';
import type { UserTab } from '../src/lib/types.ts';

let failures = 0;
const ok = (cond: unknown, msg: string) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) failures++;
};

const page = (id: string, parent_id: string | null, sort_order = 0, template: string | null = null): UserTab => ({
  id,
  parent_id,
  sort_order,
  template,
  section: null,
  name: id,
  icon: '📄',
});

// Viajes > Japón > Itinerario; Casa; y una huérfana cuya madre se borró en otro dispositivo.
const pages = [
  page('casa', null, 1),
  page('viajes', null, 0),
  page('japon', 'viajes', 0),
  page('itinerario', 'japon', 0),
  page('roma', 'viajes', 1),
  page('huerfana', 'borrada', 5),
];

// ---------------------------------------------------------------- Árbol

const tree = pageTree(pages);
ok(tree.map((n) => n.page.id).join(',') === 'viajes,casa,huerfana', 'primer nivel en su orden; las huérfanas suben a primer nivel');
ok(tree[0].children.map((n) => n.page.id).join(',') === 'japon,roma', 'subpáginas en su orden');
ok(tree[0].children[0].children[0].page.id === 'itinerario', 'anidación de varios niveles');
ok(ancestors(pages, 'itinerario').map((p) => p.id).join('›') === 'viajes›japon', 'migas de pan: de la categoría principal a la madre');
ok(ancestors(pages, 'viajes').length === 0, 'una categoría principal no tiene migas');
ok([...subtree(pages, 'viajes')].sort().join(',') === 'itinerario,japon,roma,viajes', 'subtree: la página y todas sus subpáginas');
ok(!canMoveInto(pages, 'viajes', 'itinerario') && !canMoveInto(pages, 'viajes', 'viajes'), 'no se puede meter una página dentro de sí misma ni de una subpágina');
ok(canMoveInto(pages, 'itinerario', 'casa') && canMoveInto(pages, 'itinerario', null), 'sí dentro de otra rama o a primer nivel');
const cyclic = [page('x', 'y'), page('y', 'x')];
ok(pageTree(cyclic).length === 0 && ancestors(cyclic, 'x').length === 1, 'datos con un ciclo no cuelgan la app');

// ---------------------------------------------------------------- Mover páginas

const intoCasa = placePage(pages, 'roma', 'casa', 0);
ok(intoCasa.length === 1 && intoCasa[0].parent_id === 'casa' && intoCasa[0].sort_order === 0, 'mover dentro de otra página');
const first = placePage(pages, 'casa', null, 0);
ok(first.map((c) => `${c.id}:${c.sort_order}`).join(',') === 'casa:0,viajes:1', 'reordenar renumera solo las que cambian');
ok(placePage(pages, 'viajes', 'japon', 0).length === 0, 'mover a una subpágina propia no hace nada');

ok(initialPage(pages, 'roma')?.id === 'roma', 'abre la página recordada');
ok(initialPage(pages, 'borrada-hace-tiempo')?.id === 'viajes', 'si ya no existe, la primera');

// ---------------------------------------------------------------- Catálogo de bloques

ok(new Set(BLOCK_KINDS.map((k) => k.type)).size === BLOCK_KINDS.length, 'no hay dos tipos de bloque con el mismo nombre');
ok(BLOCK_KINDS.every((k) => /^[a-z][a-z0-9_]{0,39}$/.test(k.type)), 'los tipos cumplen el check de la base de datos');
ok(BLOCK_KINDS.every((k) => k.w >= 1 && k.w <= 12 && k.h >= 1 && (k.minW ?? 1) <= k.w && (k.minH ?? 1) <= k.h), 'tamaños iniciales dentro de la rejilla y de sus mínimos');
ok(optionValue(blockKind('objetivos'), { horizon: 'anual' }, 'horizon') === 'anual', 'lee un ajuste guardado');
ok(optionValue(blockKind('objetivos'), { horizon: 'hackeado' }, 'horizon') === 'todos', 'un ajuste inválido vuelve al primero');

// ---------------------------------------------------------------- Categorías por defecto

const all = flatTemplates();
ok(DEFAULT_PAGES.map((p) => p.name).join(',') === 'Inicio,Proyectos,Hábitos y salud,Objetivos,Finanzas', 'las cinco categorías de siempre, en su orden');
ok(new Set(all.map((t) => t.seed.template)).size === all.length && all.every((t) => t.seed.template), 'cada una tiene una plantilla distinta');
ok(all.every((t) => t.seed.name.trim().length >= 1 && t.seed.name.length <= 40), 'nombres que caben en la base de datos (1-40)');
ok(all.every((t) => t.seed.blocks.every((b) => blockKind(b.type))), 'todos sus bloques son de tipos conocidos');
ok(
  all.every((t) => {
    const rects = t.seed.blocks.map((b, i) => ({ id: String(i), x: b.x, y: b.y, w: b.w, h: b.h }));
    return JSON.stringify(compact(rects).sort((a, b) => Number(a.id) - Number(b.id))) === JSON.stringify(rects);
  }),
  'sus diseños ya están compactados y sin solapes (se ven igual que se guardan)',
);
ok(templateSeed('finanzas_importar')?.blocks[0].type === 'fin_importar', 'templateSeed encuentra también las subpáginas');

const seeded = all.map((t, i) => page(t.seed.template!, null, i, t.seed.template!));
ok(restorable(seeded).length === 0, 'con todas presentes no hay nada que restaurar');
const noFinance = seeded.filter((p) => !p.template!.startsWith('finanzas'));
const r1 = restorable(noFinance);
ok(r1.length === 1 && r1[0].seed.template === 'finanzas' && r1[0].seed.children?.length === 3 && r1[0].parentId === null, 'si falta Finanzas, se restaura entera con sus subpáginas');
const keptCategories = [...noFinance, page('mis-cats', null, 9, 'finanzas_categorias')];
ok(restorable(keptCategories)[0].seed.children?.map((c) => c.template).join(',') === 'finanzas_periodicos,finanzas_importar', 'sin duplicar las subpáginas que el usuario conservó');
const onlyImport = seeded.filter((p) => p.template !== 'finanzas_importar');
const r2 = restorable(onlyImport);
ok(r2.length === 1 && r2[0].seed.template === 'finanzas_importar' && r2[0].parentId === 'finanzas', 'una subpágina borrada vuelve dentro de su categoría');

console.log(failures ? `\n${failures} comprobación(es) fallida(s)` : '\nTodas las comprobaciones pasan');
Deno.exit(failures ? 1 : 0);
