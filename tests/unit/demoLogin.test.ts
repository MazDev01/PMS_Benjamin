import { describe, it, expect, beforeEach } from "vitest";

// โหมดข้อมูลตัวอย่าง: รหัส/อีเมลที่ดีลเลอร์เปลี่ยนที่หน้าบัญชี ต้องมีผลกับหน้าเข้าสู่ระบบ (แก้ 15 ก.ย. 69)
//   เดิมหน้าบัญชีเก็บรหัสใหม่ไว้ แต่หน้าเข้าสู่ระบบไม่อ่าน → รหัสใหม่เข้าไม่ได้ รหัสเดิมยังเข้าได้
//   และหน้าบัญชียืนยันรหัสปัจจุบันด้วย "demo1234" ขณะที่หน้าเข้าสู่ระบบใช้ "benjamin"

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
}
const store = new MemStorage();
(globalThis as unknown as { window: unknown }).window = { dispatchEvent: () => true, addEventListener: () => {} } as unknown as Window;
(globalThis as unknown as { localStorage: MemStorage }).localStorage = store;

const { authenticate, DEMO_PASSWORD, DEMO_LOGINS } = await import("../../packages/shared/lib/auth");
const { accountLocal } = await import("../../packages/shared/lib/data/local/accountLocal");

const ดีลเลอร์ในตัว = DEMO_LOGINS.find(d => !d.scopeAll)!;

describe("เข้าระบบโหมดตัวอย่าง ใช้อีเมล/รหัสปัจจุบันของดีลเลอร์", () => {
  beforeEach(() => store.clear());

  it("ยังไม่เคยเปลี่ยน = รหัสกลางเข้าได้ · หน้าบัญชียืนยันด้วยรหัสเดียวกันได้", async () => {
    const r = authenticate(ดีลเลอร์ในตัว.email, DEMO_PASSWORD);
    expect(r.ok).toBe(true);
    const code = r.ok ? r.session.dealerCode : "";
    const ผล = await accountLocal.change({ dealerCode: code, currentPassword: DEMO_PASSWORD, password: "ZZdemo-New-2569" });
    expect(ผล.applied, "รหัสที่ใช้เข้าระบบต้องใช้ยืนยันที่หน้าบัญชีได้").toBe(true);
  });

  it("เปลี่ยนรหัสแล้ว: รหัสใหม่เข้าได้ · รหัสเดิมเข้าไม่ได้", async () => {
    const r = authenticate(ดีลเลอร์ในตัว.email, DEMO_PASSWORD);
    const code = r.ok ? r.session.dealerCode : "";
    await accountLocal.change({ dealerCode: code, currentPassword: DEMO_PASSWORD, password: "ZZdemo-New-2569" });
    expect(authenticate(ดีลเลอร์ในตัว.email, "ZZdemo-New-2569").ok, "รหัสใหม่ต้องเข้าได้").toBe(true);
    expect(authenticate(ดีลเลอร์ในตัว.email, DEMO_PASSWORD).ok, "รหัสเดิมต้องเข้าไม่ได้แล้ว").toBe(false);
  });

  it("เปลี่ยนอีเมลแล้ว: อีเมลใหม่เข้าได้ · อีเมลเดิมเข้าไม่ได้", async () => {
    const r = authenticate(ดีลเลอร์ในตัว.email, DEMO_PASSWORD);
    const code = r.ok ? r.session.dealerCode : "";
    await accountLocal.change({ dealerCode: code, currentPassword: DEMO_PASSWORD, email: "zzdemo-new@example.co.th" });
    const ใหม่ = authenticate("zzdemo-new@example.co.th", DEMO_PASSWORD);
    expect(ใหม่.ok, "อีเมลใหม่ต้องเข้าได้").toBe(true);
    expect(ใหม่.ok && ใหม่.session.dealerCode).toBe(code);
    expect(authenticate(ดีลเลอร์ในตัว.email, DEMO_PASSWORD).ok, "อีเมลเดิมต้องเข้าไม่ได้แล้ว").toBe(false);
  });

  it("ผู้ดูแลสำนักงานใหญ่ในตัวไม่ได้รับผลกระทบ", () => {
    const hq = DEMO_LOGINS.find(d => d.scopeAll)!;
    expect(authenticate(hq.email, DEMO_PASSWORD).ok).toBe(true);
    expect(authenticate(hq.email, "ผิด").ok).toBe(false);
  });
});
