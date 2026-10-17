import type { ComponentType } from 'react';
import type { Block, BlockType } from '../lib/types';
import ChecklistBlock from './ChecklistBlock';
import LinksBlock from './LinksBlock';
import NotesBlock from './NotesBlock';

export interface BlockProps {
  block: Block;
  /** Guarda el contenido nuevo del bloque. Devuelve false si ha fallado (el aviso ya se ha mostrado). */
  onSave: (content: Record<string, unknown>) => Promise<boolean>;
}

/** Componente de cada tipo de bloque (sus datos y textos están en lib/blocks.ts). */
export const BLOCK_COMPONENTS: Record<BlockType, ComponentType<BlockProps>> = {
  notas: NotesBlock,
  checklist: ChecklistBlock,
  enlaces: LinksBlock,
};
