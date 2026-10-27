-- ── ใบ 0248: ไทม์ไลน์ + ติ๊กงานของลีด ฐานทำเองในคำสั่งเดียวกับขั้นของใบ/นัดหมาย (บอสสั่ง 27 ต.ค. 69) ─────────────
--
-- เหตุ (ตัวนับข้อไม่นิ่ง func-e2e-audit cross-role ครบ 3 ครั้ง 21/22/27 ต.ค. 69):
--   กด "ลูกค้าตอบรับ" → ฐานเปลี่ยนใบเป็น won แล้ว แต่หน้าเว็บยังส่งคำสั่งตามหลังอีก (ติ๊กงาน · บรรทัดไทม์ไลน์)
--   ผู้ใช้ปิดหน้า/เปลี่ยนหน้า/เน็ตหลุดในเสี้ยววินาทีนั้น → ไทม์ไลน์ "ลูกค้าตอบรับ" กับงานที่ติ๊กหายเงียบ ๆ
--   ไล่ทุกขั้นแล้ว เจอแบบเดียวกัน: ส่งใบ · ส่งอีกครั้ง · ตอบรับ · ปฏิเสธ · หมดอายุ (กดเอง) · ขึ้นฉบับ/แก้ยอด/แก้รายละเอียด · ลงนัดหมาย
--   (สร้างใบ = ใบ 0210 · HQ ย้อนการตอบรับ = ใบ 0204/0217 · หมดอายุตามใบ HQ = ฟังก์ชันหมดอายุ — ฐานทำเองอยู่แล้ว ไม่แตะ
--    · ยกเลิกคำขอราคา: หน้าเว็บไม่ได้เขียนไทม์ไลน์ตามหลัง)
-- ที่แก้: trigger หลังแก้ใบ / หลังลงนัด ทำในทรานแซกชันเดียวกับคำสั่งของผู้ใช้ · หน้าเว็บโหมดฐานเลิกส่งคำสั่งเหล่านี้
--   ข้อความทุกบรรทัดเหมือนที่หน้าเว็บเขียนเดิม (ตัวตรวจ scripts/check-no-client-timeline.mjs กันหน้าเว็บกลับมาเขียนเอง)
--   ลีดที่ปิดแล้ว (สำเร็จ/ไม่สำเร็จ): ไม่ติ๊กงาน แต่ยังจดไทม์ไลน์ (เหมือนหน้าเว็บเดิม · ตอนตอบรับ ฐานปิดลีดในคำสั่งเดียวกันก่อนถึงตรงนี้)
-- ข้อทดสอบ: supabase/tests/quote_events_timeline_in_db.sql · tests/scenario/close-won-offline.spec.ts

-- ── ตัวช่วย: ติ๊กงาน (ถ้าลีดยังเปิด) + ต่อท้ายไทม์ไลน์ 1 บรรทัด ให้ลีดเลข p_num ของสาขา p_dealer ──
create or replace function public._lead_sync_append(p_dealer text, p_num integer, p_keys text[], p_text text, p_type text)
  returns void language plpgsql security definer set search_path to 'public' as $$
declare
  l leads;
  v_tasks jsonb;
  v_changed boolean := false;
  v_acts jsonb;
