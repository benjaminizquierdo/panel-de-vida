-- Panel de Vida · asistente de IA
--
-- Ejecutar DESPUÉS de schema.sql (SQL Editor → pegar → Run). Añade el contador
-- de mensajes diarios con el que la Edge Function `assistant` limita el uso.

create table public.assistant_usage (
  user_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day       date not null default current_date,
  messages  integer not null default 0 check (messages >= 0),
  primary key (user_id, day)
);

alter table public.assistant_usage enable row level security;

-- Cada usuario puede consultar su propio uso, pero no escribirlo: solo lo
-- incrementa assistant_take_quota().
create policy "ver mi uso" on public.assistant_usage for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.assistant_usage from anon;
revoke insert, update, delete on public.assistant_usage from authenticated;

-- Consume un mensaje del cupo diario del usuario autenticado.
-- Devuelve los mensajes que le quedan hoy, o -1 si ya no le queda ninguno.
-- Llamarla directamente solo puede gastar el cupo propio, nunca ampliarlo.
create or replace function public.assistant_take_quota(p_limit integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid  uuid := auth.uid();
  used integer;
begin
  if uid is null then
    raise exception 'no autenticado';
  end if;

  insert into public.assistant_usage as u (user_id, day, messages)
  values (uid, current_date, 1)
  on conflict (user_id, day) do update
    set messages = u.messages + 1
    where u.messages < p_limit
  returning messages into used;

  if used is null then
    return -1;
  end if;
  return greatest(p_limit - used, 0);
end;
$$;

revoke execute on function public.assistant_take_quota(integer) from public, anon;
grant execute on function public.assistant_take_quota(integer) to authenticated;
