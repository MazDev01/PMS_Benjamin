// ── ส่วน "ขั้นทั้งหมด": ลีดครบทุกขั้นใน FLOW ของ RYG/CNX + รายการวัสดุ + ผู้รับผิดชอบ + ลีด HQ รอโอน + ผู้สนใจ/ใบค่าแฟรนไชส์ ──
// (ย้ายจากรุ่นแรกของ scripts/dev-sample-data.mjs · 28 ต.ค. 69) · เลขลีด 996_1xx_xxx (RYG) · 996_2xx_xxx (CNX) · 996_900_00x (ลีด HQ)
//   ลีด → ขอราคา → HQ รับเรื่อง/ตีราคา/ส่งใบ → ทำใบ → ส่งใบ → ตอบรับ/ปฏิเสธ · ยกเลิกคำขอ · ขอแก้ราคา · ปิดไม่สำเร็จ · นัด · คำขอเกิน 14 วัน
import { รายการโกดัง, สเปกโกดัง, ตัวย้อนเวลา, ชื่อบริษัทสมจริง, ผู้ติดต่อสมจริง, ที่อยู่สมจริง, หมายเหตุลีด } from "./งานขาย.mjs";
import { เบอร์งาน, รหัสลีด } from "./ตัวช่วย.mjs";

export const ชื่อ = "ขั้นทั้งหมด";
const สาขา = [
  { code: "RYG", province: "ระยอง", base: 996_100_000, email: (t) => t.TEST_RYG_EMAIL, password: (t) => t.TEST_RYG_PASSWORD },
  { code: "CNX", province: "เชียงใหม่", base: 996_200_000, email: (t) => t.TEST_CNX_EMAIL, password: (t) => t.TEST_CNX_PASSWORD },
];
const สถานการณ์ = [
  "D2 ลีดใหม่ ยังไม่ได้ติดต่อ",
  "D7 ขั้น 1 มีนัดเลยกำหนด (ยังไม่ปิด)",
  "D7 ขั้น 1 มีนัดพรุ่งนี้",
  "D3 ขั้น 2 ส่งคำขอราคาแล้ว รอ HQ",
  "H7 ขั้น 2 HQ รับเรื่องแล้ว กำลังตีราคา",
  "H9x ขั้น 2 คำขอเกิน 14 วัน",
  "D3x ยกเลิกคำขอแล้ว กลับขั้น 1",
  "D4 ขั้น 3 ได้ใบ HQ แล้ว",
  "D4 ขั้น 3 ราคา HQ ใกล้หมดอายุ",
  "D5x ขอแก้ราคาแล้ว รอ HQ",
  "D5 ขั้น 4 เสนอราคาลูกค้า · ทำใบแล้ว (ร่าง)",
  "D6 ขั้น 4 เสนอราคาลูกค้า · ส่งใบให้ลูกค้าแล้ว",
  "D8 ลูกค้าตอบรับ ปิดสำเร็จ",
  "D8x ลูกค้าปฏิเสธ",
  "D8y ปิดไม่สำเร็จ (ยังไม่ได้ส่งใบ)",
];
// ชื่อ/ผู้ติดต่อ/ที่อยู่สมจริง (ตัวช่วยกลาง งานขาย.mjs · 18 พ.ย. 69 เดิม "บริษัท ตัวอย่าง RYG-06 จำกัด") · กุญแจ สาขา:เลขลีด
const ชื่อบริษัท = (s, i) => ชื่อบริษัทสมจริง(`${s.code}:${s.base + i}`);

// ── ข้อมูลให้สัมพันธ์กันทุกขั้น (บอสสั่ง 18 พ.ย. 69 "ตัวอย่างข้อมูลสมจริงให้สัมพันธ์กันทั้งหมด") ──
//   เดิม: พื้นที่ 600+50×ลำดับ แต่เหตุผลขอแก้ราคาเขียน "900" ตายตัว · ใบ HQ ทุกใบเหล็ก 12 ตัน + หลังคา 700 ตร.ม. (707,000) ไม่ขึ้นกับพื้นที่
//   ตอนนี้: พื้นที่ของแต่ละราย → คำขอราคา (พื้นที่ · สเปก) → ใบ HQ (รายการวัสดุคำนวณจากพื้นที่) → ใบลูกค้า (บวก % ดีลเลอร์)
//   ขอแก้ราคา: ใบ V1 ตามพื้นที่เดิม → เหตุผล "ขยายพื้นที่จาก A เป็น B" → คำขอใหม่พื้นที่ B · HQ ร่างใบ V2 จาก V1 ขยายตามพื้นที่ B
export const พื้นที่ตามสถานการณ์ = [480, 560, 640, 720, 800, 880, 960, 1040, 1120, 900, 1200, 1350, 1500, 1600, 750];
export const พื้นที่หลังขอแก้ = 1050;   // สถานการณ์ลำดับ 9 (D5x): 900 → 1,050 ตร.ม.
// เส้นเวลาของแต่ละราย (วันที่ถอยหลังจากวันนี้ ต่อขั้น: ลีดเข้า · ขอราคา · HQ รับ/ส่งใบ/ยกเลิก · ใบลูกค้า/ขอแก้ · ลูกค้าตอบ) — ไม่ข้ามลำดับ
export const เส้นเวลา = [[0], [10], [4], [6, 5], [8, 6, 5], [24, 20], [12, 10, 8], [15, 13, 9], [30, 28, 24], [20, 18, 14, 6],
  [16, 14, 10, 3], [22, 20, 15, 8], [40, 37, 32, 26, 12], [35, 33, 28, 22, 9], [18, 5]];
