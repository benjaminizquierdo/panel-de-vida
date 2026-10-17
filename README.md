# Panel de Vida

Plataforma web para gestionar tu vida personal en un solo sitio: **proyectos y tareas, hábitos y salud, objetivos con revisión semanal, y finanzas en euros**. Cada persona se registra con su cuenta y **solo ve sus propios datos**.

- **Inicio**: lo más importante del día, hábitos de hoy, tareas que vencen, proyectos activos y resumen del mes.
- **Proyectos**: tablero con columnas Pendiente → En curso → Hecha, prioridades, fechas límite y progreso por proyecto.
- **Hábitos y salud**: cuadrícula semanal con rachas 🔥, registro diario de sueño, energía, ejercicio y peso, y gráficos de 14 días.
- **Objetivos**: metas anuales y trimestrales con progreso, y plantilla de revisión semanal (logros, dificultades, aprendizajes, foco).
- **Finanzas**: gastos e ingresos por categoría, presupuesto mensual por categoría, balance y evolución de 6 meses.

Cada cuenta nueva empieza con 5 hábitos, 8 categorías de presupuesto y 2 objetivos de ejemplo, todo editable.

## Arquitectura

```
Navegador (React + TypeScript + Vite)
   │
   ├─ Supabase Auth ──── registro, inicio de sesión, confirmación por email
   └─ Supabase Postgres ─ tablas con Row Level Security: user_id = auth.uid()
```

No hay servidor propio: la app es estática (se despliega gratis en Vercel o Netlify) y habla directamente con Supabase. El aislamiento entre usuarios lo garantiza **la base de datos**, no el frontend: aunque alguien manipule la app, Postgres solo le devuelve y le deja modificar sus propias filas.

Si no configuras Supabase, la app arranca en **modo demo**: las cuentas y los datos se guardan en el `localStorage` del navegador. Sirve para probarla, no para datos reales.

## Probarla en local (modo demo)

Requisitos: Node.js 20 o superior.

```bash
npm install
npm run dev
```

Abre http://localhost:5173, crea una cuenta y listo.

## Ponerla en marcha con Supabase

1. Crea una cuenta y un proyecto gratuito en [supabase.com](https://supabase.com).
2. En el proyecto, ve a **SQL Editor**, pega el contenido de [`supabase/schema.sql`](supabase/schema.sql) y pulsa **Run**. Crea las tablas, las políticas de seguridad y los datos iniciales de cada cuenta nueva.
3. En **Project Settings → API**, copia la *Project URL* y la clave *anon public*.
4. Copia `.env.example` como `.env.local` y rellena:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
5. En **Authentication → URL Configuration**, pon como *Site URL* la dirección donde vivirá la app (por ejemplo `http://localhost:5173` mientras pruebas, y tu dominio de Vercel después). Es a donde lleva el enlace del email de confirmación.
6. `npm run dev` y regístrate. Por defecto Supabase pide confirmar el email; puedes desactivarlo en **Authentication → Providers → Email** si lo prefieres.

> La clave *anon* está pensada para ir en el navegador: es pública por diseño y la seguridad la ponen las políticas RLS. **Nunca** uses la clave `service_role` en la app.

## Desplegar en internet (Vercel)

1. Sube el repositorio a GitHub.
2. En [vercel.com](https://vercel.com) → *Add New Project* → importa el repositorio. Vercel detecta Vite solo.
3. En *Environment Variables* añade `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
4. Despliega y añade la URL resultante como *Site URL* en Supabase (paso 5 anterior).

Netlify o Cloudflare Pages funcionan igual: comando de build `npm run build`, carpeta `dist`.

## Añadir datos desde la terminal (o pedírselo a Claude)

`scripts/panel.mjs` lee y escribe en **tu** cuenta, iniciando sesión con tu email y contraseña. Así un asistente como Claude Code puede registrar cosas por ti cuando se lo pidas («apunta 45 € de cena», «marca que hoy he meditado»). Añade a `.env.local`:

```
PANEL_EMAIL=tu@email.com
PANEL_PASSWORD=tu-contraseña
```

Ejemplos:

```bash
npm run panel -- resumen
npm run panel -- gasto 45,50 Comida Cena con amigos
npm run panel -- ingreso 1500 Nómina --fecha 2026-10-01
npm run panel -- habito meditar
npm run panel -- salud '{"sleep_hours": 7.5, "energy": 4, "exercise_minutes": 30}'
npm run panel -- tarea Diseñar portada --proyecto "Web personal" --prioridad alta --limite 2026-10-31
npm run panel -- destacado Terminar el informe
npm run panel -- list transactions 10
npm run panel -- add goals '{"title": "Correr 10 km", "horizon": "trimestral", "area": "salud", "target": 10, "unit": "km"}'
```

`.env.local` está en `.gitignore`: tus credenciales no se suben al repositorio.

## Tests

```bash
npm run typecheck   # tipos de TypeScript
npm run test:db     # ejecuta schema.sql en Postgres (PGlite) y comprueba el aislamiento entre usuarios
npm run build       # build de producción en dist/
```

`test:db` verifica, entre otras cosas, que un usuario no puede leer, modificar, borrar ni enlazar datos de otro, que los anónimos no tienen acceso, y que los borrados en cascada funcionan.

## Estructura

```
src/
  backend/        Contrato común + implementación Supabase y modo demo (localStorage)
  components/     UI compartida, acceso y avisos
  lib/            Tipos, valores por defecto, utilidades y hooks de datos
  pages/          Inicio, Proyectos, Hábitos, Objetivos, Finanzas
supabase/
  schema.sql      Tablas, Row Level Security y datos iniciales de cada cuenta
scripts/
  panel.mjs       Línea de comandos para leer/escribir datos
tests/
  schema.test.mjs Test del esquema y de la seguridad por filas
```

## Personalizar

- **Categorías de gasto e ingreso, colores, hábitos y presupuestos iniciales**: `src/lib/defaults.ts`. Si cambias los datos iniciales, actualiza también la función `seed_new_user()` en `supabase/schema.sql`.
- **Tema**: los colores están como variables CSS al principio de `src/styles.css`, con versión clara y oscura (sigue el tema del sistema).
