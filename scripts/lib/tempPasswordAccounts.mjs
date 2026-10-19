// ── เลือกบัญชีดีลเลอร์ที่ "ยังใช้รหัสผ่านที่คนอื่นตั้งให้" — ต้องถูกบังคับตั้งรหัสของตัวเอง ─────────────
//
// ใช้โดย scripts/flag-temp-passwords.mjs · แยกเป็นฟังก์ชันล้วนเพื่อทดสอบได้ (tests/unit/tempPasswordAccounts.test.ts)
//
// ที่มา (13 ต.ค. 69): ด่าน "ยังไม่ตั้งรหัสของตัวเอง แตะข้อมูลไม่ได้" (ใบ 0187) ทำงานจากเครื่องหมาย must_change_password
//   บัญชีที่เปิดจากไฟล์ด้วยสคริปต์ (154 ราย) ไม่เคยถูกตั้งเครื่องหมายนี้ → ด่านไม่ครอบ
//
// เกณฑ์: บัญชีดีลเลอร์ที่มี "สำเนารหัสผ่าน" (dealer_login_secrets) ซึ่ง **ไม่ได้มาจากดีลเลอร์ตั้งเอง**
//   ⚠️ แค่ "มีแถวสำเนา" ไม่พอ — ดีลเลอร์ที่ตั้งรหัสเองแล้วก็ยังมีแถวอยู่ (ระบบเก็บสำเนารหัสใหม่ทับให้สำนักงานใหญ่ดูได้)
//      ใช้เกณฑ์นั้นตรง ๆ = บังคับคนที่ตั้งเองแล้วให้ตั้งซ้ำ · ดูจากช่อง updated_by ว่าใครเป็นคนตั้งรหัสล่าสุด
//      (ป้ายสองแบบนี้เขียนโดย apps/hq/app/api/account/route.ts ตอนดีลเลอร์ตั้ง/เปลี่ยนรหัสเอง)
export const ดีลเลอร์ตั้งเอง = /\((ดีลเลอร์ตั้งเอง|ตั้งตอนเข้าระบบครั้งแรก)\)\s*$/;

/**
 * @param {{ secrets: {dealer_code:string, updated_by?:string|null}[],
 *           profiles: {id:string, role:string, dealer_code?:string|null}[],
 *           users: {id:string, app_metadata?:Record<string,unknown>|null}[],
 *           only?: string[] }} x   only = จำกัดเฉพาะรหัสดีลเลอร์ที่ระบุ (ใช้ตอนทดสอบ)
 * @returns {{ ต้องตั้ง: {id:string, dealerCode:string, appMeta:Record<string,unknown>}[],
 *             สรุป: Record<string, number> }}
 */
export function เลือกบัญชีที่ต้องตั้งเครื่องหมาย({ secrets, profiles, users, only }) {
  const จำกัด = only?.length ? new Set(only.map(c => c.toUpperCase())) : null;
  const สำเนา = new Map(secrets.map(s => [String(s.dealer_code).toUpperCase(), s]));
  const ผู้ใช้ = new Map(users.map(u => [u.id, u]));
  const สรุป = { บัญชีดีลเลอร์: 0, ไม่มีสำเนารหัส: 0, ดีลเลอร์ตั้งรหัสเองแล้ว: 0, ไม่พบบัญชีเข้าระบบ: 0, มีเครื่องหมายครบแล้ว: 0, เติมเครื่องหมายยืนยันอีเมล: 0, ต้องตั้งเครื่องหมาย: 0 };
  const ต้องตั้ง = [];
  for (const p of profiles) {
    if (p.role !== "DEALER_ADMIN" && p.role !== "DEALER_SALES") continue;
    const code = String(p.dealer_code ?? "").toUpperCase();
    if (!code || (จำกัด && !จำกัด.has(code))) continue;
    สรุป.บัญชีดีลเลอร์++;
    const s = สำเนา.get(code);
    if (!s) { สรุป.ไม่มีสำเนารหัส++; continue; }
    if (ดีลเลอร์ตั้งเอง.test(String(s.updated_by ?? ""))) { สรุป.ดีลเลอร์ตั้งรหัสเองแล้ว++; continue; }
    const u = ผู้ใช้.get(p.id);
    if (!u) { สรุป.ไม่พบบัญชีเข้าระบบ++; continue; }
    const appMeta = { ...(u.app_metadata ?? {}) };
    // ครบ = มีทั้ง "เปลี่ยนรหัส" และ "ยืนยันอีเมล" (บอสตัดสิน 16 ต.ค. 69: ทั้ง 155 บัญชีต้องยืนยันอีเมล)
    //   มีแค่เครื่องหมายเปลี่ยนรหัส (150 บัญชีบนระบบจริง) → ยังต้องเติมเครื่องหมายยืนยันอีเมล
    if (appMeta.must_change_password === true && appMeta.must_verify_email === true) { สรุป.มีเครื่องหมายครบแล้ว++; continue; }
    if (appMeta.must_change_password === true) สรุป.เติมเครื่องหมายยืนยันอีเมล++;
    สรุป.ต้องตั้งเครื่องหมาย++;
    ต้องตั้ง.push({ id: u.id, dealerCode: code, appMeta });
  }
  return { ต้องตั้ง, สรุป };
}

