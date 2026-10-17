// Bancos que sabe importar la app. Lista fija: cada banco nuevo se añade aquí con su lector
// (en importer.ts) y su logo (en src/assets/banks). El usuario no puede ampliarla.

import tradeRepublicLogo from '../assets/banks/trade-republic.png';
import { groupLabel, isTradeRepublic, readTradeRepublic, type ReadResult } from './importer';

/** Coincide con transactions.source de lo importado: no cambiar el id de un banco ya publicado. */
export type BankId = 'trade_republic';

export interface Bank {
  id: BankId;
  name: string;
  logo: string;
  /** ¿Es este archivo un export de este banco? (por la cabecera) */
  matches: (header: string[]) => boolean;
  read: (table: string[][]) => ReadResult;
  /** Nombre legible del tipo de operación (ImportRow.group), si el banco usa códigos. */
  groupLabel?: (group: string) => string;
  /** Pasos para conseguir el archivo desde el banco. */
  howTo: string[];
  tip?: string;
}

export const BANKS: Bank[] = [
  {
    id: 'trade_republic',
    name: 'Trade Republic',
    logo: tradeRepublicLogo,
    matches: isTradeRepublic,
    read: readTradeRepublic,
    groupLabel,
    howTo: [
      'En la app de Trade Republic, abre tu perfil y busca la opción de exportar transacciones (en algunas versiones está en Documentos o Extractos).',
      'Elige el periodo y el formato CSV, y guárdalo en tu dispositivo.',
      'Súbelo aquí. Si lo vuelves a importar más adelante, los movimientos ya guardados se detectan y se saltan.',
    ],
    tip: 'no abras y guardes el CSV con Excel antes de importarlo; puede cambiar el formato de fechas e importes.',
  },
];

export const bankById = (id: string | null | undefined) => BANKS.find((b) => b.id === id);
