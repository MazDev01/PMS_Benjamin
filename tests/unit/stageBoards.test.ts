// บอร์ดลากได้ (บอสสั่ง 5 พ.ย. 69) — ทางย้ายของบอร์ดผู้สนใจ HQ + บอร์ดลีดดีลเลอร์ (ตัวกลาง StageBoard)
//   ตกบนโค้ดก่อนแก้: ไม่มีไฟล์กติกาบอร์ด (prospectBoard · leadBoard)
import { describe, it, expect } from "vitest";
import { ทางย้ายผู้สนใจ, คอลัมน์ของผู้สนใจ, คอลัมน์บอร์ดผู้สนใจ } from "../../packages/shared/lib/prospectBoard";
import { ทางย้ายลีด, คำสั่งของปลายทาง } from "../../packages/shared/lib/leadBoard";

const ไป = (xs: { ไป: string; ไม่ได้เพราะ?: string | null }[]) => xs.map(x => `${x.ไป}${x.ไม่ได้เพราะ ? "✗" : ""}`);

describe("บอร์ดผู้สนใจ", () => {
  it("คอลัมน์ตาม FLOW 8 คอลัมน์", () => expect(คอลัมน์บอร์ดผู้สนใจ.map(c => c.key)).toEqual(["new", "contacted", "profile_sent", "meeting", "proposal", "ready", "won", "lost"]));
  it("ส่งใบแล้วแยกตามสถานะย่อย: พร้อม = คอลัมน์พร้อม · รอตอบรับ/รอชำระ = คอลัมน์ส่งใบ", () => {
    expect(คอลัมน์ของผู้สนใจ({ status: "considering" }, { key: "พร้อม", label: "" })).toBe("ready");
    expect(คอลัมน์ของผู้สนใจ({ status: "considering" }, { key: "รอชำระ", label: "" })).toBe("proposal");
    expect(คอลัมน์ของผู้สนใจ({ status: "considering" }, null)).toBe("proposal");
    expect(คอลัมน์ของผู้สนใจ({ status: "meeting" }, null)).toBe("meeting");
  });
  it("ทีละ 1 ขั้นไปข้างหน้า + ไม่สำเร็จ · ไม่มีทางถอย/ข้าม · ฟอร์มของขั้น", () => {
    expect(ทางย้ายผู้สนใจ({ status: "new" }, null, true).map(x => [x.ไป, x.ฟอร์ม])).toEqual([["contacted", "contact"], ["lost", "lost"]]);
    expect(ทางย้ายผู้สนใจ({ status: "contacted" }, null, true).map(x => [x.ไป, x.ฟอร์ม])).toEqual([["profile_sent", "profile"], ["lost", "lost"]]);
    expect(ทางย้ายผู้สนใจ({ status: "profile_sent" }, null, true).map(x => [x.ไป, x.ฟอร์ม])).toEqual([["meeting", "meeting"], ["lost", "lost"]]);
    expect(ทางย้ายผู้สนใจ({ status: "meeting" }, null, true).map(x => [x.ไป, x.ฟอร์ม])).toEqual([["proposal", "proposal"], ["lost", "lost"]]);
  });
  it("ส่งใบแล้ว: พร้อมตั้งเป็นดีลเลอร์ลากเข้าเองไม่ได้ · เป็นดีลเลอร์ได้เฉพาะพร้อม (บอกเหตุผล)", () => {
    expect(ไป(ทางย้ายผู้สนใจ({ status: "considering" }, { key: "รอตอบรับ", label: "" }, true))).toEqual(["ready✗", "won✗", "lost"]);
    expect(ไป(ทางย้ายผู้สนใจ({ status: "considering" }, { key: "พร้อม", label: "" }, true))).toEqual(["won", "lost"]);
    expect(ทางย้ายผู้สนใจ({ status: "considering" }, null, false).find(x => x.ไป === "won")?.ไม่ได้เพราะ, "ยังโหลดใบไม่เสร็จ = รอผล ไม่เดา").toMatch(/กำลังตรวจ/);
  });
  it("จบแล้ว (เป็นดีลเลอร์/ไม่สำเร็จ) ลากไม่ได้ (เปิดติดตามใหม่ที่แผง)", () => {
    expect(ทางย้ายผู้สนใจ({ status: "won" }, null, true)).toEqual([]);
    expect(ทางย้ายผู้สนใจ({ status: "lost" }, null, true)).toEqual([]);
  });
});

describe("บอร์ดลีดดีลเลอร์ (L1–L5)", () => {
  it("ขั้น 1 → 2 · 3 → 4 · 4 → 5 · ปิดไม่สำเร็จได้ทุกขั้นที่ยังเปิด", () => {
    expect(ไป(ทางย้ายลีด(1))).toEqual(["2", "7"]);
    expect(ไป(ทางย้ายลีด(3))).toEqual(["4", "7"]);
    expect(ไป(ทางย้ายลีด(4))).toEqual(["5", "7"]);
  });
  it("L1 ขอราคา HQ → ได้ใบ HQ ลากไม่ได้ (รอ HQ ส่งราคา)", () => {
    expect(ทางย้ายลีด(2).find(x => x.ไป === "3")?.ไม่ได้เพราะ).toMatch(/รอ HQ ส่งราคา/);
  });
  it("L2 รอลูกค้าตอบ → ปิดสำเร็จ · L5 ปิดแล้วลากออกไม่ได้", () => {
    expect(ไป(ทางย้ายลีด(5))).toEqual(["6", "7"]);
    expect(ทางย้ายลีด(6)).toEqual([]);
    expect(ทางย้ายลีด(7)).toEqual([]);
  });
  it("ปลายทาง → คำสั่งกล่องขั้นต่อไป", () => {
    expect([คำสั่งของปลายทาง("2"), คำสั่งของปลายทาง("6"), คำสั่งของปลายทาง("7")]).toEqual(["ถัดไป", "ปิดสำเร็จ", "ปิดไม่สำเร็จ"]);
  });
});
