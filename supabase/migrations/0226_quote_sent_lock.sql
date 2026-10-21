-- ── รอบ 3 ข้อ 1: ใบเสนอราคาส่งให้ลูกค้าแล้ว ล็อกเนื้อหาทั้งใบ (บอสสั่ง 20 ต.ค. 69) ───────────────────────────────────────
--
-- กติกาของหน้าแก้ไขใบเสนอราคา:
--   - ราคาแต่ละรายการแก้ได้เฉพาะ % (ราคาคิดจากต้นทุนใบ HQ ที่ฐาน — quotations_hq_apply_markup · 0186 อยู่แล้ว)
--   - ชื่อลูกค้า โครงการ จังหวัด พื้นที่ แก้ได้เฉพาะตอนเป็นใบร่าง
--   - ส่งให้ลูกค้าแล้ว (สถานะอื่นที่ไม่ใช่ใบร่าง) = ล็อกทั้งหมด — กันที่ฐาน ไม่ใช่แค่ซ่อนปุ่ม
-- ใช้กับทุกทางที่เขียน (หน้าจอ · API ฝั่งเซิร์ฟเวอร์ · เขียนตรง) และทุกใบ (ใบที่ทำจากใบ HQ และใบเดิมที่ไม่มีใบ HQ)
--
-- ยังทำได้หลังส่ง (งานของระบบ/ขั้นตอนขาย ไม่ใช่การแก้เนื้อหาใบ):
--   เปลี่ยนสถานะ (ตอบรับ · ปฏิเสธ · หมดอายุ · HQ ย้อนการตอบรับ) · เหตุผลปฏิเสธ/หมดอายุ · ผูกลูกค้า (customer_id ตอนปิดการขาย)
--   · ย้ายข้อมูลสาขา (dealer_code) · วันหมดอายุ (ระบบตั้งตามใบ HQ)
-- เทียบหลังตัวคิดราคาจาก % ทำงานแล้ว — ส่งค่าเดิมกลับมาทั้งแถวจึงไม่ถูกปฏิเสธ
-- ช่องที่ฐานคิดเอง (ยอดตัวหนังสือ · ภาษีเป็นบาท) ไม่เทียบ — มาจากช่องที่ล็อกไว้แล้ว

-- หน้าเว็บอ่านแล้วส่งกลับทั้งแถว (rowMappers.ts): ช่องว่าง/NULL → "" · พื้นที่ NULL/"" → 0 → "0" · "450.50" → 450.5 → "450.5"
--   ค่าเดียวกันคนละรูปแบบต้องไม่นับว่า "แก้" — ไม่งั้นปุ่มลูกค้าปฏิเสธ/ส่งอีกครั้ง (ส่งทั้งแถว) ถูกปฏิเสธบนใบที่ส่งแล้ว
create or replace function public._quote_lock_text(v text) returns text
  language sql immutable set search_path to 'public' as $$ select nullif(btrim(coalesce(v, '')), '') $$;
create or replace function public._quote_lock_area(v text) returns text
  language sql immutable set search_path to 'public' as $$
  select case when btrim(coalesce(v, '')) ~ '^[0-9]+([.][0-9]+)?$' then nullif(trim_scale(btrim(v)::numeric), 0)::text
              else nullif(btrim(coalesce(v, '')), '') end $$;
revoke all on function public._quote_lock_text(text) from public, anon, authenticated, service_role;
revoke all on function public._quote_lock_area(text) from public, anon, authenticated, service_role;

-- security definer: ตัวช่วยเทียบด้านบนปิดสิทธิ์เรียกจากทุกบทบาท (ดีลเลอร์/ฝั่งเซิร์ฟเวอร์เรียกเองไม่ได้ ใช้ผ่านตัวดักนี้เท่านั้น)
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
    when new.revision       is distinct from old.revision       then 'เวอร์ชัน'
  end;
  if ช่อง is not null then
    raise exception 'quote_sent_locked: ใบเสนอราคานี้ส่งให้ลูกค้าแล้ว แก้ไม่ได้ (%) — ถ้าต้องเปลี่ยนราคา ให้ขอแก้ราคาจากสำนักงานใหญ่แล้วทำใบใหม่', ช่อง;
  end if;
  return new;
end $$;
revoke all on function public.quotations_sent_lock() from public, anon, authenticated, service_role;
-- ชื่อตัวดัก "quotations_zz_…" = ทำงานหลังตัวคิดราคาจาก % (quotations_hq_apply_markup) และหลังตัวล็อกเดิม
--   (ใบเดิม quotations_legacy_lock · ใบที่ตอบรับแล้ว quotations_won_lock) — ใบปิดแล้วยังได้ข้อความเดิมที่บอกเหตุผลเจาะจงกว่า
--   แต่ก่อนตัวดักชุด trg_* (ยอดตัวหนังสือ/นับรายการ) ซึ่งคิดจากช่องที่ล็อกแล้ว
drop trigger if exists quotations_zz_sent_lock on public.quotations;
create trigger quotations_zz_sent_lock before update on public.quotations
  for each row execute function public.quotations_sent_lock();
