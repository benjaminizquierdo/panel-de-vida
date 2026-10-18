// Categorías por defecto: las páginas con las que empieza cada cuenta. Es la única definición:
// la app las envía a seed_default_pages() (007_disenador.sql) la primera vez que entra el
// usuario y las usa para «Restaurar». Probadas en tests/pages.test.ts.

import { blockKind } from './blockKinds';
import { compact } from './layout';
import type { UserTab } from './types';

export interface BlockSeed {
  type: string;
  title: string;
  content: Record<string, unknown>;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PageSeed {
  name: string;
  icon: string;
  template?: string;
  blocks: BlockSeed[];
  children?: PageSeed[];
}

/**
 * Bloque en la columna `x` con ancho `w` y el alto inicial de su tipo. `row` solo indica el orden:
 * layout() lo convierte en la posición real apilando los bloques sin huecos.
 */
const b = (type: string, x: number, row: number, w: number, extra: Partial<Pick<BlockSeed, 'title' | 'content'>> = {}): BlockSeed => {
  const kind = blockKind(type);
  return {
    type,
    title: kind?.frame === false ? '' : (kind?.name ?? ''),
    content: kind?.empty?.() ?? {},
    x,
    y: row,
    w,
    h: kind?.h ?? 6,
    ...extra,
  };
};

const layout = (blocks: BlockSeed[]): BlockSeed[] => {
  const placed = compact(blocks.map((block, i) => ({ ...block, id: String(i).padStart(3, '0') })));
  return placed.sort((a, c) => a.id.localeCompare(c.id)).map(({ id: _id, ...block }) => block);
};

export const DEFAULT_PAGES: PageSeed[] = [
  {
    template: 'inicio',
    name: 'Inicio',
    icon: '🏠',
    blocks: layout([
      b('saludo', 0, 0, 12),
      b('lo_mas_importante', 0, 1, 12, { title: '⭐ Lo más importante de hoy' }),
      b('resumen_hoy', 0, 2, 12),
      b('agenda_hoy', 0, 3, 6),
      b('puntuacion_dia', 6, 3, 3),
      b('progreso_anio', 9, 3, 3),
      b('habitos_hoy', 0, 4, 6),
      b('proyectos_activos', 6, 4, 6),
      b('objetivos_resumen', 0, 5, 6),
      b('proximas_fechas', 6, 5, 6),
    ]),
  },
  {
    template: 'proyectos',
    name: 'Proyectos',
    icon: '📋',
    blocks: layout([b('proyectos', 0, 0, 4), b('tablero', 4, 0, 8)]),
  },
  {
    template: 'habitos',
    name: 'Hábitos y salud',
    icon: '💪',
    blocks: layout([
      b('habitos_semana', 0, 0, 12),
      b('registro_salud', 0, 1, 6),
      b('salud_medias', 6, 1, 6),
      b('grafico_sueno', 6, 2, 6),
      b('grafico_ejercicio', 6, 3, 6),
      b('constancia_salud', 0, 4, 6),
      b('correlaciones', 0, 5, 6),
      b('anio_pixeles', 0, 6, 12),
    ]),
  },
  {
    template: 'objetivos',
    name: 'Objetivos',
    icon: '🎯',
    blocks: layout([
      b('objetivos', 0, 0, 8, { title: 'Objetivos anuales', content: { horizon: 'anual' } }),
      b('nuevo_objetivo', 8, 0, 4),
      b('hucha', 8, 1, 4),
      b('objetivos', 0, 1, 8, { title: 'Objetivos trimestrales', content: { horizon: 'trimestral' } }),
      b('revision_semanal', 0, 2, 12),
    ]),
  },
  {
    template: 'finanzas',
    name: 'Finanzas',
    icon: '💶',
    blocks: layout([
      b('fin_mes', 0, 0, 12),
      b('fin_resumen', 0, 1, 12),
      b('ritmo_gasto', 0, 2, 4),
      b('gasto_categorias', 4, 2, 4),
      b('proximos_cargos', 8, 2, 4),
      b('fin_nuevo', 0, 3, 4),
      b('fin_meses', 4, 3, 8),
      b('fin_presupuesto', 0, 4, 4),
      b('fin_movimientos', 4, 4, 8),
    ]),
    children: [
      { template: 'finanzas_periodicos', name: 'Periódicos', icon: '🔁', blocks: layout([b('suscripciones', 0, 0, 4), b('fin_periodicos', 4, 0, 8)]) },
      { template: 'finanzas_categorias', name: 'Categorías', icon: '🏷️', blocks: layout([b('fin_categorias', 0, 0, 12)]) },
      { template: 'finanzas_importar', name: 'Importación movimientos bancarios', icon: '🏦', blocks: layout([b('fin_importar', 0, 0, 12)]) },
    ],
  },
];

/** Todas las categorías por defecto, con la plantilla de su madre (null las de primer nivel). */
export function flatTemplates(seeds = DEFAULT_PAGES, parent: string | null = null): { seed: PageSeed; parent: string | null }[] {
  return seeds.flatMap((seed) => [{ seed, parent }, ...flatTemplates(seed.children ?? [], seed.template ?? null)]);
}

export interface Restorable {
  /** La página a restaurar, solo con las subpáginas por defecto que también faltan. */
  seed: PageSeed;
  /** Dónde va: la página de su categoría madre si existe; si no, primer nivel. */
  parentId: string | null;
}

/**
 * Categorías por defecto que el usuario ha borrado y puede recuperar. Si falta una madre, sus
 * hijas que faltan van dentro de ella y no aparecen sueltas.
 */
export function restorable(pages: UserTab[], seeds = DEFAULT_PAGES): Restorable[] {
  const present = new Map(pages.filter((p) => p.template).map((p) => [p.template!, p.id]));
  const missingTree = (seed: PageSeed): PageSeed => ({
    ...seed,
    children: (seed.children ?? []).filter((c) => !c.template || !present.has(c.template)).map(missingTree),
  });
  const out: Restorable[] = [];
  const walk = (list: PageSeed[], parentTemplate: string | null) => {
    for (const seed of list) {
      if (seed.template && !present.has(seed.template)) {
        out.push({ seed: missingTree(seed), parentId: parentTemplate ? (present.get(parentTemplate) ?? null) : null });
      } else {
        walk(seed.children ?? [], seed.template ?? null);
      }
    }
  };
  walk(seeds, null);
  return out;
}

/** La versión original de una categoría por defecto (para «Restablecer el diseño original»). */
export const templateSeed = (template: string) => flatTemplates().find((t) => t.seed.template === template)?.seed;
