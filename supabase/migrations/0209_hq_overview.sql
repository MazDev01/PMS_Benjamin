-- Benjamin PMS — ด่าน 5 · "สิ่งที่ HQ เห็นในภาพรวม" 3 กล่อง (FLOW ช่วงที่ 3)
--
-- ตัวคำนวณเดียวในฐาน — หน้าจอทุกโหมด (ต่อฐานตรง / /api/v1) ใช้ตัวเลขชุดเดียวกัน · HQ เท่านั้น
-- ตัวเลข "ณ ตอนนี้ / ทั้งหมด" ไม่ขึ้นกับตัวกรองช่วงเวลา (FLOW ไม่ได้กำหนดช่วง — ถ้าต้องการช่วงเวลา เพิ่มพารามิเตอร์ทีหลัง)
--
-- กล่อง 1 · หาดีลเลอร์ใหม่
--   stages            ผู้สนใจแต่ละขั้น (ทุกขั้น รวม won/lost · ขั้นที่ไม่มี = 0)
--   proposalsWaiting  ใบค่าแฟรนไชส์ที่รอตอบ = ส่งแล้ว (จำนวน + ค่าแรกเข้ารวม)
--   provincesNoDealer จังหวัดที่มีลูกค้าเป้าหมายที่ยังเปิด (ไม่ใช่ PAID/CANCELLED) แต่ยังไม่มีดีลเลอร์ดูแล (dealer_territories)
-- กล่อง 2 · คำขอใบเสนอราคา
--   queue             คำขอที่ยังเปิด (new/pricing) แยกตามผู้รับผิดชอบ (ยังไม่มีผู้รับ = null) + จำนวนที่เกิน 14 วัน
--   overdue           คำขอที่ยังเปิดและเลยกำหนด 14 วัน (due_at)
--   avgResponseDays   เวลาตั้งแต่ส่งคำขอถึง HQ ส่งใบ เฉลี่ย (วัน · 1 ตำแหน่ง) — ทุกคำขอที่ส่งใบแล้ว รวมที่ถูกแทนด้วยเวอร์ชันใหม่
--   closeRate         ใบ HQ ที่ปิดการขายได้ = won ÷ (won + lost) ของคำขอ (%)
--   cancel            อัตรายกเลิก = ยกเลิก ÷ คำขอทั้งหมด (ไม่นับที่ถูกแทนด้วยเวอร์ชันใหม่) + เหตุผล (ไม่ระบุ = "ไม่ระบุเหตุผล")
-- กล่อง 3 · ยอดขายเครือข่าย
--   hqOrdered         ยอดขาย HQ = ต้นทุนรวมของใบ HQ ที่สั่งผลิตแล้ว
--   dealerWon         ยอดขายดีลเลอร์ให้ลูกค้า = ใบเสนอราคาที่ลูกค้าตอบรับ (won) ทุกใบ รวมใบเดิมก่อน Flow ใหม่
--   marginByDealer    ใบลูกค้า won ที่ผูกใบ HQ: ขายรวม · ต้นทุนรวม · ส่วนบวก % ของราคาขาย · % ของต้นทุน (รายดีลเลอร์)
--   (แจ้งเตือนเดิม — ลูกค้าเป้าหมายนิ่ง อัตราแพ้ ฯลฯ — ใช้ตัวเดิม hqAlerts ไม่คำนวณซ้ำที่นี่)
-- ข้อทดสอบ: supabase/tests/hq_overview.sql (ชุดข้อมูลที่รู้ค่าล่วงหน้า)

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
