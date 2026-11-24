// ── รายการกลางของเครือ (บอสตัดสิน 19 พ.ย. 69 · "ตั้งค่ารายการกลาง" · ใบ 0296) ───────────────────────────────────
//
// สำนักงานใหญ่ตั้งรายการเดียว ใช้ทั้งเครือทันที (ดีลเลอร์ทุกรายเห็นชุดเดียวกัน):
//   lead_source          ช่องทางที่มาลูกค้าเป้าหมาย   → leads.source
//   appointment_type     ประเภทนัดหมาย               → appointments.type
//   prospect_lost_reason เหตุผลผู้สนใจไม่สำเร็จ        → dealer_prospects.lost_reason · ใบค่าแฟรนไชส์ที่ปฏิเสธ (close_reason)
//   lead_lost_reason     เหตุผลปิดการขายไม่สำเร็จ       → leads/quotations/quote_requests.lost_reason (ปิดไม่สำเร็จ · ลูกค้าปฏิเสธ · ใบ 0301)
// กติกา:
//   • ข้อมูลเก็บ "รหัส" (code) — เปลี่ยนชื่อแล้วข้อมูลเก่าเห็นชื่อใหม่ทันที
//   • ซ่อน = ไม่ให้เลือกตอนกรอกใหม่ แต่ข้อมูลเดิมยังแสดงชื่อ · ลบได้เฉพาะตัวที่ไม่มีข้อมูลใช้ (ฐานกัน option_in_use)
//   • ค่าที่ไม่ตรงรายการ (ข้อมูลเก่า/นำเข้า) คงตามเดิม แสดง "‹ค่า› (ตามที่บันทึกไว้)" ทุกที่
//     ฟอร์มยังเลือกค่าเดิมได้ · ตัวกรองมีค่าเดิมด้วย
//   • ตัวเลือก "ระบุเอง" (free_text · เช่น อื่น ๆ (ระบุ)) เก็บเป็น "รหัส:ข้อความ" → แสดง "อื่น ๆ: ข้อความ"
//   • "อื่น ๆ" เขียนแบบเดียว (มีเว้นวรรค) — ป้ายที่พิมพ์ "อื่นๆ" ถูกจัดให้เป็น "อื่น ๆ" (ฐานจัดซ้ำอีกชั้น)
// ไฟล์นี้เป็นตรรกะล้วน (ไม่พึ่ง React/ชั้นข้อมูล) — ทั้งหน้าจอ ฝั่งเซิร์ฟเวอร์ และข้อทดสอบใช้ชุดเดียวกัน
// ข้อทดสอบ: tests/unit/optionLists.test.ts

export type รายการกลาง = "lead_source" | "appointment_type" | "prospect_lost_reason" | "lead_lost_reason";
export const รายการกลางทั้งหมด: readonly รายการกลาง[] = ["lead_source", "appointment_type", "prospect_lost_reason", "lead_lost_reason"];
export const ชื่อรายการกลาง: Record<รายการกลาง, string> = {
  lead_source: "ช่องทางที่มาลูกค้าเป้าหมาย",
  appointment_type: "ประเภทนัดหมาย",
  prospect_lost_reason: "เหตุผลผู้สนใจไม่สำเร็จ",
  lead_lost_reason: "เหตุผลปิดการขายไม่สำเร็จ",
};

export type ตัวเลือกกลาง = {
  list: รายการกลาง;
  code: string;
  label: string;
  sort: number;
  hidden: boolean;
  /** ตัวเลือก "ระบุเอง" — เลือกแล้วพิมพ์ข้อความ เก็บ "รหัส:ข้อความ" */
  freeText: boolean;
};
/** ร่างที่หน้าตั้งค่าส่งไปบันทึก — ไม่มี code = ตัวเลือกใหม่ (ฐานตั้งรหัสให้) · ลำดับในอาร์เรย์ = ลำดับที่แสดง */
export type ร่างตัวเลือก = { code?: string; label: string; hidden: boolean };

export const ความยาวป้ายสูงสุด = 60;
export const จำนวนตัวเลือกสูงสุด = 50;
export const คำต่อท้ายนอกรายการ = " (ตามที่บันทึกไว้)";

