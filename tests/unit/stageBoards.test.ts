// บอร์ดลากได้ (บอสสั่ง 5 พ.ย. 69) — ทางย้ายของบอร์ดผู้สนใจ HQ + บอร์ดลีดดีลเลอร์ (ตัวกลาง StageBoard)
//   ตกบนโค้ดก่อนแก้: ไม่มีไฟล์กติกาบอร์ด (prospectBoard · leadBoard)
import { describe, it, expect } from "vitest";
import { ทางย้ายผู้สนใจ, คอลัมน์ของผู้สนใจ, คอลัมน์บอร์ดผู้สนใจ, ลำดับฟอร์ม, ขั้นที่ขาด, เหตุเป็นดีลเลอร์ไม่ได้ } from "../../packages/shared/lib/prospectBoard";
import { ทางย้ายลีด, คำสั่งของปลายทาง } from "../../packages/shared/lib/leadBoard";

const ไป = (xs: { ไป: string; ไม่ได้เพราะ?: string | null }[]) => xs.map(x => `${x.ไป}${x.ไม่ได้เพราะ ? "✗" : ""}`);

describe("บอร์ดผู้สนใจ (5 คอลัมน์ · บอสสั่ง 5 พ.ย. 69 รอบ 2)", () => {
  it("5 คอลัมน์: ติดต่อ · คุยรายละเอียด · ส่งใบค่าแฟรนไชส์ · พร้อมตั้งเป็นดีลเลอร์ · ปิดแล้ว (ยุบไว้)", () => {
    expect(คอลัมน์บอร์ดผู้สนใจ.map(c => [c.key, c.label])).toEqual([
      ["contact", "ติดต่อ"], ["discuss", "คุยรายละเอียด"], ["proposal", "ส่งใบค่าแฟรนไชส์"], ["ready", "พร้อมตั้งเป็นดีลเลอร์"], ["closed", "ปิดแล้ว"]]);
    expect(คอลัมน์บอร์ดผู้สนใจ.filter(c => c.ยุบได้).map(c => c.key), "ยุบไว้เฉพาะปิดแล้ว").toEqual(["closed"]);
  });
  it("ขั้นย่อยรวมอยู่คอลัมน์เดียว (สถานะในฐานไม่เปลี่ยน)", () => {
    const คอล = (status: Parameters<typeof คอลัมน์ของผู้สนใจ>[0]["status"], key?: "พร้อม" | "รอชำระ" | "รอตอบรับ") => คอลัมน์ของผู้สนใจ({ status }, key ? { key, label: "" } : null);
    expect([คอล("new"), คอล("contacted"), คอล("profile_sent"), คอล("meeting")]).toEqual(["contact", "contact", "discuss", "discuss"]);
    expect([คอล("considering", "รอตอบรับ"), คอล("considering", "รอชำระ"), คอล("considering"), คอล("considering", "พร้อม")]).toEqual(["proposal", "proposal", "proposal", "ready"]);
    expect([คอล("won"), คอล("lost")]).toEqual(["closed", "closed"]);
  });
  it("ฟอร์มที่ขาดตามลำดับ: คุยรายละเอียด = บันทึกการติดต่อ (ถ้ายังไม่มี) → ยืนยันส่งข้อมูล · ส่งใบ = นัดคุย (ถ้ายังไม่มี) → ออกใบ", () => {
    expect(ลำดับฟอร์ม("new", "discuss")).toEqual(["contact", "profile"]);
    expect(ลำดับฟอร์ม("contacted", "discuss")).toEqual(["profile"]);
    expect(ลำดับฟอร์ม("profile_sent", "proposal")).toEqual(["meeting", "proposal"]);
    expect(ลำดับฟอร์ม("meeting", "proposal")).toEqual(["proposal"]);
    expect(ขั้นที่ขาด("profile_sent", "discuss"), "ถึงคอลัมน์แล้ว = จบ").toBeNull();
    expect(ขั้นที่ขาด("considering", "proposal"), "ส่งใบแล้ว = จบ").toBeNull();
    expect(ขั้นที่ขาด("new", "proposal"), "ข้ามคอลัมน์ = ไม่มีฟอร์ม").toBeNull();
  });
  it("ทางย้าย: คอลัมน์ถัดไป 1 คอลัมน์ + ปิดแล้ว · ไม่มีทางถอย/ข้าม", () => {
    const ทาง = (status: "new" | "contacted" | "profile_sent" | "meeting") => ทางย้ายผู้สนใจ({ status }, null, true).map(x => [x.ไป, x.ฟอร์ม]);
    expect(ทาง("new")).toEqual([["discuss", "contact"], ["closed", "close"]]);
    expect(ทาง("contacted")).toEqual([["discuss", "profile"], ["closed", "close"]]);
    expect(ทาง("profile_sent")).toEqual([["proposal", "meeting"], ["closed", "close"]]);
    expect(ทาง("meeting")).toEqual([["proposal", "proposal"], ["closed", "close"]]);
    expect(ทางย้ายผู้สนใจ({ status: "new" }, null, true)[0].ป้าย).toBe("คุยรายละเอียด — บันทึกการติดต่อ → ยืนยันส่งข้อมูลบริษัท");
  });
  it("ส่งใบแล้ว: พร้อมตั้งเป็นดีลเลอร์ลากเข้าเองไม่ได้ · ปิดแล้วได้ · เป็นดีลเลอร์ได้เฉพาะพร้อม (บอกเหตุผล)", () => {
    expect(ไป(ทางย้ายผู้สนใจ({ status: "considering" }, { key: "รอตอบรับ", label: "" }, true))).toEqual(["ready✗", "closed"]);
    expect(ไป(ทางย้ายผู้สนใจ({ status: "considering" }, { key: "พร้อม", label: "" }, true))).toEqual(["closed"]);
    expect(เหตุเป็นดีลเลอร์ไม่ได้({ status: "considering" }, { key: "พร้อม", label: "" }, true)).toBeNull();
    expect(เหตุเป็นดีลเลอร์ไม่ได้({ status: "considering" }, { key: "รอชำระ", label: "", ชำระ: 1, ยอด: 2 }, true)).toMatch(/ชำระไม่ครบ/);
    expect(เหตุเป็นดีลเลอร์ไม่ได้({ status: "meeting" }, { key: "พร้อม", label: "" }, true), "ยังไม่ส่งใบ = ไม่ได้ (ไม่ใช้สถานะย่อยของใบเก่า)").toMatch(/ต้องส่งใบค่าแฟรนไชส์/);
    expect(เหตุเป็นดีลเลอร์ไม่ได้({ status: "considering" }, null, false), "ยังโหลดใบไม่เสร็จ = รอผล ไม่เดา").toMatch(/กำลังตรวจ/);
  });
  it("จบแล้ว (เป็นดีลเลอร์/ไม่สำเร็จ) ลากไม่ได้ (เปิดติดตามใหม่ที่แผง)", () => {
    expect(ทางย้ายผู้สนใจ({ status: "won" }, null, true)).toEqual([]);
    expect(ทางย้ายผู้สนใจ({ status: "lost" }, null, true)).toEqual([]);
  });
});

