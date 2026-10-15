import { describe, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("../../packages/shared/server/mail/outbox", () => ({ ส่งอีเมลค้างส่ง: vi.fn(), คลังบนฐาน: vi.fn(), ตัวส่งSMTP: vi.fn() }));
import { ยืนยันโค้ดอีเมล, ยืนยันอีเมลแทนดีลเลอร์, ลองโค้ดได้ } from "../../packages/shared/server/contactEmail";

// ── ยืนยันอีเมลติดต่อ: เขียนตัวนับครั้งผิด/สถานะโค้ดไม่สำเร็จ = ต้องปฏิเสธการยืนยัน (บอสสั่ง 15 ต.ค. 69) ───────────────
//   เดิม: กรอกผิดแล้วเขียนตัวนับไม่สำเร็จ ระบบไม่รู้ตัว → ตัวนับไม่ขึ้น เดาโค้ดได้ไม่จำกัด และโค้ดที่ถูกยังผ่านหลังเดาผิดเกินกำหนด
//         โค้ดถูกแล้วลบโค้ดไม่สำเร็จ → โค้ดเดิมใช้ซ้ำได้
//   จำลองฐานข้อมูลด้วยตัวปลอม: กำหนดได้ว่าการเขียนตารางไหนล้มเหลว แล้วดูว่าการยืนยันถูกปฏิเสธและไม่ตั้งสถานะยืนยัน

const UID = "11111111-1111-1111-1111-111111111111";
const แฮช = (code: string) => createHash("sha256").update(`${UID}:${code}`).digest("hex");

type พัง = { นับ?: boolean; ลบโค้ด?: boolean };
function ฐานปลอม(พัง: พัง = {}, attempts = 0) {
  const บันทึก: string[] = [];
  const แถวโค้ด = { email: "x@example.test", code_hash: แฮช("123456"), expires_at: new Date(Date.now() + 600_000).toISOString(), attempts };
  const from = (table: string) => {
    let op = "select"; let payload: Record<string, unknown> | undefined; let แถวเดียว = false;
    const q = {
      select: () => q, eq: () => q, maybeSingle: () => { แถวเดียว = true; return q; }, single: () => { แถวเดียว = true; return q; },
      update: (p: Record<string, unknown>) => { op = "update"; payload = p; return q; },
      delete: () => { op = "delete"; return q; },
      then: (ok: (r: unknown) => unknown) => {
        บันทึก.push(`${table}.${op}${payload ? ":" + Object.keys(payload).join(",") : ""}`);
        const ผิด = { message: "จำลอง: ฐานข้อมูลเขียนไม่สำเร็จ" };
        let r: unknown = { data: null, error: null };
        if (table === "contact_email_codes" && op === "select") r = { data: แถวโค้ด, error: null };
        if (table === "contact_email_codes" && op === "update") r = พัง.นับ ? { data: null, error: ผิด } : { data: [{ attempts: Number(payload?.attempts) }], error: null };
        if (table === "contact_email_codes" && op === "delete") r = พัง.ลบโค้ด ? { data: null, error: ผิด } : { data: [{ user_id: UID }], error: null };
        const โปรไฟล์ = { id: UID, contact_email: "x@example.test", contact_email_verified_at: null };
        if (table === "profiles" && op === "select") r = { data: แถวเดียว ? โปรไฟล์ : [โปรไฟล์], error: null };
        if (table === "profiles" && op === "update") r = { data: null, error: null };
        return Promise.resolve(r).then(ok);
      },
    };
    return q;
  };
  const admin = { from, auth: { admin: { updateUserById: async () => { บันทึก.push("auth.update"); return { error: null }; }, getUserById: async () => ({ data: { user: { app_metadata: {} } } }) } } };
  return { admin: admin as unknown as SupabaseClient, บันทึก };
}
const ตั้งยืนยันแล้ว = (บันทึก: string[]) => บันทึก.some(x => x.startsWith("profiles.update:contact_email_verified_at"));

describe("ยืนยันโค้ดอีเมล", () => {
  it("เขียนตัวนับไม่สำเร็จ → ปฏิเสธ แม้โค้ดถูก และไม่ตั้งสถานะยืนยัน", async () => {
    const { admin, บันทึก } = ฐานปลอม({ นับ: true });
    const ผล = await ยืนยันโค้ดอีเมล(admin, { userId: UID, appMeta: {} }, "123456");
    expect(ผล.ok).toBe(false);
    expect(ตั้งยืนยันแล้ว(บันทึก)).toBe(false);
  });
  it("เขียนตัวนับไม่สำเร็จ + โค้ดผิด → ปฏิเสธ", async () => {
    const { admin } = ฐานปลอม({ นับ: true });
    expect((await ยืนยันโค้ดอีเมล(admin, { userId: UID, appMeta: {} }, "000000")).ok).toBe(false);
  });
  it("โค้ดผิด → นับครั้งผิดก่อนตอบ", async () => {
    const { admin, บันทึก } = ฐานปลอม();
    const ผล = await ยืนยันโค้ดอีเมล(admin, { userId: UID, appMeta: {} }, "000000");
    expect(ผล.ok).toBe(false);
    expect(บันทึก).toContain("contact_email_codes.update:attempts");
  });
  it("ผิดครบกำหนดแล้ว → โค้ดที่ถูกก็ไม่ผ่าน", async () => {
    const { admin, บันทึก } = ฐานปลอม({}, ลองโค้ดได้);
    expect((await ยืนยันโค้ดอีเมล(admin, { userId: UID, appMeta: {} }, "123456")).ok).toBe(false);
    expect(ตั้งยืนยันแล้ว(บันทึก)).toBe(false);
  });
  it("โค้ดถูกแต่ลบโค้ด (ใช้ครั้งเดียว) ไม่สำเร็จ → ปฏิเสธ และไม่ตั้งสถานะยืนยัน", async () => {
    const { admin, บันทึก } = ฐานปลอม({ ลบโค้ด: true });
    const ผล = await ยืนยันโค้ดอีเมล(admin, { userId: UID, appMeta: {} }, "123456");
    expect(ผล.ok).toBe(false);
    expect(ตั้งยืนยันแล้ว(บันทึก)).toBe(false);
  });
  it("ปกติ: นับ → ลบโค้ด → ตั้งสถานะยืนยัน ตามลำดับ", async () => {
    const { admin, บันทึก } = ฐานปลอม();
    expect((await ยืนยันโค้ดอีเมล(admin, { userId: UID, appMeta: {} }, "123456")).ok).toBe(true);
    const i = (s: string) => บันทึก.findIndex(x => x.startsWith(s));
    expect(i("contact_email_codes.update:attempts")).toBeGreaterThan(-1);
    expect(i("contact_email_codes.delete")).toBeGreaterThan(i("contact_email_codes.update:attempts"));
    expect(i("profiles.update:contact_email_verified_at")).toBeGreaterThan(i("contact_email_codes.delete"));
  });
});

describe("ยืนยันอีเมลแทนดีลเลอร์ (HQ)", () => {
  it("ลบโค้ดค้างไม่สำเร็จ → ปฏิเสธ และไม่ตั้งสถานะยืนยัน", async () => {
    const { admin, บันทึก } = ฐานปลอม({ ลบโค้ด: true });
    const ผล = await ยืนยันอีเมลแทนดีลเลอร์(admin, "ZZX");
    expect(ผล.ok).toBe(false);
    expect(ตั้งยืนยันแล้ว(บันทึก)).toBe(false);
  });
});
