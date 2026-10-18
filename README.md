# Panel de Vida

Plataforma web para gestionar tu vida personal en un solo sitio: **proyectos y tareas, hábitos y salud, objetivos con revisión semanal, y finanzas en euros**. Cada persona se registra con su cuenta y **solo ve sus propios datos**.

Todo se organiza en **categorías que diseñas tú**: cada una es una página montada con bloques que arrastras, colocas y redimensionas, con subcategorías sin límite de niveles (ver [Diseñador de categorías](#diseñador-de-categorías)). Cada cuenta empieza con estas, que se pueden cambiar o borrar como cualquier otra:

- **Inicio**: lo más importante del día, hábitos de hoy, tareas que vencen, proyectos activos y resumen del mes.
- **Proyectos**: tablero con columnas Pendiente → En curso → Hecha, prioridades, fechas límite y progreso por proyecto.
- **Hábitos y salud**: cuadrícula semanal con rachas 🔥, registro diario de sueño, energía, ejercicio y peso, y gráficos de 14 días.
- **Objetivos**: metas anuales y trimestrales con progreso, y plantilla de revisión semanal (logros, dificultades, aprendizajes, foco).
- **Finanzas**: gastos e ingresos por categoría, presupuesto mensual por categoría, balance y evolución de 6 meses. Las **categorías son tuyas**: créalas con icono y color, añade subcategorías (p. ej. Comida → Supermercado), reordénalas, archívalas o fusiónalas con otra conservando los movimientos. **Movimientos periódicos** (suscripciones, alquiler, nómina) que se apuntan solos cada semana, mes o año. **Importa movimientos bancarios** desde el export de tu banco (por ahora, Trade Republic; ver abajo).
- **Categorías tuyas**: «Viajes › Japón 2027 › Itinerario», «Gym», «Estudios»… con bloques de notas, checklist y enlaces, y cualquier bloque de la app (presupuesto, hábitos de hoy, revisión semanal…).
- **Asistente de IA** 💬: un chat (con Claude) al que le cuentas lo que has hecho —«hoy he corrido 30 minutos y me he gastado 12 € en el almuerzo»— y lo registra en tu panel; también responde preguntas sobre tus datos.

Cada cuenta nueva empieza con 5 hábitos, 8 categorías de presupuesto y 2 objetivos de ejemplo, todo editable.

Si algo falla, la app no se queda en blanco: explica qué ha pasado cuando se puede saber (sin conexión, versión a medio cargar, datos con un formato inesperado, sesión caducada, base de datos sin la última migración…), qué hacer, y guarda los detalles técnicos para copiarlos. Si falla un bloque o una página, el resto de la app sigue funcionando (`src/lib/errors.ts` y `src/components/ErrorBoundary.tsx`).

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

## Importar movimientos bancarios

En **Finanzas → Importación movimientos bancarios** se elige el banco y se sube el archivo que exporta; se lee en el navegador y no se guarda nada hasta confirmar.

- **Bancos**: el selector ofrece los bancos integrados, cada uno con su logo y sus instrucciones para exportar (por ahora, **Trade Republic**), y al final **Otro banco (CSV)**. Si el archivo no es del banco elegido, se avisa. La lista no la puede ampliar el usuario: cada banco se añade en el código (ver *Personalizar*).
- **Trade Republic**: export oficial de transacciones en CSV. La compraventa de valores viene desmarcada (no es gasto ni ingreso).
- **Otro banco (CSV)**: se adivinan las columnas de fecha, importe y descripción por su nombre y se pueden corregir; hay opción de invertir el signo para bancos que exportan los gastos en positivo. Entiende «1.234,56», «-12.50», fechas DD/MM/AAAA, etc. Si el archivo resulta ser de un banco integrado, se lee con el formato de ese banco.
- **Agrupaciones**: la vista previa muestra los movimientos en desplegables **por tipo** de operación, **por mes y tipo** o **sin agrupar** (se recuerda la última elegida). Cada grupo tiene su casilla para incluirlo o excluirlo entero, y dentro se sigue pudiendo marcar o desmarcar cada movimiento.
- **Categorías propuestas**: primero tus reglas («si el comercio contiene X → categoría Y»), después el **código MCC** del pago con tarjeta (5411 supermercado, 5812 restaurante, 4899 suscripciones…). Si cambias la categoría de un comercio en la vista previa, se aplica a todos sus movimientos y se recuerda para la próxima importación.
- **Sin duplicados**: cada movimiento importado guarda su origen (el banco) y su identificador (`transaction_id` en Trade Republic; en otros bancos, la columna de identificador si la hay o fecha + importe + texto). Reimportar el mismo archivo salta lo ya guardado; lo garantiza una restricción única en la base de datos (migración 004).

## Movimientos periódicos

En **Finanzas → Periódicos** (o marcando «Es periódico» al añadir un movimiento, que despliega frecuencia, primera fecha y fin) se crea un gasto o ingreso que se repite **cada semana, mes o año**, con fecha de fin opcional. La vista muestra los gastos e ingresos fijos al mes y permite pausar, editar o eliminar cada uno; eliminarlo conserva los movimientos ya creados.

- **Se generan solos**: una tarea diaria de `pg_cron` en Supabase (04:10 UTC) crea los que tocan, y la app hace lo mismo al iniciar sesión como respaldo. Si `pg_cron` no está disponible en tu proyecto, la migración 005 sigue adelante y solo queda la vía de la app.
- **Calendario**: un mensual del día 31 cae el último día de los meses cortos; un anual del 29 de febrero, el 28 en años no bisiestos. Al crear uno con fecha pasada se apuntan los periodos pendientes; al reanudar uno pausado, no.
- **Sin duplicados**: cada movimiento generado lleva `source = 'recurrente'` y como id externo `<id del periódico>:<fecha>`, con la misma restricción única que la importación. Si borras uno generado, no vuelve a aparecer.
- El asistente también los crea («apunta Netflix 12,99 € cada mes»).

## Diseñador de categorías

Cada página es una **categoría**. El menú lateral muestra el árbol (en el móvil se abre con ☰):

- **＋ Nueva categoría** crea una de primer nivel; el **＋** de cada fila, una subpágina dentro. No hay límite de niveles; arriba de cada página, las migas de pan (Viajes › Japón 2027) y sus subpáginas.
- **Reordenar**: en el ordenador, arrastra una fila del árbol: sobre la mitad de otra la mete dentro; arriba o abajo, antes o después. También desde **⚙ Página → Dentro de**.
- **✎ Personalizar** abre el modo diseño de la página:
  - **En el ordenador (panel libre)**: el catálogo aparece a la derecha; arrastra un bloque hasta el sitio exacto o haz clic para ponerlo en el primer hueco. Cada bloque se mueve arrastrando su cabecera (⠿) y se redimensiona por el borde o la esquina; los demás suben solos a rellenar huecos.
  - **En el móvil**: los bloques se apilan a todo el ancho; **＋ Bloque** abre el catálogo y las flechas **↑ ↓** cambian el orden.
  - **⚙** de cada bloque: título, ajustes propios (reinicio de la checklist, qué objetivos mostrar), ancho y alto. El alto es **automático** (mide lo que su contenido) hasta que lo estiras a mano o eliges «Fijo»; los gráficos tienen alto fijo.
  - **⚙ Página**: nombre, icono, dónde va, añadir subpágina, **restablecer el diseño original** (en las categorías por defecto) y eliminar.

**Bloques que cruzan datos de toda la app** (marcados como «Nuevo» en el catálogo):

| Bloque | Qué hace |
|---|---|
| 📅 Agenda de hoy | Lo más importante, tareas que vencen (y vencidas), hábitos pendientes y cargos de hoy y mañana, para marcarlos ahí mismo |
| 🏅 Puntuación del día | Nota de 0 a 100: hábitos (40 %), lo más importante (20 %), tareas del día (20 %) y gasto dentro del presupuesto diario (20 %), con la semana |
| ⏳ Progreso del año | Semana, mes y año transcurridos frente al progreso de tus objetivos anuales |
| ⏱️ Cuenta atrás | Días que faltan para tus fechas (viajes, exámenes…) |
| 🗓️ Calendario del mes | Tareas con fecha, cargos periódicos (cobrados y por cobrar) y revisiones |
| 🔗 Qué te funciona | Compara tu sueño, energía y gasto variable los días que cumples cada hábito frente a los que no (90 días, mínimo 5 días a cada lado; es correlación, no causa) |
| 🔥 Cadena de un hábito | 26 semanas de un hábito, racha actual y mejor racha |
| 🟩 Año en píxeles | Cada día del año con el color de cuántos hábitos cumpliste |
| 💳 Próximos cargos | Cargos e ingresos periódicos de los próximos 30 días |
| 📺 Suscripciones | Coste al mes y al año de tus gastos periódicos y cuánto ahorrarías quitando el más caro |
| 📉 Ritmo de gasto | Previsión de fin de mes (fijo cobrado + fijo pendiente + variable al ritmo actual) frente al presupuesto |
| 🍩 Gasto por categoría | Gráfico circular del mes |
| 🐷 Hucha | Objetivo de ahorro en € con aportaciones y lo que hay que apartar al mes para llegar a la fecha |

Además están los básicos (notas, checklist que puede reiniciarse cada día o cada lunes, enlaces) y los bloques de la app que tienen sentido fuera de su página, muchos con **filtro**: en una página «Viajes» puedes poner «Movimientos del mes» solo de la categoría Viajes, el tablero de un único proyecto o los hábitos que quieras. Las pantallas completas (importador, gestor de categorías, periódicos, formulario de salud…) siguen en su categoría por defecto, pero no se ofrecen en el catálogo. Los cálculos están en `src/lib/insights.ts` (probados en `tests/insights.test.ts`).

**Categorías por defecto**: Inicio, Proyectos, Hábitos y salud, Objetivos y Finanzas (con Periódicos, Categorías e Importación movimientos bancarios dentro). Se crean la primera vez que entra cada cuenta, con `seed_default_pages()`, a partir de `src/lib/pageTemplates.ts`. Borrarlas **no borra tus datos** (movimientos, hábitos, tareas…) y desde el menú lateral, **↺ Recuperar categorías por defecto**, vuelven con su diseño original.

Los datos están en `tabs` (páginas, con `parent_id` para anidar y `template` para las de por defecto) y `blocks` (tipo, título, contenido JSON y posición `x, y, w, h` en una rejilla de 12 columnas), migraciones 006 y 007. Al aplicar la 007, las sub-pestañas de la versión anterior pasan a ser subpáginas de su categoría, con sus bloques.

## Proyectos por tipos

Cada proyecto es de un **tipo**, con su icono, color, campos propios y una vista adaptada:

| Tipo | Campos | Su vista |
|---|---|---|
| 💼 Profesional | cliente, entrega, horas estimadas, fase (propuesta → entregado) | fases, kanban, horas estimadas frente a reales, cuenta atrás, avance |
| 🎓 Estudios | curso o certificación, fecha de examen, horas previstas | temario por módulos con %, cuenta atrás al examen, horas de estudio |
| 🔥 Hábito / reto | frecuencia (cada día o X veces por semana), fin opcional | marcar hoy, racha actual y mejor racha, mapa de calor |
| 🎨 Creativo | fase (idea → publicado) | lluvia de ideas, galería de referencias, fases |
| 💪 Salud y deporte | unidad, valor inicial, objetivo | registro de valores y gráfico de evolución con la línea del objetivo |
| 🏠 Personal / hogar | — | checklist simple |
| 📚 Aprendizaje libre | — | recursos con estado (pendiente / en curso / terminado) y notas |
| ✈️ Viaje / evento | destino, fechas, presupuesto | cuenta atrás, presupuesto frente a gastado, checklist de preparación |
| 📁 General | — | kanban |

- **Página Proyectos**: «Foco de hoy» (la tarea más prioritaria de todos los proyectos activos: vencidas, de hoy, prioridad, fecha), tarjetas con progreso, siguiente paso y **semáforo** (rojo: tareas vencidas; amarillo: sin tareas pendientes o 7 días sin actividad; verde: al día; gris: pausado o terminado), filtros por tipo y estado y **＋ Nuevo proyecto** (primero el tipo, luego sus campos).
- **Página de cada proyecto**: se crea la primera vez que lo abres con la plantilla de su tipo y es una página del diseñador más (✎ Personalizar), aunque no sale en el menú. Tiene la pestaña **Notas y adjuntos** (notas, enlaces y documentos). En ⚙ Proyecto se editan sus datos, su estado y su tipo, se restablece la vista de su tipo o se elimina.
- **Gastos de un viaje**: son movimientos normales de Finanzas vinculados al proyecto (cuentan en el presupuesto del mes). Si borras el proyecto, el gasto se queda en Finanzas.
- **Ficha de cada tarea**: en el kanban (y en «Foco de hoy»), pulsar una tarea abre su ficha, al estilo de un *work item* de DevOps: título, **tipo** (tarea, error, mejora, investigación, diseño, documentación, reunión), estado, prioridad, fecha límite, proyecto, **estimación y horas dedicadas** (con lo que queda), **descripción** y sus **notas, enlaces y documentos**. La tarjeta muestra el tipo (con su color), el tiempo, si tiene descripción y cuántos adjuntos tiene, y cada columna suma sus horas. Los tipos de tarea están en `TASK_KINDS` (`src/lib/tasks.ts`); datos en `tasks` (`kind`, `description`, `estimate_hours`, `spent_hours`) y `task_items`, migración 009.
- **Adjuntos**: en Supabase Storage (bucket privado `adjuntos`, una carpeta por usuario, hasta 10 MB por archivo); en el modo demo, en el navegador (hasta 1 MB).
- Todos los bloques nuevos están en el catálogo (grupo «Proyectos y tareas»), también los gráficos: avance del proyecto, tareas completadas por semana, horas por semana, evolución hacia el objetivo y proyectos por tipo.

Los tipos se definen solo con configuración en `PROJECT_KINDS` (`src/lib/projectKinds.ts`); los cálculos de progreso, semáforo, foco y rachas están en `src/lib/projects.ts` (probados en `tests/projects.test.ts`). Datos: `projects.kind` y `projects.fields`, `project_items` (módulos, temas, recursos, ideas, referencias, notas, enlaces y archivos), `project_logs` (horas, valores y días cumplidos), `transactions.project_id` y `tabs.project_id`, migración 008.

## Cuerpo y nutrición

Página **Nutrición** (dentro de Hábitos y salud) y bloques del grupo «Cuerpo y nutrición» del catálogo:

| Bloque | Qué hace |
|---|---|
| 🥗 Macros de hoy | Anillo de kcal y barras de proteína, hidratos y grasa frente a tus objetivos, lo que te queda y lo que te ha costado la comida del día |
| 🍽️ Diario de comidas | Desayuno, comida, merienda, cena y otros, día a día. Añade de tus alimentos, buscando en Open Food Facts, **escaneando el código de barras** con la cámara o a mano; «Repetir ayer» |
| 🛒 Buscador de productos | Productos de supermercados de España con sus macros por 100 g; guárdalos con **tu precio** (se recuerda) y tu tienda |
| 🧺 Mis alimentos | Tu catálogo: macros por 100 g, precio por kilo y favoritos |
| ⚖️ Peso | Apunta tu peso; media de 7 días, **cuánto te falta** para tu objetivo, a qué ritmo vas (kg/semana) y **cuándo llegarías** |
| 📉 Evolución del peso | Gráfico de pesos y media de 7 días con la línea del objetivo |
| 📊 Kcal y proteína · 14 días | Kcal de cada día frente al objetivo y la proteína |
| 💧 Agua de hoy | Un toque por vaso |
| 👟 Pasos y kcal quemadas | De momento a mano; con la app de Android los traerá Health Connect |

- **Objetivos** (🎯 en los bloques): kcal, macros (con «Repartir 30/40/30»), agua, pasos y peso objetivo con fecha opcional.
- **Precios**: los pones tú la primera vez (precio y peso del envase) y la app calcula lo que cuesta cada ración. Sin depender de servicios de pago ni de accesos no oficiales a supermercados.
- **Open Food Facts** es una base de datos abierta y gratuita (licencia ODbL). Por código de barras se consulta directamente desde el navegador. Su buscador por nombre no admite peticiones desde otras webs, así que la app lo consulta a través de la Edge Function **`food-search`** (gratis, sin clave). Despliégala una vez:
  ```bash
  npx supabase functions deploy food-search --project-ref <tu-project-ref> --no-verify-jwt --use-api
  ```
  Sin ella, el escáner, el código de barras y los alimentos a mano funcionan igual. En el modo demo no hay buscador por nombre.
- **Escáner**: usa el lector de códigos del navegador si lo tiene (Chrome en Android) y, si no, [ZXing](https://github.com/zxing-js/library) (licencia Apache-2.0), que solo se descarga al abrir la cámara. La cámara exige una dirección segura (https, o `localhost`).

Datos: `nutrition_goals`, `foods` (valores por 100 g, precio por envase), `food_logs` (cada entrada guarda sus valores: cambiar o borrar un alimento no cambia lo que ya comiste) y `water_ml`, `steps` y `active_kcal` en `health_logs`, migración 010. Cálculos en `src/lib/nutrition.ts` (probados en `tests/nutrition.test.ts`). Las cuentas que ya existían pueden añadir la página desde **↺ Recuperar categorías por defecto** en el menú lateral.

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
npm run test:lib        # importador, periódicos, bloques, errores, rejilla, árbol de páginas, cálculos que cruzan datos y proyectos
npm run build           # build de producción en dist/
```

`test:db` verifica, entre otras cosas, que un usuario no puede leer, modificar, borrar ni enlazar datos de otro, que los anónimos no tienen acceso, que los borrados en cascada funcionan y que nadie puede ampliar su cupo del asistente. `test:assistant` comprueba autenticación, cupo, contexto, bucle de herramientas, escrituras y recorte del historial (no necesita clave de Anthropic; descarga Deno con `npx` la primera vez).

## Estructura

```
src/
  backend/        Contrato común + implementación Supabase y modo demo (localStorage)
  components/     UI compartida, acceso, avisos, chat del asistente, menú lateral, panel de bloques y catálogo
  assets/banks/   Logos de los bancos del importador
  blocks/         Componente de cada tipo de bloque: básicos y, en blocks/app, los de la app
  lib/            Tipos, valores por defecto, utilidades, hooks de datos, importador, bancos, catálogo de bloques,
                  rejilla (layout.ts), árbol de páginas y categorías por defecto (pageTemplates.ts)
  pages/          Vista de una página (PageView) y las vistas grandes de finanzas que usan sus bloques
supabase/
  migrations/
    001_base.sql        Tablas, Row Level Security y datos iniciales de cada cuenta
    002_asistente.sql   Límite diario de mensajes del asistente
    003_categorias.sql  Categorías de finanzas personalizables (migra los datos existentes)
    004_importacion.sql Origen e id externo de cada movimiento (sin duplicados) y reglas por comercio
    005_periodicos.sql  Movimientos periódicos y su generación diaria con pg_cron
    006_pestanas.sql    Sub-pestañas personalizadas y sus bloques
    007_disenador.sql   Árbol de páginas sin límite, posición y tamaño de los bloques, categorías por defecto
    008_tipos_proyecto.sql Tipos de proyecto, temario/recursos/notas, registros, gastos por proyecto y adjuntos
    009_detalle_tareas.sql Ficha de cada tarea: tipo, descripción, estimación, horas y sus notas, enlaces y documentos
    010_nutricion.sql   Objetivos de nutrición, alimentos con precio, diario de comidas; agua, pasos y kcal quemadas
  functions/assistant/
    index.ts      Servidor: sesión, cupo, bucle de herramientas con Claude
    tools.ts      Herramientas (registrar gastos, periódicos, hábitos, salud, tareas, objetivos; consultar)
    prompt.ts     Prompt de sistema y contexto de cada turno
  functions/food-search/
    index.ts      Buscador de productos de Open Food Facts por nombre (para la app)
scripts/
  panel.mjs       Línea de comandos para leer/escribir datos
tests/
  schema.test.mjs    Test del esquema y de la seguridad por filas
  assistant.test.ts  Test de la Edge Function con servicios simulados
  importer.test.ts   Test del lector de CSV y del importador
  recurring.test.ts  Test del calendario de los periódicos
  blocks.test.ts     Test de los bloques (reinicio de la checklist, enlaces seguros, orden)
  errors.test.ts     Test de los mensajes de error
  layout.test.ts     Test de la rejilla del panel (compactar, huecos, flechas del móvil)
  pages.test.ts      Test del árbol de páginas, del catálogo de bloques y de las categorías por defecto
  insights.test.ts   Test de correlaciones, puntuación del día, rachas, próximos cargos y ritmo de gasto
  projects.test.ts   Test de los tipos de proyecto: campos, plantillas, progreso, semáforo, foco y rachas
  tasks.test.ts      Test de los tipos de tarea y de su tiempo (estimado, dedicado y restante)
  nutrition.test.ts  Test de raciones, precios, totales, tendencia del peso y lectura de Open Food Facts
```

## Personalizar

- **Hábitos, categorías y presupuestos con los que empieza cada cuenta**: `src/lib/defaults.ts` (modo demo) y, para Supabase, `create_default_finance_categories()` y `seed_new_user()` en una migración nueva. Cada usuario puede después cambiar sus categorías desde Finanzas → Categorías.
- **Añadir un banco al importador**: escribe su lector en `src/lib/importer.ts` (reconocer la cabecera y convertir cada fila; `readGeneric()` ya resuelve columnas de fecha, importe y texto), pon su logo en `src/assets/banks/` y añádelo a `BANKS` en `src/lib/banks.ts` con sus instrucciones. Su `id` queda guardado como origen de los movimientos importados, así que no se cambia una vez publicado.
- **Añadir un tipo de bloque**: su nombre, descripción, grupo, tamaño y ajustes en `BLOCK_KINDS` (`src/lib/blockKinds.ts`) y su componente en `src/blocks/` (registrado en `src/blocks/index.tsx`). No hace falta migración: la base de datos acepta cualquier tipo con forma de identificador.
- **Añadir un tipo de proyecto**: una entrada en `PROJECT_KINDS` (`src/lib/projectKinds.ts`) con sus campos, fases, regla de progreso y plantilla de bloques, y su id en `supabase/functions/assistant/projectKinds.ts`. No hace falta migración.
- **Cambiar las categorías por defecto**: `DEFAULT_PAGES` en `src/lib/pageTemplates.ts` (afecta a las cuentas nuevas y a «Restaurar»).
- **Tema**: los colores están como variables CSS al principio de `src/styles.css`, con versión clara y oscura (sigue el tema del sistema).
