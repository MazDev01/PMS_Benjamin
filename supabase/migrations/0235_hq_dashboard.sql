-- ── ใบ 0235: แดชบอร์ด HQ แบบเดิม + แถว "วันนี้ต้องทำ" — ตัวเลขทุกตัวคิดที่ฐาน (บอสสั่ง 21 ต.ค. 69) ─────────────────────────────
--
-- ข้อตัดสินของบอส (21 ต.ค. 69):
--   · ยอดขายในช่วงเวลา นับตาม "วันที่ลูกค้าตอบรับ" — เดิมใบไม่มีช่องนี้ จึงเก็บแยกในตาราง quotation_won_at
--       ใบที่ตอบรับไปแล้วก่อนใบนี้: ใช้วันที่ HQ สั่งผลิต (hq_quotes.ordered_at) ถ้าไม่มี (ใบเดิมก่อน Flow ใหม่) ใช้วันที่ออกใบ
--   · การ์ดยอดขายเทียบ "เป้าเฉลี่ยตามช่วง" = เป้าทั้งปี × จำนวนวันของช่วง ÷ 365 (ทั้งเครือ = เป้าที่ตั้งในหน้าตั้งค่า · เลือกดีลเลอร์ = เป้าของสาขา)
--   · แถว "วันนี้ต้องทำ" นับงานค้างทั้งหมดของ HQ — ไม่ขึ้นกับตัวกรองช่วงเวลาและตัวกรองดีลเลอร์
--   · การ์ด "ลูกค้าตอบรับรอสั่งผลิต" ตัดออก — ลูกค้าตอบรับ = HQ สั่งผลิตในจังหวะเดียวกัน (0219) ไม่มีสถานะรอให้นับ
--
-- ตัวคำนวณ hq_dashboard(ช่วง, ดีลเลอร์, วันนี้) ส่งกลับก้อนเดียว:
--   today     งานค้างของ HQ: คำขอราคาที่รอตีราคา (new/pricing) + ที่เลยกำหนด 14 วัน (due_at · นิยามเดียวกับ hq_overview/กระดิ่ง)
--             · ใบค่าแฟรนไชส์ค้างชำระ (ตอบรับแล้ว เลยวันครบกำหนดชำระ ยอดค้าง > 0 · นิยามเดียวกับกระดิ่ง H5 ใบ 0231)
--   cards     ยอดขาย (ใบตอบรับ ฉบับล่าสุด ก่อน VAT · ตามวันตอบรับ) + เป้าตามช่วง · ลีดใหม่ (วันเข้ามา created_date)
--             · ใบเสนอราคาที่ส่งลูกค้า (ไม่นับร่าง/ถูกแทนที่ · ตามวันที่ออกใบ) · ลีดปิดสำเร็จ/ไม่สำเร็จ ของลีดที่เข้ามาในช่วง
--             (อัตราปิดการขายคิดด้วยฟังก์ชันกลาง lib/winRate.ts จากสองตัวเลขนี้)
--   top       ดีลเลอร์ที่มียอดขายในช่วง เรียงมาก → น้อย 10 อันดับ (ไม่มีใครมียอด = แถวว่าง)
--   trend     ยอดขายในช่วง รายเดือน/รายวัน/รายชั่วโมง (ชั่วโมงจากเวลาตอบรับ)
--   monthly   12 เดือนย้อนหลังถึงเดือนของ "วันนี้" (ไม่ขึ้นกับตัวกรองเวลา · ขึ้นกับดีลเลอร์): ลีดใหม่ · ใบ · ใบตอบรับ · ยอดขาย
--             + monthlyTarget = เป้าทั้งปี ÷ 12
--   regions   ดีลเลอร์ตามภาค (จำนวนจากทะเบียน) + ยอดขายในช่วง
--   activity  บันทึกการใช้งานล่าสุด 50 รายการในช่วง — เฉพาะงานของ HQ (ไม่รวมงานขายรายวันของสาขา · เกณฑ์เดียวกับ isDealerSalesAudit)
--             และไม่รวมบัญชีทดสอบ (บัญชีชั่วคราวของ prod-live · อีเมล @example.test · สาขา ZZ* · ข้อมูลป้าย ZZTEST/ZZLOAD/ZZE2E)
-- ทุกส่วนไม่นับแถว HQ (dealers.code = 'HQ' — ไม่ใช่ดีลเลอร์ · lib/hqDealerRow.ts)
-- ข้อทดสอบ: supabase/tests/hq_dashboard.sql · tests/scenario/hq-dashboard.spec.ts

