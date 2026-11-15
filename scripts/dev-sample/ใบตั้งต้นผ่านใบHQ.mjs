// ── ส่วน "ใบตั้งต้นผ่านใบHQ": ใบเสนอราคาของข้อมูลตั้งต้นบนฐาน dev ทุกใบมีใบ HQ ผูก (บอสสั่ง 13 พ.ย. 69 "เติมใบ HQ ให้ใบเสนอราคาทุกใบ") ──
// เหตุ: ข้อมูลตั้งต้นของฐานทดสอบ (115 ใบ · Q-XXX-10NN · H-XXX-N-0) ทำก่อนมี flow ใบ HQ → ตาราง HQ › ใบเสนอราคาทั้งเครือ
//   คอลัมน์ ราคาจาก HQ / ส่วนต่าง ขึ้น "—" ทุกแถวของใบชุดนี้ (คนรวมงานเลือกแบบ ก · ฐาน dev เท่านั้น · ฐานทดสอบไม่แตะ)
// ทำไมไม่เดินคำสั่งของแอป (quote_request_submit → hq_quote_send → create_quotation) แบบส่วนอื่น:
//   คำขอราคาเปิดได้เฉพาะลีดสถานะ WAITING (ใบ 0256) แต่ลีดของใบชุดนี้ปิดแล้ว/อยู่ขั้นอื่น · ใบตอบรับ 32 ใบไม่มีลีดผูก (หาจากลูกค้าเดียวกัน)
//   เดินคำสั่งของแอป = ต้องสร้างลีด/ใบใหม่ซ้ำ (กุข้อมูลเพิ่ม) หรือย้อนสถานะลีด → จึงเติมเฉพาะแถวที่เส้นทางจริงต้องมี (คำขอราคา 1 + ใบ HQ 1 ต่อใบ)
//   ด้วย SQL ฐาน dev ในธุรกรรมเดียว (ปิดตัวดัก = ไม่แตะสถานะ/ยอด/วันที่ของใบเดิม) · รูปแบบแถวเหมือนที่คำสั่งของแอปสร้าง (เลขคำขอ RQ- · เลขใบ HQ-…-V1)
// งานละ 1 คำขอ + 1 ใบ HQ (ลีดเดียวกัน = งานเดียวกัน) · ราคาใบ HQ = มูลค่าต่ำสุดของใบลูกค้าในงาน ÷ (1 + 15%) — markup_percent 15 · รายการเดียว "ราคาจาก HQ" (ใบชุดนี้ไม่มีรายการวัสดุเดิม)
// สถานะตามใบลูกค้า (คู่เดียวกับที่เส้นทางจริงสร้าง): ตอบรับ = คำขอ won + ใบ HQ ordered · ปฏิเสธ = lost + sent · ส่งแล้ว/หมดอายุ/ร่าง = quoted + sent
// ป้าย (ลบ/มีแล้ว): quote_requests.spec และ hq_quotes.note = ป้ายส่วน
export const ชื่อ = "ใบตั้งต้นผ่านใบHQ";
const ป้ายส่วน = "ใบ HQ ของใบข้อมูลตั้งต้น (ข้อมูลตัวอย่าง dev · 13 พ.ย. 69)";
const บวก = 15;
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

export async function มีแล้ว(ctx) {
  const n = Number(ctx.sql(`select count(*) from public.quotations where dealer_code <> 'HQ' and hq_quote_id is null;`).trim());
  return n === 0;
}

export async function ลบ(ctx) {
  ctx.sql(`begin;
    set local session_replication_role = replica;
    update public.quotations set hq_quote_id = null, markup_percent = null
      where hq_quote_id in (select id from public.hq_quotes where note = ${q(ป้ายส่วน)});
    delete from public.hq_quotes where note = ${q(ป้ายส่วน)};
    delete from public.quote_requests where spec = ${q(ป้ายส่วน)};
    commit;`);
}

