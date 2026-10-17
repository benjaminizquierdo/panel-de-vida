import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './ui';

/**
 * Hoja modal: sube desde abajo en el móvil y se centra en pantallas grandes.
 * Escape o tocar fuera la cierran; al abrir, el foco va al primer campo.
 */
export default function Sheet({ title, onClose, children, footer }: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
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
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  return createPortal(
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCloseRef.current()}>
      <section ref={ref} className="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
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
