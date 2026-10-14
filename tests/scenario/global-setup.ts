import { createClient , type SupabaseClient } from "@supabase/supabase-js";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { REAL_BACKEND } from "./supabaseEnv";
import { กวาดสาขาทดสอบค้าง } from "./testDealers";
import { วางใบเดิมที่ฐาน } from "./legacyQuotes";

// snapshot ของ hq_notif_rules.alerts เดิม (singleton row จริง ไม่ใช่ข้อมูลแท็กที่ลบทิ้งได้เฉยๆ)
// ต้องคืนค่าเดิมใน teardown เสมอ — ไม่ใช่ตั้งเป็นค่า test แล้วปล่อยทิ้งไว้
export const ALERTS_SNAPSHOT_PATH = path.join(__dirname, "../../node_modules/.cache/scenario-hq-alerts-snapshot.json");

// ── ข้อมูลตั้งต้นสำหรับกลุ่มเทสต์ที่ตรวจ "สิ่งที่อยู่บนจอ" (hq-quotations/redesign/ui/ux/user/
// scenario-fixes/branch-isolation) — ต่างจาก func-*.spec.ts ที่ seed+cleanup เองต่อเทสต์
// เพราะกลุ่มนี้แค่ "เปิดหน้าไปดู" ไม่ได้สร้างข้อมูลเอง จึงต้องมีข้อมูลตั้งต้นให้เปิดเจอ
//
// พบว่า DB จริงว่างเปล่าทั้งเครือ (0 leads/quotations/customers ทุกสาขา) ตอนตรวจ 30 ก.ค. 69
// เดิมกลุ่มนี้ใช้ mock.ts (ข้อมูลจำลอง local mode) ซึ่งใช้ไม่ได้แล้วเพราะแอปรันโหมด supabase จริง
//
// namespace: ทุกแถวขึ้นต้น "ZZTEST-BASE" (specNS("BASE")) — แยกจาก namespace ของ func-*.spec.ts
// (ZZTEST-QUOTE/ZZTEST-SALES/ZZTEST-APPT) กันชนกันตอนรันขนาน · cleanup ที่ global-teardown.ts

export const NS = "ZZTEST-BASE";
export const tag = (s: string) => `${NS}-${s}`;

const ID_BASE = 991_000_000; // ช่วง id สูงพอที่จะไม่ชนข้อมูลจริงในอนาคต

