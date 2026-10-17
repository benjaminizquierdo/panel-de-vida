// Traduce un fallo inesperado a un mensaje que la persona entienda y sepa qué hacer.
// Funciones puras para poder probarlas: tests/errors.test.ts.

export interface ErrorDescription {
  /** Qué ha pasado, en una frase. */
  title: string;
  /** Qué puede hacer la persona. */
  advice: string;
  /** Nombre y mensaje originales, para la sección «Detalles técnicos». */
  technical: string;
}

const RELOAD = 'Recarga la página. Si vuelve a pasar, copia los detalles técnicos y envíalos a quien mantiene la app.';

/** Patrones de fallos conocidos, del más concreto al más general. */
const KNOWN: { test: (name: string, message: string) => boolean; describe: (message: string) => Omit<ErrorDescription, 'technical'> }[] = [
  {
    // Un trozo de la app que se carga al abrir la pestaña no ha llegado (nueva versión publicada o sin conexión).
    test: (name, m) =>
      name === 'ChunkLoadError' ||
      /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk .* failed/i.test(m),
    describe: () => ({
      title: 'No se ha podido cargar esta parte de la app.',
      advice: 'Suele pasar justo después de publicar una versión nueva o si se ha cortado la conexión. Recarga la página.',
    }),
  },
  {
    test: (_, m) => /Failed to fetch|NetworkError|Network request failed|Load failed|ERR_INTERNET_DISCONNECTED/i.test(m),
    describe: () => ({
      title: 'No hay conexión con el servidor.',
      advice: 'Comprueba tu conexión a internet y vuelve a intentarlo.',
    }),
  },
  {
    // «X is not defined»: falta una pieza del código (versión a medias en el navegador).
    test: (name, m) => name === 'ReferenceError' && /is not defined/.test(m),
    describe: (m) => ({
      title: `Falta una pieza del código de la app (${m.replace(/ is not defined.*/, '')}).`,
      advice: 'Suele pasar cuando la app se actualiza mientras está abierta. Recarga la página.',
    }),
  },
  {
    // Datos con una forma inesperada: «Cannot read properties of undefined (reading 'x')», «x is undefined»…
    test: (name, m) =>
      (name === 'TypeError' && /undefined|null|is not a function|is not iterable/i.test(m)) || /Objects are not valid as a React child/.test(m),
    describe: () => ({
      title: 'Algunos datos no tienen el formato que la app esperaba.',
      advice: RELOAD,
    }),
  },
  {
    test: (_, m) => /JWT expired|invalid JWT|refresh token|session.*(expired|missing)/i.test(m),
    describe: () => ({
      title: 'Tu sesión ha caducado.',
      advice: 'Recarga la página y vuelve a iniciar sesión.',
    }),
  },
  {
    test: (name, m) => name === 'QuotaExceededError' || /quota.*exceeded/i.test(m),
    describe: () => ({
      title: 'El navegador no tiene espacio para guardar más datos.',
      advice: 'En el modo demo los datos viven en el navegador: borra datos de otras webs o usa la app con Supabase.',
    }),
  },
];

export function describeError(error: unknown): ErrorDescription {
  const name = error instanceof Error ? error.name : typeof error;
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error) ?? String(error);
  const technical = `${name}: ${message}`;
  const known = KNOWN.find((k) => k.test(name, message));
  if (known) return { ...known.describe(message), technical };
  return { title: 'Algo ha fallado en la app.', advice: RELOAD, technical };
}
