import { useEffect, useRef, useState } from 'react';
import type { BlockProps } from './index';

/**
 * Contenido de un bloque con cambios que se pintan al momento y se guardan detrás.
 * Mientras haya guardados en curso no se acepta lo que llega de fuera: si no, la respuesta
 * del primero de dos clics seguidos devolvería por un instante el estado anterior.
 */
export function useContent<C extends object>(block: BlockProps['block'], read: (raw: unknown) => C, onSave: BlockProps['onSave']) {
  const [content, setContent] = useState<C>(() => read(block.content));
  const pending = useRef(0);

  useEffect(() => {
    if (pending.current === 0) setContent(read(block.content));
  }, [block.content]);

  const commit = (next: C) => {
    setContent(next);
    pending.current++;
    void onSave({ ...next } as Record<string, unknown>).finally(() => {
      pending.current--;
    });
  };

  return [content, commit] as const;
}
