import { createClient, FunctionsHttpError, type User as SupabaseUser } from '@supabase/supabase-js';
import { AssistantError, type AssistantResponse, type NewRow, type Row, type TableName, type User } from '../lib/types';
import type { Backend } from './types';

const MESSAGES: Record<string, string> = {
  'Invalid login credentials': 'Email o contraseña incorrectos',
  'Email not confirmed': 'Confirma tu email antes de entrar (revisa tu bandeja de entrada)',
  'User already registered': 'Ya existe una cuenta con ese email',
};

const fail = (error: { message: string }): never => {
  throw new Error(MESSAGES[error.message] ?? error.message);
};

/** Bucket de los adjuntos (008_tipos_proyecto.sql). */
const BUCKET = 'adjuntos';

const storageError = (error: { message: string }) => ({
  message: /bucket not found/i.test(error.message)
    ? 'Falta crear el almacén de adjuntos: aplica la migración 008 en Supabase'
    : /exceeded the maximum allowed size|payload too large|too large/i.test(error.message)
      ? 'El archivo es demasiado grande (como mucho 10 MB)'
      : error.message,
});

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

    async insertMany<T extends TableName>(table: T, rows: NewRow<T>[], options?: { skipDuplicates?: boolean }) {
      let inserted = 0;
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500) as never;
        const query = options?.skipDuplicates
          ? sb.from(table).upsert(chunk, { onConflict: 'user_id,source,external_id', ignoreDuplicates: true })
          : sb.from(table).insert(chunk);
        const { data, error } = await query.select('id');
        if (error) fail(error);
        inserted += data?.length ?? 0;
      }
      return inserted;
    },

    async update<T extends TableName>(table: T, id: string, patch: Partial<NewRow<T>>) {
      const { error } = await sb.from(table).update(patch as never).eq('id', id);
      if (error) fail(error);
    },

    async remove(table, id) {
      const { error } = await sb.from(table).delete().eq('id', id);
      if (error) fail(error);
    },

    async mergeCategory(sourceId, targetId) {
      const { data, error } = await sb.rpc('merge_finance_category', { p_source: sourceId, p_target: targetId });
      if (error) fail(error);
      return Number(data);
    },

    async generateRecurring(until) {
      const { data, error } = await sb.rpc('generate_my_recurring', { p_until: until });
      if (error) fail(error);
      return Number(data);
    },

    async seedPages(pages) {
      const { data, error } = await sb.rpc('seed_default_pages', { p_pages: pages });
      if (error) fail(error);
      return Number(data);
    },

    async insertPages(pages, parentId) {
      const { data, error } = await sb.rpc('insert_page_tree', { p_pages: pages, p_parent: parentId });
      if (error) fail(error);
      return Number(data);
    },

    async uploadFile(path, file) {
      const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
      if (error) fail(storageError(error));
    },

    async fileUrl(path) {
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 3600);
      if (error) fail(storageError(error));
      return data!.signedUrl;
    },

    async removeFiles(paths) {
      if (paths.length === 0) return;
      const { error } = await sb.storage.from(BUCKET).remove(paths);
      if (error) fail(storageError(error));
    },

    async searchFoods(query) {
      const { data, error } = await sb.functions.invoke<{ hits: Record<string, unknown>[] }>('food-search', { body: { q: query } });
      if (!error && data) return data.hits;
      let detail = '';
      if (error instanceof FunctionsHttpError) {
        try {
          detail = (await error.context.json()).error ?? '';
        } catch {
          // Sin JSON: la función no está desplegada.
        }
      }
      throw new Error(detail || 'El buscador de productos no está disponible: falta desplegar la función «food-search» en Supabase. Mientras, usa el código de barras.');
    },

    async assistant(request) {
      const { data, error } = await sb.functions.invoke<AssistantResponse>('assistant', { body: request });
      if (!error && data) return data;

      // La función responde {error, actions?, remaining?} con un estado HTTP de error.
      let detail: { error?: string; actions?: string[]; remaining?: number } = {};
      if (error instanceof FunctionsHttpError) {
        try {
          detail = await error.context.json();
        } catch {
          // Respuesta sin JSON (p. ej. la función no está desplegada).
        }
      }
      throw new AssistantError(
        detail.error ?? 'No se ha podido contactar con el asistente. Comprueba tu conexión.',
        detail.actions ?? [],
        detail.remaining,
      );
    },
  };
}
