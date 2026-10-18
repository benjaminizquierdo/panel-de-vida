-- Panel de Vida · 007 · Diseñador de categorías
--
-- Ejecutar DESPUÉS de 001-006 (SQL Editor → pegar → Run). Sirve sobre una base con datos.
--
-- Las pestañas fijas desaparecen: todo son páginas («categorías») que el usuario crea,
-- anida sin límite y monta con bloques en un panel libre (posición y tamaño de cada bloque
-- en una rejilla de 12 columnas). Las categorías por defecto (Inicio, Finanzas…) son
-- páginas normales que la app crea la primera vez que entra cada usuario, con
-- seed_default_pages(): su contenido lo define src/lib/pageTemplates.ts y llega como JSON.
--
-- Las sub-pestañas de la versión anterior (filas con `section`) pasan, al crear las
-- categorías por defecto, a ser subpáginas de la categoría equivalente.

-- Todo o nada: si algo falla, no se aplica ningún cambio.
begin;

-- ---------------------------------------------------------------- Páginas

-- Categoría por defecto de la que sale la página (para «Restaurar» y para enlazar desde
-- otros bloques); null en las que crea el usuario.
alter table public.tabs add column template text check (template ~ '^[a-z][a-z0-9_]{0,39}$');
create unique index tabs_user_template on public.tabs (user_id, template) where template is not null;
create index on public.tabs (parent_id);

comment on column public.tabs.section is 'Obsoleta (006): sub-pestañas de las pestañas fijas. seed_default_pages() las pasa a parent_id.';

-- Anidar sin límite, pero sin ciclos: una página no puede acabar dentro de sí misma.
create or replace function public.tabs_check_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  cur uuid := new.parent_id;
  steps integer := 0;
begin
  while cur is not null loop
    if cur = new.id then
      raise exception 'Una página no puede ir dentro de sí misma ni de una de sus subpáginas';
    end if;
    steps := steps + 1;
    if steps > 1000 then
      raise exception 'Demasiados niveles de páginas';
    end if;
    select parent_id into cur from public.tabs where id = cur;
  end loop;
  return new;
end;
$$;

create trigger tabs_no_cycle
  before insert or update of parent_id on public.tabs
  for each row execute function public.tabs_check_cycle();

-- ---------------------------------------------------------------- Bloques

-- Los tipos de bloque los valida la app (src/lib/blockKinds.ts): así añadir un tipo nuevo
-- no exige otra migración. Aquí solo se exige un nombre con forma de identificador.
alter table public.blocks drop constraint blocks_type_check;
alter table public.blocks add constraint blocks_type_check check (type ~ '^[a-z][a-z0-9_]{0,39}$');

-- Posición (x, y) y tamaño (w, h) en la rejilla de 12 columnas del escritorio.
-- En el móvil los bloques se apilan en el orden de lectura (y, luego x).
alter table public.blocks
  add column x integer not null default 0 check (x between 0 and 11),
  add column y integer not null default 0 check (y between 0 and 10000),
  add column w integer not null default 6 check (w between 1 and 12),
  add column h integer not null default 6 check (h between 1 and 1000),
  add constraint blocks_inside_grid check (x + w <= 12);

-- Los bloques que ya existían se reparten en dos columnas, en su orden de antes.
update public.blocks b
set x = (o.n % 2) * 6, y = (o.n / 2) * 6
from (
  select id, (row_number() over (partition by tab_id order by sort_order, created_at) - 1)::integer as n
  from public.blocks
) o
where o.id = b.id;

-- ---------------------------------------------------------------- Ajustes por usuario

create table public.user_settings (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  -- Ya se han creado sus categorías por defecto (aunque luego las borre, no se vuelven a crear).
  pages_seeded boolean not null default true
);

alter table public.user_settings enable row level security;
create policy "solo el propietario" on public.user_settings for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.user_settings from anon;

-- ---------------------------------------------------------------- Crear árboles de páginas

-- Inserta páginas (con sus bloques y subpáginas) bajo p_parent, al final de sus hermanas.
-- p_pages: [{name, icon, template?, blocks: [{type, title, content, x, y, w, h}], children: [...]}]
-- Se ejecuta con los permisos del usuario (security invoker): RLS y las claves foráneas
-- impiden escribir en páginas ajenas. Devuelve cuántas páginas ha creado.
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
    insert into public.tabs (parent_id, name, icon, template, sort_order)
    values (p_parent, p->>'name', coalesce(p->>'icon', '📄'), p->>'template', base + i)
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

-- Crea las categorías por defecto la primera vez (después devuelve 0 sin tocar nada) y
-- cuelga las sub-pestañas de la 006 de su categoría equivalente. Seguro ante dos pestañas
-- del navegador entrando a la vez: la segunda espera a la primera y no duplica nada.
create or replace function public.seed_default_pages(p_pages jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  created integer;
begin
  if auth.uid() is null then
    raise exception 'Sesión no iniciada';
  end if;
  insert into public.user_settings (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  if not found then
    return 0;
  end if;

  created := public.insert_page_tree(p_pages, null);

  update public.tabs t
  set parent_id = d.id, section = null, sort_order = t.sort_order + 1000
  from public.tabs d
  where t.user_id = auth.uid() and t.section is not null
    and d.user_id = auth.uid() and d.template = t.section;
  -- Por si alguna sección no tiene categoría equivalente: queda como página principal.
  update public.tabs set section = null where user_id = auth.uid() and section is not null;

  return created;
end;
$$;

revoke execute on function public.tabs_check_cycle() from public, anon, authenticated;
revoke execute on function public.insert_page_tree(jsonb, uuid) from public, anon;
grant execute on function public.insert_page_tree(jsonb, uuid) to authenticated;
revoke execute on function public.seed_default_pages(jsonb) from public, anon;
grant execute on function public.seed_default_pages(jsonb) to authenticated;

commit;
