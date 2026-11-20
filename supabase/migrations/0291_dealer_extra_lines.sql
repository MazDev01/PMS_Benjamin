-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ใบ 0291: รายการของดีลเลอร์ในใบเสนอราคาที่ทำจากใบ HQ (บอสสั่ง 20 พ.ย. 69 · ทับคำตัดสิน "ใบใหม่ = รายการใบ HQ + % เท่านั้น")
--   เหตุผลบอส: "ดีลเลอร์ซื้อโครงที่เรา แต่สั่งทำผนัง/หลังคาเอง" → ใบลูกค้าเพิ่มแถวของดีลเลอร์เองได้ (ราคาขายกรอกเอง)
--   1) quotations.hq_lines_value (ใหม่ · ว่างได้) = ยอดเฉพาะแถวจากใบ HQ · ใบเก่าว่าง = เท่ากับ total_value (ไม่แปลงข้อมูล)
--   2) quotations_hq_apply_markup: แถวจากใบ HQ ประกอบเหมือนเดิม + ต่อท้ายแถว source = 'dealer' (ตรวจ ชื่อ/จำนวน/ราคา · ≤ 50 แถว)
--      ยอดใบ (total_value) = ทั้งสองส่วน · เดิมแถวที่หน้าจอส่งเพิ่มถูกทิ้งเงียบ ๆ
--   3) ส่วนต่างกำไร: ฿ = คิดจากแถวใบ HQ เท่านั้น (แถวของดีลเลอร์ไม่มีต้นทุน → นับเป็นส่วนต่าง 0) · % = ฿ ÷ ยอดขายทั้งใบ
--      ทำโดยนับแถวของดีลเลอร์เป็นต้นทุนเท่าราคาขาย ใน 5 คำสั่งที่คิดส่วนต่าง (นิยามล่าสุดทุกบรรทัด เปลี่ยนเฉพาะนิพจน์ต้นทุน):
--      kpi_cards (hq.pipeline margin) · hq_quote_margins (ส่วนต่างรายใบ) · hq_pipeline_dealers · hq_pipeline_months · hq_overview
--      ยอดขายทุกที่ = ทั้งใบ (ไม่เปลี่ยน) · ใบเก่า: ส่วนต่างเท่าเดิมทุกตัว (hq_lines_value ว่าง → นิพจน์ = ต้นทุน HQ เดิม)
--   สิทธิ์: create or replace คงสิทธิ์เดิมทุกคำสั่ง · ไม่มีคำสั่งใหม่
--   ข้อทดสอบ: supabase/tests/dealer_extra_lines.sql · หน้าเว็บ dealer-extra-lines.spec
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

alter table public.quotations add column if not exists hq_lines_value numeric;
comment on column public.quotations.hq_lines_value is 'ยอดเฉพาะแถวจากใบ HQ (ใบ 0291) · ว่าง = ใบเก่า/ใบไม่ผูกใบ HQ = เท่ากับ total_value';

-- ═══ 2. ตัวดักประกอบรายการใบลูกค้า ═══
CREATE OR REPLACE FUNCTION public.quotations_hq_apply_markup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  h       hq_quotes;
  v_out   jsonb := '[]'::jsonb;
  v_sum   numeric := 0;
  v_line  jsonb;
  v_pct   numeric;
  v_price numeric;
  v_i     integer := 0;
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_hq    numeric;
  v_n     integer := 0;
  v_name  text;
  v_qty   numeric;