-- ═══ วันที่ลูกค้าตอบรับ ═══
create table if not exists public.quotation_won_at (
  dealer_code text not null,
  quote_id    text not null,
  won_at      timestamptz not null,
  primary key (dealer_code, quote_id),
  foreign key (dealer_code, quote_id) references public.quotations (dealer_code, id) on update cascade on delete cascade
);
alter table public.quotation_won_at enable row level security;
-- อ่าน/เขียนผ่านตัวดักและตัวคำนวณ (security definer) เท่านั้น — ไม่มีนโยบายให้บทบาทใดอ่านตรง
revoke all on table public.quotation_won_at from public, anon, authenticated, service_role;

insert into public.quotation_won_at (dealer_code, quote_id, won_at)
select q.dealer_code, q.id,
       coalesce(h.ordered_at,
                case when q.date ~ '^\d{4}-\d{2}-\d{2}' then (substring(q.date, 1, 10)::date)::timestamp at time zone 'Asia/Bangkok' end,
                q.created_at, now())
  from public.quotations q left join public.hq_quotes h on h.id = q.hq_quote_id
 where q.status = 'won'
on conflict (dealer_code, quote_id) do nothing;

create or replace function public.quotations_won_at_sync() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if new.status = 'won' and (tg_op = 'INSERT' or old.status is distinct from 'won') then
    insert into quotation_won_at (dealer_code, quote_id, won_at) values (new.dealer_code, new.id, now())
      on conflict (dealer_code, quote_id) do update set won_at = excluded.won_at;
  elsif tg_op = 'UPDATE' and old.status = 'won' and new.status is distinct from 'won' then
    delete from quotation_won_at where dealer_code = new.dealer_code and quote_id = new.id;
  end if;
  return null;
end $$;
revoke all on function public.quotations_won_at_sync() from public, anon, authenticated, service_role;
drop trigger if exists quotations_won_at_sync on public.quotations;
create trigger quotations_won_at_sync after insert or update of status on public.quotations
  for each row execute function public.quotations_won_at_sync();

-- ใบตอบรับ (ยอดขาย) พร้อมวัน/ชั่วโมงที่ตอบรับ (เวลาไทย) — ตัวช่วยของ hq_dashboard เท่านั้น
create or replace function public._hd_won(p_dealer text)
  returns table (dealer_code text, value numeric, d date, h int)
  language sql stable security definer set search_path to 'public' as $$
  select q.dealer_code, coalesce(q.total_value, 0), (w.won_at at time zone 'Asia/Bangkok')::date,
         extract(hour from (w.won_at at time zone 'Asia/Bangkok'))::int
    from quotations q join quotation_won_at w on w.dealer_code = q.dealer_code and w.quote_id = q.id
   where q.status = 'won' and q.dealer_code <> 'HQ'
     and (p_dealer is null or q.dealer_code = p_dealer)
$$;
revoke all on function public._hd_won(text) from public, anon, authenticated, service_role;

-- ═══ ตัวคำนวณแดชบอร์ด ═══
create or replace function public.hq_dashboard(p_start date, p_end date, p_dealer text default null, p_today date default null)
  returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  วันนี้ date := coalesce(p_today, (now() at time zone 'Asia/Bangkok')::date);
  วัน int := greatest(1, p_end - p_start + 1);
  เป้าปี numeric;
  ต้นเดือน date;
  งานวันนี้ jsonb; การ์ด jsonb; อันดับ jsonb; แนวโน้ม jsonb; รายเดือน jsonb; ภาค jsonb; กิจกรรม jsonb;
  จำนวนดีลเลอร์ int;
