import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export interface IconOption {
  value: string;
  label: string;
  icon: ReactNode;
  hint?: string;
}

/**
 * Desplegable con icono en cada opción (un <select> nativo no admite imágenes).
 * Patrón «select-only combobox» de ARIA: flechas, Inicio/Fin, Enter o espacio para elegir, Esc para cerrar.
 */
export default function IconSelect({ label, options, value, onChange }: {
  label: string;
  options: IconOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const show = (index = selectedIndex) => {
    setActive(index);
    setOpen(true);
  };
  const choose = (index: number) => {
    onChange(options[index].value);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const last = options.length - 1;
    const keys: Record<string, () => void> = open
      ? {
          ArrowDown: () => setActive((i) => Math.min(last, i + 1)),
          ArrowUp: () => setActive((i) => Math.max(0, i - 1)),
          Home: () => setActive(0),
          End: () => setActive(last),
          Enter: () => choose(active),
          ' ': () => choose(active),
          Escape: () => setOpen(false),
        }
      : {
          ArrowDown: () => show(),
          ArrowUp: () => show(),
          Enter: () => show(),
          ' ': () => show(),
          Home: () => show(0),
          End: () => show(last),
        };
    const action = keys[e.key];
    if (action) {
      e.preventDefault();
      action();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div className="field icon-select" ref={rootRef}>
      <span id={`${id}-label`}>{label}</span>
      <button
        type="button"
        role="combobox"
        className="icon-select-button"
        aria-labelledby={`${id}-label`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
      >
        {selected && (
          <>
            <span className="icon-select-icon">{selected.icon}</span>
            <span className="icon-select-text">{selected.label}</span>
          </>
        )}
        <span className="icon-select-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <ul id={`${id}-list`} role="listbox" aria-labelledby={`${id}-label`} className="icon-select-list">
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-${i}`}
              role="option"
              aria-selected={o.value === value}
              className={i === active ? 'is-active' : ''}
              onPointerEnter={() => setActive(i)}
              onClick={() => choose(i)}
            >
              <span className="icon-select-icon">{o.icon}</span>
              <span className="icon-select-text">
                {o.label}
                {o.hint && <span className="muted small">{o.hint}</span>}
              </span>
              {o.value === value && (
                <span className="icon-select-check" aria-hidden>
                  ✓
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
