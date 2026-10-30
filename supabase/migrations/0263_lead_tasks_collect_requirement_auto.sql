-- ── ใบ 0263: งานขั้น "ข้อมูลลูกค้า" — เอา "ติดต่อแล้ว" ออก · "เก็บข้อมูลลูกค้า" / "สรุปความต้องการ" ระบบติ๊กเอง (บอสสั่ง 30 ต.ค. 69) ─────
-- เดิม (ใบ 0250): ขั้น 1 = ติดต่อแล้ว · เก็บข้อมูลลูกค้า · สรุปความต้องการ (ติ๊กเอง) · นัดหมาย (ระบบ)
-- ใหม่:
--   · "ติดต่อแล้ว" เอาออกทั้งระบบ — แม่แบบตั้งต้น · แม่แบบของ HQ · รายการงานของลีดที่มีอยู่ทุกราย (บรรทัดในประวัติของลีดยังอยู่)
--   · "เก็บข้อมูลลูกค้า" = รายการของระบบ ติ๊กเมื่อหมวดข้อมูลลูกค้าครบ: ชื่อบริษัท · ผู้ติดต่อ · โทรศัพท์
--   · "สรุปความต้องการ" = รายการของระบบ ติ๊กเมื่อหมวดข้อมูลงานครบ: จังหวัดหน้างาน · งานที่ต้องการ · พื้นที่ (ตร.ม. > 0) · สเปก/รายละเอียดงาน
--   · ติ๊กตอนสร้างหรือแก้ลีดทีหลัง · ข้อมูลไม่ครบ = ติ๊กหาย · ดีลเลอร์/HQ ติ๊กเอง/ลบออกจากแม่แบบไม่ได้ (ตัวกันเดิมของใบ 0250 ใช้รายชื่อนี้)
--   · ลีดที่ปิดแล้ว (ปิดสำเร็จ/ไม่สำเร็จ) ไม่ติ๊กเพิ่ม/ไม่เอาติ๊กออก — เอาแค่ "ติดต่อแล้ว" ออก
-- หน้าเว็บ: packages/shared/lib/mock.ts SYSTEM_LEAD_TASKS · LEAD_TASK_TEMPLATE (ต้องตรงกับฟังก์ชันด้านล่าง)
-- ข้อทดสอบ: supabase/tests/lead_tasks_info_auto.sql · tests/scenario/lead-tasks-five-steps.spec.ts

/** รายการของระบบ (ลำดับ = ลำดับในแม่แบบ) — ทับใบ 0250 */
create or replace function public._lead_system_tasks() returns jsonb
  language sql immutable set search_path to 'public' as $$
  select '[
    {"key":"collect","label":"เก็บข้อมูลลูกค้า","step":1,"auto":true},
    {"key":"requirement","label":"สรุปความต้องการ","step":1,"auto":true},
    {"key":"appointment","label":"นัดหมาย","step":1,"auto":true},
    {"key":"requestQuote","label":"ส่งคำขอราคา","step":2,"auto":true},
    {"key":"hqQuote","label":"ได้ใบ HQ","step":3,"auto":true},
    {"key":"makeQuote","label":"จัดทำใบเสนอราคา","step":4,"auto":true},
    {"key":"sendQuote","label":"ส่งใบเสนอราคา","step":5,"auto":true}
  ]'::jsonb
$$;
revoke all on function public._lead_system_tasks() from public, anon, authenticated, service_role;

/** แม่แบบตั้งต้น (ค่าเดียวกับ LEAD_TASK_TEMPLATE ของหน้าเว็บ) — ไม่มี "ติดต่อแล้ว" */
create or replace function public._lead_task_template_default() returns jsonb
  language sql immutable set search_path to 'public' as $$
  select '[
    {"key":"collect","label":"เก็บข้อมูลลูกค้า","step":1,"auto":true},
    {"key":"requirement","label":"สรุปความต้องการ","step":1,"auto":true},
    {"key":"appointment","label":"นัดหมาย","step":1,"auto":true},
    {"key":"requestQuote","label":"ส่งคำขอราคา","step":2,"auto":true},
    {"key":"hqQuote","label":"ได้ใบ HQ","step":3,"auto":true},
    {"key":"makeQuote","label":"จัดทำใบเสนอราคา","step":4,"auto":true},
    {"key":"sendQuote","label":"ส่งใบเสนอราคา","step":5,"auto":true},
    {"key":"followCustomer","label":"ติดตามลูกค้า","step":5}
  ]'::jsonb
