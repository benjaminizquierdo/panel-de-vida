import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { backend } from '../backend';
import { notifyDataChanged } from '../lib/events';
import { AssistantError, type TranscriptMessage, type User } from '../lib/types';
import { today } from '../lib/utils';
import { IconButton } from './ui';

interface Bubble {
  role: 'user' | 'assistant' | 'error';
  text: string;
  actions?: string[];
}

interface ChatState {
  /** Historial para la API; se reenvía tal cual, solo crece (o se recorta por delante). */
  transcript: TranscriptMessage[];
  /** Lo que se ve en pantalla. */
  bubbles: Bubble[];
  remaining: number | null;
}

const EMPTY: ChatState = { transcript: [], bubbles: [], remaining: null };

// La conversación vive en sessionStorage: sobrevive a recargas pero se olvida al cerrar la pestaña.
const chatKey = (userId: string) => `pv:chat:${userId}`;

const loadChat = (userId: string): ChatState => {
  try {
    const raw = sessionStorage.getItem(chatKey(userId));
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<ChatState>) } : EMPTY;
  } catch {
    return EMPTY;
  }
};

const saveChat = (userId: string, chat: ChatState) => {
  try {
    sessionStorage.setItem(chatKey(userId), JSON.stringify(chat));
  } catch {
    // Sin almacenamiento disponible: la conversación dura lo que la página.
  }
};

const SUGGESTIONS = [
  'Hoy he gastado 12 € en el almuerzo',
  'He dormido 7 horas y he corrido 30 minutos',
  '¿Cuánto llevo gastado este mes?',
  '¿Qué tareas tengo pendientes?',
];

export default function Assistant({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const [chat, setChat] = useState<ChatState>(() => loadChat(user.id));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const available = !!backend.assistant;

  useEffect(() => saveChat(user.id, chat), [user.id, chat]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open, busy]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [chat.bubbles.length, busy, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy || !backend.assistant) return;
    setInput('');
    setBusy(true);
    setChat((c) => ({ ...c, bubbles: [...c.bubbles, { role: 'user', text: message }] }));
    try {
      const res = await backend.assistant({ message, history: chat.transcript, today: today() });
      setChat((c) => ({
        transcript: [...c.transcript.slice(res.dropped), ...res.appended],
        bubbles: [...c.bubbles, { role: 'assistant', text: res.reply, actions: res.actions }],
        remaining: res.remaining,
      }));
      if (res.actions.length > 0) notifyDataChanged();
    } catch (e) {
      const err = e instanceof AssistantError ? e : new AssistantError(e instanceof Error ? e.message : String(e));
      setChat((c) => ({
        ...c,
        bubbles: [...c.bubbles, { role: 'error', text: err.message, actions: err.actions }],
        remaining: err.remaining ?? c.remaining,
      }));
      if (err.actions.length > 0) notifyDataChanged();
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  return (
    <>
      <button
        className={`fab ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="assistant-panel"
        // En móvil la etiqueta visible se oculta: el nombre accesible no puede depender de ella.
        aria-label={open ? 'Ocultar asistente' : 'Abrir asistente'}
      >
        <span aria-hidden>{open ? '✕' : '💬'}</span>
        <span className="fab-label" aria-hidden>
          {open ? 'Cerrar' : 'Asistente'}
        </span>
      </button>

      {open && (
        <section id="assistant-panel" className="assistant-panel" role="dialog" aria-label="Asistente">
          <header className="assistant-head">
            <div className="assistant-title">
              <strong>Asistente</strong>
              {chat.remaining !== null && <span className="muted small">Te quedan {chat.remaining} mensajes hoy</span>}
            </div>
            <div className="row">
              {chat.bubbles.length > 0 && (
                <button className="btn ghost sm" onClick={() => setChat({ ...EMPTY, remaining: chat.remaining })} disabled={busy}>
                  Nueva conversación
                </button>
              )}
              <IconButton label="Cerrar asistente" onClick={() => setOpen(false)}>
                ✕
              </IconButton>
            </div>
          </header>

          <div className="assistant-body" ref={listRef} aria-live="polite">
            {!available ? (
              <p className="empty">
                El asistente necesita el servidor (Supabase) y no está disponible en modo demo.
              </p>
            ) : chat.bubbles.length === 0 ? (
              <div className="assistant-intro">
                <p>Cuéntame qué has hecho o pregúntame por tus datos: lo apunto en tu panel por ti.</p>
                <div className="suggestions">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} className="chip" onClick={() => void send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              chat.bubbles.map((b, i) => (
                <div key={i} className={`bubble ${b.role}`}>
                  <p>{b.text}</p>
                  {b.actions && b.actions.length > 0 && (
                    <ul className="bubble-actions">
                      {b.actions.map((a, j) => (
                        <li key={j}>✓ {a}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))
            )}
            {busy && <div className="bubble assistant typing">Pensando…</div>}
          </div>

          {available && (
            <form
              className="assistant-input"
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
            >
              <textarea
                ref={inputRef}
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Escribe un mensaje… (Enter para enviar)"
                aria-label="Mensaje para el asistente"
                maxLength={2000}
                disabled={busy}
              />
              <button className="btn primary" disabled={busy || !input.trim()}>
                Enviar
              </button>
            </form>
          )}
        </section>
      )}
    </>
  );
}
