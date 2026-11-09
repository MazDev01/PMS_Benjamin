-- ── ใบ 0280: คำขอราคาที่ส่งแล้วห้ามลบ · ยกเลิก = สถานะ "ยกเลิกแล้ว" + เหตุผล + ใคร เมื่อไร (บอสสั่ง 5 พ.ย. 69 · บอสตอบข้อ 1 = ก ข้อ 2 = ก) ──
--   1) ตัวกันที่ฐาน: ลบแถว quote_requests ไม่ได้ทุกทาง (หน้าเว็บ · คำสั่งตรงของบัญชีผู้ใช้/ฝั่งเซิร์ฟเวอร์ · คำสั่ง SQL ตรง)
--      ทางเดียวที่ยอม = ชุดล้างข้อมูลทดสอบ ตั้งสวิตช์ pms.quote_request_delete = 'test' ในทรานแซกชันของตัวเอง — และแถวต้องเป็นแถวทดสอบ:
--        · คำขอของสาขาทดสอบ (_quote_request_is_test_row: รหัสขึ้นต้น ZZ = ZZT · ZZTN ของชุดล้างเว็บจริง · ZZU ของ trial-cleanup)
--          คำขอจริงห้ามลบแม้ตั้งสวิตช์ · ปนแถวจริงแม้แถวเดียว = ทั้งคำสั่งถูกปฏิเสธ (แบบเดียวกับ _audit_is_test_row ใบ 0241 · คนรวมงานสั่ง 9 พ.ย. 69)
--        · ฐานทดสอบ/ฐาน dev ในเครื่องเท่านั้น: มีเครื่องหมายฐานทดสอบ (ตาราง public._pms_test_database) = ลบคำขอของสาขาตั้งต้นได้ (ข้อทดสอบล้างแถวของตัวเอง)
--          เครื่องหมายสร้างโดย scripts/reset-test-db.mjs ที่เดียว — ไม่อยู่ในใบปรับฐาน/ชุดล้างเว็บจริง/สคริปต์ฐานจริง (ตัวตรวจ check-test-db-marker)
--          ฐานจริงไม่มีตารางนี้ → ทางนี้ปิดบนฐานจริง (คนที่สร้างตารางในฐานจริงได้ = คนที่ปิดตัวดักได้อยู่แล้ว ไม่เพิ่มช่องใหม่)
--      บัญชีผู้ใช้ตั้งสวิตช์เองไม่ได้ (คำสั่งตั้งค่าไม่เปิดผ่านช่องทางของแอป) · ตัวดักนี้ปิดเองไม่ได้จากหน้าเว็บ · ห้ามแก้ด้วยการปิดตัวดัก
--   2) ยกเลิก (ดีลเลอร์อย่างเดียว · ก่อน HQ ส่งใบเท่านั้น — ตามเดิม) จดชื่อคนยกเลิก + เวลา (cancelled_by_name · cancelled_at)
--      ไม่ลบร่างใบ HQ อีกต่อไป (บอสตอบ 6 พ.ย. 69): ร่าง + ไฟล์แนบอยู่ครบ HQ เปิดดูได้จากคำขอที่ยกเลิก · แก้/ส่งต่อไม่ได้
--   ใบนี้รันซ้ำได้ (เพิ่มช่องแบบ if not exists · คำสั่งแบบ create or replace · ตัวดัก drop if exists)
--      คำขอเก่าที่ยกเลิกไปแล้ว: เวลา = closed_at เดิม · ชื่อไม่เคยจด = ว่าง (หน้าจอแสดง "—" ไม่เดา)
--   3) กล่องคำขอ HQ: กลุ่ม "ยกเลิกแล้ว" (cancelled) + จำนวน · แถวมีเหตุผล/ชื่อ/เวลาที่ยกเลิก — กลุ่มเดิมทุกกลุ่มเหมือนเดิม (ปิด/ยกเลิก ยังรวมคำขอที่ยกเลิก)
-- ข้อทดสอบ: supabase/tests/quote_request_cancel_keep.sql · tests/scenario/quote-request-cancel.spec.ts

alter table public.quote_requests add column if not exists cancelled_by_name text not null default '';
alter table public.quote_requests add column if not exists cancelled_at timestamptz;
comment on column public.quote_requests.cancelled_by_name is 'ชื่อคนยกเลิกคำขอ (ใบ 0280) · ก่อนใบนี้ไม่ได้จด = ว่าง';
comment on column public.quote_requests.cancelled_at is 'เวลายกเลิกคำขอ (ใบ 0280) · คำขอเก่า = closed_at เดิม';
update public.quote_requests set cancelled_at = coalesce(closed_at, updated_at) where status = 'cancelled' and cancelled_at is null;

-- ═══ 1) ห้ามลบคำขอ ═══
create or replace function public._quote_request_is_test_row(p_dealer_code text) returns boolean
  language sql immutable set search_path to 'public' as $$ select coalesce(p_dealer_code, '') like 'ZZ%' $$;
