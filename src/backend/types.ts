import type { NewRow, Row, TableName, User } from '../lib/types';

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
  update<T extends TableName>(table: T, id: string, patch: Partial<NewRow<T>>): Promise<void>;
  remove(table: TableName, id: string): Promise<void>;
}
