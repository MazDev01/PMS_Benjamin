-- ── ใบ 0257: เอาของ flow เก่าออกจากข้อมูล + ฐานไม่รับอีก (บอสสั่ง 28 ต.ค. 69 · FLOW ตาราง "สถานะ ↔ ขั้น") ─────────────────
--
-- เหตุ: FLOW 5 ขั้นเลิกใช้สถานะ "ติดตามผล" (FOLLOWUP) และ "เจรจาต่อรอง" (NEGO) ตั้งแต่ 21 ต.ค. 69 — ใบ 0232 กันแค่ดีลเลอร์
--   แต่ HQ / คำสั่งของระบบ / กุญแจฝั่งเซิร์ฟเวอร์ยังตั้งได้ · ลีดเก่าในฐานทดสอบ/ข้อมูลตั้งต้นยังเป็นสถานะเก่า
--   · รายการเตือนของลีดและแม่แบบงาน HQ ยังมีร่องรอยแบบเก่า (ช่อง "stage" = สถานะลีดแบบเก่า · ใบ 0250 ย้ายรายการแล้วแต่เก็บช่องนี้ไว้)
-- ใบนี้:
--   1) ย้ายข้อมูล: ลีด ติดตามผล/เจรจาต่อรอง → เสนอราคา (QUOTED = ขั้น 5 รอลูกค้าตอบ · ขั้นเดียวกับที่แสดงอยู่แล้ว)
--      · สถานะก่อนปิด (status_before_paid · ใช้ตอน HQ ย้อนการตอบรับ) ก็ย้ายแบบเดียวกัน
--      · รายการเตือนของลีด + แม่แบบงาน HQ (hq_sales_journey.tasks): ตัดช่อง "stage" · ตัดรายการ flow เก่า
--        (เจรจาต่อรอง/ปิดการขาย/ส่งแม่แบบ) · "ติดตามผล" → "ติดตามลูกค้า" (เก็บติ๊กเดิม · กติกาเดียวกับใบ 0250)
--      ปิดตัวดักระหว่างย้าย (ไม่ลงไทม์ไลน์/แจ้งเตือน/บันทึกการใช้งาน — เหมือนใบ 0250) · จำนวนแถวที่ย้ายขึ้นเป็น NOTICE
--   2) ฐานไม่รับของเก่าอีก ทุกทาง ทุกบทบาท (ดีลเลอร์ · HQ · lead_apply · ยิงตารางตรง · กุญแจฝั่งเซิร์ฟเวอร์ · งานในฐาน):
--      ตัวดัก leads_00_old_flow_retired (ชื่อขึ้นต้น 00 = ทำงานก่อนตัวดักลีดตัวอื่น ข้อความปฏิเสธจึงบอกตรงเรื่อง)
--      + ข้อบังคับ leads_status_retired (กันทางที่ปิดตัวดัก เช่น กู้ข้อมูล) · แม่แบบงาน HQ: ตัวดัก hq_sales_journey_old_tasks_retired
--   3) lead_stage_no: ตัดสถานะเก่าออกจากตารางแปลง (เหลือแบบเดียวกับ ขั้นของลีด() ใน packages/shared/lib/leadStage.ts)
-- ⚠️ enum lead_status ยังมีค่า FOLLOWUP/NEGO (Postgres ลบค่า enum ไม่ได้) — ข้อบังคับ + ตัวดักทำให้ไม่มีแถวไหนใช้ได้
--   ตัวกรองในคำสั่งรายงานเดิม (lead_summary · kpi_cards · lead_apply ป้ายสถานะ) ยังเขียนค่าเก่าไว้ แต่ไม่มีแถวไหนตรงแล้ว (ไม่ยกคำสั่งใหญ่มาเขียนใหม่)
-- ฐานจริง (คนรวมงานนับ 28 ต.ค. 69): ลีดสถานะเก่า 0 · รายการเตือนรหัสเก่า 0 · แม่แบบเป็นชุดใหม่แล้ว → ข้อ 1 ย้ายเฉพาะช่อง "stage" ที่ค้าง (ถ้ามี)
-- ข้อทดสอบ: supabase/tests/lead_old_status_retired.sql