begin
  if p_num is null or p_num = 0 then return; end if;
  select * into l from leads where dealer_code = p_dealer and num_id = p_num for update;
  if not found then return; end if;

  v_tasks := l.tasks;
  if coalesce(array_length(p_keys, 1), 0) > 0 and l.status not in ('PAID', 'CANCELLED') then
    -- ลีดที่ยังไม่มีรายการงาน ใช้แม่แบบของสำนักงานใหญ่ (เหมือนใบ 0210 / buildLeadTasks)
    v_tasks := case when jsonb_typeof(l.tasks) = 'array' and jsonb_array_length(l.tasks) > 0 then l.tasks
                  else coalesce((select jsonb_agg(jsonb_build_object('key', t->>'key', 'label', t->>'label', 'done', false) order by o)
                                   from hq_sales_journey j, jsonb_array_elements(j.tasks) with ordinality as e(t, o)), '[]'::jsonb) end;
    select coalesce(jsonb_agg(
             case when t->>'key' = any(p_keys) and not coalesce((t->>'done')::boolean, false)
                  then t || jsonb_build_object('done', true, 'doneAt', _thai_date(now()),
                                               'doneBy', coalesce(nullif(btrim(l.assigned), ''), 'อัปเดตอัตโนมัติ'))
                  else t end order by o), '[]'::jsonb),
           coalesce(bool_or(t->>'key' = any(p_keys) and not coalesce((t->>'done')::boolean, false)), false)
      into v_tasks, v_changed
      from jsonb_array_elements(v_tasks) with ordinality as e(t, o);
  end if;

  v_acts := case when jsonb_typeof(l.activities) = 'array' then l.activities else '[]'::jsonb end;
  if nullif(btrim(coalesce(p_text, '')), '') is not null then
    v_acts := v_acts || jsonb_build_array(jsonb_build_object(
      'id', coalesce((select max((a->>'id')::numeric) from jsonb_array_elements(v_acts) a where (a->>'id') ~ '^\d+(\.\d+)?$'), 0) + 1,
      'date', _thai_date(now(), true), 'icon', p_type, 'type', p_type, 'text', p_text));
  end if;

  if not v_changed and v_acts is not distinct from l.activities then return; end if;
  perform set_config('pms.flow_sync', '1', true);   -- งานของระบบ (ตัวกันขั้นลีดไม่ต้องตัดสิน)
  update leads set tasks = case when v_changed then v_tasks else leads.tasks end, activities = v_acts
   where dealer_code = l.dealer_code and num_id = l.num_id;
  perform set_config('pms.flow_sync', '', true);
end $$;
revoke all on function public._lead_sync_append(text, integer, text[], text, text) from public, anon, authenticated, service_role;

-- ── หลังแก้ใบ: ข้อความเดียวกับหน้าเว็บเดิม (SalesContext.จดกิจกรรมของใบ + setQuotationStatus) ──
create or replace function public.quotations_update_lead_sync() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
declare
  rev  text := coalesce(nullif(new.revision, ''), 'V1');
  งาน  text[] := case when new.status <> 'draft' then array['makeQuote', 'sendQuote'] else array[]::text[] end;
  ป้าย text;
  ช่องผู้ใช้ text[] := array['customer','project','total','total_value','material_cost','province','building_type','area','items',
                              'line_items','revision','expiry','note','issuer','product_line','vat_percent','wht_rate','markup_percent'];
  เดิม jsonb; ใหม่ jsonb;
