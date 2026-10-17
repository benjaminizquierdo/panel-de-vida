-- Panel de Vida · 004 · Importación de movimientos desde CSV
--
-- Ejecutar DESPUÉS de 001-003 (SQL Editor → pegar → Run). Sirve sobre una base con datos.
--
-- · transactions.source / external_id: de dónde viene cada movimiento ('manual',
--   'trade_republic', 'csv'…) y su identificador en el origen. La restricción
--   única impide importar dos veces el mismo movimiento; los manuales no llevan
--   external_id y nunca chocan entre sí (NULL no se considera repetido).
-- · import_rules: «si el comercio contiene X → categoría Y», por usuario, para
--   que la importación recuerde las categorías que eligió la vez anterior.

-- Todo o nada: si algo falla, no se aplica ningún cambio.
begin;

alter table public.transactions
  add column source text not null default 'manual' check (source ~ '^[a-z0-9_]{1,40}$'),
  add column external_id text check (length(external_id) between 1 and 200);

alter table public.transactions
  add constraint transactions_unique_external unique (user_id, source, external_id);

create table public.import_rules (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  pattern      text not null check (length(trim(pattern)) between 2 and 100),
  category_id  uuid not null,
  foreign key (category_id, user_id) references public.finance_categories (id, user_id) on delete cascade
);

create unique index import_rules_unique_pattern on public.import_rules (user_id, lower(pattern));

alter table public.import_rules enable row level security;
create policy "solo el propietario" on public.import_rules for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.import_rules from anon;

commit;
