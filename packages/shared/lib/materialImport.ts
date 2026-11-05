// ── นำเข้ารายการวัสดุจากไฟล์ (ตั้งค่า › รายการวัสดุ · บอสสั่ง 5 พ.ย. 69 · ใบ 0279) — ตรรกะล้วน (ข้อทดสอบหน่วย tests/unit/materialImport.test.ts) ──
//   คอลัมน์: หมวด · ชื่อวัสดุ* · หน่วย* · ราคาต่อหน่วย (ก่อน VAT) · เปิดใช้ — หาแถวหัวตารางเอง (10 แถวแรก) จับคู่ตามชื่อหัว
//   แบ่ง 4 กลุ่ม:
//     พร้อม = วัสดุใหม่ · อัปเดตราคา = หมวด+ชื่อตรงของเดิม (ตัวกันซ้ำของฐาน · บอสตอบข้อ 1 = ก) แสดงราคาเก่า→ใหม่ · เปลี่ยนแค่ราคา (ข้อ 3 = ก)
//     ต้องตรวจ = หน่วยไม่อยู่ในรายการ (หน่วยมาตรฐาน BOQ + หน่วยที่รายการวัสดุใช้อยู่ · กด "ใช้หน่วยนี้" หรือเลือกจากรายการ · ข้อ 2 = ก)
//                · หน่วยต่างจากของเดิม (กด "ใช้หน่วยเดิม") · ราคาไม่ใช่ตัวเลข · ค่าเปิดใช้อ่านไม่ออก
//     ข้าม = ไม่มีชื่อหรือหน่วย · ซ้ำกันในไฟล์ · ราคาเท่าเดิม (ไม่มีอะไรเปลี่ยน)
//   เปิดใช้ในไฟล์ใช้กับวัสดุใหม่เท่านั้น (ว่าง = เปิดใช้) · ห้ามลบวัสดุที่มีอยู่ผ่านการนำเข้า · ฐานตรวจซ้ำทุกข้อ (hq_materials_import)
import type { MaterialTemplate } from "./materialTemplates";

export type ช่องวัสดุ = "category" | "name" | "unit" | "unitPrice" | "active";
export const ลำดับช่องวัสดุ: readonly ช่องวัสดุ[] = ["category", "name", "unit", "unitPrice", "active"];
/** หัวตารางของแบบฟอร์มตัวอย่าง (ตรงกับที่ระบบอ่าน) */
export const หัวแบบฟอร์มวัสดุ: Record<ช่องวัสดุ, string> = {
  category: "หมวด", name: "ชื่อวัสดุ*", unit: "หน่วย*", unitPrice: "ราคาต่อหน่วย (ก่อน VAT)", active: "เปิดใช้",
};
const ชื่อเรียก: Record<ช่องวัสดุ, string[]> = {
  category: ["หมวด", "หมวดหมู่", "หมวดวัสดุ", "category"],
  name: ["ชื่อวัสดุ", "ชื่อ", "วัสดุ", "รายการ", "name"],
  unit: ["หน่วย", "unit"],
  unitPrice: ["ราคาต่อหน่วย(ก่อนvat)", "ราคาต่อหน่วย", "ราคา", "price", "unitprice"],
  active: ["เปิดใช้", "สถานะ", "active"],
};
const คีย์หัว = (s: string) => String(s ?? "").toLowerCase().replace(/[\s*]/g, "");
const คีย์ซ้ำ = (หมวด: string, ชื่อ: string) => `${หมวด.trim().toLowerCase()}\u001f${ชื่อ.trim().toLowerCase()}`;
const คีย์หน่วย = (s: string) => s.trim().toLowerCase();

export type คู่คอลัมน์วัสดุ = Partial<Record<ช่องวัสดุ, number>>;
/** หาแถวหัวตาราง (10 แถวแรก ต้องมีทั้งชื่อวัสดุและหน่วย) — ไม่เจอ = null */
export function หาหัวตารางวัสดุ(ตาราง: string[][]): { แถวหัว: number; คู่: คู่คอลัมน์วัสดุ } | null {
  for (let i = 0; i < Math.min(10, ตาราง.length); i++) {
    const หัว = (ตาราง[i] ?? []).map(คีย์หัว);
    const คู่: คู่คอลัมน์วัสดุ = {};
    for (const k of ลำดับช่องวัสดุ) {
      const j = หัว.findIndex(h => ชื่อเรียก[k].some(n => คีย์หัว(n) === h));
      if (j >= 0) คู่[k] = j;
    }
    if (คู่.name !== undefined && คู่.unit !== undefined) return { แถวหัว: i, คู่ };
  }
  return null;
}

