-- ── รอบ 3 · ใบ HQ หนึ่งใบ มีใบลูกค้าที่ยังไม่ถูกแทนที่ได้สายเดียว (บอสสั่ง 21 ต.ค. 69) ───────────────────────────────────
--
-- เอาปุ่ม "ทำสำเนา" ออกจากใบที่ส่งแล้ว / ถูกแทนที่ / ตอบรับแล้ว (ใบร่างยังทำสำเนาได้) และกันที่ฐาน:
--   สาย = ใบแรก + ฉบับใหม่ที่ต่อกันด้วย supersedes_id (0228)
--   - ใบ HQ ที่มีใบลูกค้าส่งออกไปแล้ว (ส่งแล้ว/ตอบรับ/ปฏิเสธ/หมดอายุ ที่ยังไม่ถูกแทนที่) ทำใบใหม่ที่ไม่ใช่ฉบับใหม่ไม่ได้
--     → ลูกค้าต่อรอง = ทำฉบับใหม่จากใบนั้น (quotation_new_version) · สำเนาใบที่ส่งแล้วเป็นทางอ้อมของการแก้ราคาโดยไม่มีฉบับ
--   - ใบร่างหลายใบของใบ HQ เดียวกันมีได้ (ใบร่างทำสำเนาได้) แต่ส่งให้ลูกค้าได้สายเดียว — ส่งใบร่างอีกใบที่ไม่ใช่ฉบับใหม่
--     ของใบที่ส่งอยู่ ถูกปฏิเสธ
-- ใบเดิมที่ไม่มีใบ HQ ไม่อยู่ในกติกานี้ (สร้างใหม่ไม่ได้อยู่แล้ว · 0201)

create or replace function public.quotations_one_chain_guard() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
declare
  ชน text;
begin
  if new.hq_quote_id is null then return new; end if;
  if tg_op = 'INSERT' then
    if new.supersedes_id is not null then return new; end if;   -- ฉบับใหม่ของสายเดิม (กติกาของ 0228)
  elsif old.status <> 'draft' or new.status = 'draft' then
    return new;                                                  -- ตรวจเฉพาะตอนใบร่างออกจากร่าง (ส่ง/ปิด)
  end if;
  select q.id into ชน from quotations q
   where q.dealer_code = new.dealer_code and q.hq_quote_id = new.hq_quote_id
     and q.id <> new.id and q.id is distinct from new.supersedes_id
     and q.status not in ('draft', 'superseded')
   limit 1;
  if ชน is not null then
    raise exception 'quote_chain_exists: ใบ HQ นี้มีใบเสนอราคาที่ส่งให้ลูกค้าแล้ว (%) — ลูกค้าต่อรองให้กด "ทำฉบับใหม่" ที่ใบนั้น', ชน;
  end if;
  return new;
end $$;
revoke all on function public.quotations_one_chain_guard() from public, anon, authenticated, service_role;
drop trigger if exists quotations_one_chain_guard on public.quotations;
create trigger quotations_one_chain_guard before insert or update of status on public.quotations
  for each row execute function public.quotations_one_chain_guard();
