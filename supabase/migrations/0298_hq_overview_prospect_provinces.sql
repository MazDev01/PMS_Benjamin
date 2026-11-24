-- Benjamin PMS — ใบ 0298 · ป้าย "จังหวัดที่มีผู้สนใจแต่ยังไม่มีดีลเลอร์" นับจากผู้สนใจ (ผู้ตรวจ scn-prospect 23 พ.ย. 69)
--
-- เจอ: หน้าผู้สนใจเป็นดีลเลอร์ขึ้น "ไม่มี" ทั้งที่ฐาน dev มีผู้สนใจที่ยังไม่ปิดใน 41 จังหวัดที่ไม่มีดีลเลอร์/เขตขาย
--   เหตุ: hq_overview (ใบ 0209) นับ provincesNoDealer จากลูกค้าเป้าหมาย (leads) ของดีลเลอร์ — ไม่ใช่ผู้สนใจเป็นดีลเลอร์
--   ลูกค้าเป้าหมายมีดีลเลอร์ดูแลอยู่แล้วเสมอ (ดีลเลอร์เป็นคนเพิ่ม) จึงแทบไม่เคยมีจังหวัดว่าง
-- แก้: นับจาก dealer_prospects ที่ยังไม่ปิด (ไม่ใช่ won/lost) · จังหวัดที่ไม่มีเขตขาย (dealer_territories)
--   และไม่มีดีลเลอร์ที่ตั้งอยู่จังหวัดนั้น (dealers.province · ไม่นับแถว HQ/HQD)
--   ชื่อช่อง 'leads' คงเดิม (หน้าจอ/ตัวแปลงใช้อยู่) — ความหมายใหม่ = จำนวนผู้สนใจที่ยังไม่ปิดในจังหวัดนั้น
--   ส่วนอื่นของ hq_overview เหมือนใบ 0209 ทุกตัวอักษร
-- ข้อทดสอบ: supabase/tests/hq_overview.sql (ชุดข้อมูลที่รู้ค่าล่วงหน้า · เปลี่ยนเป็นผู้สนใจ) · tests/tools/migration-0298.test.mjs

create or replace function public.hq_overview() returns jsonb
  language plpgsql stable security definer set search_path = public as $$
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
    from (select btrim(p.province) as p, count(*) as n from dealer_prospects p
           where p.status not in ('won', 'lost') and btrim(coalesce(p.province, '')) <> ''
             and not exists (select 1 from dealer_territories t where t.province = btrim(p.province))
             and not exists (select 1 from dealers d where btrim(coalesce(d.province, '')) = btrim(p.province)
                               and d.code not in ('HQ', 'HQD'))   -- แถวสำนักงานใหญ่/ขายตรงไม่ใช่ดีลเลอร์ (ใบ 0287)
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
    from (select q.dealer_code as d, count(*) as n, sum(q.total_value) as s, sum(h.total_cost) as c
            from quotations q join hq_quotes h on h.id = q.hq_quote_id
           where q.status = 'won' group by 1) x;

  return jsonb_build_object(
    'recruit',  jsonb_build_object('stages', ขั้น, 'proposalsWaiting', ใบรอ, 'provincesNoDealer', จังหวัดว่าง),
    'requests', jsonb_build_object('queue', คิว, 'overdue', เกิน, 'avgResponseDays', ตอบเฉลี่ย, 'closeRate', ปิด, 'cancel', ยกเลิก),
    'sales',    jsonb_build_object('hqOrdered', ยอดHQ, 'dealerWon', ยอดดีลเลอร์, 'marginByDealer', มาร์จิ้น));
end $$;
revoke all on function public.hq_overview() from public, anon, authenticated, service_role;
grant execute on function public.hq_overview() to authenticated;
