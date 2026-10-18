import { Suspense, useLayoutEffect, useRef, useState } from 'react';
import { BLOCK_COMPONENTS } from '../blocks';
import { BlockHeaderContext } from '../blocks/header';
import { blockKind } from '../lib/blockKinds';
import type { Block } from '../lib/types';
import ErrorBoundary from './ErrorBoundary';
import { Empty, IconButton } from './ui';

/**
 * Un bloque de la página: su tarjeta (o nada, en los bloques sin marco) y, en modo personalizar,
 * el asa para arrastrarlo (en el ordenador) o las flechas para ordenarlo (en el móvil).
 */
export default function BlockFrame({ block, editing, desktop, onSave, onSettings, onRemove, onMove, onMeasure }: {
  block: Block;
  editing: boolean;
  desktop: boolean;
  /** Alto natural del bloque en píxeles (lo que ocupa con todo su contenido), cada vez que cambia. */
  onMeasure?: (px: number) => void;
  onSave: (content: Record<string, unknown>) => Promise<boolean>;
  onSettings: () => void;
  onRemove: () => void;
  /** Solo en el móvil: subir o bajar en el orden. undefined en la dirección en que no se puede. */
  onMove: { up?: () => void; down?: () => void };
}) {
  const kind = blockKind(block.type);
  const Component = BLOCK_COMPONENTS[block.type];
  const framed = kind?.frame !== false;
  const name = block.title || kind?.name || 'Bloque';
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const showHead = editing || (framed && !!block.title);

  // Alto natural = marco (bordes, cabecera, márgenes) + contenido sin recortar. No depende del
  // alto que le dé la rejilla, así que medir no provoca bucles.
  const frameRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef(onMeasure);
  measureRef.current = onMeasure;
  const measuring = !!onMeasure;
  useLayoutEffect(() => {
    const frame = frameRef.current;
    const body = bodyRef.current;
    const content = contentRef.current;
    if (!measuring || !frame || !body || !content) return;
    const measure = () => measureRef.current?.(frame.offsetHeight - body.clientHeight + content.offsetHeight);
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    observer.observe(frame);
    measure();
    return () => observer.disconnect();
  }, [measuring]);

  return (
    <section
      ref={frameRef}
      className={`block-frame ${framed ? 'card' : 'is-frameless'} ${editing ? 'is-editing' : ''} ${measuring ? '' : 'is-fixed'}`}
      aria-label={name}
    >
      {showHead && (
        <header className={`card-head block-head ${editing && desktop ? 'block-handle' : ''}`} title={editing && desktop ? 'Arrastra para mover el bloque' : undefined}>
          {editing && desktop && (
            <span className="drag-grip" aria-hidden>
              ⠿
            </span>
          )}
          <h2 className="block-title">
            {block.title || (
              <span className="muted">
                {kind?.icon} {kind?.name ?? block.type}
              </span>
            )}
          </h2>
          {/* Hueco para los controles propios del bloque (semana anterior/siguiente, % cumplido…). */}
          <div ref={setSlot} className="block-header-slot" />
          {editing && (
            <div className="row block-tools">
              {!desktop && (
                <>
                  <IconButton label={`Subir ${name}`} onClick={() => onMove.up?.()} disabled={!onMove.up}>
                    ↑
                  </IconButton>
                  <IconButton label={`Bajar ${name}`} onClick={() => onMove.down?.()} disabled={!onMove.down}>
                    ↓
                  </IconButton>
                </>
              )}
              <IconButton label={`Ajustes de ${name}`} onClick={onSettings}>
                ⚙
              </IconButton>
              <IconButton label={`Quitar ${name}`} onClick={onRemove} danger>
                ✕
              </IconButton>
            </div>
          )}
        </header>
      )}
      <BlockHeaderContext.Provider value={showHead ? slot : null}>
        <div ref={bodyRef} className="block-body">
          <div ref={contentRef} className="block-content">
          {Component ? (
            <ErrorBoundary scope={`el bloque «${name}»`}>
              <Suspense fallback={<Empty>Cargando…</Empty>}>
                <Component block={block} onSave={onSave} />
              </Suspense>
            </ErrorBoundary>
          ) : (
            <Empty>Este tipo de bloque («{block.type}») es de una versión más nueva de la app. Recarga la página para verlo.</Empty>
          )}
          </div>
        </div>
      </BlockHeaderContext.Provider>
    </section>
  );
}
