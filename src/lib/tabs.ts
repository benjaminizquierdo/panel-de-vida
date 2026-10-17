export const TABS = [
  { id: 'inicio', label: 'Inicio', icon: '🏠' },
  { id: 'proyectos', label: 'Proyectos', icon: '📋' },
  { id: 'habitos', label: 'Hábitos y salud', icon: '💪' },
  { id: 'objetivos', label: 'Objetivos', icon: '🎯' },
  { id: 'finanzas', label: 'Finanzas', icon: '💶' },
] as const;

export type TabId = (typeof TABS)[number]['id'];

export const isTabId = (v: unknown): v is TabId => TABS.some((t) => t.id === v);