type ตั้งต้น = { code: string; label: string; hidden?: boolean; freeText?: boolean };
/** ค่าตั้งต้น (ตรงกับที่ใบ 0296 ใส่ในฐาน) — โหมดข้อมูลตัวอย่าง/ยังโหลดไม่เสร็จใช้ชุดนี้ */
export const ตัวเลือกตั้งต้น: Record<รายการกลาง, readonly ตั้งต้น[]> = {
  lead_source: [
    { code: "facebook", label: "Facebook" },
    { code: "website", label: "เว็บไซต์" },
    { code: "line", label: "LINE" },
    { code: "walk_in", label: "ลูกค้าเข้ามาเอง" },
    { code: "referral", label: "แนะนำต่อ" },
    { code: "exhibition", label: "งานแสดงสินค้า" },
    { code: "other", label: "อื่น ๆ" },
    // ระบบใส่ให้เองตอนเปิดงานใหม่ของลูกค้าเดิม (หน้าลูกค้า) — ไม่ให้เลือกในฟอร์ม แต่ข้อมูลแสดงชื่อ
    { code: "repeat_customer", label: "ลูกค้าเดิม (งานขายใหม่)", hidden: true },
  ],
  appointment_type: [
    { code: "visit", label: "นัดพบลูกค้า" },
    { code: "design_meet", label: "นัดนำเสนอสินค้า" },
    { code: "presentation", label: "นำเสนอราคา" },
    { code: "contract_sign", label: "เซ็นสัญญาซื้อขาย" },
    { code: "close", label: "ปิดการขาย" },
    { code: "follow_up", label: "โทรติดตาม" },
    // ค่าที่มีในข้อมูล (นำเข้า/ระบบเดิม) — call ชื่อเดียวกับ follow_up จึงซ่อนไว้ (ไม่ให้มี "โทรติดตาม" 2 ตัวในฟอร์ม)
    { code: "call", label: "โทรติดตาม", hidden: true },
    { code: "meeting", label: "ประชุม" },
    { code: "site_visit", label: "นัดดูหน้างาน" },
  ],
  prospect_lost_reason: [
    { code: "no_capital", label: "เงินทุนไม่พอ" },
    { code: "not_ready", label: "ยังไม่พร้อม" },
    { code: "other_brand", label: "เลือกแบรนด์อื่น" },
    { code: "bad_location", label: "ทำเลไม่เหมาะ" },
    { code: "other", label: "อื่น ๆ (ระบุ)", freeText: true },
  ],
  // ใบ 0301 (บอสตัดสิน 23 พ.ย. 69 ข้อ 14): ปิดการขายไม่สำเร็จ · ลูกค้าปฏิเสธใบเสนอราคา — ตั้งต้นจากรายการเดิมของ HQ (hq_sales_journey.lost)
  lead_lost_reason: [
    { code: "price_high", label: "ราคาสูงเกินงบประมาณ" },
    { code: "competitor", label: "คู่แข่งให้ข้อเสนอดีกว่า" },
    { code: "budget", label: "งบประมาณไม่พร้อม" },
    { code: "no_response", label: "ลูกค้าไม่ตอบสนอง" },
    { code: "other", label: "อื่น ๆ (ระบุ)", freeText: true },
  ],
};

export function รายการตั้งต้นของ(list: รายการกลาง): ตัวเลือกกลาง[] {
  return ตัวเลือกตั้งต้น[list].map((x, i) => ({ list, code: x.code, label: x.label, sort: i + 1, hidden: !!x.hidden, freeText: !!x.freeText }));
}
export const รายการตั้งต้นทั้งหมด = (): ตัวเลือกกลาง[] => รายการกลางทั้งหมด.flatMap(รายการตั้งต้นของ);

/** แถวของตาราง option_lists (snake_case) → ตัวเลือกกลาง — ตัวเชื่อมข้อมูลทุกแบบใช้ตัวนี้ */
export function จากแถว(r: Record<string, unknown>): ตัวเลือกกลาง {
  return {
    list: String(r.list) as รายการกลาง, code: String(r.code ?? ""), label: String(r.label ?? ""),
    sort: Number(r.sort ?? 0), hidden: r.hidden === true, freeText: r.free_text === true || r.freeText === true,
  };
}

/** "อื่นๆ" → "อื่น ๆ" · ตัดช่องว่างซ้ำ/หัวท้าย (ป้ายที่บันทึก) */
export function จัดป้าย(s: string): string {
  return String(s ?? "").replace(/\s+/g, " ").trim().replace(/อื่นๆ/g, "อื่น ๆ");
}
/** คีย์เทียบป้าย (นำเข้าจากไฟล์ · ตรวจซ้ำ): จัดป้าย + ตัวเล็ก + ไม่สนช่องว่าง */
export const คีย์ป้าย = (s: string) => จัดป้าย(s).toLowerCase().replace(/\s+/g, "");

