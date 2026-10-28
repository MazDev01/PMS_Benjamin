-- ── 0253: การ์ด "เลยกำหนดยังไม่ปิด" ของปฏิทินดีลเลอร์ ไม่นับนัดที่ยกเลิกแล้ว (ตารางเทียบ FLOW รอบ 5 แถว D19 · 28 ต.ค. 69) ──
-- เหตุ: 0246 นับนัดเลยกำหนดทุกนัดที่ไม่ใช่ 'done' → นัดที่ยกเลิกแล้วถูกนับเป็น "ยังไม่ปิด" (FLOW /calendar: ดู/ทำเสร็จ/ยกเลิก)
--   หน้าเว็บกรองรายการใต้การ์ดด้วยกติกาเดียวกัน (นัดยังเปิด() ใน packages/shared/lib/mock.ts)
-- แก้: สร้างฟังก์ชัน kpi_cards ใหม่จาก 0246 ทั้งตัว — เปลี่ยนเฉพาะเงื่อนไข 'overdue' ของหน้า dealer.calendar · สิทธิ์เหมือนเดิม
-- ข้อทดสอบ: supabase/tests/kpi_cards.sql (นัด ZZK นัด6 ยกเลิกแล้ว) · tests/scenario/calendar-appt-status.spec.ts
create or replace function public.kpi_cards(
  p_page text, p_start date default null, p_end date default null, p_dealer text default null, p_today date default null,
  p_filters jsonb default null
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  วันนี้ date := coalesce(p_today, (now() at time zone 'Asia/Bangkok')::date);
  ต้นปี date;
  ต้นสัปดาห์ date;
  ช่วงต้น date := p_start;
  ช่วงท้าย date := p_end;
  สาขา text;
  ได้ int; เสีย int; ส่ง int; รอ int; เป้า numeric; ยอด numeric;
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  ชุด text[];
  ชุดสาขา text[];
  ชุดจังหวัด text[];
  ชุดสาขาค้น text[];
  ซื้อจาก date;
  ซื้อถึง date;
  จังหวัด text := nullif(btrim(coalesce(f ->> 'province', '')), '');
  ช่องทาง text := nullif(btrim(coalesce(f ->> 'source', '')), '');
  คำค้น text := nullif(lower(btrim(coalesce(f ->> 'search', ''))), '');
begin
  ต้นปี := date_trunc('year', วันนี้)::date;
  ต้นสัปดาห์ := วันนี้ - (extract(isodow from วันนี้)::int - 1);
  if (ช่วงต้น is null) <> (ช่วงท้าย is null) or ช่วงท้าย < ช่วงต้น then raise exception 'bad_range: ช่วงเวลาไม่ถูกต้อง'; end if;
  if jsonb_typeof(f) <> 'object' then raise exception 'bad_filters: ตัวกรองต้องเป็นก้อนข้อมูล'; end if;
  if jsonb_typeof(f -> 'ids') = 'array' then ชุด := array(select jsonb_array_elements_text(f -> 'ids')); end if;
  if jsonb_typeof(f -> 'dealerCodes') = 'array' then ชุดสาขา := array(select jsonb_array_elements_text(f -> 'dealerCodes')); end if;
  if jsonb_typeof(f -> 'searchDealers') = 'array' then ชุดสาขาค้น := array(select jsonb_array_elements_text(f -> 'searchDealers')); end if;
  if jsonb_typeof(f -> 'provinces') = 'array' then ชุดจังหวัด := array(select jsonb_array_elements_text(f -> 'provinces')); end if;

  -- ══ หน้าดีลเลอร์ — สาขาของผู้เรียกเท่านั้น (ไม่มีช่วง = ทุกช่วงเวลา) ══
  if p_page like 'dealer.%' then
    สาขา := auth_dealer();
    if coalesce(สาขา, '') = '' or สาขา = 'HQ' then raise exception 'forbidden: เฉพาะดีลเลอร์'; end if;

    if p_page = 'dealer.dashboard' then
      select nullif(coalesce(revenue_target, 0), 0) into เป้า from dealers where code = สาขา;
      select coalesce(sum(w.value), 0) into ยอด from _kpi_won(สาขา) w where w.d between ต้นปี and วันนี้;
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
        from leads l where l.dealer_code = สาขา and (ชุด is null or l.id = any(ชุด)));

    elsif p_page = 'dealer.quotations' then
      return jsonb_build_object(
        'drafts',   (select count(*) from quotations where dealer_code = สาขา and status = 'draft' and (ชุด is null or id = any(ชุด))),
        'awaiting', (select count(*) from quotations where dealer_code = สาขา and status = 'sent_to_client' and (ชุด is null or id = any(ชุด))),
        'won',      (select jsonb_build_object('count', count(*), 'value', coalesce(sum(w.value), 0))
                       from _kpi_won(สาขา) w where (ช่วงต้น is null or w.d between ช่วงต้น and ช่วงท้าย) and (ชุด is null or w.quote_id = any(ชุด))),
        'expiring', (select count(*) from quotations q where q.dealer_code = สาขา and q.status = 'sent_to_client' and (ชุด is null or q.id = any(ชุด))
                       and _quote_valid_until(q) between วันนี้ and วันนี้ + 3));

    elsif p_page = 'dealer.customers' then
      return jsonb_build_object(
        'total',    (select count(*) from customers where dealer_code = สาขา and (ชุด is null or id::text = any(ชุด))),
        -- ลูกค้าใหม่ = วันที่เป็นลูกค้า (join_date · ช่องเดียวกับที่หน้าเว็บแสดง/กรอง) อยู่ในช่วง
        'new',      (select count(*) from customers where dealer_code = สาขา and join_date ~ '^\d{4}-\d{2}-\d{2}' and (ชุด is null or id::text = any(ชุด))
                       and (ช่วงต้น is null or substring(join_date, 1, 10)::date between ช่วงต้น and ช่วงท้าย)),
        'sales',    (select coalesce(sum(w.value), 0) from _kpi_won(สาขา) w
                      where (ช่วงต้น is null or w.d between ช่วงต้น and ช่วงท้าย) and (ชุด is null or w.customer_id::text = any(ชุด))),
        'openDeal', (select count(distinct customer_id) from leads where dealer_code = สาขา and customer_id is not null
                       and status not in ('PAID', 'CANCELLED') and (ชุด is null or customer_id::text = any(ชุด))));

    elsif p_page = 'dealer.calendar' then
      return (select jsonb_build_object(
        'today',    count(*) filter (where ว = วันนี้),
        'week',     count(*) filter (where ว between ต้นสัปดาห์ and ต้นสัปดาห์ + 6),
        'overdue',  count(*) filter (where ว < วันนี้ and coalesce(a.status, '') not in ('done', 'cancelled')),   -- 0253: นัดที่ยกเลิกแล้วไม่ใช่ "ยังไม่ปิด"
        'doneWeek', count(*) filter (where ว between ต้นสัปดาห์ and ต้นสัปดาห์ + 6 and a.status = 'done'))
        from (select status, case when date ~ '^\d{4}-\d{2}-\d{2}' then substring(date, 1, 10)::date end as ว
                from appointments where dealer_code = สาขา and (ชุด is null or id::text = any(ชุด))) a);
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
      'talking',   (select count(*) from dealer_prospects where status in ('new', 'contacted', 'profile_sent', 'meeting', 'considering')
                      and (ชุด is null or id::text = any(ชุด))),
      'followDue', (select count(*) from dealer_prospects where status in ('new', 'contacted', 'profile_sent', 'meeting', 'considering')
                      and follow_up is not null and follow_up <= วันนี้ and (ชุด is null or id::text = any(ชุด))),
      'proposalWaiting', (select count(*) from dealer_package_proposals where status = 'sent' and (ชุด is null or prospect_id::text = any(ชุด))),
      'converted', (select count(*) from dealer_prospects where status = 'won' and converted_at is not null and (ชุด is null or id::text = any(ชุด))
                      and (converted_at at time zone 'Asia/Bangkok')::date between ช่วงต้น and ช่วงท้าย));

  elsif p_page = 'hq.proposals' then
    return (select jsonb_build_object(
      'waiting',  (select count(*) from dealer_package_proposals where status = 'sent' and (ชุด is null or id::text = any(ชุด))),
      -- ids = เลขใบ ให้หน้าเว็บกรองตารางตรงกับตัวเลข (กดการ์ด) — ฐานตัดสินว่าใบไหนค้าง/เกินกำหนด ไม่คิดซ้ำในเบราว์เซอร์
      'unpaid',   jsonb_build_object('count', count(*) filter (where ค้าง > 0), 'amount', coalesce(sum(ค้าง) filter (where ค้าง > 0), 0),
                                     'ids', coalesce(jsonb_agg(id order by id) filter (where ค้าง > 0), '[]'::jsonb)),
      'overdue',  jsonb_build_object('count', count(*) filter (where ค้าง > 0 and payment_due_on < วันนี้),
                                     'amount', coalesce(sum(ค้าง) filter (where ค้าง > 0 and payment_due_on < วันนี้), 0),
                                     'ids', coalesce(jsonb_agg(id order by id) filter (where ค้าง > 0 and payment_due_on < วันนี้), '[]'::jsonb)),
      'paid',     (select jsonb_build_object('count', count(*), 'amount', coalesce(sum(x.amount), 0),
                                             'ids', coalesce(jsonb_agg(distinct x.proposal_id), '[]'::jsonb)) from dealer_proposal_payments x
                    where x.cancelled_at is null and x.paid_on between ช่วงต้น and ช่วงท้าย and (ชุด is null or x.proposal_id::text = any(ชุด))))
      from (select p.id, p.payment_due_on, coalesce(p.amount, 0) - coalesce((select sum(x.amount) from dealer_proposal_payments x
                                                                              where x.proposal_id = p.id and x.cancelled_at is null), 0) as ค้าง
              from dealer_package_proposals p where p.status = 'accepted' and (ชุด is null or p.id::text = any(ชุด))) y);

  elsif p_page = 'hq.dealers' then
    return (select jsonb_build_object(
      'total',    count(*),
      'active',   count(*) filter (where status = 'active'),
      'moving',   count(*) filter (where เคลื่อนไหว),
      'idle',     count(*) filter (where not เคลื่อนไหว),
      -- รหัสสาขา ให้หน้าเว็บกรองตารางตรงกับตัวเลข (กดการ์ด) — ฐานตัดสินว่าสาขาไหนเคลื่อนไหว
      'movingCodes', coalesce(jsonb_agg(code order by code) filter (where เคลื่อนไหว), '[]'::jsonb),
      'idleCodes',   coalesce(jsonb_agg(code order by code) filter (where not เคลื่อนไหว), '[]'::jsonb))
      from (select code, status, _dealer_active_since(code, วันนี้ - 30) as เคลื่อนไหว from dealers
             where code <> 'HQ' and (ชุด is null or code = any(ชุด))) x);

  elsif p_page = 'hq.pipeline' then
    -- เป้า: ทั้งเครือ = เป้าทั้งเครือ (hq_targets) · เลือกดีลเลอร์/กรองสาขา = ผลรวมเป้าของสาขาที่เหลือ (กติกาเดียวกับหน้าภาพรวมยอดขาย)
    if p_dealer is not null then select revenue_target into เป้า from dealers where code = p_dealer;
    elsif ชุดสาขา is not null then select sum(revenue_target) into เป้า from dealers where code = any(ชุดสาขา) and code <> 'HQ';
    else select annual_target into เป้า from hq_targets where id = 1; end if;
    เป้า := nullif(coalesce(เป้า, 0), 0);
    select count(*) filter (where status = 'PAID'), count(*) filter (where status = 'CANCELLED') into ได้, เสีย
      from leads where dealer_code <> 'HQ' and (p_dealer is null or dealer_code = p_dealer) and (ชุดสาขา is null or dealer_code = any(ชุดสาขา))
       and created_date between ช่วงต้น and ช่วงท้าย;
    return jsonb_build_object(
      'sales',   jsonb_build_object('value', (select coalesce(sum(w.value), 0) from _kpi_won(p_dealer) w
                                               where w.d between ช่วงต้น and ช่วงท้าย and (ชุดสาขา is null or w.dealer_code = any(ชุดสาขา))),
                                    'target', case when เป้า is null then null else round(เป้า * (ช่วงท้าย - ช่วงต้น + 1) / 365) end),
      'winRate', jsonb_build_object('won', ได้, 'lost', เสีย, 'rate', case when ได้ + เสีย = 0 then null else round(100.0 * ได้ / (ได้ + เสีย)) end),
      -- margin เฉลี่ย = ส่วนบวกของใบลูกค้า won ที่ผูกใบ HQ (ตอบรับในช่วง) เป็น % ของราคาขาย · สูตรเดียวกับ hq_overview 0209
      'margin',  (select jsonb_build_object('quotes', count(*), 'pct', case when coalesce(sum(q.total_value), 0) = 0 then null
                           else round(100.0 * (sum(q.total_value) - sum(h.total_cost)) / sum(q.total_value), 1) end)
                    from quotations q join hq_quotes h on h.id = q.hq_quote_id
                    join quotation_won_at w on w.dealer_code = q.dealer_code and w.quote_id = q.id
                   where q.status = 'won' and q.dealer_code <> 'HQ' and (p_dealer is null or q.dealer_code = p_dealer)
                     and (ชุดสาขา is null or q.dealer_code = any(ชุดสาขา))
                     and (w.won_at at time zone 'Asia/Bangkok')::date between ช่วงต้น and ช่วงท้าย),
      -- ถึงเป้า = ณ ตอนนี้: ยอดตั้งแต่ต้นปี ≥ เป้าทั้งปีของสาขา · นับเฉพาะสาขาที่ตั้งเป้าแล้ว
      'onTarget', (select jsonb_build_object('reached', count(*) filter (where t.ytd >= t.revenue_target), 'of', count(*),
                                             'codes', coalesce(jsonb_agg(t.code order by t.code) filter (where t.ytd >= t.revenue_target), '[]'::jsonb))
                     from (select x.code, x.revenue_target,
                                  (select coalesce(sum(w.value), 0) from _kpi_won(x.code) w where w.d between ต้นปี and วันนี้) as ytd
                             from dealers x where x.code <> 'HQ' and coalesce(x.revenue_target, 0) > 0
                              and (p_dealer is null or x.code = p_dealer) and (ชุดสาขา is null or x.code = any(ชุดสาขา))) t));

  elsif p_page = 'hq.leads' then
    return (select jsonb_build_object(
      'open',      count(*) filter (where l.dealer_code <> 'HQ' and l.status not in ('PAID', 'CANCELLED')),
      'new',       count(*) filter (where l.dealer_code <> 'HQ' and l.created_date between ช่วงต้น and ช่วงท้าย),
      'hqWaiting', (select count(*) from leads h where h.dealer_code = 'HQ' and h.status not in ('PAID', 'CANCELLED')),
      -- ไม่เคลื่อนไหวเกิน 30 วัน = กติกาเดียวกับตัวกรอง "ค้างติดตาม" ของรายการลีด (leads_page p_overdue) ที่ 30 วัน:
      --   ยังเปิด ไม่ใช่รอราคา HQ (รอฝั่ง HQ ไม่ใช่ดีลเลอร์เงียบ) · มีวันติดต่อล่าสุด และห่างจากวันนี้เกิน 30 วัน
      'idle',      count(*) filter (where l.dealer_code <> 'HQ' and l.status not in ('PAID', 'CANCELLED', 'HQ_PRICING')
                                     and l.last_contact_at is not null and วันนี้ - l.last_contact_at > 30))
      from leads l
     where (p_dealer is null or l.dealer_code = p_dealer)
       -- ตัวกรองของรายการ = กติกาเดียวกับ leads_page (สาขา · จังหวัด · ช่องทาง · คำค้น)
       and (ชุดสาขา is null or coalesce(l.dealer_code, 'CNX') = any(ชุดสาขา))
       and (จังหวัด is null or l.province = จังหวัด)
       and (ช่องทาง is null or coalesce(nullif(l.source, ''), 'ไม่ระบุ') = ช่องทาง)
       and (คำค้น is null or l.company ilike '%' || คำค้น || '%' or l.contact ilike '%' || คำค้น || '%' or l.province ilike '%' || คำค้น || '%'
            or l.product ilike '%' || คำค้น || '%' or l.assigned ilike '%' || คำค้น || '%' or l.id ilike '%' || คำค้น || '%'
            or l.dealer_code ilike '%' || คำค้น || '%'));

  elsif p_page = 'hq.quotations' then
    -- ตัวกรองของตาราง = กติกาเดียวกับ hq_quotations_summary (0229): สาขา (ดีลเลอร์/ภาค/จังหวัดของดีลเลอร์) · คำค้น (เลขใบ/ลูกค้า/สาขาที่ชื่อตรงคำค้น)
    select count(*) filter (where q.status in ('sent_to_client', 'won', 'lost', 'expired')
                              and q.date ~ '^\d{4}-\d{2}-\d{2}' and substring(q.date, 1, 10)::date between ช่วงต้น and ช่วงท้าย),
           count(*) filter (where q.status = 'won'
                              and q.date ~ '^\d{4}-\d{2}-\d{2}' and substring(q.date, 1, 10)::date between ช่วงต้น and ช่วงท้าย),
           count(*) filter (where q.status = 'sent_to_client')
      into ส่ง, ได้, รอ
      from quotations q
     where q.dealer_code <> 'HQ' and (p_dealer is null or q.dealer_code = p_dealer)
       and (ชุดสาขา is null or coalesce(q.dealer_code, 'CNX') = any(ชุดสาขา))
       and (คำค้น is null or q.id ilike '%' || คำค้น || '%' or q.customer ilike '%' || คำค้น || '%'
            or coalesce(q.dealer_code, 'CNX') = any(coalesce(ชุดสาขาค้น, array[]::text[])));
    return jsonb_build_object(
      'sent',       ส่ง,
      'awaiting',   รอ,
      'won',        (select jsonb_build_object('count', count(*), 'value', coalesce(sum(w.value), 0))
                       from _kpi_won(p_dealer) w join quotations q on q.dealer_code = w.dealer_code and q.id = w.quote_id
                      where w.d between ช่วงต้น and ช่วงท้าย
                        and (ชุดสาขา is null or coalesce(q.dealer_code, 'CNX') = any(ชุดสาขา))
                        and (คำค้น is null or q.id ilike '%' || คำค้น || '%' or q.customer ilike '%' || คำค้น || '%'
                             or coalesce(q.dealer_code, 'CNX') = any(coalesce(ชุดสาขาค้น, array[]::text[])))),
      'acceptRate', case when ส่ง = 0 then null else round(100.0 * ได้ / ส่ง, 1) end);

  elsif p_page = 'hq.customers' then
    -- ตัวกรองของตาราง = กติกาเดียวกับ hq_customers_page (0159): สาขา · จังหวัด (ภาค → จังหวัด) · คำค้น (ชื่อบริษัท/จังหวัด)
    --   · ช่วงที่ซื้อล่าสุด (วันที่ของใบ won ล่าสุดของลูกค้า · ไม่มีใบ = ไม่เข้าเกณฑ์เมื่อเปิดตัวกรองนี้)
    ซื้อจาก := nullif(f ->> 'boughtFrom', '')::date;
    ซื้อถึง := nullif(f ->> 'boughtTo', '')::date;
    return (with ซื้อล่าสุด as (
      select q.dealer_code, q.customer_id, max(substring(q.date, 1, 10)::date) as d
        from quotations q where q.status = 'won' and q.customer_id is not null and q.date ~ '^\d{4}-\d{2}-\d{2}'
       group by 1, 2
    ), ค as (
      select c.* from customers c
        left join ซื้อล่าสุด b on b.dealer_code = c.dealer_code and b.customer_id = c.id
       where c.dealer_code <> 'HQ'
         and (ชุดสาขา is null or c.dealer_code = any(ชุดสาขา))
         and (ชุดจังหวัด is null or c.province = any(ชุดจังหวัด))
         and (คำค้น is null or c.company ilike '%' || คำค้น || '%' or c.province ilike '%' || คำค้น || '%')
         and (ซื้อจาก is null or b.d >= ซื้อจาก) and (ซื้อถึง is null or b.d <= ซื้อถึง)
    ), ขาย as (
      -- ไม่มีตัวกรองลูกค้า = ใบ won ทุกใบ (รวมใบที่ไม่ผูกลูกค้า) · มีตัวกรอง = เฉพาะใบของลูกค้าที่ผ่านตัวกรอง
      select w.customer_id, coalesce(nullif(ค.company, ''), ค.name, q.customer) as company, w.dealer_code, sum(w.value) as value
        from _kpi_won(null) w join quotations q on q.dealer_code = w.dealer_code and q.id = w.quote_id
        left join ค on ค.id = w.customer_id and ค.dealer_code = w.dealer_code
       where w.d between ช่วงต้น and ช่วงท้าย
         and (ชุดสาขา is null or w.dealer_code = any(ชุดสาขา))
         and (ชุดจังหวัด is null and คำค้น is null and ซื้อจาก is null and ซื้อถึง is null or ค.id is not null)
       group by 1, 2, 3
    )
    select jsonb_build_object(
      'total',   (select count(*) from ค),
      'new',     (select count(*) from ค where join_date ~ '^\d{4}-\d{2}-\d{2}' and substring(join_date, 1, 10)::date between ช่วงต้น and ช่วงท้าย),
      'sales',   (select coalesce(sum(value), 0) from ขาย),
      'dealers', jsonb_build_object('with', (select count(distinct ค.dealer_code) from ค join dealers x on x.code = ค.dealer_code),
                                    'of',   (select count(*) from dealers where code <> 'HQ' and (ชุดสาขา is null or code = any(ชุดสาขา)))),
      -- รายชื่อให้หน้าเว็บแสดงเมื่อกดการ์ด (ตารางหลักแบ่งหน้าที่ฐาน กรองวันที่เป็นลูกค้าไม่ได้) · ไม่เกิน 100 ราย
      'newList', (select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'company', coalesce(nullif(n.company, ''), n.name), 'dealerCode', n.dealer_code,
                                                            'joinDate', substring(n.join_date, 1, 10)) order by n.join_date desc, n.id desc), '[]'::jsonb)
                    from (select * from ค where join_date ~ '^\d{4}-\d{2}-\d{2}' and substring(join_date, 1, 10)::date between ช่วงต้น and ช่วงท้าย
                           order by join_date desc, id desc limit 100) n),
      'salesList', (select coalesce(jsonb_agg(jsonb_build_object('id', s.customer_id, 'company', s.company, 'dealerCode', s.dealer_code, 'value', s.value)
                                              order by s.value desc, s.customer_id), '[]'::jsonb)
                      from (select * from ขาย order by value desc limit 100) s)));

  elsif p_page = 'hq.audit' then
    return (select jsonb_build_object(
      'actionsToday',   count(*) filter (where (a.at at time zone 'Asia/Bangkok')::date = วันนี้),
      'usersToday',     count(distinct a."user") filter (where (a.at at time zone 'Asia/Bangkok')::date = วันนี้),
      'impersonations', count(*) filter (where a.action = 'เข้าระบบแทนดีลเลอร์' and (a.at at time zone 'Asia/Bangkok')::date between ช่วงต้น and ช่วงท้าย),
      'reversals',      count(*) filter (where (a.action like 'ย้อน%' or a.action like 'ยกเลิก%') and (a.at at time zone 'Asia/Bangkok')::date between ช่วงต้น and ช่วงท้าย))
      from audit_log a
     where not _audit_is_test_row(a."user", a.target, a.action)   -- นิยามแถวทดสอบตัวเดียวกับตัวล้างบันทึก (0241)
       and (ชุด is null or a.id::text = any(ชุด)));

  elsif p_page = 'hq.users' then
    return (select jsonb_build_object(
      'total',      count(*),
      'active',     count(*) filter (where p.status = 'active'),
      'inactive',   count(*) filter (where p.status <> 'active'),
      'signedIn30', count(*) filter (where u.last_sign_in_at >= now() - interval '30 days'))
      from profiles p left join auth.users u on u.id = p.id
     where p.role in ('SUPER_ADMIN', 'HQ_MANAGEMENT', 'HQ_STAFF') and (ชุด is null or p.id::text = any(ชุด)));
  end if;
  raise exception 'invalid_page: %', p_page;
end $$;
revoke all on function public.kpi_cards(text, date, date, text, date, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.kpi_cards(text, date, date, text, date, jsonb) to authenticated;