begin
  if new.hq_quote_id is null then return new; end if;
  -- ใบที่จบแล้วไม่คำนวณใหม่ (ราคาต้องนิ่งตามที่ปิดไว้ · ใบหมดอายุเพราะเปลี่ยนเวอร์ชันก็เช่นกัน)
  if tg_op = 'UPDATE' and old.status in ('won', 'lost', 'expired') and new.status = old.status then return new; end if;

  select * into h from hq_quotes where id = new.hq_quote_id;
  if not found then return new; end if;   -- ตัวดัก quotations_hq_link_guard แจ้งให้แล้ว

  if new.markup_percent is not null and new.markup_percent < 0 then
    raise exception 'markup_negative: %% ที่บวกต้องไม่ติดลบ — ขายต่ำกว่าต้นทุนจากสำนักงานใหญ่ไม่ได้';
  end if;

  for v_line in select * from jsonb_array_elements(h.line_items) loop
    v_pct := coalesce(nullif(new.line_items -> v_i ->> 'markupPct', '')::numeric, new.markup_percent, 0);
    if v_pct < 0 then
      raise exception 'markup_negative: %% ที่บวกต้องไม่ติดลบ (รายการ "%")', v_line ->> 'name';
    end if;
    v_price := round((v_line ->> 'unitCost')::numeric * (1 + v_pct / 100), 2);
    v_out := v_out || jsonb_build_object(
      'name', v_line ->> 'name', 'qty', (v_line ->> 'qty')::numeric, 'unit', coalesce(v_line ->> 'unit', ''),
      'unitPrice', v_price, 'markupPct', v_pct);
    v_sum := v_sum + round((v_line ->> 'qty')::numeric * v_price, 2);
    v_i := v_i + 1;
  end loop;

  -- ── รายการของดีลเลอร์ (ใบ 0291 · บอสสั่ง 20 พ.ย. 69 "ดีลเลอร์ซื้อโครงที่เรา แต่สั่งทำผนัง/หลังคาเอง") ──
  --   แถวที่หน้าจอส่งมาพร้อม source = 'dealer' ต่อท้ายแถวจากใบ HQ: ชื่อ · จำนวน · หน่วย · ราคาขาย/หน่วย ที่ดีลเลอร์กรอกเอง
  --   ไม่มีต้นทุน HQ / ไม่มี % บวก · แถวจากใบ HQ ยังประกอบจากใบ HQ อย่างเดียวเหมือนเดิม (แก้ได้แค่ %)
  v_hq := v_sum;
  for v_line in select * from jsonb_array_elements(coalesce(new.line_items, '[]'::jsonb)) loop
    continue when coalesce(v_line ->> 'source', '') <> 'dealer';
    v_n := v_n + 1;
    if v_n > 50 then raise exception 'dealer_lines_limit: รายการของดีลเลอร์ได้ไม่เกิน 50 แถว'; end if;
    v_name := left(btrim(coalesce(v_line ->> 'name', '')), 200);
    if v_name = '' then raise exception 'dealer_line_invalid: รายการของดีลเลอร์ต้องมีชื่อ'; end if;
    begin
      v_qty := (v_line ->> 'qty')::numeric;
      v_price := round((v_line ->> 'unitPrice')::numeric, 2);
    exception when others then raise exception 'dealer_line_invalid: จำนวน/ราคาของ "%" ไม่ใช่ตัวเลข', v_name; end;
    if v_qty is null or v_qty <= 0 then raise exception 'dealer_line_invalid: จำนวนของ "%" ต้องมากกว่า 0', v_name; end if;
    if v_price is null or v_price < 0 or v_price > 100000000 then
      raise exception 'dealer_line_invalid: ราคาขายต่อหน่วยของ "%" ต้องอยู่ระหว่าง 0 ถึง 100 ล้าน', v_name;
    end if;
    v_out := v_out || jsonb_build_object('source', 'dealer', 'name', v_name, 'qty', v_qty,
      'unit', left(btrim(coalesce(v_line ->> 'unit', '')), 30), 'unitPrice', v_price);
    v_sum := v_sum + round(v_qty * v_price, 2);
  end loop;

  new.line_items     := v_out;
  new.total_value    := v_sum;
  new.hq_lines_value := v_hq;            -- ยอดเฉพาะแถวจากใบ HQ — ส่วนต่างกำไรคิดจากส่วนนี้ (ใบ 0291)
  new.material_cost := h.total_cost;      -- ต้นทุนรวมจากใบ HQ — ให้สำนักงานใหญ่ดู margin ได้จากใบเดียว

  -- อายุใบลูกค้าไม่เกินวันยืนราคาของใบ HQ: ไม่ใส่หรือใส่เกิน = ใช้วันของใบ HQ
  if new.status in ('draft', 'sent_to_client') and h.valid_until is not null then
    if new.expiry is null or new.expiry !~ '^\d{4}-\d{2}-\d{2}$' or new.expiry::date > h.valid_until then
      new.expiry := to_char(h.valid_until, 'YYYY-MM-DD');
    end if;
  end if;

  -- ใบ HQ หมดอายุแล้ว: ส่งให้ลูกค้าไม่ได้ ปิดการขายไม่ได้ — ต้องขอราคาใหม่
  if new.status in ('sent_to_client', 'won')
     and (tg_op = 'INSERT' or new.status is distinct from old.status)
     and h.valid_until is not null and h.valid_until < v_today then
    raise exception 'hq_quote_expired: ใบ HQ % หมดอายุแล้ว (ยืนราคาถึง %) — ขอแก้ราคาเพื่อรับใบใหม่ก่อน',
      h.quote_no, to_char(h.valid_until, 'YYYY-MM-DD');
  end if;
  return new;
