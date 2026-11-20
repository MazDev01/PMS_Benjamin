// ── ส่วน "ใบตั้งต้นผ่านใบHQ": ใบเสนอราคาของข้อมูลตั้งต้นบนฐาน dev ทุกใบมีใบ HQ ผูก (บอสสั่ง 13 พ.ย. 69 "เติมใบ HQ ให้ใบเสนอราคาทุกใบ") ──
// เหตุ: ข้อมูลตั้งต้นของฐานทดสอบ (115 ใบ · Q-XXX-10NN · H-XXX-N-0) ทำก่อนมี flow ใบ HQ → ตาราง HQ › ใบเสนอราคาทั้งเครือ
//   คอลัมน์ ราคาจาก HQ / ส่วนต่าง ขึ้น "—" ทุกแถวของใบชุดนี้ (คนรวมงานเลือกแบบ ก · ฐาน dev เท่านั้น · ฐานทดสอบไม่แตะ)
// ทำไมไม่เดินคำสั่งของแอป (quote_request_submit → hq_quote_send → create_quotation) แบบส่วนอื่น:
//   คำขอราคาเปิดได้เฉพาะลีดสถานะ WAITING (ใบ 0256) แต่ลีดของใบชุดนี้ปิดแล้ว/อยู่ขั้นอื่น · ใบตอบรับ 32 ใบไม่มีลีดผูก (หาจากลูกค้าเดียวกัน)
//   เดินคำสั่งของแอป = ต้องสร้างลีด/ใบใหม่ซ้ำ (กุข้อมูลเพิ่ม) หรือย้อนสถานะลีด → จึงเติมเฉพาะแถวที่เส้นทางจริงต้องมี (คำขอราคา 1 + ใบ HQ 1 ต่อใบ)
//   ด้วย SQL ฐาน dev ในธุรกรรมเดียว (ปิดตัวดัก = ไม่แตะสถานะ/ยอด/วันที่ของใบเดิม) · รูปแบบแถวเหมือนที่คำสั่งของแอปสร้าง (เลขคำขอ RQ- · เลขใบ HQ-…-V1)
// งานละ 1 คำขอ + 1 ใบ HQ (ลีดเดียวกัน = งานเดียวกัน) · ยอดใบ HQ = มูลค่าต่ำสุดของใบลูกค้าในงาน ÷ (1 + 15%) — markup_percent 15
// ให้สัมพันธ์กันทุกขั้น (บอสสั่ง 18 พ.ย. 69): เดิมใบ HQ รายการเดียว "ราคาจาก HQ" ไม่มีพื้นที่ → ตอนนี้คิดพื้นที่จากยอดใบ HQ (≈2,250 บาท/ตร.ม.)
//   คำขอราคามีพื้นที่ + สเปก · ใบ HQ = รายการวัสดุตามพื้นที่ (ตัวช่วยกลาง งานขาย.mjs) + "ค่าขนส่งและติดตั้ง (เหมา)" = ส่วนที่เหลือ → ยอดเท่าเดิม
// สถานะตามใบลูกค้า (คู่เดียวกับที่เส้นทางจริงสร้าง): ตอบรับ = คำขอ won + ใบ HQ ordered · ปฏิเสธ = lost + sent · ส่งแล้ว/หมดอายุ/ร่าง = quoted + sent
// ป้าย (ลบ/มีแล้ว): hq_quotes.note = ป้ายส่วน (หมายเหตุใบ HQ ที่อ่านแล้วเป็นของจริง · ส่วนอื่นใช้ "… ไม่รวมงานฐานราก") · คำขอ = คำขอของใบ HQ ชุดนี้
//   เดิมป้าย "ใบ HQ ของใบข้อมูลตั้งต้น (ข้อมูลตัวอย่าง dev · 13 พ.ย. 69)" ต่อท้ายสเปกคำขอ + หมายเหตุใบ HQ = ข้อความตายตัวซ้ำทุกแถวบนจอ (18 พ.ย. 69)
// ราคาประเมินของดีลเลอร์ (18 พ.ย. 69): วัสดุจากแม่แบบตามพื้นที่ × ตัวคูณประจำงาน (ต่างจากใบ HQ ±5–15%) · งานไม่มีพื้นที่ (งานเล็กเหมา) = ไม่มีราคาประเมิน
import { รายการโกดัง, ยอดรายการ, สเปกโกดัง, ตัวคูณประเมิน } from "./งานขาย.mjs";

