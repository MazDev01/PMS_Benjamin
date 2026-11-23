-- ══ 0296 · รายการกลางของเครือ: ช่องทางที่มา · ประเภทนัดหมาย · เหตุผลผู้สนใจไม่สำเร็จ (บอสตัดสิน 19 พ.ย. 69 · "ตั้งค่ารายการกลาง") ══
-- เดิม: ช่องทางที่มาลูกค้าเป้าหมาย/ประเภทนัดหมายเขียนตายตัวในโค้ด · เหตุผลผู้สนใจไม่สำเร็จอยู่ใน hq_recruit_settings.config.lostReasons
--       ข้อมูลเก็บ "ข้อความ" (leads.source · dealer_prospects.lost_reason) — เปลี่ยนชื่อไม่ได้ ตัวกรองไม่ตรงกัน
-- ตอนนี้: ตาราง option_lists ตารางเดียว (list, code, label, sort, hidden, free_text) · HQ ตั้งที่ ตั้งค่า › รายการกลาง · ดีลเลอร์ทุกรายเห็นชุดเดียวกัน
--   · ข้อมูลเก็บรหัส (code) — เปลี่ยนชื่อ (label) แล้วข้อมูลเก่าเห็นชื่อใหม่ · ซ่อน (hidden) = ไม่ให้เลือกตอนกรอกใหม่ แต่ข้อมูลเดิมยังแสดงชื่อ
--   · ลบได้เฉพาะตัวที่ไม่มีข้อมูลใช้ — ตัวดักก่อนลบ (option_in_use) ทุกทาง · มีข้อมูลใช้ = ซ่อนแทน
--   · ตัวเลือกระบุเอง (free_text · "อื่น ๆ (ระบุ)") เก็บ "รหัส:ข้อความ"
--   · อ่าน: ทุกคนที่เข้าระบบ · เขียน: สำนักงานใหญ่ (can_write_master) — หน้าเว็บบันทึกทาง option_lists_save (ทั้งรายการในคำสั่งเดียว · ลงบันทึกการใช้งาน)
--   · option_lists_used(): รหัสที่มีข้อมูลใช้ (หน้าตั้งค่าซ่อนปุ่มลบ · ฐานยังกันเองอยู่ดี)
--   · _option_label(): ป้ายของค่าที่บันทึก (ตัวดักที่เขียนประวัติ/บันทึกการใช้งานใช้ · กติกาเดียวกับ packages/shared/lib/optionLists.ts)
-- แปลงข้อมูล (ค่าที่ตรงชื่อในรายการเท่านั้น · ค่าที่ไม่ตรงคงตามเดิม → หน้าเว็บแสดง "‹ค่า› (ตามที่บันทึกไว้)"):
--   · leads.source: ชื่อ 7 ตัวเดิม + ชื่อเดิมที่โค้ดเคยใช้ (Walk-in · Website · Referral · Exhibition · Other · อื่นๆ) + ค่าที่หน้าลูกค้าเคยเขียน "ลูกค้าเดิม (ดีลใหม่)" → รหัส (ชื่อใหม่ "ลูกค้าเดิม (งานขายใหม่)" ตามคลังคำ)
--   · appointments.type: เก็บรหัสอยู่แล้ว · ค่าที่เป็นชื่อ (ตัวที่แสดง) → รหัส
--   · dealer_prospects.lost_reason และ dealer_package_proposals.close_reason (เฉพาะใบที่ปฏิเสธ): ชื่อในรายการ → รหัส
--   · เหตุผลที่ HQ เคยตั้งเพิ่มใน hq_recruit_settings.config.lostReasons ยกมาเป็นตัวเลือก (ค่าเดิมใน config คงไว้ ไม่แตะ · โค้ดไม่อ่านแล้ว)
--   ทำแบบปิดตัวดัก (session_replication_role = replica · วิธีเดียวกับใบ 0287) — การแปลงรหัสไม่ใช่การแก้ข้อมูลของผู้ใช้ (ไม่ลงประวัติ/บันทึก)
-- ตัวดักที่เขียนข้อความจากเหตุผล (ประวัติผู้สนใจ · ประวัติใบค่าแฟรนไชส์ · บันทึกการใช้งาน) เขียน "ชื่อ" แทนรหัส (ยกจากใบ 0184 / 0207 / 0269 · เปลี่ยนเฉพาะจุดเหตุผล)
-- ข้อทดสอบ: tests/unit/optionLists.test.ts · ซ้อมลงใบ tests/tools/migration-0296.test.mjs · tests/scenario/option-lists.spec.ts

