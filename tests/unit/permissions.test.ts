import { describe, it, expect } from "vitest";
import { hasPermission, ROLE_PERMISSIONS, type Permission } from "../../packages/shared/lib/permissions";
import type { UserRole } from "../../packages/shared/lib/mock";

// สิทธิ์ต้อง "ตรงกับ RLS ที่ DB" — เทสต์นี้ล็อกกติกาธุรกิจหลักไว้ (Benjamin):
//   ดีลเลอร์ = เจ้าของงานขาย · HQ = ดูทั้งเครือ "แต่แก้งานขายไม่ได้" (บั๊ก C1/C3 ที่เคยเปิดปุ่มให้กดแล้ว DB ปฏิเสธ)

const HQ_ROLES: UserRole[] = ["SUPER_ADMIN", "HQ_MANAGEMENT", "HQ_STAFF"];
const SALES_WRITE: Permission[] = [
  "leads:create", "leads:update", "leads:delete",
  "customers:create", "customers:update", "customers:delete",
  "quotations:create", "quotations:update", "quotations:delete",
];

describe("hasPermission — พื้นฐาน", () => {
  it("ดีลเลอร์ (DEALER_ADMIN) สร้างลูกค้าเป้าหมายได้", () => {
    expect(hasPermission("DEALER_ADMIN", "leads:create")).toBe(true);
  });
  it("บทบาทที่ไม่รู้จัก → false (ไม่ throw)", () => {
    expect(hasPermission("NOPE" as UserRole, "leads:read")).toBe(false);
  });
  it("DEALER_SITE อ่านได้อย่างเดียว (ไม่มีสิทธิ์เขียน)", () => {
    expect(hasPermission("DEALER_SITE", "leads:read")).toBe(true);
    expect(hasPermission("DEALER_SITE", "leads:update")).toBe(false);
  });
});

describe("กติกาหลัก: HQ ทุกบทบาท 'แก้งานขายไม่ได้' (ตรงกับ RLS)", () => {
  for (const role of HQ_ROLES) {
    for (const perm of SALES_WRITE) {
      it(`${role} ไม่มีสิทธิ์ ${perm}`, () => {
        expect(hasPermission(role, perm)).toBe(false);
      });
    }
    it(`${role} อ่านงานขายทั้งเครือได้ (leads:read)`, () => {
      expect(hasPermission(role, "leads:read")).toBe(true);
    });
  }
});

// HQ บทบาทเดียว (ใบ 0282): HQ_MANAGEMENT / HQ_STAFF ตั้งให้ผู้ใช้ไม่ได้แล้ว — ข้อตรวจ 2 บทบาทนี้ลบ 25 พ.ย. 69
describe("สิทธิ์ข้อมูลกลาง (can_write_master) = สำนักงานใหญ่ (SUPER_ADMIN)", () => {
  it("SUPER_ADMIN แก้ค่าตั้งเครือ/จัดการดีลเลอร์ได้", () => {
    expect(hasPermission("SUPER_ADMIN", "settings:edit")).toBe(true);
    expect(hasPermission("SUPER_ADMIN", "dealers:manage")).toBe(true);
    expect(hasPermission("SUPER_ADMIN", "hq:all_data")).toBe(true);
  });
  it("ดีลเลอร์จัดการดีลเลอร์/ข้อมูลกลางไม่ได้", () => {
    expect(hasPermission("DEALER_ADMIN", "dealers:manage")).toBe(false);
    expect(hasPermission("DEALER_ADMIN", "settings:edit")).toBe(false);
  });
});

describe("ROLE_PERMISSIONS — ไม่มีสิทธิ์ซ้ำในบทบาทเดียว", () => {
  for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
    it(`${role} ไม่มี permission ซ้ำ`, () => {
      expect(new Set(perms).size).toBe(perms.length);
    });
  }
});
