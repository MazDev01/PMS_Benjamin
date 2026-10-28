-- ── ใบ 0254: ลูกค้าทั้งเครือ (HQ) — ยอดซื้อรวมคิดจากใบที่ลูกค้าตอบรับ + แถวมีข้อมูลติดต่อ (ตรวจเทียบ FLOW รอบ 5 · 28 ต.ค. 69) ──
--
-- ปัญหา (ตาราง-HQ แถว 28): แผงลูกค้าคนเดียวกันเห็นสองตัวเลข
--   หัวแผง/โปรไฟล์/ตาราง "ยอดซื้อรวม ฿5.0M"  ←  hq_customers_page อ่านช่องเก็บยอด customers.total_value
--   แท็บประวัติการซื้อ "รวมจากใบที่ปิดการขาย ฿10.6M"  ←  รวม total_value ของใบ status = 'won' ตรง ๆ
-- ต้นเหตุ: customers.total_value เป็น "ยอดที่จดเก็บไว้" (trigger trg_sync_customer_won_total ใบ 0114 เขียนให้เมื่อใบเปลี่ยน)
--   ไม่ใช่ตัวเลขที่คิดจากใบ — ข้อมูลที่ลงโดยไม่ผ่าน trigger (นำเข้าลูกค้าเดิม · ข้อมูลตั้งต้นที่โหลดแบบปิด trigger ·
--   กู้จากไฟล์สำรอง) ทำให้ยอดเก็บค้างค่าเก่า ขณะที่แท็บประวัติคิดจากใบจริง → สองที่สองกติกา
-- แก้: FLOW "ยอดขาย = ใบที่ลูกค้าตอบรับ (ฉบับล่าสุด ก่อน VAT)" เป็นกติกาเดียว
--   ใบที่ตอบรับ = status 'won' (ฉบับเก่าที่ถูกแทนเป็น 'superseded' จึงนับแค่ฉบับล่าสุดเอง) · total_value = ยอดก่อน VAT (ใบ 0164)
--   → hq_customers_page คิด total_value ต่อลูกค้าจากใบ won ทุกครั้ง (สาขา + เลขลูกค้าคู่กัน กันเลขชนข้ามสาขา ใบ 0104)
--     การ์ด/กราฟ/เรียงลำดับที่อ่าน total_value ในคำสั่งนี้จึงใช้ตัวเลขเดียวกันทั้งหมด
--   ช่อง customers.total_value ในตารางคงไว้ (ที่อื่นยังอ่าน) — หน้านี้แค่ไม่อ่านแล้ว
--
-- เพิ่ม (ตาราง-HQ แถว 29): แผงลูกค้า HQ หมวด "ข้อมูลลูกค้า" ต้องมี ผู้ติดต่อ / โทรศัพท์ / อีเมล / ที่อยู่ (ชุดช่องมาตรฐาน FLOW)
--   → แถวคืน contact (customers.name) · phone · email · address เพิ่ม — HQ ดูอย่างเดียว ไม่มีที่แก้
--
-- ลายเซ็นเดิม (ใบ 0159) → create or replace · สิทธิ์เรียกเดิม (ใบ 0190) ติดไปกับคำสั่งเอง ไม่ต้องให้ใหม่
-- ข้อทดสอบ: tests/scenario/hq-customer-total-one-rule.spec.ts

create or replace function public.hq_customers_page(
  p_search        text default null,
  p_dealer_code   text default null,
  p_provinces     text[] default null,
  p_building_type text default null,
  p_bought_from   date default null,
  p_bought_to     date default null,
  p_limit         int default 50,
  p_offset        int default 0
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
      (case when q.date ~ '^\d{4}-\d{2}-\d{2}' then substring(q.date, 1, 10)::date else null end) as won_date
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
        from (select province, count(*) as cnt from filtered where province is not null and province <> '' group by 1 order by 2 desc limit 10) x),
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
