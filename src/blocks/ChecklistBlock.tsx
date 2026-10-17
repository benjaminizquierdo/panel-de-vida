import { useState, type FormEvent } from 'react';
import { IconButton } from '../components/ui';
import { isDone, readChecklist, RESET_LABEL } from '../lib/blocks';
import { toast } from '../lib/toast';
import { today } from '../lib/utils';
import type { BlockProps } from './index';
import { useContent } from './useContent';

const MAX_ITEMS = 100;

export default function ChecklistBlock({ block, onSave }: BlockProps) {
  const [content, commit] = useContent(block, readChecklist, onSave);
  const [draft, setDraft] = useState('');

  const day = today();
  const done = content.items.filter((i) => isDone(i, content.reset, day)).length;

  const toggle = (id: string) =>
    commit({
      ...content,
      items: content.items.map((i) => (i.id === id ? { ...i, done_on: isDone(i, content.reset, day) ? null : day } : i)),
    });

  const add = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    if (content.items.length >= MAX_ITEMS) return toast(`Como mucho ${MAX_ITEMS} elementos por lista`, 'error');
    commit({ ...content, items: [...content.items, { id: crypto.randomUUID(), text, done_on: null }] });
    setDraft('');
  };

  return (
    <div className="stack checklist-block">
      {content.items.length > 0 && (
        <ul className="checklist">
          {content.items.map((i) => {
            const checked = isDone(i, content.reset, day);
            return (
              <li key={i.id} className={checked ? 'is-done' : ''}>
                <label className="check">
                  <input type="checkbox" checked={checked} onChange={() => toggle(i.id)} />
                  <span>{i.text}</span>
                </label>
                <IconButton label={`Quitar «${i.text}»`} onClick={() => commit({ ...content, items: content.items.filter((x) => x.id !== i.id) })}>
                  ✕
                </IconButton>
              </li>
            );
          })}
        </ul>
      )}
      <form className="inline-form" onSubmit={add}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={200}
          placeholder="Añadir elemento…"
          aria-label={`Añadir elemento a ${block.title || 'la lista'}`}
        />
        <button className="btn ghost sm" disabled={!draft.trim()}>
          Añadir
        </button>
      </form>
      {content.items.length > 0 && (
        <div className="row between small muted">
          <span>
            {done} de {content.items.length} hechos · {RESET_LABEL[content.reset]}
          </span>
          {done > 0 && (
            <button type="button" className="link-btn" onClick={() => commit({ ...content, items: content.items.map((i) => ({ ...i, done_on: null })) })}>
              Desmarcar todo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
