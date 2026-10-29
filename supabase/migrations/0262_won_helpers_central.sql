-- ── ใบ 0262: การ์ด KPI + แดชบอร์ด HQ ใช้ฟังก์ชันกลางวันที่ขาย (_q_report_date · ใบ 0260) ตัวเดียวกับทุกหน้า (บอสตัดสิน 29 ต.ค. 69) ──
--
-- เดิม: ตัวรวมใบตอบรับของการ์ด KPI (_kpi_won · 0246) และแดชบอร์ด HQ (_hd_won · 0235) จับคู่กับตาราง quotation_won_at แบบ "ต้องมี"
--   ใบตอบรับที่ไม่มีบันทึกเวลาตอบรับ (ใบเดิมก่อนมีตาราง) จึงไม่ถูกนับเลยในการ์ด/แดชบอร์ด
--   แต่ตัวคำนวณอีก 6 ตัว (ใบ 0260) นับใบพวกนี้ตามวันออกใบ → ตัวเลขยอดขายเดียวกันต่างกันระหว่างหน้า
-- ใหม่: ทั้งสองตัวใช้ _q_report_date — เวลาตอบรับ = quotations.won_at (ใบ 0260 · ฐานเขียนเอง) ไม่มีค่อยใช้ quotation_won_at
--   ไม่มีทั้งคู่ = วันออกใบ (กติกาเดียวกับทุกหน้า · ห้ามทิ้งใบ) · สองช่องเวลาเขียนพร้อมกันด้วยเวลาเดียวกันตอนตอบรับ (ตัวดัก 0235 + 0260)
-- ฐานจริง 29 ต.ค. 69: ใบตอบรับ 0 ใบ (ไม่นับสาขาทดสอบ ZZT) → ตัวเลขบนเว็บไม่เปลี่ยน · ลายเซ็นเดิม (create or replace) สิทธิ์เดิมติดไปกับคำสั่ง
-- ข้อทดสอบ: supabase/tests/sales_by_won_date.sql (การ์ด KPI) · tests/scenario/sales-by-won-date.spec.ts (หน้าจอ)

create or replace function public._kpi_won(p_dealer text)
  returns table (dealer_code text, quote_id text, customer_id integer, value numeric, d date)
  language sql stable security definer set search_path to 'public' as $$
  select q.dealer_code, q.id, q.customer_id, coalesce(q.total_value, 0),
         _q_report_date(q.status::text, coalesce(q.won_at, w.won_at), q.date)
    from quotations q left join quotation_won_at w on w.dealer_code = q.dealer_code and w.quote_id = q.id
   where q.status = 'won' and q.dealer_code <> 'HQ' and (p_dealer is null or q.dealer_code = p_dealer)
     and _q_report_date(q.status::text, coalesce(q.won_at, w.won_at), q.date) is not null
$$;

create or replace function public._hd_won(p_dealer text)
  returns table (dealer_code text, value numeric, d date, h int)
  language sql stable security definer set search_path to 'public' as $$
  select q.dealer_code, coalesce(q.total_value, 0),
         _q_report_date(q.status::text, coalesce(q.won_at, w.won_at), q.date),
         extract(hour from (_q_report_at(q.status::text, coalesce(q.won_at, w.won_at), q.created_at) at time zone 'Asia/Bangkok'))::int
    from quotations q left join quotation_won_at w on w.dealer_code = q.dealer_code and w.quote_id = q.id
   where q.status = 'won' and q.dealer_code <> 'HQ'
     and (p_dealer is null or q.dealer_code = p_dealer)
     and _q_report_date(q.status::text, coalesce(q.won_at, w.won_at), q.date) is not null
$$;
