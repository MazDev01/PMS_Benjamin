-- ── ใบ 0224: เหตุการณ์ของกระดิ่ง (บอสตัดสิน 19 ต.ค. 69 ข้อ 7 · รอบ 2 ช่วง ค) ─────────────────────────────────────
--
-- 1) ดีลเลอร์ต้องได้เรื่อง "HQ ส่งราคาแล้ว"
--    เดิม: ตอน HQ ส่งใบ ลีดขยับเป็น "ได้ราคา HQ" (ใบ 0219) แต่ไม่มีร่องรอยว่าส่งเมื่อไร — กระดิ่งดีลเลอร์จึงไม่มีเรื่องนี้
--    ใหม่: ฐานจดกิจกรรมชนิด hq_quoted ในลีดทุกครั้งที่คำขอกลายเป็น "ส่งใบแล้ว" (รวมรอบขอแก้ราคา)
--          กระดิ่งอ่านกิจกรรมนี้ (Topbar buildNotifications) — แบบเดียวกับ hq_expired ของใบ 0219
-- 2) HQ ต้องได้เรื่องที่ดีลเลอร์ทำเข้ากระดิ่ง (คำขอราคาใหม่ · ขอแก้ราคา · ลูกค้าตอบรับ/ปฏิเสธ)
--    เดิม: บันทึกการใช้งานจดคำขอที่เกิดจาก "ขอแก้ราคา" ว่า "ส่งคำขอใบเสนอราคา" เหมือนคำขอใหม่ — แยกไม่ออก
--    ใหม่: คำขอที่แทนคำขอเดิม (supersedes_id) จดว่า "ขอแก้ราคา" · อย่างอื่นเหมือนเดิมทุกตัวอักษร
-- ข้อทดสอบ: supabase/tests/bell_events.sql
create or replace function public.quote_requests_lead_quoted() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if new.status = 'quoted' and old.status in ('new', 'pricing') then
    if exists (select 1 from leads where dealer_code = new.dealer_code and num_id = new.lead_num_id and status = 'HQ_PRICING') then
      perform _lead_flow_set_status(new.dealer_code, new.lead_num_id, 'HQ_QUOTED');
    end if;
    -- ไทม์ไลน์ + กระดิ่งดีลเลอร์ "HQ ส่งราคาแล้ว" (ใบ 0224)
    perform set_config('pms.flow_sync', '1', true);
    update leads set activities = coalesce(activities, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'id', coalesce((select max((x ->> 'id')::numeric) from jsonb_array_elements(coalesce(activities, '[]'::jsonb)) x
                         where (x ->> 'id') ~ '^\d+(\.\d+)?$'), 0) + 1,
        'type', 'hq_quoted', 'icon', 'doc',
        'date', _thai_date(now(), true),
        'at', now(),
        'text', 'สำนักงานใหญ่ส่งราคาแล้ว (' || new.request_no || ') — ทำใบให้ลูกค้าได้ที่แท็บใบเสนอราคา'))
     where dealer_code = new.dealer_code and num_id = new.lead_num_id;
    perform set_config('pms.flow_sync', '', true);
  end if;
  return new;
end $$;
revoke all on function public.quote_requests_lead_quoted() from public, anon, authenticated, service_role;

create or replace function public.quote_requests_log() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into quote_request_events (request_id, from_status, to_status, note, actor, actor_role)
    values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status,
            case new.status when 'cancelled' then new.cancel_reason when 'lost' then new.lost_reason else '' end,
            audit_actor(), auth_role());
    insert into audit_log("user", role, action, target)
    values (audit_actor(), auth_role(),
            case when tg_op = 'INSERT' and new.supersedes_id is not null then 'ขอแก้ราคา'
                 when tg_op = 'INSERT' then 'ส่งคำขอใบเสนอราคา'
                 else 'คำขอใบเสนอราคา ' || old.status || ' → ' || new.status end,
            new.dealer_code || ' · ' || new.request_no);
  end if;
  return new;
end $$;
