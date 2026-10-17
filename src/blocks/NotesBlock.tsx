import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { readNotes } from '../lib/blocks';
import type { BlockProps } from './index';

const SAVE_DELAY = 800;

/** Texto libre que se guarda solo: al dejar de escribir un momento, al salir del campo y al cerrar la pestaña. */
export default function NotesBlock({ block, onSave }: BlockProps) {
  const [text, setText] = useState(() => readNotes(block.content).text);
  const [status, setStatus] = useState<'saved' | 'pending' | 'saving' | 'error'>('saved');
  const area = useRef<HTMLTextAreaElement>(null);
  const latest = useRef(text);
  const saved = useRef(text);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const flush = async () => {
    clearTimeout(timer.current);
    const value = latest.current;
    if (value === saved.current) return;
    setStatus('saving');
    const ok = await onSaveRef.current({ text: value });
    if (ok) saved.current = value;
    setStatus(!ok ? 'error' : latest.current === value ? 'saved' : 'pending');
  };

  // Si el contenido cambia desde fuera (otra pestaña del navegador, el asistente…) y aquí no hay nada sin guardar.
  useEffect(() => {
    const incoming = readNotes(block.content).text;
    if (latest.current === saved.current && incoming !== saved.current) {
      latest.current = saved.current = incoming;
      setText(incoming);
    }
  }, [block.content]);

  // Al desmontar (cambiar de pestaña) se guarda lo pendiente.
  useEffect(
    () => () => {
      void flush();
    },
    [],
  );

  // Crece con el texto en lugar de mostrar una barra de scroll.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [text]);

  return (
    <div className="notes-block">
      <textarea
        ref={area}
        value={text}
        maxLength={20000}
        placeholder="Escribe aquí…"
        aria-label={block.title ? `Notas: ${block.title}` : 'Notas'}
        onChange={(e) => {
          setText(e.target.value);
          latest.current = e.target.value;
          setStatus('pending');
          clearTimeout(timer.current);
          timer.current = setTimeout(() => void flush(), SAVE_DELAY);
        }}
        onBlur={() => void flush()}
      />
      <span className="muted small notes-status" aria-live="polite">
        {status === 'saving' ? 'Guardando…' : status === 'pending' ? 'Sin guardar' : status === 'error' ? 'No se ha podido guardar' : 'Guardado'}
      </span>
    </div>
  );
}
