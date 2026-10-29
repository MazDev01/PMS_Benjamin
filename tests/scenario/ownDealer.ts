// ── สาขาทดสอบของข้อ (บอสสั่ง 29 ต.ค. 69 · คิวรอบหน้าข้อ 3) ───────────────────────────────────────────────────────
// ข้อที่ต้องนับ/ตรวจตัวเลขแบบตรงเป๊ะ ห้ามนับจากสาขาตั้งต้นร่วม (RYG CNX …) หรือยอดทั้งเครือ — ข้ออื่นที่รันพร้อมกันเขียนอยู่
//   ใช้สาขาของข้อเองแทน: สร้างสาขา + บัญชีเข้าระบบ รหัสสุ่มไม่ซ้ำ → ยอดของสาขานี้รู้ค่าแน่นอน (หน้า HQ กรองด้วยสาขานี้)
//   ตัวตรวจ scripts/check-shared-baseline-asserts.mjs ตกถ้าข้อใหม่นับตรงเป๊ะจากข้อมูลร่วมโดยไม่สร้างข้อมูลของตัวเอง
// ใช้:
//   const สาขา = await สร้างสาขาของข้อ({ จังหวัด: "ตราด" });
//   try { … สาขา.รหัส · สาขา.บัญชี (เข้าระบบดีลเลอร์ได้) … } finally { await สาขา.ลบ(); }
import { adminClient, ลบสาขาทดสอบตรง } from "./testDealers";
import type { Account } from "./supabaseEnv";

export type สาขาของข้อ = { รหัส: string; บัญชี: Account; ลบ: () => Promise<void> };

const ตัวอักษร = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
// ZT + 3 ตัวสุ่ม (ตรงกฎรหัสสาขาทดสอบ ^Z[ZT][A-Z]{1,3}$ · ตัวกวาดตอนจบชุดเก็บให้ถ้าค้าง) — ชนรหัสที่มีอยู่ = สุ่มใหม่
const สุ่มรหัส = () => "ZT" + Array.from({ length: 3 }, () => ตัวอักษร[Math.floor(Math.random() * 26)]).join("");

export async function สร้างสาขาของข้อ(ตั้ง: { จังหวัด?: string; ภาค?: string; เป้า?: number; ชื่อ?: string } = {}): Promise<สาขาของข้อ> {
  const admin = adminClient();
  const จังหวัด = ตั้ง.จังหวัด ?? "ตราด", ภาค = ตั้ง.ภาค ?? "ตะวันออก";
  for (let ครั้ง = 0; ครั้ง < 20; ครั้ง++) {
    const รหัส = สุ่มรหัส();
    const ใส่ = await admin.from("dealers").insert({ code: รหัส, name: ตั้ง.ชื่อ ?? `ZZTEST ${รหัส}`, province: จังหวัด, region: ภาค,
      revenue_target: ตั้ง.เป้า ?? 0, status: "active" });
    if (ใส่.error?.code === "23505") continue;   // รหัสชนกับสาขาที่มีอยู่ → สุ่มใหม่
    if (ใส่.error) throw new Error(`สร้างสาขาของข้อไม่สำเร็จ: ${ใส่.error.message}`);
    const บัญชี: Account = { email: `${รหัส.toLowerCase()}@dealer.benjaminpebsteel.com`, password: `Own-${รหัส}-${Date.now() % 100000}` };
    const ลบ = async () => { const พลาด = await ลบสาขาทดสอบตรง(รหัส, admin); if (พลาด.length) throw new Error(`ลบสาขาของข้อ ${รหัส} ไม่ครบ: ${พลาด.join(" · ")}`); };
    try {
      const { data, error } = await admin.auth.admin.createUser({ email: บัญชี.email, password: บัญชี.password, email_confirm: true });
      if (error || !data.user) throw new Error(error?.message ?? "ไม่มีผู้ใช้คืนมา");
      const p = await admin.from("profiles").upsert({ id: data.user.id, role: "DEALER_ADMIN", dealer_code: รหัส, name: `ZZTEST ${รหัส}`,
        status: "active", contact_email_verified_at: new Date().toISOString() }, { onConflict: "id" });
      if (p.error) throw new Error(p.error.message);
    } catch (e) { await ลบ().catch(() => {}); throw new Error(`สร้างบัญชีของสาขา ${รหัส} ไม่สำเร็จ: ${(e as Error).message}`); }
    return { รหัส, บัญชี, ลบ };
  }
  throw new Error("สุ่มรหัสสาขาของข้อไม่ได้ใน 20 ครั้ง");
}

// หน้า HQ: กรองด้วยสาขาของข้อ (ตัวกรองดีลเลอร์บนแถบตัวกรอง) — ยอดบนจอจึงเป็นของสาขานี้อย่างเดียว ไม่ปนข้ออื่นที่รันพร้อมกัน
export async function กรองหน้าHQด้วยสาขา(page: import("@playwright/test").Page, รหัส: string) {
  const { expect } = await import("@playwright/test");
  await page.getByRole("button", { name: /ทุกดีลเลอร์ \(ทั้งเครือ\)/ }).first().click();
  await page.getByRole("button", { name: new RegExp(`^${รหัส} – `) }).click();
  await expect(page.getByRole("button", { name: new RegExp(`^${รหัส} – `) }).first()).toBeVisible();
}
