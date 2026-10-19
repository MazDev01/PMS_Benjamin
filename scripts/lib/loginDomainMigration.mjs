// ── ตัวเลือกบัญชีที่ต้องย้ายอีเมลเข้าระบบไปโดเมนของบริษัท (บอสสั่ง 19 ต.ค. 69) ─────────────────────────
//   ใช้กับ scripts/migrate-dealer-login-domain.mjs · ข้อทดสอบ tests/unit/loginDomainCheck.test.ts · tests/scenario/login-domain-migration.spec.ts
//   ⚠️ ไฟล์นี้กับตัวย้ายเป็นที่เดียวที่ยอมให้มีชื่อโดเมนเดิม (ตัวตรวจ scripts/check-no-old-login-domain.mjs ยกเว้นไว้)

export const OLD_DOMAIN = "partner-agent.co.th";
export const NEW_DOMAIN = "dealer.benjaminpebsteel.com";
const บทบาทดีลเลอร์ = new Set(["DEALER_ADMIN", "DEALER_SALES"]);

/**
 * @param {{ users: {id:string, email?:string|null}[], profiles: {id:string, role:string, dealer_code?:string|null}[], ย้อน?: boolean }} x
 *   ย้อน = ย้ายกลับ (โดเมนใหม่ → โดเมนเดิม) — ทางถอยถ้าย้ายแล้วมีปัญหา · ชื่อช่องในสรุปคงเดิม ("ใหม่" = ปลายทาง · "เดิม" = ต้นทาง)
 *   เฉพาะ = จำกัดเฉพาะรหัสสาขาเหล่านี้ (--only) · ว่าง = ทุกสาขา
 * @returns {{ ย้าย: {id:string, dealerCode:string, from:string, to:string}[], สรุป: Record<string, number> }}
 */
export function วางแผนย้ายโดเมน({ users, profiles, ย้อน = false, เฉพาะ = [] }) {
  const จำกัด = เฉพาะ.length ? new Set(เฉพาะ.map(c => String(c).trim().toUpperCase())) : null;
  const [ต้นทาง, ปลายทาง] = ย้อน ? [NEW_DOMAIN, OLD_DOMAIN] : [OLD_DOMAIN, NEW_DOMAIN];
  const โปรไฟล์ = new Map(profiles.map(p => [p.id, p]));
  const อีเมลที่มีอยู่ = new Set(users.map(u => String(u.email ?? "").toLowerCase()).filter(Boolean));
  const สรุป = { บัญชีดีลเลอร์: 0, ใช้โดเมนใหม่แล้ว: 0, อีเมลของตัวเอง: 0, ไม่มีรหัสสาขา: 0, ชื่อซ้ำกับบัญชีอื่น: 0, บัญชีHQใช้โดเมนเดิม: 0, ต้องย้าย: 0 };
  const ย้าย = [];
  const ที่จะใช้ = new Set();
  for (const u of users) {
    const email = String(u.email ?? "").toLowerCase();
    const p = โปรไฟล์.get(u.id);
    const โดเมนเดิม = email.endsWith(`@${ต้นทาง}`);
    if (!p || !บทบาทดีลเลอร์.has(p.role)) {
      // ห้ามแตะบัญชี HQ / บัญชีที่ไม่มีโปรไฟล์ — นับไว้รายงานอย่างเดียว
      if (โดเมนเดิม) สรุป.บัญชีHQใช้โดเมนเดิม++;
      continue;
    }
    if (จำกัด && !จำกัด.has(String(p.dealer_code ?? "").trim().toUpperCase())) continue;
    สรุป.บัญชีดีลเลอร์++;
    if (email.endsWith(`@${ปลายทาง}`)) { สรุป.ใช้โดเมนใหม่แล้ว++; continue; }
    if (!โดเมนเดิม) { สรุป.อีเมลของตัวเอง++; continue; }   // ดีลเลอร์ย้ายไปอีเมลจริงของตัวเองแล้ว — ไม่แตะ
    const code = String(p.dealer_code ?? "").trim().toLowerCase();
    if (!code) { สรุป.ไม่มีรหัสสาขา++; continue; }
    const to = `${code}@${ปลายทาง}`;
    if (อีเมลที่มีอยู่.has(to) || ที่จะใช้.has(to)) { สรุป.ชื่อซ้ำกับบัญชีอื่น++; continue; }
    ที่จะใช้.add(to);
    ย้าย.push({ id: u.id, dealerCode: code.toUpperCase(), from: email, to });
    สรุป.ต้องย้าย++;
  }
  return { ย้าย, สรุป };
}
