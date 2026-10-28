import { describe, it, expect } from "vitest";
import { ชื่อกิจกรรมใบ, วันที่สร้างอ่านง่าย, applyTaskTemplate, LEAD_TASK_TEMPLATE, ยอดใบล่าสุดของลีด, type QuotationMock } from "@pms/shared/lib/mock";

// ── รอบ 2 ช่วง ง (20 ต.ค. 69) — ข้อที่ตรวจแบบตรงตัวได้ดีกว่าผ่านหน้าจอ ─────────────────────────────────
describe("แดชบอร์ดดีลเลอร์ › กิจกรรมล่าสุด: ใบร่างไม่เรียกว่า \"ส่ง\"", () => {
  it("ใบร่าง = สร้างใบเสนอราคา (ร่าง)", () => expect(ชื่อกิจกรรมใบ({ id: "Q-1", status: "draft" })).toBe("สร้างใบเสนอราคา (ร่าง) Q-1"));
  it("ใบที่ส่งแล้ว = ส่งใบเสนอราคา", () => {
    for (const st of ["sent_to_client", "won", "lost", "expired"] as const) expect(ชื่อกิจกรรมใบ({ id: "Q-2", status: st })).toBe("ส่งใบเสนอราคา Q-2");
  });
});

describe("วันที่สร้างลีด: ไม่โชว์ ISO ดิบ", () => {
  it("ISO → วันที่ไทย", () => {
    const v = วันที่สร้างอ่านง่าย("2026-10-20T07:22:29.311752+00:00");
    expect(v).not.toMatch(/^\d{4}-/);
    expect(v).toContain("2569");
  });
  it("ป้ายไทยเดิม = แสดงตามเดิม · ไม่มีค่า = —", () => {
    expect(วันที่สร้างอ่านง่าย("18 มิ.ย. 2569")).toBe("18 มิ.ย. 2569");
    expect(วันที่สร้างอ่านง่าย("")).toBe("—");
    expect(วันที่สร้างอ่านง่าย(undefined)).toBe("—");
  });
});

// งาน "ส่งแม่แบบให้ลูกค้า" (catalog) / "ปิดการขาย" (close) แบบเก่า: ย้ายออกจากฐานหมดแล้ว และฐานไม่รับอีก (ใบ 0250 · 0257
//   ข้อทดสอบ supabase/tests/lead_old_status_retired.sql) — หน้าจอจึงไม่ต้องกรองเอง · ลีดที่ปิดแล้วคงรายการเดิมทุกรายการ
describe("ลีดที่ปิดแล้วคงรายการงานเดิม · ลีดที่เปิดอยู่เดินตามแม่แบบ", () => {
  const งาน = [{ key: "contact", label: "ติดต่อแล้ว", done: true }, { key: "zz_own", label: "งานเฉพาะของลีด", done: true }];
  for (const st of ["PAID", "CANCELLED"] as const) it(st, () => expect(applyTaskTemplate(งาน, LEAD_TASK_TEMPLATE, st)).toEqual(งาน));
  it("WAITING", () => expect(applyTaskTemplate(งาน, LEAD_TASK_TEMPLATE, "WAITING").map(t => t.key)).toEqual(LEAD_TASK_TEMPLATE.map(t => t.key)));
});

describe("มูลค่าลีดฝั่งหน้าจอ (ตรงกับฐาน ใบ 0223): ใบที่ส่งแล้วล่าสุด · ไม่นับใบร่าง", () => {
  const ใบ = (id: string, status: QuotationMock["status"], totalValue: number, savedAt: string) =>
    ({ id, status, totalValue, savedAt, dealId: 7, dealerCode: "RYG" }) as unknown as QuotationMock;
  it("ส่งแล้ว + ใบร่างใหม่กว่า = ยอดใบที่ส่งแล้ว", () => {
    expect(ยอดใบล่าสุดของลีด({ numId: 7, dealerCode: "RYG" }, [ใบ("A", "sent_to_client", 500, "2026-10-01T00:00:00Z"), ใบ("B", "draft", 900, "2026-10-02T00:00:00Z")])).toBe(500);
  });
  it("มีแต่ใบร่าง = ไม่มีมูลค่า", () => {
    expect(ยอดใบล่าสุดของลีด({ numId: 7, dealerCode: "RYG" }, [ใบ("B", "draft", 900, "2026-10-02T00:00:00Z")])).toBeUndefined();
  });
});
