// ── ข้อมูลเซสชันของโฟลเดอร์นี้: ชื่อ · พอร์ต (ทำงานหลายเซสชันพร้อมกัน · บอสสั่ง 22 ต.ค. 69) ─────────────────────────────
//
// โฟลเดอร์หลัก (เซสชันรวมงาน) ไม่มีไฟล์ .pms-session.json → พอร์ตตาม scripts/lib/ports.json (3001/3002)
// เซสชันลูก (npm run session:new -- <ชื่อ>) มี .pms-session.json ที่รากโฟลเดอร์ของตัวเอง: { ชื่อ, ช่อง, dev:{dealer,hq}, test:{dealer,hq} }
// ทุกที่ที่ต้องรู้พอร์ต/ที่อยู่เว็บในเครื่อง อ่านจากไฟล์นี้ — ห้ามเขียนเลขพอร์ตเอง (ตัวตรวจ check-hardcoded-ports)
//   ชุดทดสอบฝั่ง TypeScript อ่านไฟล์เดียวกันที่ tests/scenario/sessionPorts.ts
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const รากโฟลเดอร์ = path.resolve(import.meta.dirname, "../..");
export const ไฟล์เซสชัน = (root = รากโฟลเดอร์) => path.join(root, ".pms-session.json");
export const ค่าพอร์ต = JSON.parse(readFileSync(path.join(import.meta.dirname, "ports.json"), "utf8"));

/** เซสชันลูก = ข้อมูลในไฟล์ · โฟลเดอร์หลัก = null */
export function อ่านเซสชัน(root = รากโฟลเดอร์) {
  const f = ไฟล์เซสชัน(root);
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
}
export const เป็นโฟลเดอร์หลัก = (root = รากโฟลเดอร์) => อ่านเซสชัน(root) === null;
export const ชื่อเซสชัน = (root = รากโฟลเดอร์) => อ่านเซสชัน(root)?.ชื่อ ?? "หลัก";

/** พอร์ตของช่องที่ k (เซสชันลูก k = 1, 2, …) */
export function พอร์ตของช่อง(k) {
  const c = ค่าพอร์ต.เซสชันลูก, ฐาน = c.ฐาน + c.ช่วงต่อเซสชัน * k;
  return { dev: { dealer: ฐาน + c.dev.dealer, hq: ฐาน + c.dev.hq }, test: { dealer: ฐาน + c.test.dealer, hq: ฐาน + c.test.hq } };
}

/** พอร์ตของโฟลเดอร์นี้ · ชนิด = "dev" (npm run dev) | "test" (รอบตรวจเต็ม next start) */
export function พอร์ต(ชนิด = "dev", root = รากโฟลเดอร์) {
  const s = อ่านเซสชัน(root);
  return (s ?? ค่าพอร์ต)[ชนิด];
}
export function ต้นทาง(ชนิด = "dev", root = รากโฟลเดอร์) {
  const p = พอร์ต(ชนิด, root);
  return { dealer: `http://localhost:${p.dealer}`, hq: `http://localhost:${p.hq}` };
}
