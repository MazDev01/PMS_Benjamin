// ── รอบตรวจเต็มเจอข้อตก → รันซ้ำเฉพาะไฟล์ที่ตกบน commit เดิม (บอสสั่ง 28 ต.ค. 69 · ตัดเทสต์ซ้ำซ้อน) ─────────────────────
//
// เดิม: ข้อตกข้อเดียว (แม้เป็นข้อไม่นิ่ง) = รอบตก → ต้องรันใหม่ทั้งรอบ (~40 นาที)
// ตอนนี้: จบทุกช่วงแล้ว ข้อไหนตก (หรือไม่ได้รันโดยไม่มีเหตุผล เช่นข้อต่อจากข้อที่ตกในไฟล์ serial) → รันซ้ำ "ทั้งไฟล์" นั้นครั้งเดียว
//   บนเซิร์ฟเวอร์/ผล build/commit เดิม (ยังไม่ปิดเซิร์ฟเวอร์)
//   · รันซ้ำผ่าน = ข้อที่ตกนับเป็น "ไม่นิ่ง" (จดลงตัวนับ tests/flaky-log.txt) แล้วรอบนี้ผ่านต่อได้
//   · รันซ้ำยังตก = ตกจริง · ข้อไม่นิ่งครบเกณฑ์ 3 ครั้งโดยไม่มีต้นเหตุ = ตกจริง (ตัดสินที่ flakyLog.mjs เหมือนเดิม)
//   · ช่วงที่ตกโดยไม่มีข้อให้รันซ้ำ (ตัวเตรียมข้อมูลล้ม · รายงานไม่มีข้อ) = ตกจริง — ไม่เดา
// ไม่ลดข้อทดสอบ: ทุกข้อยังรันในรอบหลัก · รันซ้ำทั้งไฟล์ (ข้ออื่นในไฟล์รันอีกรอบด้วย ต้องผ่านด้วย)
// ข้อทดสอบ: tests/tools/gate-rerun.test.mjs (playwright จริง กับข้อจำลองที่ตกครั้งเดียว / ตกสองครั้ง)
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ตัวระบุ } from "./flakyLog.mjs";

/** ทุกข้อในรายงาน JSON ของ playwright · ไฟล์ = ที่อยู่เทียบโฟลเดอร์งาน (ใช้สั่งรันซ้ำได้ตรง) */
export function ข้อในรายงาน(ไฟล์รายงาน, cwd = process.cwd()) {
  if (!existsSync(ไฟล์รายงาน)) return null;
  const j = JSON.parse(readFileSync(ไฟล์รายงาน, "utf8"));
  const ราก = j.config?.rootDir ?? cwd;
  const ผล = [];
  (function เดิน(s, file) {
    for (const x of s.suites ?? []) เดิน(x, x.file ?? file);
    for (const sp of s.specs ?? []) for (const t of sp.tests ?? []) {
      const ไฟล์ = path.relative(cwd, path.resolve(ราก, sp.file ?? file)).replaceAll("\\", "/");
      const มีเหตุข้าม = (t.annotations ?? []).some(a => a.type === "skip" && String(a.description ?? "").trim());
      ผล.push({ ไฟล์, ชื่อ: sp.title, โปรเจกต์: t.projectName, สถานะ: t.status, มีเหตุข้าม, key: ตัวระบุ(sp.file ?? file, sp.title) });
    }
  })(j);
  return { ข้อ: ผล, ข้อผิดพลาด: (j.errors ?? []).length };
}

/** ข้อที่ต้องรันซ้ำ: ตก · ไม่ได้รันโดยไม่มีเหตุผลในโค้ด (ตามตัวตรวจ check-e2e-ran) */
const ต้องรันซ้ำ = (x) => x.สถานะ === "unexpected" || (x.สถานะ === "skipped" && !x.มีเหตุข้าม);

