-- ── ใบ 0237: ใบเสนอราคาต้องมีค่า VAT เสมอ (บอสสั่ง 22 ต.ค. 69 · แก้ข้อ 6 ของรอบตรวจรอบ 3) ─────────────────────────────
--
-- ปัญหา: ใบที่ช่อง VAT ว่าง (ฐานจริงมี 5 ใบ) หน้าเว็บแสดง/พิมพ์ด้วย VAT ของสาขา ลูกค้าได้ใบที่คิด VAT ไปแล้ว
--   แต่ "ทำฉบับใหม่" ล็อกภาษีให้เท่าใบเดิม (0228: coalesce(ว่าง, 0)) → ฟอร์มส่ง VAT ของสาขา ฐานปฏิเสธ quote_version_locked
-- ทางแก้ (บอสสั่ง):
--   1. ไม่เปลี่ยนวิธีแสดง/พิมพ์ใบ V1
--   2. เติมช่อง VAT ที่ว่าง = ค่าที่ระบบใช้แสดงจริงตอนนี้ (ค่า VAT ของสาขานั้น · สาขาไม่ได้ตั้ง = ค่าตั้งต้นของระบบ 7) — นับก่อน/หลัง
--   3. ต่อไปห้ามว่าง: ตอนสร้างใบบันทึกค่าเสมอ (ตัวดัก ALWAYS) + กันที่ฐาน (NOT NULL)
--   4. ฉบับใหม่คัดลอก VAT จากใบเดิมตามเดิม (ช่องล็อก 0228) — ตอนนี้มีค่าเสมอ
--
-- "ค่าที่ระบบใช้แสดงจริง" ต้องตรงกับหน้าเว็บทุกตัว (packages/shared/lib/useDealerSettings.ts useDealerVat
--   + ตัวแปลงข้อมูล { ...DEFAULT_DOC, ...dealer_settings.document }):
--     document.vatPercent เป็นตัวเลข และ >= 0 → ค่านั้น · อย่างอื่น (ไม่มีแถว/ไม่มีช่อง/null/ข้อความ/ติดลบ) → 7 (DEFAULT_DOC)
--   หน้าเว็บใช้ q.vatPercent ?? useDealerVat() ทุกที่ (หน้าดูใบ · พิมพ์ · หน้าลูกค้า) — ค่าเกิน 100 สูตรคิดภาษีตัดที่ 100 (quoteTax.ts)
--   จึงตัดที่ 100 เหมือนกัน (ช่องนี้มีข้อกำหนด 0..100 จากใบ 0164)
-- เติมเฉพาะช่องอัตรา VAT — ยอดภาษีที่หน้าเว็บแสดงคิดจากอัตรา × มูลค่างานทุกครั้ง ยอดที่แสดงก่อน/หลังจึงเท่ากัน
-- ข้อทดสอบ: supabase/tests/quote_vat_required.sql

-- ═══ 1. ค่า VAT ที่หน้าเว็บแสดงของสาขา ══════════════════════════════════════
create or replace function public._dealer_display_vat(p_dealer text) returns numeric
  language sql stable security definer set search_path to 'public' as $$
  select coalesce((
    select least((ds.document->>'vatPercent')::numeric, 100)
      from dealer_settings ds
     where ds.dealer_code = p_dealer
       and jsonb_typeof(ds.document->'vatPercent') = 'number'
       and (ds.document->>'vatPercent')::numeric >= 0
  ), 7::numeric)
$$;
revoke all on function public._dealer_display_vat(text) from public, anon, authenticated, service_role;

-- ═══ 2. เติมใบที่ช่อง VAT ว่าง (ใช้ทั้งตอนลงใบและในข้อทดสอบ) ═════════════════════════════
--   ปิดตัวดักของตารางช่วงเติมค่าเท่านั้น: ใบที่ส่งแล้ว/ตอบรับแล้ว/ถูกแทนที่/ใบเดิม ล็อกทุกช่อง (0201/0203/0226/0228)
--   และไม่ต้องเขียนประวัติราคา/บันทึกการใช้งาน (มูลค่าใบไม่เปลี่ยน) · เปิดคืนในรายการเดียวกัน
create or replace function public._quote_vat_backfill() returns jsonb
  language plpgsql security definer set search_path to 'public' as $$
declare
  ก่อน int; หลัง int; ราย jsonb; ตัวดัก text[]; t text;
begin
  -- ปิด/เปิดเฉพาะตัวดักที่เปิดแบบปกติอยู่ ทีละตัว (ไม่ใช้ disable/enable trigger user — จะไปเปิดตัวที่ตั้งใจปิด
  --   และเปลี่ยนตัวดัก ALWAYS ให้กลายเป็นแบบปกติ)
  select coalesce(array_agg(tgname::text order by tgname), '{}') into ตัวดัก
    from pg_trigger where tgrelid = 'public.quotations'::regclass and not tgisinternal and tgenabled = 'O';
  select count(*) into ก่อน from quotations where vat_percent is null;
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'dealer', q.dealer_code, 'vat', _dealer_display_vat(q.dealer_code)) order by q.dealer_code, q.id), '[]'::jsonb)
    into ราย from quotations q where q.vat_percent is null;
  foreach t in array ตัวดัก loop execute format('alter table public.quotations disable trigger %I', t); end loop;
  update quotations q set vat_percent = _dealer_display_vat(q.dealer_code) where q.vat_percent is null;
  foreach t in array ตัวดัก loop execute format('alter table public.quotations enable trigger %I', t); end loop;
  select count(*) into หลัง from quotations where vat_percent is null;
  if หลัง <> 0 then raise exception 'quote_vat_backfill: ยังเหลือใบ VAT ว่าง % ใบ', หลัง; end if;
  return jsonb_build_object('before', ก่อน, 'after', หลัง, 'quotes', ราย);
end $$;
revoke all on function public._quote_vat_backfill() from public, anon, authenticated, service_role;

do $$
declare r jsonb := public._quote_vat_backfill();
begin
  raise notice 'ใบ 0237: ใบ VAT ว่างก่อนเติม % ใบ · หลังเติม % ใบ · รายใบ %', r->>'before', r->>'after', r->'quotes';
end $$;

-- ═══ 3. ต่อไปห้ามว่าง ═══════════════════════════════════════════════════════
--   ตัวดัก ALWAYS: บันทึกค่าตอนสร้างใบทุกทาง (create_quotation · ทำสำเนา · ข้อมูลที่วางตรงที่ฐาน) แม้ช่วงที่ปิดตัวดักทั่วไป
--   แก้ใบให้ VAT ว่างไม่ได้ (NOT NULL) — ใบที่ไม่คิด VAT บันทึกเป็น 0 (หน้าเว็บทำแบบนี้อยู่แล้ว)
create or replace function public.quotations_vat_fill() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if new.vat_percent is null then new.vat_percent := _dealer_display_vat(new.dealer_code); end if;
  return new;
end $$;
revoke all on function public.quotations_vat_fill() from public, anon, authenticated, service_role;
drop trigger if exists quotations_vat_fill on public.quotations;
create trigger quotations_vat_fill before insert on public.quotations
  for each row execute function public.quotations_vat_fill();
alter table public.quotations enable always trigger quotations_vat_fill;

alter table public.quotations alter column vat_percent set not null;
comment on column public.quotations.vat_percent is 'อัตรา VAT ที่ตรึงไว้กับใบ (%) — ห้ามว่าง (0237) · 0 = ใบนี้ไม่คิด VAT · สร้างใบโดยไม่ส่งค่า = ค่า VAT ของสาขา (_dealer_display_vat)';
