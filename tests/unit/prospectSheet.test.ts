// ดึง Google Sheets เข้าหน้าตัวอย่างนำเข้าผู้สนใจ (บอสสั่ง 20 พ.ย. 69 · /api/v1/prospect-sheet) — ตัวดึงจำลองทั้งหมด ไม่มีลิงก์ชีตจริง
//   ตกบนโค้ดก่อนแก้: ไม่มี server/v1/prospectSheet
import { describe, it, expect } from "vitest";
import { รหัสชีต, ลิงก์ส่งออก, ดึงไฟล์ชีต, ตารางจากชีต, ข้อความไม่เปิดแชร์, ขนาดสูงสุดชีต } from "../../packages/shared/server/v1/prospectSheet";
import { สร้างไฟล์Xlsx } from "../../packages/shared/lib/exportWorkbook";
import { หัวไฟล์เฟซบุ๊ก } from "../../packages/shared/lib/facebookLeadImport";

const รหัส = "ZZtest_fake-sheet-id-0000000000";   // รหัสปลอม (ไม่ใช่ชีตจริง)
type คำตอบ = { status: number; headers?: Record<string, string>; body?: BodyInit | null };
/** ตัวดึงจำลอง: จดทุกลิงก์ที่ถูกดึง · ตอบตามลำดับ */
function ตัวดึง(...คำตอบ: คำตอบ[]) {
  const ที่ดึง: string[] = [];
  const fn = (async (u: string | URL | Request) => {
    ที่ดึง.push(String(u));
    const c = คำตอบ.shift();
    if (!c) throw new Error("ดึงเกินจำนวนที่ตั้งไว้");
    return new Response(c.body ?? null, { status: c.status, headers: c.headers });
  }) as typeof fetch;
  return { fn, ที่ดึง };
}
async function xlsxปลอม() {
  const blob = สร้างไฟล์Xlsx([
    { ชื่อ: "10.26", หัวตาราง: [...หัวไฟล์เฟซบุ๊ก], แถว: [["2026-10-05T09:00:00+07:00", "ZZ โฆษณา", "ตราด", "zz@example.test", "ZZ หนึ่ง", "p:+66000000101"]] },
    { ชื่อ: "11.26", หัวตาราง: [...หัวไฟล์เฟซบุ๊ก], แถว: [] },
  ]);
  return new Uint8Array(await blob.arrayBuffer());
}

describe("ลิงก์ Google Sheets", () => {
  it("รับเฉพาะ https://docs.google.com/spreadsheets/d/<รหัส> · ดึงรหัสอย่างเดียว", () => {
    expect(รหัสชีต(`https://docs.google.com/spreadsheets/d/${รหัส}/edit#gid=0`)).toBe(รหัส);
    expect(รหัสชีต(`https://docs.google.com/spreadsheets/d/${รหัส}`)).toBe(รหัส);
    expect(รหัสชีต(`https://docs.google.com/spreadsheets/d/${รหัส}/edit?usp=sharing`)).toBe(รหัส);
    for (const ผิด of [
      `http://docs.google.com/spreadsheets/d/${รหัส}/edit`,           // ไม่ใช่ https
      `https://docs.google.com.evil.example/spreadsheets/d/${รหัส}`,  // โดเมนปลอม
      `https://evil.example/?u=https://docs.google.com/spreadsheets/d/${รหัส}`,
      `https://docs.google.com/document/d/${รหัส}/edit`,              // ไม่ใช่ชีต
      "https://docs.google.com/spreadsheets/d/short/edit",             // รหัสสั้นเกิน
      `https://docs.google.com/spreadsheets/d/${รหัส}/edit x`,         // มีช่องว่าง
      "", null, 42,
    ]) expect(รหัสชีต(ผิด), String(ผิด)).toBeNull();
  });
  it("ลิงก์ส่งออกประกอบเอง (ไม่ใช้ลิงก์ของผู้ใช้)", () => {
    expect(ลิงก์ส่งออก(รหัส)).toBe(`https://docs.google.com/spreadsheets/d/${รหัส}/export?format=xlsx`);
  });
});