/** ราคาจากไฟล์: ตัด , ฿ บาท ช่องว่าง · ไม่ใช่ตัวเลขไม่ติดลบ/ว่าง = null (ไม่เดาเป็น 0) */
export function อ่านราคา(ดิบ: string | number | null | undefined): number | null {
  const s = String(ดิบ ?? "").replace(/[,\s฿]|บาท/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}
/** เปิดใช้จากไฟล์: ว่าง = เปิดใช้ · อ่านไม่ออก = null (ต้องตรวจ) */
export function อ่านเปิดใช้(ดิบ: string | null | undefined): boolean | null {
  const s = String(ดิบ ?? "").trim().toLowerCase();
  if (s === "" || ["เปิด", "เปิดใช้", "ใช้", "ใช่", "true", "yes", "y", "1", "✓"].includes(s)) return true;
  if (["ปิด", "ปิดใช้", "ไม่ใช้", "ไม่", "false", "no", "n", "0"].includes(s)) return false;
  return null;
}

export type กลุ่มวัสดุ = "ready" | "update" | "review" | "skip";
export type แถววัสดุ = {
  /** เลขแถวในไฟล์ (นับแบบ Excel) */
  row: number;
  category: string; name: string; unit: string;
  ราคาดิบ: string; เปิดใช้ดิบ: string;
  /** ผู้ใช้กด "ใช้หน่วยนี้" ในหน้าตรวจ */
  ยืนยันหน่วย?: boolean;
  /** ผลจากการจัดกลุ่ม */
  กลุ่ม: กลุ่มวัสดุ; เหตุ: string[]; unitPrice: number | null; active: boolean | null;
  เดิม?: { id: number; unit: string; unitPrice: number };
};

/** ตาราง → แถวดิบ (ยังไม่จัดกลุ่ม) · ข้ามแถวว่างทั้งแถว */
export function เตรียมแถววัสดุ(ตาราง: string[][], แถวหัว: number, คู่: คู่คอลัมน์วัสดุ): แถววัสดุ[] {
  const ค่า = (r: string[], k: ช่องวัสดุ) => (คู่[k] === undefined ? "" : String(r[คู่[k]!] ?? "").trim());
  const ผล: แถววัสดุ[] = [];
  ตาราง.slice(แถวหัว + 1).forEach((r, i) => {
    if (!(r ?? []).some(v => String(v ?? "").trim() !== "")) return;
    ผล.push({ row: แถวหัว + i + 2, category: ค่า(r, "category"), name: ค่า(r, "name"), unit: ค่า(r, "unit"),
      ราคาดิบ: ค่า(r, "unitPrice"), เปิดใช้ดิบ: ค่า(r, "active"), กลุ่ม: "ready", เหตุ: [], unitPrice: null, active: null });
  });
  return ผล;
}

/** จัดกลุ่มทุกแถว (เรียกซ้ำได้ทุกครั้งที่แก้ในหน้าตรวจ) — ที่มี = รายการวัสดุในระบบ · หน่วยที่รู้จัก = หน่วยมาตรฐาน + หน่วยที่รายการวัสดุใช้อยู่ */
export function จัดกลุ่มวัสดุ(แถว: แถววัสดุ[], ที่มี: Pick<MaterialTemplate, "id" | "category" | "name" | "unit" | "unitPrice">[], หน่วยที่รู้จัก: readonly string[]): แถววัสดุ[] {
  const ของเดิม = new Map(ที่มี.map(t => [คีย์ซ้ำ(t.category, t.name), t]));
  const หน่วย = new Set(หน่วยที่รู้จัก.map(คีย์หน่วย));
  const เห็น = new Map<string, number>();
  return แถว.map(r => {
    const unitPrice = อ่านราคา(r.ราคาดิบ), active = อ่านเปิดใช้(r.เปิดใช้ดิบ);
    const พื้น = { ...r, unitPrice, active, เดิม: undefined as แถววัสดุ["เดิม"], เหตุ: [] as string[] };
    if (!r.name.trim() || !r.unit.trim()) return { ...พื้น, กลุ่ม: "skip" as const, เหตุ: [!r.name.trim() ? "ไม่มีชื่อวัสดุ" : "ไม่มีหน่วย"] };
    const k = คีย์ซ้ำ(r.category, r.name);
    if (เห็น.has(k)) return { ...พื้น, กลุ่ม: "skip" as const, เหตุ: [`ซ้ำกันในไฟล์ (แถว ${เห็น.get(k)})`] };
    เห็น.set(k, r.row);
    const t = ของเดิม.get(k);
    const เดิม = t ? { id: t.id, unit: t.unit, unitPrice: Number(t.unitPrice) } : undefined;
    const เหตุ: string[] = [];
    if (unitPrice === null) เหตุ.push(r.ราคาดิบ ? `ราคาไม่ใช่ตัวเลข ("${r.ราคาดิบ}")` : "ไม่มีราคา");
    if (เดิม && คีย์หน่วย(เดิม.unit) !== คีย์หน่วย(r.unit)) เหตุ.push(`หน่วยต่างจากของเดิม ("${เดิม.unit}")`);
    if (!เดิม && !หน่วย.has(คีย์หน่วย(r.unit)) && !r.ยืนยันหน่วย) เหตุ.push(`หน่วย "${r.unit}" ไม่อยู่ในรายการ`);
    if (!เดิม && active === null) เหตุ.push(`ค่าเปิดใช้อ่านไม่ออก ("${r.เปิดใช้ดิบ}")`);
    if (เหตุ.length) return { ...พื้น, เดิม, กลุ่ม: "review" as const, เหตุ };
    if (เดิม) {
      if (Math.round(unitPrice! * 100) === Math.round(เดิม.unitPrice * 100)) return { ...พื้น, เดิม, กลุ่ม: "skip" as const, เหตุ: ["ราคาเท่าเดิม"] };
      return { ...พื้น, เดิม, กลุ่ม: "update" as const };
    }
    return { ...พื้น, กลุ่ม: "ready" as const };
  });
}

/** แถวที่ส่งฐาน (พร้อม + อัปเดตราคา) — อัปเดตราคาส่งหน่วยของเดิม (ฐานเทียบซ้ำ) */
export const แถวส่งฐานวัสดุ = (r: แถววัสดุ) => ({
  category: r.category.trim(), name: r.name.trim(), unit: (r.เดิม?.unit ?? r.unit).trim(), unitPrice: r.unitPrice ?? 0, active: r.active ?? true,
});
export const นำเข้าวัสดุได้สูงสุด = 1000;

// ── ตารางเพิ่มวัสดุหลายแถว (MaterialAddModal) ──
export type แถวกรอก = { key: number; category: string; name: string; unit: string; price: string; active: boolean };
export const ว่างทั้งแถว = (r: แถวกรอก) => !r.category.trim() && !r.name.trim() && !r.unit.trim() && !r.price.trim();
/** ปัญหาของแต่ละแถว (ช่อง → ข้อความ) — แถวว่างทั้งแถวไม่นับ · ไม่มีในผล = แถวผ่าน */
export function ตรวจแถวเพิ่มวัสดุ(แถว: แถวกรอก[], ที่มี: Pick<MaterialTemplate, "category" | "name">[]): Map<number, Partial<Record<"name" | "unit" | "price", string>>> {
  const ของเดิม = new Set(ที่มี.map(t => คีย์ซ้ำ(t.category, t.name)));
  const เห็น = new Set<string>();
  const ผล = new Map<number, Partial<Record<"name" | "unit" | "price", string>>>();
  for (const r of แถว) {
    if (ว่างทั้งแถว(r)) continue;
    const ผิด: Partial<Record<"name" | "unit" | "price", string>> = {};
    if (!r.name.trim()) ผิด.name = "ต้องระบุชื่อวัสดุ";
    if (!r.unit.trim()) ผิด.unit = "ต้องเลือกหน่วย";
    if (r.price.trim() && อ่านราคา(r.price) === null) ผิด.price = "ราคาไม่ใช่ตัวเลข";
    if (r.name.trim()) {
      const k = คีย์ซ้ำ(r.category, r.name);
      if (ของเดิม.has(k)) ผิด.name = "มีวัสดุนี้ในหมวดเดียวกันอยู่แล้ว";
      else if (เห็น.has(k)) ผิด.name = "ซ้ำกับแถวข้างบน";
      เห็น.add(k);
    }
    if (Object.keys(ผิด).length) ผล.set(r.key, ผิด);
  }
  return ผล;
}