export const ชื่อ = "ใบตั้งต้นผ่านใบHQ";
const ป้ายส่วน = "ราคาวัสดุตามพื้นที่ในคำขอ · รวมค่าขนส่งและติดตั้งแบบเหมา";
const ป้ายเดิม = "ใบ HQ ของใบข้อมูลตั้งต้น (ข้อมูลตัวอย่าง dev · 13 พ.ย. 69)";   // ฐานที่ลงก่อน 18 พ.ย. 69 — ลบได้ทั้งสองแบบ
const บวก = 15;
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

export async function มีแล้ว(ctx) {
  const n = Number(ctx.sql(`select count(*) from public.quotations where dealer_code <> 'HQ' and hq_quote_id is null;`).trim());
  return n === 0;
}

export async function ลบ(ctx) {
  ctx.sql(`begin;
    set local session_replication_role = replica;
    create temp table ลบคำขอ on commit drop as select request_id as id from public.hq_quotes where note in (${q(ป้ายส่วน)}, ${q(ป้ายเดิม)});
    update public.quotations set hq_quote_id = null, markup_percent = null
      where hq_quote_id in (select id from public.hq_quotes where note in (${q(ป้ายส่วน)}, ${q(ป้ายเดิม)}));
    delete from public.hq_quotes where note in (${q(ป้ายส่วน)}, ${q(ป้ายเดิม)});
    delete from public.quote_requests where id in (select id from ลบคำขอ) or spec = ${q(ป้ายเดิม)} or spec like ${q(`%${ป้ายเดิม}`)};
    commit;`);
}

/** รายการใบ HQ ที่ยอดรวม = ต้นทุน พอดี: วัสดุตามพื้นที่ (พื้นที่จากต้นทุน) + ค่าขนส่งและติดตั้ง (เหมา) = ส่วนที่เหลือ */
export function รายการตามต้นทุน(ต้นทุน) {
  if (!(ต้นทุน > 0)) return { A: null, lines: [{ name: "ค่าขนส่งและติดตั้ง (เหมา)", qty: 1, unit: "งาน", unitCost: 0 }] };
  let A = Math.max(100, Math.round(ต้นทุน / 2250 / 10) * 10);
  let lines = รายการโกดัง(A);
  while (A > 100 && ยอดรายการ(lines) > ต้นทุน * 0.95) { A -= 10; lines = รายการโกดัง(A); }   // วัสดุไม่เกิน 95% ของยอด
  const เหลือ = Math.round((ต้นทุน - ยอดรายการ(lines)) * 100) / 100;
  if (เหลือ < 0) return { A: null, lines: [{ name: "ราคาจาก HQ (เหมา)", qty: 1, unit: "งาน", unitCost: ต้นทุน }] };   // งานเล็กมาก
  return { A, lines: [...lines, { name: "ค่าขนส่งและติดตั้ง (เหมา)", qty: 1, unit: "งาน", unitCost: เหลือ }] };
}

