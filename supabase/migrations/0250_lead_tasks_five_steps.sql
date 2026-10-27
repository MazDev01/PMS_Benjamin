-- ── ใบ 0250: รายการเตือนของลีด + แม่แบบงาน HQ ตาม FLOW ใหม่ 5 ขั้น (บอสสั่ง 27 ต.ค. 69 · FLOW D7) ─────────────────────
-- เดิม: แม่แบบงานผูกกับสถานะลีดแบบเก่า (WAITING/BULLET/QUOTED/FOLLOWUP/NEGO/PAID) มี "ติดตามผล" "เจรจาต่อรอง" "ปิดการขาย"
--   (FLOW เลิกใช้ 21 ต.ค. 69 · ต่อรองใช้ "ทำฉบับใหม่") · ดีลเลอร์ติ๊กงานที่ระบบควรติ๊กเองได้ที่ฐาน (ปุ่มบนจอแค่ปิดไว้)
-- ใหม่: แต่ละรายการผูกกับขั้น 1–5 ของ leadStage.ts (step) · รายการของระบบ (auto) ฐานติ๊กในคำสั่งเดียวกับเหตุการณ์ (แบบใบ 0248)
--   ขั้น 1 ข้อมูลลูกค้า : ติดต่อแล้ว · เก็บข้อมูลลูกค้า · สรุปความต้องการ · นัดหมาย (ระบบ · ลงนัด — ใบ 0248)
--   ขั้น 2 ขอราคา HQ   : ส่งคำขอราคา (ระบบ · ส่งคำขอราคา — ใบนี้)
--   ขั้น 3 ได้ใบ HQ    : ได้ใบ HQ (ระบบ · HQ ส่งใบ — ใบนี้)
--   ขั้น 4 ทำใบให้ลูกค้า : จัดทำใบเสนอราคา (ระบบ · 0210)
--   ขั้น 5 รอลูกค้าตอบ  : ส่งใบเสนอราคา (ระบบ · 0210/0248) · ติดตามลูกค้า (ติ๊กเอง)
-- กติกา: รายการของระบบ ดีลเลอร์ติ๊ก/ยกเลิกติ๊กเองไม่ได้ (ตัวดักบนตาราง leads) · HQ ตัด/แก้รายการของระบบในแม่แบบไม่ได้
--   รายการติ๊กเองติ๊กได้ตามเดิม และไม่เปลี่ยนขั้นของลีด (เหมือนใบ 0232)
-- ลีดที่มีอยู่: ย้ายรายการเดิมเข้ากลุ่มใหม่ เก็บสถานะติ๊ก/วันที่/ผู้ทำ · "ติดตามผล" → "ติดตามลูกค้า" (เก็บติ๊กเดิม)
--   "เจรจาต่อรอง" "ปิดการขาย" "ส่งแม่แบบ" เอาออก · "ส่งคำขอราคา" "ได้ใบ HQ" ติ๊กย้อนหลังจากข้อมูลจริง (วันส่งคำขอ/วันที่ HQ ส่งใบ)
-- ข้อทดสอบ: supabase/tests/lead_tasks_five_steps.sql · tests/scenario/lead-tasks-five-steps.spec.ts

/** รายการของระบบ (ลำดับ = ลำดับในแม่แบบ) — แหล่งเดียวของฐาน · หน้าเว็บ: packages/shared/lib/mock.ts SYSTEM_LEAD_TASKS (ต้องตรงกัน) */
create or replace function public._lead_system_tasks() returns jsonb
  language sql immutable set search_path to 'public' as $$
  select '[
    {"key":"appointment","label":"นัดหมาย","step":1,"auto":true},
    {"key":"requestQuote","label":"ส่งคำขอราคา","step":2,"auto":true},
    {"key":"hqQuote","label":"ได้ใบ HQ","step":3,"auto":true},
    {"key":"makeQuote","label":"จัดทำใบเสนอราคา","step":4,"auto":true},
    {"key":"sendQuote","label":"ส่งใบเสนอราคา","step":5,"auto":true}
  ]'::jsonb
$$;
revoke all on function public._lead_system_tasks() from public, anon, authenticated, service_role;

create or replace function public._lead_system_task_keys() returns text[]
  language sql immutable set search_path to 'public' as $$
  select array(select e ->> 'key' from jsonb_array_elements(_lead_system_tasks()) e)
$$;
revoke all on function public._lead_system_task_keys() from public, anon, authenticated, service_role;

