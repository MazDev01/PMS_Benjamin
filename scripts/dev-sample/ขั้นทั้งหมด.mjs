// ── ส่วน "ขั้นทั้งหมด": ลีดครบทุกขั้นใน FLOW ของ RYG/CNX + แม่แบบวัสดุ + ผู้รับผิดชอบ + ลีด HQ รอโอน + ผู้สนใจ/ใบค่าแฟรนไชส์ ──
// (ย้ายจากรุ่นแรกของ scripts/dev-sample-data.mjs · 28 ต.ค. 69) · เลขลีด 996_1xx_xxx (RYG) · 996_2xx_xxx (CNX) · 996_900_00x (ลีด HQ)
//   ลีด → ขอราคา → HQ รับเรื่อง/ตีราคา/ส่งใบ → ทำใบ → ส่งใบ → ตอบรับ/ปฏิเสธ · ยกเลิกคำขอ · ขอแก้ราคา · ปิดไม่สำเร็จ · นัด · คำขอเกิน 14 วัน
import { ป้าย } from "./ตัวช่วย.mjs";

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
  "D5 ขั้น 4 ทำใบให้ลูกค้า (ร่าง)",
  "D6 ขั้น 5 ส่งใบให้ลูกค้าแล้ว",
  "D8 ลูกค้าตอบรับ ปิดสำเร็จ",
  "D8x ลูกค้าปฏิเสธ",
  "D8y ปิดไม่สำเร็จ (ยังไม่ได้ส่งใบ)",
];
const ชื่อบริษัท = (s, i) => `บริษัท ตัวอย่าง ${s.code}-${String(i + 1).padStart(2, "0")} จำกัด`;


export async function มีแล้ว(ctx) {
  const { count } = await ctx.svc.from("leads").select("id", { count: "exact", head: true }).in("id", สาขา.map(s => `#L-${s.base}`));
  return (count ?? 0) > 0;
}

// ลบชุดเดิมด้วย SQL ในคำสั่งเดียว — ใบที่ลูกค้าตอบรับ/ใบ HQ ที่ส่งแล้ว/บันทึกการชำระ ฐานกันการลบ จึงปิดตัวกันชั่วคราวในธุรกรรมเดียว
//   แบบเดียวกับตัวล้างของข้อทดสอบ (tests/scenario/legacyQuotes.ts) · เลือกเฉพาะแถวของชุดตัวอย่าง (เลขลีด 996xxxxxx · ชื่อ "… ตัวอย่าง …")
export function ลบ(ctx) {
  const เลข = [...สาขา.flatMap(s => สถานการณ์.map((_, i) => s.base + i)), 996_900_000, 996_900_001, 996_900_002].join(",");
  const sql = `begin;
    alter table public.hq_quotes disable trigger hq_quotes_lock_sent;
    alter table public.quotations disable trigger quotations_no_delete_won;
    delete from public.quotations where deal_id in (${เลข});
    delete from public.hq_quotes h using public.quote_requests r where h.request_id = r.id and r.lead_num_id in (${เลข});
    alter table public.hq_quotes enable trigger hq_quotes_lock_sent;
    alter table public.quotations enable trigger quotations_no_delete_won;
    delete from public.email_outbox o using public.quote_requests r where o.ref_table = 'quote_requests' and o.ref_id = r.id::text and r.lead_num_id in (${เลข});
    update public.quote_requests set supersedes_id = null, root_id = null where lead_num_id in (${เลข});
    delete from public.quote_requests where lead_num_id in (${เลข});
    delete from public.appointments where lead_id in (${เลข});
    delete from public.leads where num_id in (${เลข});
    delete from public.customers where company like 'บริษัท ตัวอย่าง %';   -- หลังลีด (ลีดอ้างลูกค้า)
    alter table public.dealer_proposal_payments disable trigger dealer_proposal_payments_guard;   -- บันทึกการชำระลบไม่ได้ (ต้องยกเลิกพร้อมเหตุผล)
    alter table public.dealer_package_proposals disable trigger dealer_package_proposals_before_delete;
    delete from public.dealer_proposal_payments p using public.dealer_package_proposals x, public.dealer_prospects d
      where p.proposal_id = x.id and x.prospect_id = d.id and d.name like 'ผู้สนใจตัวอย่าง %';
    delete from public.dealer_package_proposals x using public.dealer_prospects d where x.prospect_id = d.id and d.name like 'ผู้สนใจตัวอย่าง %';
    alter table public.dealer_proposal_payments enable trigger dealer_proposal_payments_guard;
    alter table public.dealer_package_proposals enable trigger dealer_package_proposals_before_delete;
    delete from public.dealer_prospects where name like 'ผู้สนใจตัวอย่าง %';
    delete from public.material_templates where name like '% (ตัวอย่าง)';
    commit;`;
  ctx.sql(sql);
}


