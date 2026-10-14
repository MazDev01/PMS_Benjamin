-- ── ใบที่ลูกค้าตอบรับแล้ว (won) ห้ามลบ — ทั้งใบเก่าและใบที่มาจากใบ HQ (ด่าน 3 · ข้อตัดสินของบอส 14 ต.ค. 69) ──────────
--
-- ใบ won = ยอดขายที่ปิดแล้ว (ใบจากใบ HQ = คำสั่งผลิต · นับเป็นยอดขาย HQ) — ลบทิ้งได้ = ยอดขาย/ยอดสะสมลูกค้าหายเงียบ ๆ
-- บังคับที่ตาราง: ทุกทาง (หน้าจอ · API · คำสั่งลบลูกค้าทั้งก้อน · ฝั่งเซิร์ฟเวอร์ · สิทธิ์สูงสุด) ผ่านตัวดักเดียวกัน
--   ผลที่ตามมา: ลบลูกค้า/ดีลเลอร์ที่มีใบ won ไม่ได้ (ใบต้องไม่หายตาม) — ใบ lost / หมดอายุ / ร่าง / ส่งแล้ว ลบได้เหมือนเดิม
--   ต้องการเอาใบ won ออกจริง ๆ: ย้อนการตอบรับก่อน (เปลี่ยนสถานะออกจาก won ตามกติกาของใบนั้น) แล้วจึงลบ

create or replace function public.quotations_no_delete_won() returns trigger
  language plpgsql set search_path to 'public' as $$
begin
  if old.status = 'won' then
    raise exception 'quote_won_locked: ใบเสนอราคาที่ลูกค้าตอบรับแล้ว (%) ลบไม่ได้ — เป็นยอดขายที่ปิดแล้ว', old.id;
  end if;
  return old;
end $$;
revoke all on function public.quotations_no_delete_won() from public, anon, authenticated, service_role;
drop trigger if exists quotations_no_delete_won on public.quotations;
create trigger quotations_no_delete_won before delete on public.quotations
  for each row execute function public.quotations_no_delete_won();
