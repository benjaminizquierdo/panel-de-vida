// Prueba de la Edge Function «assistant» sin red externa: arranca la función de
// verdad en Deno y la conecta a un Supabase y una API de Claude simulados.
// Comprueba autenticación, cupo, contexto, bucle de herramientas, escrituras y
// recorte del historial. No valida que la API real acepte los parámetros.
//
// Uso: npm run test:assistant

const USER = '11111111-1111-4111-8111-111111111111';
const H1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const P1 = 'bbbbbbbb-0000-4000-8000-000000000001';
const TODAY = '2026-10-17';

// ---------------------------------------------------------------- Supabase simulado

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {
  habits: [
    { id: H1, name: 'Meditar', active: true },
    { id: 'aaaaaaaa-0000-4000-8000-000000000002', name: 'Ejercicio', active: true },
  ],
  habit_logs: [],
  projects: [{ id: P1, name: 'Web personal', status: 'activo' }],
  tasks: [{ id: 'cccccccc-0000-4000-8000-000000000001', title: 'Diseñar portada', status: 'pendiente', priority: 'alta', due_date: null, project_id: P1 }],
  goals: [{ id: 'dddddddd-0000-4000-8000-000000000001', title: 'Leer 12 libros', horizon: 'anual', area: 'personal', current: 2, target: 12, unit: 'libros' }],
  highlights: [],
  health_logs: [],
  transactions: [],
};
const writes: { method: string; table: string; body: unknown }[] = [];
let quotaReply = 29;
let quotaCalls = 0;

const supabase = Deno.serve({ port: 54321, onListen() {} }, async (req) => {
  const url = new URL(req.url);
  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  if (url.pathname === '/auth/v1/user') {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (token !== 'token-valido') return respond({ code: 401, msg: 'invalid JWT' }, 401);
    return respond({ id: USER, aud: 'authenticated', email: 'ana@test.com', user_metadata: { name: 'Ana' }, app_metadata: {}, created_at: '' });
  }

  if (url.pathname === '/rest/v1/rpc/assistant_take_quota') {
    quotaCalls++;
    return respond(quotaReply);
  }

  const table = url.pathname.replace('/rest/v1/', '');
  if (!(table in tables)) return respond({ message: `tabla desconocida ${table}` }, 404);

  if (req.method === 'GET') {
    let rows = tables[table];
    for (const [key, value] of url.searchParams) {
      if (value.startsWith('eq.')) rows = rows.filter((r) => String(r[key]) === value.slice(3));
      if (value.startsWith('neq.')) rows = rows.filter((r) => String(r[key]) !== value.slice(4));
    }
    if (req.headers.get('Accept')?.includes('vnd.pgrst.object')) {
      if (rows.length === 1) return respond(rows[0]);
      return respond({ code: 'PGRST116', details: `The result contains ${rows.length} rows`, hint: null, message: 'JSON object requested, multiple (or no) rows returned' }, 406);
    }
    return respond(rows);
  }

  const body = await req.json();
  writes.push({ method: req.method, table, body });
  const row = { id: crypto.randomUUID(), ...(Array.isArray(body) ? body[0] : body) };
  if (req.method === 'POST') tables[table].push(row);
  if (req.headers.get('Accept')?.includes('vnd.pgrst.object')) return respond(row, 201);
  return req.headers.get('Prefer')?.includes('return=representation') ? respond([row], 201) : new Response(null, { status: 201 });
});

// ---------------------------------------------------------------- Claude simulado

const anthropicRequests: { headers: Headers; body: Record<string, unknown> }[] = [];
const scripted: Record<string, unknown>[] = [];

const message = (content: unknown[], stop_reason: string) => ({
  id: `msg_${anthropicRequests.length}`,
  type: 'message',
  role: 'assistant',
  model: 'claude-sonnet-5-5',
  content,
  stop_reason,
  stop_sequence: null,
  usage: { input_tokens: 10, output_tokens: 10 },
});

const anthropic = Deno.serve({ port: 54322, onListen() {} }, async (req) => {
  anthropicRequests.push({ headers: req.headers, body: await req.json() });
  const next = scripted.shift();
  if (!next) return new Response(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'sin guion' } }), { status: 500 });
  return new Response(JSON.stringify(next), { headers: { 'Content-Type': 'application/json' } });
});

// ---------------------------------------------------------------- Función real

