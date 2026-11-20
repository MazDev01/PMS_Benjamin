// ── ตัวช่วยงานขายร่วมของส่วนข้อมูลตัวอย่าง (ไม่ใช่ส่วน · ตัวรันไม่เรียกไฟล์นี้เอง) · 28 ต.ค. 69 ────────────────────────────
// เดินทางเดียวกับหน้าเว็บ (บัญชีดีลเลอร์/HQ + คำสั่งเดียวกับที่แอปเรียก) แบบเดียวกับส่วน "ขั้นทั้งหมด":
//   ลีด (WAITING เท่านั้น · ใบ 0256) → ขอราคา → HQ รับเรื่อง/บันทึก/ส่งใบ → ทำใบ → ส่งใบ → ตอบรับ (close_won_quotation) / ปฏิเสธ
//   ขั้นของลีด · รายการเตือน · ไทม์ไลน์ · แจ้งเตือน ฐานทำเอง — ไม่วางสถานะตรง · ไม่ติ๊กรายการเตือนผ่าน lead_apply
// ย้อนเวลา (ข้อมูลย้อนหลัง): เดินงานจริงก่อน แล้วเลื่อน "เฉพาะคอลัมน์เวลา" ของแถวที่งานนั้นสร้าง ทีละขั้นของงาน
//   ตัวดักของฐานกันแก้เวลาไว้ (ใบที่ส่งแล้ว/ใบ HQ ล็อก · updated_at เดินเอง · quotation_won_at ไม่เปิดให้บัญชีใด รวม service_role)
//   → เลื่อนด้วย SQL ฐาน dev ในธุรกรรมเดียว (session_replication_role = replica · แตะเฉพาะคอลัมน์เวลา ไม่แตะสถานะ/ยอด)
//   ยกเว้นบันทึกการใช้งาน (audit_log) — ห้ามแก้/ลบนอก 2 ทางที่บอสอนุญาต จึงคงเวลาจริง (วันที่สร้างข้อมูลตัวอย่าง)
import { spawn } from "node:child_process";
import { เบอร์งาน, รหัสลีด } from "./ตัวช่วย.mjs";

/** บัญชีเข้าระบบของสาขา — RYG/CNX จากข้อมูลตั้งต้น (tests/.env.test) · สาขาที่ส่วน "สาขา" สร้าง จากไฟล์บัญชีนอก repo */
export function บัญชีสาขา(ctx, code) {
  const t = ctx.ทดสอบ;
  if (code === "RYG") return { email: t.TEST_RYG_EMAIL, password: t.TEST_RYG_PASSWORD };
  if (code === "CNX") return { email: t.TEST_CNX_EMAIL, password: t.TEST_CNX_PASSWORD };
  const b = ctx.อ่านบัญชี().บัญชี.find(x => x.dealer_code === code);
  if (!b) throw new Error(`ยังไม่มีบัญชีของสาขา ${code} — สร้างส่วน "สาขา" ก่อน (node scripts/dev-sample-data.mjs --only=สาขา)`);
  return b;
}

/** เข้าระบบ HQ (ผู้ดูแลระบบของข้อมูลตั้งต้น) */
export const เข้าHQ = (ctx) => ctx.เข้า(ctx.ทดสอบ.TEST_ADMIN_EMAIL, ctx.ทดสอบ.TEST_ADMIN_PASSWORD);

// ── ชื่อ/ผู้ติดต่อ/ที่อยู่ที่อ่านแล้วเหมือนจริง (บอสสั่ง 18 พ.ย. 69 "ดูไม่เหมือนจริง") ─────────────────────────────────────────────
//   เดิม "บริษัท ตัวอย่าง RYG-06 จำกัด" · "ผู้ติดต่อตัวอย่าง RYG-06" · "ที่อยู่ตัวอย่าง 6 ระยอง" = รหัสสาขา/ลำดับบนจอทุกแถว
//   ตอนนี้: ชื่อบริษัทจากคำ 2 ชุด (20 × 20) + "(ตัวอย่าง)" กันชื่อซ้ำบริษัทจริง · ผู้ติดต่อ ชื่อ-สกุลจากชุดคำ · ที่อยู่ เลขที่/หมู่/ถนน/อำเภอเมือง
//   คงที่ตามกุญแจ (สาขา:เลขลีด) · ไม่ซ้ำกันในรอบเดียว (ชนแล้วเลื่อนไปชื่อถัดไป) · ลบส่วน = ชื่อของลีดในช่วงเลขของส่วน (sqlลบงานขาย)
const ต้นชื่อ = ["สยาม", "ไทยรุ่งเรือง", "เจริญผล", "ศรีสวัสดิ์", "บูรพา", "ทองไทย", "ชัยพัฒนา", "มั่นคง", "รวมใจ", "เอเชีย",
  "ประเสริฐ", "อุดมสุข", "พูนผล", "นครทอง", "วังทอง", "ศิริมงคล", "กิจเจริญ", "ธนพัฒน์", "สินทวี", "ไพบูลย์"];
const ท้ายชื่อ = ["คลังสินค้า", "โลจิสติกส์", "ฟู้ดส์", "อุตสาหกรรม", "การเกษตร", "พลาสติก", "ค้าวัสดุ", "อะไหล่ยนต์", "เฟอร์นิเจอร์", "บรรจุภัณฑ์",
  "ห้องเย็น", "ปุ๋ยเคมี", "อาหารสัตว์", "เทรดดิ้ง", "สิ่งทอ", "ยางพารา", "ค้าข้าว", "เครื่องดื่ม", "วัสดุก่อสร้าง", "เหล็กการช่าง"];
