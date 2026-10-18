import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Hueco de la cabecera de la tarjeta del bloque, para poner ahí controles del propio bloque. */
export const BlockHeaderContext = createContext<HTMLElement | null>(null);

/** Pinta `children` en la cabecera de la tarjeta del bloque (p. ej. «← Esta semana →»). */
export function HeaderAction({ children }: { children: ReactNode }) {
  const slot = useContext(BlockHeaderContext);
  return slot ? createPortal(children, slot) : <div className="row between block-inline-action">{children}</div>;
}
