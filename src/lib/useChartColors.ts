import { useEffect, useState } from 'react';

// Recharts recibe los colores como atributos SVG, donde var(--x) no funciona:
// se leen los tokens de CSS y se vuelven a leer al cambiar el tema del sistema.

const read = () => {
  const style = getComputedStyle(document.documentElement);
  const v = (name: string) => style.getPropertyValue(name).trim();
  return {
    c1: v('--c1'),
    c2: v('--c2'),
    c3: v('--c3'),
    danger: v('--danger'),
    grid: v('--border'),
    text: v('--muted'),
    surface: v('--surface'),
  };
};

export function useChartColors() {
  const [colors, setColors] = useState(read);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => setColors(read());
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return colors;
}

export const tooltipStyle = (c: ReturnType<typeof read>) => ({
  contentStyle: { background: c.surface, border: `1px solid ${c.grid}`, borderRadius: 8, fontSize: 13 },
  labelStyle: { color: c.text },
});
