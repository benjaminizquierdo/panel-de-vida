-- Panel de Vida · 008 · Tipos de proyecto
--
-- Ejecutar DESPUÉS de 001-007 (SQL Editor → pegar → Run). Sirve sobre una base con datos.
--
-- Cada proyecto tiene un tipo (profesional, estudios, reto…) con campos propios. Los tipos
-- los define la app (src/lib/projectKinds.ts): añadir uno no exige otra migración. Cada
-- proyecto tiene además su propia página del diseñador (tabs.project_id), que la app crea
-- con la plantilla de su tipo la primera vez que se abre.

-- Todo o nada: si algo falla, no se aplica ningún cambio.
begin;

-- ---------------------------------------------------------------- Proyectos

alter table public.projects
  add column kind text not null default 'general' check (kind ~ '^[a-z][a-z0-9_]{0,39}$'),
  -- Campos propios del tipo (cliente, fecha de examen, presupuesto…): {clave: texto | número}.
  add column fields jsonb not null default '{}'::jsonb
    check (jsonb_typeof(fields) = 'object' and pg_column_size(fields) <= 8192),
  -- Última vez que se tocó el proyecto o algo suyo (para el semáforo «sin actividad en 7 días»).
  add column last_activity_at timestamptz not null default now();

update public.projects p
set last_activity_at = greatest(p.created_at, coalesce((select max(t.created_at) from public.tasks t where t.project_id = p.id), p.created_at));

comment on column public.projects.status is 'activo | pausado | completado (en la app, «Terminado»).';

-- ---------------------------------------------------------------- Tareas

-- Cuándo se marcó como hecha (gráficos de tareas completadas y de avance).
alter table public.tasks add column completed_at timestamptz;
update public.tasks set completed_at = created_at where status = 'hecha';

create or replace function public.tasks_set_completed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'hecha' then
    new.completed_at := null;
  elsif tg_op = 'INSERT' then
    new.completed_at := coalesce(new.completed_at, now());
  elsif old.status <> 'hecha' then
    new.completed_at := now();
  else
    new.completed_at := coalesce(old.completed_at, now());
  end if;
  return new;
end;
$$;

create trigger tasks_completed_at
  before insert or update of status on public.tasks
  for each row execute function public.tasks_set_completed_at();

-- ---------------------------------------------------------------- Elementos de un proyecto

-- Módulos y temas del temario, recursos, ideas, referencias, notas, enlaces y archivos.
-- `kind` lo valida la app, como los tipos de bloque.
create table public.project_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  project_id  uuid not null,
  -- Un tema cuelga de su módulo.
  parent_id   uuid,
  kind        text not null check (kind ~ '^[a-z][a-z0-9_]{0,39}$'),
  title       text not null default '' check (length(title) <= 500),
  body        text not null default '' check (length(body) <= 20000),
  url         text check (url is null or (url ~ '^https?://' and length(url) <= 2000)),
  image_url   text check (image_url is null or (image_url ~ '^https?://' and length(image_url) <= 2000)),
  status      text not null default 'pendiente' check (status in ('pendiente', 'en_curso', 'hecho')),
  -- Archivo en Storage (bucket «adjuntos»), siempre dentro de la carpeta del usuario.
  file_path   text check (file_path is null or (split_part(file_path, '/', 1) = user_id::text and length(file_path) <= 500)),
  file_size   integer check (file_size is null or file_size between 0 and 10485760),
  file_type   text not null default '' check (length(file_type) <= 200),
  sort_order  integer not null default 0,
  unique (id, user_id),
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete cascade,
  foreign key (parent_id, user_id) references public.project_items (id, user_id) on delete cascade
);

create index on public.project_items (project_id);
create index on public.project_items (parent_id);

-- ---------------------------------------------------------------- Registros de un proyecto

-- Horas dedicadas ('horas'), valores medidos ('valor', p. ej. kg o km) y días cumplidos de un
-- reto ('check', uno por día).
create table public.project_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  project_id  uuid not null,
  kind        text not null check (kind ~ '^[a-z][a-z0-9_]{0,39}$'),
  date        date not null default current_date,
  value       numeric(12, 2) not null default 0 check (value between -1000000000 and 1000000000),
  note        text not null default '' check (length(note) <= 500),
  check (kind <> 'horas' or value > 0 and value <= 24),
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete cascade
);

create index on public.project_logs (project_id, date);
create unique index project_logs_one_check_per_day on public.project_logs (project_id, date) where kind = 'check';

-- ---------------------------------------------------------------- Seguridad por filas

do $$
declare
  t text;
