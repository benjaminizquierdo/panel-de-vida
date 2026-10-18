// Pruebas de los mensajes de error (src/lib/errors.ts).
// Uso: npm run test:lib

import { describeError } from '../src/lib/errors.ts';

let failures = 0;
const ok = (cond: unknown, msg: string) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) failures++;
};

const named = (name: string, message: string) => Object.assign(new Error(message), { name });
const cases: [unknown, string][] = [
  // El fallo real de la fase 3: versión a medias en el navegador.
  [new ReferenceError('SectionTabs is not defined'), 'Falta una pieza del código de la app (SectionTabs).'],
  [new TypeError('Failed to fetch dynamically imported module: http://localhost:5173/src/pages/Finance.tsx'), 'No se ha podido cargar esta parte de la app.'],
  [new TypeError('Importing a module script failed.'), 'No se ha podido cargar esta parte de la app.'],
  [named('ChunkLoadError', 'Loading chunk 3 failed.'), 'No se ha podido cargar esta parte de la app.'],
  [new TypeError('Failed to fetch'), 'No hay conexión con el servidor.'],
  [new TypeError('NetworkError when attempting to fetch resource.'), 'No hay conexión con el servidor.'],
  [new TypeError("Cannot read properties of undefined (reading 'items')"), 'Algunos datos no tienen el formato que la app esperaba.'],
  [new TypeError('rows.map is not a function'), 'Algunos datos no tienen el formato que la app esperaba.'],
  [new Error('Objects are not valid as a React child (found: object with keys {roto}).'), 'Algunos datos no tienen el formato que la app esperaba.'],
  [new Error('JWT expired'), 'Tu sesión ha caducado.'],
  [named('QuotaExceededError', "Failed to execute 'setItem' on 'Storage'"), 'El navegador no tiene espacio para guardar más datos.'],
  // Falta la migración 007 en Supabase (lo que devuelve PostgREST).
  [new Error('Could not find the function public.seed_default_pages(p_pages) in the schema cache'), 'La base de datos no está al día con esta versión de la app.'],
  [new Error("Could not find the 'template' column of 'tabs' in the schema cache"), 'La base de datos no está al día con esta versión de la app.'],
  [new Error('relation "public.user_settings" does not exist'), 'La base de datos no está al día con esta versión de la app.'],
  [new Error('Algo raro'), 'Algo ha fallado en la app.'],
  ['texto suelto', 'Algo ha fallado en la app.'],
  [{ code: 42 }, 'Algo ha fallado en la app.'],
  [undefined, 'Algo ha fallado en la app.'],
];
for (const [error, title] of cases) {
  const got = describeError(error);
  ok(got.title === title, `${got.technical} → «${title}»${got.title !== title ? ` (da «${got.title}»)` : ''}`);
}

const d = describeError(new ReferenceError('SectionTabs is not defined'));
ok(d.advice.includes('Recarga'), 'aconseja recargar');
ok(d.technical === 'ReferenceError: SectionTabs is not defined', 'conserva el error original para los detalles técnicos');

console.log(failures ? `\n${failures} comprobación(es) fallida(s)` : '\nTodas las comprobaciones pasan');
Deno.exit(failures ? 1 : 0);
