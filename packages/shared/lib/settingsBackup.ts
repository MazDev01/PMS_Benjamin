/** แปลงการตั้งค่าของสำนักงานใหญ่ ⇄ ตาราง Excel ที่ "คนอ่านรู้เรื่อง"
 *
 *  เดิมปุ่มสำรองข้อมูลส่งออกเป็นไฟล์ .json — เปิดแล้วเห็นแต่ปีกกากับชื่อฟิลด์ภาษาอังกฤษ
 *  ผู้ใช้เอาไปทำอะไรต่อไม่ได้เลย ต้องส่งกลับมาให้คนเขียนโปรแกรมอ่านให้
 *  (บอสสั่ง 3 ก.ย. 69: "เอาไฟล์ปกติที่คนใช้กัน · ไม่ใช่ภาษาของโปรแกรมเมอร์")
 *
 *  ตอนนี้เป็นไฟล์ Excel เล่มเดียว แยกเป็นแท็บตามเรื่อง หัวตารางเป็นภาษาไทย
 *  ค่าที่เป็นเปิด/ปิดเขียนว่า "เปิด"/"ปิด" · ตัวเลขเป็นตัวเลขจริงที่เอาไปคำนวณต่อได้
 *
 *  ⚠️ กติกาการอ่านกลับ: จับคู่ "ชื่อหัวข้อ/หัวตาราง" ไม่ใช่ตำแหน่งบรรทัด
 *     ผู้ใช้แทรกแถว สลับคอลัมน์ หรือเรียงใหม่ใน Excel ได้โดยไม่ทำให้ข้อมูลเลื่อนช่อง
 *  แท็บแม่แบบ/ราคาแม่แบบ/ประวัติราคา ลบแล้ว (เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69) — ไฟล์รุ่นเก่าที่มีแท็บพวกนี้
 *     นำเข้าได้ตามเดิม ระบบข้ามแท็บที่ไม่รู้จัก
 */
import {
  HQ_ALERT_META, เกณฑ์วันแจ้งเตือน, DEFAULT_HQ_POLICY, DEFAULT_HQ_TARGETS, DEFAULT_HQ_NOTIF_RULES, dealerStatusLabel,
  type HQPolicy, type HQTargets, type HQNotifRules, type HQAlertKey, type HQAlertPref,
  type DealerRow, type DealerStatus,
} from "@pms/shared/lib/mock";
import type { HQCompany } from "@pms/shared/lib/data/types";
import type { แผ่นงานที่จะเขียน, ช่อง } from "@pms/shared/lib/exportWorkbook";

export type ชุดการตั้งค่า = {
  policy?: HQPolicy;
  targets?: HQTargets;
  notifRules?: HQNotifRules;
  lostReasons?: string[];
  company?: HQCompany;
  dealers?: DealerRow[];
};

/* ── ชื่อแผ่นงาน — ใช้ตัวแปรร่วมกันทั้งตอนเขียนและตอนอ่าน จะได้ไม่พิมพ์ไม่ตรงกัน ── */
export const แผ่น = {
  บริษัท: "ข้อมูลบริษัท",
  นโยบาย: "นโยบายการขาย",
  เป้าหมาย: "เป้าหมายยอดขาย",
  เกณฑ์เตือน: "เกณฑ์การแจ้งเตือน",
  หัวข้อเตือน: "หัวข้อแจ้งเตือน",
  เหตุผล: "เหตุผลที่ปิดไม่สำเร็จ",
  ดีลเลอร์: "ดีลเลอร์",
} as const;

const หัวคู่ = ["รายการ", "ค่า"];

/* ── ตารางชื่อหัวข้อ ⇄ ฟิลด์จริง ─────────────────────────────────────── */
const หัวข้อบริษัท: [keyof HQCompany, string][] = [
  ["name", "ชื่อบริษัท"], ["address", "ที่อยู่"], ["taxId", "เลขประจำตัวผู้เสียภาษี"],
  ["phone", "โทรศัพท์"], ["email", "อีเมล"], ["website", "เว็บไซต์"],
];
const หัวข้อนโยบาย: [keyof HQPolicy, string][] = [
  ["vat", "ภาษีมูลค่าเพิ่ม (%)"],
  ["quoteValidityDays", "อายุใบเสนอราคา (วัน)"],
];
const หัวข้อเป้าหมาย: [keyof HQTargets, string][] = [
  ["annualTarget", "เป้ายอดขายทั้งเครือ ทั้งปี (บาท)"],
  ["winRateTarget", "เป้าอัตราปิดการขาย (%)"],
  ["onTimeTarget", "เป้าติดตามงานตรงเวลา (%)"],
];
// เกณฑ์การแจ้งเตือน = เฉพาะเรื่องงานของสำนักงานใหญ่ที่มีจำนวนวัน (ชื่อหัวข้ออยู่ที่ HQ_ALERT_META[].เกณฑ์.ป้าย)
const เรื่องที่มีเกณฑ์ = HQ_ALERT_META.filter(a => a.เกณฑ์);

