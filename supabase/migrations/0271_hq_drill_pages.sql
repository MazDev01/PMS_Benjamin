-- ── ใบ 0271: เจาะลึก 3 หน้า HQ (ลูกค้าเป้าหมาย · ใบเสนอราคา · ลูกค้า) แบบเดียวกับภาพรวมยอดขาย (บอสสั่ง 2 พ.ย. 69) ──
-- ทุกระดับ (ทั้งเครือ › ภูมิภาค › จังหวัด › ดีลเลอร์ › เดือน) ใช้แถวรายดีลเลอร์ชุดเดียวจาก hq_drill → แถวรวม = การ์ด = ผลรวมแผงที่มา
-- kpi_cards ของ 3 หน้านี้เปลี่ยนเป็นผลรวมของ hq_drill (ตัวเลขชุดเดียว · คัดฟังก์ชันจาก 0270 แก้เฉพาะ 3 หน้า)
--   การ์ดลีด: hqWaiting (ลีด HQ รอโอน · อยู่ในกล่องโอนแล้ว) → qr รอราคา HQ ตามแบบ · ใบที่ส่ง = ไม่นับร่าง/ถูกแทนที่ (= ภาพรวมยอดขาย)
--   อัตราตอบรับ = ใบตอบรับ (ตามวันตอบรับ) ÷ ใบที่ส่ง · ลูกค้า: ไม่มียอดขายรายดีลเลอร์ (อยู่ภาพรวมยอดขาย) → ตัด sales/newList/salesList
-- ข้อทดสอบ: supabase/tests/hq_drill.sql · tests/scenario/hq-drill-pages.spec.ts

-- ═══ hq_drill: แถวรายดีลเลอร์ + รายดีลเลอร์รายเดือน ของ 3 หน้าเจาะลึก ═══
--   p_page: 'leads' | 'quotations' | 'customers' · คืน { dealers: [...], months: [...] } · ทุกดีลเลอร์ (ไม่นับ HQ) แม้เป็นศูนย์
--   ลีด (ชุดเดียวกับ hq_pipeline_dealers 0264): leads = เข้ามาในช่วง · won/lost = ลีดที่เข้ามาในช่วง PAID/CANCELLED (= ภาพรวมยอดขาย)
--     open = ยังไม่ปิด (ตอนนี้) · qr = ขั้น 2 ขอราคา HQ (ตอนนี้ · lead_stage_no) · wait = ขั้น 5 รอลูกค้าตอบ (ตอนนี้)
--     stale = ไม่เคลื่อนไหวเกิน 30 วัน (กติกาเดียวกับ idle เดิม: ยังเปิด ไม่ใช่ HQ_PRICING · ติดต่อล่าสุดห่างวันนี้ > 30 วัน)
--   ใบเสนอราคา: sent = ใบที่ส่งลูกค้าแล้ว (ไม่นับร่าง/ถูกแทนที่) ตามวันออกใบ (= hq_pipeline_dealers.quotes) · wait = ส่งแล้วยังไม่ตอบ (ตอนนี้)
--     won/sales = ใบตอบรับตามวันลูกค้าตอบรับ ก่อน VAT (_kpi_won · = ยอดขายของภาพรวมยอดขาย)
--   ลูกค้า: cust = ลูกค้าทั้งหมดของดีลเลอร์ · newc = เป็นลูกค้าในช่วง (join_date)
--   รายเดือน: เรื่องเดียวกันแยกเดือนตามวันของเรื่อง (ลีด = วันเข้ามา · ใบ = วันออกใบ/วันตอบรับ · ลูกค้า = วันเป็นลูกค้า) → ผลรวมทุกเดือน = แถวรายดีลเลอร์
create or replace function public.hq_drill(p_page text, p_start date, p_end date, p_today date default null)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  วันนี้ date := coalesce(p_today, (now() at time zone 'Asia/Bangkok')::date);
  แถว jsonb; เดือน jsonb;
