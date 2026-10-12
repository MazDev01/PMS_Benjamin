import { describe, it, expect, beforeEach } from "vitest";

// กติกาบัญชีดีลเลอร์ (โหมดเดโม): แก้เอง 2 ครั้ง · ครั้งที่ 3 เป็นคำขอที่ต้องรออนุมัติ
// ทดสอบตรรกะจริงของ accountLocal — ไม่ mock กติกา ไม่งั้นเทสต์ผ่านทั้งที่ของจริงพัง

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

// ต้องตั้ง window/localStorage ก่อน import โมดูล (โมดูลอ่าน localStorage ตอนเรียกฟังก์ชัน)
const store = new MemStorage();
(globalThis as unknown as { window: unknown }).window = {
  dispatchEvent: () => true,
  addEventListener: () => {},
} as unknown as Window;
(globalThis as unknown as { localStorage: MemStorage }).localStorage = store;

const { accountLocal, SELF_CHANGE_LIMIT, localDealerPassword, localDealerEmail } =
  await import("../../packages/shared/lib/data/local/accountLocal");

const CODE = "TST";
const เดิม = "benjamin";   // รหัสกลางของชุดตัวอย่าง — ต้องตรงกับหน้าเข้าสู่ระบบ (auth.ts)

describe("บัญชีดีลเลอร์แก้เอง", () => {
  beforeEach(() => store.clear());

  it("รหัสผ่านปัจจุบันผิด = เปลี่ยนไม่ได้", async () => {
    await expect(accountLocal.change({ dealerCode: CODE, currentPassword: "ผิด", password: "newpass123" }))
      .rejects.toThrow(/รหัสผ่านปัจจุบัน/);
  });

  it("รหัสใหม่สั้นเกินไป = ไม่ผ่าน", async () => {
    await expect(accountLocal.change({ dealerCode: CODE, currentPassword: เดิม, password: "1234" }))
      .rejects.toThrow(/8 ตัวอักษร/);
  });

  it(`แก้เองได้ ${SELF_CHANGE_LIMIT} ครั้ง แล้วครั้งถัดไปกลายเป็นคำขอ`, async () => {
    const ครั้งที่1 = await accountLocal.change({ dealerCode: CODE, currentPassword: เดิม, password: "passone123" });
    expect(ครั้งที่1.applied).toBe(true);
    expect(localDealerPassword(CODE)).toBe("passone123");

    const ครั้งที่2 = await accountLocal.change({ dealerCode: CODE, currentPassword: "passone123", email: "a@b.co" });
    expect(ครั้งที่2.applied).toBe(true);
    expect(localDealerEmail(CODE, "เดิม@x.co")).toBe("a@b.co");

    const ครั้งที่3 = await accountLocal.change({ dealerCode: CODE, currentPassword: "passone123", password: "passthree123" });
    expect(ครั้งที่3.applied, "ครั้งที่ 3 ต้องยังไม่มีผล").toBe(false);
    expect(ครั้งที่3.pending).toBe(true);
    expect(localDealerPassword(CODE), "ยังต้องเป็นรหัสเดิมจนกว่าจะอนุมัติ").toBe("passone123");

    const state = await accountLocal.state(CODE);
    expect(state.selfChangesUsed).toBe(SELF_CHANGE_LIMIT);
    expect(state.pending?.status).toBe("pending");
  });

  it("มีคำขอค้างแล้ว ส่งซ้ำไม่ได้", async () => {
    await accountLocal.change({ dealerCode: CODE, currentPassword: เดิม, password: "passone123" });
    await accountLocal.change({ dealerCode: CODE, currentPassword: "passone123", password: "passtwo123" });
    await accountLocal.change({ dealerCode: CODE, currentPassword: "passtwo123", password: "passthree123" });
    await expect(accountLocal.change({ dealerCode: CODE, currentPassword: "passtwo123", password: "passfour123" }))
      .rejects.toThrow(/รอสำนักงานใหญ่อนุมัติ/);
  });

  it("HQ อนุมัติ = มีผลทันที · ปฏิเสธ = ไม่แตะบัญชี", async () => {
    await accountLocal.change({ dealerCode: CODE, currentPassword: เดิม, password: "passone123" });
    await accountLocal.change({ dealerCode: CODE, currentPassword: "passone123", password: "passtwo123" });
    await accountLocal.change({ dealerCode: CODE, currentPassword: "passtwo123", password: "passthree123" });

    const [คำขอ] = await accountLocal.listRequests();
    await accountLocal.decide(คำขอ.id, "approve");
    expect(localDealerPassword(CODE)).toBe("passthree123");
    expect((await accountLocal.state(CODE)).pending).toBeNull();
    // อนุมัติแล้วไม่กินโควตาแก้เอง (ยังเป็น 2 เท่าเดิม)
    expect((await accountLocal.state(CODE)).selfChangesUsed).toBe(SELF_CHANGE_LIMIT);

    // ปฏิเสธคำขอถัดไป — รหัสต้องไม่เปลี่ยน
    await accountLocal.change({ dealerCode: CODE, currentPassword: "passthree123", password: "passfive123" });
    const [ใหม่] = await accountLocal.listRequests();
    await accountLocal.decide(ใหม่.id, "reject", "ยังไม่อนุญาต");
    expect(localDealerPassword(CODE)).toBe("passthree123");
    expect((await accountLocal.listRequests()).find(r => r.id === ใหม่.id)?.status).toBe("rejected");
  });
});
