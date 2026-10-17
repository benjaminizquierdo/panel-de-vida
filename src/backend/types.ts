import type { AssistantRequest, AssistantResponse, NewRow, Row, TableName, User } from '../lib/types';

/**
 * Contrato común de los dos almacenamientos. Toda operación de datos se limita
 * al usuario con sesión iniciada: en Supabase lo garantiza Row Level Security,
 * en modo demo cada usuario tiene sus propias claves en localStorage.
 */
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
  /** Asistente de IA. Solo existe con Supabase (necesita la Edge Function). Lanza AssistantError. */
  assistant?(request: AssistantRequest): Promise<AssistantResponse>;
}