begin
  if coalesce(new.deal_id, 0) = 0 then return new; end if;
  -- ขั้นที่ระบบทำเองและจดของตัวเองอยู่แล้ว: ย้อนการตอบรับ (จาก won · ใบ 0204/0217) · ถูกแทนที่ด้วยฉบับใหม่ (ใบ 0228)
  --   · หมดอายุตามใบ HQ (มีเหตุผลหมดอายุ · ฟังก์ชันหมดอายุ)
  if old.status = 'won' and new.status is distinct from 'won' then return new; end if;
  if new.status = 'superseded' then return new; end if;
  if new.status = 'expired' and new.expired_reason is not null and old.status is distinct from 'expired' then return new; end if;

  if new.status is distinct from old.status then
    if old.status = 'draft' and new.status = 'sent_to_client' then
      perform _lead_sync_append(new.dealer_code, new.deal_id, งาน, 'ส่งใบเสนอราคา ' || new.id || ' (' || rev || ') ให้ลูกค้า', 'doc');
      return new;
    end if;
    ป้าย := case new.status when 'sent_to_client' then 'ส่งให้ลูกค้า' when 'won' then 'ลูกค้าตอบรับ'
                             when 'lost' then 'ลูกค้าปฏิเสธ' when 'expired' then 'หมดอายุ' end;
    perform _lead_sync_append(new.dealer_code, new.deal_id, งาน,
      case when ป้าย is null then null else 'ใบเสนอราคา ' || new.id || ' (' || rev || ') — ' || ป้าย end, 'doc');
    return new;
  end if;

  -- สถานะเดิม: ส่งอีกครั้ง (ฉบับเดิม · วันที่ส่งใหม่) / ขึ้นฉบับ / แก้ยอด / แก้รายละเอียด
  if new.status = 'sent_to_client' and new.revision is not distinct from old.revision and new.date is distinct from old.date then
    perform _lead_sync_append(new.dealer_code, new.deal_id, งาน, 'ส่งใบเสนอราคา ' || new.id || ' (' || rev || ') ให้ลูกค้าอีกครั้ง', 'doc');
    return new;
  end if;
  if new.revision is distinct from old.revision then
    perform _lead_sync_append(new.dealer_code, new.deal_id, งาน,
      'แก้ไขใบเสนอราคา ' || new.id || ' เป็นฉบับ ' || coalesce(new.revision, '') || ' · ยอด ' || coalesce(new.total, ''), 'doc');
    return new;
  end if;
  if new.total_value is distinct from old.total_value then
    perform _lead_sync_append(new.dealer_code, new.deal_id, งาน, 'แก้ยอดใบเสนอราคา ' || new.id || ' เป็น ' || coalesce(new.total, ''), 'doc');
    return new;
  end if;
  select coalesce(jsonb_object_agg(k, to_jsonb(old) -> k), '{}'::jsonb), coalesce(jsonb_object_agg(k, to_jsonb(new) -> k), '{}'::jsonb)
    into เดิม, ใหม่ from unnest(ช่องผู้ใช้) k;
  if เดิม is distinct from ใหม่ then
    perform _lead_sync_append(new.dealer_code, new.deal_id, งาน, 'แก้ไขรายละเอียดใบเสนอราคา ' || new.id, 'doc');
  end if;
  return new;
end $$;
revoke all on function public.quotations_update_lead_sync() from public, anon, authenticated, service_role;

drop trigger if exists quotations_update_lead_sync on public.quotations;
create trigger quotations_update_lead_sync after update on public.quotations
  for each row execute function public.quotations_update_lead_sync();

-- ── หลังลงนัด: ติ๊กงาน "นัดหมาย" + บรรทัด "นัดหมาย …" (เดิม SalesContext.addAppointment) ──
create or replace function public.appointments_insert_lead_sync() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
declare
  งานนัด text;
begin
  if coalesce(new.lead_id, 0) = 0 then return new; end if;
  -- งานนัดหมาย: รหัส appointment หรือชื่องานมีคำว่า "นัด" (เหมือน findAppointmentTask)
  select coalesce((select t->>'key' from hq_sales_journey j, jsonb_array_elements(j.tasks) t where t->>'key' = 'appointment' limit 1),
                  (select t->>'key' from hq_sales_journey j, jsonb_array_elements(j.tasks) t where t->>'label' like '%นัด%' limit 1))
    into งานนัด;
  perform _lead_sync_append(new.dealer_code, new.lead_id,
    case when งานนัด is null then array[]::text[] else array[งานนัด] end,
    'นัดหมาย ' || coalesce(new.date, '') || case when nullif(new.time, '') is not null then ' ' || new.time || ' น.' else '' end
      || case when nullif(new.note, '') is not null then ' · ' || new.note else '' end,
    'meeting');
  return new;
end $$;
revoke all on function public.appointments_insert_lead_sync() from public, anon, authenticated, service_role;

drop trigger if exists appointments_insert_lead_sync on public.appointments;
create trigger appointments_insert_lead_sync after insert on public.appointments
  for each row execute function public.appointments_insert_lead_sync();