-- ═══ 1. ตาราง ═══════════════════════════════════════════════════════════════════════════════════════════
create table if not exists public.option_lists (
  list       text not null check (list in ('lead_source', 'appointment_type', 'prospect_lost_reason')),
  code       text not null check (code ~ '^[a-z][a-z0-9_]{0,39}$'),
  label      text not null check (btrim(label) <> '' and char_length(label) <= 60),
  sort       int not null default 0,
  hidden     boolean not null default false,
  free_text  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (list, code)
);
comment on table public.option_lists is 'รายการกลางของเครือ (ใบ 0296) — ข้อมูลเก็บ code · HQ แก้ชื่อ/ลำดับ/ซ่อน · ลบได้เฉพาะตัวที่ไม่มีข้อมูลใช้ (option_in_use)';
comment on column public.option_lists.free_text is 'ตัวเลือกระบุเอง — เก็บ "code:ข้อความ" (ใบ 0296)';

alter table public.option_lists enable row level security;
revoke all on table public.option_lists from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.option_lists to authenticated;
grant all on table public.option_lists to service_role;
drop policy if exists option_lists_read on public.option_lists;
create policy option_lists_read on public.option_lists for select to authenticated using (true);
drop policy if exists option_lists_insert on public.option_lists;
create policy option_lists_insert on public.option_lists for insert to authenticated with check (can_write_master());
drop policy if exists option_lists_update on public.option_lists;
create policy option_lists_update on public.option_lists for update to authenticated using (can_write_master()) with check (can_write_master());
drop policy if exists option_lists_delete on public.option_lists;
create policy option_lists_delete on public.option_lists for delete to authenticated using (can_write_master());

-- ═══ 2. ตัวช่วย ═════════════════════════════════════════════════════════════════════════════════════════
-- คีย์เทียบชื่อ: "อื่นๆ" = "อื่น ๆ" · ไม่สนช่องว่าง/ตัวเล็กใหญ่ (ตรงกับ คีย์ป้าย ใน optionLists.ts)
create or replace function public._option_key(p text) returns text
  language sql immutable set search_path to 'public' as $$
  select lower(regexp_replace(replace(coalesce(p, ''), 'อื่นๆ', 'อื่น ๆ'), '\s+', '', 'g'))
$$;
revoke all on function public._option_key(text) from public, anon, authenticated, service_role;

-- มีข้อมูลใช้ตัวเลือกนี้ไหม (รหัสตรง หรือ "รหัส:ข้อความ" ของตัวเลือกระบุเอง)
create or replace function public._option_in_use(p_list text, p_code text) returns boolean
  language plpgsql stable security definer set search_path to 'public' as $$
begin
  if p_list = 'lead_source' then
    return exists (select 1 from leads where source = p_code);
  elsif p_list = 'appointment_type' then
    return exists (select 1 from appointments where type = p_code);
  elsif p_list = 'prospect_lost_reason' then
    return exists (select 1 from dealer_prospects
                    where lost_reason = p_code or left(lost_reason, char_length(p_code) + 1) = p_code || ':')
        or exists (select 1 from dealer_package_proposals
                    where status = 'rejected' and (close_reason = p_code or left(close_reason, char_length(p_code) + 1) = p_code || ':'));
  end if;
  return false;
end $$;
revoke all on function public._option_in_use(text, text) from public, anon, authenticated, service_role;

-- ป้ายของค่าที่บันทึก: รหัส = ชื่อ · ระบุเอง = "อื่น ๆ: ข้อความ" · ไม่ตรงรายการ = "ค่า (ตามที่บันทึกไว้)" · ว่าง = null
create or replace function public._option_label(p_list text, p_value text) returns text
  language plpgsql stable security definer set search_path to 'public' as $$
declare
  v text := btrim(coalesce(p_value, ''));
  ชื่อ text;
  i int;