/** แม่แบบตั้งต้นใหม่ (ค่าเดียวกับ LEAD_TASK_TEMPLATE ของหน้าเว็บ) */
create or replace function public._lead_task_template_default() returns jsonb
  language sql immutable set search_path to 'public' as $$
  select '[
    {"key":"contact","label":"ติดต่อแล้ว","step":1},
    {"key":"collect","label":"เก็บข้อมูลลูกค้า","step":1},
    {"key":"requirement","label":"สรุปความต้องการ","step":1},
    {"key":"appointment","label":"นัดหมาย","step":1,"auto":true},
    {"key":"requestQuote","label":"ส่งคำขอราคา","step":2,"auto":true},
    {"key":"hqQuote","label":"ได้ใบ HQ","step":3,"auto":true},
    {"key":"makeQuote","label":"จัดทำใบเสนอราคา","step":4,"auto":true},
    {"key":"sendQuote","label":"ส่งใบเสนอราคา","step":5,"auto":true},
    {"key":"followCustomer","label":"ติดตามลูกค้า","step":5}
  ]'::jsonb
$$;
revoke all on function public._lead_task_template_default() from public, anon, authenticated, service_role;

-- ── 0) งาน "นัดหมาย" ของแม่แบบเดิม — HQ เคยลบแล้วสร้างใหม่ได้ (รหัสเปลี่ยน เช่น task_bullet_1 ชื่อ "นัดหมาย" · มีจริงในข้อมูลตั้งต้นรุ่นก่อน)
--   หาแบบเดียวกับ findAppointmentTask / ใบ 0248 (รหัส appointment ก่อน แล้วชื่อมีคำว่า "นัด") → จับคู่เข้ารายการ "นัดหมาย" ของระบบ
--   เก็บติ๊กเดิมของลีด ไม่ให้มี "นัดหมาย" ซ้ำ 2 แถว
select set_config('pms.old_appt_key', coalesce(
  (select t ->> 'key' from hq_sales_journey j, jsonb_array_elements(case when jsonb_typeof(j.tasks) = 'array' then j.tasks else '[]' end) t
    where j.id = 1 and t ->> 'key' = 'appointment' limit 1),
  (select t ->> 'key' from hq_sales_journey j, jsonb_array_elements(case when jsonb_typeof(j.tasks) = 'array' then j.tasks else '[]' end) t
    where j.id = 1 and t ->> 'label' like '%นัด%' limit 1),
  'appointment'), false);

-- ── 1) แม่แบบของ HQ: แปลงเป็น 5 ขั้น — เก็บรายการที่ HQ เพิ่มเอง (ขั้นเดิม → ขั้นใหม่) · ตัดรายการ flow เก่า ──
update hq_sales_journey j set tasks = (
  with ใหม่ as (select e, o from jsonb_array_elements(_lead_task_template_default()) with ordinality x(e, o)),
       เพิ่มเอง as (
         select jsonb_build_object('key', t ->> 'key', 'label', btrim(t ->> 'label'),
                  'step', case coalesce(t ->> 'stage', '') when 'HQ_PRICING' then 2 when 'HQ_QUOTED' then 3
                               when 'QUOTED' then 5 when 'FOLLOWUP' then 5 when 'NEGO' then 5 else 1 end) as e,
                100 + o as o
           from jsonb_array_elements(case when jsonb_typeof(j.tasks) = 'array' then j.tasks else '[]'::jsonb end) with ordinality y(t, o)
          where coalesce(t ->> 'key', '') <> ''
            and t ->> 'key' not in ('contact', 'collect', 'requirement', 'appointment', 'requestQuote', 'hqQuote', 'makeQuote', 'sendQuote',
                                    'followCustomer', 'followup', 'negotiate', 'close', 'catalog')
            and t ->> 'key' <> current_setting('pms.old_appt_key')
            and nullif(btrim(t ->> 'label'), '') is not null)
  select jsonb_agg(e order by (e ->> 'step')::int, o) from (select * from ใหม่ union all select * from เพิ่มเอง) z
);

