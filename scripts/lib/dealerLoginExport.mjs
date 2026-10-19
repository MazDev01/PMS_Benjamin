// ── แถวของไฟล์ส่งออกชื่อผู้ใช้ + รหัสผ่านชั่วคราวของดีลเลอร์ (บอสอนุมัติ 19 ต.ค. 69) ──────────────────────────
//   ใช้กับ scripts/export-dealer-logins.mjs · ข้อทดสอบ tests/unit/dealerLoginExport.test.ts
//   ชื่อผู้ใช้ = รหัสสาขาอย่างเดียว (หน้าเข้าระบบเติมโดเมนให้ · lib/dealerLogin.ts)
//   ออกเฉพาะบัญชีที่ "พิมพ์รหัสสาขาแล้วเข้าได้จริง" = อีเมลเข้าระบบเป็น <รหัสสาขา>@โดเมนบริษัท และยังใช้รหัสชั่วคราวของ HQ
import { ดีลเลอร์ตั้งเอง } from "./tempPasswordAccounts.mjs";

export const LOGIN_DOMAIN = "dealer.benjaminpebsteel.com";
export const DEALER_URL = "https://dealerpms.benjaminpebsteel.com";

/** ข้อความพร้อมส่งของหนึ่งสาขา (ช่องที่ 4 · บอสสั่ง 19 ต.ค. 69) — HQ คัดลอกช่องเดียวแล้วส่งได้ทันที · ไม่เกิน 8 บรรทัด
 *  ลำดับเข้าครั้งแรกตรงกับระบบจริง: ตั้งรหัสใหม่ → ระบบพาไปเข้าอีกครั้งด้วยรหัสใหม่ → ยืนยันอีเมลด้วยโค้ด 6 หลัก (FirstPasswordGate) */
export const ข้อความพร้อมส่ง = ({ ชื่อสาขา, ชื่อผู้ใช้, รหัสผ่านชั่วคราว }) => [
  `เรียน ${ชื่อสาขา || `สาขา ${ชื่อผู้ใช้}`}`,
  `เข้าระบบที่ ${DEALER_URL}`,
  `รหัสสาขา (ชื่อผู้ใช้): ${ชื่อผู้ใช้}`,
  `รหัสผ่านชั่วคราว: ${รหัสผ่านชั่วคราว}`,
  "เข้าครั้งแรกต้องตั้งรหัสผ่านใหม่ แล้วเข้าระบบอีกครั้งด้วยรหัสใหม่",
  "จากนั้นยืนยันอีเมลด้วยโค้ด 6 หลักที่ส่งไปทางอีเมล (ใช้ได้ 15 นาที ไม่เจอให้ดูในสแปม)",
  "ลืมรหัสผ่าน ติดต่อสำนักงานใหญ่",
].join("\n");

/**
 * @param {{ dealers: {code:string, name?:string|null}[], profiles: {id:string, role:string, dealer_code?:string|null}[],
 *           users: {id:string, email?:string|null}[], secrets: {dealer_code:string, secret:string, updated_by?:string|null}[],
 *           ถอด: (s:string) => string|null }} x
 */
export function แถวส่งออก({ dealers, profiles, users, secrets, ถอด }) {
  const ชื่อ = new Map(dealers.map(d => [String(d.code).toUpperCase(), String(d.name ?? "")]));
  const อีเมล = new Map(users.map(u => [u.id, String(u.email ?? "").toLowerCase()]));
  const สำเนา = new Map(secrets.map(s => [String(s.dealer_code).toUpperCase(), s]));
  const สรุป = { บัญชีดีลเลอร์: 0, ส่งออก: 0, ดีลเลอร์ตั้งรหัสเองแล้ว: 0, ไม่มีสำเนารหัส: 0, ถอดรหัสไม่ได้: 0, ชื่อผู้ใช้ไม่ใช่รหัสสาขา: 0 };
  const แถว = [];
  for (const p of profiles) {
    if (p.role !== "DEALER_ADMIN") continue;
    const code = String(p.dealer_code ?? "").trim().toUpperCase();
    if (!code) continue;
    สรุป.บัญชีดีลเลอร์++;
    // พิมพ์รหัสสาขาแล้วเข้าได้ก็ต่อเมื่ออีเมลเข้าระบบเป็น <รหัสสาขา>@โดเมนบริษัท (ยังไม่ย้ายโดเมน / ใช้อีเมลของตัวเอง = ไม่ออก)
    if (อีเมล.get(p.id) !== `${code.toLowerCase()}@${LOGIN_DOMAIN}`) { สรุป.ชื่อผู้ใช้ไม่ใช่รหัสสาขา++; continue; }
    const s = สำเนา.get(code);
    if (!s) { สรุป.ไม่มีสำเนารหัส++; continue; }
    if (ดีลเลอร์ตั้งเอง.test(String(s.updated_by ?? ""))) { สรุป.ดีลเลอร์ตั้งรหัสเองแล้ว++; continue; }
    const รหัส = ถอด(s.secret);
    if (!รหัส) { สรุป.ถอดรหัสไม่ได้++; continue; }
    const r = { ชื่อสาขา: ชื่อ.get(code) ?? "", ชื่อผู้ใช้: code, รหัสผ่านชั่วคราว: รหัส };
    แถว.push({ ...r, ข้อความพร้อมส่ง: ข้อความพร้อมส่ง(r) });
    สรุป.ส่งออก++;
  }
  แถว.sort((a, b) => a.ชื่อผู้ใช้.localeCompare(b.ชื่อผู้ใช้, "en"));
  return { แถว, สรุป };
}

/** CSV ที่ Excel เปิดแล้วภาษาไทยไม่เพี้ยน (UTF-8 + BOM · แถวคั่นด้วย CRLF)
 *  ค่าที่ขึ้นต้นด้วย = + - @ ห่อเป็น ="ค่า" — Excel จะไม่ตีความเป็นสูตร และแสดง/คัดลอกได้ตรงตัว
 *  ขึ้นบรรทัดในช่อง (ข้อความพร้อมส่ง) = LF อยู่ในเครื่องหมายคำพูด → Excel แสดงหลายบรรทัดในช่องเดียว ไม่แตกเป็นหลายแถว */
export function เป็นCSV(แถว) {
  const หัว = ["ชื่อสาขา", "ชื่อผู้ใช้", "รหัสผ่านชั่วคราว", "ข้อความพร้อมส่ง"];
  const ช่อง = v => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = `="${s.replace(/"/g, '""')}"`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [หัว, ...แถว.map(r => หัว.map(h => r[h]))].map(r => r.map(ช่อง).join(",")).join("\r\n") + "\r\n";
}