Deno.env.set('SUPABASE_URL', 'http://localhost:54321');
Deno.env.set('SUPABASE_ANON_KEY', 'anon-de-prueba');
Deno.env.set('ANTHROPIC_API_KEY', 'sk-ant-prueba');
Deno.env.set('ANTHROPIC_BASE_URL', 'http://localhost:54322');
await import('../supabase/functions/assistant/index.ts'); // Deno.serve en :8000

const call = (body: unknown, token = 'token-valido') =>
  fetch('http://localhost:8000', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: 'anon-de-prueba' },
    body: JSON.stringify(body),
  });

let failures = 0;
const ok = (cond: unknown, msg: string) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) failures++;
};

// 1. Sin sesión válida
{
  const res = await call({ message: 'hola', history: [], today: TODAY }, 'token-falso');
  ok(res.status === 401, 'sin sesión válida responde 401');
  await res.body?.cancel();
  ok(quotaCalls === 0 && anthropicRequests.length === 0, 'sin sesión no consume cupo ni llama a Claude');
}

// 2. Mensaje que registra un gasto y marca un hábito
scripted.push(
  message(
    [
      { type: 'thinking', thinking: '', signature: 'firma-1' },
      { type: 'tool_use', id: 'tu_1', name: 'registrar_movimiento', input: { tipo: 'gasto', importe: 12.5, categoria: 'Comida', nota: 'almuerzo', fecha: TODAY } },
      { type: 'tool_use', id: 'tu_2', name: 'marcar_habito', input: { habito_id: H1, fecha: TODAY } },
    ],
    'tool_use',
  ),
  message([{ type: 'text', text: 'Apuntado: 12,50 € en Comida y Meditar hecho.' }], 'end_turn'),
);
const res = await call({ message: 'Hoy he gastado 12,50 en el almuerzo y he meditado', history: [], today: TODAY });
const data = await res.json();
ok(res.status === 200, `responde 200 (${res.status})`);
ok(data.reply === 'Apuntado: 12,50 € en Comida y Meditar hecho.', 'devuelve el texto final de Claude');
ok(data.remaining === 29 && quotaCalls === 1, 'consume un mensaje del cupo y devuelve los restantes');
ok(data.actions?.length === 2 && data.actions[0].includes('12,50') && data.actions[1].includes('Meditar'), `describe las 2 acciones: ${JSON.stringify(data.actions)}`);
ok(
  JSON.stringify(data.appended?.map((m: { role: string }) => m.role)) === JSON.stringify(['user', 'system', 'assistant', 'user', 'assistant']),
  'appended = usuario, contexto, asistente, resultados, asistente',
);
ok(data.appended?.[2]?.content?.[0]?.signature === 'firma-1', 'el bloque de razonamiento vuelve intacto al historial');

const tx = writes.find((w) => w.table === 'transactions')?.body as Row | undefined;
ok(tx?.amount === 12.5 && tx?.category === 'Comida' && tx?.type === 'gasto' && tx?.date === TODAY, 'inserta el gasto correcto en transactions');
const log = writes.find((w) => w.table === 'habit_logs')?.body;
const logRow = (Array.isArray(log) ? log[0] : log) as Row | undefined;
ok(logRow?.habit_id === H1 && logRow?.date === TODAY && logRow?.user_id === USER, 'marca el hábito en habit_logs');

const [first, second] = anthropicRequests;
const b = first.body;
ok(b.model === 'claude-sonnet-5-5', 'usa claude-sonnet-5-5 por defecto');
ok(b.fallbacks === 'default', 'activa fallbacks: "default"');
ok((b.thinking as Row)?.type === 'adaptive' && ((b.thinking as Row).block_binding as Row)?.prefix_mismatch_behavior === 'drop_block', 'thinking adaptativo con drop_block');
ok((b.output_config as Row)?.effort === 'low', 'esfuerzo low');
ok((b.cache_control as Row)?.type === 'ephemeral', 'caché de prompt activada');
ok(Array.isArray(b.tools) && (b.tools as Row[]).length === 10 && (b.tools as Row[]).every((t) => t.strict === true), '10 herramientas, todas strict');
ok(typeof b.system === 'string' && !(b.system as string).includes(TODAY), 'el prompt de sistema no contiene la fecha (estable para la caché)');
const msgs = b.messages as Row[];
ok(msgs.length === 2 && msgs[0].role === 'user' && msgs[1].role === 'system', 'el contexto va como mensaje role: system tras el del usuario');
ok(String(msgs[1].content).includes('Meditar') && String(msgs[1].content).includes(TODAY) && String(msgs[1].content).includes('Ana'), 'el contexto incluye hábitos, fecha y nombre');
const beta = first.headers.get('anthropic-beta') ?? '';
ok(beta.includes('server-side-fallback-2026-07-01') && beta.includes('thinking-binding-controls-2026-08-01'), 'envía las dos cabeceras beta');
const lastMsg = (second.body.messages as Row[]).at(-1) as { role: string; content: Row[] };
ok(lastMsg.role === 'user' && lastMsg.content.length === 2 && lastMsg.content.every((c) => c.type === 'tool_result' && !c.is_error), 'la segunda llamada lleva los 2 resultados, sin errores');

