// ── พอร์ต/ที่อยู่เว็บในเครื่องของโฟลเดอร์นี้ (ฝั่ง TypeScript ของ scripts/lib/session.mjs · 22 ต.ค. 69) ──────────────────────
//   เซสชันลูก = .pms-session.json · โฟลเดอร์หลัก = scripts/lib/ports.json — ห้ามเขียนเลขพอร์ตเอง (ตัวตรวจ check-hardcoded-ports)
//   ข้อทดสอบหน่วย tests/unit/sessionPorts.test.ts ยืนยันว่าตรงกับฝั่งสคริปต์เสมอ
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type คู่พอร์ต = { dealer: number; hq: number };
const ราก = path.resolve(__dirname, "../..");
const เซสชัน = path.join(ราก, ".pms-session.json");
const แหล่ง: { dev: คู่พอร์ต; test: คู่พอร์ต } = JSON.parse(readFileSync(existsSync(เซสชัน) ? เซสชัน : path.join(ราก, "scripts/lib/ports.json"), "utf8"));

export const พอร์ต = (ชนิด: "dev" | "test" = "dev"): คู่พอร์ต => แหล่ง[ชนิด];
export const ต้นทาง = (ชนิด: "dev" | "test" = "dev") => ({
  dealer: `http://localhost:${แหล่ง[ชนิด].dealer}`,
  hq: `http://localhost:${แหล่ง[ชนิด].hq}`,
});
/** ที่อยู่เว็บที่ข้อทดสอบคุยด้วย — รอบตรวจเต็มส่ง PMS_*_ORIGIN (พอร์ตทดสอบ) · รันเองด้วย npm run dev = พอร์ต dev ของโฟลเดอร์นี้ */
export const ที่อยู่เว็บ = {
  dealer: process.env.PMS_DEALER_ORIGIN ?? ต้นทาง("dev").dealer,
  hq: process.env.PMS_HQ_ORIGIN ?? ต้นทาง("dev").hq,
} as const;
