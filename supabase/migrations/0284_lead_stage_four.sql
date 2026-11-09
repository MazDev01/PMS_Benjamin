-- ── ใบ 0284: ยุบขั้นการขายของลีดเหลือ 4 ขั้น (จองโดยเซสชัน stage4 · บอสสั่ง 9 พ.ย. 69) ──
-- เดิม 5 ขั้น: ข้อมูลลูกค้า · ขอราคา HQ · ได้ใบ HQ · ทำใบให้ลูกค้า · รอลูกค้าตอบ
-- ใหม่ 4 ขั้น: ข้อมูลลูกค้า · ขอราคา HQ · ได้ใบ HQ · เสนอราคาลูกค้า (= ทำใบแล้วยังไม่ส่ง + ส่งให้ลูกค้าแล้ว)
--   ปิดสำเร็จ 6 / ปิดไม่สำเร็จ 7 คงเลขเดิม (เลข 5 ว่าง — ลิงก์ ?stage= และ API ไม่เปลี่ยนความหมาย · ตัวกลางหน้าเว็บ packages/shared/lib/leadStage.ts)
-- ขั้นของลีดไม่ได้เก็บในแถว (คิดจากสถานะ + ใบร่าง) → ไม่ย้ายสถานะลีด · สิ่งที่ใบนี้เปลี่ยน:
--   1) lead_stage_no: เสนอราคา (QUOTED) = 4 (เดิม 5) · ได้ราคา HQ + ใบร่าง = 4 เหมือนเดิม
--   2) leads.reached_step (ขั้นไกลสุดที่เคยไปถึง · ใบ 0258): เคยส่งใบถึงลูกค้า = 4 (เดิม 5) · แถวที่เป็น 5 → 4
--   3) งานในแต่ละขั้น: รายการของระบบ "ส่งใบเสนอราคา" + รายการตั้งต้น "ติดตามลูกค้า" อยู่ขั้น 4 · แม่แบบของ HQ (hq_sales_journey.tasks)
--      รายการขั้น 5 เดิม → ขั้น 4 ต่อท้ายรายการขั้น 4 เดิม (เรียงตามลำดับเดิม) · ตัวกันแม่แบบรับขั้น 1–4
--   4) kpi_cards('dealer.leads'): การ์ด "เสนอราคาลูกค้า" = quoteStage (ได้ราคา HQ + ใบร่าง + เสนอราคา) · awaitingClient คงไว้ให้ที่เรียกเดิม
--      (ยกฟังก์ชันจากใบ 0283 ทั้งตัว แก้เฉพาะช่องนี้)
--   5) hq_drill('leads'): คอลัมน์ wait = ลีดขั้นเสนอราคาลูกค้าทั้งหมด (บอสตอบ 9 พ.ย. 69 ข้อ 2 ก · ยกจากใบ 0271 แก้บรรทัดเดียว)
--   6) ข้อความปฏิเสธของตัวกันเดิม (ใบ 0250/0257) ใช้ชื่อขั้นชุดใหม่ · ตัวแปลงรายการเตือนแบบเก่า (_lead_tasks_drop_old_flow) ให้ขั้น 4
-- บันทึกเก่า (audit · ไทม์ไลน์ลีด) ไม่แก้ — หน้าเว็บแปลงชื่อขั้นเดิมตอนแสดง (แปลงชื่อขั้นเดิม ใน leadStage.ts)
-- อัตราปิดการขายสูตรเดิม (นับสถานะ PAID/CANCELLED ไม่ขึ้นกับเลขขั้น)
-- ฐานจริง (คนรวมงานนับ 9 พ.ย. 69 อ่านอย่างเดียว): reached_step = 5 → 0 แถว · แม่แบบงานขั้น 5 = 2 รายการ
-- รันซ้ำได้: ทุกฟังก์ชัน create or replace · ข้อมูลแปลงเฉพาะค่าที่ยังเป็นของเดิม (step 5 / reached_step 5)
-- ข้อทดสอบ: tests/scenario/lead-stage-four.spec.ts ([db] รันใบนี้จริงบนข้อมูลแบบเดิม 2 รอบ) · supabase/tests/lead_stage_no.sql · lead_has_quotes.sql · lead_old_status_retired.sql · lead_tasks_five_steps.sql · hq_drill.sql

-- ═══ 1. เลขขั้นของลีด ═══════════════════════════════════════════════════════════════════════════════════
create or replace function public.lead_stage_no(p_dealer text, p_num integer, p_status lead_status) returns integer
  language sql stable set search_path to 'public' as $$
  select case p_status
    when 'WAITING' then 1 when 'BULLET' then 1
    when 'HQ_PRICING' then 2
    when 'HQ_QUOTED' then case when exists (select 1 from quotations q
                                             where q.dealer_code = coalesce(p_dealer, 'CNX') and q.deal_id = p_num and q.status = 'draft')
                               then 4 else 3 end
    when 'QUOTED' then 4
    when 'PAID' then 6
    when 'CANCELLED' then 7
  end
$$;
revoke all on function public.lead_stage_no(text, integer, lead_status) from public, anon, authenticated, service_role;
grant execute on function public.lead_stage_no(text, integer, lead_status) to authenticated, service_role;

