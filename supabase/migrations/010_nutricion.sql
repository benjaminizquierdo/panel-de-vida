-- Panel de Vida · 010 · Cuerpo y nutrición
--
-- Ejecutar DESPUÉS de 001-009 (SQL Editor → pegar → Run). Sirve sobre una base con datos.
--
-- Objetivos de kcal, macros, agua, pasos y peso; un catálogo de alimentos de cada usuario
-- (a mano o de Open Food Facts, con el precio que pagas); el diario de comidas; y agua, pasos y
-- kcal quemadas en el registro diario de salud (donde los rellenará Health Connect en la APK).

-- Todo o nada: si algo falla, no se aplica ningún cambio.
begin;

-- ---------------------------------------------------------------- Objetivos (una fila por usuario)

create table public.nutrition_goals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at     timestamptz not null default now(),
  kcal           integer not null default 2000 check (kcal between 500 and 10000),
  protein_g      integer not null default 120 check (protein_g between 0 and 1000),
  carbs_g        integer not null default 220 check (carbs_g between 0 and 2000),
  fat_g          integer not null default 65 check (fat_g between 0 and 1000),
  water_ml       integer not null default 2000 check (water_ml between 0 and 10000),
  steps          integer not null default 8000 check (steps between 0 and 100000),
  weight_target  numeric(5, 1) check (weight_target is null or weight_target between 20 and 400),
  weight_target_date date,
  unique (user_id)
);

-- ---------------------------------------------------------------- Alimentos

-- Valores por 100 g. El precio es el de un envase de `price_grams` gramos (p. ej. 1,35 € por 500 g).
create table public.foods (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  name        text not null check (length(trim(name)) between 1 and 200),
  brand       text not null default '' check (length(brand) <= 200),
  barcode     text check (barcode is null or barcode ~ '^[0-9]{6,14}$'),
  source      text not null default 'manual' check (source in ('manual', 'off')),
  kcal        numeric(7, 2) not null default 0 check (kcal between 0 and 1000),
  protein     numeric(6, 2) not null default 0 check (protein between 0 and 100),
  carbs       numeric(6, 2) not null default 0 check (carbs between 0 and 100),
  fat         numeric(6, 2) not null default 0 check (fat between 0 and 100),
  fiber       numeric(6, 2) check (fiber is null or fiber between 0 and 100),
  sugars      numeric(6, 2) check (sugars is null or sugars between 0 and 100),
  salt        numeric(6, 2) check (salt is null or salt between 0 and 100),
  -- Ración habitual, para apuntarla con un toque.
  serving_g   numeric(7, 1) check (serving_g is null or serving_g between 0.1 and 5000),
  price       numeric(8, 2) check (price is null or price between 0 and 100000),
  price_grams numeric(8, 1) check (price_grams is null or price_grams between 1 and 100000),
  store       text not null default '' check (length(store) <= 100),
  image_url   text check (image_url is null or (image_url ~ '^https://' and length(image_url) <= 1000)),
  favorite    boolean not null default false,
  unique (id, user_id)
);

create unique index foods_user_barcode on public.foods (user_id, barcode) where barcode is not null;

-- ---------------------------------------------------------------- Diario de comidas

-- Cada entrada guarda el nombre y los valores calculados al apuntarla: si luego cambias el
-- alimento (o lo borras), lo que comiste ese día no cambia.
create table public.food_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  date        date not null default current_date,
  meal        text not null default 'comida' check (meal in ('desayuno', 'comida', 'merienda', 'cena', 'otros')),
  food_id     uuid,
  name        text not null check (length(trim(name)) between 1 and 200),
  grams       numeric(7, 1) not null check (grams > 0 and grams <= 5000),
  kcal        numeric(8, 1) not null default 0 check (kcal between 0 and 50000),
  protein     numeric(7, 1) not null default 0 check (protein between 0 and 5000),
  carbs       numeric(7, 1) not null default 0 check (carbs between 0 and 5000),
  fat         numeric(7, 1) not null default 0 check (fat between 0 and 5000),
  cost        numeric(8, 2) check (cost is null or cost between 0 and 100000),
  foreign key (food_id, user_id) references public.foods (id, user_id) on delete set null (food_id)
);

create index on public.food_logs (user_id, date);

-- ---------------------------------------------------------------- Agua, pasos y kcal quemadas

alter table public.health_logs
  add column water_ml    integer check (water_ml is null or water_ml between 0 and 20000),
  add column steps       integer check (steps is null or steps between 0 and 200000),
  add column active_kcal integer check (active_kcal is null or active_kcal between 0 and 20000);

-- ---------------------------------------------------------------- Seguridad por filas

do $$
declare
  t text;
begin
  foreach t in array array['nutrition_goals', 'foods', 'food_logs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "solo el propietario" on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))',
      t
    );
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

create index on public.foods (user_id);

commit;
