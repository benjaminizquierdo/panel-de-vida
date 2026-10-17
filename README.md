# Panel de Vida

Plataforma web para gestionar tu vida personal en un solo sitio: **proyectos y tareas, hábitos y salud, objetivos con revisión semanal, y finanzas en euros**. Cada persona se registra con su cuenta y **solo ve sus propios datos**.

- **Inicio**: lo más importante del día, hábitos de hoy, tareas que vencen, proyectos activos y resumen del mes.
- **Proyectos**: tablero con columnas Pendiente → En curso → Hecha, prioridades, fechas límite y progreso por proyecto.
- **Hábitos y salud**: cuadrícula semanal con rachas 🔥, registro diario de sueño, energía, ejercicio y peso, y gráficos de 14 días.
- **Objetivos**: metas anuales y trimestrales con progreso, y plantilla de revisión semanal (logros, dificultades, aprendizajes, foco).
- **Finanzas**: gastos e ingresos por categoría, presupuesto mensual por categoría, balance y evolución de 6 meses. Las **categorías son tuyas**: créalas con icono y color, añade subcategorías (p. ej. Comida → Supermercado), reordénalas, archívalas o fusiónalas con otra conservando los movimientos. **Movimientos periódicos** (suscripciones, alquiler, nómina) que se apuntan solos cada semana, mes o año. **Importa movimientos** desde el CSV de Trade Republic o de cualquier banco (ver abajo).
- **Asistente de IA** 💬: un chat (con Claude) al que le cuentas lo que has hecho —«hoy he corrido 30 minutos y me he gastado 12 € en el almuerzo»— y lo registra en tu panel; también responde preguntas sobre tus datos.

Cada cuenta nueva empieza con 5 hábitos, 8 categorías de presupuesto y 2 objetivos de ejemplo, todo editable.

## Arquitectura

```
Navegador (React + TypeScript + Vite)
   │
   ├─ Supabase Auth ──── registro, inicio de sesión, confirmación por email
   ├─ Supabase Postgres ─ tablas con Row Level Security: user_id = auth.uid()
   └─ Edge Function «assistant» ──▶ API de Claude
          (la clave de Anthropic vive aquí; lee y escribe con la sesión del usuario, así que RLS también le aplica)
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
2. En el proyecto, ve a **SQL Editor** y ejecuta, **en orden y una vez cada uno**, los archivos de [`supabase/migrations`](supabase/migrations): pega el contenido y pulsa **Run**. Crean las tablas, las políticas de seguridad y los datos iniciales de cada cuenta nueva. Cuando actualices la app, ejecuta solo las migraciones nuevas (cada una dice al principio qué hace y sirve sobre una base con datos).
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

## Importar movimientos (CSV)

En **Finanzas → Importar** se sube un CSV; se lee en el navegador y no se guarda nada hasta confirmar.

- **Trade Republic** se reconoce por su cabecera (export oficial de transacciones). La compraventa de valores viene desmarcada (no es gasto ni ingreso).
- **Agrupaciones**: la vista previa muestra los movimientos en desplegables **por tipo** de operación, **por mes y tipo** o **sin agrupar** (se recuerda la última elegida). Cada grupo tiene su casilla para incluirlo o excluirlo entero, y dentro se sigue pudiendo marcar o desmarcar cada movimiento.
- **Otros bancos**: se adivinan las columnas de fecha, importe y descripción por su nombre y se pueden corregir; hay opción de invertir el signo para bancos que exportan los gastos en positivo. Entiende «1.234,56», «-12.50», fechas DD/MM/AAAA, etc.
- **Categorías propuestas**: primero tus reglas («si el comercio contiene X → categoría Y»), después el **código MCC** del pago con tarjeta (5411 supermercado, 5812 restaurante, 4899 suscripciones…). Si cambias la categoría de un comercio en la vista previa, se aplica a todos sus movimientos y se recuerda para la próxima importación.
- **Sin duplicados**: cada movimiento importado guarda su origen y su identificador (`transaction_id` en Trade Republic; en otros bancos, fecha + importe + texto). Reimportar el mismo archivo salta lo ya guardado; lo garantiza una restricción única en la base de datos (migración 004).

## Movimientos periódicos

En **Finanzas → Periódicos** (o marcando «Es periódico» al añadir un movimiento, que despliega frecuencia, primera fecha y fin) se crea un gasto o ingreso que se repite **cada semana, mes o año**, con fecha de fin opcional. La vista muestra los gastos e ingresos fijos al mes y permite pausar, editar o eliminar cada uno; eliminarlo conserva los movimientos ya creados.

- **Se generan solos**: una tarea diaria de `pg_cron` en Supabase (04:10 UTC) crea los que tocan, y la app hace lo mismo al iniciar sesión como respaldo. Si `pg_cron` no está disponible en tu proyecto, la migración 005 sigue adelante y solo queda la vía de la app.
- **Calendario**: un mensual del día 31 cae el último día de los meses cortos; un anual del 29 de febrero, el 28 en años no bisiestos. Al crear uno con fecha pasada se apuntan los periodos pendientes; al reanudar uno pausado, no.
- **Sin duplicados**: cada movimiento generado lleva `source = 'recurrente'` y como id externo `<id del periódico>:<fecha>`, con la misma restricción única que la importación. Si borras uno generado, no vuelve a aparecer.
- El asistente también los crea («apunta Netflix 12,99 € cada mes»).

## Activar el asistente de IA

El asistente es una [Edge Function](https://supabase.com/docs/guides/functions) de Supabase (`supabase/functions/assistant`) que llama a la API de Claude con herramientas para registrar y consultar datos. Puede **añadir y modificar**, nunca borrar, y cada usuario tiene un **límite diario de mensajes** (30 por defecto) para acotar el coste. Sin esto configurado, la app funciona igual y el chat avisa de que no está disponible.

1. **Base de datos**: la migración [`002_asistente.sql`](supabase/migrations/002_asistente.sql) crea el contador del límite diario (ya incluida si ejecutaste todas las migraciones).
2. **Clave de Anthropic**: en [console.anthropic.com](https://console.anthropic.com) crea una API key y, en *Limits*, fija un tope de gasto mensual. Pagas el uso de todos los usuarios.
3. **Secretos de la función**: en Supabase → **Edge Functions → Secrets**, añade `ANTHROPIC_API_KEY` con tu clave. Opcionales:
   | Secreto | Por defecto | Para qué |
   |---|---|---|
   | `ASSISTANT_MODEL` | `claude-haiku-5-5` | Modelo de Claude. Haiku es el más barato (~0,06 céntimos de $ por mensaje); `claude-sonnet-5-5` o `claude-opus-5-5` entienden mejor peticiones complejas, a mayor coste |
   | `ASSISTANT_EFFORT` | `low` | Cuánto razona antes de responder: `low`, `medium` o `high` |
   | `ASSISTANT_DAILY_LIMIT` | `30` | Mensajes por usuario y día |
4. **Desplegar la función** (una vez y cada vez que cambies su código):
   ```bash
   npx supabase login
   npx supabase functions deploy assistant --project-ref <tu-project-ref> --no-verify-jwt --use-api
   ```
   El *project ref* es el identificador de tu URL (`https://<ref>.supabase.co`). `--no-verify-jwt` es intencionado: la función comprueba ella misma la sesión con `auth.getUser()`, lo que funciona también con las claves nuevas de Supabase.

