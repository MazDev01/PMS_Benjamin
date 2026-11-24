-- ── ใบ 0300: ใบเสนอราคาที่ไม่มีฉบับ (revision ว่าง) บันทึกผลลูกค้าได้ (คนรวมงานสั่ง 23 พ.ย. 69 · ทำทั้งสองทาง ไม่เติมย้อนหลัง) ──
-- เจอ (ef พิสูจน์ข้อ 3 ของผู้ตรวจ): ใบที่สร้างโดยไม่ส่ง revision (dev-sample · ตัวช่วยข้อทดสอบ · ทางเขียนตรง) เก็บ revision = NULL
--   หน้าจออ่านแล้วส่งกลับทั้งแถวเป็น "V1" → ตัวกันใบที่ส่งแล้ว (0226) เห็นว่าแก้ "เวอร์ชัน" → ดีลเลอร์กด "ลูกค้าปฏิเสธ/ตอบรับ" ไม่ได้
--   ("ใบเสนอราคานี้ส่งให้ลูกค้าแล้ว แก้ไม่ได้ (ฉบับ)")
-- 1) สร้างใบใหม่ทุกทาง (create_quotation · เขียนตรง · ทางของระบบ): revision ว่าง = 'V1' (ตัวกระตุ้นก่อนเพิ่มแถว — ครอบทุกทาง ไม่ต้องแก้ทีละคำสั่ง)
-- 2) ตัวกันใบที่ส่งแล้ว (0226): เทียบฉบับแบบ ว่าง = 'V1' — ใบเก่าที่ revision NULL อยู่แล้วบันทึกผลได้ · เปลี่ยนเป็น V2 ยังถูกปฏิเสธเหมือนเดิม
--   ส่วนอื่นของ quotations_sent_lock เหมือน 0226 ทุกตัวอักษร
-- ไม่เติมย้อนหลัง (คนรวมงานสั่ง) — ใบเก่า revision NULL คงเดิม หน้าจอแสดง V1 อยู่แล้ว
-- ข้อทดสอบ: ซ้อมลงใบ tests/tools/migration-0300.test.mjs

create or replace function public._quote_lock_rev(v text) returns text
  language sql immutable set search_path to 'public' as $$ select coalesce(nullif(btrim(coalesce(v, '')), ''), 'V1') $$;
revoke all on function public._quote_lock_rev(text) from public, anon, authenticated, service_role;

create or replace function public.quotations_sent_lock() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
declare
  ช่อง text;
begin
  if old.status = 'draft' then return new; end if;
  ช่อง := case
    when _quote_lock_text(new.customer) is distinct from _quote_lock_text(old.customer) then 'ชื่อลูกค้า'
    when _quote_lock_text(new.project) is distinct from _quote_lock_text(old.project) then 'โครงการ'
    when _quote_lock_text(new.province) is distinct from _quote_lock_text(old.province) then 'จังหวัด'
    when _quote_lock_area(new.area) is distinct from _quote_lock_area(old.area) then 'พื้นที่'
    when new.line_items     is distinct from old.line_items     then 'รายการ/ราคา'
    when new.markup_percent is distinct from old.markup_percent then '% ที่บวก'
    when new.total_value    is distinct from old.total_value    then 'ยอดรวม'
    when new.material_cost  is distinct from old.material_cost  then 'ต้นทุน'
    when new.items          is distinct from old.items          then 'จำนวนรายการ'
    when new.vat_percent    is distinct from old.vat_percent    then 'ภาษีมูลค่าเพิ่ม'
    when new.wht_rate       is distinct from old.wht_rate       then 'ภาษีหัก ณ ที่จ่าย'
    when _quote_lock_text(new.building_type) is distinct from _quote_lock_text(old.building_type) then 'ประเภทงาน'
    when _quote_lock_rev(new.revision) is distinct from _quote_lock_rev(old.revision) then 'เวอร์ชัน'   -- ใบ 0300: ว่าง = V1
  end;
  if ช่อง is not null then
    raise exception 'quote_sent_locked: ใบเสนอราคานี้ส่งให้ลูกค้าแล้ว แก้ไม่ได้ (%) — ถ้าต้องเปลี่ยนราคา ให้ขอแก้ราคาจากสำนักงานใหญ่แล้วทำใบใหม่', ช่อง;
  end if;
  return new;
end $$;
revoke all on function public.quotations_sent_lock() from public, anon, authenticated, service_role;

-- ── ใบใหม่ที่ไม่ส่งฉบับ = V1 ──
create or replace function public._quote_revision_default() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if btrim(coalesce(new.revision, '')) = '' then new.revision := 'V1'; end if;
  return new;
end $$;
revoke all on function public._quote_revision_default() from public, anon, authenticated, service_role;
drop trigger if exists quotations_aa_revision_default on public.quotations;
create trigger quotations_aa_revision_default before insert on public.quotations
  for each row execute function public._quote_revision_default();
