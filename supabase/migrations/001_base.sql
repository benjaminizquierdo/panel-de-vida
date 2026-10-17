-- Panel de Vida · 001 · esquema base
--
-- Cómo usarlo: en tu proyecto de Supabase, abre "SQL Editor", pega este archivo
-- completo y pulsa "Run". Se puede ejecutar una sola vez sobre un proyecto vacío.
--
-- Aislamiento entre usuarios: todas las tablas tienen user_id (por defecto, el
-- usuario autenticado) y Row Level Security con una política que solo permite
-- leer y escribir las filas propias. Las claves foráneas compuestas
-- (x_id, user_id) impiden además enlazar una fila a un proyecto o hábito ajeno.

-- ---------------------------------------------------------------- Proyectos

create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  name        text not null check (length(name) between 1 and 200),
  description text not null default '',
  status      text not null default 'activo' check (status in ('activo', 'pausado', 'completado')),
  color       text not null default '#4f46e5',
  unique (id, user_id)
);

create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  project_id  uuid,
  title       text not null check (length(title) between 1 and 500),
  status      text not null default 'pendiente' check (status in ('pendiente', 'en_curso', 'hecha')),
  priority    text not null default 'media' check (priority in ('alta', 'media', 'baja')),
  due_date    date,
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------- Hábitos y salud

create table public.habits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  name        text not null check (length(name) between 1 and 200),
  icon        text not null default '✅',
  active      boolean not null default true,
  unique (id, user_id)
);

create table public.habit_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  habit_id    uuid not null,
  date        date not null,
  unique (habit_id, date),
  foreign key (habit_id, user_id) references public.habits (id, user_id) on delete cascade
);

create table public.health_logs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at       timestamptz not null default now(),
  date             date not null,
  sleep_hours      numeric(4, 1) check (sleep_hours between 0 and 24),
  energy           smallint check (energy between 1 and 5),
  exercise_minutes integer check (exercise_minutes >= 0),
  weight           numeric(5, 1) check (weight > 0),
  notes            text not null default '',
  unique (user_id, date)
);

-- ---------------------------------------------------------------- Objetivos y revisiones

create table public.goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  title       text not null check (length(title) between 1 and 300),
  horizon     text not null default 'trimestral' check (horizon in ('anual', 'trimestral')),
  area        text not null default 'personal' check (area in ('proyectos', 'salud', 'finanzas', 'personal')),
  target      numeric not null default 1 check (target > 0),
  current     numeric not null default 0 check (current >= 0),
  unit        text not null default '',
  due_date    date
);

create table public.reviews (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  week_start  date not null,
  wins        text not null default '',
  challenges  text not null default '',
  lessons     text not null default '',
  next_focus  text not null default '',
  unique (user_id, week_start)
);

create table public.highlights (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  date        date not null,
  text        text not null check (length(text) between 1 and 500),
  done        boolean not null default false,
  unique (user_id, date)
);

-- ---------------------------------------------------------------- Finanzas (EUR)

create table public.transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  date        date not null default current_date,
  type        text not null check (type in ('gasto', 'ingreso')),
  amount      numeric(12, 2) not null check (amount > 0),
  category    text not null,
  note        text not null default ''
);

create table public.budgets (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  category      text not null,
  monthly_limit numeric(12, 2) not null default 0 check (monthly_limit >= 0),
  unique (user_id, category)
);

-- ---------------------------------------------------------------- Seguridad por filas

do $$
declare
  t text;
begin
  foreach t in array array[
    'projects', 'tasks', 'habits', 'habit_logs', 'health_logs',
    'goals', 'reviews', 'highlights', 'transactions', 'budgets'
  ] loop
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

create index on public.tasks (project_id);
create index on public.habit_logs (habit_id);
create index on public.transactions (user_id, date);

-- ---------------------------------------------------------------- Datos iniciales de cada cuenta
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

  insert into public.budgets (user_id, category, monthly_limit) values
    (new.id, 'Vivienda', 700),
    (new.id, 'Comida', 300),
    (new.id, 'Transporte', 100),
    (new.id, 'Ocio', 150),
    (new.id, 'Salud', 50),
    (new.id, 'Suscripciones', 40),
    (new.id, 'Ropa', 60),
    (new.id, 'Otros', 100);

  insert into public.goals (user_id, title, horizon, area, target, unit) values
    (new.id, 'Fondo de emergencia', 'anual', 'finanzas', 3000, '€'),
    (new.id, 'Leer 12 libros', 'anual', 'personal', 12, 'libros');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.seed_new_user();