const ชื่อคน = ["สมชาย", "วิชัย", "สุนทร", "ประเสริฐ", "อนุชา", "กิตติ", "ธนากร", "ณัฐพล", "สุรเชษฐ์", "พงศกร",
  "สุภาพร", "วรรณา", "จันทร์เพ็ญ", "นภาพร", "กัญญา", "ศิริพร", "อรุณี", "ปวีณา", "รัตนา", "มาลี"];
const สกุล = ["ใจดี", "ศรีสุข", "ทองดี", "บุญมา", "แก้วประเสริฐ", "รุ่งเรืองศรี", "สมบูรณ์ชัย", "วงศ์สวัสดิ์", "พรหมมา", "จันทร์แก้ว",
  "สุขเจริญ", "มณีรัตน์", "ชัยมงคล", "ศักดิ์สิทธิ์", "อินทร์แก้ว", "เพชรรัตน์", "บุญเรือง", "ทองมา", "สิทธิชัย", "พงษ์พันธ์"];
const ถนน = ["เทศบาล 1", "ราษฎร์บำรุง", "สุขาภิบาล 2", "ประชาร่วมใจ", "เจริญสุข", "ศรีสุนทร", "นิมิตใหม่", "พัฒนาการ"];   // ชื่อถนนทั่วไป (ไม่ผูกทางหลวงจริงของภาคใด)
const เลขกุญแจ = (k) => { let h = 2166136261; for (const ch of String(k)) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0; return h; };
const ชื่อที่ใช้แล้ว = new Map();   // ชื่อ → กุญแจ (ไม่ซ้ำกันในรอบเดียว)
/** ชื่อบริษัทลูกค้า (คงที่ตามกุญแจ · ไม่ซ้ำในรอบ) เช่น "บริษัท สยามคลังสินค้า (ตัวอย่าง) จำกัด" */
export function ชื่อบริษัทสมจริง(กุญแจ) {
  const ทั้งหมด = ต้นชื่อ.length * ท้ายชื่อ.length;
  for (let k = 0, i = เลขกุญแจ(กุญแจ) % ทั้งหมด; k < ทั้งหมด; k++, i = (i + 37) % ทั้งหมด) {
    const ชื่อ = `บริษัท ${ต้นชื่อ[Math.floor(i / ท้ายชื่อ.length)]}${ท้ายชื่อ[i % ท้ายชื่อ.length]} (ตัวอย่าง) จำกัด`;
    const เจ้าของ = ชื่อที่ใช้แล้ว.get(ชื่อ);
    if (เจ้าของ == null || เจ้าของ === String(กุญแจ)) { ชื่อที่ใช้แล้ว.set(ชื่อ, String(กุญแจ)); return ชื่อ; }
  }
  throw new Error("ชื่อบริษัทตัวอย่างไม่พอ");
}
const ความต้องการ = ["ต้องการเริ่มก่อสร้างภายใน 3 เดือน", "ขอเทียบราคา 2–3 ราย ก่อนตัดสินใจ", "มีที่ดินแล้ว รอยื่นขออนุญาตก่อสร้าง",
  "ขยายจากโกดังเดิมที่เต็มแล้ว", "ต้องการพื้นที่เก็บสต็อกเพิ่มช่วงปลายปี", "งบประมาณอนุมัติแล้ว รอใบเสนอราคา", "ให้ช่วยดูหน้างานก่อนสรุปขนาด",
  "ต้องการประตูม้วนรถบรรทุกเข้าได้"];
/** หมายเหตุลีดแบบที่พนักงานขายจดจริง: สเปกตามพื้นที่ + ความต้องการของลูกค้า (คงที่ตามเลขลีด) */
export const หมายเหตุลีด = (n, A) => `${สเปกโกดัง(A)} · ${ความต้องการ[เลขกุญแจ(`หมายเหตุ:${n}`) % ความต้องการ.length]}`;
/** ผู้ติดต่อ เช่น "คุณสมชาย ใจดี" (คงที่ตามกุญแจ) */
export const ผู้ติดต่อสมจริง = (กุญแจ) => { const h = เลขกุญแจ(`คน:${กุญแจ}`); return `คุณ${ชื่อคน[h % ชื่อคน.length]} ${สกุล[Math.floor(h / 97) % สกุล.length]}`; };
/** ที่อยู่ เช่น "88/12 หมู่ 4 ถ.สุขุมวิท อ.เมืองระยอง จ.ระยอง" (คงที่ตามกุญแจ · กรุงเทพฯ = เขต) */
export const ที่อยู่สมจริง = (กุญแจ, จังหวัด) => {
  const h = เลขกุญแจ(`ที่:${กุญแจ}`);
  const เลข = `${10 + (h % 290)}/${1 + (Math.floor(h / 7) % 40)}`, หมู่ = 1 + (Math.floor(h / 13) % 9), ถ = ถนน[Math.floor(h / 31) % ถนน.length];
  return จังหวัด === "กรุงเทพมหานคร" ? `${เลข} ถ.${ถ} เขตบางนา กรุงเทพมหานคร` : `${เลข} หมู่ ${หมู่} ถ.${ถ} อ.เมือง${จังหวัด} จ.${จังหวัด}`;
};