/** เรียงตามลำดับที่ HQ ตั้ง */
export const เรียง = (items: readonly ตัวเลือกกลาง[]) => [...items].sort((a, b) => a.sort - b.sort || a.code.localeCompare(b.code));
export const ของรายการ = (items: readonly ตัวเลือกกลาง[], list: รายการกลาง) => เรียง(items.filter(x => x.list === list));

/** ป้ายของตัวเลือก "ระบุเอง" ตอนแสดงคู่ข้อความ — ตัด "(ระบุ…)" ท้ายชื่อ: "อื่น ๆ (ระบุ)" → "อื่น ๆ" */
export const ป้ายหัวระบุเอง = (label: string) => label.replace(/\s*\(ระบุ[^)]*\)\s*$/, "").trim() || label;

/** แยกค่า "รหัส:ข้อความ" ของตัวเลือกระบุเอง — ไม่ใช่ = null */
export function แยกค่าระบุเอง(items: readonly ตัวเลือกกลาง[], value: string): { item: ตัวเลือกกลาง; ข้อความ: string } | null {
  const i = value.indexOf(":");
  if (i <= 0) return null;
  const code = value.slice(0, i);
  const item = items.find(x => x.code === code && x.freeText);
  return item ? { item, ข้อความ: value.slice(i + 1).trim() } : null;
}
/** ค่าที่เก็บของตัวเลือกระบุเอง */
export const ค่าระบุเอง = (code: string, ข้อความ: string) => `${code}:${ข้อความ.trim()}`;

/** ป้ายของค่าที่บันทึก: ตรงรหัส = ชื่อ · ระบุเอง = "อื่น ๆ: ข้อความ" · ไม่ตรงรายการ = "‹ค่า› (ตามที่บันทึกไว้)" · ว่าง = ค่าว่าง */
export function ป้ายของ(items: readonly ตัวเลือกกลาง[], value: string | null | undefined, ว่าง = "—"): string {
  const v = String(value ?? "").trim();
  if (!v) return ว่าง;
  const ตรง = items.find(x => x.code === v);
  if (ตรง) return ตรง.label;
  const ระบุ = แยกค่าระบุเอง(items, v);
  if (ระบุ) return ระบุ.ข้อความ ? `${ป้ายหัวระบุเอง(ระบุ.item.label)}: ${ระบุ.ข้อความ}` : ระบุ.item.label;
  return `${v}${คำต่อท้ายนอกรายการ}`;
}
/** ค่านี้อยู่ในรายการไหม (รหัสตรง หรือ ระบุเองของตัวเลือกในรายการ) */
export const อยู่ในรายการ = (items: readonly ตัวเลือกกลาง[], value: string | null | undefined) => {
  const v = String(value ?? "").trim();
  return !!v && (items.some(x => x.code === v) || !!แยกค่าระบุเอง(items, v));
};

export type ตัวเลือกช่อง = { value: string; label: string };
/** ตัวเลือกของฟอร์มกรอก: ตัวที่ไม่ซ่อน + ค่าปัจจุบัน (ถ้าซ่อนอยู่/ไม่ตรงรายการ) — ค่าเดิมต้องยังเห็น ห้ามหายเงียบ */
export function ตัวเลือกฟอร์ม(items: readonly ตัวเลือกกลาง[], ค่าปัจจุบัน?: string | null): ตัวเลือกช่อง[] {
  const ผล = เรียง(items).filter(x => !x.hidden).map(x => ({ value: x.code, label: x.label }));
  const v = String(ค่าปัจจุบัน ?? "").trim();
  if (v && !ผล.some(o => o.value === v)) ผล.unshift({ value: v, label: ป้ายของ(items, v) });
  return ผล;
}
/** ตัวเลือกของช่องเลือกเหตุผล (ปิดไม่สำเร็จ · ผู้สนใจไม่สำเร็จ): แบบตัวเลือกฟอร์ม แต่ตัวระบุเอง ("อื่น ๆ (ระบุ)") อยู่ท้ายเสมอ
 *  แม้ถูกซ่อน — บอสสั่ง 24 พ.ย. 69 "ต้องมี อื่น ๆ ในหน้าปิดการขายไม่สำเร็จ บางทีจะไม่อยู่ในตัวเลือก" (ฐานกันซ่อน/ลบอีกชั้น ใบ 0303) */
