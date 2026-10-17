-- Panel de Vida · 005 · Movimientos periódicos (suscripciones, nóminas, cuotas…)
--
-- Ejecutar DESPUÉS de 001-004 (SQL Editor → pegar → Run). Sirve sobre una base con datos.
--
-- Cada periódico guarda su frecuencia, el día (y mes) en que toca y la próxima fecha
-- pendiente. generate_recurring_for_user() crea los movimientos que ya tocan con
-- source = 'recurrente' y external_id = '<id del periódico>:<fecha>': la restricción
-- única de 004 impide duplicarlos aunque se ejecute dos veces a la vez.
--
-- Se generan por dos vías: una tarea diaria de pg_cron (si la extensión está
-- disponible) y, como respaldo, la app al abrirse (generate_my_recurring).

-- Todo o nada: si algo falla, no se aplica ningún cambio.
begin;

create table public.recurring_transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  type          text not null check (type in ('gasto', 'ingreso')),
  amount        numeric(12, 2) not null check (amount > 0),
  category_id   uuid not null,
  note          text not null check (length(trim(note)) between 1 and 120),
  frequency     text not null check (frequency in ('semanal', 'mensual', 'anual')),
  -- Día del mes (1-31) y mes (1-12, solo para «anual») en que toca; si el mes es más
  -- corto, se usa su último día.
  anchor_day    smallint not null check (anchor_day between 1 and 31),
  anchor_month  smallint not null default 1 check (anchor_month between 1 and 12),
  next_date     date not null,
  end_date      date,
  active        boolean not null default true,
  foreign key (category_id, user_id, type) references public.finance_categories (id, user_id, type)
);

create index on public.recurring_transactions (user_id);
create index on public.recurring_transactions (next_date) where active;

alter table public.recurring_transactions enable row level security;
create policy "solo el propietario" on public.recurring_transactions for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.recurring_transactions from anon;

-- ---------------------------------------------------------------- Calendario
-- Mantener igual que nextOccurrence() en src/lib/recurring.ts.

create or replace function public.recurring_next_date(p_date date, p_frequency text, p_day integer, p_month integer)
returns date
language sql
immutable
set search_path = ''
as $$
  select case p_frequency
    when 'semanal' then p_date + 7
    when 'mensual' then
      -- ::timestamp: date_trunc sobre una fecha devolvería timestamptz y dependería de la zona horaria.
      (date_trunc('month', p_date::timestamp) + interval '1 month')::date
      + (least(p_day, extract(day from date_trunc('month', p_date::timestamp) + interval '2 month' - interval '1 day')::integer) - 1)
    else
      make_date(
        extract(year from p_date)::integer + 1,
        p_month,
        least(p_day, extract(day from make_date(extract(year from p_date)::integer + 1, p_month, 1)::timestamp + interval '1 month' - interval '1 day')::integer)
      )
  end
$$;

-- ---------------------------------------------------------------- Generación

-- Crea los movimientos pendientes de un usuario hasta p_until (incluido). Devuelve cuántos ha creado.
create or replace function public.generate_recurring_for_user(p_user uuid, p_until date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r       public.recurring_transactions;
  d       date;
  created integer := 0;
  guard   integer;
begin
  for r in
    select * from public.recurring_transactions
    where user_id = p_user and active and next_date <= p_until
    for update
  loop
    d := r.next_date;
    guard := 0;
    while d <= p_until and (r.end_date is null or d <= r.end_date) and guard < 500 loop
      insert into public.transactions (user_id, type, amount, category_id, note, date, source, external_id)
      values (r.user_id, r.type, r.amount, r.category_id, r.note, d, 'recurrente', r.id::text || ':' || d::text)
      on conflict (user_id, source, external_id) do nothing;
      if found then
        created := created + 1;
      end if;
      d := public.recurring_next_date(d, r.frequency, r.anchor_day, r.anchor_month);
      guard := guard + 1;
    end loop;
    update public.recurring_transactions
    set next_date = d, active = (r.end_date is null or d <= r.end_date)
    where id = r.id;
  end loop;
  return created;
end;
$$;

-- Para la app: genera los del usuario autenticado (como mucho hasta mañana, por zonas horarias).
create or replace function public.generate_my_recurring(p_until date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'no autenticado';
  end if;
  return public.generate_recurring_for_user(auth.uid(), least(p_until, current_date + 1));
end;
$$;

-- Para la tarea diaria: todos los usuarios con periódicos pendientes.
create or replace function public.generate_recurring_all()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  u     uuid;
  total integer := 0;
begin
  for u in select distinct user_id from public.recurring_transactions where active and next_date <= current_date loop
    total := total + public.generate_recurring_for_user(u, current_date);
  end loop;
  return total;
end;
$$;

revoke execute on function public.generate_recurring_for_user(uuid, date) from public, anon, authenticated;
revoke execute on function public.generate_recurring_all() from public, anon, authenticated;
revoke execute on function public.generate_my_recurring(date) from public, anon;
grant execute on function public.generate_my_recurring(date) to authenticated;

-- ---------------------------------------------------------------- Fusionar categorías: también los periódicos
-- Misma función que en 003, moviendo además los periódicos de la categoría fusionada.

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
    update public.finance_categories set parent_id = tgt.id where parent_id = src.id;
  else
    update public.transactions set category_id = tgt.id
    where category_id in (select id from public.finance_categories where parent_id = src.id);
    update public.recurring_transactions set category_id = tgt.id
    where category_id in (select id from public.finance_categories where parent_id = src.id);
    delete from public.finance_categories where parent_id = src.id;
  end if;

  update public.recurring_transactions set category_id = tgt.id where category_id = src.id;
  update public.transactions set category_id = tgt.id where category_id = src.id;
  get diagnostics moved = row_count;

  update public.budgets set category_id = tgt.id
  where category_id = src.id and not exists (select 1 from public.budgets where category_id = tgt.id);

  delete from public.finance_categories where id = src.id;
  return moved;
end;
$$;

-- ---------------------------------------------------------------- Tarea diaria (pg_cron)
-- Si pg_cron no está disponible, la migración sigue adelante: los periódicos se
-- generarán al abrir la app. En Supabase también se puede activar en Integrations → Cron.

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('panel-de-vida-periodicos', '10 4 * * *', 'select public.generate_recurring_all()');
exception when others then
  raise notice 'pg_cron no disponible (%): los periódicos se generarán al abrir la app.', sqlerrm;
end $$;

commit;
