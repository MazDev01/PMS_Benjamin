-- ── ใบ 0246: การ์ด KPI 4 ใบทุกหน้า คิดที่ฐานด้วยคำสั่งกลางตัวเดียว (บอสสั่ง 22 ต.ค. 69 · ข้อตัดสิน 22/26/27 ต.ค. 69) ─────────────
--
-- kpi_cards(หน้า, ต้นช่วง, ท้ายช่วง, ดีลเลอร์, วันนี้) → jsonb { <คีย์การ์ด>: ตัวเลข | { ... } }
--   หน้าเว็บทั้งสองแอปเรียกตัวนี้ตัวเดียว (คอมโพเนนต์ KpiCard) — ห้ามคิดการ์ดในเบราว์เซอร์อีก
--   ไม่มีข้อมูล/คิดไม่ได้ = null (หน้าเว็บแสดง "—") ห้ามใส่ 0 ปลอม
-- กติกากลาง (ตรงกับที่อื่นทุกตัว):
--   อัตราปิดการขาย = ลีด PAID ÷ (PAID + CANCELLED) ตามวันที่ลีดเข้ามา (created_date) · lib/winRate.ts · hq_dashboard 0235
--   ยอดขาย = ใบลูกค้า won ตามวันลูกค้าตอบรับ (_hd_won · quotation_won_at 0235) · ไม่นับแถว HQ · ใบถูกแทนที่ไม่นับ (สถานะ superseded)
--   มูลค่าลีด = ยอดก่อน VAT ของใบล่าสุด (leads.quote_value · 0223)
--   "ในช่วงนี้" = p_start..p_end (ตัวกรองช่วงเวลาของหน้า) · หน้าที่ไม่มีตัวกรอง (บันทึก · ลูกค้าทั้งเครือ · ผู้สนใจ · ใบค่าแฟรนไชส์)
--     หน้าเว็บส่งต้นเดือน..วันนี้ และชื่อการ์ดเขียน "เดือนนี้" (บอสตัดสิน 27 ต.ค. 69) · การ์ดอื่น = ณ ตอนนี้
--   ใบใกล้หมดอายุ = วันยืนราคาที่อยู่ในใบ (expiry · ไม่มี = วันที่ใบ + อายุใบของสาขา) เหลือ 0–3 วัน (บอสตัดสิน 26 ต.ค. 69)
--   ปฏิทิน: ทำเสร็จสัปดาห์นี้ = นัดของสัปดาห์นี้ที่สถานะ done (บอสตัดสิน 22 ต.ค. 69) · สัปดาห์ = จันทร์–อาทิตย์
--   ดีลเลอร์เคลื่อนไหว 30 วัน = งานขายของสาขา: เพิ่มลีด/ติดต่อลีด · ทำ/แก้ใบ · ขอราคา (ไม่ใช่การเข้าระบบ · บอสตัดสิน 22 ต.ค. 69) · หน้านี้ไม่มียอดเงิน
--   บันทึกการใช้งาน: ไม่นับบัญชีทดสอบ (_audit_is_test_row 0241: live-*@example.test · ZZT…) · การย้อน/ยกเลิก = เรื่องที่ขึ้นต้น "ย้อน"/"ยกเลิก" ใน audit_log (บอสตัดสิน 26 ต.ค. 69)
--   แผงผู้ใช้ "เข้าระบบใน 30 วัน" = บัญชี HQ ที่เข้าระบบครั้งล่าสุดภายใน 30 วัน (auth.users.last_sign_in_at)
-- สิทธิ์: หน้าดีลเลอร์ = สาขาของผู้เรียกเท่านั้น (auth_dealer · ส่งรหัสสาขาอื่นมาไม่มีผล) · หน้า HQ = is_hq()
-- ข้อทดสอบ: supabase/tests/kpi_cards.sql

/** ใบเสนอราคาหมดอายุวันไหน — ตามที่พิมพ์บนใบ (lib/quotationPrint.ts): expiry ก่อน ไม่มี = วันที่ใบ + อายุใบของสาขา (ตั้งต้น 30) */
create or replace function public._quote_valid_until(q public.quotations) returns date
language sql stable set search_path = public as $$
  select case
    when q.expiry ~ '^\d{4}-\d{2}-\d{2}' then substring(q.expiry, 1, 10)::date
    when q.date ~ '^\d{4}-\d{2}-\d{2}' then substring(q.date, 1, 10)::date
      + coalesce((select nullif(s.document ->> 'validityDays', '')::int from dealer_settings s where s.dealer_code = q.dealer_code), 30)
  end