// รายการวัสดุ/สเปกตามพื้นที่ = ตัวช่วยกลาง (งานขาย.mjs) ตัวเดียวกับทุกส่วน


export async function มีแล้ว(ctx) {
  const { count } = await ctx.svc.from("leads").select("id", { count: "exact", head: true }).in("id", สาขา.map(s => รหัสลีด(s.base)));
  return (count ?? 0) > 0;
}

// ลบชุดเดิมด้วย SQL ในคำสั่งเดียว — ใบที่ลูกค้าตอบรับ/ใบ HQ ที่ส่งแล้ว/บันทึกการชำระ ฐานกันการลบ จึงปิดตัวกันชั่วคราวในธุรกรรมเดียว
//   แบบเดียวกับตัวล้างของข้อทดสอบ (tests/scenario/legacyQuotes.ts) · เลือกเฉพาะแถวของชุดตัวอย่าง (เลขลีด 996xxxxxx · ชื่อ "… ตัวอย่าง …")
// ชุดนำเข้าตัวอย่าง (ใบ 0295 · ป้ายเบอร์ซ้ำ/ข้อมูลไม่ครบ) — ใช้ทั้งตอนลบ (ลบชุดเดิม) และตอนสร้าง (นำเข้า) จึงอยู่ระดับไฟล์
//   เดิมประกาศในฟังก์ชันลบ → ขั้นสร้างตก "ชุดเฟซบุ๊กตัวอย่าง is not defined" ตอนสร้างฐาน dev ใหม่ (คนรวมงาน 24 พ.ย. 69)
const ชุดเฟซบุ๊กตัวอย่าง = "ไฟล์ Facebook ตัวอย่าง.xlsx";
export function ลบ(ctx) {
  const เลข = [...สาขา.flatMap(s => สถานการณ์.map((_, i) => s.base + i)), 996_900_000, 996_900_001, 996_900_002].join(",");
  // ผู้สนใจของส่วน = อีเมล sample-prospect-…@example.test (ชื่อสมจริงตั้งแต่ 18 พ.ย. 69) หรือชื่อแบบเดิม "ผู้สนใจตัวอย่าง …"
  const ผู้สนใจของส่วน = `(d.email like 'sample-prospect-%@example.test' or d.name like 'ผู้สนใจตัวอย่าง %')`;
  const sql = `begin;
    create temp table ชื่อในส่วน on commit drop as select distinct company from public.leads where num_id in (${เลข}) and coalesce(company, '') <> '';
    alter table public.hq_quotes disable trigger hq_quotes_lock_sent;
    alter table public.quotations disable trigger quotations_no_delete_won;
    delete from public.quotations where deal_id in (${เลข});
    delete from public.hq_quotes h using public.quote_requests r where h.request_id = r.id and r.lead_num_id in (${เลข});
    alter table public.hq_quotes enable trigger hq_quotes_lock_sent;
    alter table public.quotations enable trigger quotations_no_delete_won;
    delete from public.email_outbox o using public.quote_requests r where o.ref_table = 'quote_requests' and o.ref_id = r.id::text and r.lead_num_id in (${เลข});
    update public.quote_requests set supersedes_id = null, root_id = null where lead_num_id in (${เลข});
    select set_config('pms.quote_request_delete', 'test', false);   -- ตัวกันห้ามลบคำขอ (ใบ 0280) ยอมเฉพาะชุดล้างข้อมูลทดสอบ
    delete from public.quote_requests where lead_num_id in (${เลข});
    delete from public.appointments where lead_id in (${เลข});
    delete from public.leads where num_id in (${เลข});
    delete from public.customers where company in (select company from ชื่อในส่วน) or company like 'บริษัท ตัวอย่าง %';   -- หลังลีด (ลีดอ้างลูกค้า) · ชื่อเก็บก่อนลบลีด
    alter table public.dealer_proposal_payments disable trigger dealer_proposal_payments_guard;   -- บันทึกการชำระลบไม่ได้ (ต้องยกเลิกพร้อมเหตุผล)
    alter table public.dealer_package_proposals disable trigger dealer_package_proposals_before_delete;
    delete from public.dealer_proposal_payments p using public.dealer_package_proposals x, public.dealer_prospects d
      where p.proposal_id = x.id and x.prospect_id = d.id and ${ผู้สนใจของส่วน};
    delete from public.dealer_package_proposals x using public.dealer_prospects d where x.prospect_id = d.id and ${ผู้สนใจของส่วน};
    alter table public.dealer_proposal_payments enable trigger dealer_proposal_payments_guard;
    alter table public.dealer_package_proposals enable trigger dealer_package_proposals_before_delete;
    delete from public.dealer_prospects d where ${ผู้สนใจของส่วน};
    delete from public.prospect_import_batches where file_name = ${"'"}${ชุดเฟซบุ๊กตัวอย่าง}${"'"};   -- กุญแจแถวหายตาม (ใบ 0295) · รันซ้ำนำเข้าใหม่ได้
    delete from public.material_templates where name like '% (ตัวอย่าง)';
    commit;`;
  ctx.sql(sql);
}