revoke all on function public._quote_request_is_test_row(text) from public, anon, authenticated, service_role;
-- security definer: ตัวดักต้องเรียก _quote_request_is_test_row ได้ไม่ว่าใครเป็นคนลบ (กติกานั้นปิดสิทธิ์จากทุกบัญชี)
create or replace function public.quote_requests_no_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('pms.quote_request_delete', true), '') = 'test'
     and (_quote_request_is_test_row(old.dealer_code) or to_regclass('public._pms_test_database') is not null) then return old; end if;
  raise exception 'request_no_delete: คำขอราคา % ลบไม่ได้ — ยกเลิกแทน (สถานะ "ยกเลิกแล้ว" + เหตุผล)', old.request_no;
end $$;
revoke all on function public.quote_requests_no_delete() from public, anon, authenticated, service_role;
drop trigger if exists quote_requests_no_delete on public.quote_requests;
create trigger quote_requests_no_delete before delete on public.quote_requests
  for each row execute function public.quote_requests_no_delete();

-- ═══ 2) ยกเลิก = จดใคร เมื่อไร (อื่นเหมือนใบ 0183 ทุกอย่าง) ═══
create or replace function public.quote_request_cancel(
  p_id bigint, p_reason text, p_close_lead boolean default false
) returns public.quote_requests language plpgsql security definer set search_path to 'public' as $$
declare r quote_requests;
begin
  if not can_write_sales() then raise exception 'forbidden: ไม่มีสิทธิ์ยกเลิกคำขอ'; end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'reason_required: ต้องระบุเหตุผลที่ยกเลิกคำขอ'; end if;

  select * into r from quote_requests where id = p_id and dealer_code = auth_dealer() for update;
  if not found then raise exception 'request_not_found: ไม่พบคำขอนี้'; end if;
  if r.status not in ('new', 'pricing') then
    raise exception 'request_locked: ยกเลิกได้เฉพาะคำขอที่สำนักงานใหญ่ยังไม่ได้ส่งใบ (สถานะ %)', r.status;
  end if;

  update quote_requests set status = 'cancelled', cancel_reason = btrim(p_reason), closed_at = now(),
         cancelled_at = now(), cancelled_by_name = audit_actor_name()
   where id = p_id returning * into r;
  -- ร่างใบ HQ + ไฟล์แนบ เก็บไว้ดูย้อนได้ (บอสตอบ 6 พ.ย. 69 · เดิมลบร่างทิ้ง → ร่างที่มีไฟล์แนบทำให้ยกเลิกไม่ได้)
  --   ร่างตามสถานะคำขอ: hq_quote_save/hq_quote_send รับเฉพาะคำขอ new/pricing · ไฟล์แนบเพิ่ม/ลบได้เฉพาะคำขอเปิด (_quote_file_open)
  -- ประวัติของลีด (บอสสั่ง 5 พ.ย. 69): คำขอที่ยกเลิกยังเห็นในแท็บประวัติ — ใคร · เมื่อไร (วันที่ของบรรทัด) · เหตุผล
  perform _lead_sync_append(r.dealer_code, r.lead_num_id, array[]::text[],
    format('ยกเลิกคำขอราคา %s · เหตุผล: %s · โดย %s', r.request_no, btrim(p_reason), r.cancelled_by_name), 'doc');

  if p_close_lead then
    perform _lead_flow_set_status(r.dealer_code, r.lead_num_id, 'CANCELLED', btrim(p_reason));
  else
    perform _lead_flow_set_status(r.dealer_code, r.lead_num_id, 'BULLET');
  end if;
  return r;
