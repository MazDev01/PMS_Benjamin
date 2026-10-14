import { describe, it, expect } from "vitest";
import { ส่งอีเมลค้างส่ง, ค่าSMTPจากตัวแปร, type ตัวส่ง, type คลังกล่องขาออก, type จดหมาย } from "../../packages/shared/server/mail/outbox";

// ── ตัวส่งอีเมลจากกล่องขาออก (ด่าน 1 · FLOW.html ตารางสถานะ คอลัมน์ "อีเมล") ─────────────────────
// คลังปลอมในหน่วยความจำ: จำลองการ "จอง" จดหมาย (กันสองเครื่องส่งซ้ำ) และการบันทึกผลแบบเดียวกับฐานจริง

function คลังปลอม(รายการ: จดหมาย[]) {
  const ตาราง = new Map(รายการ.map(m => [m.id, { ...m, status: "pending", attempts: 0, last_error: "", sent_at: null as string | null, next_attempt_at: 0 }]));
  let สแกน = 0;
  const คลัง: คลังกล่องขาออก = {
    async สแกนเกินกำหนด() { สแกน++; return 0; },
    async จองที่ถึงเวลา(จำนวน) {
      const ได้ = [...ตาราง.values()].filter(m => m.status === "pending" && m.next_attempt_at <= Date.now()).slice(0, จำนวน);
      for (const m of ได้) { m.attempts++; m.next_attempt_at = Date.now() + 60_000; }
      return ได้.map(m => ({ id: m.id, to_email: m.to_email, subject: m.subject, body: m.body, attempts: m.attempts }));
    },
    async บันทึกส่งแล้ว(id) { const m = ตาราง.get(id)!; m.status = "sent"; m.sent_at = "now"; },
    async บันทึกส่งไม่สำเร็จ(id, ข้อผิดพลาด, ล้มถาวร) { const m = ตาราง.get(id)!; m.last_error = ข้อผิดพลาด; if (ล้มถาวร) m.status = "failed"; },
  };
  return { คลัง, ตาราง, สแกน: () => สแกน };
}
const จม = (id: number): จดหมาย => ({ id, to_email: `hq${id}@example.test`, subject: `เรื่อง ${id}`, body: "เนื้อความ", attempts: 0 });

describe("ส่งอีเมลค้างส่ง", () => {
  it("ส่งสำเร็จ → บันทึกว่าส่งแล้ว · ตรวจคำขอเกินกำหนดก่อนส่งทุกรอบ", async () => {
    const { คลัง, ตาราง, สแกน } = คลังปลอม([จม(1), จม(2)]);
    const ส่งไป: string[] = [];
    const ตส: ตัวส่ง = { from: "pms@example.test", async ส่ง(m) { ส่งไป.push(m.to); } };
    const ผล = await ส่งอีเมลค้างส่ง(คลัง, ตส);
    expect(ผล).toEqual({ ส่งแล้ว: 2, ไม่สำเร็จ: 0, ข้าม: "" });
    expect(ส่งไป).toEqual(["hq1@example.test", "hq2@example.test"]);
    expect([...ตาราง.values()].every(m => m.status === "sent")).toBe(true);
    expect(สแกน()).toBe(1);
  });

  it("SMTP ล้ม → จดหมายยังรอส่ง พร้อมข้อผิดพลาด · ไม่โยนข้อผิดพลาดออกไปทำให้งานอื่นล้ม", async () => {
    const { คลัง, ตาราง } = คลังปลอม([จม(1)]);
    const ตส: ตัวส่ง = { from: "pms@example.test", async ส่ง() { throw new Error("connect ECONNREFUSED 127.0.0.1:2525"); } };
    const ผล = await ส่งอีเมลค้างส่ง(คลัง, ตส);
    expect(ผล.ส่งแล้ว).toBe(0);
    expect(ผล.ไม่สำเร็จ).toBe(1);
    const m = ตาราง.get(1)!;
    expect(m.status).toBe("pending");
    expect(m.last_error).toContain("ECONNREFUSED");
  });

  it("ล้มครบ 5 ครั้ง → เลิกพยายาม (failed) ไม่วนส่งไปตลอดกาล", async () => {
    const { คลัง, ตาราง } = คลังปลอม([จม(1)]);
    ตาราง.get(1)!.attempts = 4;
    const ตส: ตัวส่ง = { from: "pms@example.test", async ส่ง() { throw new Error("550 mailbox unavailable"); } };
    await ส่งอีเมลค้างส่ง(คลัง, ตส);
    expect(ตาราง.get(1)!.status).toBe("failed");
  });

  it("ยังไม่ได้ตั้งค่า SMTP → ไม่แตะจดหมาย (ยังรอส่งครบ) และบอกเหตุผลที่ข้าม", async () => {
    const { คลัง, ตาราง } = คลังปลอม([จม(1)]);
    const ผล = await ส่งอีเมลค้างส่ง(คลัง, null);
    expect(ผล.ข้าม).toContain("SMTP");
    expect(ตาราง.get(1)!.attempts).toBe(0);
  });
});

describe("ค่าSMTPจากตัวแปร", () => {
  it("ขาดที่อยู่เซิร์ฟเวอร์หรือผู้ส่ง = ยังไม่ได้ตั้งค่า", () => {
    expect(ค่าSMTPจากตัวแปร({})).toBeNull();
    expect(ค่าSMTPจากตัวแปร({ SMTP_HOST: "smtp.example.test" })).toBeNull();
  });
  it("ตั้งครบ → พอร์ตเป็นตัวเลข · 465 = เข้ารหัสตั้งแต่ต้น", () => {
    expect(ค่าSMTPจากตัวแปร({ SMTP_HOST: "smtp.example.test", SMTP_PORT: "465", SMTP_FROM: "pms@example.test" }))
      .toMatchObject({ host: "smtp.example.test", port: 465, secure: true, from: "pms@example.test" });
    expect(ค่าSMTPจากตัวแปร({ SMTP_HOST: "h", SMTP_FROM: "f@example.test" })).toMatchObject({ port: 587, secure: false });
  });
});
