-- นับแถวทุกตาราง (public + auth.users/identities + ประวัติใบ) — อ่านอย่างเดียว ผลเป็นตัวเลข
select json_object_agg(t, n order by t) from (
  select c.relname as t, (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text::bigint as n
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')
  union all select 'auth.users', (select count(*) from auth.users)
  union all select 'auth.identities', (select count(*) from auth.identities)
  union all select 'supabase_migrations', (select count(*) from supabase_migrations.schema_migrations)
) x;
