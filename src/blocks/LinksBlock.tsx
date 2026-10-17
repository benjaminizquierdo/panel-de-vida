import { useState, type FormEvent } from 'react';
import { IconButton } from '../components/ui';
import { linkHost, normalizeUrl, readLinks } from '../lib/blocks';
import { toast } from '../lib/toast';
import type { BlockProps } from './index';
import { useContent } from './useContent';

const MAX_LINKS = 50;

export default function LinksBlock({ block, onSave }: BlockProps) {
  const [content, commit] = useContent(block, readLinks, onSave);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');

  const add = (e: FormEvent) => {
    e.preventDefault();
    const href = normalizeUrl(url);
    if (!href) return toast('Escribe una dirección web válida, por ejemplo hevy.com', 'error');
    if (content.links.length >= MAX_LINKS) return toast(`Como mucho ${MAX_LINKS} enlaces por bloque`, 'error');
    commit({ links: [...content.links, { id: crypto.randomUUID(), title: title.trim(), url: href }] });
    setUrl('');
    setTitle('');
  };

  return (
    <div className="stack">
      {content.links.length > 0 && (
        <ul className="links-list">
          {content.links.map((l) => {
            // Se vuelve a comprobar al pintar: nunca se enlaza algo que no sea http(s).
            const href = normalizeUrl(l.url);
            const label = l.title || linkHost(l.url);
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
                  {l.title && <span className="muted small">{linkHost(l.url)}</span>}
                </span>
                <IconButton label={`Quitar el enlace ${label}`} onClick={() => commit({ links: content.links.filter((x) => x.id !== l.id) })}>
                  ✕
                </IconButton>
              </li>
            );
          })}
        </ul>
      )}
      <form className="link-form" onSubmit={add}>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Dirección: hevy.com/…" aria-label="Dirección del enlace" inputMode="url" maxLength={2000} />
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nombre (opcional)" aria-label="Nombre del enlace" maxLength={80} />
        <button className="btn ghost sm" disabled={!url.trim()}>
          Añadir
        </button>
      </form>
    </div>
  );
}