/**
 * ตัดสินท้ายรอบ + รันซ้ำไฟล์ที่ตก
 * @param {{ ช่วง: { โปรเจกต์: string, รายงาน: string, code: number }[],
 *           รันซ้ำ: (โปรเจกต์: string, ไฟล์: string[], รายงานใหม่: string) => Promise<number>,
 *           cwd?: string, log?: (s: string) => void }} o
 * @returns {Promise<{ ตก: boolean, รายงานรันซ้ำ: string[], ไม่นิ่ง: string[], ตกจริง: string[] }>}
 */
export async function ตัดสินพร้อมรันซ้ำ({ ช่วง, รันซ้ำ, cwd = process.cwd(), log = console.log }) {
  const รายงานรันซ้ำ = [], ไม่นิ่ง = [], ตกจริง = [];
  for (const c of ช่วง) {
    if (c.code === 0) continue;
    const r = ข้อในรายงาน(c.รายงาน, cwd);
    const ข้อตก = (r?.ข้อ ?? []).filter(ต้องรันซ้ำ);
    if (!r || r.ข้อผิดพลาด || !ข้อตก.length) {
      ตกจริง.push(`ช่วง ${c.โปรเจกต์}: ตกโดยไม่มีข้อให้รันซ้ำ (${!r ? "ไม่มีรายงาน" : r.ข้อผิดพลาด ? "ตัวเตรียม/ตัวรันล้ม" : "ไม่พบข้อที่ตก"})`);
      continue;
    }
    const ไฟล์ = [...new Set(ข้อตก.map(x => x.ไฟล์))].sort();
    const รายงานใหม่ = c.รายงาน.replace(/\.json$/, "") + ".rerun.json";
    log(`▶ รันซ้ำช่วง ${c.โปรเจกต์}: ${ไฟล์.length} ไฟล์ที่ตก (commit เดิม · เซิร์ฟเวอร์เดิม) — ${ไฟล์.join(" · ")}`);
    const code = await รันซ้ำ(c.โปรเจกต์, ไฟล์, รายงานใหม่);
    รายงานรันซ้ำ.push(รายงานใหม่);
    const ซ้ำ = ข้อในรายงาน(รายงานใหม่, cwd);
    const ยังตก = (ซ้ำ?.ข้อ ?? []).filter(ต้องรันซ้ำ);
    // ทุกข้อที่ตกในรอบหลักต้องได้รันในรอบซ้ำจริง — ไม่งั้นนับเป็นผ่านไม่ได้
    const ได้รัน = new Set((ซ้ำ?.ข้อ ?? []).filter(x => x.สถานะ === "expected" || x.สถานะ === "flaky").map(x => `${x.โปรเจกต์}|${x.key}`));
    const ไม่ได้รันซ้ำ = ข้อตก.filter(x => !ได้รัน.has(`${x.โปรเจกต์}|${x.key}`));
    if (code !== 0 || !ซ้ำ || ซ้ำ.ข้อผิดพลาด || ยังตก.length || ไม่ได้รันซ้ำ.length) {
      for (const x of (ยังตก.length ? ยังตก : ไม่ได้รันซ้ำ)) ตกจริง.push(`${x.key} [${x.โปรเจกต์}] — รันซ้ำแล้วยังตก`);
      if (!ยังตก.length && !ไม่ได้รันซ้ำ.length) ตกจริง.push(`ช่วง ${c.โปรเจกต์}: รันซ้ำไม่สำเร็จ (code ${code})`);
      continue;
    }
    for (const x of ข้อตก.filter(x => x.สถานะ === "unexpected")) ไม่นิ่ง.push(x.key);
    log(`✓ รันซ้ำช่วง ${c.โปรเจกต์} ผ่าน — ข้อที่ตกในรอบหลัก ${ข้อตก.length} ข้อ นับเป็นไม่นิ่ง (จดลงตัวนับ)`);
  }
  return { ตก: ตกจริง.length > 0, รายงานรันซ้ำ, ไม่นิ่ง: [...new Set(ไม่นิ่ง)], ตกจริง };
}