end $$;
revoke all on function public.quote_request_cancel(bigint, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.quote_request_cancel(bigint, text, boolean) to authenticated;

-- ═══ 3) กล่องคำขอ HQ (จาก 0274) — เพิ่มกลุ่ม "ยกเลิกแล้ว" (cancelled) + จำนวน · แถวมีเหตุผล/ชื่อ/เวลาที่ยกเลิก · อื่นเหมือนเดิมทุกตัว ═══
CREATE OR REPLACE FUNCTION public.hq_quote_board(p_group text DEFAULT 'todo'::text, p_q text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  q text := lower(btrim(coalesce(p_q, '')));
  นับ jsonb; แถว jsonb;
begin
  if not is_hq() then raise exception 'forbidden: เฉพาะสำนักงานใหญ่'; end if;
  if p_group not in ('todo', 'overdue', 'quoted', 'won', 'closed', 'cancelled', 'all') then raise exception 'invalid_group: %', p_group; end if;

  with ค as (
    select r.*, coalesce(d.name, '') as dealer_name, coalesce(l.company, '') as lead_company,
           coalesce(l.contact, '') as lead_contact, coalesce(l.phone, '') as lead_phone,
           coalesce(l.email, '') as lead_email, coalesce(l.address, '') as lead_address,
           h.status as hq_status, h.valid_until, h.quote_no,
           case when h.status = 'draft' then h.updated_at end as draft_updated_at,   -- แก้ร่างใบ HQ ล่าสุด (ใบ 0274)
           case when r.status in ('new', 'pricing') then 'todo' when r.status = 'quoted' then 'quoted'
                when r.status = 'won' then 'won' else 'closed' end as กลุ่ม
      from quote_requests r
      left join dealers d on d.code = r.dealer_code
      left join leads l on l.dealer_code = r.dealer_code and l.num_id = r.lead_num_id
      left join hq_quotes h on h.request_id = r.id
     where q = '' or lower(concat_ws(' ', r.request_no, r.dealer_code, d.name, l.company, r.product, r.subtype, r.province)) like '%' || q || '%'
  )
  select jsonb_build_object(
           'todo',    count(*) filter (where กลุ่ม = 'todo'),
           'overdue', count(*) filter (where กลุ่ม = 'todo' and due_at < now()),
           'quoted',  count(*) filter (where กลุ่ม = 'quoted'),
           'won',     count(*) filter (where กลุ่ม = 'won'),
           'closed',  count(*) filter (where กลุ่ม = 'closed'),
           'cancelled', count(*) filter (where status = 'cancelled')),   -- ใบ 0280 (อยู่ในกลุ่ม closed ด้วย)
         coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'request_no', request_no, 'dealer_code', dealer_code, 'dealer_name', dealer_name,
           'lead_num_id', lead_num_id, 'lead_company', lead_company, 'product', product, 'subtype', subtype,
           'lead_contact', lead_contact, 'lead_phone', lead_phone, 'lead_email', lead_email, 'lead_address', lead_address,
           'estimate_items', estimate_items, 'estimate_total', estimate_total, 'estimate_deviation_pct', estimate_deviation_pct,
           'area', area, 'province', province, 'spec', spec, 'status', status, 'hq_status', hq_status, 'quote_no', quote_no,
           'valid_until', valid_until, 'draft_updated_at', draft_updated_at, 'submitted_at', submitted_at, 'due_at', due_at, 'quoted_at', quoted_at,
           'closed_at', closed_at, 'assignee_name', assignee_name,
           'cancel_reason', cancel_reason, 'cancelled_by_name', cancelled_by_name, 'cancelled_at', cancelled_at, 'supersedes_id', supersedes_id,   -- เหตุผล/ใคร/เมื่อไรที่ยกเลิก (ใบ 0280)
           'waiting_days', greatest(0, floor(extract(epoch from (now() - submitted_at)) / 86400))::int,
           'tag', case
             when status in ('new', 'pricing') and due_at < now() then 'overdue'
             when status in ('new', 'pricing') and supersedes_id is not null then 'reprice'
             when status = 'pricing' and hq_status = 'draft' then 'draft'
             when status = 'new' then 'new'
             else status end)
           order by
             case when p_group in ('todo', 'overdue') then due_at end asc,
             case when p_group = 'all' then submitted_at end desc,
             case when p_group = 'quoted' then valid_until end asc nulls last,
             case when p_group in ('won', 'closed') then coalesce(closed_at, updated_at) end desc,
             case when p_group = 'cancelled' then coalesce(cancelled_at, closed_at, updated_at) end desc,
             id asc)
           filter (where p_group = 'all' or กลุ่ม = p_group or (p_group = 'overdue' and กลุ่ม = 'todo' and due_at < now())
                   or (p_group = 'cancelled' and status = 'cancelled')), '[]'::jsonb)
    into นับ, แถว
    from ค;

  return jsonb_build_object('counts', นับ, 'rows', แถว);
end $function$;

revoke all on function public.hq_quote_board(text, text) from public, anon, authenticated, service_role;
grant execute on function public.hq_quote_board(text, text) to authenticated;


-- ═══ 4) กดยกเลิกฟอร์มขอราคา (ยังไม่ส่ง) = จดในแท็บประวัติของลีด: "เริ่มขอราคาแล้วยกเลิก" + ใคร (วันที่ของบรรทัด = เมื่อไร) ═══
--   ไม่เก็บข้อมูลที่กรอก (บอสสั่ง) · ดีลเลอร์ของสาขานั้นเท่านั้น (ลีดของสาขาอื่น = ไม่พบ) · หน้าเว็บไม่เขียนประวัติเอง (check-no-client-timeline)
create or replace function public.lead_quote_request_abandoned(p_lead_num integer) returns void
  language plpgsql security definer set search_path to 'public' as $$
begin
  if not can_write_sales() then raise exception 'forbidden: ไม่มีสิทธิ์'; end if;
  if not exists (select 1 from leads where dealer_code = auth_dealer() and num_id = p_lead_num) then
    raise exception 'lead_not_found: ไม่พบลูกค้าเป้าหมายนี้';
  end if;
  perform _lead_sync_append(auth_dealer(), p_lead_num, array[]::text[], 'เริ่มขอราคาแล้วยกเลิก · โดย ' || audit_actor_name(), 'doc');
end $$;
revoke all on function public.lead_quote_request_abandoned(integer) from public, anon, authenticated, service_role;
grant execute on function public.lead_quote_request_abandoned(integer) to authenticated;