// ── ข้อมูลให้สัมพันธ์กันทุกขั้น (บอสสั่ง 18 พ.ย. 69 "ตัวอย่างข้อมูลสมจริงให้สัมพันธ์กันทั้งหมด") ──
//   พื้นที่ของงาน → คำขอราคา (พื้นที่ · สเปกบอกพื้นที่) → ใบ HQ (รายการวัสดุคำนวณจากพื้นที่) → ใบลูกค้า (บวก % ดีลเลอร์)
/** รายการวัสดุของโกดังโครงเหล็ก พื้นที่ A ตร.ม. (สูง 8 ม.) — ต้นทุน HQ ราว 2,100–2,400 บาท/ตร.ม. (โครงสร้าง/หลังคา/ผนัง/ประตู · ไม่รวมฐานราก) */
export function รายการโกดัง(A) {
  const ด้าน = Math.sqrt(A);
  // โครงเหล็กเป็นสัดส่วนหลักของใบ (บอสสั่ง 20 พ.ย. 69 "ข้อมูลตัวอย่างเน้นโครงเหล็ก") — เสา คาน โครงหลังคา แป ~70% ของยอด
  //   น้ำหนักเหล็กรวม ~40 กก./ตร.ม. (เสา 12 · คาน 10 · โครงถัก 8 · แป 6 · ค้ำยัน/แผ่นต่อ 4) · หลังคา/ผนัง/ประตู = ส่วนที่เหลือ
  const ตัน = (กกต่อตรม) => Math.max(0.1, Math.round(A * กกต่อตรม / 1000 * 10) / 10);
  return [
    { name: "เสาเหล็ก H-Beam", qty: ตัน(12), unit: "ตัน", unitCost: 42000 },
    { name: "คานเหล็ก H-Beam", qty: ตัน(10), unit: "ตัน", unitCost: 42000 },
    { name: "โครงหลังคาเหล็ก (โครงถัก)", qty: ตัน(8), unit: "ตัน", unitCost: 44000 },
    { name: "แปเหล็กตัวซี", qty: ตัน(6), unit: "ตัน", unitCost: 38000 },
    { name: "เหล็กค้ำยันและแผ่นต่อ", qty: ตัน(4), unit: "ตัน", unitCost: 40000 },
    { name: "แผ่นหลังคาเมทัลชีท 0.47 มม.", qty: Math.ceil(A * 1.08), unit: "ตร.ม.", unitCost: 290 },           // เผื่อลาดเอียง/ทับซ้อน 8%
    { name: "ผนังเมทัลชีท 0.40 มม.", qty: Math.round(4 * ด้าน * 7), unit: "ตร.ม.", unitCost: 240 },            // เส้นรอบรูป × สูงผนัง 7 ม.
    { name: "ประตูม้วน 4x5 ม.", qty: 1 + Math.floor(A / 800), unit: "ชุด", unitCost: 65000 },
  ];
}
export const ยอดรายการ = (lines) => lines.reduce((s, l) => s + Math.round(l.qty * l.unitCost * 100) / 100, 0);
export const สเปกโกดัง = (A) => `อาคารโครงเหล็ก ${A.toLocaleString("en-US")} ตร.ม. · เสา/คาน H-Beam · โครงหลังคาเหล็กถัก · แปตัวซี · สูง 8 ม. · หลังคา/ผนังเมทัลชีท · ประตูม้วน`;
/** พื้นที่ตามขนาดงาน (ตัวคูณ 1 = โกดังราว 700 ตร.ม. · ปัดหลักสิบ) */
export const พื้นที่ของขนาด = (ตัวคูณ = 1) => Math.round(700 * ตัวคูณ / 10) * 10;
/** ตัวคูณจำนวนในราคาประเมินของดีลเลอร์ (กะเผื่อ/กะขาด) — ยอดประเมินต่างจากใบ HQ ±5–15% */
export const ตัวคูณประเมิน = [0.92, 1.07, 0.88, 1.10, 0.95, 1.13, 0.90, 1.06, 0.87, 1.09, 0.94, 1.12, 0.91, 1.08, 0.86];
/** รายการราคาใบ HQ ตามขนาดงาน = รายการโกดังของพื้นที่นั้น */
export const รายการHQ = (ตัวคูณ = 1) => รายการโกดัง(พื้นที่ของขนาด(ตัวคูณ));

/**
 * งานขายของสาขาหนึ่ง — คืนคำสั่งทีละขั้นแบบที่หน้าเว็บเรียก
 * @param {{ code: string, province: string, sb: any, hq: any, ป้ายส่วน: string }} o
 *   ป้ายส่วน = คำในชื่อบริษัทของส่วนนั้น (ชื่อตามสูตร "บริษัท <ป้ายส่วน> <สาขา>-<ลำดับ> จำกัด" · ส่วนลบหาด้วยคำนี้)
 */
