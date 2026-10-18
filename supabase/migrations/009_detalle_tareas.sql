-- Panel de Vida · 009 · Ficha de cada tarea
--
-- Ejecutar DESPUÉS de 001-008 (SQL Editor → pegar → Run). Sirve sobre una base con datos.
--
-- Cada tarea del kanban tiene ahora una ficha, al estilo de un «work item»: tipo (tarea,
-- error, mejora…), descripción, estimación y horas dedicadas, y sus notas, enlaces y
-- documentos. Los tipos los define la app (src/lib/tasks.ts): añadir uno no exige migración.

-- Todo o nada: si algo falla, no se aplica ningún cambio.
begin;

-- ---------------------------------------------------------------- Tareas

alter table public.tasks
  add column kind text not null default 'tarea' check (kind ~ '^[a-z][a-z0-9_]{0,39}$'),
  add column description text not null default '' check (length(description) <= 20000),
  -- Horas que se calcula que llevará y horas ya dedicadas.
  add column estimate_hours numeric(7, 2) check (estimate_hours is null or estimate_hours between 0 and 10000),
  add column spent_hours numeric(7, 2) check (spent_hours is null or spent_hours between 0 and 10000),
  add constraint tasks_id_user_unique unique (id, user_id);

-- ---------------------------------------------------------------- Notas, enlaces y documentos de una tarea

create table public.task_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  task_id     uuid not null,
  -- 'nota', 'enlace' o 'archivo'.
  kind        text not null check (kind ~ '^[a-z][a-z0-9_]{0,39}$'),
  title       text not null default '' check (length(title) <= 500),
  body        text not null default '' check (length(body) <= 20000),
  url         text check (url is null or (url ~ '^https?://' and length(url) <= 2000)),
  -- Archivo en Storage (bucket «adjuntos» de la 008), siempre dentro de la carpeta del usuario.
  file_path   text check (file_path is null or (split_part(file_path, '/', 1) = user_id::text and length(file_path) <= 500)),
  file_size   integer check (file_size is null or file_size between 0 and 10485760),
  file_type   text not null default '' check (length(file_type) <= 200),
  sort_order  integer not null default 0,
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete cascade
);

create index on public.task_items (task_id);
create index on public.task_items (user_id);

alter table public.task_items enable row level security;
create policy "solo el propietario" on public.task_items for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.task_items from anon;

-- Lo que se añade a una tarea cuenta como actividad de su proyecto (semáforo de la 008).
create or replace function public.touch_task_project()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.projects p set last_activity_at = now()
  from public.tasks t
  where t.id = case when tg_op = 'DELETE' then old.task_id else new.task_id end
    and p.id = t.project_id;
  return null;
end;
$$;

create trigger task_items_touch_project
  after insert or update or delete on public.task_items
  for each row execute function public.touch_task_project();

revoke execute on function public.touch_task_project() from public, anon, authenticated;

commit;