$$;
revoke all on function public._quote_valid_until(public.quotations) from public, anon, authenticated, service_role;

/** สาขามีงานขายตั้งแต่วันนั้นไหม — ลีดเข้ามา/ติดต่อ · ใบทำ/แก้ · คำขอราคา */
create or replace function public._dealer_active_since(p_dealer text, p_since date) returns boolean
language sql stable set search_path = public as $$
  select exists (select 1 from leads where dealer_code = p_dealer
                    and (created_date >= p_since or last_contact_at >= p_since or (created_at at time zone 'Asia/Bangkok')::date >= p_since))
      or exists (select 1 from quotations where dealer_code = p_dealer
                    and ((created_at at time zone 'Asia/Bangkok')::date >= p_since or (updated_at at time zone 'Asia/Bangkok')::date >= p_since))
      or exists (select 1 from quote_requests where dealer_code = p_dealer and (submitted_at at time zone 'Asia/Bangkok')::date >= p_since)
$$;
revoke all on function public._dealer_active_since(text, date) from public, anon, authenticated, service_role;

create or replace function public.kpi_cards(
  p_page text, p_start date default null, p_end date default null, p_dealer text default null, p_today date default null
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  วันนี้ date := coalesce(p_today, (now() at time zone 'Asia/Bangkok')::date);
  ต้นปี date;
  ต้นสัปดาห์ date;
  ช่วงต้น date := p_start;
  ช่วงท้าย date := p_end;
  สาขา text;
  ได้ int; เสีย int; ส่ง int; เป้า numeric; ยอด numeric;
begin
  ต้นปี := date_trunc('year', วันนี้)::date;
  ต้นสัปดาห์ := วันนี้ - (extract(isodow from วันนี้)::int - 1);
  if (ช่วงต้น is null) <> (ช่วงท้าย is null) or ช่วงท้าย < ช่วงต้น then raise exception 'bad_range: ช่วงเวลาไม่ถูกต้อง'; end if;

  -- ══ หน้าดีลเลอร์ — สาขาของผู้เรียกเท่านั้น (ไม่มีช่วง = ทุกช่วงเวลา) ══
  if p_page like 'dealer.%' then
    สาขา := auth_dealer();
    if coalesce(สาขา, '') = '' or สาขา = 'HQ' then raise exception 'forbidden: เฉพาะดีลเลอร์'; end if;

    if p_page = 'dealer.dashboard' then
      select nullif(coalesce(revenue_target, 0), 0) into เป้า from dealers where code = สาขา;
      select coalesce(sum(w.value), 0) into ยอด from _hd_won(สาขา) w where w.d between ต้นปี and วันนี้;
      select count(*) filter (where status = 'PAID'), count(*) filter (where status = 'CANCELLED') into ได้, เสีย
        from leads where dealer_code = สาขา and (ช่วงต้น is null or created_date between ช่วงต้น and ช่วงท้าย);
      return jsonb_build_object(
        'target',   jsonb_build_object('annual', เป้า, 'ytd', ยอด, 'pct', case when เป้า is null then null else round(100 * ยอด / เป้า) end),
        'pipeline', (select jsonb_build_object('count', count(*), 'value', coalesce(sum(quote_value), 0))
                       from leads where dealer_code = สาขา and status not in ('PAID', 'CANCELLED')),
        'awaiting', (select jsonb_build_object('count', count(*), 'value', coalesce(sum(total_value), 0))
                       from quotations where dealer_code = สาขา and status = 'sent_to_client'),
        'won',      jsonb_build_object('count', ได้, 'lost', เสีย, 'rate', case when ได้ + เสีย = 0 then null else round(100.0 * ได้ / (ได้ + เสีย)) end));

    elsif p_page = 'dealer.leads' then
      return (select jsonb_build_object(
        'open',            count(*) filter (where l.status not in ('PAID', 'CANCELLED')),
        'hqPricing',       count(*) filter (where l.status = 'HQ_PRICING'),
        -- ใบร่างของลีด = กติกาเดียวกับหน้าเว็บ (lib/leadQuote.ts quoteBelongsToLead): ผูกดีล = เลขดีลตรง · ไม่ผูก = ลูกค้าเดียวกัน หรือชื่อบริษัทตรง
        'hqQuotedNoDraft', count(*) filter (where l.status = 'HQ_QUOTED' and not exists (
                              select 1 from quotations q where q.dealer_code = l.dealer_code and q.status = 'draft'
                                 and case when q.deal_id is not null then q.deal_id = l.num_id
                                          else (l.customer_id is not null and q.customer_id = l.customer_id) or q.customer = l.company end)),
        'awaitingClient',  count(*) filter (where l.status in ('QUOTED', 'FOLLOWUP', 'NEGO')))
        from leads l where l.dealer_code = สาขา);

    elsif p_page = 'dealer.quotations' then
      return jsonb_build_object(
        'drafts',   (select count(*) from quotations where dealer_code = สาขา and status = 'draft'),
        'awaiting', (select count(*) from quotations where dealer_code = สาขา and status = 'sent_to_client'),
        'won',      (select jsonb_build_object('count', count(*), 'value', coalesce(sum(w.value), 0))
                       from _hd_won(สาขา) w where ช่วงต้น is null or w.d between ช่วงต้น and ช่วงท้าย),
        'expiring', (select count(*) from quotations q where q.dealer_code = สาขา and q.status = 'sent_to_client'
                       and _quote_valid_until(q) between วันนี้ and วันนี้ + 3));

    elsif p_page = 'dealer.customers' then
      return jsonb_build_object(
        'total',    (select count(*) from customers where dealer_code = สาขา),
        'new',      (select count(*) from customers where dealer_code = สาขา
                       and (ช่วงต้น is null or (created_at at time zone 'Asia/Bangkok')::date between ช่วงต้น and ช่วงท้าย)),
        'sales',    (select coalesce(sum(w.value), 0) from _hd_won(สาขา) w where ช่วงต้น is null or w.d between ช่วงต้น and ช่วงท้าย),
        'openDeal', (select count(distinct customer_id) from leads where dealer_code = สาขา and customer_id is not null
                       and status not in ('PAID', 'CANCELLED')));

    elsif p_page = 'dealer.calendar' then
      return (select jsonb_build_object(
        'today',    count(*) filter (where ว = วันนี้),
        'week',     count(*) filter (where ว between ต้นสัปดาห์ and ต้นสัปดาห์ + 6),
        'overdue',  count(*) filter (where ว < วันนี้ and coalesce(a.status, '') <> 'done'),
        'doneWeek', count(*) filter (where ว between ต้นสัปดาห์ and ต้นสัปดาห์ + 6 and a.status = 'done'))
        from (select status, case when date ~ '^\d{4}-\d{2}-\d{2}' then substring(date, 1, 10)::date end as ว
                from appointments where dealer_code = สาขา) a);
    end if;
    raise exception 'invalid_page: %', p_page;
  end if;

  -- ══ หน้า HQ ══
  if not is_hq() then raise exception 'forbidden: เฉพาะสำนักงานใหญ่'; end if;
  if p_dealer is not null and not exists (select 1 from dealers where code = p_dealer and code <> 'HQ') then
    raise exception 'invalid_dealer: %', p_dealer;
  end if;
  -- การ์ด "ในช่วงนี้" ของหน้า HQ ต้องมีช่วง (หน้าที่ไม่มีตัวกรองส่งเดือนนี้มา)
  if ช่วงต้น is null and p_page not in ('hq.dealers', 'hq.users') then raise exception 'bad_range: ต้องระบุช่วงเวลา'; end if;

  if p_page = 'hq.prospects' then
    return jsonb_build_object(
      'talking',   (select count(*) from dealer_prospects where status in ('new', 'contacted', 'profile_sent', 'meeting', 'considering')),
      'followDue', (select count(*) from dealer_prospects where status in ('new', 'contacted', 'profile_sent', 'meeting', 'considering')
                      and follow_up is not null and follow_up <= วันนี้),
      'proposalWaiting', (select count(*) from dealer_package_proposals where status = 'sent'),
      'converted', (select count(*) from dealer_prospects where status = 'won' and converted_at is not null
                      and (converted_at at time zone 'Asia/Bangkok')::date between ช่วงต้น and ช่วงท้าย));

  elsif p_page = 'hq.proposals' then
    return (select jsonb_build_object(
      'waiting',  (select count(*) from dealer_package_proposals where status = 'sent'),
      'unpaid',   jsonb_build_object('count', count(*) filter (where ค้าง > 0), 'amount', coalesce(sum(ค้าง) filter (where ค้าง > 0), 0)),
      'overdue',  jsonb_build_object('count', count(*) filter (where ค้าง > 0 and payment_due_on < วันนี้),
                                     'amount', coalesce(sum(ค้าง) filter (where ค้าง > 0 and payment_due_on < วันนี้), 0)),
      'paid',     (select jsonb_build_object('count', count(*), 'amount', coalesce(sum(x.amount), 0)) from dealer_proposal_payments x
                    where x.cancelled_at is null and x.paid_on between ช่วงต้น and ช่วงท้าย))
      from (select p.payment_due_on, coalesce(p.amount, 0) - coalesce((select sum(x.amount) from dealer_proposal_payments x
                                                                        where x.proposal_id = p.id and x.cancelled_at is null), 0) as ค้าง
              from dealer_package_proposals p where p.status = 'accepted') y);

  elsif p_page = 'hq.dealers' then
    return (select jsonb_build_object(
      'total',    count(*),
      'active',   count(*) filter (where status = 'active'),
      'moving',   count(*) filter (where _dealer_active_since(code, วันนี้ - 30)),
      'idle',     count(*) filter (where not _dealer_active_since(code, วันนี้ - 30)))
      from dealers where code <> 'HQ');

  elsif p_page = 'hq.pipeline' then
    if p_dealer is null then select annual_target into เป้า from hq_targets where id = 1;
    else select revenue_target into เป้า from dealers where code = p_dealer; end if;
    เป้า := nullif(coalesce(เป้า, 0), 0);
    select count(*) filter (where status = 'PAID'), count(*) filter (where status = 'CANCELLED') into ได้, เสีย
      from leads where dealer_code <> 'HQ' and (p_dealer is null or dealer_code = p_dealer) and created_date between ช่วงต้น and ช่วงท้าย;
    return jsonb_build_object(
      'sales',   jsonb_build_object('value', (select coalesce(sum(w.value), 0) from _hd_won(p_dealer) w where w.d between ช่วงต้น and ช่วงท้าย),
                                    'target', case when เป้า is null then null else round(เป้า * (ช่วงท้าย - ช่วงต้น + 1) / 365) end),
      'winRate', jsonb_build_object('won', ได้, 'lost', เสีย, 'rate', case when ได้ + เสีย = 0 then null else round(100.0 * ได้ / (ได้ + เสีย)) end),
      -- margin เฉลี่ย = ส่วนบวกของใบลูกค้า won ที่ผูกใบ HQ (ตอบรับในช่วง) เป็น % ของราคาขาย · สูตรเดียวกับ hq_overview 0209
      'margin',  (select jsonb_build_object('quotes', count(*), 'pct', case when coalesce(sum(q.total_value), 0) = 0 then null
                           else round(100.0 * (sum(q.total_value) - sum(h.total_cost)) / sum(q.total_value), 1) end)
                    from quotations q join hq_quotes h on h.id = q.hq_quote_id
                    join quotation_won_at w on w.dealer_code = q.dealer_code and w.quote_id = q.id
                   where q.status = 'won' and q.dealer_code <> 'HQ' and (p_dealer is null or q.dealer_code = p_dealer)
                     and (w.won_at at time zone 'Asia/Bangkok')::date between ช่วงต้น and ช่วงท้าย),
      -- ถึงเป้า = ณ ตอนนี้: ยอดตั้งแต่ต้นปี ≥ เป้าทั้งปีของสาขา · นับเฉพาะสาขาที่ตั้งเป้าแล้ว
      'onTarget', (select jsonb_build_object('reached', count(*) filter (where t.ytd >= t.revenue_target), 'of', count(*))
                     from (select x.code, x.revenue_target,
                                  (select coalesce(sum(w.value), 0) from _hd_won(x.code) w where w.d between ต้นปี and วันนี้) as ytd
                             from dealers x where x.code <> 'HQ' and coalesce(x.revenue_target, 0) > 0
                              and (p_dealer is null or x.code = p_dealer)) t));

  elsif p_page = 'hq.leads' then
    return (select jsonb_build_object(
      'open',      count(*) filter (where l.dealer_code <> 'HQ' and l.status not in ('PAID', 'CANCELLED')),
      'new',       count(*) filter (where l.dealer_code <> 'HQ' and l.created_date between ช่วงต้น and ช่วงท้าย),
      'hqWaiting', (select count(*) from leads h where h.dealer_code = 'HQ' and h.status not in ('PAID', 'CANCELLED')),
      'idle',      count(*) filter (where l.dealer_code <> 'HQ' and l.status not in ('PAID', 'CANCELLED')
                                     and coalesce(l.last_contact_at, l.created_date) < วันนี้ - 30))
      from leads l where (p_dealer is null or l.dealer_code = p_dealer));

  elsif p_page = 'hq.quotations' then
    select count(*) filter (where status in ('sent_to_client', 'won', 'lost', 'expired')), count(*) filter (where status = 'won')
      into ส่ง, ได้
      from quotations where dealer_code <> 'HQ' and (p_dealer is null or dealer_code = p_dealer)
       and date ~ '^\d{4}-\d{2}-\d{2}' and substring(date, 1, 10)::date between ช่วงต้น and ช่วงท้าย;
    return jsonb_build_object(
      'sent',       ส่ง,
      'awaiting',   (select count(*) from quotations where dealer_code <> 'HQ' and (p_dealer is null or dealer_code = p_dealer) and status = 'sent_to_client'),
      'won',        (select jsonb_build_object('count', count(*), 'value', coalesce(sum(w.value), 0)) from _hd_won(p_dealer) w where w.d between ช่วงต้น and ช่วงท้าย),
      'acceptRate', case when ส่ง = 0 then null else round(100.0 * ได้ / ส่ง, 1) end);

  elsif p_page = 'hq.customers' then
    return jsonb_build_object(
      'total',   (select count(*) from customers where dealer_code <> 'HQ'),
      'new',     (select count(*) from customers where dealer_code <> 'HQ' and (created_at at time zone 'Asia/Bangkok')::date between ช่วงต้น and ช่วงท้าย),
      'sales',   (select coalesce(sum(w.value), 0) from _hd_won(null) w where w.d between ช่วงต้น and ช่วงท้าย),
      'dealers', jsonb_build_object('with', (select count(distinct c.dealer_code) from customers c join dealers x on x.code = c.dealer_code where c.dealer_code <> 'HQ'),
                                    'of',   (select count(*) from dealers where code <> 'HQ')));

  elsif p_page = 'hq.audit' then
    return (select jsonb_build_object(
      'actionsToday',   count(*) filter (where (a.at at time zone 'Asia/Bangkok')::date = วันนี้),
      'usersToday',     count(distinct a."user") filter (where (a.at at time zone 'Asia/Bangkok')::date = วันนี้),
      'impersonations', count(*) filter (where a.action = 'เข้าระบบแทนดีลเลอร์' and (a.at at time zone 'Asia/Bangkok')::date between ช่วงต้น and ช่วงท้าย),
      'reversals',      count(*) filter (where (a.action like 'ย้อน%' or a.action like 'ยกเลิก%') and (a.at at time zone 'Asia/Bangkok')::date between ช่วงต้น and ช่วงท้าย))
      from audit_log a
     where not _audit_is_test_row(a."user", a.target, a.action));   -- นิยามแถวทดสอบตัวเดียวกับตัวล้างบันทึก (0241)

  elsif p_page = 'hq.users' then
    return (select jsonb_build_object(
      'total',      count(*),
      'active',     count(*) filter (where p.status = 'active'),
      'inactive',   count(*) filter (where p.status <> 'active'),
      'signedIn30', count(*) filter (where u.last_sign_in_at >= now() - interval '30 days'))
      from profiles p left join auth.users u on u.id = p.id
     where p.role in ('SUPER_ADMIN', 'HQ_MANAGEMENT', 'HQ_STAFF'));
  end if;
  raise exception 'invalid_page: %', p_page;
end $$;
revoke all on function public.kpi_cards(text, date, date, text, date) from public, anon, authenticated, service_role;
grant execute on function public.kpi_cards(text, date, date, text, date) to authenticated;