export function ตัวเลือกเหตุผลฟอร์ม(items: readonly ตัวเลือกกลาง[], ค่าปัจจุบัน?: string | null): ตัวเลือกช่อง[] {
  const ระบุ = เรียง(items).filter(x => x.freeText).map(x => ({ value: x.code, label: x.label }));
  const อื่น = ตัวเลือกฟอร์ม(items.filter(x => !x.freeText), ค่าปัจจุบัน && !ระบุ.some(o => o.value === ค่าปัจจุบัน) ? ค่าปัจจุบัน : null);
  return [...อื่น, ...ระบุ];
}

/** ตัวเลือกของกล่องเหตุผลกลาง (ถามเหตุผล · ตัวเลือกรหัส) — ตัวที่ไม่ซ่อน + ตัวระบุเอง ("อื่น ๆ (ระบุ)") ท้ายเสมอแม้ถูกซ่อน
 *  บอสสั่ง 24 พ.ย. 69 "ต้องมี อื่น ๆ ในหน้าปิดการขายไม่สำเร็จ บางทีจะไม่อยู่ในตัวเลือก" — เดิมกรองตัวที่ซ่อนทิ้งทั้งหมด ซ่อนแล้วหายทุกกล่อง
 *  เลือกแล้วกล่องให้พิมพ์ข้อความ (ว่าง = ยืนยันไม่ได้) · ฐานกันซ่อน/ลบตัวระบุเองอีกชั้น (ใบ 0303) */
export const ตัวเลือกกล่องเหตุผล = (items: readonly ตัวเลือกกลาง[]) => [
  ...เรียง(items).filter(x => !x.hidden && !x.freeText),
  ...เรียง(items).filter(x => x.freeText),
].map(x => ({ ค่า: x.code, ป้าย: x.label, พิมพ์เอง: x.freeText }));

/** ตัวเลือกของตัวกรอง: ทุกตัวในรายการ (รวมที่ซ่อน — ข้อมูลเก่ายังใช้) + ค่าในข้อมูลที่ไม่ตรงรายการ */
export function ตัวเลือกตัวกรอง(items: readonly ตัวเลือกกลาง[], ค่าในข้อมูล: readonly (string | null | undefined)[] = []): ตัวเลือกช่อง[] {
  const ผล = เรียง(items).map(x => ({ value: x.code, label: x.label }));
  const เห็น = new Set(ผล.map(o => o.value));
  const นอก: ตัวเลือกช่อง[] = [];
  for (const raw of ค่าในข้อมูล) {
    const v = String(raw ?? "").trim();
    if (!v || เห็น.has(v)) continue;
    เห็น.add(v);
    นอก.push({ value: v, label: ป้ายของ(items, v) });
  }
  return [...ผล, ...นอก.sort((a, b) => a.label.localeCompare(b.label, "th"))];
}

/** นำเข้าจากไฟล์: หาตัวเลือกจากป้าย (หรือรหัส) — ไม่เจอ = null (ห้ามเดา · หน้าจอเตือนเอง)
 *  ตัวที่ไม่ซ่อนก่อน (ป้ายซ้ำกับตัวที่ซ่อนได้ เช่น โทรติดตาม) */
export function หารหัสจากป้าย(items: readonly ตัวเลือกกลาง[], ข้อความ: string | null | undefined): string | null {
  const k = คีย์ป้าย(String(ข้อความ ?? ""));
  if (!k) return null;
  const ลำดับ = [...เรียง(items).filter(x => !x.hidden), ...เรียง(items).filter(x => x.hidden)];
  return (ลำดับ.find(x => คีย์ป้าย(x.label) === k) ?? ลำดับ.find(x => x.code.toLowerCase() === k))?.code ?? null;
}

// ── เหตุผลปิดการขายไม่สำเร็จ (lead_lost_reason · ใบ 0301) ─────────────────────────────────────────────────────
/** จัดค่าเหตุผลให้เป็นรหัส — กติกาเดียวกับ _lead_lost_value ในฐาน (ฐานจัดซ้ำทุกทางเขียน):
 *  รหัส / รหัส:ข้อความ = คงเดิม · ชื่อตรงรายการ = รหัส (ตัวที่แสดงก่อน) · "อื่น ๆ: x" = other:x · อื่น ๆ = other:ข้อความเดิม
 *  ใช้ตอนแสดง/จัดกลุ่มค่าเก่าที่ยังเป็นข้อความ (ข้อมูลตัวอย่างในเครื่อง) ให้จอเหมือนฐานจริง */