export async function สร้าง(ctx) {
  // 1) งานของใบที่ยังไม่มีใบ HQ (ลีดเดียวกัน = งานเดียวกัน) — ใบที่หาลีดไม่ได้เลย = หยุด (ไม่สร้างลีดเพิ่ม)
  const ดิบ = ctx.sql(`with ใบตั้งต้น as (
      select q.dealer_code, q.id as qid, q.status, coalesce(q.total_value, 0) as มูลค่า,
             coalesce(nullif(q.date, '')::date, current_date) as วัน, coalesce(q.province, '') as province,
             coalesce(q.deal_id, (select l.num_id from public.leads l where l.dealer_code = q.dealer_code and l.customer_id = q.customer_id order by l.num_id limit 1)) as ลีด
        from public.quotations q where q.dealer_code <> 'HQ' and q.hq_quote_id is null)
    select json_build_object('ไม่มีลีด', (select json_agg(dealer_code || ' ' || qid) from ใบตั้งต้น where ลีด is null),
      'งาน', (select json_agg(g order by g.dealer_code, g.ลีด) from (
        select dealer_code, ลีด, max(province) as province, max(วัน) as วัน, coalesce(min(มูลค่า) filter (where มูลค่า > 0), 0) as ต่ำสุด,
               bool_or(status = 'won') as ตอบรับ, bool_and(status = 'lost') as ปฏิเสธหมด, json_agg(qid) as ใบ
          from ใบตั้งต้น where ลีด is not null group by dealer_code, ลีด) g));`);
  const { ไม่มีลีด, งาน } = JSON.parse(ดิบ.slice(ดิบ.indexOf("{"), ดิบ.lastIndexOf("}") + 1));   // json_agg ขึ้นบรรทัดระหว่างแถว
  if (ไม่มีลีด?.length) throw new Error(`ใบตั้งต้นที่หาลีดไม่ได้ ${ไม่มีลีด.join(", ")}`);
  if (!งาน?.length) { console.log("✓ ใบข้อมูลตั้งต้นมีใบ HQ ครบแล้ว"); return; }

  // 2) รายการใบ HQ ตามต้นทุนของแต่ละงาน (คิดใน JS ตัวเดียวกับส่วนอื่น) → ใส่ทั้งชุดในธุรกรรมเดียว
  // รายการในคำขอ (ใบ 0290 · 20 พ.ย. 69): ดีลเลอร์พิมพ์ รายการ · จำนวน · หน่วย (ไม่มีราคา · ไม่มีราคาประเมิน) · งานเหมาเล็ก = ไม่มีรายการ
  const ประเมิน = (A, i) => {
    if (!A) return [];
    const f = ตัวคูณประเมิน[i % ตัวคูณประเมิน.length];
    return รายการโกดัง(A).filter(l => l.unit === "ตัน" || /หลังคา/.test(l.name)).map(l => ({ name: l.name, unit: l.unit,
      qty: l.unit === "ตัน" ? Math.round(l.qty * f * 10) / 10 : Math.max(1, Math.round(l.qty * f)) }));
  };
  const แถว = งาน.map((g, i) => {
    const ต้นทุน = Math.round(g.ต่ำสุด / (1 + บวก / 100) * 100) / 100;
    const { A, lines } = รายการตามต้นทุน(ต้นทุน);
    const ประเมินงาน = ประเมิน(A, i);
    const ยอดประเมิน = null;   // ไม่มีราคาในรายการคำขอ (HQ ตีราคา · ใบ 0290)
    return { ...g, n: i + 1, ต้นทุน, A, lines, สเปก: A ? สเปกโกดัง(A) : "งานโครงเหล็กขนาดเล็ก (ราคาเหมา)", ประเมินงาน, ยอดประเมิน };
  });
  const ค่า = แถว.map(r => `(${r.n}, ${q(r.dealer_code)}, ${Number(r.ลีด)}, ${q(r.province)}, ${q(r.วัน)}::date, ${r.ตอบรับ}, ${r.ปฏิเสธหมด}, ${r.ต้นทุน}, ${r.A ?? "null"}, ${q(r.สเปก)}, ${q(JSON.stringify(r.lines))}::jsonb, ${q(JSON.stringify(r.ใบ))}::jsonb, ${r.ประเมินงาน.length ? `${q(JSON.stringify(r.ประเมินงาน))}::jsonb` : "null"}, ${r.ยอดประเมิน ?? "null"})`).join(",\n      ");
  ctx.sql(`begin;
    set local session_replication_role = replica;
    create temp table งาน (n int, dealer_code text, ลีด int, province text, วัน date, ตอบรับ boolean, ปฏิเสธหมด boolean, ต้นทุน numeric, พื้นที่ numeric, สเปก text, รายการ jsonb, ใบ jsonb, ประเมิน jsonb, ยอดประเมิน numeric) on commit drop;
    insert into งาน values
      ${ค่า};
    create temp table เลข on commit drop as
      select (select coalesce(max(id), 0) from public.quote_requests) as คำขอ, (select coalesce(max(id), 0) from public.hq_quotes) as ใบ;
    -- กำหนดส่ง = วันขอ + 14 วัน (กติกาเดียวกับคำขอจริง · เดิมวันขอ + 3)
    insert into public.quote_requests (id, request_no, dealer_code, lead_num_id, product, area, province, spec, status, submitted_at, due_at, accepted_at, quoted_at, closed_at, updated_at, estimate_items, estimate_total)
      select เลข.คำขอ + n, 'RQ-' || extract(year from วัน) || '-' || lpad((เลข.คำขอ + n)::text, 5, '0'), dealer_code, ลีด,
             coalesce((select nullif(l.project, '') from public.leads l where l.dealer_code = งาน.dealer_code and l.num_id = งาน.ลีด), 'โกดังเก็บสินค้า'), พื้นที่, province, สเปก,   -- งานที่ขอราคา = งานของลีด (19 พ.ย. 69 · เดิมตายตัว "โกดังเก็บสินค้า")
             case when ตอบรับ then 'won' when ปฏิเสธหมด then 'lost' else 'quoted' end,
             (วัน - 5)::timestamptz, (วัน + 9)::timestamptz, (วัน - 4)::timestamptz, (วัน - 1)::timestamptz,
             case when ตอบรับ or ปฏิเสธหมด then วัน::timestamptz end, วัน::timestamptz, coalesce(ประเมิน, '[]'::jsonb), ยอดประเมิน   -- ไม่มีราคาประเมิน = รายการว่าง (คอลัมน์ไม่รับค่าว่าง · แบบเดียวกับคำขอที่ไม่เลือกวัสดุ)
        from งาน, เลข;
    insert into public.hq_quotes (id, request_id, version, quote_no, status, line_items, total_cost, valid_until, note, sent_at, ordered_at, created_at, updated_at, sent_by_name, recipient_dealer_code, recipient_dealer_name)
      select เลข.ใบ + n, เลข.คำขอ + n, 1, 'HQ-' || extract(year from วัน) || '-' || lpad((เลข.คำขอ + n)::text, 5, '0') || '-V1',
             case when ตอบรับ then 'ordered' else 'sent' end, รายการ, ต้นทุน, วัน + 30, ${q(ป้ายส่วน)},
             (วัน - 1)::timestamptz, case when ตอบรับ then วัน::timestamptz end, (วัน - 3)::timestamptz, วัน::timestamptz,
             'สำนักงานใหญ่', g.dealer_code, coalesce((select d.name from public.dealers d where d.code = g.dealer_code), '')
        from งาน g, เลข;
    update public.quotations x set hq_quote_id = เลข.ใบ + g.n, markup_percent = ${บวก}
      from งาน g cross join lateral jsonb_array_elements_text(g.ใบ) t(qid), เลข
     where x.dealer_code = g.dealer_code and x.id = t.qid;
    -- พื้นที่ของงานชุดเดียว (19 พ.ย. 69 · คนรวมงานพบ "ห้องเย็น 900 ตร.ม." แต่คำขอ 3,320 ตร.ม.): พื้นที่ที่คิดจากมูลค่าใบ → ลีด + ใบลูกค้าของงานนั้น
    update public.leads l set area = g.พื้นที่::int::text from งาน g
     where l.dealer_code = g.dealer_code and l.num_id = g.ลีด and g.พื้นที่ is not null;
    update public.quotations x set area = g.พื้นที่::int::text
      from งาน g cross join lateral jsonb_array_elements_text(g.ใบ) t(qid)
     where x.dealer_code = g.dealer_code and x.id = t.qid and g.พื้นที่ is not null;
    select setval(pg_get_serial_sequence('public.quote_requests', 'id'), (select max(id) from public.quote_requests));
    select setval(pg_get_serial_sequence('public.hq_quotes', 'id'), (select max(id) from public.hq_quotes));
    commit;`);
  const ใบ = แถว.reduce((s, r) => s + r.ใบ.length, 0), มีพื้นที่ = แถว.filter(r => r.A).length;
  console.log(`✓ ใบข้อมูลตั้งต้นผูกใบ HQ ${ใบ} ใบ · ${แถว.length} งาน (งานละ 1 คำขอราคา + 1 ใบ HQ · ยอดใบ HQ = มูลค่าต่ำสุดในงาน ÷ ${1 + บวก / 100} · `
    + `รายการวัสดุตามพื้นที่ ${มีพื้นที่} งาน + ค่าขนส่งและติดตั้ง · สถานะ/วันที่/มูลค่าใบลูกค้าเท่าเดิม)`);
}
