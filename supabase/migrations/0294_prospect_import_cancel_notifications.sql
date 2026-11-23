-- ── ใบ 0294: ยกเลิกชุดนำเข้าผู้สนใจ = ลบแจ้งเตือนของรายในชุดด้วย + เก็บกวาดแจ้งเตือนกำพร้าครั้งเดียว (คนรวมงานสั่ง 23 พ.ย. 69) ──
-- เหตุ: นำเข้าแล้วนัดติดตามวันนี้ → ตัวสแกนแจ้งเตือนสร้าง "ผู้สนใจถึงกำหนดติดตาม" / "ไม่ได้ติดต่อนาน" (มีชื่อผู้สนใจในหัว/เนื้อ)
--   แจ้งเตือนอ้างรายด้วย dedupe_key ('<ชนิด>:<id ผู้สนใจ>:…') ไม่มีกุญแจนอก → ยกเลิกทั้งชุดลบผู้สนใจแต่แจ้งเตือนค้าง ชี้รายที่ไม่มีแล้ว
--   (พบบนฐาน dev: ยกเลิกชุด 126 ราย เหลือแจ้งเตือนกำพร้า 220 แถว · บนเว็บจริงบอสยกเลิกชุด 126 รายแล้วนำเข้าใหม่หลังใบ 0293)
-- 1) hq_prospects_import_cancel (สิทธิ์เดิม): ในธุรกรรมเดียวกัน ลบแจ้งเตือนชนิดผู้สนใจของรายในชุด + อีเมลที่ยังไม่ส่งซึ่งอ้างรายนั้น
--    ชนิดผู้สนใจ = prospect_followup_due · prospect_idle (ชนิดที่อ้าง id ผู้สนใจตรงใน dedupe_key · ใบค่าแฟรนไชส์อ้างเลขใบ —
--    ชุดที่มีใบค่าแฟรนไชส์ยกเลิกไม่ได้อยู่แล้ว) · อีเมลที่ส่งแล้วเก็บเป็นประวัติการส่ง
-- 2) ล้างครั้งเดียวตอนลงใบ: แจ้งเตือนชนิดผู้สนใจที่ชี้ id ที่ไม่มีแล้ว + อีเมลค้างส่ง (pending/failed) ที่อ้างผู้สนใจที่ไม่มีแล้ว
--    ไม่มีตารางย้อนกลับ (ตั้งใจ): แถวที่ลบชี้ผู้สนใจที่ถูกลบไปแล้ว เปิดลิงก์ไม่เจอราย ไม่มีความหมายให้คืน · แจ้งเตือนของรายที่ยังอยู่ไม่ถูกแตะ
--    และตัวสแกนสร้างแจ้งเตือนใหม่ให้รายที่ยังอยู่เองตามเกณฑ์ (dedupe กันซ้ำ)
-- ข้อทดสอบ: supabase/tests/prospect_import_facebook.sql (ข้อ 7) · ซ้อมลงใบ tests/tools/migration-0294.test.mjs (นับก่อน/หลัง)

create or replace function public.hq_prospects_import_cancel(p_batch bigint)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare b prospect_import_batches; แตะ int; n int; รหัส text[];
begin
  if not can_write_master() then raise exception 'forbidden: ยกเลิกการนำเข้าได้เฉพาะผู้ดูแลระบบ/ผู้บริหารสำนักงานใหญ่'; end if;
  select * into b from prospect_import_batches where id = p_batch for update;
  if not found then raise exception 'not_found: ไม่พบชุดนำเข้านี้'; end if;
  if b.cancelled_at is not null then raise exception 'import_cancelled: ชุดนี้ยกเลิกไปแล้ว'; end if;
  แตะ := _import_batch_touched(p_batch);
  if แตะ > 0 then
    raise exception 'import_in_use: ยกเลิกทั้งชุดไม่ได้ — มี % รายที่ถูกแตะแล้วหลังนำเข้า (บันทึกการติดต่อ · เปลี่ยนขั้น · ออกใบค่าแฟรนไชส์)', แตะ;
  end if;
  -- แจ้งเตือน/อีเมลค้างส่งของรายในชุด (ใบ 0294) — อ้างด้วยข้อความ ไม่มีกุญแจนอก จึงไม่หายตามผู้สนใจ
  รหัส := array(select id::text from dealer_prospects where import_batch_id = p_batch);
  delete from notifications where kind in ('prospect_followup_due', 'prospect_idle') and split_part(dedupe_key, ':', 2) = any(รหัส);
  delete from email_outbox where ref_table = 'dealer_prospects' and ref_id = any(รหัส) and status <> 'sent';
  perform set_config('pms.audit_skip', 'on', true);
  delete from dealer_prospects where import_batch_id = p_batch;
  get diagnostics n = row_count;
  perform set_config('pms.audit_skip', '', true);
  update prospect_import_batches set cancelled_at = now(), cancelled_by = audit_actor_name() where id = p_batch;
  perform _audit_hq('ยกเลิกการนำเข้าผู้สนใจ', coalesce(nullif(b.file_name, ''), 'ไฟล์ไม่มีชื่อ') || ' · ลบ ' || n || ' ราย · ชุด ' || p_batch);
  return jsonb_build_object('batch', p_batch, 'deleted', n);
end $function$;
revoke all on function public.hq_prospects_import_cancel(bigint) from public, anon, authenticated, service_role;
grant execute on function public.hq_prospects_import_cancel(bigint) to authenticated;

-- ── ล้างครั้งเดียว: แจ้งเตือน/อีเมลค้างส่งที่ชี้ผู้สนใจที่ไม่มีแล้ว ──
delete from public.notifications n
 where n.kind in ('prospect_followup_due', 'prospect_idle')
   and not exists (select 1 from public.dealer_prospects p where p.id::text = split_part(n.dedupe_key, ':', 2));
delete from public.email_outbox e
 where e.ref_table = 'dealer_prospects' and e.status <> 'sent'
   and not exists (select 1 from public.dealer_prospects p where p.id::text = e.ref_id);