export async function งานขายของสาขา(ctx, { code, province, sb, hq, ป้ายส่วน }) {
  const { svc, วัน, ป้ายวัน, ต้อง, เบอร์ } = ctx;
  const { data: คน } = await svc.from("responsible_persons").select("name").eq("dealer_code", code).eq("active", true).limit(1);
  const ผู้รับผิดชอบ = คน?.[0]?.name ?? "";
  // ชื่อ/ผู้ติดต่อ/ที่อยู่สมจริง (ตัวช่วยกลางด้านบน · กุญแจ สาขา:เลขลีด) — ป้ายส่วนไม่อยู่ในชื่อแล้ว (ลบส่วนตามช่วงเลขลีด)
  void ป้ายส่วน;
  const ชื่อบริษัท = (n) => ชื่อบริษัทสมจริง(`${code}:${n}`);
  const ผู้ติดต่อ = (n) => ผู้ติดต่อสมจริง(`${code}:${n}`);

  /** ลีดใหม่ (WAITING · ทางเดียวที่ฐานยอม) · ย้อนวัน = วันที่ลีดเข้ามา (ป้ายวันที่ที่แอปเก็บ · created_date ฐานคิดจากป้ายนี้)
   *  เรื่อง = สถานการณ์ของรายนี้ (เอกสารในโค้ดเท่านั้น · หมายเหตุบนจอ = ความต้องการของลูกค้าแบบจริง · เดิมขึ้น "ข้อมูลตัวอย่าง: <สถานการณ์>") */
  const ลีด = async (n, { ย้อนวัน = 0, เรื่อง = "", customerId = null, company, ขนาด = 1 } = {}) => {
    void เรื่อง;
    const บริษัท = company ?? ชื่อบริษัท(n);
    ต้อง(await sb.from("leads").insert({
      id: รหัสลีด(n), num_id: n, dealer_code: code, company: บริษัท, name: บริษัท,
      contact: ผู้ติดต่อ(n), phone: เบอร์งาน(n),
      email: `sample-${code.toLowerCase()}-${n % 100_000}@example.test`, address: ที่อยู่สมจริง(`${code}:${n}`, province), province,
      product: "โกดังเก็บสินค้า", project: "โกดังเก็บสินค้า", area: String(พื้นที่ของขนาด(ขนาด)), source: ["แนะนำต่อ", "เว็บไซต์", "Facebook", "LINE", "ลูกค้าเข้ามาเอง", "งานแสดงสินค้า"][n % 6],
      assigned: ผู้รับผิดชอบ, status: "WAITING", note: หมายเหตุลีด(n, พื้นที่ของขนาด(ขนาด)), created_label: ป้ายวัน(วัน(-ย้อนวัน)),
      ...(customerId ? { customer_id: customerId } : {}),
    }), `สร้างลีด ${บริษัท}`);
    return { n, company: บริษัท };
  };
  // รายการในคำขอ (ใบ 0290 · 20 พ.ย. 69): ดีลเลอร์พิมพ์ รายการ · จำนวน · หน่วย เอง ไม่มีราคา · เฉพาะงานโครงเหล็ก + หลังคา
  //   ดีลเลอร์กะจำนวนเอง ต่างจากใบ HQ ±5–15% (ตัวคูณประจำงาน) · เดิมเลือกจากรายการวัสดุ (เอาออกทั้งระบบแล้ว)
  const ประเมิน = async (n, A) => {
    const f = ตัวคูณประเมิน[n % ตัวคูณประเมิน.length];
    return รายการโกดัง(A).filter(l => l.unit === "ตัน" || /หลังคา/.test(l.name)).map(l => ({ name: l.name, unit: l.unit,
      qty: l.unit === "ตัน" ? Math.round(l.qty * f * 10) / 10 : Math.max(1, Math.round(l.qty * f)) }));
  };
  const ขอราคา = async (n, ขนาด = 1) => Number(ต้อง(await sb.rpc("quote_request_submit", {
    p_lead_num_id: n, p_product: "โกดังโครงเหล็กเก็บสินค้า", p_subtype: "", p_area: พื้นที่ของขนาด(ขนาด),
    p_spec: สเปกโกดัง(พื้นที่ของขนาด(ขนาด)), p_province: province, p_estimate: await ประเมิน(n, พื้นที่ของขนาด(ขนาด)) }), `ขอราคา ${n}`).id);
  const HQรับเรื่อง = async (rid) => ต้อง(await hq.rpc("quote_request_accept", { p_id: rid, p_assignee: null }), `HQ รับเรื่อง ${rid}`);
  const HQบันทึกใบ = async (rid, { ขนาด = 1, วันยืนราคา = 30 } = {}) => ต้อง(await hq.rpc("hq_quote_save", {
    p_request_id: rid, p_valid_until: วัน(วันยืนราคา), p_note: "ราคาวัสดุตามพื้นที่ในคำขอ · ไม่รวมงานฐานราก", p_lines: รายการHQ(ขนาด) }), `HQ บันทึกใบ ${rid}`);
  const HQส่งใบ = async (rid, o = {}) => {
    await HQบันทึกใบ(rid, o);
    return Number(ต้อง(await hq.rpc("hq_quote_send", { p_request_id: rid }), `HQ ส่งใบ ${rid}`).id);
  };
  /** ทำใบให้ลูกค้า (ร่าง) จากใบ HQ + % ที่บวก · วันยืนราคา = วันหมดอายุในใบ (ว่าง = ตามอายุใบของสาขา) */
  const ทำใบ = async (n, company, hqQuoteId, { บวก = 15, วันยืนราคา = null } = {}) => {
    const { data: hqq } = await sb.from("hq_quotes").select("line_items").eq("id", hqQuoteId).single();
    const lines = (hqq?.line_items ?? []).map(l => ({ name: l.name, qty: l.qty, unit: l.unit, unitPrice: 0, markupPct: บวก }));
    // รายการของดีลเลอร์ (ใบ 0291 · 20 พ.ย. 69): งานลูกค้าเลขคู่ ดีลเลอร์รับงานที่ใบ HQ ไม่มีเอง — รางน้ำ/ครอบหลังคา + เทพื้นคอนกรีต (ราคาขายตั้งเอง)
    if (n % 2 === 0) {
      const พื้นที่ = Math.round((hqq?.line_items ?? []).find(l => /หลังคา/.test(l.name) && l.unit === "ตร.ม.")?.qty / 1.08 || 700);
      lines.push({ source: "dealer", name: "รางน้ำฝนและครอบหลังคา (ดีลเลอร์จัดหาเอง)", qty: 1, unit: "งาน", unitPrice: 30000 + (n % 5) * 5000 },
                 { source: "dealer", name: "งานเทพื้นคอนกรีตหนา 15 ซม. (ผู้รับเหมาของดีลเลอร์)", qty: พื้นที่, unit: "ตร.ม.", unitPrice: 650 + (n % 4) * 25 });
    }
    return String(ต้อง(await sb.rpc("create_quotation", { p_dealer: code, p_prefix: "Q-", p_payload: {
      customer: company, project: "โกดังโครงเหล็กเก็บสินค้า", province, total: "0", status: "draft", date: วัน(),
      line_items: lines, items: lines.length, hq_quote_id: hqQuoteId, deal_id: n, markup_percent: บวก,
      ...(วันยืนราคา != null ? { expiry: วัน(วันยืนราคา) } : {}) } }), `ทำใบ ${company}`).id);
  };
  const ส่งใบ = async (id) => ต้อง(await sb.rpc("quotation_send", { p_dealer: code, p_id: id }), `ส่งใบ ${id}`);
  /** ลูกค้าต่อรอง → ทำฉบับใหม่ (V2) จากใบที่ส่งแล้ว · เปลี่ยนได้แค่ % ที่บวก */
  const ฉบับใหม่ = async (id, บวก = 12) => {
    const v2 = ต้อง(await sb.rpc("quotation_new_version", { p_dealer: code, p_id: id }), `ทำฉบับใหม่ ${id}`);
    const lines = (v2.line_items ?? []).map(l => ({ ...l, markupPct: บวก }));
    ต้อง(await sb.from("quotations").update({ line_items: lines, markup_percent: บวก }).eq("dealer_code", code).eq("id", v2.id), `แก้ % ฉบับใหม่ ${v2.id}`);
    return String(v2.id);
  };
  /** ลูกค้าตอบรับ — ทางเดียวที่ปิดสำเร็จ (ลีด → PAID · สร้าง/ผูกลูกค้า · คำขอ + ใบ HQ → สั่งผลิต) · ลูกค้าเดิม = ส่งเลขลูกค้า */
  const ตอบรับ = async (n, company, id, { customerId = null } = {}) => ต้อง(await sb.rpc("close_won_quotation", {
    p_dealer: code, p_known_customer_id: customerId, p_lead_company: company, p_target_quote_id: id, p_cascade_won: false,
    p_customer_payload: { company, name: company, contact: ผู้ติดต่อ(n), address: ที่อยู่สมจริง(`${code}:${n}`, province),
      phone: เบอร์งาน(n), email: `sample-${code.toLowerCase()}-${n % 100_000}@example.test`, province } }), `ลูกค้าตอบรับ ${id}`);
  const ปฏิเสธ = async (id, เหตุผล = "ราคาสูงกว่าคู่แข่ง") => ต้อง(await sb.from("quotations").update({ status: "lost", lost_reason: เหตุผล })
    .eq("dealer_code", code).eq("id", id), `ลูกค้าปฏิเสธ ${id}`);
  const ปิดไม่สำเร็จ = async (n, เหตุผล = "ลูกค้าไม่สนใจแล้ว") => ต้อง(await sb.rpc("lead_apply", { p_id: รหัสลีด(n),
    p_intent: { stage: { status: "CANCELLED", lostReason: เหตุผล }, fields: {} } }), `ปิดไม่สำเร็จ ${n}`);
  /** นัดหมาย (สร้างที่แผงลีด › นัดหมาย) · สถานะเริ่ม upcoming แล้วค่อยกดเสร็จ/ยกเลิก แบบหน้าปฏิทิน */
  const นัด = async (n, company, { ห่างวัน = 0, เวลา = "10:00", type = "visit", ลำดับ = 1, เรื่อง = "นัดดูหน้างาน" } = {}) => {
    const id = n * 10 + ลำดับ;
    ต้อง(await sb.from("appointments").insert({ id, dealer_code: code, lead_id: n, company, contact: ผู้ติดต่อ(n),
      phone: เบอร์งาน(n), project: "โกดังเก็บสินค้า", province, date: วัน(ห่างวัน), time: เวลา, type, assigned: ผู้รับผิดชอบ,
      status: "upcoming", note: เรื่อง }), `นัด ${company}`);   // หมายเหตุนัด = เรื่องที่นัด (เดิมขึ้น "ข้อมูลตัวอย่าง: …")
    return id;
  };
  const สถานะนัด = async (id, status) => ต้อง(await sb.from("appointments").update({ status }).eq("dealer_code", code).eq("id", id), `นัด ${id} → ${status}`);

  /** ทั้งเส้นจนส่งใบ → { rid, hqId, qid } */
  const ถึงส่งใบ = async (n, company, { ขนาด = 1, บวก = 15, วันยืนราคา = null, จด = () => {} } = {}) => {
    จด(1); const rid = await ขอราคา(n, ขนาด);
    จด(2); await HQรับเรื่อง(rid); const hqId = await HQส่งใบ(rid, { ขนาด });
    จด(3); const qid = await ทำใบ(n, company, hqId, { บวก, วันยืนราคา }); await ส่งใบ(qid);
    return { rid, hqId, qid };
  };
  return { code, province, sb, ผู้รับผิดชอบ, ชื่อบริษัท, ลีด, ขอราคา, HQรับเรื่อง, HQบันทึกใบ, HQส่งใบ, ทำใบ, ส่งใบ, ฉบับใหม่, ตอบรับ,
    ปฏิเสธ, ปิดไม่สำเร็จ, นัด, สถานะนัด, ถึงส่งใบ };
}