-- ═══ 0. ตัวช่วย: รายการเตือนชุดหนึ่ง → รูปแบบใหม่ (ไม่มี "stage" · ไม่มีรายการ flow เก่า) ═════════════════════════════════
--   p_template = true: แม่แบบของ HQ — รายการที่ไม่มีขั้น (step) ได้ขั้นจาก "stage" เดิม (กติกาเดียวกับใบ 0250)
create or replace function public._lead_tasks_drop_old_flow(p_tasks jsonb, p_template boolean default false) returns jsonb
  language sql immutable set search_path to 'public' as $$
  with x as (
    select e, o from jsonb_array_elements(case when jsonb_typeof(p_tasks) = 'array' then p_tasks else '[]'::jsonb end) with ordinality y(e, o)
  ), มี as (
    select exists (select 1 from x where jsonb_typeof(e) = 'object' and e ->> 'key' = 'followCustomer') as ติดตามลูกค้า
  )
  select coalesce(jsonb_agg(
           case when jsonb_typeof(e) <> 'object' then e
                else (e - 'stage')
                     || case when e ->> 'key' = 'followup' then jsonb_build_object('key', 'followCustomer', 'label', 'ติดตามลูกค้า') else '{}'::jsonb end
                     || case when p_template and not (e ? 'step') then jsonb_build_object('step',
                               case coalesce(e ->> 'stage', '') when 'HQ_PRICING' then 2 when 'HQ_QUOTED' then 3
                                    when 'QUOTED' then 5 when 'FOLLOWUP' then 5 when 'NEGO' then 5 else 1 end)
                             when p_template and e ->> 'key' = 'followup' then jsonb_build_object('step', 5)
                             else '{}'::jsonb end
           end order by o), '[]'::jsonb)
    from x
   where not (jsonb_typeof(e) = 'object' and coalesce(e ->> 'key', '') in ('negotiate', 'close', 'catalog'))
     and not (jsonb_typeof(e) = 'object' and e ->> 'key' = 'followup' and (select ติดตามลูกค้า from มี))
$$;
revoke all on function public._lead_tasks_drop_old_flow(jsonb, boolean) from public, anon, authenticated, service_role;

/** รายการเตือนชุดนี้ยังมีของ flow เก่าไหม (รหัสเก่า หรือช่อง "stage") */
create or replace function public._lead_tasks_has_old_flow(p_tasks jsonb) returns boolean
  language sql immutable set search_path to 'public' as $$
  select exists (
    select 1 from jsonb_array_elements(case when jsonb_typeof(p_tasks) = 'array' then p_tasks else '[]'::jsonb end) e
     where jsonb_typeof(e) = 'object' and (e ? 'stage' or coalesce(e ->> 'key', '') in ('followup', 'negotiate', 'close', 'catalog')))
$$;
revoke all on function public._lead_tasks_has_old_flow(jsonb) from public, anon, authenticated, service_role;

-- ═══ 1. ย้ายข้อมูล ═══════════════════════════════════════════════════════════════════════════════════════════
set local session_replication_role = replica;
do $$
declare n int;
begin
  update leads set status = 'QUOTED' where status in ('FOLLOWUP', 'NEGO');
  get diagnostics n = row_count;
  raise notice 'ใบ 0257: ลีดสถานะ ติดตามผล/เจรจาต่อรอง → เสนอราคา % แถว', n;

  update leads set status_before_paid = 'QUOTED' where status_before_paid in ('FOLLOWUP', 'NEGO');
  get diagnostics n = row_count;
  raise notice 'ใบ 0257: สถานะก่อนปิด ติดตามผล/เจรจาต่อรอง → เสนอราคา % แถว', n;

  update leads set tasks = _lead_tasks_drop_old_flow(tasks) where _lead_tasks_has_old_flow(tasks);
  get diagnostics n = row_count;
  raise notice 'ใบ 0257: รายการเตือนของลีดแบบเก่า (ช่อง stage / รายการ flow เก่า) → แบบใหม่ % แถว', n;

  update hq_sales_journey set tasks = _lead_tasks_drop_old_flow(tasks, true) where _lead_tasks_has_old_flow(tasks);
  get diagnostics n = row_count;
  raise notice 'ใบ 0257: แม่แบบงาน HQ แบบเก่า → แบบใหม่ % แถว', n;
end $$;
set local session_replication_role = origin;

