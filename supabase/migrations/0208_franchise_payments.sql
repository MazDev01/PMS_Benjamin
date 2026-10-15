-- Benjamin PMS — ด่าน 4 · ตกลง + ชำระ → แปลงเป็นดีลเลอร์ (ข้อตัดสินของบอส 15 ต.ค. 69)
--
-- FLOW ช่วงที่ 1: ใบค่าแฟรนไชส์ → ตกลง + ชำระ → แปลงเป็นดีลเลอร์
--   • บันทึกการชำระได้หลายครั้ง (วันที่ · ยอด > 0 · เลขอ้างอิง) เฉพาะ HQ · เฉพาะใบที่ตอบรับแล้ว
--   • บันทึกการชำระแก้/ลบไม่ได้ — ผิดให้ "ยกเลิกพร้อมเหตุผล" แล้วบันทึกใหม่ · ยอดที่ยกเลิกไม่นับ
--   • แปลงเป็นดีลเลอร์ได้เมื่อ ใบตอบรับ + ยอดชำระรวม (ไม่นับที่ยกเลิก) ≥ ยอดในใบ (ใบไม่ระบุยอด = 0)
-- จุดบังคับ: ตอนเพิ่มแถวดีลเลอร์ (dealers.prospect_id = ผู้สนใจต้นทาง)
--   • ผูกผู้สนใจ → ต้องพร้อมแปลง (ทุกบทบาท รวมเส้นทางสร้างดีลเลอร์ที่ใช้สิทธิ์เซิร์ฟเวอร์)
--   • บัญชีผู้ใช้ (HQ) เพิ่มดีลเลอร์ตรงที่ตาราง → ต้องผูกผู้สนใจเสมอ (เดิม RLS ยอมให้ HQ เพิ่มแถวตรง ข้ามเส้นทางสร้างดีลเลอร์ได้)
--   • สิทธิ์เซิร์ฟเวอร์ที่ไม่ผูกผู้สนใจ (สคริปต์ลงทะเบียนสาขาตั้งต้น · ชุดทดสอบ) เพิ่มได้ตามเดิม
-- ข้อทดสอบ: supabase/tests/franchise_payment_rules.sql

-- ═══ 1. บันทึกการชำระ ═══════════════════════════════════════════════════════════════════════
create table public.dealer_proposal_payments (
  id              bigint generated always as identity primary key,
  proposal_id     bigint not null references public.dealer_package_proposals(id) on delete cascade,
  paid_on         date not null,
  amount          numeric not null constraint dealer_proposal_payments_amount_check check (amount > 0),
  reference       text not null constraint dealer_proposal_payments_reference_check check (btrim(reference) <> ''),
  created_at      timestamptz not null default now(),
  created_by      uuid default auth.uid(),
  created_by_name text,
  cancel_reason   text,
  cancelled_at    timestamptz,
  cancelled_by    uuid
);
comment on table public.dealer_proposal_payments is 'บันทึกการชำระค่าแฟรนไชส์ (HQ) — แก้/ลบไม่ได้ ยกเลิกพร้อมเหตุผลแล้วบันทึกใหม่ · 0208';
create index dealer_proposal_payments_proposal_idx on public.dealer_proposal_payments (proposal_id);