// ═══ ย้อนเวลา ═══════════════════════════════════════════════════════════════════════════════════════════════════
// งานหนึ่งงาน (ลีดหนึ่งราย) แบ่งเป็นขั้นตามจังหวะที่เกิดจริง: 0 ลีดเข้ามา · 1 ขอราคา · 2 HQ ตีราคา/ส่งใบ · 3 ทำ/ส่งใบลูกค้า · 4 ลูกค้าตอบ
//   จด(ขั้น) ก่อนเริ่มขั้นนั้น — เก็บเวลาจริง (เทียบนาฬิกาฐาน) + จำนวนรายการในไทม์ไลน์ลีด ณ ตอนนั้น
//   ตอนสั่ง: ทุกคอลัมน์เวลาของแถวที่งานนั้นสร้าง ถูกเลื่อนถอยหลังตาม "ย้อนกี่วัน" ของขั้นที่เวลานั้นตกอยู่ (+ ชั่วโมงสุ่มคงที่)
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const พักสั้น = () => new Promise((ok) => setTimeout(ok, 30));

/** นาฬิกาฐาน (docker) − นาฬิกาเครื่อง (มิลลิวินาที) — วัดในการเชื่อมต่อ psql ที่เปิดค้างไว้ (ไป-กลับไม่กี่มิลลิวินาที)
 *  เดิมวัดด้วย docker exec ครั้งเดียว ซึ่งช้าไม่แน่นอนเป็นวินาที → จุดแบ่งขั้นคลาดจนเวลาไม่ถูกเลื่อน */