end $function$;

-- ═══ 3. ส่วนต่างกำไร: แถวของดีลเลอร์ = ส่วนต่าง 0 ═══
CREATE OR REPLACE FUNCTION public.kpi_cards(p_page text, p_start date DEFAULT NULL::date, p_end date DEFAULT NULL::date, p_dealer text DEFAULT NULL::text, p_today date DEFAULT NULL::date, p_filters jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  วันนี้ date := coalesce(p_today, (now() at time zone 'Asia/Bangkok')::date);
  ต้นปี date;
  ต้นสัปดาห์ date;
  ช่วงต้น date := p_start;
  ช่วงท้าย date := p_end;
  สาขา text;
  ได้ int; เสีย int; ส่ง int; รอ int; เป้า numeric; ยอด numeric; เป้าช่วง numeric;
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
        'awaitingClient',  count(*) filter (where l.status in ('QUOTED', 'FOLLOWUP', 'NEGO')),
        -- ขั้นเสนอราคาลูกค้า (ใบ 0284 · ยุบ 2 ขั้นเดิม 9 พ.ย. 69) = ได้ราคา HQ + มีใบร่าง (กติกาเดียวกับ hqQuotedNoDraft) + ส่งใบแล้ว
        'quoteStage',      count(*) filter (where l.status = 'QUOTED' or (l.status = 'HQ_QUOTED' and exists (
                              select 1 from quotations q where q.dealer_code = l.dealer_code and q.status = 'draft'
                                 and case when q.deal_id is not null then q.deal_id = l.num_id
                                          else (l.customer_id is not null and q.customer_id = l.customer_id) or q.customer = l.company end))))
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
      -- ไม่ได้ติดต่อ 14 วัน (บอสสั่ง 1 พ.ย. 69 · แทน "รอตอบใบค่าแฟรนไชส์") = สูตรเดียวกับตัวกรอง idle14 ของหน้าผู้สนใจ (prospectJourney.ไม่ได้ติดต่อเกิน):
      --   ยังติดตามอยู่ (ไม่ใช่ won/lost) · นับจากติดต่อล่าสุด ไม่เคยติดต่อ = วันเพิ่มรายชื่อ · วันตามเวลาไทย · ห่าง ≥ 14 วัน
      'idle14',    (select count(*) from dealer_prospects where status not in ('won', 'lost')
                      and (coalesce(last_contact_at, created_at) at time zone 'Asia/Bangkok')::date <= วันนี้ - 14
                      and (ชุด is null or id::text = any(ชุด))),
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
             where code not in ('HQ', 'HQD') and (ชุด is null or code = any(ชุด))) x);   -- ทะเบียนดีลเลอร์ไม่นับ HQD (ใบ 0287)

  elsif p_page = 'hq.pipeline' then
    -- เป้า (ใบ 0283 · บอสสั่ง 9 พ.ย. 69 ทับข้อตัดสิน 22 ต.ค. 69): ทั้งเครือ = ผลรวมเป้าสาขาอัตโนมัติ (ไม่ใช้ hq_targets แล้ว)
    --   เป้าตามช่วง = ผลรวมเป้าตามช่วงรายสาขา (ตัวกลาง _network_target) = ผลรวมคอลัมน์เป้าในตารางผลงาน (hq_pipeline_dealers) เสมอ
    select t.annual, t.period into เป้า, เป้าช่วง
      from _network_target(case when p_dealer is not null then array[p_dealer] else ชุดสาขา end, ช่วงท้าย - ช่วงต้น + 1) t;
    select count(*) filter (where status = 'PAID'), count(*) filter (where status = 'CANCELLED') into ได้, เสีย
      from leads where dealer_code <> 'HQ' and (p_dealer is null or dealer_code = p_dealer) and (ชุดสาขา is null or dealer_code = any(ชุดสาขา))
       and created_date between ช่วงต้น and ช่วงท้าย;
    return jsonb_build_object(
      'sales',   jsonb_build_object('value', (select coalesce(sum(w.value), 0) from _kpi_won(p_dealer) w
                                               where w.d between ช่วงต้น and ช่วงท้าย and (ชุดสาขา is null or w.dealer_code = any(ชุดสาขา))),
                                    'target', เป้าช่วง),
      'winRate', jsonb_build_object('won', ได้, 'lost', เสีย, 'rate', case when ได้ + เสีย = 0 then null else round(100.0 * ได้ / (ได้ + เสีย)) end),
      -- margin เฉลี่ย = ส่วนบวกของใบลูกค้า won ที่ผูกใบ HQ (ตอบรับในช่วง) เป็น % ของราคาขาย · สูตรเดียวกับ hq_overview 0209
      'margin',  (select jsonb_build_object('quotes', count(*), 'pct', case when coalesce(sum(q.total_value), 0) = 0 then null
                           else round(100.0 * (sum(q.total_value) - sum(h.total_cost + q.total_value - coalesce(q.hq_lines_value, q.total_value))) / sum(q.total_value), 1) end)
                    from quotations q join hq_quotes h on h.id = q.hq_quote_id
                    join quotation_won_at w on w.dealer_code = q.dealer_code and w.quote_id = q.id
                   where q.status = 'won' and q.dealer_code <> 'HQ' and (p_dealer is null or q.dealer_code = p_dealer)
                     and (ชุดสาขา is null or q.dealer_code = any(ชุดสาขา))
                     and (w.won_at at time zone 'Asia/Bangkok')::date between ช่วงต้น and ช่วงท้าย),
      -- ถึงเป้า (ใบ 0283 · บอสสั่ง 9 พ.ย. 69) = ยอดในช่วงที่เลือก ≥ เป้าตามช่วงของสาขา (เป้าปี × วัน ÷ 365) — ช่วงเดียวกับการ์ด
      --   ตรงแผงรายชื่อ + คอลัมน์ onTarget ของ hq_pipeline_dealers · นับเฉพาะสาขาที่ตั้งเป้า · (แดชบอร์ดดีลเลอร์ยังเทียบต้นปี/ทั้งปี ไม่แตะ)
      'onTarget', (select jsonb_build_object('reached', count(*) filter (where t.sales >= t.target), 'of', count(*),
                                             'codes', coalesce(jsonb_agg(t.code order by t.code) filter (where t.sales >= t.target), '[]'::jsonb))
                     from (select x.code, round(x.revenue_target * (ช่วงท้าย - ช่วงต้น + 1) / 365) as target,
                                  (select coalesce(sum(w.value), 0) from _kpi_won(x.code) w where w.d between ช่วงต้น and ช่วงท้าย) as sales
                             from dealers x where x.code not in ('HQ', 'HQD') and coalesce(x.revenue_target, 0) > 0
                              and (p_dealer is null or x.code = p_dealer) and (ชุดสาขา is null or x.code = any(ชุดสาขา))) t));

  -- ══ 3 หน้าเจาะลึก (ใบ 0271 · บอสสั่ง 2 พ.ย. 69): การ์ด = ผลรวมแถวรายดีลเลอร์ของ hq_drill ชุดเดียวกับตาราง/แผงที่มา ══
  --   ตัวกรองที่ใช้ = สาขา (p_dealer · dealerCodes) เท่านั้น — ระดับ ภูมิภาค/จังหวัด/ดีลเลอร์ ของหน้าส่งมาเป็นชุดสาขา · ไม่นับแถว HQ
  elsif p_page in ('hq.leads', 'hq.quotations', 'hq.customers') then
    if ช่วงต้น is null then raise exception 'bad_range: ต้องระบุช่วงเวลา'; end if;
    return (with ร as (
      select r from jsonb_array_elements(hq_drill(substring(p_page from 4), ช่วงต้น, ช่วงท้าย, วันนี้) -> 'dealers') r
       where (p_dealer is null or r->>'code' = p_dealer) and (ชุดสาขา is null or r->>'code' = any(ชุดสาขา))
    ), ส as (
      select coalesce(sum((r->>'leads')::int), 0) as leads, coalesce(sum((r->>'open')::int), 0) as open, coalesce(sum((r->>'qr')::int), 0) as qr,
             coalesce(sum((r->>'stale')::int), 0) as stale, coalesce(sum((r->>'sent')::int), 0) as sent, coalesce(sum((r->>'wait')::int), 0) as wait,
             coalesce(sum((r->>'won')::int), 0) as won, coalesce(sum((r->>'sales')::numeric), 0) as sales,
             coalesce(sum((r->>'cust')::int), 0) as cust, coalesce(sum((r->>'newc')::int), 0) as newc,
             count(*) filter (where (r->>'cust')::int > 0 and r->>'code' <> 'HQD') as withc, count(*) filter (where r->>'code' <> 'HQD') as n   -- ดีลเลอร์ที่มีลูกค้า/ทั้งหมด ไม่นับ HQD
        from ร)
    select case p_page
      when 'hq.leads' then jsonb_build_object('open', open, 'new', leads, 'qr', qr, 'idle', stale)
      when 'hq.quotations' then jsonb_build_object('sent', sent, 'awaiting', wait, 'won', jsonb_build_object('count', won, 'value', sales),
                                                   'acceptRate', case when sent = 0 then null else round(100.0 * won / sent, 1) end)
      else jsonb_build_object('total', cust, 'new', newc, 'dealers', jsonb_build_object('with', withc, 'of', n)) end
      from ส);

  elsif p_page = 'hq.audit' then
    return (select jsonb_build_object(
      'actionsToday',   count(*) filter (where (a.at at time zone 'Asia/Bangkok')::date = วันนี้),
      'usersToday',     count(distinct a."user") filter (where (a.at at time zone 'Asia/Bangkok')::date = วันนี้),
      'impersonations', count(*) filter (where a.action = 'เข้าระบบแทนดีลเลอร์' and (a.at at time zone 'Asia/Bangkok')::date between ช่วงต้น and ช่วงท้าย),
      'reversals',      count(*) filter (where (a.action like 'ย้อน%' or a.action like 'ยกเลิก%') and (a.at at time zone 'Asia/Bangkok')::date between ช่วงต้น and ช่วงท้าย))
      from audit_log_hq a                                          -- เฉพาะที่คนของ HQ ทำ (ใบ 0274 · ชุดเดียวกับตาราง/ส่งออกของหน้า)
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
end $function$;

CREATE OR REPLACE FUNCTION public.hq_quote_margins(p_dealers text[], p_ids text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_hq() then raise exception 'forbidden: เฉพาะสำนักงานใหญ่'; end if;
  if coalesce(array_length(p_dealers, 1), 0) <> coalesce(array_length(p_ids, 1), 0) then
    raise exception 'bad_keys: รหัสสาขากับเลขที่ใบต้องจำนวนเท่ากัน';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'dealer', q.dealer_code, 'id', q.id, 'hqQuoteNo', h.quote_no,
             'hqCost', h.total_cost, 'sale', q.total_value, 'baht', coalesce(q.hq_lines_value, q.total_value) - h.total_cost,
             'pct', case when coalesce(q.total_value, 0) = 0 then null
                         else round(100.0 * (coalesce(q.hq_lines_value, q.total_value) - h.total_cost) / q.total_value, 1) end)
           order by k.n)
      from unnest(p_dealers, p_ids) with ordinality as k(dealer, id, n)
      join quotations q on q.dealer_code = k.dealer and q.id = k.id
      join hq_quotes h on h.id = q.hq_quote_id), '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.hq_pipeline_dealers(p_start date, p_end date, p_dealers text[] DEFAULT NULL::text[], p_today date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  วันนี้ date := coalesce(p_today, (now() at time zone 'Asia/Bangkok')::date);
  ต้นปี date := date_trunc('year', coalesce(p_today, (now() at time zone 'Asia/Bangkok')::date))::date;
