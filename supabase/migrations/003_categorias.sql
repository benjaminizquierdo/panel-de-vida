-- Panel de Vida · 003 · Categorías de finanzas personalizables
--
-- Ejecutar DESPUÉS de 001 y 002 (SQL Editor → pegar → Run). Sirve también sobre
-- una base con datos: convierte las categorías de texto de transactions y budgets
-- en filas de finance_categories y enlaza cada movimiento y presupuesto por id.
--
-- Reglas que garantiza la base de datos:
--   · Dos niveles como máximo (categoría → subcategoría).
--   · Una subcategoría tiene el mismo tipo (gasto/ingreso) que su categoría.
--   · Un movimiento tiene el mismo tipo que su categoría.
--   · Una categoría con movimientos no se puede borrar: se archiva o se fusiona
--     con otra (merge_finance_category).

-- ---------------------------------------------------------------- Tabla

create table public.finance_categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  parent_id   uuid,
  type        text not null check (type in ('gasto', 'ingreso')),
  name        text not null check (length(trim(name)) between 1 and 60),
  icon        text not null default '🏷️' check (length(icon) between 1 and 16),
  color       text not null default '#64748b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  sort_order  integer not null default 0,
  archived    boolean not null default false,
  unique (id, user_id),
  unique (id, user_id, type),
  foreign key (parent_id, user_id, type) references public.finance_categories (id, user_id, type) on delete cascade
);

-- Sin nombres repetidos entre las categorías activas del mismo nivel y tipo.
create unique index finance_categories_unique_name
  on public.finance_categories (user_id, type, parent_id, lower(name)) nulls not distinct
  where not archived;
create index on public.finance_categories (user_id);
create index on public.finance_categories (parent_id);

alter table public.finance_categories enable row level security;
create policy "solo el propietario" on public.finance_categories for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.finance_categories from anon;

create or replace function public.finance_categories_check_depth()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'Una categoría no puede ser subcategoría de sí misma';
    end if;
    if exists (select 1 from public.finance_categories where id = new.parent_id and parent_id is not null) then
      raise exception 'Solo hay dos niveles: no se puede crear una subcategoría dentro de otra subcategoría';
    end if;
    if exists (select 1 from public.finance_categories where parent_id = new.id) then
      raise exception 'Una categoría con subcategorías no puede pasar a ser subcategoría';
    end if;
  end if;
  return new;
end;
$$;

create trigger finance_categories_depth
  before insert or update of parent_id on public.finance_categories
  for each row execute function public.finance_categories_check_depth();

-- ---------------------------------------------------------------- Categorías por defecto
-- Mantener sincronizado con DEFAULT_CATEGORIES en src/lib/defaults.ts.

