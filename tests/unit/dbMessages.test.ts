// ── ข้อความผิดพลาดของฐานที่ยังใช้คำเก่า → แอปแปลเป็น "ฉบับเก่า" (บอสสั่ง 13 พ.ย. 69 · งาน A · แบบ ข ไม่มีใบปรับฐาน) ───────────
//   จำลองฐานตอบ quote_superseded / quote_superseded_manual ด้วยข้อความจริงของ quotations_version_guard (ใบ 0285)
//   ทางที่ขึ้นจอ: DbError (ตัวต่อฐานทั้งสองแบบ) → friendlyError · และข้อผิดพลาดธรรมดาที่ส่งเข้า friendlyError ตรง
//   คำห้ามต่อเป็นชิ้น (ข้อความจริงของฐาน) — ไฟล์ข้อทดสอบไม่ใช่ข้อความบนจอ
import { describe, it, expect } from "vitest";
import { DbError, friendlyError } from "@pms/shared/lib/friendlyError";
import { แปลข้อความฐาน } from "@pms/shared/lib/dbMessages";
// @ts-expect-error — ไฟล์ .mjs ของเครื่องมือ (ไม่มีชนิดข้อมูล)
import { หาคำห้าม } from "../../scripts/lib/uiTerms.mjs";

const คำเก่า = "ถูก" + "แทนที่";
const จากฐาน = {
  superseded: `quote_superseded: ใบ QT-RYG-2569-0012 ${คำเก่า}ด้วยฉบับใหม่แล้ว อ่านได้อย่างเดียว — ตอบรับ/ปฏิเสธที่ฉบับล่าสุด`,
  manual: `quote_superseded_manual: ใบจะ${คำเก่า}เองเมื่อส่งฉบับใหม่ให้ลูกค้า — ตั้งเองไม่ได้`,
};
const ไม่มีคำห้าม = (s: string) => expect(หาคำห้าม("packages/shared/x.tsx", [{ text: s, line: 1 }]).map((x: { ห้าม: string }) => x.ห้าม), s).toEqual([]);

describe("ฐานตอบ quote_superseded → จอขึ้นคำว่า ฉบับเก่า", () => {
  it("DbError (ทางของตัวต่อฐาน) → friendlyError: ข้อความไทยที่แปลแล้ว ไม่มีรหัส ไม่มีคำห้าม · เลขใบคงไว้", () => {
    const จอ = friendlyError(new DbError(จากฐาน.superseded, "P0001"));
    expect(จอ).toBe("ใบ QT-RYG-2569-0012 เป็นฉบับเก่าแล้ว (มีฉบับใหม่ส่งให้ลูกค้า) อ่านได้อย่างเดียว — ตอบรับ/ปฏิเสธที่ฉบับล่าสุด");
    ไม่มีคำห้าม(จอ);
  });
  it("quote_superseded_manual", () => {
    const จอ = friendlyError(new DbError(จากฐาน.manual));
    expect(จอ).toBe("ใบจะเป็นฉบับเก่าเองเมื่อส่งฉบับใหม่ให้ลูกค้า — ตั้งเองไม่ได้");
    ไม่มีคำห้าม(จอ);
  });
  it("ข้อความของ DbError เอง (ทางที่แสดง e.message ตรง) ก็ไม่มีคำห้าม · คงรหัสให้โค้ดแยกเคสได้", () => {
    const e = new DbError(จากฐาน.superseded);
    expect(e.message.startsWith("quote_superseded: ")).toBe(true);
    ไม่มีคำห้าม(e.message);
  });
  it("ข้อผิดพลาดธรรมดา (ไม่ใช่ DbError) ส่งเข้า friendlyError ก็แปล", () => {
    ไม่มีคำห้าม(friendlyError(new Error(จากฐาน.manual)));
    ไม่มีคำห้าม(friendlyError({ message: จากฐาน.superseded }));
  });
  it("ข้อความอื่นไม่ถูกแตะ", () => {
    expect(แปลข้อความฐาน("quote_sent_locked: ใบส่งให้ลูกค้าแล้ว แก้ไม่ได้")).toBe("quote_sent_locked: ใบส่งให้ลูกค้าแล้ว แก้ไม่ได้");
    expect(แปลข้อความฐาน("ข้อความธรรมดา")).toBe("ข้อความธรรมดา");
  });
});

describe("ตัวตรวจคำบนจอตกเมื่อใส่คำห้ามคืน (คำบนการ์ด 13 พ.ย. 69)", () => {
  it("ถูกแทนที่ · เจาะดูที่มา = คำห้าม", () => {
    const เจอ = (s: string) => หาคำห้าม("packages/shared/x.tsx", [{ text: s, line: 1 }]).map((x: { ห้าม: string }) => x.ห้าม);
    expect(เจอ(`ใบ · ไม่นับร่าง/${คำเก่า}`)).toEqual([คำเก่า]);
    expect(เจอ("เจาะดู" + "ที่มา")).toEqual(["เจาะดูที่มา"]);
    expect(เจอ("ใบ · ในช่วงที่เลือก (ไม่นับฉบับร่างและฉบับเก่า)")).toEqual([]);
  });
});