-- ═══ 2. ขั้นไกลสุดที่เคยไปถึง (1–4) ══════════════════════════════════════════════════════════════════════
--   เคยทำใบลูกค้า (ส่งแล้วหรือยัง) = 4 · เงื่อนไขเดียวกับ สภาพแถบขั้น() ใน leadStage.ts
create or replace function public._lead_reached_step(p_dealer text, p_num integer) returns smallint
  language sql stable security definer set search_path to 'public' as $$
  select case
    when exists (select 1 from quotations q where q.dealer_code = p_dealer and q.deal_id = p_num) then 4
    when exists (select 1 from quote_requests r where r.dealer_code = p_dealer and r.lead_num_id = p_num
                  and r.status in ('quoted', 'won', 'lost', 'superseded')) then 3
    when exists (select 1 from quote_requests r where r.dealer_code = p_dealer and r.lead_num_id = p_num) then 2
    else 1 end::smallint
$$;
revoke all on function public._lead_reached_step(text, integer) from public, anon, authenticated, service_role;
comment on column public.leads.reached_step is
  'ขั้นไกลสุดที่ดีลเคยไปถึง 1–4 (2 ขอราคา · 3 HQ ส่งใบ · 4 ทำใบลูกค้า/ส่งใบถึงลูกค้า) · ฐานเขียนเอง (ใบ 0258 · 4 ขั้น ใบ 0284) · แถบความคืบหน้าของลีดที่ปิดไม่สำเร็จ';

-- ═══ 3. รายการของระบบ + แม่แบบตั้งต้น (ทับใบ 0263 · "ส่งใบเสนอราคา" / "ติดตามลูกค้า" ขั้น 4) ═══════════════════════════
create or replace function public._lead_system_tasks() returns jsonb
  language sql immutable set search_path to 'public' as $$
  select '[
    {"key":"collect","label":"เก็บข้อมูลลูกค้า","step":1,"auto":true},
    {"key":"requirement","label":"สรุปความต้องการ","step":1,"auto":true},
    {"key":"appointment","label":"นัดหมาย","step":1,"auto":true},
    {"key":"requestQuote","label":"ส่งคำขอราคา","step":2,"auto":true},
    {"key":"hqQuote","label":"ได้ใบ HQ","step":3,"auto":true},
    {"key":"makeQuote","label":"จัดทำใบเสนอราคา","step":4,"auto":true},
    {"key":"sendQuote","label":"ส่งใบเสนอราคา","step":4,"auto":true}
  ]'::jsonb
$$;
revoke all on function public._lead_system_tasks() from public, anon, authenticated, service_role;

create or replace function public._lead_task_template_default() returns jsonb
  language sql immutable set search_path to 'public' as $$
  select '[
    {"key":"collect","label":"เก็บข้อมูลลูกค้า","step":1,"auto":true},
    {"key":"requirement","label":"สรุปความต้องการ","step":1,"auto":true},
    {"key":"appointment","label":"นัดหมาย","step":1,"auto":true},
    {"key":"requestQuote","label":"ส่งคำขอราคา","step":2,"auto":true},
    {"key":"hqQuote","label":"ได้ใบ HQ","step":3,"auto":true},
    {"key":"makeQuote","label":"จัดทำใบเสนอราคา","step":4,"auto":true},
    {"key":"sendQuote","label":"ส่งใบเสนอราคา","step":4,"auto":true},
    {"key":"followCustomer","label":"ติดตามลูกค้า","step":4}
  ]'::jsonb
$$;
revoke all on function public._lead_task_template_default() from public, anon, authenticated, service_role;

-- แม่แบบงานชุดหนึ่ง: ขั้น 5 เดิม → ขั้น 4 · เรียงตามขั้นใหม่ แล้วตามลำดับเดิม (รายการขั้น 5 เดิมต่อท้ายรายการขั้น 4 เดิม)
--   ไม่มีขั้น 5 = คืนชุดเดิมทุกตัวอักษร (ไม่จัดเรียงใหม่)
create or replace function public._lead_tasks_four_steps(p_tasks jsonb) returns jsonb
  language sql immutable set search_path to 'public' as $$
  select case
    when jsonb_typeof(p_tasks) <> 'array'
      or not exists (select 1 from jsonb_array_elements(p_tasks) e where jsonb_typeof(e) = 'object' and e ->> 'step' = '5') then p_tasks
    else (select coalesce(jsonb_agg(z.e order by z.ขั้น, z.o), '[]'::jsonb) from (
      select case when jsonb_typeof(x.e) = 'object' and x.e ->> 'step' = '5' then x.e || jsonb_build_object('step', 4) else x.e end as e,
             case when jsonb_typeof(x.e) = 'object' and coalesce(x.e ->> 'step', '') ~ '^[0-9]+$' then least((x.e ->> 'step')::int, 4) else 0 end as ขั้น,
             x.o
        from jsonb_array_elements(p_tasks) with ordinality x(e, o)) z)
  end
$$;
revoke all on function public._lead_tasks_four_steps(jsonb) from public, anon, authenticated, service_role;

-- ═══ 4. ตัวกันแม่แบบ: ทุกรายการต้องมีขั้น 1–4 (ทับใบ 0250) · ข้อความปฏิเสธชื่อขั้นชุดใหม่ (ทับใบ 0257) ═══════════════════════
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
              where coalesce(x ->> 'step', '') !~ '^[1-4]$' or nullif(btrim(x ->> 'label'), '') is null or nullif(btrim(x ->> 'key'), '') is null) then
    raise exception 'lead_tasks_invalid: ทุกรายการต้องมีรหัส ชื่อ และขั้น 1–4 (ข้อมูลลูกค้า · ขอราคา HQ · ได้ใบ HQ · เสนอราคาลูกค้า)';
  end if;
  return new;
end $$;
revoke all on function public.hq_sales_journey_tasks_guard() from public, anon, authenticated, service_role;