begin
  if not is_hq() then raise exception 'forbidden: เฉพาะสำนักงานใหญ่'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'bad_range: ช่วงเวลาไม่ถูกต้อง'; end if;
  if p_page = 'leads' then
    select coalesce(jsonb_agg(jsonb_build_object('code', d.code, 'name', d.name, 'region', d.region, 'province', d.province,
             'leads', x.leads, 'open', x.open, 'qr', x.qr, 'wait', x.wait, 'stale', x.stale, 'won', x.won, 'lost', x.lost) order by d.code), '[]'::jsonb)
      into แถว
      from dealers d cross join lateral (
        select count(*) filter (where l.created_date between p_start and p_end) as leads,
               count(*) filter (where l.status not in ('PAID', 'CANCELLED')) as open,
               count(*) filter (where l.status not in ('PAID', 'CANCELLED') and lead_stage_no(l.dealer_code, l.num_id, l.status) = 2) as qr,
               count(*) filter (where l.status not in ('PAID', 'CANCELLED') and lead_stage_no(l.dealer_code, l.num_id, l.status) = 5) as wait,
               count(*) filter (where l.status not in ('PAID', 'CANCELLED', 'HQ_PRICING') and l.last_contact_at is not null
                                  and วันนี้ - l.last_contact_at > 30) as stale,
               count(*) filter (where l.created_date between p_start and p_end and l.status = 'PAID') as won,
               count(*) filter (where l.created_date between p_start and p_end and l.status = 'CANCELLED') as lost
          from leads l where l.dealer_code = d.code) x
     where d.code <> 'HQ';
    select coalesce(jsonb_agg(jsonb_build_object('code', g.code, 'y', extract(year from g.mo)::int, 'm', extract(month from g.mo)::int - 1,
             'leads', g.leads, 'won', g.won, 'lost', g.lost) order by g.mo, g.code), '[]'::jsonb)
      into เดือน
      from (select l.dealer_code as code, date_trunc('month', l.created_date)::date as mo, count(*) as leads,
                   count(*) filter (where l.status = 'PAID') as won, count(*) filter (where l.status = 'CANCELLED') as lost
              from leads l join dealers d on d.code = l.dealer_code
             where l.dealer_code <> 'HQ' and l.created_date between p_start and p_end
             group by 1, 2) g;
  elsif p_page = 'quotations' then
    select coalesce(jsonb_agg(jsonb_build_object('code', d.code, 'name', d.name, 'region', d.region, 'province', d.province,
             'sent', ใบ.sent, 'wait', ใบ.wait, 'won', ได้.won, 'sales', ได้.sales) order by d.code), '[]'::jsonb)
      into แถว
      from dealers d
      cross join lateral (select count(*) filter (where q.status::text not in ('draft', 'superseded')
                                                     and _q_report_date('sent', null, q.date) between p_start and p_end) as sent,
                                 count(*) filter (where q.status = 'sent_to_client') as wait
                            from quotations q where q.dealer_code = d.code) ใบ
      cross join lateral (select count(*) as won, coalesce(sum(w.value), 0) as sales from _kpi_won(d.code) w where w.d between p_start and p_end) ได้
     where d.code <> 'HQ';
    select coalesce(jsonb_agg(jsonb_build_object('code', g.code, 'y', extract(year from g.mo)::int, 'm', extract(month from g.mo)::int - 1,
             'sent', g.sent, 'won', g.won, 'sales', g.sales) order by g.mo, g.code), '[]'::jsonb)
      into เดือน
      from (select code, mo, sum(sent)::int as sent, sum(won)::int as won, sum(sales) as sales from (
              select q.dealer_code as code, date_trunc('month', _q_report_date('sent', null, q.date))::date as mo, 1 as sent, 0 as won, 0::numeric as sales
                from quotations q join dealers d on d.code = q.dealer_code
               where q.dealer_code <> 'HQ' and q.status::text not in ('draft', 'superseded')
                 and _q_report_date('sent', null, q.date) between p_start and p_end
              union all
              select d.code, date_trunc('month', w.d)::date, 0, 1, w.value
                from dealers d cross join lateral _kpi_won(d.code) w where d.code <> 'HQ' and w.d between p_start and p_end) e
             group by code, mo) g;
  elsif p_page = 'customers' then
    select coalesce(jsonb_agg(jsonb_build_object('code', d.code, 'name', d.name, 'region', d.region, 'province', d.province,
             'cust', x.cust, 'newc', x.newc) order by d.code), '[]'::jsonb)
      into แถว
      from dealers d cross join lateral (
        select count(*) as cust,
               count(*) filter (where c.join_date ~ '^\d{4}-\d{2}-\d{2}' and substring(c.join_date, 1, 10)::date between p_start and p_end) as newc
          from customers c where c.dealer_code = d.code) x
     where d.code <> 'HQ';
    select coalesce(jsonb_agg(jsonb_build_object('code', g.code, 'y', extract(year from g.mo)::int, 'm', extract(month from g.mo)::int - 1,
             'newc', g.newc) order by g.mo, g.code), '[]'::jsonb)
      into เดือน
      from (select c.dealer_code as code, date_trunc('month', substring(c.join_date, 1, 10)::date)::date as mo, count(*) as newc
              from customers c join dealers d on d.code = c.dealer_code
             where c.dealer_code <> 'HQ' and c.join_date ~ '^\d{4}-\d{2}-\d{2}' and substring(c.join_date, 1, 10)::date between p_start and p_end
             group by 1, 2) g;
  else
    raise exception 'invalid_page: %', p_page;
  end if;
  return jsonb_build_object('dealers', แถว, 'months', เดือน);