begin
  if v = '' then return null; end if;
  select label into ชื่อ from option_lists where list = p_list and code = v;
  if found then return ชื่อ; end if;
  i := position(':' in v);
  if i > 1 then
    select label into ชื่อ from option_lists where list = p_list and code = left(v, i - 1) and free_text;
    if found then
      return coalesce(nullif(btrim(regexp_replace(ชื่อ, '\s*\(ระบุ[^)]*\)\s*$', '')), ''), ชื่อ)
             || coalesce(': ' || nullif(btrim(substr(v, i + 1)), ''), '');
    end if;
  end if;
  return v || ' (ตามที่บันทึกไว้)';
end $$;
revoke all on function public._option_label(text, text) from public, anon, authenticated, service_role;

-- ═══ 3. ตัวดัก: ลบตัวที่มีข้อมูลใช้ไม่ได้ · รหัส/รายการแก้ไม่ได้ · ชื่อเขียน "อื่น ๆ" แบบเดียว ═══════════════════════════
create or replace function public.option_lists_guard() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'DELETE' then
    if _option_in_use(old.list, old.code) then
      raise exception 'option_in_use: ตัวเลือก "%" มีข้อมูลใช้อยู่ ลบไม่ได้ — ซ่อนแทน', old.label;
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and (new.list is distinct from old.list or new.code is distinct from old.code) then
    raise exception 'option_code_locked: แก้รหัสของตัวเลือกไม่ได้ (ข้อมูลอ้างรหัสนี้) — แก้ชื่อแทน';
  end if;
  new.label := replace(btrim(regexp_replace(new.label, '\s+', ' ', 'g')), 'อื่นๆ', 'อื่น ๆ');
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.option_lists_guard() from public, anon, authenticated, service_role;
drop trigger if exists option_lists_guard on public.option_lists;
create trigger option_lists_guard before insert or update or delete on public.option_lists
  for each row execute function public.option_lists_guard();

-- ═══ 4. ค่าตั้งต้น (ตรงกับ ตัวเลือกตั้งต้น ใน optionLists.ts) ══════════════════════════════════════════════
insert into public.option_lists (list, code, label, sort, hidden, free_text) values
  ('lead_source', 'facebook',        'Facebook',             1, false, false),
  ('lead_source', 'website',         'เว็บไซต์',              2, false, false),
  ('lead_source', 'line',            'LINE',                 3, false, false),
  ('lead_source', 'walk_in',         'ลูกค้าเข้ามาเอง',        4, false, false),
  ('lead_source', 'referral',        'แนะนำต่อ',              5, false, false),
  ('lead_source', 'exhibition',      'งานแสดงสินค้า',         6, false, false),
  ('lead_source', 'other',           'อื่น ๆ',                7, false, false),
  ('lead_source', 'repeat_customer', 'ลูกค้าเดิม (งานขายใหม่)', 8, true,  false),
  ('appointment_type', 'visit',         'นัดพบลูกค้า',        1, false, false),
  ('appointment_type', 'design_meet',   'นัดนำเสนอสินค้า',    2, false, false),
  ('appointment_type', 'presentation',  'นำเสนอราคา',        3, false, false),
  ('appointment_type', 'contract_sign', 'เซ็นสัญญาซื้อขาย',   4, false, false),
  ('appointment_type', 'close',         'ปิดการขาย',         5, false, false),
  ('appointment_type', 'follow_up',     'โทรติดตาม',         6, false, false),
  ('appointment_type', 'call',          'โทรติดตาม',         7, true,  false),
  ('appointment_type', 'meeting',       'ประชุม',            8, false, false),
  ('appointment_type', 'site_visit',    'นัดดูหน้างาน',       9, false, false),
  ('prospect_lost_reason', 'no_capital',   'เงินทุนไม่พอ',     1, false, false),
  ('prospect_lost_reason', 'not_ready',    'ยังไม่พร้อม',      2, false, false),
  ('prospect_lost_reason', 'other_brand',  'เลือกแบรนด์อื่น',   3, false, false),
  ('prospect_lost_reason', 'bad_location', 'ทำเลไม่เหมาะ',     4, false, false),
  ('prospect_lost_reason', 'other',        'อื่น ๆ (ระบุ)',     90, false, true)
on conflict (list, code) do nothing;

