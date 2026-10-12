import { describe, it, expect } from "vitest";
import { สร้างแผ่นงานสำรอง, อ่านแผ่นงานสำรอง, แผ่น, อ่านค่าเปิดปิด, อ่านตัวเลข, type ชุดการตั้งค่า } from "@pms/shared/lib/settingsBackup";
import { สร้างไฟล์Xlsx } from "@pms/shared/lib/exportWorkbook";
import { แยกสมุดงานจากXlsx } from "@pms/shared/lib/importSheet";
import { DEFAULT_HQ_POLICY, DEFAULT_HQ_TARGETS, DEFAULT_HQ_NOTIF_RULES } from "@pms/shared/lib/mock";

const ของจริง: ชุดการตั้งค่า = {
  policy: { ...DEFAULT_HQ_POLICY, vat: 7, quoteValidityDays: 30 },
  targets: { annualTarget: 260_000_000, winRateTarget: 40, onTimeTarget: 85 },
  notifRules: { ...DEFAULT_HQ_NOTIF_RULES },
  lostReasons: ["ราคาสูงกว่าคู่แข่ง", "ลูกค้าเลื่อนโครงการ"],
  company: { name: "เบญจมิน", address: "กรุงเทพฯ", taxId: "0105500000000", phone: "021234567", email: "info@example.com", website: "example.com" },
  dealers: [
    { id: "d1", code: "CNX", name: "เชียงใหม่", province: "เชียงใหม่", region: "เหนือ", revenueTarget: 12_000_000, status: "active" },
    { id: "d2", code: "RYG", name: "ระยอง", province: "ระยอง", region: "ตะวันออก", revenueTarget: 8_000_000, status: "inactive" },
  ],
  catalog: [{
    id: "P1", name: "โรงงาน", spec: "โครงสร้างเหล็ก", price: 5_500, unit: "ตร.ม.", effectiveDate: "2026-01-01",
    priceHistory: [{ price: 5_000, effectiveDate: "2025-01-01" }],
    subtypes: ["โรงงานอาหาร", "คลังสินค้า"], subtypePrices: { "โรงงานอาหาร": 6_200 },
    image: "/templates/factory.svg", plans: [{ name: "แปลน A", path: "a.pdf", size: 100 }],
  }],
};

/** ส่งออกเป็นไฟล์จริง แล้วอ่านกลับเข้ามาเหมือนที่หน้าเว็บทำ */
async function ไปกลับ(แก้ไข?: (เล่ม: Map<string, string[][]>) => void, เดิม = ของจริง): Promise<ชุดการตั้งค่า> {
  const blob = สร้างไฟล์Xlsx(สร้างแผ่นงานสำรอง(ของจริง));
  const เล่ม = await แยกสมุดงานจากXlsx(await blob.arrayBuffer());
  แก้ไข?.(เล่ม);
  return อ่านแผ่นงานสำรอง(เล่ม, เดิม);
}