end $$;
revoke all on function public.hq_drill(text, date, date, date) from public, anon, authenticated, service_role;
grant execute on function public.hq_drill(text, date, date, date) to authenticated;

-- ═══ hq_customers_page (จาก 0268) — เพิ่มชุดดีลเลอร์ p_dealer_codes: รายชื่อลูกค้าตามระดับที่เลือก (ภูมิภาค/จังหวัดของดีลเลอร์) ═══
--   เปลี่ยนรายการพารามิเตอร์ = ลบตัวเดิมก่อน (กันมีสองรุ่นให้เรียกผิด) แล้วให้สิทธิ์เท่าเดิม (0080/0096/0190: authenticated เท่านั้น)
drop function public.hq_customers_page(text, text, text[], text, date, date, integer, integer);
create or replace function public.hq_customers_page(
  p_search        text default null,
  p_dealer_code   text default null,
  p_provinces     text[] default null,
  p_building_type text default null,
  p_bought_from   date default null,
  p_bought_to     date default null,
  p_limit         int default 50,
  p_offset        int default 0,
  p_dealer_codes  text[] default null
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  result jsonb;
  s text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not is_hq() then
    raise exception 'forbidden: HQ only';
  end if;

  with subtype_map(subtype, parent) as (
    values
      ('โกดังเก็บสินค้าทั่วไป','โกดังสำเร็จรูป'), ('โกดังเก็บสินค้าเกษตร','โกดังสำเร็จรูป'),
      ('โกดังห้องเย็น','โกดังสำเร็จรูป'), ('คลังกระจายสินค้า','โกดังสำเร็จรูป'), ('โกดังเก็บวัตถุดิบ','โกดังสำเร็จรูป'),
      ('โรงงานอาหาร','โรงงาน'), ('โรงงานผลิตเหล็ก','โรงงาน'), ('โรงงานพลาสติก','โรงงาน'),
      ('โรงงานสิ่งทอ','โรงงาน'), ('โรงงานอิเล็กทรอนิกส์','โรงงาน'), ('โรงงานยา','โรงงาน'), ('โรงงานทั่วไป','โรงงาน'),
      ('อาคารสำนักงาน','อาคารสำเร็จรูปทุกประเภท'), ('โชว์รูม','อาคารสำเร็จรูปทุกประเภท'),
      ('อาคารพาณิชย์','อาคารสำเร็จรูปทุกประเภท'), ('อาคารเรียน','อาคารสำเร็จรูปทุกประเภท'), ('สถานพยาบาล','อาคารสำเร็จรูปทุกประเภท'),
      ('ออกแบบเฉพาะโครงการ','งานตามแบบของลูกค้า'), ('อาคารผสมผสาน','งานตามแบบของลูกค้า'), ('งานโครงสร้างพิเศษ','งานตามแบบของลูกค้า'),
      ('ปรับปรุงโกดังเดิม','งานรีโนเวท'), ('ต่อเติมอาคาร','งานรีโนเวท'), ('เปลี่ยนหลังคา','งานรีโนเวท'), ('เสริมโครงสร้าง','งานรีโนเวท'),
      ('โรงยิมอเนกประสงค์','สนามกีฬาในร่ม'), ('สนามแบดมินตัน','สนามกีฬาในร่ม'),
      ('สนามบาสเกตบอล','สนามกีฬาในร่ม'), ('สระว่ายน้ำในร่ม','สนามกีฬาในร่ม')
  ),
  -- ใบที่ลูกค้าตอบรับ (won) แต่ละใบ — พก dealer_code ติดมาด้วยเสมอ (customer_id เป็นเลขต่อสาขา)
  won_quotes as (
    select
      q.customer_id,
      q.dealer_code,
      coalesce(q.total_value, 0) as total_value,
      coalesce(sm.parent, nullif(q.building_type, '')) as building_type,
      case when sm.parent is not null then q.building_type else null end as template,
      _q_report_date(q.status::text, q.won_at, q.date) as won_date   -- วันที่ลูกค้าตอบรับ (0260 · เดิมใช้วันออกใบ)
    from quotations q
    left join subtype_map sm on sm.subtype = q.building_type
    where q.status = 'won' and q.customer_id is not null
  ),
  -- ยอดซื้อรวม = ผลรวมใบที่ตอบรับ "ทุกใบ" (ไม่ตัดใบที่วันที่ไม่ใช่รูปแบบ ISO — ต้องตรงกับแท็บประวัติที่นับทุกใบ won)
  cust_total as (
    select dealer_code, customer_id, sum(total_value) as total_value
    from won_quotes
    group by dealer_code, customer_id
  ),
  won_quotes_d as (
    select * from won_quotes where won_date is not null
  ),
  cust_agg as (
    select
      dealer_code,
      customer_id,
      coalesce(array_agg(distinct building_type) filter (where building_type is not null), '{}') as building_types,
      coalesce(array_agg(distinct template) filter (where template is not null), '{}') as templates,
      max(won_date) as last_purchase_at,
      count(*) as building_count
    from won_quotes_d
    group by dealer_code, customer_id
  ),
  base as (
    select
      c.id, c.company as name, c.dealer_code, coalesce(d.name, c.dealer_code) as dealer_name,
      c.province,
      coalesce(ct.total_value, 0) as total_value,   -- กติกาเดียวกับแท็บประวัติ: รวมใบ won (ไม่อ่าน customers.total_value)
      c.name as contact, c.phone, c.email, c.address,
      coalesce(ca.building_types, '{}') as building_types,
      coalesce(ca.templates, '{}') as templates,
      ca.last_purchase_at,
      coalesce(ca.building_count, 0) > 1 as is_repeat
    from customers c
    left join dealers d on d.code = c.dealer_code
    left join cust_total ct on ct.customer_id = c.id and ct.dealer_code = c.dealer_code
    left join cust_agg ca on ca.customer_id = c.id and ca.dealer_code = c.dealer_code
  ),
  filtered as (
    select * from base b
    where
      (s is null or b.name ilike '%'||s||'%' or b.province ilike '%'||s||'%')
      and (p_dealer_code is null or b.dealer_code = p_dealer_code)
      and (p_dealer_codes is null or b.dealer_code = any(p_dealer_codes))   -- ระดับ ภูมิภาค/จังหวัด ของหน้าเจาะลึก (ใบ 0271)
      and (p_provinces is null or b.province = any(p_provinces))
      and (p_building_type is null or p_building_type = any(b.building_types))
      and (p_bought_from is null or b.last_purchase_at >= p_bought_from)
      and (p_bought_to   is null or b.last_purchase_at <= p_bought_to)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'kpi', (select jsonb_build_object(
      'total', count(*),
      'active', count(*) filter (where last_purchase_at is not null and last_purchase_at >= (current_date - interval '12 months')),
      'revenue', coalesce(sum(total_value), 0),
      'repeat', count(*) filter (where is_repeat)
    ) from filtered),
    'charts', jsonb_build_object(
      'byType', (select coalesce(jsonb_agg(jsonb_build_object('label', t, 'value', cnt) order by cnt desc), '[]'::jsonb)
        from (select unnest(building_types) as t, count(*) as cnt from filtered group by 1) x),
      'bySubtype', (select coalesce(jsonb_agg(jsonb_build_object('label', t, 'value', cnt) order by cnt desc), '[]'::jsonb)
        from (select unnest(templates) as t, count(*) as cnt from filtered group by 1) x),
      'byProvince', (select coalesce(jsonb_agg(jsonb_build_object('label', province, 'value', cnt) order by cnt desc), '[]'::jsonb)
        -- ครบทุกจังหวัด + "ไม่ระบุจังหวัด" (0268) → ผลรวม = ลูกค้าทั้งหมด = ผลรวมตามดีลเลอร์ = จำนวนแถวตาราง (เดิมตัด 10 อันดับ + ทิ้งลูกค้าไม่มีจังหวัด)
        from (select coalesce(nullif(btrim(province), ''), 'ไม่ระบุจังหวัด') as province, count(*) as cnt from filtered group by 1) x),
      'byDealer', (select coalesce(jsonb_agg(jsonb_build_object('code', dealer_code, 'name', dealer_name, 'value', cnt) order by cnt desc), '[]'::jsonb)
        from (select dealer_code, dealer_name, count(*) as cnt from filtered group by 1, 2) x),
      'revenueByDealer', (select coalesce(jsonb_agg(jsonb_build_object('code', dealer_code, 'revenue', rev) order by rev desc), '[]'::jsonb)
        from (select dealer_code, sum(total_value) as rev from filtered group by 1) x)
    ),
    'rows', (select coalesce(jsonb_agg(row_to_json(p)), '[]'::jsonb) from (
      select id, name, dealer_code, dealer_name, province, total_value, building_types, templates,
             last_purchase_at, contact, phone, email, address
      from filtered
      order by total_value desc, id asc
      limit p_limit offset p_offset
    ) p)
  ) into result;

  return result;
end $$;
revoke all on function public.hq_customers_page(text, text, text[], text, date, date, integer, integer, text[]) from public, anon, authenticated, service_role;
grant execute on function public.hq_customers_page(text, text, text[], text, date, date, integer, integer, text[]) to authenticated;

-- ═══ kpi_cards (จาก 0270) — 3 หน้าเจาะลึก = ผลรวม hq_drill ═══
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
             count(*) filter (where (r->>'cust')::int > 0) as withc, count(*) as n
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

-- ═══ แม่แบบวัสดุ: ลบได้เฉพาะที่ยังไม่เคยใช้ (บอสสั่ง 2 พ.ย. 69 · ตั้งค่าให้ตรง flow ใหม่ ข้อ 5) ═══
--   "เคยใช้" = มีในรายการประเมินของคำขอราคาใดก็ได้ (quote_requests.estimate_items · ใบ HQ สร้างจากคำขอ จึงนับรวมแล้ว)
--   ฐานกัน: ตัวดักก่อนลบ — ทุกทาง (material_templates_save · คำสั่งตรงของบัญชีฝั่งเซิร์ฟเวอร์) ลบวัสดุที่เคยใช้ไม่ได้ → ปิดใช้แทน
--   หน้าเว็บถาม material_templates_used() ว่าวัสดุไหนเคยใช้ → ซ่อนปุ่มลบ (ฐานยังกันเองอยู่ดี)
create or replace function public.material_templates_block_used_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from quote_requests r where r.estimate_items @> jsonb_build_array(jsonb_build_object('templateId', old.id))) then
    raise exception 'material_in_use: วัสดุ "%" เคยใช้ในคำขอราคา/ใบ HQ แล้ว ลบไม่ได้ — ปิดใช้แทน', old.name;
  end if;
  return old;
end $$;
revoke all on function public.material_templates_block_used_delete() from public, anon, authenticated, service_role;
create trigger material_templates_block_used_delete before delete on public.material_templates
  for each row execute function public.material_templates_block_used_delete();

create or replace function public.material_templates_used() returns bigint[]
language sql stable security definer set search_path = public as $$
  select case when is_hq() then coalesce(array_agg(distinct (i ->> 'templateId')::bigint order by (i ->> 'templateId')::bigint), '{}')
              else '{}'::bigint[] end
    from quote_requests r cross join lateral jsonb_array_elements(r.estimate_items) i
   where (i ->> 'templateId') ~ '^\d+$';
$$;
revoke all on function public.material_templates_used() from public, anon, authenticated, service_role;
grant execute on function public.material_templates_used() to authenticated;