const เปิดปิด = (v: boolean) => (v ? "เปิด" : "ปิด");
/** อ่านค่าเปิด/ปิดจากสิ่งที่คนพิมพ์ลงมาได้หลายแบบ — เปิด/ใช่/ทำ/yes/true/1 */
export function อ่านค่าเปิดปิด(v: string, ค่าเดิม: boolean): boolean {
  const t = (v ?? "").trim().toLowerCase();
  if (!t) return ค่าเดิม;
  if (["เปิด", "ใช่", "ทำ", "y", "yes", "true", "1", "on", "✓"].includes(t)) return true;
  if (["ปิด", "ไม่ใช่", "ไม่", "n", "no", "false", "0", "off", "-"].includes(t)) return false;
  return ค่าเดิม;
}
/** ตัวเลขที่คนพิมพ์มา — ตัดจุลภาค ช่องว่าง และสัญลักษณ์เงิน/เปอร์เซ็นต์ทิ้งก่อน */
export function อ่านตัวเลข(v: string, ค่าเดิม: number): number {
  const t = (v ?? "").replace(/[,\s฿%]/g, "").trim();
  if (!t) return ค่าเดิม;
  const n = Number(t);
  return Number.isFinite(n) ? n : ค่าเดิม;
}

/** แถวสองคอลัมน์ → แผนที่ "หัวข้อ → ค่า" (ตัดช่องว่าง/ตัวพิมพ์ให้เทียบกันได้) */
function เป็นแผนที่(ตาราง: string[][]): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of ตาราง) {
    const k = (r[0] ?? "").trim();
    if (!k || k === หัวคู่[0]) continue;
    m.set(k.toLowerCase(), (r[1] ?? "").trim());
  }
  return m;
}
const ดึง = (m: Map<string, string>, ป้าย: string) => m.get(ป้าย.toLowerCase()) ?? "";

/** จับคู่คอลัมน์จากหัวตาราง — คืนตำแหน่งของแต่ละหัวที่ต้องการ (ไม่เจอ = -1) */
/** คำเดิมก่อนเปลี่ยนคำเรียก (12 ต.ค. 69) → คำปัจจุบัน — ไฟล์สำรองที่ส่งออกไว้ก่อนหน้านั้นต้องนำเข้าได้เหมือนเดิม
 *  คำเดิมเขียนเป็นรหัสอักขระ กันการค้นหา-แทนที่ทั้งโปรเจกต์มาแก้ทับ */
export const เป็นคำปัจจุบัน = (s: string) =>
  s.replace(/ตัวแทนจำหน่าย|ตัวแทน/g, "ดีลเลอร์");

function ตำแหน่งคอลัมน์(หัว: string[], ที่ต้องการ: string[]): number[] {
  const แปลง = หัว.map(h => เป็นคำปัจจุบัน((h ?? "").trim()).toLowerCase());
  return ที่ต้องการ.map(t => แปลง.indexOf(t.trim().toLowerCase()));
}

/* ══ ส่งออก ═══════════════════════════════════════════════════════════ */
export function สร้างแผ่นงานสำรอง(d: ชุดการตั้งค่า): แผ่นงานที่จะเขียน[] {
  const out: แผ่นงานที่จะเขียน[] = [];

  if (d.company) {
    out.push({ ชื่อ: แผ่น.บริษัท, หัวตาราง: หัวคู่,
      แถว: หัวข้อบริษัท.map(([k, ป้าย]) => [ป้าย, String(d.company?.[k] ?? "")] as ช่อง[]) });
  }
  if (d.policy) {
    const p = d.policy;
    out.push({ ชื่อ: แผ่น.นโยบาย, หัวตาราง: หัวคู่,
      แถว: หัวข้อนโยบาย.map(([k, ป้าย]) => [ป้าย, Number(p[k] ?? 0)] as ช่อง[]) });
  }
  if (d.targets) {
    const t = d.targets;
    out.push({ ชื่อ: แผ่น.เป้าหมาย, หัวตาราง: หัวคู่,
      แถว: หัวข้อเป้าหมาย.map(([k, ป้าย]) => [ป้าย, Number(t[k] ?? 0)] as ช่อง[]) });
  }
  if (d.notifRules) {
    const n = d.notifRules;
    out.push({ ชื่อ: แผ่น.เกณฑ์เตือน, หัวตาราง: หัวคู่,
      แถว: เรื่องที่มีเกณฑ์.map(a => [a.เกณฑ์!.ป้าย, เกณฑ์วันแจ้งเตือน(n, a.key)] as ช่อง[]) });
    out.push({ ชื่อ: แผ่น.หัวข้อเตือน, หัวตาราง: ["เรื่องที่แจ้งเตือน", "สถานะ", "คำอธิบาย"],
      แถว: HQ_ALERT_META.map(a => [a.label, เปิดปิด(n.alerts?.[a.key]?.on !== false), a.desc] as ช่อง[]) });
  }
  if (d.lostReasons) {
    out.push({ ชื่อ: แผ่น.เหตุผล, หัวตาราง: ["เหตุผลที่ปิดการขายไม่สำเร็จ"],
      แถว: d.lostReasons.map(r => [r] as ช่อง[]) });
  }
  if (d.dealers) {
    out.push({ ชื่อ: แผ่น.ดีลเลอร์,
      หัวตาราง: ["รหัสดีลเลอร์", "ชื่อดีลเลอร์", "จังหวัด", "ภูมิภาค", "เป้าทั้งปี (บาท)", "สถานะ"],
      แถว: d.dealers.map(x => [x.code, x.name, x.province, x.region, Number(x.revenueTarget ?? 0),
        dealerStatusLabel[x.status] ?? String(x.status)] as ช่อง[]) });
  }
  return out;
}

