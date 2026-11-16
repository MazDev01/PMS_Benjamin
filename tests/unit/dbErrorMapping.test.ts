import { describe, it, expect } from "vitest";
import { dbFail } from "../../packages/shared/server/v1/_ctx";

// ── รหัสข้อผิดพลาดของฐานข้อมูล ต้องกลายเป็นรหัสสถานะ HTTP ที่ถูกต้อง ──────────
//
// ตรวจพบ 27 ส.ค. 69 จากการยิง API จริง: ทุกความผิดพลาดตอบ 503 "ระบบขัดข้อง" เหมือนกันหมด
//   → ใบผ่านหมดอายุแล้วหน้าเว็บไม่รู้ว่าต้องต่ออายุ (ตัวต่ออายุดูรหัส 401 เป็นสัญญาณ)
//   → ข้อความดิบของฐานข้อมูล (ชื่อตาราง/ชื่อกฎความปลอดภัย) หลุดถึงเบราว์เซอร์
// เทสต์นี้คือด่านกันไม่ให้กลับไปเป็นแบบเดิม
const อ่าน = async (r: Response) => ({ status: r.status, body: await r.json() as { error?: string; code?: string } });

describe("แปลงข้อผิดพลาดของฐานข้อมูลเป็นคำตอบ HTTP", () => {
  it("ใบผ่านหมดอายุ/ไม่ถูกต้อง → 401 พร้อมข้อความที่คนอ่านรู้เรื่อง", async () => {
    const { status, body } = await อ่าน(dbFail("t", { message: "JWT cryptographic operation failed", code: "PGRST301" }));
    expect(status).toBe(401);
    expect(body.error).toContain("เข้าระบบใหม่");
    expect(body.error).not.toContain("JWT");
  });

  it("ถูกกฎความปลอดภัยปฏิเสธ → 403 และห้ามบอกชื่อตาราง", async () => {
    const { status, body } = await อ่าน(dbFail("t", {
      message: 'new row violates row-level security policy for table "hq_policy"', code: "42501" }));
    expect(status).toBe(403);
    expect(body.error).toBe("ไม่มีสิทธิ์ทำรายการนี้");
    expect(body.error).not.toContain("hq_policy");
  });

  it("ไม่พบแถว → 404", async () => {
    const { status } = await อ่าน(dbFail("t", { message: "Cannot coerce the result to a single JSON object", code: "PGRST116" }));
    expect(status).toBe(404);
  });

  it("ข้อมูลซ้ำ → 409 · ผิดเงื่อนไข → 400 · ชนิดผิด → 400", async () => {
    expect((await อ่าน(dbFail("t", { message: "duplicate key", code: "23505" }))).status).toBe(409);
    expect((await อ่าน(dbFail("t", { message: "check constraint", code: "23514" }))).status).toBe(400);
    expect((await อ่าน(dbFail("t", { message: "invalid input value for enum", code: "22P02" }))).status).toBe(400);
  });

  it("ข้อความที่ฟังก์ชันของเราเองเขียนไว้ (P0001) ต้องส่งต่อถึงผู้ใช้ตามจริง", async () => {
    const กฎธุรกิจ = await อ่าน(dbFail("t", { message: "boq_mismatch: ยอดในใบไม่ตรงกับรายการ", code: "P0001" }));
    expect(กฎธุรกิจ.status).toBe(400);
    expect(กฎธุรกิจ.body.error).toContain("ยอดในใบไม่ตรงกับรายการ");

    const ไม่พบ = await อ่าน(dbFail("t", { message: "not_found: ไม่พบลูกค้ารายนี้ในสาขา RYG", code: "P0001" }));
    expect(ไม่พบ.status).toBe(404);

    const ไม่มีสิทธิ์ = await อ่าน(dbFail("t", { message: "forbidden: no permission to write dealers", code: "P0001" }));
    expect(ไม่มีสิทธิ์.status).toBe(403);
  });

  it("รหัสที่ไม่รู้จัก → 503 และห้ามส่งข้อความดิบของฐานข้อมูลออกไป", async () => {
    const { status, body } = await อ่าน(dbFail("t", {
      message: 'relation "secret_internal_table" does not exist', code: "42P01" }));
    expect(status).toBe(503);
    expect(body.error).not.toContain("secret_internal_table");
    expect(body.code, "รหัสยังต้องส่งไป เพื่อให้หน้าเว็บแยกเคสได้").toBe("42P01");
  });
});

describe("ข้อผิดพลาดจากที่เก็บไฟล์ (ไม่มีช่องรหัสมาให้)", () => {
  it("กฎความปลอดภัยกัน → 403", async () => {
    const { status, body } = await อ่าน(dbFail("s", { message: "new row violates row-level security policy" }));
    expect(status).toBe(403);
    expect(body.code).toBe("42501");
  });
  it("ไม่พบไฟล์ → 404", async () => {
    expect((await อ่าน(dbFail("s", { message: "Object not found" }))).status).toBe(404);
  });
  it("ชนิดไฟล์ไม่รองรับ (รหัสซ่อนอยู่ในข้อความ) → 400 พร้อมบอกชนิดที่รับ", async () => {
    const { status, body } = await อ่าน(dbFail("s", { message: "database error, code: 23514" }));
    expect(status).toBe(400);
    expect(body.error).toContain("PDF");
  });
  it("ตารางหาย = ระบบเราพังเอง ต้องเป็น 503 ไม่ใช่ 404", async () => {
    expect((await อ่าน(dbFail("s", { message: 'relation "x" does not exist', code: "42P01" }))).status).toBe(503);
  });
});
