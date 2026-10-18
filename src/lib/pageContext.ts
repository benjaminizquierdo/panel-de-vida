import { createContext, useContext } from 'react';
import type { User, UserTab } from './types';
import { monthKey, today } from './utils';

// Lo que los bloques necesitan saber de fuera de sí mismos.

export const UserContext = createContext<User>({ id: '', email: '', name: '' });
export const useUser = () => useContext(UserContext);

export interface Nav {
  pages: UserTab[];
  current: UserTab | undefined;
  go: (pageId: string) => void;
  /** Página de una categoría por defecto (p. ej. 'finanzas_categorias'), si el usuario la conserva. */
  pageOf: (template: string) => UserTab | undefined;
}

export const NavContext = createContext<Nav>({ pages: [], current: undefined, go: () => {}, pageOf: () => undefined });
export const useNav = () => useContext(NavContext);

/**
 * Mes que muestran los bloques de finanzas de la página. Lo cambia el bloque «Selector de mes»;
 * sin selector en la página, es el mes actual.
 */
export interface PageMonth {
  month: string;
  setMonth: (month: string) => void;
}

export const PageMonthContext = createContext<PageMonth>({ month: monthKey(today()), setMonth: () => {} });
export const usePageMonth = () => useContext(PageMonthContext);
