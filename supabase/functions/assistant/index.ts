// Edge Function «assistant»: chat con Claude que registra y consulta los datos
// del usuario que la llama.
//
// Petición (POST, con la sesión de Supabase en Authorization):
//   { message: string, history: Mensaje[], today: "AAAA-MM-DD" }
// Respuesta:
//   { reply, appended, dropped, actions, remaining }
//   El cliente guarda el historial: descarta los `dropped` primeros mensajes y
//   añade `appended` al final. Nunca se edita un mensaje ya enviado (lo exige la
//   verificación de los bloques de razonamiento y mantiene la caché).
//
// Secretos (Supabase → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY       obligatorio
//   ASSISTANT_MODEL         por defecto claude-haiku-5-5 (el más barato)
//   ASSISTANT_EFFORT        low | medium | high (por defecto low)
//   ASSISTANT_DAILY_LIMIT   mensajes por usuario y día (por defecto 30)

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { buildContext, SYSTEM_PROMPT } from './prompt.ts';
import { isDate, runTool, TOOLS, type ToolContext } from './tools.ts';

type Message = Anthropic.Beta.BetaMessageParam;

const EFFORTS = ['low', 'medium', 'high'] as const;
type Effort = (typeof EFFORTS)[number];

const MODEL = Deno.env.get('ASSISTANT_MODEL') || 'claude-haiku-5-5';
const envEffort = Deno.env.get('ASSISTANT_EFFORT') as Effort | undefined;
const EFFORT: Effort = envEffort && EFFORTS.includes(envEffort) ? envEffort : 'low';
const DAILY_LIMIT = Math.max(1, Number(Deno.env.get('ASSISTANT_DAILY_LIMIT')) || 30);

const MAX_STEPS = 8; // llamadas a Claude por mensaje del usuario
const MAX_MESSAGE_CHARS = 2000;
const MAX_BODY_CHARS = 400_000; // por encima, la petición se rechaza sin procesar
const MAX_HISTORY_MESSAGES = 60;
const MAX_HISTORY_CHARS = 120_000; // por encima, se descartan los turnos más antiguos

// Respaldo ante rechazos por política (fallbacks: "default"): la API reintenta en el
// modelo que corresponda. Solo lo admiten estos modelos; Claude Haiku no tiene respaldo.
const FALLBACK_MODELS = ['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'];
const USE_FALLBACK = FALLBACK_MODELS.includes(MODEL);

// drop_block: si un bloque de razonamiento del historial no cuadra (p. ej. historial
// manipulado), se descarta en vez de dar error.
const BETAS = ['thinking-binding-controls-2026-08-01', ...(USE_FALLBACK ? ['server-side-fallback-2026-07-01'] : [])];

const anthropic = new Anthropic(); // lee ANTHROPIC_API_KEY

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const isMessage = (m: unknown): m is Message => {
  if (typeof m !== 'object' || m === null) return false;
  const { role, content } = m as Record<string, unknown>;
  return (role === 'user' || role === 'assistant' || role === 'system') && (typeof content === 'string' || Array.isArray(content));
};

/** Un turno del usuario escrito por él (no un mensaje de resultados de herramientas). */
const isUserTurn = (m: Message) => m.role === 'user' && typeof m.content === 'string';

/**
 * Recorta el historial por delante, siempre hasta el inicio de un turno del
 * usuario. Quitar mensajes del principio es compatible con los bloques de razonamiento.
 */
function trimHistory(history: Message[]) {
  const tooBig = (from: number) =>
    history.length - from > MAX_HISTORY_MESSAGES || JSON.stringify(history.slice(from)).length > MAX_HISTORY_CHARS;
  let start = 0;
  while (start < history.length && (tooBig(start) || !isUserTurn(history[start]))) {
    start++;
    while (start < history.length && !isUserTurn(history[start])) start++;
  }
  return { kept: history.slice(start), dropped: start };
}

const textOf = (content: Anthropic.Beta.BetaContentBlock[]) =>
  content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