Cómo funciona por dentro: el prompt de sistema y las herramientas son fijos (se cachean); la fecha y el estado del usuario (hábitos, proyectos, tareas, objetivos) van en cada turno como mensaje `role: "system"`. La app guarda la conversación en `sessionStorage` y la reenvía sin modificarla; el servidor recorta los turnos más antiguos si crece demasiado.

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
npm run typecheck       # tipos de TypeScript
npm run test:db         # ejecuta los .sql en Postgres (PGlite) y comprueba el aislamiento entre usuarios
npm run test:assistant  # ejecuta la Edge Function en Deno contra Supabase y Claude simulados
npm run test:lib        # lector de CSV e importador, y calendario de los periódicos
npm run build           # build de producción en dist/
```

`test:db` verifica, entre otras cosas, que un usuario no puede leer, modificar, borrar ni enlazar datos de otro, que los anónimos no tienen acceso, que los borrados en cascada funcionan y que nadie puede ampliar su cupo del asistente. `test:assistant` comprueba autenticación, cupo, contexto, bucle de herramientas, escrituras y recorte del historial (no necesita clave de Anthropic; descarga Deno con `npx` la primera vez).

## Estructura

```
src/
  backend/        Contrato común + implementación Supabase y modo demo (localStorage)
  components/     UI compartida, acceso, avisos y chat del asistente
  lib/            Tipos, valores por defecto, utilidades y hooks de datos
  pages/          Inicio, Proyectos, Hábitos, Objetivos, Finanzas
supabase/
  migrations/
    001_base.sql        Tablas, Row Level Security y datos iniciales de cada cuenta
    002_asistente.sql   Límite diario de mensajes del asistente
    003_categorias.sql  Categorías de finanzas personalizables (migra los datos existentes)
    004_importacion.sql Origen e id externo de cada movimiento (sin duplicados) y reglas por comercio
    005_periodicos.sql  Movimientos periódicos y su generación diaria con pg_cron
  functions/assistant/
    index.ts      Servidor: sesión, cupo, bucle de herramientas con Claude
    tools.ts      Herramientas (registrar gastos, periódicos, hábitos, salud, tareas, objetivos; consultar)
    prompt.ts     Prompt de sistema y contexto de cada turno
scripts/
  panel.mjs       Línea de comandos para leer/escribir datos
tests/
  schema.test.mjs    Test del esquema y de la seguridad por filas
  assistant.test.ts  Test de la Edge Function con servicios simulados
  importer.test.ts   Test del lector de CSV y del importador
  recurring.test.ts  Test del calendario de los periódicos
```

## Personalizar

- **Hábitos, categorías y presupuestos con los que empieza cada cuenta**: `src/lib/defaults.ts` (modo demo) y, para Supabase, `create_default_finance_categories()` y `seed_new_user()` en una migración nueva. Cada usuario puede después cambiar sus categorías desde Finanzas → Categorías.
- **Tema**: los colores están como variables CSS al principio de `src/styles.css`, con versión clara y oscura (sigue el tema del sistema).
