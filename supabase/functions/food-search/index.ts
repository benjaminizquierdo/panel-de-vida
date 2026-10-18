// Edge Function «food-search»: busca productos en Open Food Facts por nombre.
//
// El buscador de Open Food Facts no admite peticiones desde otras webs (CORS), así que la app
// le pregunta a través de esta función. Gratis y sin clave. Solo para usuarios con sesión.
//
// Petición (POST, con la sesión de Supabase en Authorization): { q: string }
// Respuesta: { hits: Producto[] } con los campos de FIELDS (ver search.ts).

import { createClient } from '@supabase/supabase-js';
import { cleanQuery, searchUrl } from './search.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const apiKey = Deno.env.get('SUPABASE_ANON_KEY') || req.headers.get('apikey') || '';
  if (!token || !apiKey) return json({ error: 'Inicia sesión para buscar productos.' }, 401);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, apiKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error } = await db.auth.getUser(token);
  if (error || !auth.user) return json({ error: 'Tu sesión ha caducado. Vuelve a iniciar sesión.' }, 401);

  let body: { q?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Petición no válida' }, 400);
  }
  const text = cleanQuery(body.q);
  if (!text) return json({ error: 'Escribe entre 2 y 100 caracteres' }, 400);

  try {
    const res = await fetch(searchUrl(text), {
      headers: { 'User-Agent': 'PanelDeVida/1.0 (https://github.com/benjaminizquierdo/panel-de-vida)' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return json({ error: 'Open Food Facts no responde ahora mismo. Prueba en unos minutos o usa el código de barras.' }, 502);
    const data = await res.json();
    return json({ hits: Array.isArray(data.hits) ? data.hits : [] });
  } catch {
    return json({ error: 'Open Food Facts no responde ahora mismo. Prueba en unos minutos o usa el código de barras.' }, 502);
  }
});