$$;
revoke all on function public._lead_task_template_default() from public, anon, authenticated, service_role;

-- ── เกณฑ์ "ครบ" (ฟังก์ชันกลางตัวเดียว · หน้าเว็บไม่คิดเอง) ──
create or replace function public._lead_customer_info_complete(p_company text, p_contact text, p_phone text) returns boolean
  language sql immutable set search_path to 'public' as $$
  select btrim(coalesce(p_company, '')) <> '' and btrim(coalesce(p_contact, '')) <> '' and btrim(coalesce(p_phone, '')) <> ''
$$;
create or replace function public._lead_job_info_complete(p_province text, p_project text, p_area text, p_note text) returns boolean
  language sql immutable set search_path to 'public' as $$
  select btrim(coalesce(p_province, '')) <> '' and btrim(coalesce(p_project, '')) <> '' and btrim(coalesce(p_note, '')) <> ''
     and coalesce(btrim(p_area) ~ '^[0-9]+(\.[0-9]+)?$' and btrim(p_area)::numeric > 0, false)
$$;
revoke all on function public._lead_customer_info_complete(text, text, text) from public, anon, authenticated, service_role;
revoke all on function public._lead_job_info_complete(text, text, text, text) from public, anon, authenticated, service_role;

/** ตั้งติ๊กของรายการหนึ่งในรายการงาน — ติ๊กแล้วอยู่แล้ว = คงวันที่/ผู้ทำเดิม · ไม่ครบ = เอาติ๊กออก · ไม่มีรายการนี้ = เพิ่มต่อท้าย */
create or replace function public._lead_task_set(p_tasks jsonb, p_key text, p_label text, p_done boolean, p_by text) returns jsonb
  language sql stable set search_path to 'public' as $$
  with เดิม as (select t, o from jsonb_array_elements(case when jsonb_typeof(p_tasks) = 'array' then p_tasks else '[]'::jsonb end) with ordinality x(t, o)),
       ใหม่ as (
         select case when t ->> 'key' <> p_key then t
                     when p_done and coalesce((t ->> 'done')::boolean, false) then t
                     when p_done then t || jsonb_build_object('done', true, 'doneAt', _thai_date(now()), 'doneBy', p_by)
                     else (t - 'doneAt' - 'doneBy') || jsonb_build_object('done', false) end as t, o
           from เดิม
         union all
         select case when p_done then jsonb_build_object('key', p_key, 'label', p_label, 'done', true, 'doneAt', _thai_date(now()), 'doneBy', p_by)
                     else jsonb_build_object('key', p_key, 'label', p_label, 'done', false) end, 100000
          where not exists (select 1 from เดิม where t ->> 'key' = p_key))
  select coalesce(jsonb_agg(t order by o), '[]'::jsonb) from ใหม่
$$;
revoke all on function public._lead_task_set(jsonb, text, text, boolean, text) from public, anon, authenticated, service_role;

/** รายการงานของลีดหลังคิดติ๊กอัตโนมัติ 2 รายการ — ลีดยังไม่มีรายการงานและยังไม่ครบสักหมวด = คงว่าง (สร้างจากแม่แบบตอนมีติ๊กแรก) */
create or replace function public._lead_info_tasks(p_tasks jsonb, p_status text, p_assigned text,
                                                    p_company text, p_contact text, p_phone text,
                                                    p_province text, p_project text, p_area text, p_note text) returns jsonb
  language plpgsql stable set search_path to 'public' as $$
declare
  ลูกค้า boolean := _lead_customer_info_complete(p_company, p_contact, p_phone);
  งาน   boolean := _lead_job_info_complete(p_province, p_project, p_area, p_note);
  ผู้ทำ  text := coalesce(nullif(btrim(p_assigned), ''), 'อัปเดตอัตโนมัติ');
  t jsonb := case when jsonb_typeof(p_tasks) = 'array' then p_tasks else '[]'::jsonb end;
