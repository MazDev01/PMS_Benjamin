-- ── ใบ 0258: leads.has_quotes — ลีดมีคำขอราคาหรือใบเสนอราคาแล้วหรือยัง (บอสสั่ง 28 ต.ค. 69 · ตารางลีด ปุ่มลบ) ─────
--
-- ตารางลูกค้าเป้าหมาย (ดีลเลอร์ + ลีดทั้งเครือ HQ) มีปุ่มลบในแถว "เฉพาะลีดที่ยังไม่มีคำขอราคาหรือใบ" — กฎเดียวกับหัวแผงลีด
--   ฐานกันการลบอยู่แล้ว (ใบ 0217 leads_delete_guard: มีคำขอ/ใบ = ลบไม่ได้) แต่แถวตารางไม่รู้ว่าลีดมีคำขอหรือยัง
--   (คำขอที่ยกเลิกแล้วลีดกลับเป็นขั้นต้น → ดูจากสถานะไม่ได้ · รอบ 4 บอสเคยเห็นปุ่มขึ้นแล้วกดไม่ได้)
-- leads.has_quotes = มีคำขอราคา (ทุกสถานะ รวมที่ยกเลิก) หรือมีใบเสนอราคาที่ผูกลีด — เงื่อนไขเดียวกับ 0217 ทุกตัวอักษร
--   ฐานเขียนเองเมื่อคำขอ/ใบเกิด ถูกลบ หรือย้ายลีด · หน้าเว็บอ่านอย่างเดียว (เขียนเองถูกคงค่าเดิมเงียบ ๆ แบบ quote_value 0223)
-- leads.reached_step = ขั้นไกลสุดที่ดีลเคยไปถึง (1–5) — แถบความคืบหน้าในตารางของลีดที่ปิดไม่สำเร็จ แสดงสีแดงตามขั้นนี้ (บอสสั่ง 28 ต.ค. 69)
--   เงื่อนไขเดียวกับแถบในแผงลีด (leadStage.ts สภาพแถบขั้น): 2 เคยขอราคา · 3 HQ เคยส่งใบ · 4 เคยทำใบลูกค้า · 5 เคยส่งใบถึงลูกค้า
-- ข้อทดสอบ: supabase/tests/lead_has_quotes.sql
alter table public.leads add column if not exists has_quotes boolean not null default false;
alter table public.leads add column if not exists reached_step smallint not null default 1;
comment on column public.leads.reached_step is
  'ขั้นไกลสุดที่ดีลเคยไปถึง 1–5 (2 ขอราคา · 3 HQ ส่งใบ · 4 ทำใบลูกค้า · 5 ส่งใบถึงลูกค้า) · ฐานเขียนเอง (ใบ 0258) · แถบความคืบหน้าของลีดที่ปิดไม่สำเร็จ';
comment on column public.leads.has_quotes is
  'ลีดมีคำขอราคา (ทุกสถานะ) หรือใบเสนอราคาที่ผูกแล้ว = ลบลีดไม่ได้ (กฎ 0217) · ฐานเขียนเอง · หน้าเว็บใช้ซ่อน/แสดงปุ่มลบในตาราง';

create or replace function public._lead_has_quotes(p_dealer text, p_num integer) returns boolean
  language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from quote_requests r where r.dealer_code = p_dealer and r.lead_num_id = p_num)
      or exists (select 1 from quotations q where q.dealer_code = p_dealer and q.deal_id = p_num)
$$;
revoke all on function public._lead_has_quotes(text, integer) from public, anon, authenticated, service_role;

-- สถานะชุดเดียวกับ leadStage.ts: คำขอที่ HQ ส่งใบแล้ว = quoted/won/lost/superseded · ใบที่ถึงมือลูกค้า = sent_to_client/won/lost/superseded
create or replace function public._lead_reached_step(p_dealer text, p_num integer) returns smallint
  language sql stable security definer set search_path to 'public' as $$
  select case
    when exists (select 1 from quotations q where q.dealer_code = p_dealer and q.deal_id = p_num
                  and q.status in ('sent_to_client', 'won', 'lost', 'superseded')) then 5
    when exists (select 1 from quotations q where q.dealer_code = p_dealer and q.deal_id = p_num) then 4
    when exists (select 1 from quote_requests r where r.dealer_code = p_dealer and r.lead_num_id = p_num
                  and r.status in ('quoted', 'won', 'lost', 'superseded')) then 3
    when exists (select 1 from quote_requests r where r.dealer_code = p_dealer and r.lead_num_id = p_num) then 2
    else 1 end::smallint
$$;
revoke all on function public._lead_reached_step(text, integer) from public, anon, authenticated, service_role;

create or replace function public._lead_refresh_has_quotes(p_dealer text, p_num integer) returns void
  language plpgsql security definer set search_path to 'public' as $$