begin
  if not is_hq() then raise exception 'forbidden: เฉพาะสำนักงานใหญ่'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'bad_range: ช่วงเวลาไม่ถูกต้อง'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'code', d.code, 'name', d.name, 'region', d.region, 'province', d.province, 'status', d.status,
             'leads', ล.leads, 'quotes', ใบ.n, 'latest', ใบ.latest,
             'won', ล.won, 'lost', ล.lost,
             'rate', case when ล.won + ล.lost = 0 then null else round(100.0 * ล.won / (ล.won + ล.lost)) end,
             'sales', ข.sales,
             'annualTarget', nullif(coalesce(d.revenue_target, 0), 0),
             'target', case when coalesce(d.revenue_target, 0) = 0 then null else round(d.revenue_target * (p_end - p_start + 1) / 365) end,
             'pct', case when coalesce(d.revenue_target, 0) = 0 then null
                         else round(100.0 * ข.sales / nullif(round(d.revenue_target * (p_end - p_start + 1) / 365), 0)) end,
             'marginSale', ม.sale, 'marginCost', ม.cost, 'marginQuotes', ม.n,
             'marginPct', case when ม.sale = 0 then null else round(100.0 * (ม.sale - ม.cost) / ม.sale, 1) end,
             'ytd', ข.ytd,
             'onTarget', coalesce(d.revenue_target, 0) > 0 and ข.sales >= round(d.revenue_target * (p_end - p_start + 1) / 365))   -- ใบ 0283: ยอดในช่วง ≥ เป้าตามช่วง (ตรงการ์ด)
           order by ข.sales desc, d.code)
      from dealers d
      cross join lateral (select count(*) as leads, count(*) filter (where l.status = 'PAID') as won, count(*) filter (where l.status = 'CANCELLED') as lost
                            from leads l where l.dealer_code = d.code and l.created_date between p_start and p_end) ล
      cross join lateral (select count(*) filter (where _q_report_date('sent', null, q.date) between p_start and p_end) as n,
                                 max(_q_report_date('sent', null, q.date)) as latest   -- วันออกใบ (ข้อความ YYYY-MM-DD · ตัวแปลงกลาง ใบ 0260)
                            from quotations q where q.dealer_code = d.code and q.status::text not in ('draft', 'superseded')) ใบ
      cross join lateral (select (select coalesce(sum(w.value), 0) from _kpi_won(d.code) w where w.d between p_start and p_end) as sales,
                                 (select coalesce(sum(w.value), 0) from _kpi_won(d.code) w where w.d between ต้นปี and วันนี้) as ytd) ข
      cross join lateral (select coalesce(sum(q.total_value), 0) as sale, coalesce(sum(h.total_cost + q.total_value - coalesce(q.hq_lines_value, q.total_value)), 0) as cost, count(*) as n
                            from quotations q join hq_quotes h on h.id = q.hq_quote_id
                            join quotation_won_at w on w.dealer_code = q.dealer_code and w.quote_id = q.id
                           where q.status = 'won' and q.dealer_code = d.code
                             and (w.won_at at time zone 'Asia/Bangkok')::date between p_start and p_end) ม
     where d.code <> 'HQ' and (p_dealers is null or d.code = any(p_dealers))), '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.hq_pipeline_months(p_start date, p_end date, p_dealers text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_hq() then raise exception 'forbidden: เฉพาะสำนักงานใหญ่'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'bad_range: ช่วงเวลาไม่ถูกต้อง'; end if;
  return coalesce((
    with ดีล as (select d.code, nullif(coalesce(d.revenue_target, 0), 0) as annual from dealers d
                 where d.code <> 'HQ' and (p_dealers is null or d.code = any(p_dealers))),
    เรื่อง as (
      select l.dealer_code as code, date_trunc('month', l.created_date)::date as mo, 1 as leads, 0 as quotes,
             (l.status = 'PAID')::int as won, (l.status = 'CANCELLED')::int as lost, 0::numeric as sales, 0::numeric as msale, 0::numeric as mcost, 0 as mq
        from leads l join ดีล on ดีล.code = l.dealer_code where l.created_date between p_start and p_end
      union all
      select q.dealer_code, date_trunc('month', _q_report_date('sent', null, q.date))::date, 0, 1, 0, 0, 0, 0, 0, 0
        from quotations q join ดีล on ดีล.code = q.dealer_code
       where q.status::text not in ('draft', 'superseded') and _q_report_date('sent', null, q.date) between p_start and p_end
      union all
      select ดีล.code, date_trunc('month', w.d)::date, 0, 0, 0, 0, w.value, 0, 0, 0
        from ดีล cross join lateral _kpi_won(ดีล.code) w where w.d between p_start and p_end
      union all
      select q.dealer_code, date_trunc('month', (w.won_at at time zone 'Asia/Bangkok')::date)::date, 0, 0, 0, 0, 0, q.total_value, h.total_cost + q.total_value - coalesce(q.hq_lines_value, q.total_value), 1
        from quotations q join ดีล on ดีล.code = q.dealer_code join hq_quotes h on h.id = q.hq_quote_id
        join quotation_won_at w on w.dealer_code = q.dealer_code and w.quote_id = q.id
       where q.status = 'won' and (w.won_at at time zone 'Asia/Bangkok')::date between p_start and p_end)
    select jsonb_agg(jsonb_build_object(
             'code', g.code, 'y', extract(year from g.mo)::int, 'm', extract(month from g.mo)::int - 1,
             'leads', g.leads, 'quotes', g.quotes, 'won', g.won, 'lost', g.lost, 'sales', g.sales,
             'marginSale', g.msale, 'marginCost', g.mcost, 'marginQuotes', g.mq, 'annualTarget', ดีล.annual)
           order by g.mo, g.code)
      from (select code, mo, sum(leads)::int as leads, sum(quotes)::int as quotes, sum(won)::int as won, sum(lost)::int as lost,
                   sum(sales) as sales, sum(msale) as msale, sum(mcost) as mcost, sum(mq)::int as mq
              from เรื่อง group by code, mo) g
      join ดีล on ดีล.code = g.code), '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.hq_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ขั้น jsonb; ใบรอ jsonb; จังหวัดว่าง jsonb;
  คิว jsonb; เกิน int; ตอบเฉลี่ย numeric; ปิด jsonb; ยกเลิก jsonb;
  ยอดHQ numeric; ยอดดีลเลอร์ numeric; มาร์จิ้น jsonb;
begin
  if not is_hq() then raise exception 'forbidden: เฉพาะสำนักงานใหญ่'; end if;

  -- ── กล่อง 1 ──
  select jsonb_build_object(
      'new',          count(*) filter (where status = 'new'),
      'contacted',    count(*) filter (where status = 'contacted'),
      'profile_sent', count(*) filter (where status = 'profile_sent'),
      'meeting',      count(*) filter (where status = 'meeting'),
      'considering',  count(*) filter (where status = 'considering'),
      'won',          count(*) filter (where status = 'won'),
      'lost',         count(*) filter (where status = 'lost'))
    into ขั้น from dealer_prospects;
  select jsonb_build_object('count', count(*), 'amount', coalesce(sum(amount), 0))
    into ใบรอ from dealer_package_proposals where status = 'sent';
  select coalesce(jsonb_agg(jsonb_build_object('province', p, 'leads', n) order by n desc, p), '[]'::jsonb)
    into จังหวัดว่าง
    from (select btrim(l.province) as p, count(*) as n from leads l
           where l.status not in ('PAID', 'CANCELLED') and btrim(coalesce(l.province, '')) <> ''
             and not exists (select 1 from dealer_territories t where t.province = btrim(l.province))
           group by 1) x;

  -- ── กล่อง 2 ──
  select coalesce(jsonb_agg(jsonb_build_object('assignee', a, 'open', n, 'overdue', o) order by n desc, a nulls last), '[]'::jsonb)
    into คิว
    from (select nullif(btrim(assignee_name), '') as a, count(*) as n, count(*) filter (where now() > due_at) as o
            from quote_requests where status in ('new', 'pricing') group by 1) x;
  select count(*) into เกิน from quote_requests where status in ('new', 'pricing') and now() > due_at;
  select round(avg(extract(epoch from (quoted_at - submitted_at)) / 86400)::numeric, 1)
    into ตอบเฉลี่ย from quote_requests where quoted_at is not null;
  select jsonb_build_object('won', w, 'lost', l, 'pct', case when w + l = 0 then null else round(100.0 * w / (w + l), 1) end)
    into ปิด
    from (select count(*) filter (where status = 'won') as w, count(*) filter (where status = 'lost') as l from quote_requests) x;
  select jsonb_build_object('cancelled', c, 'total', n, 'pct', case when n = 0 then null else round(100.0 * c / n, 1) end,
           'reasons', (select coalesce(jsonb_agg(jsonb_build_object('reason', r, 'count', k) order by k desc, r), '[]'::jsonb)
                         from (select coalesce(nullif(btrim(cancel_reason), ''), 'ไม่ระบุเหตุผล') as r, count(*) as k
                                 from quote_requests where status = 'cancelled' group by 1) y))
    into ยกเลิก
    from (select count(*) filter (where status = 'cancelled') as c, count(*) as n from quote_requests where status <> 'superseded') x;

  -- ── กล่อง 3 ──
  select coalesce(sum(total_cost), 0) into ยอดHQ from hq_quotes where status = 'ordered';
  select coalesce(sum(total_value), 0) into ยอดดีลเลอร์ from quotations where status = 'won';
  select coalesce(jsonb_agg(jsonb_build_object('dealerCode', d, 'quotes', n, 'sale', s, 'cost', c,
           'pctOfSale', case when s = 0 then null else round(100.0 * (s - c) / s, 1) end,
           'pctOfCost', case when c = 0 then null else round(100.0 * (s - c) / c, 1) end) order by d), '[]'::jsonb)
    into มาร์จิ้น
    from (select q.dealer_code as d, count(*) as n, sum(q.total_value) as s, sum(h.total_cost + q.total_value - coalesce(q.hq_lines_value, q.total_value)) as c
            from quotations q join hq_quotes h on h.id = q.hq_quote_id
           where q.status = 'won' group by 1) x;

  return jsonb_build_object(
    'recruit',  jsonb_build_object('stages', ขั้น, 'proposalsWaiting', ใบรอ, 'provincesNoDealer', จังหวัดว่าง),
    'requests', jsonb_build_object('queue', คิว, 'overdue', เกิน, 'avgResponseDays', ตอบเฉลี่ย, 'closeRate', ปิด, 'cancel', ยกเลิก),
    'sales',    jsonb_build_object('hqOrdered', ยอดHQ, 'dealerWon', ยอดดีลเลอร์, 'marginByDealer', มาร์จิ้น));
end $function$;