async function นาฬิกาต่าง(ctx) {
  const p = spawn("docker", ["exec", "-i", ctx.คอนเทนเนอร์, "psql", "-U", "postgres", "-d", "postgres", "-At"], { stdio: ["pipe", "pipe", "inherit"] });
  let รับ = () => {}; let ค้าง = "";
  p.stdout.on("data", (d) => { ค้าง += d; const i = ค้าง.indexOf("\n"); if (i >= 0) { const l = ค้าง.slice(0, i); ค้าง = ค้าง.slice(i + 1); รับ(l); } });
  const ถาม = (sql) => new Promise((ok) => { รับ = ok; p.stdin.write(sql + "\n"); });
  await ถาม("select 1;");
  let ดีสุด = null;
  for (let i = 0; i < 5; i++) {
    const t1 = performance.timeOrigin + performance.now();
    const ฐาน = Number(await ถาม("select (extract(epoch from clock_timestamp()) * 1000)::numeric(20,3);"));
    const t2 = performance.timeOrigin + performance.now();
    if (!ดีสุด || t2 - t1 < ดีสุด.ไปกลับ) ดีสุด = { ไปกลับ: t2 - t1, ต่าง: ฐาน - (t1 + t2) / 2 };
  }
  p.stdin.end();
  await new Promise((ok) => p.on("close", ok));
  return ดีสุด.ต่าง;
}

export async function ตัวย้อนเวลา(ctx) {
  const ต่าง = await นาฬิกาต่าง(ctx);
  const เวลาฐาน = () => new Date(Date.now() + ต่าง).toISOString();
  const งาน = [];

  return {
    /** เริ่มจดงานหนึ่ง · ย้อน = [วันของขั้น 0, 1, 2, 3, 4] (จำนวนวันที่ถอยหลังจากวันนี้ · ต้องไม่เพิ่มขึ้นตามขั้น) */
    งาน(dealer, num, ย้อน, ชั่วโมง = 0) {
      // ช่วงเวลาของงานก่อนหน้าจบตรงนี้ — แถวที่ไม่ผูกงาน (แจ้งเตือน/อีเมล/บันทึก) เลื่อนตามงานที่ช่วงเวลาครอบอยู่ งานละครั้ง
      const ก่อนหน้า = งาน.at(-1);
      if (ก่อนหน้า && !ก่อนหน้า.จบ) ก่อนหน้า.จบ = เวลาฐาน();
      const g = { dealer, num, ย้อน, ชั่วโมง, จุด: [] };
      งาน.push(g);
      return async (ขั้น) => {
        let ยาว = 0;
        if (ขั้น > 0) {
          const { data } = await ctx.svc.from("leads").select("activities").eq("dealer_code", dealer).eq("num_id", num).maybeSingle();
          ยาว = Array.isArray(data?.activities) ? data.activities.length : 0;
        }
        // เว้นช่วงสั้น ๆ ก่อน/หลังจุดแบ่ง — กันความคลาดของนาฬิกาที่วัดได้ (ไม่กี่มิลลิวินาที) ทำให้แถวข้ามขั้น
        await พักสั้น();
        g.จุด[ขั้น] = { at: เวลาฐาน(), ยาว };
        await พักสั้น();
      };
    },
    /** ปิดช่วงของงานล่าสุด (ก่อนทำอย่างอื่นที่ไม่ใช่งานที่จด) */
    พัก() { const g = งาน.at(-1); if (g && !g.จบ) g.จบ = เวลาฐาน(); },
    /** เลื่อนเวลาของทุกงานที่จดไว้ในธุรกรรมเดียว */
    สั่ง() {
      const จบ = เวลาฐาน();
      const คำสั่ง = งาน.filter(g => g.จุด.some(Boolean)).map(g => คำสั่งของงาน(g, g.จบ ?? จบ));
      if (!คำสั่ง.length) return 0;
      ctx.sql(`begin;
        set local session_replication_role = replica;
        alter table public.quotations disable trigger zz_quotations_updated_at;
        alter table public.quotations disable trigger quotations_vat_fill;
        ${คำสั่ง.join("\n")}
        alter table public.quotations enable always trigger zz_quotations_updated_at;
        alter table public.quotations enable always trigger quotations_vat_fill;
        commit;`);
      return คำสั่ง.length;
    },
  };
}