begin
  foreach t in array array['project_items', 'project_logs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "solo el propietario" on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))',
      t
    );
    execute format('create index on public.%I (user_id)', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- Gastos de un proyecto

-- Los gastos de un viaje (o de cualquier proyecto) son movimientos normales de Finanzas que
-- apuntan a su proyecto. Si se borra el proyecto, el movimiento se queda (sin proyecto).
alter table public.transactions
  add column project_id uuid,
  add constraint transactions_project_fk foreign key (project_id, user_id)
    references public.projects (id, user_id) on delete set null (project_id);
create index on public.transactions (project_id) where project_id is not null;

-- ---------------------------------------------------------------- Página de cada proyecto

-- Página del diseñador con la vista de un proyecto. No sale en el menú ni tiene madre, y se
-- borra con su proyecto.
alter table public.tabs
  add column project_id uuid,
  add constraint tabs_project_fk foreign key (project_id, user_id)
    references public.projects (id, user_id) on delete cascade,
  add constraint tabs_project_top_level check (project_id is null or parent_id is null);
create unique index tabs_user_project on public.tabs (user_id, project_id) where project_id is not null;

-- insert_page_tree() admite ahora `project_id` en cada página.
create or replace function public.insert_page_tree(p_pages jsonb, p_parent uuid default null)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  p jsonb;
  new_id uuid;
  created integer := 0;
  base integer;
  i integer := 0;
begin
  if p_pages is null or jsonb_typeof(p_pages) <> 'array' then
    raise exception 'Las páginas tienen que llegar como una lista';
  end if;
  select coalesce(max(sort_order) + 1, 0) into base
  from public.tabs
  where user_id = auth.uid() and parent_id is not distinct from p_parent and section is null;

  for p in select value from jsonb_array_elements(p_pages) loop
    insert into public.tabs (parent_id, name, icon, template, project_id, sort_order)
    values (p_parent, p->>'name', coalesce(p->>'icon', '📄'), p->>'template', (p->>'project_id')::uuid, base + i)
    returning id into new_id;

    insert into public.blocks (tab_id, type, title, content, x, y, w, h, sort_order)
    select new_id, b->>'type', coalesce(b->>'title', ''), coalesce(b->'content', '{}'::jsonb),
           coalesce((b->>'x')::integer, 0), coalesce((b->>'y')::integer, 0),
           coalesce((b->>'w')::integer, 6), coalesce((b->>'h')::integer, 6), (ord - 1)::integer
    from jsonb_array_elements(coalesce(p->'blocks', '[]'::jsonb)) with ordinality as t(b, ord);

    created := created + 1 + public.insert_page_tree(coalesce(p->'children', '[]'::jsonb), new_id);
    i := i + 1;
  end loop;
  return created;
end;
$$;

-- ---------------------------------------------------------------- Actividad del proyecto

-- Cualquier cambio en sus tareas, elementos, registros o gastos cuenta como actividad.
create or replace function public.touch_project()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  pid uuid := case when tg_op = 'DELETE' then old.project_id else new.project_id end;
begin
  if pid is not null then
    update public.projects set last_activity_at = now() where id = pid;
  end if;
  if tg_op = 'UPDATE' and old.project_id is distinct from new.project_id and old.project_id is not null then
    update public.projects set last_activity_at = now() where id = old.project_id;
  end if;
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['tasks', 'project_items', 'project_logs', 'transactions'] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I
         for each row execute function public.touch_project()',
      t || '_touch_project', t
    );
  end loop;
end $$;

-- Editar el propio proyecto (nombre, fase, campos…) también cuenta.
create or replace function public.projects_touch_self()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.last_activity_at is not distinct from old.last_activity_at then
    new.last_activity_at := now();
  end if;
  return new;
end;
$$;

create trigger projects_touch
  before update on public.projects
  for each row execute function public.projects_touch_self();

revoke execute on function public.tasks_set_completed_at() from public, anon, authenticated;
revoke execute on function public.touch_project() from public, anon, authenticated;
revoke execute on function public.projects_touch_self() from public, anon, authenticated;

-- ---------------------------------------------------------------- Página Proyectos de siempre

-- En la categoría por defecto «Proyectos», el tablero general (sin proyecto elegido) deja paso
-- a «Foco de hoy» arriba; el kanban vive ahora dentro de cada proyecto.
delete from public.blocks b
using public.tabs t
where b.tab_id = t.id and t.template = 'proyectos' and b.type = 'tablero'
  and coalesce(b.content->>'project', '') = '';

update public.blocks b
set x = 0, w = 12, y = b.y + 6
from public.tabs t
where b.tab_id = t.id and t.template = 'proyectos' and b.type = 'proyectos';

insert into public.blocks (user_id, tab_id, type, title, content, x, y, w, h, sort_order)
select t.user_id, t.id, 'foco_hoy', '🎯 Foco de hoy', '{}'::jsonb, 0, 0, 12, 6, -1
from public.tabs t
where t.template = 'proyectos'
  and not exists (select 1 from public.blocks b where b.tab_id = t.id and b.type = 'foco_hoy');

-- ---------------------------------------------------------------- Archivos adjuntos

-- Bucket privado: cada usuario solo lee y escribe en su carpeta (<su id>/…). 10 MB por archivo.
insert into storage.buckets (id, name, public, file_size_limit)
values ('adjuntos', 'adjuntos', false, 10485760)
on conflict (id) do nothing;

create policy "adjuntos: ver los propios" on storage.objects for select to authenticated
  using (bucket_id = 'adjuntos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "adjuntos: subir a su carpeta" on storage.objects for insert to authenticated
  with check (bucket_id = 'adjuntos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "adjuntos: cambiar los propios" on storage.objects for update to authenticated
  using (bucket_id = 'adjuntos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "adjuntos: borrar los propios" on storage.objects for delete to authenticated
  using (bucket_id = 'adjuntos' and (storage.foldername(name))[1] = (select auth.uid())::text);

commit;