create or replace function public.dealer_proposal_payments_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
declare st text;
begin
  if tg_op = 'DELETE' then
    -- ลบผู้สนใจ → ใบ → บันทึกการชำระ ตามกุญแจนอก (ชั้นลึกกว่า 1) ได้ · ลบตรงไม่ได้
    if pg_trigger_depth() = 1 then
      raise exception 'payment_locked: ลบบันทึกการชำระไม่ได้ — ยกเลิกพร้อมเหตุผลแล้วบันทึกใหม่';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    select status into st from dealer_package_proposals where id = new.proposal_id;
    if st is distinct from 'accepted' then
      raise exception 'payment_not_accepted: บันทึกการชำระได้เฉพาะใบค่าแฟรนไชส์ที่ตอบรับแล้ว (ใบนี้เป็น %)', coalesce(st, 'ไม่พบใบ');
    end if;
    new.created_at := now();
    new.created_by := auth.uid();
    new.created_by_name := (select nullif(btrim(name), '') from profiles where id = auth.uid());
    new.cancel_reason := null; new.cancelled_at := null; new.cancelled_by := null;
    new.reference := btrim(new.reference);
    return new;
  end if;
  -- UPDATE: แก้ได้อย่างเดียวคือยกเลิก (ครั้งเดียว พร้อมเหตุผล)
  if old.cancelled_at is not null
     or new.proposal_id is distinct from old.proposal_id or new.paid_on is distinct from old.paid_on
     or new.amount is distinct from old.amount or new.reference is distinct from old.reference
     or new.created_at is distinct from old.created_at or new.created_by is distinct from old.created_by
     or new.created_by_name is distinct from old.created_by_name then
    raise exception 'payment_locked: บันทึกการชำระแก้ไม่ได้ — ยกเลิกพร้อมเหตุผลแล้วบันทึกใหม่';
  end if;
  if btrim(coalesce(new.cancel_reason, '')) = '' then
    raise exception 'payment_cancel_reason: ยกเลิกบันทึกการชำระต้องระบุเหตุผล';
  end if;
  new.cancel_reason := btrim(new.cancel_reason);
  new.cancelled_at := now();
  new.cancelled_by := auth.uid();
  return new;
end $$;
revoke all on function public.dealer_proposal_payments_guard() from public, anon, authenticated, service_role;
create trigger dealer_proposal_payments_guard before insert or update or delete on public.dealer_proposal_payments
  for each row execute function public.dealer_proposal_payments_guard();

-- ประวัติของผู้สนใจ: บันทึก/ยกเลิกการชำระ
create or replace function public.dealer_proposal_payments_log() returns trigger
  language plpgsql security definer set search_path = public as $$
declare pr record;
begin
  select prospect_id, proposal_no into pr from dealer_package_proposals where id = new.proposal_id;
  insert into dealer_prospect_activities (prospect_id, kind, body)
  values (pr.prospect_id, 'proposal',
    case when tg_op = 'INSERT'
         then 'บันทึกการชำระ ' || pr.proposal_no || ' · ' || to_char(new.amount, 'FM999,999,999,990.00') || ' บาท · อ้างอิง ' || new.reference
         else 'ยกเลิกการชำระ ' || pr.proposal_no || ' · ' || to_char(new.amount, 'FM999,999,999,990.00') || ' บาท · ' || new.cancel_reason end);
  return null;
end $$;
revoke all on function public.dealer_proposal_payments_log() from public, anon, authenticated, service_role;
create trigger dealer_proposal_payments_log after insert or update on public.dealer_proposal_payments
  for each row execute function public.dealer_proposal_payments_log();

alter table public.dealer_proposal_payments enable row level security;
create policy dealer_proposal_payments_read on public.dealer_proposal_payments for select to authenticated using (is_hq());
create policy dealer_proposal_payments_insert on public.dealer_proposal_payments for insert to authenticated with check (can_write_master());
create policy dealer_proposal_payments_update on public.dealer_proposal_payments for update to authenticated
  using (can_write_master()) with check (can_write_master());
create policy must_set_password_block on public.dealer_proposal_payments as restrictive for all to authenticated
  using (not must_set_password()) with check (not must_set_password());
revoke all on public.dealer_proposal_payments from public, anon, authenticated;
grant select, insert, update on public.dealer_proposal_payments to authenticated;
grant all on public.dealer_proposal_payments to service_role;

-- ═══ 2. ยอดชำระ · ความพร้อมแปลง ══════════════════════════════════════════════════════════════
-- รันด้วยสิทธิ์ผู้เรียก: กฎรายตารางกรองเอง (ดีลเลอร์มองไม่เห็นบันทึกการชำระ = 0) · ด่านตอนแปลงเรียกจากคำสั่งสิทธิ์เจ้าของ
--   (รุ่นแรกเป็น security definer ไม่ตรวจผู้เรียก — ตัวตรวจ temp_password_gate จับได้: ดีลเลอร์อ่านยอดชำระของใบไหนก็ได้)
create or replace function public.dealer_proposal_paid_total(p_proposal bigint) returns numeric
  language sql stable security invoker set search_path = public as $$
  select coalesce(sum(amount), 0) from dealer_proposal_payments where proposal_id = p_proposal and cancelled_at is null