-- เหตุผลที่ HQ เคยตั้งเพิ่มเอง (หน้าตั้งค่า › หาดีลเลอร์ · ใบ 0176/0274) → ตัวเลือก (ชื่อตรงตัวที่มีแล้ว = ข้าม)
insert into public.option_lists (list, code, label, sort, hidden, free_text)
select 'prospect_lost_reason', 'r_' || substr(md5(x.label), 1, 10), x.label, 10 + x.n, false, false
  from (
    select distinct on (public._option_key(btrim(e.v))) btrim(e.v) as label, e.n
      from public.hq_recruit_settings s
     cross join lateral jsonb_array_elements_text(case when jsonb_typeof(s.config -> 'lostReasons') = 'array' then s.config -> 'lostReasons' else '[]'::jsonb end) with ordinality as e(v, n)
     where s.id = 1 and btrim(e.v) <> '' and char_length(btrim(e.v)) <= 60
     order by public._option_key(btrim(e.v)), e.n
  ) x
 where not exists (select 1 from public.option_lists o
                    where o.list = 'prospect_lost_reason' and public._option_key(o.label) = public._option_key(x.label))
   and public._option_key(x.label) not in (public._option_key('อื่น ๆ (ระบุเอง)'), public._option_key('อื่น ๆ'))
on conflict (list, code) do nothing;

-- ═══ 5. คำสั่งของหน้าตั้งค่า ════════════════════════════════════════════════════════════════════════════
-- บันทึกทั้งรายการในคำสั่งเดียว: แถวที่มี code = แก้ชื่อ/ซ่อน · ไม่มี code = เพิ่ม (ฐานตั้งรหัส) · ไม่อยู่ในชุด = ลบ (มีข้อมูลใช้ = ตัวดักปฏิเสธทั้งชุด)
--   ลำดับในชุด = ลำดับที่แสดง · ตัวที่แสดงชื่อห้ามซ้ำ · ต้องแสดงอย่างน้อย 1 ตัว · ลงบันทึกการใช้งาน
create or replace function public.option_lists_save(p_list text, p_rows jsonb) returns setof public.option_lists
  language plpgsql security definer set search_path to 'public' as $$
declare
  r jsonb;
  n int := 0;
  รหัส text;
  ชื่อ text;
  ซ่อน boolean;
  เก็บ text[] := '{}';
  ชื่อที่แสดง text[] := '{}';
  แสดง int := 0;
  เดิม int;