export async function สร้าง(ctx) {
  const ผล = ctx.sql(`begin;
    set local session_replication_role = replica;
    create temp table ใบตั้งต้น on commit drop as
      select q.dealer_code, q.id as qid, q.status, coalesce(q.total_value, 0) as มูลค่า,
             coalesce(nullif(q.date, '')::date, current_date) as วัน, coalesce(q.province, '') as province,
             coalesce(q.deal_id, (select l.num_id from public.leads l where l.dealer_code = q.dealer_code and l.customer_id = q.customer_id order by l.num_id limit 1)) as ลีด,
             row_number() over (order by q.dealer_code, q.id) as n
        from public.quotations q
       where q.dealer_code <> 'HQ' and q.hq_quote_id is null;
    -- ใบที่หาลีดไม่ได้เลย = หยุด (ไม่สร้างลีดเพิ่ม)
    do $$ begin if exists (select 1 from ใบตั้งต้น where ลีด is null) then
      raise exception 'ใบตั้งต้นที่หาลีดไม่ได้ %', (select string_agg(dealer_code || ' ' || qid, ', ') from ใบตั้งต้น where ลีด is null); end if; end $$;
    -- งานละ 1 คำขอ + 1 ใบ HQ (ลีดเดียวกัน = งานเดียวกัน · ฐานยอมคำขอเปิดได้ลีดละ 1 · quote_requests_one_open_per_lead)
    --   ใบลูกค้าหลายใบของลีดเดียว (หลายฉบับ/หลายครั้ง) ผูกใบ HQ ใบเดียวกัน แบบที่เส้นทางจริงทำฉบับใหม่จากใบ HQ เดิม
    --   ราคาใบ HQ = มูลค่าต่ำสุดของใบลูกค้าในงาน ÷ (1 + บวก%) → ทุกใบมีส่วนต่าง ≥ 0
    --   สถานะ: มีใบตอบรับ = คำขอ won + ใบ HQ ordered · ทุกใบถูกปฏิเสธ = lost + sent · อื่น ๆ = quoted + sent
    create temp table งาน on commit drop as
      select dealer_code, ลีด, max(province) as province, max(วัน) as วัน,
             coalesce(min(มูลค่า) filter (where มูลค่า > 0), 0) as ต่ำสุด,
             bool_or(status = 'won') as ตอบรับ, bool_and(status = 'lost') as ปฏิเสธหมด,
             row_number() over (order by dealer_code, ลีด) as n
        from ใบตั้งต้น group by dealer_code, ลีด;
    create temp table เลข on commit drop as
      select (select coalesce(max(id), 0) from public.quote_requests) as คำขอ, (select coalesce(max(id), 0) from public.hq_quotes) as ใบ;
    insert into public.quote_requests (id, request_no, dealer_code, lead_num_id, product, area, province, spec, status, submitted_at, due_at, accepted_at, quoted_at, closed_at, updated_at)
      select เลข.คำขอ + n, 'RQ-' || extract(year from วัน) || '-' || lpad((เลข.คำขอ + n)::text, 5, '0'), dealer_code, ลีด,
             'โกดังเก็บสินค้า', null, province, ${q(ป้ายส่วน)},
             case when ตอบรับ then 'won' when ปฏิเสธหมด then 'lost' else 'quoted' end,
             (วัน - 5)::timestamptz, (วัน - 2)::timestamptz, (วัน - 4)::timestamptz, (วัน - 1)::timestamptz,
             case when ตอบรับ or ปฏิเสธหมด then วัน::timestamptz end, วัน::timestamptz
        from งาน, เลข;
    insert into public.hq_quotes (id, request_id, version, quote_no, status, line_items, total_cost, valid_until, note, sent_at, ordered_at, created_at, updated_at, sent_by_name, recipient_dealer_code, recipient_dealer_name)
      select เลข.ใบ + n, เลข.คำขอ + n, 1, 'HQ-' || extract(year from วัน) || '-' || lpad((เลข.คำขอ + n)::text, 5, '0') || '-V1',
             case when ตอบรับ then 'ordered' else 'sent' end,
             jsonb_build_array(jsonb_build_object('name', 'ราคาจาก HQ', 'qty', 1, 'unit', 'งาน', 'unitCost', round(ต่ำสุด / (1 + ${บวก} / 100.0), 2))),
             round(ต่ำสุด / (1 + ${บวก} / 100.0), 2), วัน + 30, ${q(ป้ายส่วน)},
             (วัน - 1)::timestamptz, case when ตอบรับ then วัน::timestamptz end, (วัน - 3)::timestamptz, วัน::timestamptz,
             'สำนักงานใหญ่', g.dealer_code, coalesce((select d.name from public.dealers d where d.code = g.dealer_code), '')
        from งาน g, เลข;
    update public.quotations x set hq_quote_id = เลข.ใบ + g.n, markup_percent = ${บวก}
      from ใบตั้งต้น t join งาน g on g.dealer_code = t.dealer_code and g.ลีด = t.ลีด, เลข
     where x.dealer_code = t.dealer_code and x.id = t.qid;
    select (select count(*) from ใบตั้งต้น) || ' ใบ · ' || (select count(*) from งาน) || ' งาน';
    commit;`);
  console.log(`✓ ใบข้อมูลตั้งต้นผูกใบ HQ ${ผล.trim().split(/\r?\n/).filter(Boolean).pop()} (งานละ 1 คำขอราคา + 1 ใบ HQ · ราคาใบ HQ = มูลค่าต่ำสุดในงาน ÷ ${1 + บวก / 100} · สถานะ/วันที่/มูลค่าใบลูกค้าเท่าเดิม)`);
}
