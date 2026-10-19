// ── ตัวตัดสิน: บัญชีดีลเลอร์ทุกบัญชีต้องเข้าระบบด้วยโดเมนของบริษัท (บอสสั่ง 19 ต.ค. 69) ─────────────────────
//   ใช้ในชุด prod-live (live-flow.spec.ts) · ข้อทดสอบหน่วย tests/unit/loginDomainCheck.test.ts
//   ยกเว้นบัญชีชั่วคราวของชุด prod-live เอง (สาขา ZZT · live-*@example.test — ล้างทิ้งทุกรอบ)
export const LOGIN_DOMAIN = "dealer.benjaminpebsteel.com";
const บทบาทดีลเลอร์ = new Set(["DEALER_ADMIN", "DEALER_SALES"]);

/** @returns {{ ดีลเลอร์: number, ผิดโดเมน: number, โดเมนที่เจอ: Record<string, number> }} — ไม่คืนอีเมล/รหัสสาขา */
export function ตรวจโดเมนบัญชีดีลเลอร์(users, profiles, รหัสสาขาทดสอบ = "ZZT") {
  const โปรไฟล์ = new Map(profiles.map(p => [p.id, p]));
  const ผล = { ดีลเลอร์: 0, ผิดโดเมน: 0, โดเมนที่เจอ: {} };
  for (const u of users) {
    const p = โปรไฟล์.get(u.id);
    if (!p || !บทบาทดีลเลอร์.has(p.role)) continue;
    const email = String(u.email ?? "").toLowerCase();
    if (p.dealer_code === รหัสสาขาทดสอบ && /^live-[a-z]+-\d+@example\.test$/.test(email)) continue;
    ผล.ดีลเลอร์++;
    if (!email.endsWith(`@${LOGIN_DOMAIN}`)) {
      ผล.ผิดโดเมน++;
      const d = email.split("@")[1] || "(ไม่มีอีเมล)";
      ผล.โดเมนที่เจอ[d] = (ผล.โดเมนที่เจอ[d] ?? 0) + 1;
    }
  }
  return ผล;
}