export async function สร้าง(ctx) {
  const { svc, เข้า, ทดสอบ: บัญชี, วัน, ป้ายวัน, ต้อง } = ctx;

  const hq = await เข้า(บัญชี.TEST_ADMIN_EMAIL, บัญชี.TEST_ADMIN_PASSWORD);

  // ── HQ: แม่แบบวัสดุ (ดีลเลอร์เลือกตอนขอราคา) ──
  const แม่แบบ = ต้อง(await hq.rpc("material_templates_save", { p_rows: [
    { category: "โครงสร้าง", name: "เหล็กโครงสร้างหลัก (ตัวอย่าง)", unit: "ตัน", unitPrice: 42000 },
    { category: "โครงสร้าง", name: "แป/โครงหลังคา (ตัวอย่าง)", unit: "ตร.ม.", unitPrice: 380 },
    { category: "หลังคา/ผนัง", name: "แผ่นหลังคาเมทัลชีท 0.47 มม. (ตัวอย่าง)", unit: "ตร.ม.", unitPrice: 290 },
    { category: "หลังคา/ผนัง", name: "ผนังเมทัลชีท 0.40 มม. (ตัวอย่าง)", unit: "ตร.ม.", unitPrice: 240 },
    { category: "ประตู", name: "ประตูม้วน 4x5 ม. (ตัวอย่าง)", unit: "ชุด", unitPrice: 65000 },
  ], p_delete_ids: [] }), "บันทึกแม่แบบวัสดุ");
  // จับคู่ด้วยชื่อ — ลำดับที่ฐานคืนมาไม่ใช่ลำดับที่ส่ง (เคยจับจำนวนผิดวัสดุ ราคาประเมินเพี้ยนเป็นหลายสิบล้าน)
  const รหัสของ = (ชื่อ) => Number((แม่แบบ ?? []).find(m => m.name === ชื่อ)?.id);
  const วัสดุประเมิน = [["เหล็กโครงสร้างหลัก (ตัวอย่าง)", 12], ["แผ่นหลังคาเมทัลชีท 0.47 มม. (ตัวอย่าง)", 700], ["ผนังเมทัลชีท 0.40 มม. (ตัวอย่าง)", 400]]
    .map(([ชื่อ, qty]) => ({ templateId: รหัสของ(ชื่อ), qty }));
  console.log("✓ แม่แบบวัสดุ 5 รายการ");

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
  for (const s of สาขา) {
    const sb = await เข้า(s.email(บัญชี), s.password(บัญชี));
    const { data: คน } = await svc.from("responsible_persons").select("name").eq("dealer_code", s.code).limit(1);
    const ผู้รับผิดชอบ = คน?.[0]?.name ?? "";
    const ลีด = async (i) => {
      const n = s.base + i, company = ชื่อบริษัท(s, i);
      ต้อง(await sb.from("leads").insert({
        id: `#L-${n}`, num_id: n, dealer_code: s.code, company, name: company, contact: `ผู้ติดต่อตัวอย่าง ${s.code}-${String(i + 1).padStart(2, "0")}`,
        phone: `000-000-${String(n).slice(-4)}`, email: `sample-${s.code.toLowerCase()}-${i + 1}@example.test`,
        address: `ที่อยู่ตัวอย่าง ${i + 1} ${s.province}`, province: s.province, product: "โกดังเก็บสินค้า", area: String(600 + i * 50),
        note: `${ป้าย}: ${สถานการณ์[i]} · สเปก โครงเหล็ก ผนังเมทัลชีท`, source: "ลูกค้าแนะนำ", assigned: ผู้รับผิดชอบ, status: "WAITING",
        created_label: ป้ายวัน(วัน(-i)),
      }), `สร้างลีด ${company}`);
      return { n, company };
    };
    const ขอราคา = async (n, วัสดุ = false) => {
      const i = n - s.base;
      const r = ต้อง(await sb.rpc("quote_request_submit", { p_lead_num_id: n, p_product: "โกดังเก็บสินค้า", p_subtype: "", p_area: 600 + i * 50,
        p_spec: "โครงเหล็ก ผนังเมทัลชีท สูง 8 ม.", p_province: s.province,
        p_estimate: วัสดุ ? วัสดุประเมิน : [] }), `ขอราคา ${n}`);
      return Number(r.id);
    };
    const HQส่งใบ = async (rid, วันยืนราคา = 30) => {
      ต้อง(await hq.rpc("hq_quote_save", { p_request_id: rid, p_valid_until: วัน(วันยืนราคา), p_note: "ราคาตัวอย่าง",
        p_lines: [{ name: "เหล็กโครงสร้างหลัก", qty: 12, unit: "ตัน", unitCost: 42000 }, { name: "แผ่นหลังคาเมทัลชีท 0.47 มม.", qty: 700, unit: "ตร.ม.", unitCost: 290 }] }), `HQ บันทึกใบ ${rid}`);
      const h = ต้อง(await hq.rpc("hq_quote_send", { p_request_id: rid }), `HQ ส่งใบ ${rid}`);
      return Number(h.id);
    };
    const ทำใบ = async (n, company, hqQuoteId) => {
      const { data: hqq } = await sb.from("hq_quotes").select("line_items").eq("id", hqQuoteId).single();
      const lines = (hqq?.line_items ?? []).map(l => ({ name: l.name, qty: l.qty, unit: l.unit, unitPrice: 0, markupPct: 15 }));
      const q = ต้อง(await sb.rpc("create_quotation", { p_dealer: s.code, p_prefix: "Q-", p_payload: {
        customer: company, project: "โกดังเก็บสินค้า", province: s.province, total: "0", status: "draft", date: วัน(),
        line_items: lines, items: lines.length, hq_quote_id: hqQuoteId, deal_id: n, markup_percent: 15 } }), `ทำใบ ${company}`);
      return String(q.id);
    };
    const ส่งใบ = async (id) => ต้อง(await sb.rpc("quotation_send", { p_dealer: s.code, p_id: id }), `ส่งใบ ${id}`);
    const นัด = async (n, company, ห่างวัน, status = "upcoming") => ต้อง(await sb.from("appointments").insert({
      id: n * 10 + (ห่างวัน < 0 ? 1 : 2), dealer_code: s.code, lead_id: n, company, contact: "ผู้ติดต่อตัวอย่าง", phone: `000-000-${String(n).slice(-4)}`,
      project: "โกดังเก็บสินค้า", province: s.province, date: วัน(ห่างวัน), time: "10:00", type: "visit", assigned: ผู้รับผิดชอบ, status,
      note: `${ป้าย}: นัดดูหน้างาน` }), `นัด ${company}`);

    // 0 D2 ลีดใหม่
    await ลีด(0);
    // 1–2 D7 นัด
    { const { n, company } = await ลีด(1); await นัด(n, company, -3); }
    { const { n, company } = await ลีด(2); await นัด(n, company, 1); }
    // 3 D3 รอ HQ
    { const { n } = await ลีด(3); await ขอราคา(n, true); }   // เลือกวัสดุจากแม่แบบ = ราคาประเมินเบื้องต้น
    // 4 H7 HQ รับเรื่อง
    { const { n } = await ลีด(4); const rid = await ขอราคา(n); ต้อง(await hq.rpc("quote_request_accept", { p_id: rid, p_assignee: null }), "HQ รับเรื่อง"); }
    // 5 H9x เกิน 14 วัน (ย้อนเวลาส่งคำขอ — สถานะเดินตามจริง)
    { const { n } = await ลีด(5); const rid = await ขอราคา(n);
      ต้อง(await svc.from("quote_requests").update({ submitted_at: new Date(Date.now() - 20 * 86_400_000).toISOString(), due_at: new Date(Date.now() - 6 * 86_400_000).toISOString() }).eq("id", rid), "ย้อนเวลาคำขอ"); }
    // 6 D3x ยกเลิกคำขอ
    { const { n } = await ลีด(6); const rid = await ขอราคา(n); ต้อง(await sb.rpc("quote_request_cancel", { p_id: rid, p_reason: "ลูกค้าขอเลื่อนโครงการ", p_close_lead: false }), "ยกเลิกคำขอ"); }
    // 7 D4 ได้ใบ HQ · 8 ใกล้หมดอายุ
    { const { n } = await ลีด(7); await HQส่งใบ(await ขอราคา(n)); }
    { const { n } = await ลีด(8); await HQส่งใบ(await ขอราคา(n), 3); }
    // 9 D5x ขอแก้ราคา
    { const { n } = await ลีด(9); const rid = await ขอราคา(n); await HQส่งใบ(rid);
      ต้อง(await sb.rpc("quote_request_reprice", { p_id: rid, p_reason: "ลูกค้าขอเพิ่มพื้นที่", p_spec: "เพิ่มพื้นที่เป็น 900 ตร.ม." }), "ขอแก้ราคา"); }
    // 10 D5 ใบร่าง · 11 D6 ส่งแล้ว · 12 D8 ตอบรับ · 13 D8x ปฏิเสธ
    for (const i of [10, 11, 12, 13]) {
      const { n, company } = await ลีด(i);
      const id = await ทำใบ(n, company, await HQส่งใบ(await ขอราคา(n)));
      if (i === 10) continue;
      await ส่งใบ(id);
      if (i === 12) ต้อง(await sb.rpc("close_won_quotation", { p_dealer: s.code, p_known_customer_id: null, p_lead_company: company, p_target_quote_id: id,
        p_cascade_won: false, p_customer_payload: { company, contact: `ผู้ติดต่อตัวอย่าง ${s.code}-13`, phone: `000-000-${String(n).slice(-4)}`, province: s.province } }), "ลูกค้าตอบรับ");
      if (i === 13) ต้อง(await sb.from("quotations").update({ status: "lost", lost_reason: "ราคาสูงกว่าคู่แข่ง" }).eq("dealer_code", s.code).eq("id", id), "ลูกค้าปฏิเสธ");
    }
    // 14 D8y ปิดไม่สำเร็จ
    { const { n } = await ลีด(14); ต้อง(await sb.rpc("lead_apply", { p_id: `#L-${n}`, p_intent: { stage: { status: "CANCELLED", lostReason: "ลูกค้าไม่สนใจแล้ว" }, fields: {} } }), "ปิดไม่สำเร็จ"); }
    console.log(`✓ ${s.code}: ลีดตัวอย่าง ${สถานการณ์.length} ราย ครบขั้น 1–5 · ปิดสำเร็จ · ปิดไม่สำเร็จ · คำขอราคา · ใบ HQ · ใบลูกค้า · นัดหมาย`);
  }

  // ── HQ: ลีดของ HQ รอโอน (H6) — ลีดของ HQ เข้ามาทางหลังบ้าน (ฟอร์มเว็บ/นำเข้า) ไม่ใช่ผู้ใช้กดสร้าง → กุญแจฝั่งเซิร์ฟเวอร์ ──
  for (const [i, จังหวัด] of ["ระยอง", "เชียงใหม่", "ชลบุรี"].entries()) {
    const n = 996_900_000 + i, company = `บริษัท ตัวอย่าง HQ-${String(i + 1).padStart(2, "0")} จำกัด`;
    ต้อง(await svc.from("leads").insert({ id: `#L-${n}`, num_id: n, dealer_code: "HQ", company, name: company, contact: `ผู้ติดต่อตัวอย่าง HQ-${i + 1}`,
      phone: `000-000-${String(n).slice(-4)}`, province: จังหวัด, product: "โรงงาน", source: "เว็บไซต์", status: "WAITING", note: `${ป้าย}: H6 ลีดของ HQ รอโอนให้ดีลเลอร์`,
      created_label: ป้ายวัน(วัน()) }), `ลีด HQ ${company}`);
  }
  console.log("✓ ลีดของ HQ รอโอน 3 ราย");

  // ── HQ: ผู้สนใจเป็นดีลเลอร์ทุกขั้น (H2) + ใบค่าแฟรนไชส์ (H3–H4) ──
  const ผู้สนใจ = [
    ["new", "ลำปาง", 3], ["contacted", "นครสวรรค์", -2], ["profile_sent", "สุราษฎร์ธานี", 5], ["meeting", "ขอนแก่น", 2],
    ["considering", "อุดรธานี", -1], ["lost", "ตราด", null],
  ];
  const pid = {};
  for (const [i, [status, province, ติดตาม]] of ผู้สนใจ.entries()) {
    const r = ต้อง(await hq.from("dealer_prospects").insert({ name: `ผู้สนใจตัวอย่าง ${String(i + 1).padStart(2, "0")}`, province, status,
      phone: `000-000-${String(8000 + i)}`, email: `prospect-${i + 1}@example.test`, channel: "งานแสดงสินค้า", first_contact: วัน(-14),
      note: `${ป้าย}: ผู้สนใจขั้น ${status}`, ...(status === "lost" ? { lost_reason: "ยังไม่พร้อมลงทุน" } : {}),
      follow_up: ติดตาม == null ? null : วัน(ติดตาม) }).select("id").single(), `ผู้สนใจ ${status}`);
    pid[status] = r.id;
  }
  const ใบค่า = (prospect, status, extra = {}) => hq.from("dealer_package_proposals").insert({ prospect_id: prospect, package: "standard", status,
    proposed_date: วัน(-10), contract_months: 12, annual_target: 12_000_000, amount: 300_000, ...extra }).select("id").single();
  ต้อง(await ใบค่า(pid.meeting, "sent"), "ใบค่าแฟรนไชส์ส่งแล้ว");
  ต้อง(await ใบค่า(pid.profile_sent, "draft"), "ใบค่าแฟรนไชส์ร่าง");
  { const r = ต้อง(await ใบค่า(pid.considering, "sent", { payment_due_on: วัน(-5) }), "ใบค่าแฟรนไชส์ที่จะตอบรับ");
    ต้อง(await hq.from("dealer_package_proposals").update({ status: "accepted" }).eq("id", r.id), "ตอบรับใบค่าแฟรนไชส์");
    ต้อง(await hq.from("dealer_proposal_payments").insert({ proposal_id: r.id, paid_on: วัน(-3), amount: 100_000, reference: "TR-ตัวอย่าง-01" }), "ชำระบางส่วน"); }
  console.log("✓ ผู้สนใจเป็นดีลเลอร์ 6 ราย · ใบค่าแฟรนไชส์ 3 ใบ (ร่าง · ส่งแล้ว · ตอบรับค้างชำระเลยกำหนด)");
}