function คำสั่งของงาน(g, จบ) {
  const ขั้น = g.จุด.map((p, i) => (p ? { ...p, วัน: Math.max(0, g.ย้อน[i] ?? g.ย้อน.at(-1)) } : null)).filter(Boolean);
  const ช่วงเลื่อน = (วัน) => `interval '${วัน} days ${g.ชั่วโมง} hours'`;
  // ระยะที่เลื่อนของเวลา c: ขั้นสุดท้ายที่เริ่มก่อน c · ก่อนงานเริ่ม/หลังงานจบ = ไม่เลื่อน
  const O = (c) => `(case when ${c} is null or ${c} < ${q(ขั้น[0].at)} or ${c} > ${q(จบ)} then interval '0'
      ${[...ขั้น].reverse().map(p => `when ${c} >= ${q(p.at)} then ${ช่วงเลื่อน(p.วัน)}`).join(" ")} else interval '0' end)`;
  const S = (c) => `(${c} - ${O(c)})`;
  const วันไทย = (t) => `((${t}) at time zone 'Asia/Bangkok')::date`;
  const D = q(g.dealer), N = g.num;
  // ไทม์ไลน์ลีด: รายการลำดับที่ i อยู่ขั้นไหน = จำนวนรายการ ณ จุดเริ่มขั้น (รายการที่ไม่มี at ใช้ป้ายวันที่ · ความละเอียดนาที)
  const ขั้นของรายการ = `(case ${[...ขั้น].reverse().map(p => `when o - 1 >= ${p.ยาว} then ${ช่วงเลื่อน(p.วัน)}`).join(" ")} else ${ช่วงเลื่อน(ขั้น[0].วัน)} end)`;
  const เวลาเดิม = `coalesce(case when x ->> 'at' ~ '^\\d{4}-' then (x ->> 'at')::timestamptz end,
      (parse_thai_date(split_part(x ->> 'date', ' · ', 1))
        + coalesce(nullif(split_part(x ->> 'date', ' · ', 2), '')::time, time '12:00'))::timestamp at time zone 'Asia/Bangkok')`;
  // รายการเตือนที่ฐานติ๊ก: ขั้นตามชนิดงาน (ส่งคำขอราคา = 1 · ได้ใบ HQ = 2 · ทำ/ส่งใบ = 3 · อื่น ๆ = 0)
  const วันขั้น = (i) => (ขั้น.find((_, k) => k === i) ?? ขั้น.at(-1)).วัน;
  const วันรายการเตือน = `(case t ->> 'key' when 'requestQuote' then ${วันขั้น(1)} when 'hqQuote' then ${วันขั้น(2)}
      when 'makeQuote' then ${วันขั้น(3)} when 'sendQuote' then ${วันขั้น(3)} else ${วันขั้น(0)} end)`;
  const คำขอ = `(select id from public.quote_requests where dealer_code = ${D} and lead_num_id = ${N})`;
  const ใบ = `public.quotations where dealer_code = ${D} and deal_id = ${N}`;
  const ในช่วง = (c) => `${c} >= ${q(ขั้น[0].at)} and ${c} <= ${q(จบ)}`;
  return `
    update public.leads set created_at = ${S("created_at")},
        activities = (select coalesce(jsonb_agg(case when z.t0 is null then x else x
            || jsonb_build_object('date', _thai_date(z.t0 - ${ขั้นของรายการ}, true))
            || case when x ? 'at' then jsonb_build_object('at', z.t0 - ${ขั้นของรายการ}) else '{}'::jsonb end
          end order by o), '[]'::jsonb)
          from jsonb_array_elements(coalesce(activities, '[]'::jsonb)) with ordinality a(x, o) cross join lateral (select ${เวลาเดิม} as t0) z),
        tasks = (select coalesce(jsonb_agg(case when coalesce(t ->> 'doneAt', '') <> '' and parse_thai_date(t ->> 'doneAt') is not null
            then t || jsonb_build_object('doneAt', _thai_date(((parse_thai_date(t ->> 'doneAt') - ${วันรายการเตือน}) + time '12:00')::timestamp at time zone 'Asia/Bangkok', false))
            else t end order by o), '[]'::jsonb) from jsonb_array_elements(coalesce(tasks, '[]'::jsonb)) with ordinality b(t, o))
      where dealer_code = ${D} and num_id = ${N};
    update public.leads set last_contact_at = coalesce(lead_last_activity_date(activities), created_date) where dealer_code = ${D} and num_id = ${N};
    update public.quote_request_events set at = ${S("at")} where request_id in ${คำขอ};
    update public.hq_quotes set created_at = ${S("created_at")}, updated_at = ${S("updated_at")}, sent_at = ${S("sent_at")},
        ordered_at = ${S("ordered_at")}, valid_until = valid_until - (${วันไทย("coalesce(sent_at, created_at)")} - ${วันไทย(S("coalesce(sent_at, created_at)"))})
      where request_id in ${คำขอ};
    update public.quote_requests set submitted_at = ${S("submitted_at")}, due_at = due_at - ${O("submitted_at")}, accepted_at = ${S("accepted_at")},
        quoted_at = ${S("quoted_at")}, closed_at = ${S("closed_at")}, updated_at = ${S("updated_at")}, overdue_notified_at = ${S("overdue_notified_at")}
      where id in ${คำขอ};
    update public.quotation_won_at w set won_at = ${S("w.won_at")}
      from public.quotations qq where qq.dealer_code = ${D} and qq.deal_id = ${N} and w.dealer_code = qq.dealer_code and w.quote_id = qq.id;
    update public.customers c set created_at = ${S("c.created_at")}, join_date = to_char(${วันไทย(S("c.created_at"))}, 'YYYY-MM-DD')
      where c.dealer_code = ${D} and ${ในช่วง("c.created_at")} and c.id in (select customer_id from ${ใบ});
    -- ใบลูกค้า: วันที่ใบ/วันหมดอายุเลื่อนตามวันที่สร้างใบ
    -- won_at ของใบ (คอลัมน์ที่รายงานยอดขายอ่าน · _q_report_date) เลื่อนด้วย — เดิมเลื่อนแค่ตาราง quotation_won_at → ยอดย้อนหลังกองที่เดือนนี้ (18 พ.ย. 69)
    update public.quotations set created_at = ${S("created_at")}, updated_at = ${S("updated_at")}, won_at = ${S("won_at")},
        date = case when date ~ '^\\d{4}-\\d{2}-\\d{2}' then to_char(${วันไทย(S("created_at"))}, 'YYYY-MM-DD') else date end,
        date_normalized = case when date ~ '^\\d{4}-\\d{2}-\\d{2}' then ${วันไทย(S("created_at"))} else date_normalized end,
        expiry = case when expiry ~ '^\\d{4}-\\d{2}-\\d{2}' then to_char(substring(expiry, 1, 10)::date - (${วันไทย("created_at")} - ${วันไทย(S("created_at"))}), 'YYYY-MM-DD') else expiry end
      where dealer_code = ${D} and deal_id = ${N};
    update public.notifications set created_at = ${S("created_at")} where ${ในช่วง("created_at")} and (dealer_code = ${D} or dealer_code is null or dealer_code = '');
    update public.email_outbox set created_at = ${S("created_at")}, sent_at = ${S("sent_at")}, next_attempt_at = ${S("next_attempt_at")} where ${ในช่วง("created_at")};`;
  // บันทึกการใช้งาน (audit_log) ไม่เลื่อน — ตารางต่อท้ายอย่างเดียว ทางแก้/ลบมีได้แค่ 2 ทาง (ใบ 0241 · check-audit-delete-paths)
}