/** อ่านตัวเลือกบรรทัดคำสั่งของ flag-temp-passwords — คืน { ฐานจริง, ลงมือ, only, ผิด } */
export function อ่านตัวเลือก(args) {
  const มี = f => args.includes(f);
  // ไม่มี --only = ทุกสาขา · indexOf ได้ -1 แล้วบวก 1 = อ่านตัวเลือกแรกเป็นรหัสสาขา (บั๊กเดิม: --prod → จำกัดสาขา "--prod")
  const i = args.indexOf("--only");
  const ค่า = i >= 0 ? (args[i + 1] ?? "") : "";
  const only = ค่า.startsWith("--") ? [] : ค่า.split(",").map(s => s.trim()).filter(Boolean);
  const ผิด = มี("--only") && !only.length ? "--only ต้องตามด้วยรหัสดีลเลอร์ เช่น --only ABC,XYZ" : "";
  return { ฐานจริง: มี("--prod"), ลงมือ: มี("--apply"), ล้าง: มี("--unset"), only, ผิด };
}

/**
 * ล้างเครื่องหมาย "ต้องเปลี่ยนรหัส" + "ต้องยืนยันอีเมล" (บอสตัดสิน 19 ต.ค. 69: เข้าแล้วเข้าหน้าหลักทันที ไม่บังคับ)
 *   เลือกเฉพาะบัญชีบทบาทดีลเลอร์ที่ยังมีเครื่องหมายอย่างใดอย่างหนึ่ง · บัญชี HQ ไม่แตะ (นับไว้รายงานอย่างเดียว)
 *   ต้องล้าง must_change_password ด้วย — ฐานมีด่าน 0187 บัญชีที่มีเครื่องหมายนี้อ่าน/เขียนข้อมูลไม่ได้ (เห็นทุกหน้าว่าง)
 * @param {{ profiles: {id:string, role:string, dealer_code?:string|null}[],
 *           users: {id:string, app_metadata?: Record<string, unknown>}[], only?: string[] }} x
 */
export function เลือกบัญชีที่ต้องล้างเครื่องหมาย({ profiles, users, only }) {
  const จำกัด = only?.length ? new Set(only.map(c => c.toUpperCase())) : null;
  const โปรไฟล์ = new Map(profiles.map(p => [p.id, p]));
  const สรุป = { บัญชีดีลเลอร์: 0, มีเครื่องหมายเปลี่ยนรหัส: 0, มีเครื่องหมายยืนยันอีเมล: 0, ไม่มีเครื่องหมาย: 0, ต้องล้างเครื่องหมาย: 0, บัญชีHQมีเครื่องหมาย: 0 };
  const ต้องล้าง = [];
  for (const u of users) {
    const m = { ...(u.app_metadata ?? {}) };
    const เปลี่ยน = m.must_change_password === true, ยืนยัน = m.must_verify_email === true;
    const p = โปรไฟล์.get(u.id);
    if (!p || (p.role !== "DEALER_ADMIN" && p.role !== "DEALER_SALES")) { if (เปลี่ยน || ยืนยัน) สรุป.บัญชีHQมีเครื่องหมาย++; continue; }
    const code = String(p.dealer_code ?? "").toUpperCase();
    if (จำกัด && !จำกัด.has(code)) continue;
    สรุป.บัญชีดีลเลอร์++;
    if (เปลี่ยน) สรุป.มีเครื่องหมายเปลี่ยนรหัส++;
    if (ยืนยัน) สรุป.มีเครื่องหมายยืนยันอีเมล++;
    if (!เปลี่ยน && !ยืนยัน) { สรุป.ไม่มีเครื่องหมาย++; continue; }
    สรุป.ต้องล้างเครื่องหมาย++;
    ต้องล้าง.push({ id: u.id, dealerCode: code, appMeta: m });
  }
  return { ต้องล้าง, สรุป };
}