create or replace function public.create_default_finance_categories(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  comida uuid;
begin
  insert into public.finance_categories (user_id, type, name, icon, color, sort_order) values
    (p_user, 'gasto',   'Vivienda',       '🏠', '#6366f1', 1),
    (p_user, 'gasto',   'Comida',         '🍽️', '#f59e0b', 2),
    (p_user, 'gasto',   'Transporte',     '🚌', '#0ea5e9', 3),
    (p_user, 'gasto',   'Ocio',           '🎉', '#ec4899', 4),
    (p_user, 'gasto',   'Salud',          '💊', '#10b981', 5),
    (p_user, 'gasto',   'Suscripciones',  '📺', '#8b5cf6', 6),
    (p_user, 'gasto',   'Ropa',           '👕', '#f97316', 7),
    (p_user, 'gasto',   'Otros',          '📦', '#64748b', 8),
    (p_user, 'ingreso', 'Nómina',         '💼', '#16a34a', 1),
    (p_user, 'ingreso', 'Freelance',      '💻', '#0d9488', 2),
    (p_user, 'ingreso', 'Regalos',        '🎁', '#db2777', 3),
    (p_user, 'ingreso', 'Otros ingresos', '➕', '#64748b', 4);

  select id into comida from public.finance_categories
  where user_id = p_user and type = 'gasto' and parent_id is null and name = 'Comida';

  insert into public.finance_categories (user_id, parent_id, type, name, icon, color, sort_order) values
    (p_user, comida, 'gasto', 'Supermercado', '🛒', '#f59e0b', 1),
    (p_user, comida, 'gasto', 'Restaurantes', '🍴', '#f59e0b', 2);
end;
$$;

-- Solo la usan la migración y el alta de usuarios, nunca los clientes.
revoke execute on function public.create_default_finance_categories(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- Migración de los datos existentes

do $$
declare
  u record;
begin
  for u in select id from auth.users loop
    perform public.create_default_finance_categories(u.id);
  end loop;
end $$;

-- Categorías de texto que no son de las de por defecto (creadas a mano o por el asistente).
insert into public.finance_categories (user_id, type, name, icon, color, sort_order)
select distinct on (src.user_id, src.type, lower(src.name)) src.user_id, src.type, src.name, '🏷️', '#64748b', 100
from (
  select user_id, type, category as name from public.transactions
  union all
  select user_id, 'gasto', category from public.budgets
) as src
where not exists (
  select 1 from public.finance_categories c
  where c.user_id = src.user_id and c.type = src.type and c.parent_id is null and lower(c.name) = lower(src.name)
);

-- Movimientos: de texto a id.
alter table public.transactions add column category_id uuid;
update public.transactions t
set category_id = c.id
from public.finance_categories c
where c.user_id = t.user_id and c.type = t.type and c.parent_id is null and lower(c.name) = lower(t.category);
alter table public.transactions alter column category_id set not null;
alter table public.transactions drop column category;
alter table public.transactions
  add constraint transactions_category_fk
  foreign key (category_id, user_id, type) references public.finance_categories (id, user_id, type);
create index on public.transactions (category_id);

-- Presupuestos: de texto a id (solo categorías de gasto).
alter table public.budgets add column category_id uuid;
update public.budgets b
set category_id = c.id
from public.finance_categories c
where c.user_id = b.user_id and c.type = 'gasto' and c.parent_id is null and lower(c.name) = lower(b.category);
alter table public.budgets alter column category_id set not null;
alter table public.budgets drop column category; -- arrastra la restricción unique (user_id, category)
alter table public.budgets
  add constraint budgets_category_fk
  foreign key (category_id, user_id) references public.finance_categories (id, user_id) on delete cascade;
alter table public.budgets add constraint budgets_one_per_category unique (user_id, category_id);

-- ---------------------------------------------------------------- Fusionar categorías

-- Pasa los movimientos (y subcategorías) de p_source a p_target y borra p_source.
-- security invoker: se ejecuta con los permisos del usuario, así que RLS limita
-- todo a sus propias filas. Devuelve cuántos movimientos se han movido.
create or replace function public.merge_finance_category(p_source uuid, p_target uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  src public.finance_categories;
  tgt public.finance_categories;
  moved integer;
begin
  select * into src from public.finance_categories where id = p_source;
  select * into tgt from public.finance_categories where id = p_target;
  if src.id is null or tgt.id is null then
    raise exception 'Categoría no encontrada';
  end if;
  if src.id = tgt.id then
    raise exception 'Elige una categoría distinta';
  end if;
  if src.type <> tgt.type then
    raise exception 'Solo se puede fusionar con una categoría del mismo tipo (gasto o ingreso)';
  end if;
  if tgt.parent_id = src.id then
    raise exception 'No se puede fusionar con una de sus propias subcategorías';
  end if;

  if tgt.parent_id is null then
    -- Destino de primer nivel: las subcategorías del origen pasan a colgar de él.
    update public.finance_categories set parent_id = tgt.id where parent_id = src.id;
  else
    -- Destino subcategoría: las subcategorías del origen también se funden en él.
    update public.transactions set category_id = tgt.id
    where category_id in (select id from public.finance_categories where parent_id = src.id);
    delete from public.finance_categories where parent_id = src.id;
  end if;

  update public.transactions set category_id = tgt.id where category_id = src.id;
  get diagnostics moved = row_count;

  -- El presupuesto del origen pasa al destino solo si este no tiene uno.
  update public.budgets set category_id = tgt.id
  where category_id = src.id and not exists (select 1 from public.budgets where category_id = tgt.id);

  delete from public.finance_categories where id = src.id; -- su presupuesto, si queda, cae en cascada
  return moved;
end;
$$;

revoke execute on function public.merge_finance_category(uuid, uuid) from public, anon;
grant execute on function public.merge_finance_category(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------- Alta de usuarios
-- Mantener sincronizado con SEED en src/lib/defaults.ts.

create or replace function public.seed_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.habits (user_id, name, icon) values
    (new.id, 'Beber 2 L de agua', '💧'),
    (new.id, 'Ejercicio', '🏃'),
    (new.id, 'Leer 20 min', '📖'),
    (new.id, 'Meditar', '🧘'),
    (new.id, 'Dormir antes de las 24:00', '🌙');

  perform public.create_default_finance_categories(new.id);

  insert into public.budgets (user_id, category_id, monthly_limit)
  select new.id, c.id, d.monthly_limit
  from (values
    ('Vivienda', 700), ('Comida', 300), ('Transporte', 100), ('Ocio', 150),
    ('Salud', 50), ('Suscripciones', 40), ('Ropa', 60), ('Otros', 100)
  ) as d(name, monthly_limit)
  join public.finance_categories c
    on c.user_id = new.id and c.type = 'gasto' and c.parent_id is null and c.name = d.name;

  insert into public.goals (user_id, title, horizon, area, target, unit) values
    (new.id, 'Fondo de emergencia', 'anual', 'finanzas', 3000, '€'),
    (new.id, 'Leer 12 libros', 'anual', 'personal', 12, 'libros');

  return new;
end;
$$;