create or replace function public.hq_sales_journey_old_tasks_retired() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if _lead_tasks_has_old_flow(new.tasks) then
    raise exception 'lead_task_retired: แม่แบบงานแบบเก่า (ติดตามผล/เจรจาต่อรอง/ปิดการขาย/ส่งแม่แบบ หรือผูกสถานะลีดแบบเก่า) เลิกใช้แล้ว — ทุกรายการผูกกับขั้น 1–4';
  end if;
  return new;
end $$;
revoke all on function public.hq_sales_journey_old_tasks_retired() from public, anon, authenticated, service_role;

create or replace function public.leads_old_flow_retired() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
declare เก่า jsonb := '{"FOLLOWUP":"ติดตามผล","NEGO":"เจรจาต่อรอง"}';
begin
  if new.status::text in ('FOLLOWUP', 'NEGO') then
    raise exception 'lead_status_retired: สถานะ "%" เลิกใช้แล้ว (FLOW 4 ขั้น) — ลีดที่ส่งใบเสนอราคาให้ลูกค้าแล้วอยู่ขั้น "เสนอราคาลูกค้า" จนลูกค้าตอบรับหรือปฏิเสธที่ใบ',
      เก่า ->> new.status::text;
  end if;
  if new.status_before_paid::text in ('FOLLOWUP', 'NEGO') then
    raise exception 'lead_status_retired: สถานะก่อนปิด "%" เลิกใช้แล้ว (FLOW 4 ขั้น) — ใช้ "เสนอราคา"', เก่า ->> new.status_before_paid::text;
  end if;
  if (tg_op = 'INSERT' or new.tasks is distinct from old.tasks) and _lead_tasks_has_old_flow(new.tasks) then
    raise exception 'lead_task_retired: รายการเตือนแบบเก่า (ติดตามผล/เจรจาต่อรอง/ปิดการขาย/ส่งแม่แบบ หรือผูกสถานะลีดแบบเก่า) เลิกใช้แล้ว — งานในแต่ละขั้นมีตามแม่แบบ 4 ขั้นเท่านั้น';
  end if;
  return new;
end $$;
revoke all on function public.leads_old_flow_retired() from public, anon, authenticated, service_role;

-- ตัวแปลงรายการเตือนแบบเก่าของใบ 0257 (ยกทั้งตัว): สถานะเสนอราคา/ติดตามผล/เจรจาต่อรองเดิม → ขั้น 4 เสนอราคาลูกค้า (เดิม 5)
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
                                    when 'QUOTED' then 4 when 'FOLLOWUP' then 4 when 'NEGO' then 4 else 1 end)
                             when p_template and e ->> 'key' = 'followup' then jsonb_build_object('step', 4)
                             else '{}'::jsonb end
           end order by o), '[]'::jsonb)
    from x
   where not (jsonb_typeof(e) = 'object' and coalesce(e ->> 'key', '') in ('negotiate', 'close', 'catalog'))
     and not (jsonb_typeof(e) = 'object' and e ->> 'key' = 'followup' and (select ติดตามลูกค้า from มี))
$$;
revoke all on function public._lead_tasks_drop_old_flow(jsonb, boolean) from public, anon, authenticated, service_role;

-- ═══ 5. แปลงข้อมูลที่เก็บไว้ (รันซ้ำได้ — แตะเฉพาะค่าที่ยังเป็นของเดิม) ═══════════════════════════════════════════════
--   ปิดตัวดักระหว่างแปลง (ไม่ลงไทม์ไลน์/แจ้งเตือน/บันทึกการใช้งาน — แบบใบ 0250/0257/0263) · จำนวนแถวขึ้นเป็น NOTICE
set local session_replication_role = replica;
do $$
declare n int;
begin
  update hq_sales_journey set tasks = _lead_tasks_four_steps(tasks)
   where _lead_tasks_four_steps(tasks) is distinct from tasks;
  get diagnostics n = row_count;
  raise notice 'ใบ 0284: แม่แบบงาน HQ ขั้น 5 → ขั้น 4 % แถว', n;

  update leads set reached_step = 4 where reached_step = 5;
  get diagnostics n = row_count;
  raise notice 'ใบ 0284: ลีด reached_step 5 → 4 % แถว', n;
end $$;
set local session_replication_role = origin;