describe("ดึงไฟล์ชีต", () => {
  it("ตามการเปลี่ยนทางไป *.googleusercontent.com ได้ · ดึงลิงก์ที่ประกอบเองเท่านั้น · ได้ตารางทุกชีต (ตัวอ่าน .xlsx เดียวกับหน้าเว็บ)", async () => {
    const ไฟล์ = await xlsxปลอม();
    const ด = ตัวดึง(
      { status: 307, headers: { location: "https://doc-0s-zz.sheets.googleusercontent.com/export/zz?format=xlsx" } },
      { status: 200, headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }, body: ไฟล์ },
    );
    const ตาราง = await ตารางจากชีต(รหัส, ด.fn);
    expect(ด.ที่ดึง[0]).toBe(ลิงก์ส่งออก(รหัส));
    expect(ด.ที่ดึง[1]).toBe("https://doc-0s-zz.sheets.googleusercontent.com/export/zz?format=xlsx");
    expect(ตาราง.map(([ชื่อ]) => ชื่อ)).toEqual(["10.26", "11.26"]);
    expect(ตาราง[0][1][1]).toContain("ZZ หนึ่ง");
  });
  it("ชีตไม่เปิดแชร์: เปลี่ยนทางไป accounts.google.com · 401/403 · หน้า HTML · ไม่ใช่ไฟล์ zip = ข้อความไทยชัด", async () => {
    const กรณี: คำตอบ[][] = [
      [{ status: 302, headers: { location: "https://accounts.google.com/ServiceLogin?continue=zz" } }],
      [{ status: 401 }], [{ status: 403 }],
      [{ status: 200, headers: { "content-type": "text/html; charset=utf-8" }, body: "<html>login</html>" }],
    ];
    for (const c of กรณี) await expect(ดึงไฟล์ชีต(รหัส, ตัวดึง(...c).fn)).rejects.toMatchObject({ message: ข้อความไม่เปิดแชร์, status: 403 });
    await expect(ตารางจากชีต(รหัส, ตัวดึง({ status: 200, headers: { "content-type": "application/octet-stream" }, body: "not a zip" }).fn))
      .rejects.toMatchObject({ message: ข้อความไม่เปิดแชร์ });
  });
  it("เปลี่ยนทางไปโดเมนอื่น/ไม่ใช่ https = ไม่ดึงต่อ", async () => {
    for (const ไป of ["https://evil.example/x", "http://doc.sheets.googleusercontent.com/x", "https://googleusercontent.com.evil.example/x"]) {
      const ด = ตัวดึง({ status: 302, headers: { location: ไป } });
      await expect(ดึงไฟล์ชีต(รหัส, ด.fn), ไป).rejects.toMatchObject({ status: 400 });
      expect(ด.ที่ดึง, "ไม่ดึงปลายทางที่ไม่อนุญาต").toHaveLength(1);
    }
  });
  it("เพดานขนาด 10 MB (content-length และระหว่างอ่าน) · เปลี่ยนทางเกิน 5 ครั้ง · 404", async () => {
    await expect(ดึงไฟล์ชีต(รหัส, ตัวดึง({ status: 200, headers: { "content-length": String(ขนาดสูงสุดชีต + 1) }, body: "x" }).fn)).rejects.toMatchObject({ status: 413 });
    await expect(ดึงไฟล์ชีต(รหัส, ตัวดึง({ status: 200, body: new Uint8Array(ขนาดสูงสุดชีต + 1) }).fn)).rejects.toMatchObject({ status: 413 });
    const วน = Array.from({ length: 7 }, () => ({ status: 302, headers: { location: "https://docs.google.com/spreadsheets/d/zz/export" } }));
    await expect(ดึงไฟล์ชีต(รหัส, ตัวดึง(...วน).fn)).rejects.toMatchObject({ status: 502 });
    await expect(ดึงไฟล์ชีต(รหัส, ตัวดึง({ status: 404 }).fn)).rejects.toMatchObject({ status: 404 });
  });
});