// ลูกค้าตั้งต้นแบบ "มีอยู่แล้วในสมุด" — ใช้ทดสอบ dedup (customer-dedupe.spec.ts: เปิดลูกค้าเป้าหมายชื่อซ้ำ/ใกล้เคียง
// กับลูกค้าเดิม ต้องผูกเข้าลูกค้ารายเดิม ไม่สร้างซ้ำ) ⚠️ ต้องเป็นชื่อ "สะอาด" ไม่มีแท็กนำหน้า —
// ใส่แท็กจะทำให้ matchCustomers() (customerMatch.ts: exactKey/looseKey เทียบแค่คำนำหน้านิติบุคคล
// กับช่องว่าง ไม่ได้ตัดคำแปลกปลอมกลางชื่อ) จับคู่ไม่เจอ ทดสอบ dedup จริงไม่ได้เลย
// ลบทิ้งตอน teardown ด้วย id ตรงๆ (EXISTING_CUSTOMER_ID) แทนการ sweep ด้วยแท็กในชื่อ
export const EXISTING_CUSTOMER_NAME = "บจ. ไทยสตีล";
export const EXISTING_CUSTOMER_ID = ID_BASE + 999;

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}
function isoDate(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// ⚠️ leads.created_at (timestamptz) ไม่ใช่ค่าที่แอปใช้คำนวณ "ค้างติดต่อกี่วัน" — แอปอ่านจาก
//   created_label (สตริงวันที่ไทย "D เดือนไทย พ.ศ.") ผ่าน parseThaiDate (ดู leadMetrics.ts +
//   migration 0046) ลืมใส่ครั้งแรกแล้วทำให้ needsFollowUp/idleLeads คำนวณไม่ได้ (null) เงียบๆ
const TH_MO = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
function thaiDateLabel(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getDate()} ${TH_MO[d.getMonth()]} ${d.getFullYear() + 543}`;
}

type LeadSeed = {
  idOffset: number; dealerCode: string; company: string; province: string; product: string;
  status: "WAITING" | "BULLET" | "QUOTED" | "FOLLOWUP" | "NEGO" | "PAID" | "CANCELLED";
  ageDays: number; lostReason?: string;
};

// ── ข้อมูลชุดตั้งต้น "กรอกครบทุกช่อง" (บอสสั่ง 20 ส.ค. 69) ──────────────────────
//
// เดิมทุกแถวใช้ค่าเดียวกันหมด (คุณทดสอบ / 0800000000 / test@example.com / มูลค่า "0")
//   หน้าจอที่เปิดดูจึงเป็น "—" กับ 0 เต็มไปหมด ดูไม่ออกว่าของจริงจะหน้าตายังไง
//   และบั๊กที่โผล่เฉพาะตอนมีข้อมูล (เช่นคอลัมน์ล้น/ตัวเลขไม่จัดหลัก) ก็ไม่มีทางเจอ
// ตอนนี้แต่ละแถวมีค่าของตัวเองครบทุกช่อง — ยังเป็นข้อมูลทดสอบที่ติดป้าย ZZTEST เหมือนเดิม
const ผู้ติดต่อ = ["คุณสมชาย ใจดี", "คุณวราภรณ์ ศรีสุข", "คุณธนากร พงษ์ทอง", "คุณปิยะนุช แก้วมณี",
  "คุณอนุชา รุ่งเรือง", "คุณกมลชนก อินทร์แก้ว", "คุณเจษฎา วัฒนกิจ", "คุณศิริพร ทองดี"];
/** ราคากลางคร่าว ๆ ต่อ ตร.ม. ของแต่ละแม่แบบ — ใช้คิดมูลค่าให้สมจริง (ไม่ใช่เลขสุ่ม) */
const ราคาต่อตรม: Record<string, number> = {
  "โรงงาน": 6800, "อาคารสำเร็จรูปทุกประเภท": 6200, "งานตามแบบของลูกค้า": 7000,
};

const LEADS: LeadSeed[] = [
  // ── RYG ──
  { idOffset: 1, dealerCode: "RYG", company: tag("บจ. อาร์วายจีหนึ่ง"), province: "ระยอง", product: "โรงงาน", status: "WAITING", ageDays: 2 },
  { idOffset: 2, dealerCode: "RYG", company: tag("บจ. อาร์วายจีสอง"), province: "ระยอง", product: "อาคารสำเร็จรูปทุกประเภท", status: "BULLET", ageDays: 10 },
  { idOffset: 3, dealerCode: "RYG", company: tag("บจ. อาร์วายจีสาม"), province: "ชลบุรี", product: "อาคารสำเร็จรูปทุกประเภท", status: "FOLLOWUP", ageDays: 20 },
  { idOffset: 4, dealerCode: "RYG", company: tag("บจ. อาร์วายจีสี่"), province: "ระยอง", product: "โรงงาน", status: "NEGO", ageDays: 35 },
  { idOffset: 5, dealerCode: "RYG", company: tag("บจ. อาร์วายจีห้า"), province: "ชลบุรี", product: "งานตามแบบของลูกค้า", status: "QUOTED", ageDays: 5 },
  { idOffset: 6, dealerCode: "RYG", company: tag("บจ. อาร์วายจีหก"), province: "ระยอง", product: "โรงงาน", status: "CANCELLED", ageDays: 15, lostReason: "ราคาสูงกว่าคู่แข่ง" },
  { idOffset: 7, dealerCode: "RYG", company: tag("บจ. อาร์วายจีเจ็ด"), province: "ชลบุรี", product: "อาคารสำเร็จรูปทุกประเภท", status: "CANCELLED", ageDays: 25, lostReason: "ลูกค้าชะลอโครงการ" },
  { idOffset: 8, dealerCode: "RYG", company: tag("บจ. อาร์วายจีแปด"), province: "ระยอง", product: "โรงงาน", status: "PAID", ageDays: 40 },
  // ── CNX ──
  { idOffset: 21, dealerCode: "CNX", company: tag("บจ. เชียงใหม่หนึ่ง"), province: "เชียงใหม่", product: "โรงงาน", status: "WAITING", ageDays: 3 },
  { idOffset: 22, dealerCode: "CNX", company: tag("บจ. เชียงใหม่สอง"), province: "เชียงใหม่", product: "อาคารสำเร็จรูปทุกประเภท", status: "BULLET", ageDays: 9 },
  { idOffset: 23, dealerCode: "CNX", company: tag("บจ. เชียงใหม่สาม"), province: "เชียงราย", product: "อาคารสำเร็จรูปทุกประเภท", status: "FOLLOWUP", ageDays: 18 },
  { idOffset: 24, dealerCode: "CNX", company: tag("บจ. เชียงใหม่สี่"), province: "เชียงใหม่", product: "โรงงาน", status: "NEGO", ageDays: 33 },
  { idOffset: 25, dealerCode: "CNX", company: tag("บจ. เชียงใหม่ห้า"), province: "เชียงราย", product: "งานตามแบบของลูกค้า", status: "QUOTED", ageDays: 6 },
  { idOffset: 26, dealerCode: "CNX", company: tag("บจ. เชียงใหม่หก"), province: "เชียงใหม่", product: "โรงงาน", status: "CANCELLED", ageDays: 14, lostReason: "งบประมาณไม่พอ" },
  { idOffset: 27, dealerCode: "CNX", company: tag("บจ. เชียงใหม่เจ็ด"), province: "เชียงราย", product: "อาคารสำเร็จรูปทุกประเภท", status: "CANCELLED", ageDays: 22, lostReason: "เลือกคู่แข่ง" },
  { idOffset: 28, dealerCode: "CNX", company: tag("บจ. เชียงใหม่แปด"), province: "เชียงใหม่", product: "โรงงาน", status: "PAID", ageDays: 38 },
];

type QuoteSeed = {
  idSuffix: string; dealerCode: string; customer: string; buildingType: string; province: string;
  status: "draft" | "sent_to_client" | "won" | "lost" | "expired"; ageDays: number; totalValue: number;
  customerIdOffset?: number;
};

const QUOTES: QuoteSeed[] = [
  // ── RYG ──
  { idSuffix: "RYG-1", dealerCode: "RYG", customer: tag("บจ. อาร์วายจีแปด"), buildingType: "โรงงาน", province: "ระยอง", status: "won", ageDays: 10, totalValue: 1_800_000, customerIdOffset: 1 },
  { idSuffix: "RYG-2", dealerCode: "RYG", customer: tag("บจ. อาร์วายจีห้า"), buildingType: "อาคารสำเร็จรูปทุกประเภท", province: "ชลบุรี", status: "sent_to_client", ageDays: 25, totalValue: 950_000 },
  { idSuffix: "RYG-3", dealerCode: "RYG", customer: tag("บจ. อาร์วายจีสาม"), buildingType: "โรงงาน", province: "ระยอง", status: "sent_to_client", ageDays: 55, totalValue: 2_100_000 },
  { idSuffix: "RYG-4", dealerCode: "RYG", customer: tag("บจ. อาร์วายจีเจ็ด"), buildingType: "อาคารสำเร็จรูปทุกประเภท", province: "ชลบุรี", status: "lost", ageDays: 30, totalValue: 700_000 },
  { idSuffix: "RYG-5", dealerCode: "RYG", customer: tag("บจ. อาร์วายจีหก"), buildingType: "โรงงาน", province: "ระยอง", status: "expired", ageDays: 60, totalValue: 1_200_000 },
  { idSuffix: "RYG-6", dealerCode: "RYG", customer: tag("บจ. อาร์วายจีหนึ่ง"), buildingType: "งานตามแบบของลูกค้า", province: "ระยอง", status: "draft", ageDays: 1, totalValue: 500_000 },
  // ── CNX ──
  { idSuffix: "CNX-1", dealerCode: "CNX", customer: tag("บจ. เชียงใหม่แปด"), buildingType: "โรงงาน", province: "เชียงใหม่", status: "won", ageDays: 12, totalValue: 2_400_000, customerIdOffset: 21 },
  { idSuffix: "CNX-2", dealerCode: "CNX", customer: tag("บจ. เชียงใหม่ห้า"), buildingType: "อาคารสำเร็จรูปทุกประเภท", province: "เชียงราย", status: "sent_to_client", ageDays: 20, totalValue: 1_100_000 },
  { idSuffix: "CNX-3", dealerCode: "CNX", customer: tag("บจ. เชียงใหม่สาม"), buildingType: "โรงงาน", province: "เชียงใหม่", status: "sent_to_client", ageDays: 48, totalValue: 1_600_000 },
  { idSuffix: "CNX-4", dealerCode: "CNX", customer: tag("บจ. เชียงใหม่เจ็ด"), buildingType: "อาคารสำเร็จรูปทุกประเภท", province: "เชียงราย", status: "lost", ageDays: 28, totalValue: 850_000 },
  { idSuffix: "CNX-5", dealerCode: "CNX", customer: tag("บจ. เชียงใหม่หก"), buildingType: "โรงงาน", province: "เชียงใหม่", status: "expired", ageDays: 58, totalValue: 900_000 },
  { idSuffix: "CNX-6", dealerCode: "CNX", customer: tag("บจ. เชียงใหม่หนึ่ง"), buildingType: "งานตามแบบของลูกค้า", province: "เชียงใหม่", status: "draft", ageDays: 1, totalValue: 400_000 },
];

export default async function globalSetup() {
  if (!REAL_BACKEND || !ADMIN_SUPABASE_URL || !ADMIN_SERVICE_ROLE_KEY) {
    console.log("[global-setup] ข้ามการ seed — ไม่ใช่โหมด supabase หรือยังไม่มี service role key");
    return;
  }
  const admin = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY);

  // กวาดของเก่าทิ้งก่อน (เผื่อรันค้างจากรอบก่อนแล้ว teardown ไม่ทัน) — idempotent
  // สาขาทดสอบที่ค้างจากรอบก่อน (รอบก่อนถูกหยุดกลางทางจน global-teardown ไม่ได้รัน) — ไม่กวาด = รอบนี้ตกที่ขั้นเตรียมข้อมูล
  //   ด้วย "รหัสมีอยู่แล้ว" หรือสาขาค้างดันสาขาจริงตกหน้าแรกของทะเบียน ทั้งที่ไม่เกี่ยวกับสิ่งที่กำลังวัด (เจอจริง 13 ต.ค. 69)
  const สาขาค้าง = await กวาดสาขาทดสอบค้าง(admin);
  if (สาขาค้าง.ลบแล้ว.length) console.log(`[global-setup] กวาดสาขาทดสอบที่ค้างจากรอบก่อน: ${สาขาค้าง.ลบแล้ว.join(", ")}`);
  if (สาขาค้าง.พลาด.length) throw new Error(`[global-setup] กวาดสาขาทดสอบที่ค้างไม่สำเร็จ — แก้ก่อนรัน ไม่งั้นผลรอบนี้เชื่อไม่ได้: ${สาขาค้าง.พลาด.join(" · ")}`);
  await teardownBaseline(admin);
  await restoreAlertsIfPending(admin); // เผื่อรันค้างจากรอบก่อน (ไม่งั้น snapshot ที่ค้างจะทับของจริงตอน teardown รอบนี้)
  await ต้องไม่มีสวิตช์ซ่อนราคาเปิดค้าง(admin);
  // บัญชีทดสอบหลัก (RYG / CNX) มีอีเมลติดต่อที่ยืนยันแล้ว — ไม่งั้นแถบเตือนอีเมล (ด่าน 1) ขึ้นทุกหน้าของดีลเลอร์
  //   แล้วข้อทดสอบหน้าจอที่ไม่เกี่ยวกับอีเมลเห็นหน้าตาต่างไป · ข้อทดสอบของแถบเตือนใช้สาขาทดสอบของตัวเอง
  await admin.from("profiles").update({ contact_email_verified_at: new Date().toISOString() })
    .in("dealer_code", ["RYG", "CNX"]).eq("role", "DEALER_ADMIN").neq("contact_email", "").is("contact_email_verified_at", null);
  await ขยับตัวนับให้พ้นข้อมูลที่มี(admin);

  // ── hq_notif_rules.alerts เดิมเป็น {} (ยังไม่มีใครเปิดกฎแจ้งเตือนเลย) → การ์ด "ต้องดูด่วน"
  // ไม่มีทางโผล่ได้เลยไม่ว่าจะ seed ข้อมูลลูกค้าเป้าหมาย/ใบเสนอราคาแบบไหน (ui/ux/hq-quotations spec ต้องการให้โผล่)
  // snapshot ค่าเดิมไว้ก่อน แล้วเปิดครบทุกกฎชั่วคราว — คืนค่าเดิมที่ global-teardown.ts เสมอ
  // (กฎ = งานของสำนักงานใหญ่เอง ตั้งแต่ 14 ก.ย. 69 · คีย์งานขายดีลเลอร์ชุดเก่าไม่มีผลแล้ว)
  const before = await admin.from("hq_notif_rules").select("alerts").eq("id", 1).single();
  // node_modules/.cache ยังไม่มีบนเครื่องที่เพิ่งติดตั้งใหม่ (ตัวอื่นเป็นคนสร้างให้โดยบังเอิญ)
  //   ไม่สร้างเองก่อน = ชุดทดสอบล้มตั้งแต่ setup ด้วย ENOENT ทั้งชุด (เจอจริง 7 ก.ย. 69 หลังลง dependency ใหม่)
  mkdirSync(path.dirname(ALERTS_SNAPSHOT_PATH), { recursive: true });
  writeFileSync(ALERTS_SNAPSHOT_PATH, JSON.stringify(before.data?.alerts ?? {}));
  const allOn = { on: true, inapp: true };
  await admin.from("hq_notif_rules").update({
    alerts: {
      prospectFollowUpDue: allOn, prospectIdle: allOn, proposalAwaiting: allOn,
      proposalExpired: allOn, catalogNoPrice: allOn,
    },
  }).eq("id", 1);

  // ลูกค้าเป้าหมาย (HQ) ที่เลยวันนัดติดตาม 3 วัน → กระดิ่ง HQ มีเรื่อง "ต้องดูด่วน" ให้ ux.spec ตรวจได้เสมอ
  const { error: prospectErr } = await admin.from("dealer_prospects").insert({
    name: tag("ผู้สนใจถึงกำหนดติดตาม"), province: "ระยอง", region: "ตะวันออก", status: "new",
    first_contact: isoDate(10), follow_up: isoDate(3), assigned: "ทดสอบระบบ",
  });
  if (prospectErr) throw new Error(`[global-setup] insert dealer_prospects ล้มเหลว: ${prospectErr.message}`);

  const leadRows = LEADS.map(l => ({
    id: ID_BASE + l.idOffset,
    dealer_code: l.dealerCode,
    num_id: 800_000 + l.idOffset,
    name: l.company,
    company: l.company,
    contact: ผู้ติดต่อ[(l.idOffset - 1) % ผู้ติดต่อ.length],
    phone: `08${(1 + (l.idOffset % 9))}-${String(200 + l.idOffset).padStart(3, "0")}-${String(1000 + l.idOffset * 7).slice(-4)}`,
    email: `lead${l.idOffset}@example.co.th`,
    address: `${100 + l.idOffset} ถนนทดสอบ ต.ในเมือง อ.เมือง จ.${l.province}`,
    province: l.province,
    product: l.product,
    category: l.product,
    status: l.status,
    // มูลค่า = พื้นที่ × ราคากลางของแม่แบบ — กติกาเดียวกับที่หน้าจอคิดให้ (ไม่ใช่เลขลอย ๆ)
    value: String((300 + l.idOffset * 25) * (ราคาต่อตรม[l.product] ?? 6500)),
    area: String(300 + l.idOffset * 25),
    assigned: "ทดสอบระบบ",
    source: ["เว็บไซต์", "Facebook", "โทรเข้า", "ลูกค้าแนะนำ", "ออกบูธ"][l.idOffset % 5],
    note: `ข้อมูลชุดทดสอบ — กรอกครบทุกช่องไว้ให้ดูหน้าจอได้เหมือนใช้งานจริง (${l.company})`,
    project: `โครงการ${l.product} ${l.province}`,
    // ติดต่อล่าสุด = ครึ่งทางของอายุลูกค้าเป้าหมาย → มีทั้งรายที่เพิ่งคุยและรายที่เงียบไปนาน
    last_contact_at: isoDate(Math.max(0, Math.round(l.ageDays / 2))),
    lost_reason: l.lostReason ?? null,
    created_at: daysAgo(l.ageDays),
    created_label: thaiDateLabel(l.ageDays),
  }));
  const { error: leadErr } = await admin.from("leads").insert(leadRows);
  if (leadErr) throw new Error(`[global-setup] insert leads ล้มเหลว: ${leadErr.message}`);

  const custRows = QUOTES.filter(q => q.customerIdOffset != null).map(q => ({
    id: ID_BASE + q.customerIdOffset!,
    dealer_code: q.dealerCode,
    name: q.customer,
    company: q.customer,
    email: `customer-${q.idSuffix.toLowerCase()}@example.co.th`,
    phone: `08${q.dealerCode === "RYG" ? "1" : "2"}-500-${String(1000 + (q.customerIdOffset ?? 0)).slice(-4)}`,
    province: q.province,
    category: q.buildingType,
    status: "active",
    join_date: isoDate(q.ageDays),
    owner: "ทดสอบระบบ",
    initials: "ZZ",
    color: "#003366",
    total_value: q.totalValue,
  }));
  custRows.push({
    id: EXISTING_CUSTOMER_ID, dealer_code: "RYG", name: EXISTING_CUSTOMER_NAME, company: EXISTING_CUSTOMER_NAME,
    email: "test@example.com", phone: "0800000000", province: "ระยอง", category: "โรงงาน", status: "active",
    join_date: isoDate(200), owner: "ทดสอบระบบ", initials: "ทส", color: "#003366", total_value: 2_500_000,
  });
  const { error: custErr } = await admin.from("customers").insert(custRows);
  if (custErr) throw new Error(`[global-setup] insert customers ล้มเหลว: ${custErr.message}`);

  const quoteRows = QUOTES.map(q => ({
    id: tag(`Q-${q.idSuffix}`),
    dealer_code: q.dealerCode,
    quote_no: `Q-2026-${9000 + LEADS.length}`,
    customer: q.customer,
    project: `โครงการทดสอบ ${q.idSuffix}`,
    total: `฿${q.totalValue.toLocaleString("th-TH")}`,
    total_value: q.totalValue,
    material_cost: Math.round(q.totalValue * 0.7),
    province: q.province,
    building_type: q.buildingType,
    area: "500",
    status: q.status,
    date: isoDate(q.ageDays),
    items: 1,
    customer_id: q.customerIdOffset != null ? ID_BASE + q.customerIdOffset : null,
  }));
  // ใบชุดนี้จำลอง "ประวัติก่อนปิดทางออกใบแบบเดิม" (ด่าน 3 · ใบ 0201) — ฐานปฏิเสธใบใหม่ที่ไม่มีใบ HQ ทุกทางแล้ว
  //   จึงวางที่ฐานทดสอบในเครื่องตรง ๆ (ระบบจริงมีใบแบบนี้อยู่ หน้าจอต้องแสดงได้) · ข้อทดสอบที่วัดการสร้างใบใช้ hqQuoteFixture
  วางใบเดิมที่ฐาน(quoteRows);

  console.log(`[global-setup] seed สำเร็จ: ${leadRows.length} leads, ${quoteRows.length} quotations, ${custRows.length} customers`);
  await อุ่นเครื่องทุกหน้า();
}

// ── อุ่นเครื่อง: เปิดทุกหน้าให้เซิร์ฟเวอร์คอมไพล์ไว้ก่อนเริ่มทดสอบ ──────────────────
//
// ทำไมต้องมี: เซิร์ฟเวอร์โหมดพัฒนาคอมไพล์แต่ละหน้า "ตอนมีคนเปิดครั้งแรก" เท่านั้น
//   เทสต์รัน 3 ไฟล์พร้อมกัน ตัวที่ดันไปแตะหน้าที่ยังไม่เคยถูกเปิดจึงต้องรอคอมไพล์
//   บางครั้งนานเกิน 20 วินาที แล้วล้มด้วยข้อความ "page.goto: Timeout" ทั้งที่ระบบไม่ได้พัง
//   (อาการนี้คือที่มาของเทสต์ "ผ่านแต่ต้องลองซ้ำ" ที่เห็นทุกรอบ — วินิจฉัยไว้ในหัว playwright.config.ts)
//
// เปิดทีละหน้าแบบเรียงกัน ไม่ยิงพร้อมกัน — ยิงพร้อมกันคือการสร้างปัญหาเดิมซ้ำตั้งแต่ตอนอุ่นเครื่อง
// ⚠️ ล้มเหลวตรงนี้ต้องไม่ทำให้ทั้งชุดล้ม — นี่เป็นแค่การอุ่นเครื่อง ไม่ใช่การตรวจ
/** ชุดหลักเริ่มได้ก็ต่อเมื่อสวิตช์ซ่อนราคาแม่แบบ "ปิด" — เปิดค้าง = หยุดทันทีพร้อมบอกวิธีแก้
 *
 *  สวิตช์ hq_policy.hide_catalog_price ถูกเปิดโดยชุด price-switch (catalog-price-switch.spec.ts) เท่านั้น
 *  และชุดนั้นปิดคืนให้เองทุกครั้ง (afterAll + global-teardown) — ถ้ายังเปิดอยู่ตอนเริ่ม แปลว่ารอบก่อนถูกฆ่ากลางทาง
 *  ปล่อยให้รันต่อ = ดีลเลอร์ในชุดทดสอบอ่านราคาแม่แบบไม่ได้ ข้อทดสอบออกใบเสนอราคาตกเป็นสิบข้อ
 *  ด้วยอาการ "ปุ่มกดไม่ได้" ที่ไม่มีอะไรชี้กลับมาที่สวิตช์เลย — หยุดตรงนี้ชัดกว่า */
async function ต้องไม่มีสวิตช์ซ่อนราคาเปิดค้าง(admin: SupabaseClient) {
  const { data, error } = await admin.from("hq_policy").select("hide_catalog_price").order("id").limit(1).maybeSingle();
  if (error) return;   // ฐานที่ยังไม่มีสวิตช์ (ยังไม่ลงใบ 0186) — ไม่มีอะไรให้ค้าง
  if (data?.hide_catalog_price) {
    throw new Error(
      "[global-setup] หยุด: สวิตช์ซ่อนราคาแม่แบบ (hq_policy.hide_catalog_price) เปิดค้างอยู่ในฐานทดสอบ — " +
      "ชุดหลักรันไม่ได้เพราะดีลเลอร์จะอ่านราคาแม่แบบไม่ได้ · ปิดก่อนด้วย SQL: " +
      "update hq_policy set hide_catalog_price = false;  แล้วรันใหม่ " +
      "(ปกติชุด price-switch ปิดคืนให้เอง — เปิดค้างแปลว่ารอบก่อนถูกหยุดกลางทาง)",
    );
  }
}

/** ตัวนับเลขรายสาขา (ลูกค้าเป้าหมาย/ลูกค้า/นัดหมาย) ต้องอยู่ "หลัง" เลขที่มีในฐานเสมอ
 *
 *  เจอจริง 12 ต.ค. 69: ฐานทดสอบในเครื่องมีข้อมูลตั้งต้นที่ใส่เลขสูงไว้ตรง ๆ (9936xxxxx)
 *  แต่ตัวนับของสาขา RYG ถูกสร้างไว้ก่อนหน้านั้น (ค้างที่ 946505) → ลูกค้าเป้าหมายที่เพิ่มผ่านหน้าจอ
 *  ได้เลขต่ำกว่าของเดิม ตารางเรียง "เพิ่มล่าสุดบนสุด" ด้วยเลขนี้ จึงไปโผล่หน้าหลัง
 *  → customer-dedupe ข้อปิดการขายหาแถวที่เพิ่งเพิ่มไม่เจอ ทั้งที่บันทึกลงฐานแล้ว
 *  ระบบจริงไม่เป็น เพราะเลขออกจากตัวนับทางเดียว — เป็นเรื่องของข้อมูลทดสอบล้วน ๆ */
async function ขยับตัวนับให้พ้นข้อมูลที่มี(admin: SupabaseClient) {
  const { data: ตัวนับ } = await admin.from("entity_counters").select("dealer_code,entity,next_id");
  const ที่มา: Record<string, { table: string; col: string }> = {
    leads: { table: "leads", col: "num_id" }, customers: { table: "customers", col: "id" }, appointments: { table: "appointments", col: "id" },
  };
  for (const c of ตัวนับ ?? []) {
    const t = ที่มา[c.entity as string];
    if (!t) continue;
    const { data } = await admin.from(t.table).select(t.col).eq("dealer_code", c.dealer_code)
      .order(t.col, { ascending: false }).limit(1);
    const สูงสุด = Number((data?.[0] as Record<string, unknown> | undefined)?.[t.col] ?? 0);
    if (Number(c.next_id) <= สูงสุด) {
      await admin.from("entity_counters").update({ next_id: สูงสุด + 1 })
        .eq("dealer_code", c.dealer_code).eq("entity", c.entity);
      console.log(`[global-setup] ขยับตัวนับ ${c.dealer_code}/${c.entity}: ${c.next_id} → ${สูงสุด + 1}`);
    }
  }
}

async function อุ่นเครื่องทุกหน้า() {
  const หน้า = [
    ["http://localhost:3002", ["/hq/login", "/hq/dashboard", "/hq/dealers", "/hq/pipeline", "/hq/leads",
      "/hq/quotations", "/hq/customers", "/hq/master", "/hq/audit", "/hq/settings"]],
    ["http://localhost:3001", ["/login", "/dashboard", "/leads", "/quotations", "/customers",
      "/products", "/calendar", "/files", "/settings"]],
  ] as const;
  const เริ่ม = Date.now();
  let สำเร็จ = 0;
  for (const [origin, paths] of หน้า) {
    for (const path of paths) {
      try {
        const res = await fetch(origin + path, { signal: AbortSignal.timeout(120_000) });
        await res.text();          // ต้องอ่านจนจบ ไม่งั้นนับว่ายังคอมไพล์ไม่เสร็จ
        สำเร็จ++;
      } catch {
        console.warn(`[global-setup] อุ่นเครื่อง ${path} ไม่สำเร็จ — ข้ามไป`);
      }
    }
  }
  console.log(`[global-setup] อุ่นเครื่อง ${สำเร็จ} หน้า ใช้เวลา ${((Date.now() - เริ่ม) / 1000).toFixed(1)} วินาที`);
}

/** คืนค่า hq_notif_rules.alerts เดิมจาก snapshot ถ้ามีไฟล์ค้างอยู่ (เรียกทั้งต้น setup กันรันค้าง และท้าย teardown) */
export async function restoreAlertsIfPending(admin: SupabaseClient) {
  if (!existsSync(ALERTS_SNAPSHOT_PATH)) return;
  const original = JSON.parse(readFileSync(ALERTS_SNAPSHOT_PATH, "utf8"));
  await admin.from("hq_notif_rules").update({ alerts: original }).eq("id", 1);
  try { require("node:fs").unlinkSync(ALERTS_SNAPSHOT_PATH); } catch { /* ignore */ }
}

export async function teardownBaseline(admin: SupabaseClient) {
  // กวาด 2 ทาง: ทั้ง id ของใบที่เรา seed เอง (ZZTEST-BASE-Q-...) และใบที่ผู้ใช้/เทสต์สร้างผ่าน UI
  // จากลูกค้าเป้าหมายที่ seed ไว้ (เช่น openLeadQuotationForm → "สร้างใบเสนอราคา") — ใบแบบหลังได้ id ออกเลขปกติ
  // จาก DB (เช่น "Q-2026-0384") ไม่มีแท็กในตัวเอง แต่ผูก customer = ชื่อบริษัทที่ seed ไว้
  // (พลาดมาแล้วรอบหนึ่ง: ลืมกวาดทางที่สอง ทำให้ใบที่เทสต์สร้างผ่าน UI ค้างสะสมใน DB จริงทุกรอบที่รัน)
  await admin.from("quotations").delete().like("id", `${NS}%`);
  await admin.from("quotations").delete().like("customer", `${NS}%`);
  await admin.from("customers").delete().like("company", `${NS}%`);
  await admin.from("leads").delete().like("company", `${NS}%`);
  await admin.from("dealer_prospects").delete().like("name", `${NS}%`); // ประวัติ/ใบค่าแฟรนไชส์ลบตามเอง (on delete cascade)
  // ลูกค้า "บจ. ไทยสตีล" (EXISTING_CUSTOMER_ID) เป็นชื่อสะอาดไม่มีแท็ก (เหตุผลดูที่ประกาศตัวแปร) —
  // กวาดด้วย id ตรงๆ แทน · customer-dedupe.spec.ts ยังสร้างลูกค้าเป้าหมายชื่อเดียวกันผ่าน UI ได้ (ไม่มีแท็ก
  // เหมือนกัน) กวาดด้วยชื่อเป๊ะไปด้วยกันเลย — ปิดการขายสำเร็จแล้ว lead จะถูกลบออกจากตารางเองอยู่แล้ว
  // (removeLead=true) แต่เผื่อเทสต์ล้มกลางทางค้างไว้ก็กวาดซ้ำให้ชัวร์
  // ⚠️ ต้องกวาด "ใบเสนอราคาของลูกค้ารายนี้" ก่อนเสมอ (พลาดมาแล้ว 20 ส.ค. 69)
  //   ใบที่เทสต์ออกให้ลูกค้า/ลูกค้าเป้าหมายชื่อนี้ไม่มีแท็กในตัวเอง และผูก FK ไว้ทั้งกับลูกค้าและกับดีล
  //   ลบแม่ก่อนจึงถูกฐานข้อมูลปฏิเสธเงียบ ๆ (โค้ดนี้ไม่ได้เช็ค error) → ลูกค้า/ลีดค้างข้ามรอบ
  //   แล้วรอบถัดไป seed ทับไม่ได้ ล้มตั้งแต่ setup ด้วย duplicate key ทั้งชุด
  await admin.from("quotations").delete().eq("customer", EXISTING_CUSTOMER_NAME);
  const { data: staleLeads } = await admin.from("leads").select("id").eq("company", EXISTING_CUSTOMER_NAME);
  for (const l of staleLeads ?? []) await admin.from("quotations").delete().eq("deal_id", l.id);
  await admin.from("customers").delete().eq("id", EXISTING_CUSTOMER_ID);
  const { error: leadErr } = await admin.from("leads").delete().eq("company", EXISTING_CUSTOMER_NAME).eq("dealer_code", "RYG");
  if (leadErr) console.warn(`[teardown] ลบลูกค้าเป้าหมาย "${EXISTING_CUSTOMER_NAME}" ไม่สำเร็จ: ${leadErr.message}`);
  // แอปสร้างไฟล์ PDF อัตโนมัติผูกกับใบเสนอราคาทุกใบที่สร้างผ่าน UI (ชื่อไฟล์ฝัง quote id/ชื่อลูกค้า
  // ไว้ด้วย) — พลาดมาแล้วอีกรอบ: ลืมกวาดตารางนี้ ทำให้ไฟล์ค้างสะสมจนล้นหน้าแรก (12 ต่อหน้า) แล้วไป
  // ทำให้ func-appt-files.spec.ts หาไฟล์ที่เพิ่งอัปโหลดจริงไม่เจอภายใน timeout (บั๊กจากดาต้าค้าง
  // ไม่ใช่โค้ดแอปพัง) — กวาด storage bytes ก่อนด้วยถ้ามี (ตามแบบ cleanup() ใน funcHelpers.ts)
  const staleFiles = await admin.from("files").select("id,storage_path").like("name", `%${NS}%`);
  for (const f of staleFiles.data ?? []) {
    if (f.storage_path) await admin.storage.from("dealer-files").remove([f.storage_path as string]);
  }
  await admin.from("files").delete().like("name", `%${NS}%`);
}
