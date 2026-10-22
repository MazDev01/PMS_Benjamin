-- ── ใบ 0238: เวลาแก้ล่าสุดของใบเสนอราคา + ส่งใบด้วยราคาในฐาน (บอสสั่ง 22 ต.ค. 69) ─────────────────────────────────────
--
-- บั๊กที่เจอจาก trace รอบตรวจเต็มรอบ 4: แก้ % ของ V2 แล้วบันทึก (2,950) → กด "ส่งให้ลูกค้า" → หน้าเว็บส่ง "ทั้งแถว" จากหน้าจอ
--   ซึ่งยังเป็น V2 รุ่นเก่า (2,750) — ข่าวอัปเดตสดของแถวเก่ามาถึงทีหลังแล้วทับของใหม่บนจอ · คำขอผ่าน = ลูกค้าได้ยอดเก่า % ที่แก้หายเงียบ ๆ
--   (ยืนยันแล้วด้วย tests/scenario/quote-send-fresh.spec.ts บนโค้ดก่อนแก้: ฐานได้ 2,750)
-- ทางแก้ (บอสอนุมัติ):
--   1. updated_at = เวลาแก้ล่าสุดของแถว — ฐานใส่เองด้วยตัวดักทุกครั้งที่เพิ่ม/แก้แถว หน้าเว็บส่งค่ามาเองไม่ได้ (ถูกทับเสมอ)
--      หน้าเว็บใช้เทียบข่าวอัปเดตสด: ข่าวที่ updated_at เก่ากว่าหรือเท่ากับของที่มีอยู่ = ทิ้ง (packages/shared/lib/quoteMerge.ts)
--      แถวเดิมได้ค่าเริ่มต้น = เวลาที่ลงใบนี้ (เพิ่มช่องพร้อมค่าตั้งต้น ไม่ต้อง UPDATE แถวที่ล็อกอยู่)
--      — เลือกเวลาลงใบ ไม่ใช่ created_at: ใบที่เคยแก้หลังสร้างจะได้เวลาที่ "ไม่เก่ากว่าการแก้ครั้งไหน" เสมอ (ข่าวเก่าจากก่อนลงใบทับไม่ได้)
--   2. quotation_send = ส่งใบให้ลูกค้า/ส่งอีกครั้ง เปลี่ยนแค่สถานะ + ประทับวันที่ส่ง (วันนี้ตามเวลาไทย) ราคาเป็นของในฐาน
--      รันด้วยสิทธิ์ผู้เรียก (security invoker) → RLS และตัวกันเดิมทุกตัวยังทำงาน (ใบเดิม/ล็อก/ฉบับใหม่ 0201 0226 0228)
--      คืนแถวจากฐาน หน้าเว็บเอาไปแทนของบนจอ
-- ข้อทดสอบ: supabase/tests/quote_updated_at_send.sql · tests/scenario/quote-send-fresh.spec.ts · tests/unit/quoteMerge.test.ts

-- ═══ 1. เวลาแก้ล่าสุด ═══════════════════════════════════════════════════════════════
alter table public.quotations add column if not exists updated_at timestamptz not null default now();
comment on column public.quotations.updated_at is 'เวลาแก้ล่าสุดของแถว — ฐานใส่เองทุกครั้งที่เพิ่ม/แก้ (ตัวดัก zz_quotations_updated_at · ALWAYS) หน้าเว็บส่งมาเองไม่ได้ · ใช้ทิ้งข่าวอัปเดตสดที่เก่ากว่า (0238)';

create or replace function public.quotations_updated_at() returns trigger
  language plpgsql set search_path to 'public' as $$
begin
  -- clock_timestamp (ไม่ใช่ now ที่ค้างทั้งรายการ) + ต้องมากกว่าของเดิมเสมอ → แก้กี่ครั้งเวลาก็ขยับขึ้นทุกครั้ง
  if tg_op = 'INSERT' then new.updated_at := clock_timestamp();
  else new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  end if;
  return new;
end $$;
revoke all on function public.quotations_updated_at() from public, anon, authenticated, service_role;
-- ชื่อขึ้นต้น zz_ = ทำงานหลังตัวดัก BEFORE ตัวอื่นทั้งหมด (ฐานเรียกตามลำดับชื่อ · ตัวไหนแก้ new.updated_at มาก็ถูกทับด้วยเวลาจริง)
drop trigger if exists zz_quotations_updated_at on public.quotations;
create trigger zz_quotations_updated_at before insert or update on public.quotations
  for each row execute function public.quotations_updated_at();
alter table public.quotations enable always trigger zz_quotations_updated_at;

-- ═══ 2. ส่งใบให้ลูกค้า — เปลี่ยนแค่สถานะ ราคาเป็นของในฐาน ═══════════════════════════════════════
create or replace function public.quotation_send(p_dealer text, p_id text) returns public.quotations
  language plpgsql security invoker set search_path to 'public' as $$
declare ผล quotations;
begin
  if not (can_write_sales() and p_dealer = auth_dealer()) then
    raise exception 'forbidden: ไม่มีสิทธิ์ส่งใบเสนอราคาของสาขา %', p_dealer;
  end if;
  update quotations
     set status = 'sent_to_client',
         date   = to_char((now() at time zone 'Asia/Bangkok')::date, 'YYYY-MM-DD')
   where dealer_code = p_dealer and id = p_id and status in ('draft', 'sent_to_client')
  returning * into ผล;
  if not found then
    raise exception 'quote_send_invalid: ส่งได้เฉพาะใบร่างหรือใบที่ส่งให้ลูกค้าแล้ว (ใบ % · สถานะ %)', p_id,
      coalesce((select status::text from quotations where dealer_code = p_dealer and id = p_id), 'ไม่พบใบ');
  end if;
  return ผล;
end $$;
revoke all on function public.quotation_send(text, text) from public, anon, authenticated, service_role;
grant execute on function public.quotation_send(text, text) to authenticated;
