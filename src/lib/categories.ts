import type { FinanceCategory, TxType } from './types';

export interface CategoryNode extends FinanceCategory {
  children: FinanceCategory[];
}

const byOrder = (a: FinanceCategory, b: FinanceCategory) =>
  a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'es');

/** Árbol de dos niveles de un tipo. Sin `includeArchived`, oculta las archivadas y las hijas de una archivada. */
export function categoryTree(all: FinanceCategory[], type: TxType, includeArchived = false): CategoryNode[] {
  const visible = (c: FinanceCategory) => includeArchived || !c.archived;
  return all
    .filter((c) => c.type === type && !c.parent_id && visible(c))
    .sort(byOrder)
    .map((parent) => ({
      ...parent,
      children: all.filter((c) => c.parent_id === parent.id && visible(c)).sort(byOrder),
    }));
}

/** Hermanas (mismo padre y tipo) en su orden de visualización. */
export const siblingsOf = (all: FinanceCategory[], cat: FinanceCategory) =>
  all.filter((c) => c.type === cat.type && c.parent_id === cat.parent_id).sort(byOrder);

/** Para agrupar gastos por categoría principal: el id de primer nivel de una categoría o subcategoría. */
export const topLevelId = (byId: Map<string, FinanceCategory>, id: string) => byId.get(id)?.parent_id ?? id;

/** «Comida › Supermercado» o «Comida». */
export function categoryPath(byId: Map<string, FinanceCategory>, id: string) {
  const cat = byId.get(id);
  if (!cat) return 'Sin categoría';
  const parent = cat.parent_id ? byId.get(cat.parent_id) : undefined;
  return parent ? `${parent.name} › ${cat.name}` : cat.name;
}

/** Opciones planas para un <select>, con las subcategorías sangradas bajo su categoría. */
export const categoryOptions = (all: FinanceCategory[], type: TxType) =>
  categoryTree(all, type).flatMap((p) => [
    { id: p.id, label: `${p.icon} ${p.name}` },
    ...p.children.map((c) => ({ id: c.id, label: `   ↳ ${c.icon} ${c.name}` })),
  ]);
