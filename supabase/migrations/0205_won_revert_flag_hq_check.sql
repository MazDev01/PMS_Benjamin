-- ── ธงของคำสั่งย้อน won ต้องมาคู่กับผู้เรียกที่เป็น HQ (ด่าน 3 · ข้อทดสอบของบอส 14 ต.ค. 69) ──────────────────────
--
-- 0204 ให้ quotation_revert_won() ผ่านตัวดักด้วยธงชั่วคราว pms.revert_won — ตัวดักตรวจแค่ธง
--   ผู้ที่สั่ง SQL ได้เอง ตั้งธงแล้วแก้สถานะใบ won ตรงที่ตารางได้ (ข้อทดสอบ won_revert_hq_only.sql จับได้)
--   ผ่านหน้าเว็บ/API ทำไม่ได้ (set_config อยู่นอก schema ที่ API เปิด) แต่กฎต้องไม่พึ่งข้อนั้น
-- แก้: ตัวดักยอมเมื่อ "ธง + ผู้เรียกเป็น HQ" เท่านั้น — คำสั่งย้อนเป็น security definer แต่ใบผ่านของผู้เรียก (HQ) ยังเป็นของผู้เรียก
--   ดีลเลอร์ตั้งธงเองก็ไม่ผ่าน · สิทธิ์สูงสุดที่ไม่มีใบผ่านของ HQ ก็ไม่ผ่าน

create or replace function public.quotations_guard_won_status() returns trigger
  language plpgsql set search_path to 'public' as $$
begin
  if old.status = 'won' and new.status is distinct from 'won'
     and not (coalesce(current_setting('pms.revert_won', true), '') = '1' and is_hq()) then
    raise exception 'quote_won_locked: ใบเสนอราคาที่ลูกค้าตอบรับแล้ว (%) เปลี่ยนสถานะไม่ได้ — ย้อนได้เฉพาะสำนักงานใหญ่', old.id;
  end if;
  return new;
end $$;
revoke all on function public.quotations_guard_won_status() from public, anon, authenticated, service_role;

create or replace function public.quotations_legacy_lock() returns trigger
  language plpgsql set search_path to 'public' as $$
declare
  ผูกครั้งแรก boolean;
begin
  if old.hq_quote_id is not null or new.hq_quote_id is not null then return new; end if;
  if pg_trigger_depth() > 1 then return new; end if;
  -- การย้อนของ HQ (ธง + ผู้เรียกเป็น HQ) เปลี่ยนได้เฉพาะสถานะ/เหตุผลของใบเก่าที่ won
  if coalesce(current_setting('pms.revert_won', true), '') = '1' and is_hq() and old.status = 'won'
     and (to_jsonb(new) - 'status' - 'lost_reason') = (to_jsonb(old) - 'status' - 'lost_reason') then
    return new;
  end if;

  ผูกครั้งแรก := old.customer_id is null and new.customer_id is not null
    and (to_jsonb(new) - 'customer_id') = (to_jsonb(old) - 'customer_id');
  if ผูกครั้งแรก then return new; end if;

  if old.status in ('won', 'lost', 'expired') then
    raise exception 'legacy_quote_locked: ใบเสนอราคาเดิม (ไม่มีใบ HQ) ที่ปิดแล้วแก้ไม่ได้ — ทำใบใหม่จากใบ HQ แทน';
  end if;
  if new.revision is distinct from old.revision then
    raise exception 'legacy_quote_locked: ใบเสนอราคาเดิม (ไม่มีใบ HQ) ทำเวอร์ชันใหม่ไม่ได้ — ขอราคาจากสำนักงานใหญ่แล้วทำใบใหม่จากใบ HQ';
  end if;
  if new.deal_id is distinct from old.deal_id
     or (old.customer_id is not null and new.customer_id is distinct from old.customer_id) then
    raise exception 'legacy_quote_locked: ใบเสนอราคาเดิม (ไม่มีใบ HQ) ย้ายลูกค้าเป้าหมายหรือลูกค้าที่ผูกอยู่ไม่ได้';
  end if;
  return new;
end $$;
revoke all on function public.quotations_legacy_lock() from public, anon, authenticated, service_role;