begin
  if not can_write_master() then raise exception 'forbidden: ตั้งค่ารายการกลางได้เฉพาะสำนักงานใหญ่'; end if;
  if p_list is null or p_list not in ('lead_source', 'appointment_type', 'prospect_lost_reason') then
    raise exception 'option_list_unknown: ไม่รู้จักรายการ %', coalesce(p_list, '(ว่าง)');
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'option_list_empty: รายการต้องมีอย่างน้อย 1 ตัวเลือก';
  end if;
  if jsonb_array_length(p_rows) > 50 then raise exception 'option_list_too_long: ใส่ได้ไม่เกิน 50 ตัวเลือก'; end if;
  select count(*) into เดิม from option_lists where list = p_list;

  -- ตรวจทั้งชุดก่อนเขียน
  for r in select value from jsonb_array_elements(p_rows) loop
    ชื่อ := replace(btrim(regexp_replace(coalesce(r ->> 'label', ''), '\s+', ' ', 'g')), 'อื่นๆ', 'อื่น ๆ');
    ซ่อน := coalesce((r ->> 'hidden')::boolean, false);
    รหัส := nullif(btrim(coalesce(r ->> 'code', '')), '');
    if ชื่อ = '' then raise exception 'option_label_required: ชื่อตัวเลือกว่างไม่ได้'; end if;
    if char_length(ชื่อ) > 60 then raise exception 'option_label_too_long: ชื่อ "%" ยาวเกิน 60 ตัวอักษร', left(ชื่อ, 20); end if;
    if รหัส is not null then
      if not exists (select 1 from option_lists where list = p_list and code = รหัส) then
        raise exception 'option_not_found: ไม่พบตัวเลือกรหัส % ในรายการนี้ — โหลดหน้าใหม่แล้วลองอีกครั้ง', รหัส;
      end if;
      if รหัส = any(เก็บ) then raise exception 'option_duplicate: ตัวเลือกรหัส % ซ้ำในชุดที่ส่งมา', รหัส; end if;
      เก็บ := เก็บ || รหัส;
    end if;
    if not ซ่อน then
      if _option_key(ชื่อ) = any(ชื่อที่แสดง) then
        raise exception 'option_label_duplicate: ชื่อ "%" ซ้ำกัน — ตัวที่แสดงต้องชื่อไม่ซ้ำ', ชื่อ;
      end if;
      ชื่อที่แสดง := ชื่อที่แสดง || _option_key(ชื่อ);
      แสดง := แสดง + 1;
    end if;
  end loop;
  if แสดง = 0 then raise exception 'option_list_all_hidden: ต้องแสดงอย่างน้อย 1 ตัวเลือก'; end if;

  -- ลบตัวที่ไม่อยู่ในชุด (ตัวดักกันตัวที่มีข้อมูลใช้)
  delete from option_lists where list = p_list and not (code = any(เก็บ));

  -- เขียนตามลำดับ
  for r in select value from jsonb_array_elements(p_rows) loop
    n := n + 1;
    ชื่อ := replace(btrim(regexp_replace(coalesce(r ->> 'label', ''), '\s+', ' ', 'g')), 'อื่นๆ', 'อื่น ๆ');
    ซ่อน := coalesce((r ->> 'hidden')::boolean, false);
    รหัส := nullif(btrim(coalesce(r ->> 'code', '')), '');
    if รหัส is null then
      insert into option_lists (list, code, label, sort, hidden)
      values (p_list, 'c' || substr(md5(random()::text || clock_timestamp()::text || n::text), 1, 12), ชื่อ, n, ซ่อน);
    else
      update option_lists set label = ชื่อ, sort = n, hidden = ซ่อน
       where list = p_list and code = รหัส
         and (label, sort, hidden) is distinct from (ชื่อ, n, ซ่อน);
    end if;
  end loop;

  perform _audit_hq('ตั้งค่ารายการกลาง',
    case p_list when 'lead_source' then 'ช่องทางที่มาลูกค้าเป้าหมาย' when 'appointment_type' then 'ประเภทนัดหมาย'
                else 'เหตุผลผู้สนใจไม่สำเร็จ' end
      || ' · ' || jsonb_array_length(p_rows) || ' ตัวเลือก (เดิม ' || เดิม || ')');
  return query select * from option_lists where list = p_list order by sort, code;