// ═══ ลบของส่วน ══════════════════════════════════════════════════════════════════════════════════════════════════
/**
 * SQL ลบงานขายของส่วนหนึ่ง (ช่วงเลขลีด + ลูกค้าตามคำในชื่อบริษัท) — ใบที่ส่ง/ตอบรับแล้ว · ใบ HQ ที่ส่งแล้ว ฐานกันการลบ
 * จึงปิดตัวกันชั่วคราวในธุรกรรมเดียว (แบบเดียวกับส่วน "ขั้นทั้งหมด" และตัวล้างของข้อทดสอบ)
 * @param {[number, number][]} ช่วง  ช่วงเลขลีดของส่วน (รวมปลาย)
 * @param {string[]} บริษัท  รูปแบบ like ของชื่อลูกค้าที่ส่วนนี้สร้าง
 */
export function sqlลบงานขาย(ช่วง, บริษัท = []) {
  const ใน = (c) => `(${ช่วง.map(([a, b]) => `${c} between ${a} and ${b}`).join(" or ")})`;
  // ลูกค้าของส่วน = ชื่อบริษัทของลีดในช่วงเลขของส่วน (เก็บก่อนลบลีด · ชื่อสมจริงไม่มีป้ายส่วนแล้ว 18 พ.ย. 69) + รูปแบบชื่อเดิม (ฐานที่ลงก่อนหน้า)
  const ลูกค้า = `(company in (select company from ชื่อในส่วน)${บริษัท.length ? ` or ${บริษัท.map(p => `company like ${q(p)}`).join(" or ")}` : ""})`;
  const แจ้งเตือน = `(exists (select 1 from ชื่อในส่วน c where coalesce(title, '') || coalesce(body, '') like '%' || replace(replace(c.company, 'บริษัท ', ''), ' จำกัด', '') || '%')${
    บริษัท.length ? ` or ${บริษัท.map(p => `coalesce(title, '') || coalesce(body, '') like ${q(p.replace(/^บริษัท /, "%"))}`).join(" or ")}` : ""})`;
  return `begin;
    create temp table ชื่อในส่วน on commit drop as select distinct company from public.leads where ${ใน("num_id")} and coalesce(company, '') <> '';
    alter table public.hq_quotes disable trigger hq_quotes_lock_sent;
    alter table public.quotations disable trigger quotations_no_delete_won;
    delete from public.files where ${ใน("record_id")} or customer_id in (select id from public.customers where ${ลูกค้า});
    delete from public.customer_notes where customer_id in (select id from public.customers where ${ลูกค้า});
    delete from public.quotations where ${ใน("deal_id")} or customer_id in (select id from public.customers where ${ลูกค้า});
    delete from public.hq_quotes h using public.quote_requests r where h.request_id = r.id and ${ใน("r.lead_num_id")};
    alter table public.hq_quotes enable trigger hq_quotes_lock_sent;
    alter table public.quotations enable trigger quotations_no_delete_won;
    delete from public.email_outbox o using public.quote_requests r where o.ref_table = 'quote_requests' and o.ref_id = r.id::text and ${ใน("r.lead_num_id")};
    update public.quote_requests set supersedes_id = null, root_id = null where ${ใน("lead_num_id")};
    select set_config('pms.quote_request_delete', 'test', false);   -- ตัวกันห้ามลบคำขอ (ใบ 0280) ยอมเฉพาะชุดล้างข้อมูลทดสอบ
    delete from public.quote_requests where ${ใน("lead_num_id")};
    delete from public.appointments where ${ใน("lead_id")};
    delete from public.leads where ${ใน("num_id")} or customer_id in (select id from public.customers where ${ลูกค้า});
    delete from public.notifications where ${แจ้งเตือน};
    delete from public.customers where ${ลูกค้า};
    commit;`;
}

/** มีข้อมูลของส่วนแล้วหรือยัง (ลีดในช่วงเลขของส่วน) */
export async function มีลีดในช่วง(ctx, [a, b]) {
  const { count } = await ctx.svc.from("leads").select("id", { count: "exact", head: true }).gte("num_id", a).lte("num_id", b);
  return (count ?? 0) > 0;
}