$$;
revoke all on function public.dealer_proposal_paid_total(bigint) from public, anon, authenticated, service_role;
grant execute on function public.dealer_proposal_paid_total(bigint) to authenticated, service_role;

/** null = พร้อมแปลง · ข้อความ = ยังไม่พร้อมเพราะอะไร (ใบตอบรับที่ชำระครบใบใดใบหนึ่งก็พอ) */
create or replace function public.dealer_conversion_ready(p_prospect bigint) returns text
  language plpgsql stable security definer set search_path = public as $$
declare p record; ดีสุด record;
begin
  -- HQ · สิทธิ์เซิร์ฟเวอร์ · ต่อฐานตรงที่ไม่มีใบผ่าน (ตัวดักตอนเพิ่มดีลเลอร์จากสคริปต์) — current_user ใช้ไม่ได้ (สิทธิ์เจ้าของเสมอ)
  if not (is_hq() or coalesce(auth.role(), '') in ('service_role', '')) then
    raise exception 'forbidden: เฉพาะสำนักงานใหญ่';
  end if;
  for p in select id, proposal_no, coalesce(amount, 0) as ยอด, dealer_proposal_paid_total(id) as ชำระ
             from dealer_package_proposals where prospect_id = p_prospect and status = 'accepted' order by id desc loop
    if p.ชำระ >= p.ยอด then return null; end if;
    if ดีสุด is null then ดีสุด := p; end if;
  end loop;
  if ดีสุด is null then
    return 'ยังไม่มีใบค่าแฟรนไชส์ที่ตอบรับ — ตอบรับใบแล้วบันทึกการชำระให้ครบก่อน';
  end if;
  return format('ยังชำระไม่ครบ — ใบ %s ยอด %s บาท ชำระแล้ว %s บาท',
    ดีสุด.proposal_no, to_char(ดีสุด.ยอด, 'FM999,999,999,990.00'), to_char(ดีสุด.ชำระ, 'FM999,999,999,990.00'));
end $$;
revoke all on function public.dealer_conversion_ready(bigint) from public, anon, authenticated, service_role;
grant execute on function public.dealer_conversion_ready(bigint) to authenticated, service_role;

-- ═══ 3. ดีลเลอร์ผูกผู้สนใจต้นทาง + ด่านตอนเพิ่มแถว ═══════════════════════════════════════════════
alter table public.dealers add column if not exists prospect_id bigint references public.dealer_prospects(id) on delete set null;
comment on column public.dealers.prospect_id is 'ผู้สนใจต้นทางที่แปลงเป็นดีลเลอร์นี้ (0208) — ผูกแล้วต้องตอบรับ + ชำระครบตอนเพิ่ม';
create unique index if not exists dealers_prospect_id_key on public.dealers (prospect_id) where prospect_id is not null;

create or replace function public.dealers_conversion_gate() returns trigger
  language plpgsql security definer set search_path = public as $$
declare ยังไม่พร้อม text;
begin
  if new.prospect_id is null then
    if coalesce(auth.role(), '') = 'authenticated' then
      raise exception 'conversion_needs_prospect: ดีลเลอร์ต้องสร้างจากลูกค้าเป้าหมายที่ตอบรับ + ชำระครบแล้ว';
    end if;
    return new;
  end if;
  ยังไม่พร้อม := dealer_conversion_ready(new.prospect_id);
  if ยังไม่พร้อม is not null then
    raise exception 'conversion_not_ready: %', ยังไม่พร้อม;
  end if;
  return new;
end $$;
revoke all on function public.dealers_conversion_gate() from public, anon, authenticated, service_role;
create trigger dealers_conversion_gate before insert on public.dealers
  for each row execute function public.dealers_conversion_gate();
