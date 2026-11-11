-- ── นับบันทึกการใช้งานก่อนลบ (บอสสั่ง 26 ต.ค. 69 · อ่านอย่างเดียว) ─────────────────────────────────────────────────
--   รันก่อน cleanup.sql แล้วรายงานเป็นจำนวน: แถวที่จะลบ / แถวที่เหลือ / แถวที่ไม่ใช่แถวทดสอบแต่ติดเงื่อนไข (ต้องเป็น 0)
--   เงื่อนไขต้องตรงกับขั้นบันทึกการใช้งานใน cleanup.sql ทุกตัวอักษร (ข้อทดสอบ tests/tools/audit-cleanup.test.mjs ตรวจให้)
--   เห็นทุกแถว (5 พ.ย. 69): บัญชีที่ CLI ใช้ข้ามกฎสิทธิ์รายแถวได้ไหม — ไม่ได้ = ตาราง audit_log (มีกฎสิทธิ์รายแถว) นับได้ 0 ทั้งที่มีแถว
--     → ด่าน "ปนแถวจริง" อ่านเป็น 0 ด้วย · run.mjs หยุดก่อนลบเมื่อไม่ใช่ true (เหตุ: บอสรันล้างจากหน้าจอคน ขึ้น "ลบ 0" ทั้งที่มีแถวทดสอบ)
select
  (select rolsuper or rolbypassrls from pg_roles where rolname = current_user) as เห็นทุกแถว,
  count(*) filter (where ("user" like 'live-%@example.test' or "user" = 'บัญชีทดสอบชั่วคราว' or target like 'ZZT · %' or target = 'ZZT' or target like 'ZZTN · %' or target = 'ZZTN' or "user" like 'ZZTEST-ผู้สนใจเว็บจริง-%' or target like 'ZZTEST-ผู้สนใจเว็บจริง-%')) as จะลบ,
  count(*) filter (where not ("user" like 'live-%@example.test' or "user" = 'บัญชีทดสอบชั่วคราว' or target like 'ZZT · %' or target = 'ZZT' or target like 'ZZTN · %' or target = 'ZZTN' or "user" like 'ZZTEST-ผู้สนใจเว็บจริง-%' or target like 'ZZTEST-ผู้สนใจเว็บจริง-%')) as เหลือ,
  count(*) filter (where ("user" like 'live-%@example.test' or "user" = 'บัญชีทดสอบชั่วคราว' or target like 'ZZT · %' or target = 'ZZT' or target like 'ZZTN · %' or target = 'ZZTN' or "user" like 'ZZTEST-ผู้สนใจเว็บจริง-%' or target like 'ZZTEST-ผู้สนใจเว็บจริง-%')
                     and not ("user" like 'live-%@example.test' or "user" = 'บัญชีทดสอบชั่วคราว' or "user" like 'ZZT%' or target like 'ZZT%')) as ปนแถวจริง,
  -- เกิดตอนล้าง (บอสสั่ง 11 พ.ย. 69 · เหตุ: นับ 48 ลบจริง 54): cleanup.sql ลบลีด/ใบของสาขาทดสอบ → ตัวดักบันทึก ใบ 0150
  --   (log_lead_change / log_quotation_change · ลงทุกแถวที่ลบ ไม่ขึ้นกับผู้ใช้) เขียน "ลบลูกค้าเป้าหมาย/ลบใบเสนอราคา <สาขา> · …"
  --   ซึ่งเข้าเงื่อนไขลบ (target like 'ZZT · %' / 'ZZTN · %') แล้วถูกลบในทรานแซกชันเดียวกัน → ขั้นนับก่อนลบต้องนับรวม
  --   run.mjs: มีอยู่ก่อน (จะลบ) + เกิดตอนล้าง = ลบจริง (แถวสรุปการลบ ใบ 0245) ไม่ลงตัว = หยุดรายงาน · scripts/lib/cleanupCount.mjs ตรวจยอดล้าง
  (select count(*) from public.leads where dealer_code in ('ZZT', 'ZZTN'))
    + (select count(*) from public.quotations where dealer_code in ('ZZT', 'ZZTN')) as เกิดตอนล้าง,
  -- แถวสรุปการลบล่าสุดก่อนรอบนี้ (ใบ 0245) — หลังล้างมีแถวใหม่กว่านี้ = จำนวนในแถวนั้นคือลบจริงของรอบนี้ · ไม่มี = ลบ 0
  (select coalesce(max(id), 0) from public.audit_log where action = 'ลบแถวทดสอบในบันทึกการใช้งาน') as สรุปล่าสุด
from public.audit_log;
