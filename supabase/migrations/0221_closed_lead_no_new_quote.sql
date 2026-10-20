-- ── ใบ 0221: ลีดที่ปิดการขายสำเร็จแล้ว ทำใบเสนอราคาใหม่ / ขอราคา / ขอแก้ราคา ไม่ได้ (บอสสั่ง 20 ต.ค. 69 · ช่วง ก2) ───────────
--
-- เดิม: หลังลูกค้าตอบรับ (ลีด PAID · ใบ HQ = สั่งผลิต) แผงลีดยังมีปุ่ม "ทำใบเสนอราคาจากใบ HQ" และ "ขอแก้ราคา" กดได้
--   ทำใบ = ฐานปฏิเสธด้วยข้อความไม่ตรงเรื่อง (ใบ HQ ไม่ใช่ "ส่งแล้ว") · ขอแก้ราคา = คำขอถูกปิดเป็น won ไปแล้ว แต่ไม่มีตัวกันที่บอกตรง ๆ
-- ใหม่: ลีด PAID → เพิ่มใบเสนอราคาใหม่ และเปิดคำขอราคาใหม่ (ขอราคา/ขอแก้ราคา) ไม่ได้ · ข้อความบอกทางไปต่อ
--   ลูกค้ารายเดิมซื้อรอบใหม่ = "เพิ่มงานขายใหม่" ที่หน้าลูกค้า (ลีดใหม่) · ย้อนการตอบรับได้เฉพาะ HQ (0204/0217)
-- ไม่ตรวจ: service role / งานในฐาน (กู้ข้อมูล · ชุดล้างข้อมูลทดสอบ)
-- ข้อทดสอบ: supabase/tests/lead_hq_quoted.sql (ส่วน "ปิดแล้ว")
create or replace function public.closed_lead_no_new_quote() returns trigger
  language plpgsql set search_path to 'public' as $$
declare v_num integer; v_status lead_status;
begin
  if coalesce(auth.role(), '') <> 'authenticated' then return new; end if;
  -- แยกตามตาราง (plpgsql อ่านช่องของ new ตอนรันบรรทัดนั้น — ใช้ case รวมบรรทัดเดียวจะพังเพราะ quote_requests ไม่มี deal_id)
  if tg_table_name = 'quotations' then v_num := new.deal_id; else v_num := new.lead_num_id; end if;
  if v_num is null then return new; end if;
  select status into v_status from leads where dealer_code = new.dealer_code and num_id = v_num;
  if v_status = 'PAID' then
    raise exception 'lead_closed: ลูกค้าเป้าหมายนี้ปิดการขายสำเร็จแล้ว — ทำใบใหม่หรือขอราคาไม่ได้ (ลูกค้ารายเดิมซื้อรอบใหม่ = เพิ่มงานขายใหม่ที่หน้าลูกค้า)';
  end if;
  return new;
end $$;
revoke all on function public.closed_lead_no_new_quote() from public, anon, authenticated, service_role;

drop trigger if exists closed_lead_no_new_quote on public.quotations;
create trigger closed_lead_no_new_quote before insert on public.quotations
  for each row execute function public.closed_lead_no_new_quote();
drop trigger if exists closed_lead_no_new_quote on public.quote_requests;
create trigger closed_lead_no_new_quote before insert on public.quote_requests
  for each row execute function public.closed_lead_no_new_quote();