end $$;
revoke all on function public.option_lists_save(text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.option_lists_save(text, jsonb) to authenticated;

-- รหัสที่มีข้อมูลใช้ (หน้าตั้งค่าซ่อนปุ่มลบ) — HQ เท่านั้น · อื่น = ว่าง
create or replace function public.option_lists_used() returns jsonb
  language sql stable security definer set search_path to 'public' as $$
  select case when is_hq() then coalesce(
           (select jsonb_agg(jsonb_build_object('list', o.list, 'code', o.code) order by o.list, o.sort, o.code)
              from option_lists o where _option_in_use(o.list, o.code)), '[]'::jsonb)
         else '[]'::jsonb end
$$;
revoke all on function public.option_lists_used() from public, anon, authenticated, service_role;
grant execute on function public.option_lists_used() to authenticated;

-- ═══ 6. ตัวดักที่เขียนข้อความจากเหตุผล → เขียนชื่อแทนรหัส ═══════════════════════════════════════════════════
-- ประวัติผู้สนใจ (ยกจากใบ 0184 · เปลี่ยนเฉพาะบรรทัดไม่สำเร็จ)
CREATE OR REPLACE FUNCTION public.dealer_prospects_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  เหตุผล text := nullif(current_setting('app.prospect_step_note', true), '');
begin
  if tg_op = 'INSERT' then
    insert into public.dealer_prospect_activities (prospect_id, kind, body, to_status)
    values (new.id, 'created',
            'เพิ่มลูกค้าเป้าหมาย' || case when new.status <> 'new' then ' · ขั้น ' || prospect_status_th(new.status) else '' end,
            new.status);
  elsif new.status is distinct from old.status then
    insert into public.dealer_prospect_activities (prospect_id, kind, body, from_status, to_status)
    values (new.id, 'status',
            case
              when เหตุผล is not null then เหตุผล
              when new.status = 'won'  then 'เป็นดีลเลอร์แล้ว · รหัส ' || coalesce(new.dealer_code, '—')
              when new.status = 'lost' then 'ปิดว่าไม่สำเร็จ' || coalesce(' · เหตุผล: ' || _option_label('prospect_lost_reason', new.lost_reason), '')
              when old.status = 'lost' then 'เปิดติดตามใหม่ · ' || prospect_status_th(new.status)
              else prospect_status_th(old.status) || ' → ' || prospect_status_th(new.status)
            end,
            old.status, new.status);
  end if;
  return null;
end $function$;

-- ประวัติใบค่าแฟรนไชส์ (ยกจากใบ 0207 · ใบที่ปฏิเสธ = ชื่อเหตุผล · หมดอายุ/ถูกแทน = ข้อความที่ระบบเขียนเหมือนเดิม)
create or replace function public.dealer_package_proposals_log() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  ป้าย text := case new.status when 'draft' then 'ร่าง' when 'sent' then 'ส่งแล้ว'
                               when 'accepted' then 'ตอบรับ' when 'rejected' then 'ปฏิเสธ'
                               when 'expired' then 'หมดอายุ' when 'superseded' then 'ถูกแทนด้วยเวอร์ชันใหม่'
                               else new.status end;
begin
  if tg_op = 'INSERT' then
    insert into public.dealer_prospect_activities (prospect_id, kind, body)
    values (new.prospect_id, 'proposal', 'ออกใบค่าแฟรนไชส์ ' || new.proposal_no || ' · ' || ป้าย);
  elsif new.status is distinct from old.status then
    insert into public.dealer_prospect_activities (prospect_id, kind, body)
    values (new.prospect_id, 'proposal', 'ใบค่าแฟรนไชส์ ' || new.proposal_no || ' · ' || ป้าย
      || case when new.status in ('rejected', 'expired', 'superseded') and coalesce(new.close_reason, '') <> ''
              then ' · ' || case when new.status = 'rejected' then _option_label('prospect_lost_reason', new.close_reason) else new.close_reason end
              else '' end);
  else
    return null;
  end if;

  if new.status = 'sent' then
    update public.dealer_prospects set status = 'considering'
    where id = new.prospect_id and status = 'meeting';
  elsif tg_op = 'UPDATE' and new.status in ('rejected', 'expired') and not exists (
    select 1 from public.dealer_package_proposals
    where prospect_id = new.prospect_id and id <> new.id and status in ('draft', 'sent', 'accepted')
  ) then
    perform set_config('app.prospect_step_note',
      'ใบค่าแฟรนไชส์ ' || coalesce(new.proposal_no, '') || ' ' || case new.status when 'rejected' then 'ถูกปฏิเสธ' else ป้าย end
        || ' → กลับไปนัดคุยแล้ว', true);
    update public.dealer_prospects set status = 'meeting'
    where id = new.prospect_id and status = 'considering';
    perform set_config('app.prospect_step_note', '', true);
  end if;
  return null;
end $$;

-- บันทึกการใช้งานของใบค่าแฟรนไชส์ (ยกจากใบ 0269 · เปลี่ยนเฉพาะเหตุผลของใบที่ปฏิเสธ)
CREATE OR REPLACE FUNCTION public.dealer_package_proposals_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r dealer_package_proposals := coalesce(new, old);
  ราย text := coalesce((select name from dealer_prospects where id = r.prospect_id), '');
  เลข text := coalesce(r.proposal_no, '');
  -- ช่องที่ไม่ใช่เนื้อหาใบ — สถานะ/ปิดใบ/วันครบกำหนดชำระ ลงเป็นเรื่องของตัวเอง
  ข้าม constant text[] := array['status', 'close_reason', 'closed_at', 'payment_due_on', 'updated_at', 'created_at'];
begin
  if not _audit_direct() then return null; end if;
  if tg_op = 'INSERT' then
    if new.supersedes_id is null then
      perform _audit_hq('ออกใบค่าแฟรนไชส์', เลข || ' · ' || ราย);
    else
      perform _audit_hq('ทำเวอร์ชันใหม่ใบค่าแฟรนไชส์',
        coalesce((select proposal_no from dealer_package_proposals where id = new.supersedes_id), '') || ' → ' || เลข || ' · ' || ราย);
    end if;
  elsif tg_op = 'DELETE' then
    -- ลบตามผู้สนใจ (on delete cascade) ไม่นับเป็นชั้นตัวดัก — ผู้สนใจต้นทางหายไปแล้ว = ลบตามกัน ลงแค่ "ลบผู้สนใจ" แถวเดียว
    if not exists (select 1 from dealer_prospects where id = old.prospect_id) then return null; end if;
    perform _audit_hq('ลบใบค่าแฟรนไชส์ (ร่าง)', เลข || ' · ' || ราย);
  else
    if new.status is distinct from old.status then
      perform _audit_hq('เปลี่ยนสถานะใบค่าแฟรนไชส์',
        เลข || ' · ' || ราย || ' → ' || _proposal_status_th(new.status::text)
          || coalesce(' · ' || case when new.status = 'rejected' then _option_label('prospect_lost_reason', new.close_reason)
                                    else nullif(btrim(new.close_reason), '') end, ''));
    elsif (to_jsonb(new) - ข้าม) is distinct from (to_jsonb(old) - ข้าม) then
      perform _audit_hq('แก้ไขใบค่าแฟรนไชส์', เลข || ' · ' || ราย);
    end if;
    if new.payment_due_on is distinct from old.payment_due_on then
      perform _audit_hq('ตั้งวันครบกำหนดชำระค่าแฟรนไชส์',
        เลข || ' · ' || coalesce(th_date(new.payment_due_on), 'ล้างวัน'));
    end if;
  end if;
  return null;
end $function$;

-- ═══ 7. แปลงข้อมูลเดิม: ชื่อที่ตรงรายการ → รหัส (ปิดตัวดักระหว่างแปลง · คืนค่าท้ายคำสั่ง) ═══════════════════════════════
set session_replication_role = replica;

-- ช่องทางที่มา: ชื่อปัจจุบัน + ชื่อเดิมที่โค้ดเคยใช้ (ตัวเดียวกัน · ไม่ใช่การเดา)
update public.leads l set source = m.code
  from (values
    ('Facebook', 'facebook'), ('เว็บไซต์', 'website'), ('Website', 'website'), ('LINE', 'line'),
    ('ลูกค้าเข้ามาเอง', 'walk_in'), ('Walk-in', 'walk_in'), ('แนะนำต่อ', 'referral'), ('Referral', 'referral'),
    ('งานแสดงสินค้า', 'exhibition'), ('Exhibition', 'exhibition'), ('อื่น ๆ', 'other'), ('Other', 'other'),
    ('ลูกค้าเดิม (ดีลใหม่)', 'repeat_customer'), ('ลูกค้าเดิม (งานขายใหม่)', 'repeat_customer')
  ) as m(label, code)
 where l.source is not null and public._option_key(l.source) = public._option_key(m.label);

-- ประเภทนัดหมาย: เก็บรหัสอยู่แล้ว · ค่าที่เป็นชื่อของตัวที่แสดง → รหัส
update public.appointments a set type = o.code
  from public.option_lists o
 where o.list = 'appointment_type' and not o.hidden
   and a.type is not null and a.type <> o.code
   and not exists (select 1 from public.option_lists x where x.list = 'appointment_type' and x.code = a.type)
   and public._option_key(a.type) = public._option_key(o.label);

-- เหตุผลผู้สนใจไม่สำเร็จ: ชื่อในรายการ (ไม่นับตัวระบุเอง) → รหัส
update public.dealer_prospects p set lost_reason = o.code
  from public.option_lists o
 where o.list = 'prospect_lost_reason' and not o.free_text
   and p.lost_reason is not null and public._option_key(p.lost_reason) = public._option_key(o.label);

-- ใบค่าแฟรนไชส์ที่ปฏิเสธ: เหตุผลที่ตรงชื่อในรายการ → รหัส (หมดอายุ/ถูกแทน = ข้อความของระบบ คงเดิม)
update public.dealer_package_proposals d set close_reason = o.code
  from public.option_lists o
 where o.list = 'prospect_lost_reason' and not o.free_text and d.status = 'rejected'
   and d.close_reason is not null and public._option_key(d.close_reason) = public._option_key(o.label);

set session_replication_role = origin;