begin
  if p_status in ('PAID', 'CANCELLED') then return p_tasks; end if;
  if jsonb_array_length(t) = 0 then
    if not ลูกค้า and not งาน then return p_tasks; end if;
    t := coalesce((select jsonb_agg(jsonb_build_object('key', e ->> 'key', 'label', e ->> 'label', 'done', false) order by o)
                     from hq_sales_journey j, jsonb_array_elements(j.tasks) with ordinality x(e, o) where j.id = 1), '[]'::jsonb);
  end if;
  t := _lead_task_set(t, 'collect', 'เก็บข้อมูลลูกค้า', ลูกค้า, ผู้ทำ);
  t := _lead_task_set(t, 'requirement', 'สรุปความต้องการ', งาน, ผู้ทำ);
  return t;
end $$;
revoke all on function public._lead_info_tasks(jsonb, text, text, text, text, text, text, text, text, text) from public, anon, authenticated, service_role;

-- ── 1) แม่แบบของ HQ: เอา "ติดต่อแล้ว" ออก · "เก็บข้อมูลลูกค้า"/"สรุปความต้องการ" เป็นรายการของระบบ (ไม่มี = เพิ่มก่อน "นัดหมาย") ──
--   ปิดตัวดัก: ตัวกันแม่แบบของใบ 0250 ห้ามแก้รายการของระบบ (รายการทั้งสองเพิ่งกลายเป็นของระบบในใบนี้)
set local session_replication_role = replica;
update hq_sales_journey j set tasks = (
  with เดิม as (select e, o from jsonb_array_elements(case when jsonb_typeof(j.tasks) = 'array' then j.tasks else '[]'::jsonb end) with ordinality x(e, o)
                 where e ->> 'key' not in ('contact', 'collect', 'requirement')),
       ระบบใหม่ as (select e, case e ->> 'key' when 'collect' then 0.1 else 0.2 end as o
                     from jsonb_array_elements(_lead_system_tasks()) e where e ->> 'key' in ('collect', 'requirement'))
  select jsonb_agg(e order by (e ->> 'step')::int, o) from (select e, o::numeric from เดิม union all select e, o from ระบบใหม่) z
) where id = 1;

-- ── 2) ลีดที่มีอยู่: เอา "ติดต่อแล้ว" ออก · คิดติ๊ก 2 รายการจากข้อมูลจริง (ลีดที่ปิดแล้วเอาแค่ "ติดต่อแล้ว" ออก) ──
update leads l set tasks = (select coalesce(jsonb_agg(t order by o), '[]'::jsonb)
                              from jsonb_array_elements(l.tasks) with ordinality x(t, o) where t ->> 'key' <> 'contact')
 where jsonb_typeof(l.tasks) = 'array' and l.tasks @> '[{"key":"contact"}]';
update leads l set tasks = _lead_info_tasks(l.tasks, l.status::text, l.assigned, l.company, l.contact, l.phone, l.province, l.project, l.area, l.note)
 where l.status::text not in ('PAID', 'CANCELLED')
   and _lead_info_tasks(l.tasks, l.status::text, l.assigned, l.company, l.contact, l.phone, l.province, l.project, l.area, l.note) is distinct from l.tasks;
set local session_replication_role = origin;

-- ── 3) ติ๊กอัตโนมัติตอนสร้าง/แก้ลีด ──
--   ชื่อตัวดักเรียงหลัง leads_system_tasks_guard (ตัวกันดูค่าที่ผู้ใช้ส่งมาก่อน แล้วตัวนี้ค่อยคิดติ๊กให้)
create or replace function public.leads_tasks_info_auto() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  new.tasks := _lead_info_tasks(new.tasks, new.status::text, new.assigned, new.company, new.contact, new.phone,
                                new.province, new.project, new.area, new.note);
  return new;
end $$;
revoke all on function public.leads_tasks_info_auto() from public, anon, authenticated, service_role;
drop trigger if exists leads_tasks_info_auto on public.leads;
create trigger leads_tasks_info_auto before insert or update of tasks, company, contact, phone, province, project, area, note, status on public.leads
  for each row execute function public.leads_tasks_info_auto();
