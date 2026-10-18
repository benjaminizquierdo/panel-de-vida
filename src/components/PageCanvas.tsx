import { useCallback, useState, type ReactNode } from 'react';
import ReactGridLayout, { useContainerWidth, verticalCompactor, type Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import { blockKind, hasFixedHeight } from '../lib/blockKinds';
import { changes, readingOrder, type Rect } from '../lib/layout';
import type { Block } from '../lib/types';

/** Alto de una fila de la rejilla y separación entre bloques, en píxeles. */
export const ROW_HEIGHT = 12;
const GAP = 16;

/** Filas que necesita un bloque de `px` píxeles de alto. */
const rowsFor = (px: number) => Math.max(1, Math.ceil((px + GAP) / (ROW_HEIGHT + GAP)));

export type MeasureFn = ((px: number) => void) | undefined;
const DROPPING = '__dropping-elem__';

// Tipo de bloque que se está arrastrando desde el catálogo. Durante el arrastre el navegador
// no deja leer los datos del arrastre, así que el catálogo lo apunta aquí.
let dragging: string | null = null;
export const setDraggingKind = (type: string | null) => {
  dragging = type;
};

const rectOf = (b: Block): Rect => ({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h });

/**
 * Bloques de la página. En el ordenador, panel libre: en modo personalizar se arrastran por la
 * cabecera, se redimensionan por la esquina y se sueltan bloques nuevos desde el catálogo; los
 * bloques suben solos a rellenar huecos. En el móvil se apilan en orden de lectura.
 */
export default function PageCanvas({ blocks, desktop, editing, renderBlock, onLayout, onDropKind }: {
  blocks: Block[];
  desktop: boolean;
  editing: boolean;
  /** `measure`: en el panel del ordenador, función para que el bloque informe de su alto natural. */
  renderBlock: (block: Block, measure: MeasureFn) => ReactNode;
  /** Bloques que han cambiado de sitio o tamaño; `fixed`: el que el usuario ha estirado a mano. */
  onLayout: (changed: Rect[], fixed?: string) => void;
  /** Bloque del catálogo soltado en (x, y), y cómo quedan los demás. */
  onDropKind: (type: string, at: { x: number; y: number }, changed: Rect[]) => void;
}) {
  if (!desktop) {
    return (
      <div className="block-stack">
        {readingOrder(blocks).map((b) => (
          <div key={b.id} className="stack-cell">
            {renderBlock(b, undefined)}
          </div>
        ))}
      </div>
    );
  }
  return <Grid blocks={blocks} editing={editing} renderBlock={renderBlock} onLayout={onLayout} onDropKind={onDropKind} />;
}

function Grid({ blocks, editing, renderBlock, onLayout, onDropKind }: {
  blocks: Block[];
  editing: boolean;
  renderBlock: (block: Block, measure: MeasureFn) => ReactNode;
  onLayout: (changed: Rect[], fixed?: string) => void;
  onDropKind: (type: string, at: { x: number; y: number }, changed: Rect[]) => void;
}) {
  const { width, containerRef, mounted } = useContainerWidth();
  // Filas que ocupa el contenido de cada bloque de alto automático.
  const [natural, setNatural] = useState<Record<string, number>>({});
  const measure = useCallback(
    (id: string) => (px: number) => {
      const rows = rowsFor(px);
      setNatural((prev) => (prev[id] === rows ? prev : { ...prev, [id]: rows }));
    },
    [],
  );

  const auto = (b: Block) => !hasFixedHeight(blockKind(b.type), b.content);
  const layout = blocks.map((b) => {
    const kind = blockKind(b.type);
    const h = auto(b) ? (natural[b.id] ?? b.h) : b.h;
    return { i: b.id, x: b.x, y: b.y, w: b.w, h, minW: Math.min(kind?.minW ?? 2, b.w), minH: Math.min(kind?.minH ?? 2, h) };
  });

  // De los bloques de alto automático no se guarda el alto (es el de su contenido), solo la posición.
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const toRects = (l: Layout) =>
    l
      .filter((i) => i.i !== DROPPING)
      .map((i) => {
        const b = byId.get(i.i);
        return { id: i.i, x: i.x, y: i.y, w: i.w, h: b && auto(b) ? b.h : i.h };
      });
  const commit = (l: Layout) => onLayout(changes(blocks.map(rectOf), toRects(l)));

  return (
    <div ref={containerRef} className={`canvas ${editing ? 'is-editing' : ''}`}>
      {mounted && (
        <ReactGridLayout
          width={width}
          layout={layout}
          compactor={verticalCompactor}
          gridConfig={{ cols: 12, rowHeight: ROW_HEIGHT, margin: [GAP, GAP], containerPadding: [0, 0] }}
          dragConfig={{ enabled: editing, handle: '.block-handle', cancel: '.block-tools, .block-header-slot' }}
          resizeConfig={{ enabled: editing, handles: ['se', 'e', 's'] }}
          dropConfig={{
            enabled: editing,
            defaultItem: { w: 4, h: 5 },
            onDragOver: () => {
              const kind = dragging ? blockKind(dragging) : undefined;
              return kind ? { w: kind.w, h: kind.h } : false;
            },
          }}
          onDragStop={commit}
          onResizeStop={(l, before, after) => {
            // Estirar a mano el alto de un bloque automático lo deja con ese alto fijo.
            const stretched = before && after && before.h !== after.h ? after.i : undefined;
            const rects = toRects(l).map((r) => (r.id === stretched ? { ...r, h: Math.min(1000, after!.h) } : r));
            onLayout(changes(blocks.map(rectOf), rects), stretched);
          }}
          onDrop={(l, item) => {
            const type = dragging;
            setDraggingKind(null);
            if (type && item) onDropKind(type, { x: item.x, y: item.y }, changes(blocks.map(rectOf), toRects(l)));
          }}
        >
          {blocks.map((b) => (
            <div key={b.id} className="grid-cell">
              {renderBlock(b, auto(b) ? measure(b.id) : undefined)}
            </div>
          ))}
        </ReactGridLayout>
      )}
    </div>
  );
}
