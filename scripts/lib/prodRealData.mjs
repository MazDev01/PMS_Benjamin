// ── ตัวกรองกลาง: ข้อมูลทดสอบบนฐานจริง — นับ/รายงานฐานจริงต้องตัดผ่านตัวนี้ตัวเดียว (บอสสั่ง 29 ต.ค. 69 · คิวข้อ 11) ───────────
//
// เหตุจริง 29 ต.ค. 69: ef นับใบตอบรับบนฐานจริงได้ 1 ใบ แล้วรายงานบอสว่าเป็นใบจริง — ที่จริงเป็นใบของสาขาทดสอบ ZZT (prod-live)
//   แต่ละสคริปต์เคยเขียนเกณฑ์ "ข้อมูลทดสอบ" เอง (บางตัวดูแค่ป้าย ZZTEST) → ตกหล่นคนละแบบ
// ข้อมูลทดสอบบนฐานจริง = อย่างใดอย่างหนึ่ง:
//   1) รหัสสาขาทดสอบ ^Z[ZT][A-Z]{1,3}$ (ZZT ของ prod-live · ZZ…/ZT… ของชุดทดสอบ — กติกาเดียวกับ tests/scenario/testDealers.ts)
//   2) อีเมลทดสอบ: …@example.test หรือบัญชีชั่วคราว live-… (prod-live สร้าง live-dealer-<เลข>@example.test)
//   3) ป้ายทดสอบในชื่อ/บริษัท/ลูกค้า: ZZTEST · ZZLOAD
// ใช้:  import { แถวจริง, เป็นข้อมูลทดสอบ, เงื่อนไขSQLสาขาจริง } from "./lib/prodRealData.mjs";
//       const จริง = แถวจริง(data)                       // ตัดแถวทดสอบออก (ดูทุกช่องที่รู้จัก)
//       `... where ${เงื่อนไขSQLสาขาจริง("q.dealer_code")}` // นับด้วย SQL (prod:query)
// ตัวตรวจ scripts/check-prod-count-filter.mjs: สคริปต์ที่นับฐานจริงแต่ไม่ใช้ตัวนี้ = ตก

export const รูปรหัสสาขาทดสอบ = /^Z[ZT][A-Z]{1,3}$/;
export const รูปอีเมลทดสอบ = /(@example\.test$)|(^live-)/i;
export const รูปป้ายทดสอบ = /ZZTEST|ZZLOAD/i;

export const เป็นรหัสสาขาทดสอบ = (code) => รูปรหัสสาขาทดสอบ.test(String(code ?? "").trim());
export const เป็นอีเมลทดสอบ = (email) => รูปอีเมลทดสอบ.test(String(email ?? "").trim());
export const เป็นป้ายทดสอบ = (text) => รูปป้ายทดสอบ.test(String(text ?? ""));

// ช่องที่รู้จักในตารางของระบบ (แถวที่ไม่มีช่องไหนเลยก็ผ่าน — ไม่เดาจากช่องอื่น)
const ช่องรหัสสาขา = ["dealer_code", "code"];
const ช่องอีเมล = ["email", "to_email", "contact_email", "login_email"];
const ช่องชื่อ = ["company", "name", "customer", "project", "title"];

/** แถวนี้เป็นข้อมูลทดสอบหรือไม่ (ดูรหัสสาขา · อีเมล · ป้ายในชื่อ) */
export function เป็นข้อมูลทดสอบ(row) {
  if (!row || typeof row !== "object") return false;
  return ช่องรหัสสาขา.some(k => k in row && เป็นรหัสสาขาทดสอบ(row[k]))
    || ช่องอีเมล.some(k => k in row && เป็นอีเมลทดสอบ(row[k]))
    || ช่องชื่อ.some(k => k in row && เป็นป้ายทดสอบ(row[k]));
}

/** ตัดแถวทดสอบออก — ใช้ก่อนนับ/รวมยอด/รายงานทุกครั้ง */
export const แถวจริง = (rows) => (rows ?? []).filter(r => !เป็นข้อมูลทดสอบ(r));

/** เงื่อนไข SQL: แถวที่ไม่ใช่สาขาทดสอบ (ใส่หลัง where/and) · คอลัมน์ว่าง (null) ถือว่าไม่ใช่สาขาทดสอบ */
export const เงื่อนไขSQLสาขาจริง = (คอลัมน์ = "dealer_code") =>
  `coalesce(${คอลัมน์}, '') !~ '${รูปรหัสสาขาทดสอบ.source}'`;
/** เงื่อนไข SQL: อีเมลที่ไม่ใช่อีเมลทดสอบ */
export const เงื่อนไขSQLอีเมลจริง = (คอลัมน์ = "email") =>
  `not (coalesce(${คอลัมน์}, '') ~* '@example\\.test$' or coalesce(${คอลัมน์}, '') ~* '^live-')`;