export async function สร้าง(ctx) {
  const { svc, เข้า, ทดสอบ: บัญชี, วัน, ป้ายวัน, ต้อง } = ctx;

  const hq = await เข้า(บัญชี.TEST_ADMIN_EMAIL, บัญชี.TEST_ADMIN_PASSWORD);
  // ลำดับเลขคำขอ/ใบ HQ ต่อจากเลขสูงสุดที่มีอยู่ (ข้อมูลตั้งต้นของฐาน dev ใส่เลขเองโดยไม่เลื่อนลำดับ → เลขชนตอนขอราคา)
  ctx.sql(`select setval(pg_get_serial_sequence('public.quote_requests', 'id'), greatest((select coalesce(max(id), 0) from public.quote_requests), 1));
    select setval(pg_get_serial_sequence('public.hq_quotes', 'id'), greatest((select coalesce(max(id), 0) from public.hq_quotes), 1));`);

  // ── รายการในคำขอ (ใบ 0290 · 20 พ.ย. 69): ดีลเลอร์พิมพ์ รายการ · จำนวน · หน่วย เอง (ไม่มีราคา · HQ ตีราคา) ──
  //   รายการวัสดุ (แม่แบบ) เอาออกทั้งระบบแล้ว (2b19425a) → ไม่สร้างแม่แบบ (เดิมรันซ้ำชน material_templates_name_uq)
  //   ดีลเลอร์กะจำนวนเอง ต่างจากใบ HQ ±5–15% (ตัวคูณประจำราย) · ระบุเฉพาะงานโครงเหล็ก + หลังคา (ไม่ครบทุกบรรทัดแบบใบ HQ)
  const ตัวคูณประเมิน = [0.92, 1.07, 0.88, 1.10, 0.95, 1.13, 0.90, 1.06, 0.87, 1.09, 0.94, 1.12, 0.91, 1.08, 0.86];
  const ประเมินของ = (A, i) => { const f = ตัวคูณประเมิน[i % ตัวคูณประเมิน.length];
    return รายการโกดัง(A).filter(l => l.unit === "ตัน" || /หลังคา/.test(l.name)).map(l => ({ name: l.name, unit: l.unit,
      qty: l.unit === "ตัน" ? Math.round(l.qty * f * 10) / 10 : Math.max(1, Math.round(l.qty * f)) })); };

  // ── ผู้รับผิดชอบของทุกสาขา = ชื่อพนักงานขายที่ลีดอ้างถึง (เดิมแผงลีดขึ้น "ยังไม่มอบหมาย" · ตารางเทียบ FLOW แถว D6) ──
  {
    const { data: ลีด } = await svc.from("leads").select("dealer_code, assigned").neq("dealer_code", "HQ");
    const ต่อสาขา = new Map();
    for (const l of ลีด ?? []) for (const n of String(l.assigned ?? "").split(",").map(x => x.trim()).filter(Boolean)) {
      if (!ต่อสาขา.has(l.dealer_code)) ต่อสาขา.set(l.dealer_code, new Set()); ต่อสาขา.get(l.dealer_code).add(n);
    }
    for (const [code, ชื่อ] of ต่อสาขา) {
      const { data: มี } = await svc.from("responsible_persons").select("name").eq("dealer_code", code);
      const ขาด = [...ชื่อ].filter(n => !(มี ?? []).some(m => m.name === n));
      if (ขาด.length) ต้อง(await svc.from("responsible_persons").insert(ขาด.map((name, i) => ({ dealer_code: code, name, title: "พนักงานขาย",
        phone: `000-000-${String(9000 + i).slice(-4)}`, email: `sales-${code.toLowerCase()}-${i + 1}@example.test`, active: true }))), `ผู้รับผิดชอบ ${code}`);
    }
    console.log(`✓ ผู้รับผิดชอบครบ ${ต่อสาขา.size} สาขา`);
  }

  // ── ดีลเลอร์: ลีดครบทุกขั้น ──
  const ย้อน = await ตัวย้อนเวลา(ctx);
  for (const s of สาขา) {
    const sb = await เข้า(s.email(บัญชี), s.password(บัญชี));
    const { data: คน } = await svc.from("responsible_persons").select("name").eq("dealer_code", s.code).limit(1);
    const ผู้รับผิดชอบ = คน?.[0]?.name ?? "";
    const ลีด = async (i) => {
      const n = s.base + i, company = ชื่อบริษัท(s, i);
      ต้อง(await sb.from("leads").insert({
        id: รหัสลีด(n), num_id: n, dealer_code: s.code, company, name: company, contact: ผู้ติดต่อสมจริง(`${s.code}:${n}`),
        phone: เบอร์งาน(n), email: `sample-${s.code.toLowerCase()}-${i + 1}@example.test`,
        address: ที่อยู่สมจริง(`${s.code}:${n}`, s.province), province: s.province, product: "โกดังเก็บสินค้า", project: "โกดังเก็บสินค้า", area: String(พื้นที่ตามสถานการณ์[i]),
        // หมายเหตุ = ความต้องการของลูกค้าแบบจริง (สถานการณ์ของรายนี้อยู่ในรายการ สถานการณ์ ด้านบน · เดิมขึ้นบนจอ "ข้อมูลตัวอย่าง: D5x …")
        note: หมายเหตุลีด(n, พื้นที่ตามสถานการณ์[i]), source: ["referral", "website", "facebook", "line", "walk_in", "exhibition"][i % 6],   // รหัสในรายการกลาง "ช่องทางที่มา" (ใบ 0290) assigned: ผู้รับผิดชอบ, status: "WAITING",
        created_label: ป้ายวัน(วัน(-เส้นเวลา[i][0])),
      }), `สร้างลีด ${company}`);
      return { n, company };
    };
    const ขอราคา = async (n, วัสดุ = true) => {   // ทุกคำขอเลือกวัสดุจากแม่แบบตามพื้นที่ (ปุ่ม "รายการจากคำขอดีลเลอร์" มีของ · บอสสั่ง 18 พ.ย. 69)
      const i = n - s.base, A = พื้นที่ตามสถานการณ์[i];
      // ราคาประเมินเบื้องต้น = วัสดุจากแม่แบบตามพื้นที่จริงของงาน · ดีลเลอร์กะจำนวนเอง จึงต่างจากใบ HQ ±5–15%
      const ประเมิน = วัสดุ ? ประเมินของ(A, i) : [];
      const r = ต้อง(await sb.rpc("quote_request_submit", { p_lead_num_id: n, p_product: "โกดังโครงเหล็กเก็บสินค้า", p_subtype: "", p_area: A,
        p_spec: สเปกโกดัง(A), p_province: s.province, p_estimate: ประเมิน }), `ขอราคา ${n}`);
      return Number(r.id);
    };
    // ใบ HQ: รายการวัสดุคำนวณจากพื้นที่ของคำขอนั้น (อ่านจากคำขอ — ใบตรงกับคำขอเสมอ)
    const รายการของคำขอ = async (rid) => {
      const { data } = await svc.from("quote_requests").select("area").eq("id", rid).single();
      return รายการโกดัง(Number(data?.area ?? 0));
    };
    const HQส่งใบ = async (rid, วันยืนราคา = 30) => {
      ต้อง(await hq.rpc("hq_quote_save", { p_request_id: rid, p_valid_until: วัน(วันยืนราคา), p_note: "ราคาวัสดุตามพื้นที่ในคำขอ · ไม่รวมงานฐานราก",
        p_lines: await รายการของคำขอ(rid) }), `HQ บันทึกใบ ${rid}`);
      const h = ต้อง(await hq.rpc("hq_quote_send", { p_request_id: rid }), `HQ ส่งใบ ${rid}`);
      return Number(h.id);
    };
    const ทำใบ = async (n, company, hqQuoteId) => {
      const { data: hqq } = await sb.from("hq_quotes").select("line_items").eq("id", hqQuoteId).single();
      const lines = (hqq?.line_items ?? []).map(l => ({ name: l.name, qty: l.qty, unit: l.unit, unitPrice: 0, markupPct: 15 }));
      const q = ต้อง(await sb.rpc("create_quotation", { p_dealer: s.code, p_prefix: "Q-", p_payload: {
        customer: company, project: "โกดังโครงเหล็กเก็บสินค้า", province: s.province, total: "0", status: "draft", date: วัน(),
        line_items: lines, items: lines.length, hq_quote_id: hqQuoteId, deal_id: n, markup_percent: 15 } }), `ทำใบ ${company}`);
      return String(q.id);
    };
    const ส่งใบ = async (id) => ต้อง(await sb.rpc("quotation_send", { p_dealer: s.code, p_id: id }), `ส่งใบ ${id}`);
    const นัด = async (n, company, ห่างวัน, status = "upcoming") => ต้อง(await sb.from("appointments").insert({
      id: n * 10 + (ห่างวัน < 0 ? 1 : 2), dealer_code: s.code, lead_id: n, company, contact: ผู้ติดต่อสมจริง(`${s.code}:${n}`), phone: เบอร์งาน(n),
      project: "โกดังเก็บสินค้า", province: s.province, date: วัน(ห่างวัน), time: "10:00", type: "visit", assigned: ผู้รับผิดชอบ, status,
      note: "นัดดูหน้างาน วัดพื้นที่จริง" }), `นัด ${company}`);

    // แต่ละรายเดินตามเวลาจริง: จด(ขั้น) ก่อนเริ่มขั้น → ตัวย้อนเวลาเลื่อนเวลาของแถวที่ขั้นนั้นสร้างไปวันตาม เส้นเวลา[i] (ลีดเข้า → ขอราคา → HQ → ใบลูกค้า → ลูกค้าตอบ)
    const เริ่ม = async (i) => { const จด = ย้อน.งาน(s.code, s.base + i, เส้นเวลา[i], i % 5); await จด(0); return { จด, ...(await ลีด(i)) }; };
    // 0 D2 ลีดใหม่
    await เริ่ม(0);
    // 1–2 D7 นัด
    { const { n, company } = await เริ่ม(1); await นัด(n, company, -3); }
    { const { n, company } = await เริ่ม(2); await นัด(n, company, 1); }
    // 3 D3 รอ HQ
    { const { n, จด } = await เริ่ม(3); await จด(1); await ขอราคา(n, true); }   // เลือกวัสดุจากแม่แบบ = ราคาประเมินเบื้องต้น
    // 4 H7 HQ รับเรื่อง
    { const { n, จด } = await เริ่ม(4); await จด(1); const rid = await ขอราคา(n); await จด(2); ต้อง(await hq.rpc("quote_request_accept", { p_id: rid, p_assignee: null }), "HQ รับเรื่อง");
      // HQ กำลังตีราคา = มีร่างใบ HQ แล้ว (รายการตามพื้นที่ · ยังไม่ส่ง) — เปิดมาเห็นรายการ ไม่ใช่ฟอร์มว่าง
      ต้อง(await hq.rpc("hq_quote_save", { p_request_id: rid, p_valid_until: วัน(30), p_note: "ร่าง — ตีราคาวัสดุตามพื้นที่ในคำขอ รอตรวจทานก่อนส่ง", p_lines: await รายการของคำขอ(rid) }), "HQ ร่างใบ"); }
    // 5 H9x เกิน 14 วัน (ส่งคำขอ 20 วันก่อน — ตัวย้อนเวลาเลื่อนวันส่ง/กำหนดเสร็จตามขั้น · สถานะเดินตามจริง)
    { const { n, จด } = await เริ่ม(5); await จด(1); await ขอราคา(n); }
    // 6 D3x ยกเลิกคำขอ
    { const { n, จด } = await เริ่ม(6); await จด(1); const rid = await ขอราคา(n); await จด(2); ต้อง(await sb.rpc("quote_request_cancel", { p_id: rid, p_reason: "ลูกค้าขอเลื่อนโครงการ", p_close_lead: false }), "ยกเลิกคำขอ"); }
    // 7 D4 ได้ใบ HQ · 8 ใกล้หมดอายุ
    { const { n, จด } = await เริ่ม(7); await จด(1); const rid = await ขอราคา(n); await จด(2); await HQส่งใบ(rid); }
    { const { n, จด } = await เริ่ม(8); await จด(1); const rid = await ขอราคา(n); await จด(2); await HQส่งใบ(rid, 3); }
    // 9 D5x ขอแก้ราคา: V1 ตามพื้นที่เดิม 900 → ลูกค้าขยายเป็น 1,050 → คำขอใหม่พื้นที่ 1,050 → HQ ร่าง V2 (เริ่มจาก V1 ปรับจำนวนตามพื้นที่ใหม่)
    { const { n, จด } = await เริ่ม(9); await จด(1); const rid = await ขอราคา(n); await จด(2); await HQส่งใบ(rid); await จด(3);
      const เดิม = พื้นที่ตามสถานการณ์[9], ใหม่ = พื้นที่หลังขอแก้;
      const r2 = ต้อง(await sb.rpc("quote_request_reprice", { p_id: rid,
        p_reason: `ลูกค้าขอขยายพื้นที่จาก ${เดิม.toLocaleString("en-US")} เป็น ${ใหม่.toLocaleString("en-US")} ตร.ม. (เพิ่มช่องเก็บสินค้าอีก 1 ช่วงเสา)`,
        p_spec: สเปกโกดัง(ใหม่), p_estimate: ประเมินของ(ใหม่, 9) }), "ขอแก้ราคา");
      // คำขอใหม่คัดลอกพื้นที่จากคำขอเดิม (ฟังก์ชันขอแก้ราคา) → ตั้งพื้นที่ใหม่ให้ตรงกับเหตุผล · ลูกค้าเป้าหมายก็ขยายพื้นที่ด้วย
      // ราคาประเมินของคำขอใหม่คิดจากพื้นที่ใหม่ด้วย (ฟังก์ชันขอแก้ราคาคัดลอกรายการประเมินของคำขอเดิม 900 ตร.ม. มา)
      //   รายการในคำขอใหม่ส่งไปกับการขอแก้ราคาแล้ว (p_estimate · ใบ 0290) — ที่นี่ตั้งแค่พื้นที่
      ต้อง(await svc.from("quote_requests").update({ area: ใหม่ }).eq("id", r2.id), "พื้นที่คำขอใหม่");
      ต้อง(await svc.from("leads").update({ area: String(ใหม่) }).eq("dealer_code", s.code).eq("num_id", n), "พื้นที่ลูกค้าเป้าหมาย");
      ต้อง(await hq.rpc("hq_quote_save", { p_request_id: r2.id, p_valid_until: วัน(30),
        p_note: `ร่างฉบับใหม่จาก V1 — ปรับจำนวนตามพื้นที่ ${ใหม่.toLocaleString("en-US")} ตร.ม. (เดิม ${เดิม.toLocaleString("en-US")})`,
        p_lines: รายการโกดัง(ใหม่) }), "HQ ร่างใบ V2"); }
    // 10 D5 ใบร่าง · 11 D6 ส่งแล้ว · 12 D8 ตอบรับ · 13 D8x ปฏิเสธ
    for (const i of [10, 11, 12, 13]) {
      const { n, company, จด } = await เริ่ม(i);
      await จด(1); const rid = await ขอราคา(n);
      await จด(2); const hqId = await HQส่งใบ(rid);
      await จด(3); const id = await ทำใบ(n, company, hqId);
      if (i === 10) continue;
      await ส่งใบ(id);
      await จด(4);
      if (i === 12) ต้อง(await sb.rpc("close_won_quotation", { p_dealer: s.code, p_known_customer_id: null, p_lead_company: company, p_target_quote_id: id,
        p_cascade_won: false, p_customer_payload: { company, contact: ผู้ติดต่อสมจริง(`${s.code}:${n}`), address: ที่อยู่สมจริง(`${s.code}:${n}`, s.province),
          phone: เบอร์งาน(n), province: s.province } }), "ลูกค้าตอบรับ");
      if (i === 13) ต้อง(await sb.from("quotations").update({ status: "lost", lost_reason: "competitor" }).eq("dealer_code", s.code).eq("id", id), "ลูกค้าปฏิเสธ");   // รหัสในรายการกลาง (ใบ 0301)
    }
    // 14 D8y ปิดไม่สำเร็จ
    { const { n, จด } = await เริ่ม(14); await จด(1); ต้อง(await sb.rpc("lead_apply", { p_id: รหัสลีด(n), p_intent: { stage: { status: "CANCELLED", lostReason: "other:ลูกค้าไม่สนใจแล้ว" }, fields: {} } }), "ปิดไม่สำเร็จ"); }
    console.log(`✓ ${s.code}: ลีดตัวอย่าง ${สถานการณ์.length} ราย ครบขั้น 1–5 · ปิดสำเร็จ · ปิดไม่สำเร็จ · คำขอราคา · ใบ HQ · ใบลูกค้า · นัดหมาย`);
  }
  ย้อน.พัก();
  console.log(`✓ เลื่อนเวลาตามขั้นของงาน ${ย้อน.สั่ง()} งาน (ลีดเข้า → ขอราคา → HQ ส่งใบ → ใบลูกค้า → ลูกค้าตอบ เรียงตามจริง)`);

  // ── HQ: ลีดของ HQ รอโอน (H6) — ลีดของ HQ เข้ามาทางหลังบ้าน (ฟอร์มเว็บ/นำเข้า) ไม่ใช่ผู้ใช้กดสร้าง → กุญแจฝั่งเซิร์ฟเวอร์ ──
  for (const [i, จังหวัด] of ["ระยอง", "เชียงใหม่", "ชลบุรี"].entries()) {
    const n = 996_900_000 + i, company = ชื่อบริษัทสมจริง(`HQ:${n}`);
    ต้อง(await svc.from("leads").insert({ id: รหัสลีด(n), num_id: n, dealer_code: "HQ", company, name: company, contact: ผู้ติดต่อสมจริง(`HQ:${n}`),
      phone: เบอร์งาน(n), province: จังหวัด, product: "โรงงาน", source: "website", status: "WAITING",
      note: "กรอกฟอร์มติดต่อผ่านเว็บไซต์ · สนใจสร้างโรงงานโครงเหล็ก ขอให้ดีลเลอร์ในพื้นที่ติดต่อกลับ",   // H6 ลีดของ HQ รอโอนให้ดีลเลอร์
      created_label: ป้ายวัน(วัน()) }), `ลีด HQ ${company}`);
  }
  console.log("✓ ลีดของ HQ รอโอน 3 ราย");

  // ── HQ: ผู้สนใจเป็นดีลเลอร์ทุกขั้น (H2) + ใบค่าแฟรนไชส์ (H3–H4) ──
  const ผู้สนใจ = [
    ["new", "ลำปาง", 3], ["contacted", "นครสวรรค์", -2], ["profile_sent", "สุราษฎร์ธานี", 5], ["meeting", "ขอนแก่น", 2],
    ["considering", "อุดรธานี", -1], ["lost", "ตราด", null],
  ];
  const หมายเหตุผู้สนใจ = {
    new: "เจอที่บูธงานแสดงสินค้า สนใจเปิดสาขาในจังหวัด", contacted: "โทรคุยแล้ว ทำธุรกิจวัสดุก่อสร้างอยู่เดิม",
    profile_sent: "ส่งข้อมูลบริษัทและเงื่อนไขทางอีเมลแล้ว", meeting: "นัดคุยรายละเอียดที่สำนักงานใหญ่",
    considering: "ส่งใบค่าแฟรนไชส์แล้ว รอตัดสินใจ", lost: "ยังไม่พร้อมลงทุนปีนี้",
  };
  const pid = {};
  for (const [i, [status, province, ติดตาม]] of ผู้สนใจ.entries()) {
    // ชื่อผู้สนใจ = ชื่อคน + "(ตัวอย่าง)" (เดิม "ผู้สนใจตัวอย่าง 01") · ลบด้วยอีเมล sample-prospect-…@example.test · หมายเหตุตามขั้นแบบที่ HQ จดจริง
    // ชื่อบนโซเชียล: 4 ใน 6 รายมี (ทักมาทางเพจ/ไลน์) · ที่เหลือว่าง = "—" แบบจริง
    const r = ต้อง(await hq.from("dealer_prospects").insert({ name: `${ผู้ติดต่อสมจริง(`ผู้สนใจ:${i}`)} (ตัวอย่าง)`, province, status,
      social: [`เพจ ${province}วัสดุก่อสร้าง`, null, `LINE ${province} โฮมเซ็นเตอร์`, `เพจ ช่างเหล็ก${province}`, null, `LINE ร้านเหล็ก${province}`][i] ?? null,
      phone: `000-000-${String(8000 + i)}`, email: `sample-prospect-${i + 1}@example.test`, channel: ["Facebook", "LINE OA", "แนะนำต่อ", "โทรเข้ามาเอง"][i % 4], first_contact: วัน(-14 - i * 3),
      note: หมายเหตุผู้สนใจ[status], ...(status === "lost" ? { lost_reason: "not_ready" } : {}),   // รหัสในรายการกลาง "เหตุผลผู้สนใจไม่สำเร็จ" (ใบ 0290)
      follow_up: ติดตาม == null ? null : วัน(ติดตาม) }).select("id").single(), `ผู้สนใจ ${status}`);
    pid[status] = r.id;
  }
  // ผู้สนใจจากไฟล์ Facebook ตัวอย่าง (บอสสั่ง 23 พ.ย. 69 "เบอร์ซ้ำก็เอา ไม่ครบก็เอา" · ใบ 0295) — ผ่านคำสั่งนำเข้าจริง (ทางเดียวกับหน้าต่างนำเข้า)
  //   ให้ demo เห็นป้าย "เบอร์ซ้ำกับ …" / "ข้อมูลไม่ครบ" ในตาราง/แผง + ชุดนำเข้าในหน้าต่าง · เบอร์ปลอม 000-000-NNNN · อีเมล @example.test
  {
    const ทิ้งเบอร์ = (วันก่อน, ชม) => `${วัน(-วันก่อน)}T${String(ชม).padStart(2, "0")}:15:00+07:00`;
    const แถว = [
      { row: "11.26:2", name: `${ผู้ติดต่อสมจริง("ผู้สนใจFB:1")} (ตัวอย่าง)`, phone: "0000008000", email: "sample-prospect-fb-1@example.test", province: "ขอนแก่น", entered_at: ทิ้งเบอร์(2, 9) },   // เบอร์ซ้ำกับรายแรก
      { row: "11.26:3", name: "", phone: "0000008011", email: "sample-prospect-fb-2@example.test", province: "ชลบุรี", entered_at: ทิ้งเบอร์(1, 20) },   // ไม่มีชื่อ
      { row: "11.26:4", name: `${ผู้ติดต่อสมจริง("ผู้สนใจFB:3")} (ตัวอย่าง)`, phone: "", email: "sample-prospect-fb-3@example.test", province: "ระยอง", entered_at: ทิ้งเบอร์(1, 11) },   // ไม่มีเบอร์
      { row: "11.26:5", name: `${ผู้ติดต่อสมจริง("ผู้สนใจFB:4")} (ตัวอย่าง)`, phone: "00000801", phone_incomplete: true, email: "sample-prospect-fb-4@example.test", province: null, entered_at: ทิ้งเบอร์(0, 8) },   // เบอร์ไม่ครบ
    ].map(r => ({ ...r, channel: "Facebook", status: "new", follow_up_today: true, dup_ok: true,
      note: `โฆษณา: แคมเปญหาตัวแทน (ตัวอย่าง) · ทิ้งเบอร์เมื่อ: ${r.entered_at.slice(0, 16).replace("T", " ")}${r.phone_incomplete ? " · เบอร์ไม่ครบ" : ""}` }));
    const r = ต้อง(await hq.rpc("hq_prospects_import", { p_file: ชุดเฟซบุ๊กตัวอย่าง, p_rows: แถว }), "นำเข้าผู้สนใจจากไฟล์ Facebook ตัวอย่าง");
    if (Number(r?.inserted) !== แถว.length) throw new Error(`ผู้สนใจ Facebook ตัวอย่าง: นำเข้า ${r?.inserted} จาก ${แถว.length} ราย (${JSON.stringify(r?.skipped)})`);
  }
  // บันทึกการติดต่อของผู้สนใจที่ผ่านขั้นติดต่อแล้ว (ทางเดียวกับแผงผู้สนใจ › บันทึกการติดต่อ) — เดิมทุกรายขึ้น "ยังไม่เคยติดต่อ" ทั้งที่อยู่ขั้นคุย/ส่งใบแล้ว
  //   ฐานตั้งเวลาเป็นตอนนี้เสมอ (ตัวดัก) → ถอยเวลาบันทึก + ติดต่อล่าสุด ด้วย SQL ฐาน dev (replica · แตะเฉพาะ 2 คอลัมน์เวลา)
  const ติดต่อเมื่อ = { contacted: 3, profile_sent: 5, meeting: 2, considering: 6, lost: 20 };
  for (const [status, วันก่อน] of Object.entries(ติดต่อเมื่อ)) {
    const a = ต้อง(await hq.from("dealer_prospect_activities").insert({ prospect_id: pid[status], kind: "contact", channel: "โทรศัพท์",
      body: หมายเหตุผู้สนใจ[status] }).select("id").single(), `บันทึกการติดต่อ ${status}`);
    ctx.sql(`begin; set local session_replication_role = replica;
      update public.dealer_prospect_activities set created_at = now() - interval '${วันก่อน} days 3 hours' where id = ${Number(a.id)};
      update public.dealer_prospects set last_contact_at = now() - interval '${วันก่อน} days 3 hours' where id = ${Number(pid[status])};
      commit;`);
  }
  // ใบต้องครบ 8 ช่องบังคับ (ใบ 0276) · ภาค/จังหวัด = ของผู้สนใจ · ช่องแพ็กเกจลบไปแล้ว (ใบ 0269)
  const ใบค่า = (prospect, [region, province], status, extra = {}) => hq.from("dealer_package_proposals").insert({ prospect_id: prospect, status,
    region, province, proposed_date: วัน(-10), valid_until: วัน(20), terms: "ราคานี้รวมค่าอบรมเริ่มต้น",
    contract_months: 12, annual_target: 12_000_000, amount: 300_000, ...extra }).select("id").single();
  ต้อง(await ใบค่า(pid.meeting, ["อีสาน", "ขอนแก่น"], "sent"), "ใบค่าแฟรนไชส์ส่งแล้ว");
  ต้อง(await ใบค่า(pid.profile_sent, ["ใต้", "สุราษฎร์ธานี"], "draft"), "ใบค่าแฟรนไชส์ร่าง");
  { const r = ต้อง(await ใบค่า(pid.considering, ["อีสาน", "อุดรธานี"], "sent", { payment_due_on: วัน(-5) }), "ใบค่าแฟรนไชส์ที่จะตอบรับ");
    ต้อง(await hq.from("dealer_package_proposals").update({ status: "accepted" }).eq("id", r.id), "ตอบรับใบค่าแฟรนไชส์");
    ต้อง(await hq.from("dealer_proposal_payments").insert({ proposal_id: r.id, paid_on: วัน(-3), amount: 100_000, reference: "TR-ตัวอย่าง-01" }), "ชำระบางส่วน"); }
  console.log("✓ ผู้สนใจเป็นดีลเลอร์ 6 ราย · ใบค่าแฟรนไชส์ 3 ใบ (ร่าง · ส่งแล้ว · ตอบรับค้างชำระเลยกำหนด)");
}
