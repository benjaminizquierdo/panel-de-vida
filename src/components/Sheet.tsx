import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './ui';

/** Hojas abiertas a la vez (para oscurecer el hueco de la barra de desplazamiento mientras haya alguna). */
let openSheets = 0;

/**
 * Hoja modal: sube desde abajo en el móvil y se centra en pantallas grandes.
 * Escape o tocar fuera la cierran; al abrir, el foco va al primer campo.
 */
export default function Sheet({ title, onClose, children, footer, wide }: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Más ancha en pantallas grandes (fichas con dos columnas). */
  wide?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  // onClose suele ser una función nueva en cada render: se lee de una ref para
  // que el efecto de apertura (foco, bloqueo de scroll) se ejecute una sola vez.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', onKey, true);
    const previous = document.activeElement as HTMLElement | null;
    (ref.current?.querySelector<HTMLElement>('input, select, textarea') ?? ref.current)?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    openSheets++;
    document.documentElement.classList.add('has-sheet');
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = overflow;
      // Puede quedar otra hoja abierta debajo (p. ej. una ficha abierta desde otra hoja).
      if (--openSheets === 0) document.documentElement.classList.remove('has-sheet');
      previous?.focus?.();
    };
  }, []);

  return createPortal(
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCloseRef.current()}>
      <section ref={ref} className={`sheet ${wide ? 'is-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <header className="sheet-head">
          <h2>{title}</h2>
          <IconButton label="Cerrar" onClick={() => onCloseRef.current()}>
            ✕
          </IconButton>
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <footer className="sheet-foot">{footer}</footer>}
      </section>
    </div>,
    document.body,
  );
}
