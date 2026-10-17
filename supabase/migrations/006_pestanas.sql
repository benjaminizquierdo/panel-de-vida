-- Panel de Vida · 006 · Sub-pestañas personalizadas y sus bloques
--
-- Ejecutar DESPUÉS de 001-005 (SQL Editor → pegar → Run). Sirve sobre una base con datos.
--
-- Cada usuario puede crear sub-pestañas dentro de las pestañas principales fijas
-- (Inicio, Proyectos, Hábitos y salud, Objetivos, Finanzas) y llenarlas de bloques:
-- notas, checklist y enlaces. El contenido de cada bloque va en `content` (jsonb),
-- con la forma que define su tipo en src/lib/blocks.ts.
--
-- Preparado para crear pestañas principales propias en una versión futura: serán filas
-- de `tabs` sin `section`, y sus sub-pestañas colgarán de ellas con `parent_id`. La app
-- de esta versión solo crea sub-pestañas de las secciones fijas.

-- Todo o nada: si algo falla, no se aplica ningún cambio.
begin;

create table public.tabs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  -- Pestaña principal fija en la que vive esta sub-pestaña.
  section     text check (section in ('inicio', 'proyectos', 'habitos', 'objetivos', 'finanzas')),
  -- Reservado: pestaña principal propia de la que cuelga (versión futura).
  parent_id   uuid,
  name        text not null check (length(trim(name)) between 1 and 40),
  icon        text not null default '📄' check (length(icon) between 1 and 16),
  sort_order  integer not null default 0,
  unique (id, user_id),
  foreign key (parent_id, user_id) references public.tabs (id, user_id) on delete cascade,
  -- O cuelga de una sección fija o de una pestaña propia, no de las dos.
  check (section is null or parent_id is null)
);

create index on public.tabs (user_id);

create table public.blocks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  tab_id      uuid not null,
  -- Al añadir tipos de bloque (registros, gráficos…), se amplía esta lista en una migración nueva.
  type        text not null constraint blocks_type_check check (type in ('notas', 'checklist', 'enlaces')),
  title       text not null default '' check (length(title) <= 80),
  content     jsonb not null default '{}'::jsonb
              check (jsonb_typeof(content) = 'object' and pg_column_size(content) <= 65536),
  sort_order  integer not null default 0,
  -- Mismo usuario que la pestaña: nadie puede colgar bloques en pestañas ajenas.
  foreign key (tab_id, user_id) references public.tabs (id, user_id) on delete cascade
);

create index on public.blocks (user_id);
create index on public.blocks (tab_id);

alter table public.tabs enable row level security;
create policy "solo el propietario" on public.tabs for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.tabs from anon;

alter table public.blocks enable row level security;
create policy "solo el propietario" on public.blocks for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.blocks from anon;

commit;