-- ── 2) ตัวกันแม่แบบ: HQ ตัด/แก้ชื่อ/ย้ายขั้นรายการของระบบไม่ได้ · ทุกรายการต้องมีขั้น 1–5 ──
create or replace function public.hq_sales_journey_tasks_guard() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
declare s jsonb; t jsonb;
begin
  if new.tasks is null or new.tasks is not distinct from old.tasks then return new; end if;
  if jsonb_typeof(new.tasks) <> 'array' then raise exception 'lead_tasks_invalid: แม่แบบงานต้องเป็นรายการ'; end if;
  for s in select * from jsonb_array_elements(_lead_system_tasks()) loop
    t := (select x from jsonb_array_elements(new.tasks) x where x ->> 'key' = s ->> 'key' limit 1);
    if t is null or t ->> 'label' is distinct from s ->> 'label' or coalesce(t ->> 'step', '') <> s ->> 'step' then
      raise exception 'system_task_locked: รายการ "%" ระบบติ๊กให้เอง — ตัด/แก้ชื่อ/ย้ายขั้นไม่ได้', s ->> 'label';
    end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(new.tasks) x
              where coalesce(x ->> 'step', '') !~ '^[1-5]$' or nullif(btrim(x ->> 'label'), '') is null or nullif(btrim(x ->> 'key'), '') is null) then
    raise exception 'lead_tasks_invalid: ทุกรายการต้องมีรหัส ชื่อ และขั้น 1–5';
  end if;
  return new;
end $$;
revoke all on function public.hq_sales_journey_tasks_guard() from public, anon, authenticated, service_role;
drop trigger if exists hq_sales_journey_tasks_guard on public.hq_sales_journey;
create trigger hq_sales_journey_tasks_guard before update of tasks on public.hq_sales_journey
  for each row execute function public.hq_sales_journey_tasks_guard();

-- ── 3) ลีดที่มีอยู่: ย้ายรายการเข้ากลุ่มใหม่ (เก็บติ๊ก/วันที่/ผู้ทำ) · ติ๊กย้อนหลัง ส่งคำขอราคา / ได้ใบ HQ จากข้อมูลจริง ──
--   แยกเป็นคำสั่งให้ข้อทดสอบเรียกตรวจได้ (supabase/tests/lead_tasks_five_steps.sql) · ใช้แม่แบบของ HQ ที่แปลงแล้ว (ข้อ 1)
--   p_appt = รหัสงานนัดหมายในแม่แบบเดิม (ข้อ 0) — ติ๊กเดิมของงานนั้นย้ายมาที่รายการ "นัดหมาย" ของระบบ
create or replace function public._lead_tasks_five_steps(p_tasks jsonb, p_dealer text, p_num integer, p_appt text default 'appointment') returns jsonb
  language sql stable set search_path to 'public' as $$
  with แม่แบบ as (select e, o from jsonb_array_elements((select tasks from hq_sales_journey where id = 1)) with ordinality x(e, o)),
       เดิม as (select t ->> 'key' as k, t from jsonb_array_elements(p_tasks) t),
       คำขอ as (select min(r.submitted_at) as ส่ง, min(r.quoted_at) as ได้ใบ
                 from quote_requests r where r.dealer_code = p_dealer and r.lead_num_id = p_num),
       แถว as (
         select a.o, case
           when m.t is not null then (m.t - 'label' - 'key') || jsonb_build_object('key', a.e ->> 'key', 'label', a.e ->> 'label')
           when a.e ->> 'key' = 'requestQuote' and (select ส่ง from คำขอ) is not null
             then jsonb_build_object('key', 'requestQuote', 'label', a.e ->> 'label', 'done', true,
                                     'doneAt', _thai_date((select ส่ง from คำขอ), true), 'doneBy', 'อัปเดตอัตโนมัติ')
           when a.e ->> 'key' = 'hqQuote' and (select ได้ใบ from คำขอ) is not null
             then jsonb_build_object('key', 'hqQuote', 'label', a.e ->> 'label', 'done', true,
                                     'doneAt', _thai_date((select ได้ใบ from คำขอ), true), 'doneBy', 'อัปเดตอัตโนมัติ')
           else jsonb_build_object('key', a.e ->> 'key', 'label', a.e ->> 'label', 'done', false) end as t
           from แม่แบบ a
           left join lateral (select d.t from เดิม d
                               where d.k = a.e ->> 'key' or (a.e ->> 'key' = 'followCustomer' and d.k = 'followup')
                                  or (a.e ->> 'key' = 'appointment' and d.k = p_appt)
                               order by (d.k = a.e ->> 'key') desc limit 1) m on true
         union all
         -- รายการเฉพาะของลีดนี้ที่ไม่อยู่ในแม่แบบ (ไม่ใช่ของ flow เก่า) — เก็บไว้ท้ายรายการ
         select 1000, d.t from เดิม d
          where d.k not in (select e ->> 'key' from แม่แบบ) and d.k not in ('followup', 'negotiate', 'close', 'catalog') and d.k <> p_appt)
  select coalesce(jsonb_agg(t order by o), '[]'::jsonb) from แถว