// 3. Herramienta con id inexistente → error devuelto a Claude, no a la app
scripted.push(
  message([{ type: 'tool_use', id: 'tu_3', name: 'marcar_habito', input: { habito_id: 'aaaaaaaa-0000-4000-8000-00000000dead', fecha: TODAY } }], 'tool_use'),
  message([{ type: 'text', text: 'No encuentro ese hábito.' }], 'end_turn'),
);
{
  const r = await call({ message: 'He hecho yoga', history: data.appended, today: TODAY });
  const d = await r.json();
  const results = (anthropicRequests.at(-1)!.body.messages as Row[]).at(-1) as { content: Row[] };
  ok(r.status === 200 && d.actions.length === 0, 'un id inexistente no guarda nada');
  ok(results.content[0].is_error === true && String(results.content[0].content).includes('No existe'), 'el error vuelve a Claude como tool_result is_error');
  ok((anthropicRequests.at(-1)!.body.messages as Row[]).length === 5 + 2 + 2, 'el historial anterior se reenvía completo');
}

// 4. Historial enorme → se recorta por delante, hasta un turno del usuario
{
  const big = 'x'.repeat(30_000);
  const history = Array.from({ length: 6 }, (_, i) => [
    { role: 'user', content: `pregunta ${i} ${big}` },
    { role: 'assistant', content: [{ type: 'text', text: `respuesta ${i}` }] },
  ]).flat();
  scripted.push(message([{ type: 'text', text: 'ok' }], 'end_turn'));
  const r = await call({ message: '¿y ahora?', history, today: TODAY });
  const d = await r.json();
  const sent = anthropicRequests.at(-1)!.body.messages as { role: string; content: unknown }[];
  ok(r.status === 200 && d.dropped > 0 && d.dropped % 2 === 0, `recorta ${d.dropped} mensajes del principio`);
  ok(sent[0].role === 'user' && String(sent[0].content).startsWith('pregunta'), 'el historial recortado empieza en un turno del usuario');
  ok(JSON.stringify(sent).length < 200_000, 'lo enviado a Claude queda acotado');
}

// 5. Validación y cupo agotado
{
  const empty = await call({ message: '   ', history: [], today: TODAY });
  ok(empty.status === 400, 'mensaje vacío → 400');
  await empty.body?.cancel();
  const badHistory = await call({ message: 'hola', history: [{ role: 'hacker', content: 'x' }], today: TODAY });
  ok(badHistory.status === 400, 'historial con roles no válidos → 400');
  await badHistory.body?.cancel();

  quotaReply = -1;
  const before = anthropicRequests.length;
  const r = await call({ message: 'hola', history: [], today: TODAY });
  const d = await r.json();
  ok(r.status === 429 && d.error.includes('30 mensajes'), 'cupo agotado → 429 con mensaje claro');
  ok(anthropicRequests.length === before, 'con el cupo agotado no se llama a Claude');
}

// 6. Error de la API → mensaje legible, sin romper
{
  quotaReply = 10;
  const r = await call({ message: 'hola', history: [], today: TODAY }); // sin guion: la API simulada responde 500
  const d = await r.json();
  ok(r.status === 502 && typeof d.error === 'string', 'un fallo de la API devuelve 502 con mensaje legible');
}

await supabase.shutdown();
await anthropic.shutdown();
console.log(failures ? `\n${failures} comprobación(es) fallida(s)` : '\nTodas las comprobaciones pasan');
Deno.exit(failures ? 1 : 0);