begin
  if not is_hq() then raise exception 'forbidden: เฉพาะสำนักงานใหญ่'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'bad_range: ช่วงเวลาไม่ถูกต้อง'; end if;
  ต้นเดือน := (date_trunc('month', วันนี้) - interval '11 months')::date;

  if p_dealer is null then select annual_target into เป้าปี from hq_targets where id = 1;
  else select revenue_target into เป้าปี from dealers where code = p_dealer; end if;
  เป้าปี := nullif(coalesce(เป้าปี, 0), 0);

  -- ── วันนี้ต้องทำ (ไม่ขึ้นกับตัวกรอง) ──
  select jsonb_build_object(
      'requestsOpen',    (select count(*) from quote_requests where status in ('new', 'pricing')),
      'requestsOverdue', (select count(*) from quote_requests where status in ('new', 'pricing') and now() > due_at),
      'franchiseOverdue', (select jsonb_build_object('count', count(*), 'amount', coalesce(sum(ค้าง), 0),
                                    'ids', coalesce(jsonb_agg(id order by payment_due_on, id), '[]'::jsonb))
                             from (select p.id, p.payment_due_on,
                                          coalesce(p.amount, 0) - coalesce((select sum(amount) from dealer_proposal_payments x
                                                                             where x.proposal_id = p.id and x.cancelled_at is null), 0) as ค้าง
                                     from dealer_package_proposals p
                                    where p.status = 'accepted' and p.payment_due_on is not null
                                      and p.payment_due_on < (now() at time zone 'Asia/Bangkok')::date) y
                            where ค้าง > 0))
    into งานวันนี้;

  -- ── ใบตอบรับ (ยอดขาย) ตามวันตอบรับ · ใบในช่วง · ลีดในช่วง ──
  select jsonb_build_object(
      'sales',      (select coalesce(sum(value), 0) from _hd_won(p_dealer) where d between p_start and p_end),
      'target',     case when เป้าปี is null then null else round(เป้าปี * วัน / 365) end,
      'annualTarget', เป้าปี,
      'days',       วัน,
      'leadsNew',   (select count(*) from leads where dealer_code <> 'HQ' and (p_dealer is null or dealer_code = p_dealer)
                       and created_date between p_start and p_end),
      'quotesSent', (select count(*) from quotations where dealer_code <> 'HQ' and (p_dealer is null or dealer_code = p_dealer)
                       and status in ('sent_to_client', 'won', 'lost', 'expired')
                       and date ~ '^\d{4}-\d{2}-\d{2}' and substring(date, 1, 10)::date between p_start and p_end),
      'closedWon',  (select count(*) from leads where dealer_code <> 'HQ' and (p_dealer is null or dealer_code = p_dealer)
                       and created_date between p_start and p_end and status = 'PAID'),
      'closedLost', (select count(*) from leads where dealer_code <> 'HQ' and (p_dealer is null or dealer_code = p_dealer)
                       and created_date between p_start and p_end and status = 'CANCELLED'))
    into การ์ด;

  -- ── 10 อันดับ: เฉพาะดีลเลอร์ที่มียอดขายในช่วง ──
  select coalesce(jsonb_agg(x order by x.sales desc, x.code), '[]'::jsonb) into อันดับ
    from (select d.code, d.name, s.sales,
                 case when coalesce(d.revenue_target, 0) = 0 then null else round(d.revenue_target * วัน / 365) end as target,
                 (select count(*) from leads l where l.dealer_code = d.code and l.created_date between p_start and p_end and l.status = 'PAID') as "closedWon",
                 (select count(*) from leads l where l.dealer_code = d.code and l.created_date between p_start and p_end and l.status = 'CANCELLED') as "closedLost"
            from (select dealer_code, sum(value) as sales from _hd_won(p_dealer) where d between p_start and p_end group by 1 having sum(value) > 0) s
            join dealers d on d.code = s.dealer_code
           where d.code <> 'HQ'
           order by s.sales desc, d.code limit 10) x;

  select jsonb_build_object(
      'byMonth', coalesce((select jsonb_agg(x order by x.y, x.m) from (
          select extract(year from d)::int as y, extract(month from d)::int - 1 as m, sum(value) as sales
            from _hd_won(p_dealer) where d between p_start and p_end group by 1, 2) x), '[]'::jsonb),
      'byDay',   coalesce((select jsonb_agg(x order by x.d) from (
          select to_char(d, 'YYYY-MM-DD') as d, sum(value) as sales
            from _hd_won(p_dealer) where d between p_start and p_end group by d) x), '[]'::jsonb),
      'byHour',  coalesce((select jsonb_agg(x order by x.h) from (
          select h, sum(value) as sales from _hd_won(p_dealer) where d between p_start and p_end group by h) x), '[]'::jsonb))
    into แนวโน้ม;

  -- ── 12 เดือนย้อนหลัง (ไม่ขึ้นกับตัวกรองเวลา) ──
  select coalesce(jsonb_agg(jsonb_build_object('y', extract(year from m)::int, 'm', extract(month from m)::int - 1,
           'leads',  (select count(*) from leads where dealer_code <> 'HQ' and (p_dealer is null or dealer_code = p_dealer)
                        and created_date >= m and created_date < m + interval '1 month'),
           'quotes', (select count(*) from quotations where dealer_code <> 'HQ' and (p_dealer is null or dealer_code = p_dealer)
                        and status <> 'superseded' and date ~ '^\d{4}-\d{2}-\d{2}'
                        and substring(date, 1, 10)::date >= m and substring(date, 1, 10)::date < m + interval '1 month'),
           'won',    (select count(*) from _hd_won(p_dealer) where d >= m and d < m + interval '1 month'),
           'sales',  (select coalesce(sum(value), 0) from _hd_won(p_dealer) where d >= m and d < m + interval '1 month'))
         order by m), '[]'::jsonb)
    into รายเดือน
    from generate_series(ต้นเดือน, date_trunc('month', วันนี้)::date, interval '1 month') as g(m);

  -- ── ดีลเลอร์ตามภาค ──
  select count(*) into จำนวนดีลเลอร์ from dealers where code <> 'HQ' and (p_dealer is null or code = p_dealer);
  select coalesce(jsonb_agg(x order by x.dealers desc, x.region), '[]'::jsonb) into ภาค
    from (select coalesce(nullif(btrim(d.region), ''), 'ไม่ระบุ') as region, count(*) as dealers,
                 coalesce(sum((select sum(value) from _hd_won(p_dealer) w where w.dealer_code = d.code and w.d between p_start and p_end)), 0) as sales
            from dealers d where d.code <> 'HQ' and (p_dealer is null or d.code = p_dealer)
           group by 1) x;

  -- ── กิจกรรมล่าสุด ──
  select coalesce(jsonb_agg(x order by x.at desc, x.id desc), '[]'::jsonb) into กิจกรรม
    from (select id, "user", action, target, at from audit_log a
           where (a.at at time zone 'Asia/Bangkok')::date between p_start and p_end
             and a.action !~ 'ลูกค้าเป้าหมาย|ใบเสนอราคา|ปิดการขาย'          -- งานขายรายวันของสาขา (isDealerSalesAudit · mock.ts)
             and coalesce(a."user", '') <> 'บัญชีทดสอบชั่วคราว'             -- บัญชีชั่วคราวของ prod-live (tests/prod-live/run.mjs)
             and coalesce(a."user", '') !~* '@example\.test$|^zz'
             and coalesce(a.target, '') !~* 'ZZTEST|ZZLOAD|ZZE2E'
             and coalesce(a.target, '') !~ '(^|[ →])ZZ[A-Z0-9]*( |$)'       -- สาขาทดสอบ ZZ*
           order by a.at desc, a.id desc limit 50) x;

  return jsonb_build_object('today', งานวันนี้, 'cards', การ์ด, 'top', อันดับ, 'trend', แนวโน้ม,
    'monthly', รายเดือน, 'monthlyTarget', case when เป้าปี is null then null else round(เป้าปี / 12) end,
    'regions', ภาค, 'dealerCount', จำนวนดีลเลอร์, 'activity', กิจกรรม);
end $$;
revoke all on function public.hq_dashboard(date, date, text, date) from public, anon, authenticated, service_role;
grant execute on function public.hq_dashboard(date, date, text, date) to authenticated;