/* ══ นำกลับเข้าระบบ ═══════════════════════════════════════════════════
   ทุกอย่างต่อยอดจาก "ค่าที่ใช้อยู่ตอนนี้" — แผ่นไหนไม่มีในไฟล์ = ไม่แตะเรื่องนั้น
   (ผู้ใช้ที่อยากแก้แค่เป้ายอดขาย จะได้ลบแท็บอื่นทิ้งแล้วนำเข้าได้เลย) */
export function อ่านแผ่นงานสำรอง(เล่ม: Map<string, string[][]>, เดิม: ชุดการตั้งค่า): ชุดการตั้งค่า {
  const ผล: ชุดการตั้งค่า = {};
  const เอา = (ชื่อ: string) => เล่ม.get(ชื่อ) ?? [...เล่ม.entries()].find(([k]) => เป็นคำปัจจุบัน(k.trim()) === ชื่อ)?.[1];

  const แผ่นบริษัท = เอา(แผ่น.บริษัท);
  if (แผ่นบริษัท) {
    const m = เป็นแผนที่(แผ่นบริษัท);
    const c = { ...(เดิม.company ?? { name: "", address: "", taxId: "", phone: "", email: "", website: "" }) } as HQCompany;
    for (const [k, ป้าย] of หัวข้อบริษัท) { const v = ดึง(m, ป้าย); if (v) c[k] = v; }
    ผล.company = c;
  }

  const แผ่นนโยบาย = เอา(แผ่น.นโยบาย);
  if (แผ่นนโยบาย) {
    const m = เป็นแผนที่(แผ่นนโยบาย);
    const p = { ...DEFAULT_HQ_POLICY, ...(เดิม.policy ?? {}) };
    p.vat = อ่านตัวเลข(ดึง(m, หัวข้อนโยบาย[0][1]), p.vat);
    p.quoteValidityDays = อ่านตัวเลข(ดึง(m, หัวข้อนโยบาย[1][1]), p.quoteValidityDays);
    ผล.policy = p;
  }

  const แผ่นเป้า = เอา(แผ่น.เป้าหมาย);
  if (แผ่นเป้า) {
    const m = เป็นแผนที่(แผ่นเป้า);
    const t = { ...DEFAULT_HQ_TARGETS, ...(เดิม.targets ?? {}) };
    for (const [k, ป้าย] of หัวข้อเป้าหมาย) t[k] = อ่านตัวเลข(ดึง(m, ป้าย), t[k]);
    ผล.targets = t;
  }

  const แผ่นเกณฑ์ = เอา(แผ่น.เกณฑ์เตือน);
  const แผ่นหัวข้อ = เอา(แผ่น.หัวข้อเตือน);
  if (แผ่นเกณฑ์ || แผ่นหัวข้อ) {
    const n: HQNotifRules = {
      ...DEFAULT_HQ_NOTIF_RULES, ...(เดิม.notifRules ?? {}),
      alerts: { ...DEFAULT_HQ_NOTIF_RULES.alerts, ...(เดิม.notifRules?.alerts ?? {}) },
    };
    if (แผ่นเกณฑ์) {
      const m = เป็นแผนที่(แผ่นเกณฑ์);
      for (const a of เรื่องที่มีเกณฑ์) {
        const วัน = อ่านตัวเลข(ดึง(m, a.เกณฑ์!.ป้าย), เกณฑ์วันแจ้งเตือน(n, a.key));
        n.alerts[a.key] = { ...(n.alerts[a.key] ?? { on: true, email: false, inapp: true }), days: วัน > 0 ? วัน : เกณฑ์วันแจ้งเตือน(n, a.key) };
      }
    }
    if (แผ่นหัวข้อ) {
      const m = เป็นแผนที่(แผ่นหัวข้อ);   // คอลัมน์ 1 = ชื่อเรื่อง · คอลัมน์ 2 = เปิด/ปิด
      for (const a of HQ_ALERT_META) {
        const เดิมของเรื่องนี้: HQAlertPref = n.alerts[a.key as HQAlertKey] ?? { on: true, email: false, inapp: true };
        const เปิด = อ่านค่าเปิดปิด(ดึง(m, a.label), เดิมของเรื่องนี้.on);
        // ช่องทาง "ในระบบ" ผูกกับสวิตช์เดียวกันแล้ว (บอสสั่งยุบ 3 ก.ย. 69) · อีเมลคงค่าเดิมไว้
        n.alerts[a.key as HQAlertKey] = { ...เดิมของเรื่องนี้, on: เปิด, inapp: เปิด };
      }
    }
    ผล.notifRules = n;
  }

  const แผ่นเหตุผล = เอา(แผ่น.เหตุผล);
  if (แผ่นเหตุผล) {
    const หัว = (แผ่นเหตุผล[0]?.[0] ?? "").trim();
    const เริ่ม = หัว.includes("เหตุผล") ? 1 : 0;
    const รายการ = แผ่นเหตุผล.slice(เริ่ม).map(r => (r[0] ?? "").trim()).filter(Boolean);
    if (รายการ.length) ผล.lostReasons = [...new Set(รายการ)];
  }

  const แผ่นดีลเลอร์ = เอา(แผ่น.ดีลเลอร์);
  if (แผ่นดีลเลอร์ && แผ่นดีลเลอร์.length > 1) {
    const [หัว, ...เนื้อ] = แผ่นดีลเลอร์;
    const [iรหัส, iชื่อ, iจังหวัด, iภาค, iเป้า, iสถานะ] =
      ตำแหน่งคอลัมน์(หัว, ["รหัสดีลเลอร์", "ชื่อดีลเลอร์", "จังหวัด", "ภูมิภาค", "เป้าทั้งปี (บาท)", "สถานะ"]);
    if (iรหัส >= 0) {
      const เดิมตามรหัส = new Map((เดิม.dealers ?? []).map(d => [d.code.trim().toUpperCase(), d]));
      const รายการ: DealerRow[] = [];
      for (const r of เนื้อ) {
        const code = (r[iรหัส] ?? "").trim().toUpperCase();
        if (!code) continue;
        const ก่อนหน้า = เดิมตามรหัส.get(code);
        const สถานะข้อความ = (iสถานะ >= 0 ? r[iสถานะ] ?? "" : "").trim();
        // ⚠️ ห้ามเทียบด้วย "มีคำว่า ปิด อยู่ในข้อความ" — คำว่า "เปิดใช้งาน" ก็มี "ปิด" อยู่ข้างใน
        //    (เจอตอนทดสอบ 3 ก.ย. 69: ดีลเลอร์ที่เปิดใช้งานอยู่ถูกนำเข้ากลับมาเป็นปิดใช้งานทั้งหมด)
        const ปิดอยู่ = /^(ปิด|ไม่ใช้งาน|ระงับ)/.test(สถานะข้อความ) || /^inactive$/i.test(สถานะข้อความ);
        const status: DealerStatus = สถานะข้อความ
          ? (ปิดอยู่ ? "inactive" : "active")
          : (ก่อนหน้า?.status ?? "active");
        รายการ.push({
          // ดีลเลอร์ที่มีอยู่แล้วต้องคงรหัสภายในเดิม ไม่งั้นงานขายที่ผูกอยู่จะหลุดจากเจ้าของ
          ...(ก่อนหน้า ?? {} as DealerRow),
          id: ก่อนหน้า?.id ?? code,
          code,
          name: (iชื่อ >= 0 ? r[iชื่อ] ?? "" : "").trim() || ก่อนหน้า?.name || code,
          province: (iจังหวัด >= 0 ? r[iจังหวัด] ?? "" : "").trim() || ก่อนหน้า?.province || "",
          region: (iภาค >= 0 ? r[iภาค] ?? "" : "").trim() || ก่อนหน้า?.region || "",
          revenueTarget: อ่านตัวเลข(iเป้า >= 0 ? r[iเป้า] ?? "" : "", ก่อนหน้า?.revenueTarget ?? 0),
          status,
        });
      }
      if (รายการ.length) ผล.dealers = รายการ;
    }
  }


  return ผล;
}
