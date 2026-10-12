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

describe("สิทธิ์ข้อมูลกลาง (can_write_master) = เฉพาะ SUPER_ADMIN / HQ_MANAGEMENT", () => {
  it("SUPER_ADMIN + HQ_MANAGEMENT แก้แคตตาล็อก/จัดการดีลเลอร์ได้", () => {
    for (const role of ["SUPER_ADMIN", "HQ_MANAGEMENT"] as UserRole[]) {
      expect(hasPermission(role, "catalog:edit")).toBe(true);
      expect(hasPermission(role, "dealers:manage")).toBe(true);
      expect(hasPermission(role, "hq:all_data")).toBe(true);
    }
  });
  it("HQ_STAFF ดูได้แต่แก้ข้อมูลกลางไม่ได้", () => {
    expect(hasPermission("HQ_STAFF", "reports:view")).toBe(true);
    expect(hasPermission("HQ_STAFF", "catalog:edit")).toBe(false);
    expect(hasPermission("HQ_STAFF", "dealers:manage")).toBe(false);
    expect(hasPermission("HQ_STAFF", "hq:all_data")).toBe(false);
  });
  it("ดีลเลอร์จัดการดีลเลอร์/ข้อมูลกลางไม่ได้", () => {
    expect(hasPermission("DEALER_ADMIN", "dealers:manage")).toBe(false);
    expect(hasPermission("DEALER_ADMIN", "catalog:edit")).toBe(false);
  });
});

describe("ROLE_PERMISSIONS — ไม่มีสิทธิ์ซ้ำในบทบาทเดียว", () => {
  for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
    it(`${role} ไม่มี permission ซ้ำ`, () => {
      expect(new Set(perms).size).toBe(perms.length);
    });
  }
});
