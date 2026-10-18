import { useSyncExternalStore } from 'react';

/** ¿Cumple la pantalla la media query? Se actualiza al girar el móvil o cambiar el tamaño de la ventana. */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
  );
}

/** El panel libre (arrastrar y redimensionar) solo está en pantallas de ordenador. */
export const DESKTOP = '(min-width: 900px)';
