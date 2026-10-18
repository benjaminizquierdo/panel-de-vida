import { useState } from 'react';
import { BLOCK_GROUPS, BLOCK_KINDS, type BlockKind } from '../lib/blockKinds';
import { setDraggingKind } from './PageCanvas';

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/**
 * Catálogo de bloques: clic para añadirlo en el primer hueco libre o, en el ordenador,
 * arrastrarlo hasta el sitio exacto del panel.
 */
export default function BlockCatalog({ desktop, onPick }: { desktop: boolean; onPick: (kind: BlockKind) => void }) {
  const [query, setQuery] = useState('');
  const q = normalize(query.trim());
  const matches = (k: BlockKind) => k.catalog !== false && (!q || normalize(`${k.name} ${k.description}`).includes(q));

  return (
    <div className="catalog stack">
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar bloque…" aria-label="Buscar bloque" />
      {desktop && <p className="muted small">Arrastra un bloque al panel o haz clic para añadirlo en el primer hueco libre.</p>}
      {BLOCK_GROUPS.map((g) => {
        // Los nuevos, primero.
        const kinds = BLOCK_KINDS.filter((k) => k.group === g.id && matches(k)).sort((a, b) => Number(!!b.isNew) - Number(!!a.isNew));
        if (kinds.length === 0) return null;
        return (
          <section key={g.id} className="catalog-group">
            <h3>{g.label}</h3>
            {g.hint && <p className="muted small">{g.hint}</p>}
            <ul className="block-gallery">
              {kinds.map((k) => (
                <li key={k.type}>
                  <button
                    type="button"
                    className="block-kind"
                    draggable={desktop}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', k.type);
                      e.dataTransfer.effectAllowed = 'copy';
                      setDraggingKind(k.type);
                    }}
                    onDragEnd={() => setDraggingKind(null)}
                    onClick={() => onPick(k)}
                    aria-label={`Añadir ${k.name}`}
                  >
                    <span className="block-kind-icon" aria-hidden>
                      {k.icon}
                    </span>
                    <span className="block-kind-text">
                      <strong>
                        {k.name}
                        {k.isNew && <span className="badge new-badge">Nuevo</span>}
                      </strong>
                      <span className="muted small">{k.description}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {BLOCK_KINDS.every((k) => !matches(k)) && <p className="empty">Ningún bloque coincide con «{query}».</p>}
      <p className="muted small">Próximamente: nutrición y peso, rutinas de entrenamiento, ánimo y diario, tablas propias, outfits e imágenes.</p>
    </div>
  );
}
