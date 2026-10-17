import { createClient, type User as SupabaseUser } from '@supabase/supabase-js';
import type { NewRow, Row, TableName, User } from '../lib/types';
import type { Backend } from './types';

const MESSAGES: Record<string, string> = {
  'Invalid login credentials': 'Email o contraseña incorrectos',
  'Email not confirmed': 'Confirma tu email antes de entrar (revisa tu bandeja de entrada)',
  'User already registered': 'Ya existe una cuenta con ese email',
};

const fail = (error: { message: string }): never => {
  throw new Error(MESSAGES[error.message] ?? error.message);
};

const toUser = (u: SupabaseUser): User => ({
  id: u.id,
  email: u.email ?? '',
  name: (u.user_metadata?.name as string | undefined) || (u.email ?? '').split('@')[0],
});

export function createSupabaseBackend(url: string, anonKey: string): Backend {
  const sb = createClient(url, anonKey);

  return {
    mode: 'supabase',

    async getUser() {
      const { data } = await sb.auth.getSession();
      return data.session ? toUser(data.session.user) : null;
    },

    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_event, session) => cb(session ? toUser(session.user) : null));
      return () => data.subscription.unsubscribe();
    },

    async signUp(email, password, name) {
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { data: { name }, emailRedirectTo: window.location.origin },
      });
      if (error) fail(error);
      return { needsConfirmation: !data.session };
    },

    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) fail(error);
    },

    async signOut() {
      const { error } = await sb.auth.signOut();
      if (error) fail(error);
    },

    async list<T extends TableName>(table: T) {
      const { data, error } = await sb.from(table).select('*').order('created_at');
      if (error) fail(error);
      return (data ?? []) as Row<T>[];
    },

    async insert<T extends TableName>(table: T, row: NewRow<T>) {
      // El cliente no tiene los tipos generados del esquema; la forma de las filas la garantiza `Tables`.
      const { data, error } = await sb.from(table).insert(row as never).select().single();
      if (error) fail(error);
      return data as Row<T>;
    },

    async update<T extends TableName>(table: T, id: string, patch: Partial<NewRow<T>>) {
      const { error } = await sb.from(table).update(patch as never).eq('id', id);
      if (error) fail(error);
    },

    async remove(table, id) {
      const { error } = await sb.from(table).delete().eq('id', id);
      if (error) fail(error);
    },
  };
}