describe("บอร์ดลีดดีลเลอร์ (L1–L5 · 4 ขั้น 9 พ.ย. 69)", () => {
  it("ขั้น 1 → 2 · 3 → 4 (ได้ใบ HQ → เสนอราคาลูกค้า) · ปิดไม่สำเร็จได้ทุกขั้นที่ยังเปิด", () => {
    expect(ไป(ทางย้ายลีด(1))).toEqual(["2", "7"]);
    expect(ไป(ทางย้ายลีด(3))).toEqual(["4", "7"]);
    expect(ทางย้ายลีด(3)[0].ป้าย).toBe("เสนอราคาลูกค้า");
  });
  it("L1 ขอราคา HQ → ได้ใบ HQ ลากไม่ได้ (รอ HQ ส่งราคา)", () => {
    expect(ทางย้ายลีด(2).find(x => x.ไป === "3")?.ไม่ได้เพราะ).toMatch(/รอ HQ ส่งราคา/);
  });
  it("L2 เสนอราคาลูกค้า (ขั้นสุดท้าย) → ปิดสำเร็จ · ไม่มีขั้น 5 ให้ลากไป · L5 ปิดแล้วลากออกไม่ได้", () => {
    expect(ไป(ทางย้ายลีด(4))).toEqual(["6", "7"]);
    expect(ทางย้ายลีด(4).some(x => x.ไป === "5"), "ไม่มีขั้น รอลูกค้าตอบ แยกแล้ว").toBe(false);
    expect(ทางย้ายลีด(6)).toEqual([]);
    expect(ทางย้ายลีด(7)).toEqual([]);
  });
  it("ปลายทาง → คำสั่งกล่องขั้นต่อไป", () => {
    expect([คำสั่งของปลายทาง("2"), คำสั่งของปลายทาง("4"), คำสั่งของปลายทาง("6"), คำสั่งของปลายทาง("7")]).toEqual(["ถัดไป", "ถัดไป", "ปิดสำเร็จ", "ปิดไม่สำเร็จ"]);
  });
});