-- ═══ 6. การ์ด KPI (ยกจากใบ 0283 ทั้งตัว · เพิ่ม quoteStage ในหน้า dealer.leads) ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION public.kpi_cards(p_page text, p_start date DEFAULT NULL::date, p_end date DEFAULT NULL::date, p_dealer text DEFAULT NULL::text, p_today date DEFAULT NULL::date, p_filters jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  วันนี้ date := coalesce(p_today, (now() at time zone 'Asia/Bangkok')::date);
  ต้นปี date;
  ต้นสัปดาห์ date;
  ช่วงต้น date := p_start;
  ช่วงท้าย date := p_end;
  สาขา text;
  ได้ int; เสีย int; ส่ง int; รอ int; เป้า numeric; ยอด numeric; เป้าช่วง numeric;
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  ชุด text[];
  ชุดสาขา text[];
  ชุดจังหวัด text[];
  ชุดสาขาค้น text[];
  ซื้อจาก date;
  ซื้อถึง date;
  จังหวัด text := nullif(btrim(coalesce(f ->> 'province', '')), '');
  ช่องทาง text := nullif(btrim(coalesce(f ->> 'source', '')), '');
  คำค้น text := nullif(lower(btrim(coalesce(f ->> 'search', ''))), '');
begin
  ต้นปี := date_trunc('year', วันนี้)::date;
  ต้นสัปดาห์ := วันนี้ - (extract(isodow from วันนี้)::int - 1);
  if (ช่วงต้น is null) <> (ช่วงท้าย is null) or ช่วงท้าย < ช่วงต้น then raise exception 'bad_range: ช่วงเวลาไม่ถูกต้อง'; end if;
  if jsonb_typeof(f) <> 'object' then raise exception 'bad_filters: ตัวกรองต้องเป็นก้อนข้อมูล'; end if;
  if jsonb_typeof(f -> 'ids') = 'array' then ชุด := array(select jsonb_array_elements_text(f -> 'ids')); end if;
  if jsonb_typeof(f -> 'dealerCodes') = 'array' then ชุดสาขา := array(select jsonb_array_elements_text(f -> 'dealerCodes')); end if;
  if jsonb_typeof(f -> 'searchDealers') = 'array' then ชุดสาขาค้น := array(select jsonb_array_elements_text(f -> 'searchDealers')); end if;
  if jsonb_typeof(f -> 'provinces') = 'array' then ชุดจังหวัด := array(select jsonb_array_elements_text(f -> 'provinces')); end if;

  -- ══ หน้าดีลเลอร์ — สาขาของผู้เรียกเท่านั้น (ไม่มีช่วง = ทุกช่วงเวลา) ══
  if p_page like 'dealer.%' then
    สาขา := auth_dealer();
    if coalesce(สาขา, '') = '' or สาขา = 'HQ' then raise exception 'forbidden: เฉพาะดีลเลอร์'; end if;

    if p_page = 'dealer.dashboard' then
      select nullif(coalesce(revenue_target, 0), 0) into เป้า from dealers where code = สาขา;
      select coalesce(sum(w.value), 0) into ยอด from _kpi_won(สาขา) w where w.d between ต้นปี and วันนี้;
      select count(*) filter (where status = 'PAID'), count(*) filter (where status = 'CANCELLED') into ได้, เสีย
        from leads where dealer_code = สาขา and (ช่วงต้น is null or created_date between ช่วงต้น and ช่วงท้าย);
      return jsonb_build_object(
        'target',   jsonb_build_object('annual', เป้า, 'ytd', ยอด, 'pct', case when เป้า is null then null else round(100 * ยอด / เป้า) end),
        'pipeline', (select jsonb_build_object('count', count(*), 'value', coalesce(sum(quote_value), 0))
                       from leads where dealer_code = สาขา and status not in ('PAID', 'CANCELLED')),
        'awaiting', (select jsonb_build_object('count', count(*), 'value', coalesce(sum(total_value), 0))
                       from quotations where dealer_code = สาขา and status = 'sent_to_client'),
        'won',      jsonb_build_object('count', ได้, 'lost', เสีย, 'rate', case when ได้ + เสีย = 0 then null else round(100.0 * ได้ / (ได้ + เสีย)) end));

    elsif p_page = 'dealer.leads' then
      return (select jsonb_build_object(
        'open',            count(*) filter (where l.status not in ('PAID', 'CANCELLED')),
        'hqPricing',       count(*) filter (where l.status = 'HQ_PRICING'),
        -- ใบร่างของลีด = กติกาเดียวกับหน้าเว็บ (lib/leadQuote.ts quoteBelongsToLead): ผูกดีล = เลขดีลตรง · ไม่ผูก = ลูกค้าเดียวกัน หรือชื่อบริษัทตรง
        'hqQuotedNoDraft', count(*) filter (where l.status = 'HQ_QUOTED' and not exists (
                              select 1 from quotations q where q.dealer_code = l.dealer_code and q.status = 'draft'
                                 and case when q.deal_id is not null then q.deal_id = l.num_id
                                          else (l.customer_id is not null and q.customer_id = l.customer_id) or q.customer = l.company end)),
        'awaitingClient',  count(*) filter (where l.status in ('QUOTED', 'FOLLOWUP', 'NEGO')),
        -- ขั้นเสนอราคาลูกค้า (ใบ 0284 · ยุบ 2 ขั้นเดิม 9 พ.ย. 69) = ได้ราคา HQ + มีใบร่าง (กติกาเดียวกับ hqQuotedNoDraft) + ส่งใบแล้ว
        'quoteStage',      count(*) filter (where l.status = 'QUOTED' or (l.status = 'HQ_QUOTED' and exists (
                              select 1 from quotations q where q.dealer_code = l.dealer_code and q.status = 'draft'
                                 and case when q.deal_id is not null then q.deal_id = l.num_id
                                          else (l.customer_id is not null and q.customer_id = l.customer_id) or q.customer = l.company end))))
        from leads l where l.dealer_code = สาขา and (ชุด is null or l.id = any(ชุด)));

    elsif p_page = 'dealer.quotations' then
      return jsonb_build_object(
        'drafts',   (select count(*) from quotations where dealer_code = สาขา and status = 'draft' and (ชุด is null or id = any(ชุด))),
        'awaiting', (select count(*) from quotations where dealer_code = สาขา and status = 'sent_to_client' and (ชุด is null or id = any(ชุด))),
        'won',      (select jsonb_build_object('count', count(*), 'value', coalesce(sum(w.value), 0))
                       from _kpi_won(สาขา) w where (ช่วงต้น is null or w.d between ช่วงต้น and ช่วงท้าย) and (ชุด is null or w.quote_id = any(ชุด))),
        'expiring', (select count(*) from quotations q where q.dealer_code = สาขา and q.status = 'sent_to_client' and (ชุด is null or q.id = any(ชุด))
                       and _quote_valid_until(q) between วันนี้ and วันนี้ + 3));

    elsif p_page = 'dealer.customers' then
      return jsonb_build_object(
        'total',    (select count(*) from customers where dealer_code = สาขา and (ชุด is null or id::text = any(ชุด))),
        -- ลูกค้าใหม่ = วันที่เป็นลูกค้า (join_date · ช่องเดียวกับที่หน้าเว็บแสดง/กรอง) อยู่ในช่วง
        'new',      (select count(*) from customers where dealer_code = สาขา and join_date ~ '^\d{4}-\d{2}-\d{2}' and (ชุด is null or id::text = any(ชุด))
                       and (ช่วงต้น is null or substring(join_date, 1, 10)::date between ช่วงต้น and ช่วงท้าย)),
        'sales',    (select coalesce(sum(w.value), 0) from _kpi_won(สาขา) w
                      where (ช่วงต้น is null or w.d between ช่วงต้น and ช่วงท้าย) and (ชุด is null or w.customer_id::text = any(ชุด))),
        'openDeal', (select count(distinct customer_id) from leads where dealer_code = สาขา and customer_id is not null
                       and status not in ('PAID', 'CANCELLED') and (ชุด is null or customer_id::text = any(ชุด))));

    elsif p_page = 'dealer.calendar' then
      return (select jsonb_build_object(
        'today',    count(*) filter (where ว = วันนี้),
        'week',     count(*) filter (where ว between ต้นสัปดาห์ and ต้นสัปดาห์ + 6),
        'overdue',  count(*) filter (where ว < วันนี้ and coalesce(a.status, '') not in ('done', 'cancelled')),   -- 0253: นัดที่ยกเลิกแล้วไม่ใช่ "ยังไม่ปิด"
        'doneWeek', count(*) filter (where ว between ต้นสัปดาห์ and ต้นสัปดาห์ + 6 and a.status = 'done'))
        from (select status, case when date ~ '^\d{4}-\d{2}-\d{2}' then substring(date, 1, 10)::date end as ว
                from appointments where dealer_code = สาขา and (ชุด is null or id::text = any(ชุด))) a);
    end if;
    raise exception 'invalid_page: %', p_page;
  end if;

  -- ══ หน้า HQ ══
  if not is_hq() then raise exception 'forbidden: เฉพาะสำนักงานใหญ่'; end if;
  if p_dealer is not null and not exists (select 1 from dealers where code = p_dealer and code <> 'HQ') then
    raise exception 'invalid_dealer: %', p_dealer;
  end if;
  -- การ์ด "ในช่วงนี้" ของหน้า HQ ต้องมีช่วง (หน้าที่ไม่มีตัวกรองส่งเดือนนี้มา)
  if ช่วงต้น is null and p_page not in ('hq.dealers', 'hq.users') then raise exception 'bad_range: ต้องระบุช่วงเวลา'; end if;

  if p_page = 'hq.prospects' then
    return jsonb_build_object(
      'talking',   (select count(*) from dealer_prospects where status in ('new', 'contacted', 'profile_sent', 'meeting', 'considering')
                      and (ชุด is null or id::text = any(ชุด))),
      'followDue', (select count(*) from dealer_prospects where status in ('new', 'contacted', 'profile_sent', 'meeting', 'considering')
                      and follow_up is not null and follow_up <= วันนี้ and (ชุด is null or id::text = any(ชุด))),
      -- ไม่ได้ติดต่อ 14 วัน (บอสสั่ง 1 พ.ย. 69 · แทน "รอตอบใบค่าแฟรนไชส์") = สูตรเดียวกับตัวกรอง idle14 ของหน้าผู้สนใจ (prospectJourney.ไม่ได้ติดต่อเกิน):
      --   ยังติดตามอยู่ (ไม่ใช่ won/lost) · นับจากติดต่อล่าสุด ไม่เคยติดต่อ = วันเพิ่มรายชื่อ · วันตามเวลาไทย · ห่าง ≥ 14 วัน
      'idle14',    (select count(*) from dealer_prospects where status not in ('won', 'lost')
                      and (coalesce(last_contact_at, created_at) at time zone 'Asia/Bangkok')::date <= วันนี้ - 14
                      and (ชุด is null or id::text = any(ชุด))),
      'converted', (select count(*) from dealer_prospects where status = 'won' and converted_at is not null and (ชุด is null or id::text = any(ชุด))
                      and (converted_at at time zone 'Asia/Bangkok')::date between ช่วงต้น and ช่วงท้าย));

  elsif p_page = 'hq.proposals' then
    return (select jsonb_build_object(
      'waiting',  (select count(*) from dealer_package_proposals where status = 'sent' and (ชุด is null or id::text = any(ชุด))),
      -- ids = เลขใบ ให้หน้าเว็บกรองตารางตรงกับตัวเลข (กดการ์ด) — ฐานตัดสินว่าใบไหนค้าง/เกินกำหนด ไม่คิดซ้ำในเบราว์เซอร์
      'unpaid',   jsonb_build_object('count', count(*) filter (where ค้าง > 0), 'amount', coalesce(sum(ค้าง) filter (where ค้าง > 0), 0),
                                     'ids', coalesce(jsonb_agg(id order by id) filter (where ค้าง > 0), '[]'::jsonb)),
      'overdue',  jsonb_build_object('count', count(*) filter (where ค้าง > 0 and payment_due_on < วันนี้),
                                     'amount', coalesce(sum(ค้าง) filter (where ค้าง > 0 and payment_due_on < วันนี้), 0),
                                     'ids', coalesce(jsonb_agg(id order by id) filter (where ค้าง > 0 and payment_due_on < วันนี้), '[]'::jsonb)),
      'paid',     (select jsonb_build_object('count', count(*), 'amount', coalesce(sum(x.amount), 0),
                                             'ids', coalesce(jsonb_agg(distinct x.proposal_id), '[]'::jsonb)) from dealer_proposal_payments x
                    where x.cancelled_at is null and x.paid_on between ช่วงต้น and ช่วงท้าย and (ชุด is null or x.proposal_id::text = any(ชุด))))
      from (select p.id, p.payment_due_on, coalesce(p.amount, 0) - coalesce((select sum(x.amount) from dealer_proposal_payments x
                                                                              where x.proposal_id = p.id and x.cancelled_at is null), 0) as ค้าง
              from dealer_package_proposals p where p.status = 'accepted' and (ชุด is null or p.id::text = any(ชุด))) y);

  elsif p_page = 'hq.dealers' then
    return (select jsonb_build_object(
      'total',    count(*),
      'active',   count(*) filter (where status = 'active'),
      'moving',   count(*) filter (where เคลื่อนไหว),
      'idle',     count(*) filter (where not เคลื่อนไหว),
      -- รหัสสาขา ให้หน้าเว็บกรองตารางตรงกับตัวเลข (กดการ์ด) — ฐานตัดสินว่าสาขาไหนเคลื่อนไหว
      'movingCodes', coalesce(jsonb_agg(code order by code) filter (where เคลื่อนไหว), '[]'::jsonb),
      'idleCodes',   coalesce(jsonb_agg(code order by code) filter (where not เคลื่อนไหว), '[]'::jsonb))
      from (select code, status, _dealer_active_since(code, วันนี้ - 30) as เคลื่อนไหว from dealers
             where code <> 'HQ' and (ชุด is null or code = any(ชุด))) x);

  elsif p_page = 'hq.pipeline' then
    -- เป้า (ใบ 0283 · บอสสั่ง 9 พ.ย. 69 ทับข้อตัดสิน 22 ต.ค. 69): ทั้งเครือ = ผลรวมเป้าสาขาอัตโนมัติ (ไม่ใช้ hq_targets แล้ว)
    --   เป้าตามช่วง = ผลรวมเป้าตามช่วงรายสาขา (ตัวกลาง _network_target) = ผลรวมคอลัมน์เป้าในตารางผลงาน (hq_pipeline_dealers) เสมอ
    select t.annual, t.period into เป้า, เป้าช่วง
      from _network_target(case when p_dealer is not null then array[p_dealer] else ชุดสาขา end, ช่วงท้าย - ช่วงต้น + 1) t;
    select count(*) filter (where status = 'PAID'), count(*) filter (where status = 'CANCELLED') into ได้, เสีย
      from leads where dealer_code <> 'HQ' and (p_dealer is null or dealer_code = p_dealer) and (ชุดสาขา is null or dealer_code = any(ชุดสาขา))
       and created_date between ช่วงต้น and ช่วงท้าย;
    return jsonb_build_object(
      'sales',   jsonb_build_object('value', (select coalesce(sum(w.value), 0) from _kpi_won(p_dealer) w
                                               where w.d between ช่วงต้น and ช่วงท้าย and (ชุดสาขา is null or w.dealer_code = any(ชุดสาขา))),
                                    'target', เป้าช่วง),
      'winRate', jsonb_build_object('won', ได้, 'lost', เสีย, 'rate', case when ได้ + เสีย = 0 then null else round(100.0 * ได้ / (ได้ + เสีย)) end),
      -- margin เฉลี่ย = ส่วนบวกของใบลูกค้า won ที่ผูกใบ HQ (ตอบรับในช่วง) เป็น % ของราคาขาย · สูตรเดียวกับ hq_overview 0209
      'margin',  (select jsonb_build_object('quotes', count(*), 'pct', case when coalesce(sum(q.total_value), 0) = 0 then null
                           else round(100.0 * (sum(q.total_value) - sum(h.total_cost)) / sum(q.total_value), 1) end)
                    from quotations q join hq_quotes h on h.id = q.hq_quote_id
                    join quotation_won_at w on w.dealer_code = q.dealer_code and w.quote_id = q.id
                   where q.status = 'won' and q.dealer_code <> 'HQ' and (p_dealer is null or q.dealer_code = p_dealer)
                     and (ชุดสาขา is null or q.dealer_code = any(ชุดสาขา))
                     and (w.won_at at time zone 'Asia/Bangkok')::date between ช่วงต้น and ช่วงท้าย),
      -- ถึงเป้า (ใบ 0283 · บอสสั่ง 9 พ.ย. 69) = ยอดในช่วงที่เลือก ≥ เป้าตามช่วงของสาขา (เป้าปี × วัน ÷ 365) — ช่วงเดียวกับการ์ด
      --   ตรงแผงรายชื่อ + คอลัมน์ onTarget ของ hq_pipeline_dealers · นับเฉพาะสาขาที่ตั้งเป้า · (แดชบอร์ดดีลเลอร์ยังเทียบต้นปี/ทั้งปี ไม่แตะ)
      'onTarget', (select jsonb_build_object('reached', count(*) filter (where t.sales >= t.target), 'of', count(*),
                                             'codes', coalesce(jsonb_agg(t.code order by t.code) filter (where t.sales >= t.target), '[]'::jsonb))
                     from (select x.code, round(x.revenue_target * (ช่วงท้าย - ช่วงต้น + 1) / 365) as target,
                                  (select coalesce(sum(w.value), 0) from _kpi_won(x.code) w where w.d between ช่วงต้น and ช่วงท้าย) as sales
                             from dealers x where x.code <> 'HQ' and coalesce(x.revenue_target, 0) > 0
                              and (p_dealer is null or x.code = p_dealer) and (ชุดสาขา is null or x.code = any(ชุดสาขา))) t));

  -- ══ 3 หน้าเจาะลึก (ใบ 0271 · บอสสั่ง 2 พ.ย. 69): การ์ด = ผลรวมแถวรายดีลเลอร์ของ hq_drill ชุดเดียวกับตาราง/แผงที่มา ══
  --   ตัวกรองที่ใช้ = สาขา (p_dealer · dealerCodes) เท่านั้น — ระดับ ภูมิภาค/จังหวัด/ดีลเลอร์ ของหน้าส่งมาเป็นชุดสาขา · ไม่นับแถว HQ
  elsif p_page in ('hq.leads', 'hq.quotations', 'hq.customers') then
    if ช่วงต้น is null then raise exception 'bad_range: ต้องระบุช่วงเวลา'; end if;
    return (with ร as (
      select r from jsonb_array_elements(hq_drill(substring(p_page from 4), ช่วงต้น, ช่วงท้าย, วันนี้) -> 'dealers') r
       where (p_dealer is null or r->>'code' = p_dealer) and (ชุดสาขา is null or r->>'code' = any(ชุดสาขา))
    ), ส as (
      select coalesce(sum((r->>'leads')::int), 0) as leads, coalesce(sum((r->>'open')::int), 0) as open, coalesce(sum((r->>'qr')::int), 0) as qr,
             coalesce(sum((r->>'stale')::int), 0) as stale, coalesce(sum((r->>'sent')::int), 0) as sent, coalesce(sum((r->>'wait')::int), 0) as wait,
             coalesce(sum((r->>'won')::int), 0) as won, coalesce(sum((r->>'sales')::numeric), 0) as sales,
             coalesce(sum((r->>'cust')::int), 0) as cust, coalesce(sum((r->>'newc')::int), 0) as newc,
             count(*) filter (where (r->>'cust')::int > 0) as withc, count(*) as n
        from ร)
    select case p_page
      when 'hq.leads' then jsonb_build_object('open', open, 'new', leads, 'qr', qr, 'idle', stale)
      when 'hq.quotations' then jsonb_build_object('sent', sent, 'awaiting', wait, 'won', jsonb_build_object('count', won, 'value', sales),
                                                   'acceptRate', case when sent = 0 then null else round(100.0 * won / sent, 1) end)
      else jsonb_build_object('total', cust, 'new', newc, 'dealers', jsonb_build_object('with', withc, 'of', n)) end
      from ส);

  elsif p_page = 'hq.audit' then
    return (select jsonb_build_object(
      'actionsToday',   count(*) filter (where (a.at at time zone 'Asia/Bangkok')::date = วันนี้),
      'usersToday',     count(distinct a."user") filter (where (a.at at time zone 'Asia/Bangkok')::date = วันนี้),
      'impersonations', count(*) filter (where a.action = 'เข้าระบบแทนดีลเลอร์' and (a.at at time zone 'Asia/Bangkok')::date between ช่วงต้น and ช่วงท้าย),
      'reversals',      count(*) filter (where (a.action like 'ย้อน%' or a.action like 'ยกเลิก%') and (a.at at time zone 'Asia/Bangkok')::date between ช่วงต้น and ช่วงท้าย))
      from audit_log_hq a                                          -- เฉพาะที่คนของ HQ ทำ (ใบ 0274 · ชุดเดียวกับตาราง/ส่งออกของหน้า)
     where not _audit_is_test_row(a."user", a.target, a.action)   -- นิยามแถวทดสอบตัวเดียวกับตัวล้างบันทึก (0241)
       and (ชุด is null or a.id::text = any(ชุด)));

  elsif p_page = 'hq.users' then
    return (select jsonb_build_object(
      'total',      count(*),
      'active',     count(*) filter (where p.status = 'active'),
      'inactive',   count(*) filter (where p.status <> 'active'),
      'signedIn30', count(*) filter (where u.last_sign_in_at >= now() - interval '30 days'))
      from profiles p left join auth.users u on u.id = p.id
     where p.role in ('SUPER_ADMIN', 'HQ_MANAGEMENT', 'HQ_STAFF') and (ชุด is null or p.id::text = any(ชุด)));
  end if;
  raise exception 'invalid_page: %', p_page;
end $function$;

-- ═══ 7. เจาะลึกลีดทั้งเครือ (ยกจากใบ 0271 ทั้งตัว · wait = ขั้นเสนอราคาลูกค้า) ════════════════════════════════════════
create or replace function public.hq_drill(p_page text, p_start date, p_end date, p_today date default null)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  วันนี้ date := coalesce(p_today, (now() at time zone 'Asia/Bangkok')::date);
  แถว jsonb; เดือน jsonb;
begin
  if not is_hq() then raise exception 'forbidden: เฉพาะสำนักงานใหญ่'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'bad_range: ช่วงเวลาไม่ถูกต้อง'; end if;
  if p_page = 'leads' then
    select coalesce(jsonb_agg(jsonb_build_object('code', d.code, 'name', d.name, 'region', d.region, 'province', d.province,
             'leads', x.leads, 'open', x.open, 'qr', x.qr, 'wait', x.wait, 'stale', x.stale, 'won', x.won, 'lost', x.lost) order by d.code), '[]'::jsonb)
      into แถว
      from dealers d cross join lateral (
        select count(*) filter (where l.created_date between p_start and p_end) as leads,
               count(*) filter (where l.status not in ('PAID', 'CANCELLED')) as open,
               count(*) filter (where l.status not in ('PAID', 'CANCELLED') and lead_stage_no(l.dealer_code, l.num_id, l.status) = 2) as qr,
               count(*) filter (where l.status not in ('PAID', 'CANCELLED') and lead_stage_no(l.dealer_code, l.num_id, l.status) = 4) as wait,   -- ขั้นเสนอราคาลูกค้าทั้งหมด (ใบ 0284 · บอสตอบ 9 พ.ย. 69 ข้อ 2 ก)
               count(*) filter (where l.status not in ('PAID', 'CANCELLED', 'HQ_PRICING') and l.last_contact_at is not null
                                  and วันนี้ - l.last_contact_at > 30) as stale,
               count(*) filter (where l.created_date between p_start and p_end and l.status = 'PAID') as won,
               count(*) filter (where l.created_date between p_start and p_end and l.status = 'CANCELLED') as lost
          from leads l where l.dealer_code = d.code) x
     where d.code <> 'HQ';
    select coalesce(jsonb_agg(jsonb_build_object('code', g.code, 'y', extract(year from g.mo)::int, 'm', extract(month from g.mo)::int - 1,
             'leads', g.leads, 'won', g.won, 'lost', g.lost) order by g.mo, g.code), '[]'::jsonb)
      into เดือน
      from (select l.dealer_code as code, date_trunc('month', l.created_date)::date as mo, count(*) as leads,
                   count(*) filter (where l.status = 'PAID') as won, count(*) filter (where l.status = 'CANCELLED') as lost
              from leads l join dealers d on d.code = l.dealer_code
             where l.dealer_code <> 'HQ' and l.created_date between p_start and p_end
             group by 1, 2) g;
  elsif p_page = 'quotations' then
    select coalesce(jsonb_agg(jsonb_build_object('code', d.code, 'name', d.name, 'region', d.region, 'province', d.province,
             'sent', ใบ.sent, 'wait', ใบ.wait, 'won', ได้.won, 'sales', ได้.sales) order by d.code), '[]'::jsonb)
      into แถว
      from dealers d
      cross join lateral (select count(*) filter (where q.status::text not in ('draft', 'superseded')
                                                     and _q_report_date('sent', null, q.date) between p_start and p_end) as sent,
                                 count(*) filter (where q.status = 'sent_to_client') as wait
                            from quotations q where q.dealer_code = d.code) ใบ
      cross join lateral (select count(*) as won, coalesce(sum(w.value), 0) as sales from _kpi_won(d.code) w where w.d between p_start and p_end) ได้
     where d.code <> 'HQ';
    select coalesce(jsonb_agg(jsonb_build_object('code', g.code, 'y', extract(year from g.mo)::int, 'm', extract(month from g.mo)::int - 1,
             'sent', g.sent, 'won', g.won, 'sales', g.sales) order by g.mo, g.code), '[]'::jsonb)
      into เดือน
      from (select code, mo, sum(sent)::int as sent, sum(won)::int as won, sum(sales) as sales from (
              select q.dealer_code as code, date_trunc('month', _q_report_date('sent', null, q.date))::date as mo, 1 as sent, 0 as won, 0::numeric as sales
                from quotations q join dealers d on d.code = q.dealer_code
               where q.dealer_code <> 'HQ' and q.status::text not in ('draft', 'superseded')
                 and _q_report_date('sent', null, q.date) between p_start and p_end
              union all
              select d.code, date_trunc('month', w.d)::date, 0, 1, w.value
                from dealers d cross join lateral _kpi_won(d.code) w where d.code <> 'HQ' and w.d between p_start and p_end) e
             group by code, mo) g;
  elsif p_page = 'customers' then
    select coalesce(jsonb_agg(jsonb_build_object('code', d.code, 'name', d.name, 'region', d.region, 'province', d.province,
             'cust', x.cust, 'newc', x.newc) order by d.code), '[]'::jsonb)
      into แถว
      from dealers d cross join lateral (
        select count(*) as cust,
               count(*) filter (where c.join_date ~ '^\d{4}-\d{2}-\d{2}' and substring(c.join_date, 1, 10)::date between p_start and p_end) as newc
          from customers c where c.dealer_code = d.code) x
     where d.code <> 'HQ';
    select coalesce(jsonb_agg(jsonb_build_object('code', g.code, 'y', extract(year from g.mo)::int, 'm', extract(month from g.mo)::int - 1,
             'newc', g.newc) order by g.mo, g.code), '[]'::jsonb)
      into เดือน
      from (select c.dealer_code as code, date_trunc('month', substring(c.join_date, 1, 10)::date)::date as mo, count(*) as newc
              from customers c join dealers d on d.code = c.dealer_code
             where c.dealer_code <> 'HQ' and c.join_date ~ '^\d{4}-\d{2}-\d{2}' and substring(c.join_date, 1, 10)::date between p_start and p_end
             group by 1, 2) g;
  else
    raise exception 'invalid_page: %', p_page;
  end if;
  return jsonb_build_object('dealers', แถว, 'months', เดือน);
end $$;
revoke all on function public.hq_drill(text, date, date, date) from public, anon, authenticated, service_role;
grant execute on function public.hq_drill(text, date, date, date) to authenticated;
