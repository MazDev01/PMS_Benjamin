-- ── นับบันทึกการใช้งานก่อนลบ (บอสสั่ง 26 ต.ค. 69 · อ่านอย่างเดียว) ─────────────────────────────────────────────────
--   รันก่อน cleanup.sql แล้วรายงานเป็นจำนวน: แถวที่จะลบ / แถวที่เหลือ / แถวที่ไม่ใช่แถวทดสอบแต่ติดเงื่อนไข (ต้องเป็น 0)
--   เงื่อนไขต้องตรงกับขั้นบันทึกการใช้งานใน cleanup.sql ทุกตัวอักษร (ข้อทดสอบ tests/tools/audit-cleanup.test.mjs ตรวจให้)
select
  count(*) filter (where ("user" like 'live-%@example.test' or "user" = 'บัญชีทดสอบชั่วคราว' or target like 'ZZT · %' or target = 'ZZT')) as จะลบ,
  count(*) filter (where not ("user" like 'live-%@example.test' or "user" = 'บัญชีทดสอบชั่วคราว' or target like 'ZZT · %' or target = 'ZZT')) as เหลือ,
  count(*) filter (where ("user" like 'live-%@example.test' or "user" = 'บัญชีทดสอบชั่วคราว' or target like 'ZZT · %' or target = 'ZZT')
                     and not ("user" like 'live-%@example.test' or "user" = 'บัญชีทดสอบชั่วคราว' or "user" like 'ZZT%' or target like 'ZZT%')) as ปนแถวจริง
from public.audit_log;
