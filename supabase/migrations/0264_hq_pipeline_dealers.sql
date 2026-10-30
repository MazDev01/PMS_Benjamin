-- ── ใบ 0264: ตารางผลงานดีลเลอร์ของหน้าภาพรวมยอดขาย HQ — ตัวเลขชุดเดียวกับการ์ด (บอสสั่ง 30 ต.ค. 69 · FLOW H12) ─────────
--
-- เจอ (หน้า /hq/pipeline): ตัวเลขรายดีลเลอร์คิดคนละทางกับการ์ด
--   · "เป้าหมายทั้งปี เทียบ ยอดขายจริง" ขึ้น ฿0 ทุกสาขา แต่ตารางผลงานบอก RYG ฿69.9M (ยอดมาจากตัวรวมฝั่งหน้าเว็บอีกตัว)
--   · อัตราปิดรายแถวไม่ตรงสูตรกลาง · การ์ดปิดสำเร็จ 80 แต่ผลรวมรายดีลเลอร์ 75 (ตารางนับใบ won ไม่ใช่ลีด PAID)
--   · ตารางส่วนบวกไม่ขึ้นกับตัวกรอง (อ่าน hq_overview ทั้งเครือ)
-- ใหม่: hq_pipeline_dealers(ช่วง, ชุดสาขา) คืนแถวรายดีลเลอร์ที่คิดด้วยเงื่อนไขเดียวกับ kpi_cards('hq.pipeline') ทุกตัว
--   ยอดขาย       = _kpi_won (ตามวันลูกค้าตอบรับ · ใบ 0260/0262) ในช่วง          → ผลรวม = การ์ด sales.value
--   ปิดได้/ไม่ได้  = ลีดที่เข้ามาในช่วง สถานะ PAID / CANCELLED (สูตรกลาง winRate) → ผลรวม = การ์ด winRate.won / lost
--   ส่วนต่างกำไร  = ใบลูกค้า won ที่ผูกใบ HQ ตอบรับในช่วง (ขาย/ต้นทุน)           → ผลรวมขาย/ต้นทุน = การ์ด margin (% คิดจากผลรวม)
--   ถึงเป้า       = ยอดตั้งแต่ต้นปี ≥ เป้าทั้งปี (เฉพาะสาขาที่ตั้งเป้า)              → จำนวน = การ์ด onTarget.reached
--   เป้าตามช่วง   = เป้าทั้งปี × จำนวนวันในช่วง ÷ 365 (สูตรเดียวกับเป้าของการ์ด) · ยังไม่ตั้งเป้า = null ("—")
--   ลีด = ลีดที่เข้ามาในช่วง · ใบเสนอราคา = ใบที่ส่งลูกค้าแล้ว (ไม่นับร่าง/ถูกแทนที่) ออกในช่วง · เสนอล่าสุด = วันออกใบล่าสุดของใบที่ส่งแล้ว
-- ข้อทดสอบ: supabase/tests/hq_pipeline_dealers.sql (ผลรวมรายดีลเลอร์ = การ์ด ทุกตัว หลายชุดตัวกรอง) · tests/scenario/hq-pipeline-h12.spec.ts

create or replace function public.hq_pipeline_dealers(p_start date, p_end date, p_dealers text[] default null, p_today date default null)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
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
             'onTarget', coalesce(d.revenue_target, 0) > 0 and ข.ytd >= d.revenue_target)
           order by ข.sales desc, d.code)
      from dealers d
      cross join lateral (select count(*) as leads, count(*) filter (where l.status = 'PAID') as won, count(*) filter (where l.status = 'CANCELLED') as lost
                            from leads l where l.dealer_code = d.code and l.created_date between p_start and p_end) ล
      cross join lateral (select count(*) filter (where _q_report_date('sent', null, q.date) between p_start and p_end) as n,
                                 max(_q_report_date('sent', null, q.date)) as latest   -- วันออกใบ (ข้อความ YYYY-MM-DD · ตัวแปลงกลาง ใบ 0260)
                            from quotations q where q.dealer_code = d.code and q.status::text not in ('draft', 'superseded')) ใบ
      cross join lateral (select (select coalesce(sum(w.value), 0) from _kpi_won(d.code) w where w.d between p_start and p_end) as sales,
                                 (select coalesce(sum(w.value), 0) from _kpi_won(d.code) w where w.d between ต้นปี and วันนี้) as ytd) ข
      cross join lateral (select coalesce(sum(q.total_value), 0) as sale, coalesce(sum(h.total_cost), 0) as cost, count(*) as n
                            from quotations q join hq_quotes h on h.id = q.hq_quote_id
                            join quotation_won_at w on w.dealer_code = q.dealer_code and w.quote_id = q.id
                           where q.status = 'won' and q.dealer_code = d.code
                             and (w.won_at at time zone 'Asia/Bangkok')::date between p_start and p_end) ม
     where d.code <> 'HQ' and (p_dealers is null or d.code = any(p_dealers))), '[]'::jsonb);
end $$;
revoke all on function public.hq_pipeline_dealers(date, date, text[], date) from public, anon, authenticated, service_role;
grant execute on function public.hq_pipeline_dealers(date, date, text[], date) to authenticated;
