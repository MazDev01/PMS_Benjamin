import { describe, it, expect } from "vitest";
// @ts-expect-error — สคริปต์ .mjs ไม่มีไฟล์ชนิด
import { อ่านตัวเลือก } from "../../scripts/lib/tempPasswordAccounts.mjs";

// ตัวเลือกของ scripts/flag-temp-passwords.mjs (บั๊กจริง 16 ต.ค. 69: สั่ง --prod โดยไม่มี --only
//   สคริปต์จำกัดเฉพาะสาขาชื่อ "--prod" → นับบนระบบจริงได้ 0 บัญชี ทั้งที่ควรราว 149)
describe("flag-temp-passwords · อ่านตัวเลือก", () => {
  it("--prod อย่างเดียว = ทุกสาขา ไม่จำกัด", () => {
    expect(อ่านตัวเลือก(["--prod"])).toMatchObject({ ฐานจริง: true, ลงมือ: false, only: [], ผิด: "" });
  });
  it("--prod --apply --yes-prod = ทุกสาขา ไม่จำกัด", () => {
    expect(อ่านตัวเลือก(["--prod", "--apply", "--yes-prod"])).toMatchObject({ ฐานจริง: true, ลงมือ: true, only: [] });
  });
  it("ไม่มีตัวเลือก = ฐานทดสอบ ดูอย่างเดียว ทุกสาขา", () => {
    expect(อ่านตัวเลือก([])).toMatchObject({ ฐานจริง: false, ลงมือ: false, only: [] });
  });
  it("--only ABC,XYZ = จำกัดสองสาขา (ตำแหน่งไหนก็ได้)", () => {
    expect(อ่านตัวเลือก(["--apply", "--only", "ABC, XYZ"]).only).toEqual(["ABC", "XYZ"]);
    expect(อ่านตัวเลือก(["--only", "ABC", "--apply"]).only).toEqual(["ABC"]);
  });
  it("--unset = โหมดล้างเครื่องหมาย (บอสตัดสิน 19 ต.ค. 69) · ไม่มี --unset = ไม่ล้าง", () => {
    expect(อ่านตัวเลือก(["--unset", "--prod"])).toMatchObject({ ฐานจริง: true, ลงมือ: false, ล้าง: true, only: [] });
    expect(อ่านตัวเลือก(["--prod", "--apply", "--yes-prod"]).ล้าง).toBe(false);
  });
  it("--only ไม่ตามด้วยรหัส = ผิด", () => {
    expect(อ่านตัวเลือก(["--prod", "--only"]).ผิด).not.toBe("");
    expect(อ่านตัวเลือก(["--only", "--apply"]).ผิด).not.toBe("");
  });
});