$$;
revoke all on function public._lead_tasks_five_steps(jsonb, text, integer, text) from public, anon, authenticated, service_role;

--   ลีดที่ยังไม่มีรายการ (ว่าง) ไม่แตะ — สร้างจากแม่แบบตอนติ๊กครั้งแรกเหมือนเดิม · ปิดตัวดัก (ไม่ลงไทม์ไลน์/แจ้งเตือน/บันทึกการใช้งาน)
set local session_replication_role = replica;
update leads l set tasks = _lead_tasks_five_steps(l.tasks, l.dealer_code, l.num_id, current_setting('pms.old_appt_key'))
 where jsonb_typeof(l.tasks) = 'array' and jsonb_array_length(l.tasks) > 0;
set local session_replication_role = origin;

-- ── 4) ดีลเลอร์ติ๊ก/ยกเลิกติ๊กรายการของระบบเองไม่ได้ ──
--   ผู้ใช้สั่งแก้ลีดตรง (lead_apply/อัปเดตตาราง = ระดับ 1) ถูกตรวจ · ฐานติ๊กจากเหตุการณ์ (ตัวดักของใบ/คำขอ/นัด = ระดับ 2+) ผ่าน
create or replace function public.leads_system_tasks_guard() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
declare k text;
begin
  if coalesce(auth.role(), '') <> 'authenticated' or pg_trigger_depth() > 1 then return new; end if;
  if new.tasks is not distinct from old.tasks then return new; end if;
  foreach k in array _lead_system_task_keys() loop
    if coalesce((select (t ->> 'done')::boolean from jsonb_array_elements(case when jsonb_typeof(new.tasks) = 'array' then new.tasks else '[]' end) t
                  where t ->> 'key' = k limit 1), false)
       is distinct from
       coalesce((select (t ->> 'done')::boolean from jsonb_array_elements(case when jsonb_typeof(old.tasks) = 'array' then old.tasks else '[]' end) t
                  where t ->> 'key' = k limit 1), false) then
      raise exception 'system_task_locked: รายการ "%" ระบบติ๊กให้เมื่อทำจริง — ติ๊กเองไม่ได้',
        coalesce((select e ->> 'label' from jsonb_array_elements(_lead_system_tasks()) e where e ->> 'key' = k), k);
    end if;
  end loop;
  return new;
end $$;
revoke all on function public.leads_system_tasks_guard() from public, anon, authenticated, service_role;
drop trigger if exists leads_system_tasks_guard on public.leads;
create trigger leads_system_tasks_guard before update of tasks on public.leads
  for each row execute function public.leads_system_tasks_guard();

-- ── 5) ฐานติ๊กเอง: ส่งคำขอราคา (เพิ่มคำขอ) · ได้ใบ HQ (HQ ส่งใบ) — ทรานแซกชันเดียวกับเหตุการณ์ (ตัวช่วยของใบ 0248) ──
create or replace function public.quote_requests_task_sync() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  perform _lead_sync_append(new.dealer_code, new.lead_num_id, array['requestQuote'], null, null);
  return new;
end $$;
revoke all on function public.quote_requests_task_sync() from public, anon, authenticated, service_role;
drop trigger if exists quote_requests_task_sync on public.quote_requests;
create trigger quote_requests_task_sync after insert on public.quote_requests
  for each row execute function public.quote_requests_task_sync();

create or replace function public.hq_quotes_task_sync() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
declare r quote_requests;
begin
  if new.status <> 'sent' or old.status = 'sent' then return new; end if;
  select * into r from quote_requests where id = new.request_id;
  if found then perform _lead_sync_append(r.dealer_code, r.lead_num_id, array['hqQuote'], null, null); end if;
  return new;
end $$;
revoke all on function public.hq_quotes_task_sync() from public, anon, authenticated, service_role;
drop trigger if exists hq_quotes_task_sync on public.hq_quotes;
create trigger hq_quotes_task_sync after update of status on public.hq_quotes
  for each row execute function public.hq_quotes_task_sync();
