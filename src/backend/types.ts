import type { PageSeed } from '../lib/pageTemplates';
import type { AssistantRequest, AssistantResponse, NewRow, Row, TableName, User } from '../lib/types';

/**
 * Contrato común de los dos almacenamientos. Toda operación de datos se limita
 * al usuario con sesión iniciada: en Supabase lo garantiza Row Level Security,
 * en modo demo cada usuario tiene sus propias claves en localStorage.
 */
/** Tamaño máximo de un adjunto: 10 MB en Supabase (límite del bucket en 008_tipos_proyecto.sql). */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** En modo demo los archivos se guardan en el navegador, que tiene muy poco sitio. */
export const MAX_DEMO_FILE_BYTES = 1024 * 1024;

export interface Backend {
  mode: 'local' | 'supabase';
  getUser(): Promise<User | null>;
  onAuthChange(cb: (user: User | null) => void): () => void;
  signUp(email: string, password: string, name: string): Promise<{ needsConfirmation: boolean }>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  list<T extends TableName>(table: T): Promise<Row<T>[]>;
  insert<T extends TableName>(table: T, row: NewRow<T>): Promise<Row<T>>;
  /**
   * Inserta varias filas de una vez. Con `skipDuplicates`, las que repiten (user_id, source,
   * external_id) se ignoran en silencio (importaciones). Devuelve cuántas se han insertado.
   */
  insertMany<T extends TableName>(table: T, rows: NewRow<T>[], options?: { skipDuplicates?: boolean }): Promise<number>;
  update<T extends TableName>(table: T, id: string, patch: Partial<NewRow<T>>): Promise<void>;
  remove(table: TableName, id: string): Promise<void>;
  /** Pasa los movimientos (y subcategorías) de una categoría a otra del mismo tipo y la borra. Devuelve los movimientos movidos. */
  mergeCategory(sourceId: string, targetId: string): Promise<number>;
  /** Crea los movimientos periódicos que ya tocan hasta `until` (como mucho, mañana). Devuelve cuántos ha creado. */
  generateRecurring(until: string): Promise<number>;
  /**
   * Crea las categorías por defecto la primera vez que entra el usuario (y cuelga de ellas las
   * sub-pestañas de la versión anterior). Las veces siguientes no hace nada. Devuelve las páginas creadas.
   */
  seedPages(pages: PageSeed[]): Promise<number>;
  /** Crea páginas con sus bloques y subpáginas bajo `parentId` (null: primer nivel), todo o nada. */
  insertPages(pages: PageSeed[], parentId: string | null): Promise<number>;
  /** Sube un archivo adjunto a `path` (<user_id>/<project_id>/<nombre>). Como mucho MAX_FILE_BYTES. */
  uploadFile(path: string, file: File): Promise<void>;
  /** Dirección temporal para ver o descargar un adjunto. */
  fileUrl(path: string): Promise<string>;
  /** Borra adjuntos (los que no existan se ignoran). */
  removeFiles(paths: string[]): Promise<void>;
  /**
   * Busca productos en Open Food Facts por nombre. Con Supabase pasa por la Edge Function
   * «food-search» (el buscador no admite peticiones desde el navegador). Lanza un Error legible.
   */
  searchFoods(query: string): Promise<Record<string, unknown>[]>;
  /** Asistente de IA. Solo existe con Supabase (necesita la Edge Function). Lanza AssistantError. */
  assistant?(request: AssistantRequest): Promise<AssistantResponse>;
}