begin
  if p_dealer is null or coalesce(p_num, 0) = 0 then return; end if;
  perform set_config('pms.has_quotes_sync', '1', true);
  update leads l set has_quotes = _lead_has_quotes(p_dealer, p_num), reached_step = _lead_reached_step(p_dealer, p_num)
   where l.dealer_code = p_dealer and l.num_id = p_num
     and (l.has_quotes is distinct from _lead_has_quotes(p_dealer, p_num) or l.reached_step is distinct from _lead_reached_step(p_dealer, p_num));
  perform set_config('pms.has_quotes_sync', '', true);
end $$;
revoke all on function public._lead_refresh_has_quotes(text, integer) from public, anon, authenticated, service_role;

-- ใบเสนอราคา: เกิด / ถูกลบ / ย้ายลีด
create or replace function public.quotations_lead_has_quotes() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then perform _lead_refresh_has_quotes(old.dealer_code, old.deal_id); end if;
  if tg_op in ('INSERT', 'UPDATE') then perform _lead_refresh_has_quotes(new.dealer_code, new.deal_id); end if;
  return null;
end $$;
revoke all on function public.quotations_lead_has_quotes() from public, anon, authenticated, service_role;
drop trigger if exists quotations_lead_has_quotes on public.quotations;
create trigger quotations_lead_has_quotes
  after insert or delete or update of deal_id, dealer_code, status on public.quotations
  for each row execute function public.quotations_lead_has_quotes();

-- คำขอราคา: เกิด / ถูกลบ / ย้ายลีด
create or replace function public.quote_requests_lead_has_quotes() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then perform _lead_refresh_has_quotes(old.dealer_code, old.lead_num_id); end if;
  if tg_op in ('INSERT', 'UPDATE') then perform _lead_refresh_has_quotes(new.dealer_code, new.lead_num_id); end if;
  return null;
end $$;
revoke all on function public.quote_requests_lead_has_quotes() from public, anon, authenticated, service_role;
drop trigger if exists quote_requests_lead_has_quotes on public.quote_requests;
create trigger quote_requests_lead_has_quotes
  after insert or delete or update of lead_num_id, dealer_code, status on public.quote_requests
  for each row execute function public.quote_requests_lead_has_quotes();

-- หน้าเว็บ/คนนอกเขียน has_quotes / reached_step เองไม่ได้ — ยกเว้นตัวคำนวณข้างบน (pms.has_quotes_sync) และงานกู้ข้อมูล (pms.restore)
create or replace function public.leads_has_quotes_guard() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(current_setting('pms.has_quotes_sync', true), '') = '1'
     or coalesce(current_setting('pms.restore', true), '') = '1' then return new; end if;
  if tg_op = 'INSERT' then
    new.has_quotes := _lead_has_quotes(new.dealer_code, new.num_id);
    new.reached_step := _lead_reached_step(new.dealer_code, new.num_id);
  else
    new.has_quotes := old.has_quotes;       -- เงียบ ๆ คงค่าเดิม (แบบ quote_value 0223)
    new.reached_step := old.reached_step;
  end if;
  return new;
end $$;
revoke all on function public.leads_has_quotes_guard() from public, anon, authenticated, service_role;
drop trigger if exists leads_has_quotes_guard on public.leads;
create trigger leads_has_quotes_guard before insert or update on public.leads
  for each row execute function public.leads_has_quotes_guard();

-- ย้ายลีดข้ามสาขา/เปลี่ยนเลข: คำนวณใหม่
create or replace function public.leads_has_quotes_rekey() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  perform _lead_refresh_has_quotes(new.dealer_code, new.num_id);
  return null;
end $$;
revoke all on function public.leads_has_quotes_rekey() from public, anon, authenticated, service_role;
drop trigger if exists leads_has_quotes_rekey on public.leads;
create trigger leads_has_quotes_rekey after update of dealer_code, num_id on public.leads
  for each row execute function public.leads_has_quotes_rekey();

-- เติมค่าให้ลีดที่มีอยู่ (นับก่อน/หลังไว้ตรวจ)
do $$
declare n_after int;
begin
  perform set_config('pms.has_quotes_sync', '1', true);
  update leads l set has_quotes = _lead_has_quotes(l.dealer_code, l.num_id), reached_step = _lead_reached_step(l.dealer_code, l.num_id)
   where l.has_quotes is distinct from _lead_has_quotes(l.dealer_code, l.num_id)
      or l.reached_step is distinct from _lead_reached_step(l.dealer_code, l.num_id);
  perform set_config('pms.has_quotes_sync', '', true);
  select count(*) into n_after from leads where has_quotes;
  raise notice 'ใบ 0258: ลีดที่มีคำขอราคาหรือใบแล้ว % ราย · ขั้นที่ไปถึง %', n_after,
    (select string_agg(format('%s:%s', reached_step, c), ' ') from (select reached_step, count(*) c from leads group by 1 order by 1) x);
end $$;