/** Bucle de herramientas. Añade a `appended` cada mensaje nuevo y devuelve el texto final. */
async function converse(history: Message[], appended: Message[], ctx: ToolContext): Promise<string> {
  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: BETAS,
      ...(USE_FALLBACK ? { fallbacks: 'default' as const } : {}),
      thinking: { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } },
      output_config: { effort: EFFORT },
      cache_control: { type: 'ephemeral' },
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages: [...history, ...appended],
    });

    // El turno completo (incluidos los bloques de razonamiento) vuelve tal cual al historial.
    appended.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'refusal') {
      return 'Lo siento, no puedo ayudarte con eso. Si crees que es un error, prueba a decirlo de otra forma.';
    }
    if (response.stop_reason === 'pause_turn') continue;

    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    if (toolUses.length === 0) {
      return textOf(response.content) || 'Hecho.';
    }
    if (response.stop_reason === 'max_tokens') {
      // Una llamada a herramienta cortada no se ejecuta.
      return 'La respuesta se ha cortado antes de terminar. ¿Puedes repetirlo con menos cosas a la vez?';
    }

    // En orden: dos acciones sobre el mismo día (p. ej. salud) no deben pisarse.
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const block of toolUses) results.push(await runTool(block, ctx));
    appended.push({ role: 'user', content: results });
  }
  return 'He hecho varias acciones pero no he podido terminar. Revisa tus datos o pregúntame de nuevo.';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  // --- Sesión del usuario: todas las consultas se hacen con ella (RLS).
  const authorization = req.headers.get('Authorization') ?? '';
  const apiKey = Deno.env.get('SUPABASE_ANON_KEY') || req.headers.get('apikey') || '';
  const token = authorization.replace(/^Bearer\s+/i, '');
  if (!token || !apiKey) return json({ error: 'Inicia sesión para usar el asistente.' }, 401);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, apiKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authError } = await db.auth.getUser(token);
  if (authError || !auth.user) return json({ error: 'Tu sesión ha caducado. Vuelve a iniciar sesión.' }, 401);
  const user = auth.user;

  // --- Petición
  const raw = await req.text();
  if (raw.length > MAX_BODY_CHARS) return json({ error: 'La conversación es demasiado larga. Empieza una nueva.' }, 413);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'Petición no válida.' }, 400);
  }
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message || message.length > MAX_MESSAGE_CHARS) {
    return json({ error: `Escribe un mensaje de entre 1 y ${MAX_MESSAGE_CHARS} caracteres.` }, 400);
  }
  const rawHistory = Array.isArray(body.history) ? body.history : [];
  if (!rawHistory.every(isMessage)) return json({ error: 'El historial no es válido. Empieza una nueva conversación.' }, 400);
  const { kept: history, dropped } = trimHistory(rawHistory);
  const today = isDate(body.today) ? body.today : new Date().toISOString().slice(0, 10);

  // --- Cupo diario (se consume antes de llamar a Claude)
  const { data: remaining, error: quotaError } = await db.rpc('assistant_take_quota', { p_limit: DAILY_LIMIT });
  if (quotaError) {
    console.error('quota', quotaError);
    return json({ error: 'No se ha podido comprobar tu cupo de mensajes.' }, 500);
  }
  if (remaining < 0) {
    return json({ error: `Has usado tus ${DAILY_LIMIT} mensajes de hoy. Vuelve mañana.`, remaining: 0 }, 429);
  }

  // --- Conversación
  const name = (user.user_metadata?.name as string | undefined) || user.email?.split('@')[0] || '';
  const appended: Message[] = [
    { role: 'user', content: message },
    { role: 'system', content: await buildContext(db, today, name) },
  ];
  const ctx: ToolContext = { db, userId: user.id, today, actions: [] };

  try {
    const reply = await converse(history, appended, ctx);
    return json({ reply, appended, dropped, actions: ctx.actions, remaining });
  } catch (e) {
    console.error('anthropic', e);
    // Las acciones ya hechas se devuelven igualmente para que la app refresque los datos.
    const error =
      e instanceof Anthropic.RateLimitError
        ? 'El asistente está saturado. Prueba de nuevo en un minuto.'
        : e instanceof Anthropic.AuthenticationError
          ? 'El asistente no está bien configurado (clave de Anthropic no válida).'
          : e instanceof Anthropic.BadRequestError || e instanceof Anthropic.NotFoundError
            ? // Error de configuración (modelo o parámetros): el detalle ayuda a arreglarlo.
              `El asistente no está bien configurado: ${e.message}`
            : 'El asistente no está disponible ahora mismo. Prueba de nuevo más tarde.';
    return json({ error, actions: ctx.actions, remaining }, 502);
  }
});