export function จัดค่าเหตุผล(items: readonly ตัวเลือกกลาง[], value: string | null | undefined): string {
  const v = String(value ?? "").trim();
  if (!v) return "";
  if (items.some(x => x.code === v) || แยกค่าระบุเอง(items, v)) return v;
  const k = คีย์ป้าย(v);
  const ตรง = [...เรียง(items).filter(x => !x.hidden && !x.freeText), ...เรียง(items).filter(x => x.hidden && !x.freeText)].find(x => คีย์ป้าย(x.label) === k);
  if (ตรง) return ตรง.code;
  const อื่น = items.find(x => x.code === "other" && x.freeText);
  if (!อื่น) return v;
  const i = v.indexOf(":");
  if (k.startsWith(คีย์ป้าย("อื่น ๆ")) && i > 0 && v.slice(i + 1).trim()) return ค่าระบุเอง("other", v.slice(i + 1).slice(0, 200));
  return ค่าระบุเอง("other", v.slice(0, 200));
}
/** ป้ายของเหตุผล (จัดค่าก่อน) — ค่าเก่าที่เป็นข้อความ = "อื่น ๆ: ข้อความ" แบบเดียวกับฐานหลังใบ 0301 */
export const ป้ายเหตุผล = (items: readonly ตัวเลือกกลาง[], value: string | null | undefined, ว่าง = "—") =>
  ป้ายของ(items, จัดค่าเหตุผล(items, value), ว่าง);
/** กลุ่มของเหตุผลสำหรับกราฟ/สรุป: รหัสในรายการ = กลุ่มของตัวนั้น · ระบุเอง = กลุ่มของตัวระบุเอง (ข้อความเก็บใน ข้อความ) */
export function กลุ่มเหตุผล(items: readonly ตัวเลือกกลาง[], value: string | null | undefined): { key: string; label: string; ข้อความ?: string } | null {
  const v = จัดค่าเหตุผล(items, value);
  if (!v) return null;
  const ตรง = items.find(x => x.code === v);
  if (ตรง) return { key: ตรง.code, label: ตรง.label };
  const ระบุ = แยกค่าระบุเอง(items, v);
  if (ระบุ) return { key: ระบุ.item.code, label: ป้ายหัวระบุเอง(ระบุ.item.label), ข้อความ: ระบุ.ข้อความ || undefined };
  return { key: v, label: `${v}${คำต่อท้ายนอกรายการ}` };
}

/** ตรวจร่างก่อนบันทึก (ฐานตรวจซ้ำ) — คืนข้อความผิดข้อแรก หรือ null */
export function ตรวจร่าง(rows: readonly ร่างตัวเลือก[]): string | null {
  if (!rows.length) return "ต้องมีอย่างน้อย 1 ตัวเลือก";
  if (rows.length > จำนวนตัวเลือกสูงสุด) return `ใส่ได้ไม่เกิน ${จำนวนตัวเลือกสูงสุด} ตัวเลือก`;
  const เห็น = new Map<string, string>();
  for (const r of rows) {
    const ป้าย = จัดป้าย(r.label);
    if (!ป้าย) return "ชื่อตัวเลือกว่างไม่ได้";
    if (ป้าย.length > ความยาวป้ายสูงสุด) return `ชื่อ “${ป้าย.slice(0, 20)}…” ยาวเกิน ${ความยาวป้ายสูงสุด} ตัวอักษร`;
    if (r.hidden) continue;   // ตัวที่ซ่อนชื่อซ้ำตัวที่แสดงได้ (ข้อมูลเก่า) — ฟอร์มไม่มีชื่อซ้ำให้เลือก
    const k = คีย์ป้าย(ป้าย);
    if (เห็น.has(k)) return `ชื่อ “${ป้าย}” ซ้ำกัน — ตัวที่แสดงต้องชื่อไม่ซ้ำ`;
    เห็น.set(k, ป้าย);
  }
  if (rows.every(r => r.hidden)) return "ต้องแสดงอย่างน้อย 1 ตัวเลือก";
  return null;
}