-- ═══ 2. ฐานไม่รับของเก่าอีก ══════════════════════════════════════════════════════════════════════════════════
-- ตัวดักทั้งสองเป็น security definer: เรียกฟังก์ชันช่วยที่ถอนสิทธิ์จากทุกบทบาท (ไม่งั้นเพิ่ม/แก้ลีดล้ม permission denied)
create or replace function public.leads_old_flow_retired() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
declare เก่า jsonb := '{"FOLLOWUP":"ติดตามผล","NEGO":"เจรจาต่อรอง"}';
begin
  if new.status::text in ('FOLLOWUP', 'NEGO') then
    raise exception 'lead_status_retired: สถานะ "%" เลิกใช้แล้ว (FLOW 5 ขั้น) — ลีดที่ส่งใบเสนอราคาให้ลูกค้าแล้วอยู่ขั้น "รอลูกค้าตอบ" จนลูกค้าตอบรับหรือปฏิเสธที่ใบ',
      เก่า ->> new.status::text;
  end if;
  if new.status_before_paid::text in ('FOLLOWUP', 'NEGO') then
    raise exception 'lead_status_retired: สถานะก่อนปิด "%" เลิกใช้แล้ว (FLOW 5 ขั้น) — ใช้ "เสนอราคา"', เก่า ->> new.status_before_paid::text;
  end if;
  if (tg_op = 'INSERT' or new.tasks is distinct from old.tasks) and _lead_tasks_has_old_flow(new.tasks) then
    raise exception 'lead_task_retired: รายการเตือนแบบเก่า (ติดตามผล/เจรจาต่อรอง/ปิดการขาย/ส่งแม่แบบ หรือผูกสถานะลีดแบบเก่า) เลิกใช้แล้ว — งานในแต่ละขั้นมีตามแม่แบบ 5 ขั้นเท่านั้น';
  end if;
  return new;
end $$;
revoke all on function public.leads_old_flow_retired() from public, anon, authenticated, service_role;
drop trigger if exists leads_00_old_flow_retired on public.leads;
create trigger leads_00_old_flow_retired before insert or update of status, status_before_paid, tasks on public.leads
  for each row execute function public.leads_old_flow_retired();

-- ทางที่ปิดตัวดัก (กู้ข้อมูล · session_replication_role = replica) ก็ใส่สถานะเก่าไม่ได้
alter table public.leads drop constraint if exists leads_status_retired;
alter table public.leads add constraint leads_status_retired
  check (status::text not in ('FOLLOWUP', 'NEGO') and coalesce(status_before_paid::text, '') not in ('FOLLOWUP', 'NEGO'));

create or replace function public.hq_sales_journey_old_tasks_retired() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if _lead_tasks_has_old_flow(new.tasks) then
    raise exception 'lead_task_retired: แม่แบบงานแบบเก่า (ติดตามผล/เจรจาต่อรอง/ปิดการขาย/ส่งแม่แบบ หรือผูกสถานะลีดแบบเก่า) เลิกใช้แล้ว — ทุกรายการผูกกับขั้น 1–5';
  end if;
  return new;
end $$;
revoke all on function public.hq_sales_journey_old_tasks_retired() from public, anon, authenticated, service_role;
drop trigger if exists hq_sales_journey_old_tasks_retired on public.hq_sales_journey;
create trigger hq_sales_journey_old_tasks_retired before insert or update of tasks on public.hq_sales_journey
  for each row execute function public.hq_sales_journey_old_tasks_retired();

-- ═══ 3. lead_stage_no: ตารางแปลงไม่มีสถานะเก่า (ยกจาก 0251 · ตัดบรรทัด FOLLOWUP/NEGO) ═══════════════════════════════════
create or replace function public.lead_stage_no(p_dealer text, p_num integer, p_status lead_status) returns integer
  language sql stable set search_path to 'public' as $$
  select case p_status
    when 'WAITING' then 1 when 'BULLET' then 1
    when 'HQ_PRICING' then 2
    when 'HQ_QUOTED' then case when exists (select 1 from quotations q
                                             where q.dealer_code = coalesce(p_dealer, 'CNX') and q.deal_id = p_num and q.status = 'draft')
                               then 4 else 3 end
    when 'QUOTED' then 5
    when 'PAID' then 6
    when 'CANCELLED' then 7
  end
$$;
revoke all on function public.lead_stage_no(text, integer, lead_status) from public, anon, authenticated, service_role;
grant execute on function public.lead_stage_no(text, integer, lead_status) to authenticated, service_role;
