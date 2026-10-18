import { useEffect, useRef, useState, type FormEvent } from 'react';
import { backend } from '../backend';
import { MAX_DEMO_FILE_BYTES, MAX_FILE_BYTES } from '../backend/types';
import { linkHost, normalizeUrl } from '../lib/blocks';
import { useUser } from '../lib/pageContext';
import { byOrder, dayOf } from '../lib/projects';
import { toast } from '../lib/toast';
import { fmtDate } from '../lib/utils';
import { confirmDelete, Empty, IconButton } from './ui';

// Notas, enlaces y documentos: los de un proyecto (pestaña «Notas y adjuntos») y los de una tarea
// (su ficha). Cada sitio guarda los suyos en su tabla; este componente solo los pinta y edita.

export const maxFileBytes = () => (backend.mode === 'local' ? MAX_DEMO_FILE_BYTES : MAX_FILE_BYTES);

/** Tamaño legible: 532 KB, 2,4 MB. */
export const fileSize = (bytes: number | null) =>
  bytes === null ? '' : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB`;

/** Ruta del archivo en el almacén: siempre dentro de la carpeta del usuario. */
export const filePath = (userId: string, folder: string, name: string) =>
  `${userId}/${folder}/${crypto.randomUUID()}-${name.normalize('NFD').replace(/[^\w.-]+/g, '_').slice(-100)}`;

/** Sube un archivo a la carpeta del usuario. Devuelve los datos para guardarlo, o null si falla (ya avisado). */
export async function uploadFile(userId: string, folder: string, file: File) {
  if (file.size > maxFileBytes()) {
    toast(`«${file.name}» ocupa ${fileSize(file.size)}: como mucho ${fileSize(maxFileBytes())}`, 'error');
    return null;
  }
  const path = filePath(userId, folder, file.name);
  try {
    await backend.uploadFile(path, file);
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e), 'error');
    return null;
  }
  return { file_path: path, file_size: file.size, file_type: file.type.slice(0, 200) };
}

/** Abre un adjunto en otra pestaña (la pestaña se abre antes de pedir la dirección para que el navegador no la bloquee). */
export async function openFile(path: string) {
  const tab = window.open('', '_blank');
  try {
    const url = await backend.fileUrl(path);
    if (tab) tab.location.href = url;
    else window.location.assign(url);
  } catch (e) {
    tab?.close();
    toast(e instanceof Error ? e.message : String(e), 'error');
  }
}

/** Direcciones temporales de los adjuntos ya pedidas (duran 1 h; se renuevan antes). */
const urlCache = new Map<string, { url: string; at: number }>();

/** Dirección para mostrar un adjunto (p. ej. una imagen), o null mientras llega. */
export function useFileUrl(path: string | null) {
  const cached = path ? urlCache.get(path) : undefined;
  const [url, setUrl] = useState<string | null>(cached && Date.now() - cached.at < 45 * 60_000 ? cached.url : null);
  useEffect(() => {
    if (!path || url) return;
    let alive = true;
    backend
      .fileUrl(path)
      .then((u) => {
        urlCache.set(path, { url: u, at: Date.now() });
        if (alive) setUrl(u);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [path, url]);
  return url;
}

const fileIcon = (type: string) => (type.startsWith('image/') ? '🖼️' : type === 'application/pdf' ? '📕' : type.includes('sheet') || type.includes('excel') || type.includes('csv') ? '📊' : '📄');

/** Lo que tienen en común los elementos de proyecto y de tarea. */
export interface Attachment {
  id: string;
  kind: string;
  title: string;
  body: string;
  url: string | null;
  file_path: string | null;
  file_size: number | null;
  file_type: string;
  sort_order: number;
  created_at?: string;
}

export type NewAttachment = Omit<Attachment, 'id' | 'created_at'>;

export interface AttachmentStore {
  /** Los elementos de este proyecto o tarea. */
  items: Attachment[];
  add: (item: NewAttachment) => Promise<unknown>;
  update: (id: string, patch: { body: string }) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
}

const MAX_ITEMS = 200;

/** Notas, enlaces y documentos. `folder` es la carpeta de sus archivos dentro de la del usuario. */
export default function Attachments({ store, folder, notePlaceholder, compact }: {
  store: AttachmentStore;
  folder: string;
  notePlaceholder: string;
  /** En una columna (dentro de la ficha de una tarea). */
  compact?: boolean;
}) {
  const user = useUser();
  const own = store.items;
  const notes = own.filter((i) => i.kind === 'nota').sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  const links = own.filter((i) => i.kind === 'enlace').sort(byOrder);
  const files = own.filter((i) => i.kind === 'archivo').sort(byOrder);
  const full = own.length >= MAX_ITEMS;

  const [note, setNote] = useState('');
  const [url, setUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const base: NewAttachment = { kind: '', title: '', body: '', url: null, file_path: null, file_size: null, file_type: '', sort_order: 0 };
  const nextOrder = own.reduce((m, i) => Math.max(m, i.sort_order + 1), 0);
  const tooMany = () => toast(`Como mucho ${MAX_ITEMS} notas, enlaces y documentos`, 'error');

  const addNote = async (e: FormEvent) => {
    e.preventDefault();
    if (!note.trim()) return;
    if (full) return tooMany();
    if (await store.add({ ...base, kind: 'nota', body: note.trim().slice(0, 20000), sort_order: nextOrder })) setNote('');
  };

  const addLink = async (e: FormEvent) => {
    e.preventDefault();
    const href = normalizeUrl(url);
    if (!href) return toast('Escribe una dirección web válida, por ejemplo drive.google.com/…', 'error');
    if (full) return tooMany();
    if (await store.add({ ...base, kind: 'enlace', url: href, title: linkTitle.trim().slice(0, 200), sort_order: nextOrder })) {
      setUrl('');
      setLinkTitle('');
    }
  };

  const addFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true);
    let order = nextOrder;
    for (const file of [...list]) {
      if (own.length + order - nextOrder >= MAX_ITEMS) {
        tooMany();
        break;
      }
      const stored = await uploadFile(user.id, folder, file);
      if (!stored) continue;
      const created = await store.add({ ...base, kind: 'archivo', title: file.name.slice(0, 500), sort_order: order++, ...stored });
      // Si no se ha podido guardar el elemento, el archivo no se queda huérfano.
      if (!created) void backend.removeFiles([stored.file_path]).catch(() => {});
      else toast(`«${file.name}» subido`);
    }
    setUploading(false);
    if (fileInput.current) fileInput.current.value = '';
  };

  const removeFile = async (f: Attachment) => {
    if (!confirmDelete(`el archivo «${f.title}»`)) return;
    if (await store.remove(f.id)) void backend.removeFiles([f.file_path!]).catch(() => {});
  };

  return (
    <div className={`project-notes ${compact ? 'is-compact' : ''}`}>
      <section className="stack">
        <h3 className="section-title">📝 Notas</h3>
        <form className="stack" onSubmit={addNote}>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={notePlaceholder} rows={compact ? 2 : 3} maxLength={20000} aria-label="Nueva nota" />
          <div className="row">
            <button className="btn ghost sm" disabled={!note.trim()}>
              Guardar nota
            </button>
          </div>
        </form>
        {notes.length === 0 ? <Empty>Sin notas todavía.</Empty> : <ul className="note-list">{notes.map((n) => <NoteItem key={n.id} note={n} store={store} />)}</ul>}
      </section>

      <section className="stack">
        <h3 className="section-title">🔗 Enlaces</h3>
        {links.length > 0 && (
          <ul className="links-list">
            {links.map((l) => {
              const href = normalizeUrl(l.url ?? '');
              const label = l.title || linkHost(l.url ?? '');
              return (
                <li key={l.id}>
                  <span className="link-main">
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer">
                        {label}
                      </a>
                    ) : (
                      <span>{label}</span>
                    )}
                    {l.title && <span className="muted small">{linkHost(l.url ?? '')}</span>}
                  </span>
                  <IconButton label={`Quitar el enlace ${label}`} onClick={() => void store.remove(l.id)}>
                    ✕
                  </IconButton>
                </li>
              );
            })}
          </ul>
        )}
        <form className="link-form" onSubmit={addLink}>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Dirección: figma.com/…" aria-label="Dirección del enlace" inputMode="url" maxLength={2000} />
          <input value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} placeholder="Nombre (opcional)" aria-label="Nombre del enlace" maxLength={200} />
          <button className="btn ghost sm" disabled={!url.trim()}>
            Añadir
          </button>
        </form>
      </section>

      <section className="stack">
        <h3 className="section-title">📎 Documentos</h3>
        {files.length > 0 && (
          <ul className="list file-list">
            {files.map((f) => (
              <li key={f.id}>
                <button type="button" className="link-btn file-name" onClick={() => void openFile(f.file_path!)} title="Abrir">
                  {fileIcon(f.file_type)} {f.title}
                </button>
                <span className="row">
                  <span className="muted small">{fileSize(f.file_size)}</span>
                  <IconButton label={`Eliminar ${f.title}`} onClick={() => void removeFile(f)} danger>
                    ✕
                  </IconButton>
                </span>
              </li>
            ))}
          </ul>
        )}
        <label className={`btn ghost file-drop ${uploading ? 'is-busy' : ''}`}>
          {uploading ? 'Subiendo…' : `＋ Subir documentos (hasta ${fileSize(maxFileBytes())} cada uno)`}
          <input ref={fileInput} type="file" multiple className="sr-only" disabled={uploading} onChange={(e) => void addFiles(e.target.files)} />
        </label>
        {backend.mode === 'local' && <p className="muted small">Modo demo: los archivos se guardan en este navegador.</p>}
      </section>
    </div>
  );
}

/** Una nota: se lee entera y se edita en el sitio. */
function NoteItem({ note, store }: { note: Attachment; store: AttachmentStore }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.body);

  const save = async () => {
    if (!text.trim()) return toast('La nota está vacía: bórrala si ya no la necesitas', 'error');
    if (await store.update(note.id, { body: text.trim().slice(0, 20000) })) setEditing(false);
  };

  return (
    <li className="note">
      {editing ? (
        <div className="stack">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={20000} aria-label="Editar nota" autoFocus />
          <div className="row">
            <button type="button" className="btn primary sm" onClick={() => void save()}>
              Guardar
            </button>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => {
                setText(note.body);
                setEditing(false);
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="note-body">{note.body}</p>
          <div className="row between">
            <span className="muted small">{note.created_at ? fmtDate(dayOf(note.created_at)!) : ''}</span>
            <span className="row">
              <IconButton label="Editar nota" onClick={() => setEditing(true)}>
                ✎
              </IconButton>
              <IconButton
                label="Eliminar nota"
                onClick={() => {
                  if (confirmDelete('esta nota')) void store.remove(note.id);
                }}
                danger
              >
                ✕
              </IconButton>
            </span>
          </div>
        </>
      )}
    </li>
  );
}