describe("ไฟล์สำรองการตั้งค่า (Excel)", () => {
  it("ส่งออกครบทุกเรื่อง และหัวตารางเป็นภาษาคน", () => {
    const แผ่นงาน = สร้างแผ่นงานสำรอง(ของจริง);
    expect(แผ่นงาน.map(s => s.ชื่อ)).toEqual([
      แผ่น.บริษัท, แผ่น.นโยบาย, แผ่น.เป้าหมาย, แผ่น.เกณฑ์เตือน, แผ่น.หัวข้อเตือน,
      แผ่น.เหตุผล, แผ่น.ดีลเลอร์, แผ่น.แม่แบบ, แผ่น.แม่แบบย่อย, แผ่น.ประวัติราคา,
    ]);
    const ดีลเลอร์ = แผ่นงาน.find(s => s.ชื่อ === แผ่น.ดีลเลอร์)!;
    expect(ดีลเลอร์.หัวตาราง).toEqual(["รหัสดีลเลอร์", "ชื่อดีลเลอร์", "จังหวัด", "ภูมิภาค", "เป้าทั้งปี (บาท)", "สถานะ"]);
    expect(ดีลเลอร์.แถว).toEqual([
      ["CNX", "เชียงใหม่", "เชียงใหม่", "เหนือ", 12_000_000, "เปิดใช้งาน"],
      ["RYG", "ระยอง", "ระยอง", "ตะวันออก", 8_000_000, "ปิดใช้งาน"],
    ]);
    // ค่าเปิด/ปิด ต้องอ่านออกโดยไม่ต้องแปลศัพท์
    expect(แผ่นงาน.find(s => s.ชื่อ === แผ่น.หัวข้อเตือน)!.แถว[0][1]).toBe("เปิด");
    expect(แผ่นงาน.find(s => s.ชื่อ === แผ่น.นโยบาย)!.แถว[0][1]).toBe(7);   // VAT เป็นตัวเลขจริง
    // ราคาต้องเป็นตัวเลขจริง เอาไปคำนวณต่อใน Excel ได้
    expect(แผ่นงาน.find(s => s.ชื่อ === แผ่น.แม่แบบ)!.แถว[0][3]).toBe(5_500);
    expect(แผ่นงาน.find(s => s.ชื่อ === แผ่น.แม่แบบย่อย)!.แถว).toEqual([["P1", "โรงงาน", "โรงงานอาหาร", 6_200, 5_500], ["P1", "โรงงาน", "คลังสินค้า", "", 5_500]]);
    expect(แผ่นงาน.find(s => s.ชื่อ === แผ่น.ประวัติราคา)!.แถว).toEqual([["P1", "โรงงาน", 5_000, "2025-01-01", ""]]);
  });

  it("ส่งออกแล้วนำเข้ากลับ ได้ค่าเดิมทุกเรื่อง", async () => {
    const ก = await ไปกลับ();
    expect(ก.company).toEqual(ของจริง.company);
    expect(ก.policy).toEqual(ของจริง.policy);
    expect(ก.targets).toEqual(ของจริง.targets);
    expect(ก.lostReasons).toEqual(ของจริง.lostReasons);
    expect(ก.dealers).toEqual(ของจริง.dealers);
    expect(ก.notifRules?.alerts.prospectIdle.days).toBe(DEFAULT_HQ_NOTIF_RULES.alerts.prospectIdle.days);
    expect(ก.notifRules?.alerts.proposalAwaiting.days).toBe(DEFAULT_HQ_NOTIF_RULES.alerts.proposalAwaiting.days);
    expect(ก.catalog?.[0].price).toBe(5_500);
  });

  it("แก้ค่าใน Excel แล้วนำเข้า ค่าที่แก้มีผลจริง", async () => {
    const ผล = await ไปกลับ(เล่ม => {
      const เป้า = เล่ม.get(แผ่น.เป้าหมาย)!;
      เป้า[1][1] = "123,000,000";                 // พิมพ์จุลภาคมาก็ต้องอ่านออก
      เล่ม.get(แผ่น.หัวข้อเตือน)![1][1] = "ปิด";
      เล่ม.get(แผ่น.เกณฑ์เตือน)![1][1] = "21";   // แถวแรก = ลูกค้าเป้าหมาย (HQ) ไม่ได้ติดต่อกี่วัน
      เล่ม.get(แผ่น.ดีลเลอร์)!.push(["LPG", "ลำปาง", "ลำปาง", "เหนือ", "3000000", "เปิดใช้งาน"]);
      เล่ม.get(แผ่น.แม่แบบ)![1][3] = "6000";
    });
    expect(ผล.targets?.annualTarget).toBe(123_000_000);
    expect(ผล.notifRules?.alerts.prospectFollowUpDue.on).toBe(false);
    expect(ผล.notifRules?.alerts.prospectFollowUpDue.inapp).toBe(false);
    expect(ผล.notifRules?.alerts.prospectIdle.days).toBe(21);
    expect(ผล.notifRules?.alerts.prospectIdle.on).toBe(true);
    expect(ผล.dealers?.length).toBe(3);
    expect(ผล.dealers?.[2]).toMatchObject({ code: "LPG", name: "ลำปาง", revenueTarget: 3_000_000, status: "active" });
    expect(ผล.catalog?.[0].price).toBe(6_000);
  });

  it("สิ่งที่ใส่ในตารางไม่ได้ (รูป/แบบแปลน/ประวัติราคา/รหัสภายใน) ต้องไม่หายตอนนำเข้า", async () => {
    const ผล = await ไปกลับ();
    expect(ผล.catalog?.[0].image).toBe("/templates/factory.svg");
    expect(ผล.catalog?.[0].plans?.length).toBe(1);
    expect(ผล.catalog?.[0].priceHistory.length).toBe(1);
    expect(ผล.dealers?.[0].id).toBe("d1");   // ดีลเลอร์เดิมต้องคงรหัสภายใน ไม่งั้นงานขายหลุดจากเจ้าของ
  });

  it("ลบแท็บที่ไม่ต้องการทิ้ง = ไม่แตะเรื่องนั้น", async () => {
    const ผล = await ไปกลับ(เล่ม => {
      for (const k of [แผ่น.ดีลเลอร์, แผ่น.แม่แบบ, แผ่น.บริษัท]) เล่ม.delete(k);
    });
    expect(ผล.dealers).toBeUndefined();
    expect(ผล.catalog).toBeUndefined();
    expect(ผล.company).toBeUndefined();
    expect(ผล.targets?.annualTarget).toBe(260_000_000);
  });

  it("ช่องที่เว้นว่างไว้ = ใช้ค่าเดิม ไม่ใช่ศูนย์", () => {
    expect(อ่านตัวเลข("", 42)).toBe(42);
    expect(อ่านตัวเลข("฿1,250,000", 0)).toBe(1_250_000);
    expect(อ่านตัวเลข("7%", 0)).toBe(7);
    expect(อ่านตัวเลข("อ่านไม่ออก", 5)).toBe(5);
    expect(อ่านค่าเปิดปิด("", true)).toBe(true);
    expect(อ่านค่าเปิดปิด("ปิด", true)).toBe(false);
    expect(อ่านค่าเปิดปิด("YES", false)).toBe(true);
  });

  it("สลับลำดับคอลัมน์/แถวใน Excel แล้วยังนำเข้าถูกช่อง", async () => {
    const ผล = await ไปกลับ(เล่ม => {
      const t = เล่ม.get(แผ่น.ดีลเลอร์)!;
      // ผู้ใช้สลับสองคอลัมน์แรก (รหัส ↔ ชื่อ)
      for (const r of t) { const [a, b] = [r[0], r[1]]; r[0] = b; r[1] = a; }
      // และเรียงหัวข้อในแท็บเป้าหมายใหม่
      const เป้า = เล่ม.get(แผ่น.เป้าหมาย)!;
      เล่ม.set(แผ่น.เป้าหมาย, [เป้า[0], เป้า[3], เป้า[1], เป้า[2]]);
    });
    expect(ผล.dealers?.[0]).toMatchObject({ code: "CNX", name: "เชียงใหม่" });
    expect(ผล.targets).toEqual(ของจริง.targets);
  });
});
