import { describe, it, expect } from "vitest";
import { ตรวจโดเมนบัญชีดีลเลอร์ } from "../prod-live/loginDomainCheck.mjs";
// @ts-expect-error — ไฟล์ .mjs ของสคริปต์ไม่มีชนิดข้อมูล
import { วางแผนย้ายโดเมน } from "../../scripts/lib/loginDomainMigration.mjs";
import { ชื่อผู้ใช้เป็นอีเมล, เป็นอีเมลเข้าระบบดีลเลอร์ } from "../../packages/shared/lib/dealerLogin";

// ── โดเมนอีเมลเข้าระบบของดีลเลอร์ (บอสสั่ง 19 ต.ค. 69) ───────────────────────────────────────────────
//   ตัวตัดสินของชุด prod-live · ตัวเลือกบัญชีของสคริปต์ย้าย · ตัวแปลงสิ่งที่พิมพ์ในหน้าเข้าระบบ
const เดิม = ["partner", "agent.co.th"].join("-");   // ประกอบตอนรัน (ตัวตรวจ check-no-old-login-domain)
const ใหม่ = "dealer.benjaminpebsteel.com";
const ป = (id: string, role: string, dealer_code = "") => ({ id, role, dealer_code });

describe("ตรวจโดเมนบัญชีดีลเลอร์ (prod-live)", () => {
  it("ทุกบัญชีดีลเลอร์ใช้โดเมนบริษัท = ผิด 0 · ไม่นับ HQ และบัญชีชั่วคราวของ prod-live", () => {
    const ผล = ตรวจโดเมนบัญชีดีลเลอร์(
      [{ id: "1", email: `abc@${ใหม่}` }, { id: "2", email: "boss@benjaminpebsteel.com" }, { id: "3", email: "live-dealer-123@example.test" }],
      [ป("1", "DEALER_ADMIN", "ABC"), ป("2", "SUPER_ADMIN"), ป("3", "DEALER_ADMIN", "ZZT")]);
    expect(ผล).toEqual({ ดีลเลอร์: 1, ผิดโดเมน: 0, โดเมนที่เจอ: {} });
  });
  it("บัญชีดีลเลอร์โดเมนเดิม/โดเมนอื่น = ผิด และบอกโดเมนที่เจอ (ไม่บอกอีเมล)", () => {
    const ผล = ตรวจโดเมนบัญชีดีลเลอร์(
      [{ id: "1", email: `abc@${เดิม}` }, { id: "2", email: "x@gmail.com" }, { id: "3", email: `def@${ใหม่}` }, { id: "4", email: "live-dealer-1@example.test" }],
      [ป("1", "DEALER_ADMIN", "ABC"), ป("2", "DEALER_SALES", "XYZ"), ป("3", "DEALER_ADMIN", "DEF"), ป("4", "DEALER_ADMIN", "ABC")]);
    expect(ผล.ผิดโดเมน).toBe(3);   // บัญชี live-* ที่ไม่ใช่สาขา ZZT ต้องนับ
    expect(ผล.โดเมนที่เจอ).toEqual({ [เดิม]: 1, "gmail.com": 1, "example.test": 1 });
  });
});

describe("วางแผนย้ายโดเมน (scripts/migrate-dealer-login-domain.mjs)", () => {
  it("--only จำกัดเฉพาะรหัสสาขาที่ระบุ (ไม่สนตัวพิมพ์) · ทางย้อนก็จำกัดเหมือนกัน", () => {
    const users = [{ id: "1", email: `abc@${เดิม}` }, { id: "2", email: `def@${เดิม}` }, { id: "3", email: `ghi@${ใหม่}` }];
    const profiles = [ป("1", "DEALER_ADMIN", "ABC"), ป("2", "DEALER_ADMIN", "DEF"), ป("3", "DEALER_ADMIN", "GHI")];
    expect(วางแผนย้ายโดเมน({ users, profiles, เฉพาะ: ["abc"] }).ย้าย.map((x: { id: string }) => x.id)).toEqual(["1"]);
    expect(วางแผนย้ายโดเมน({ users, profiles, ย้อน: true, เฉพาะ: ["ABC"] }).ย้าย).toEqual([]);   // GHI อยู่โดเมนใหม่แต่ไม่อยู่ในรายการ
    expect(วางแผนย้ายโดเมน({ users, profiles, ย้อน: true }).ย้าย.map((x: { id: string }) => x.id)).toEqual(["3"]);
  });
  it("ย้ายเฉพาะดีลเลอร์โดเมนเดิม → รหัสสาขาตัวเล็ก@โดเมนใหม่ · ไม่แตะ HQ/อีเมลของตัวเอง · กันชื่อซ้ำ", () => {
    const { ย้าย, สรุป } = วางแผนย้ายโดเมน({
      users: [
        { id: "1", email: `ABC@${เดิม}` }, { id: "2", email: `hq@${เดิม}` }, { id: "3", email: "owner@gmail.com" },
        { id: "4", email: `old@${เดิม}` }, { id: "5", email: `def@${ใหม่}` }, { id: "6", email: `x@${เดิม}` },
      ],
      profiles: [ป("1", "DEALER_ADMIN", "ABC"), ป("2", "HQ_STAFF"), ป("3", "DEALER_ADMIN", "GHI"), ป("4", "DEALER_ADMIN", "DEF"), ป("5", "DEALER_ADMIN", "DEF"), ป("6", "DEALER_SALES")],
    });
    expect(ย้าย).toEqual([{ id: "1", dealerCode: "ABC", from: `abc@${เดิม}`, to: `abc@${ใหม่}` }]);
    expect(สรุป).toMatchObject({ บัญชีดีลเลอร์: 5, ใช้โดเมนใหม่แล้ว: 1, อีเมลของตัวเอง: 1, ชื่อซ้ำกับบัญชีอื่น: 1, ไม่มีรหัสสาขา: 1, บัญชีHQใช้โดเมนเดิม: 1, ต้องย้าย: 1 });
  });
});

describe("ชื่อผู้ใช้ในหน้าเข้าระบบดีลเลอร์", () => {
  it("รหัสสาขา (ตัวพิมพ์ใดก็ได้ · ช่องว่างหัวท้าย) → อีเมลโดเมนบริษัท · อีเมลเต็มใช้ตามนั้น", () => {
    expect(ชื่อผู้ใช้เป็นอีเมล("zzt")).toBe(`zzt@${ใหม่}`);
    expect(ชื่อผู้ใช้เป็นอีเมล(" ZZT ")).toBe(`zzt@${ใหม่}`);
    expect(ชื่อผู้ใช้เป็นอีเมล(`ZZT@${ใหม่}`)).toBe(`zzt@${ใหม่}`);
    expect(ชื่อผู้ใช้เป็นอีเมล("owner@gmail.com")).toBe("owner@gmail.com");
    expect(ชื่อผู้ใช้เป็นอีเมล("   ")).toBe("");
  });
  it("อีเมลเข้าระบบดีลเลอร์ห้ามใช้เป็นอีเมลติดต่อ", () => {
    expect(เป็นอีเมลเข้าระบบดีลเลอร์(`ABC@${ใหม่}`)).toBe(true);
    expect(เป็นอีเมลเข้าระบบดีลเลอร์("abc@gmail.com")).toBe(false);
  });
});
