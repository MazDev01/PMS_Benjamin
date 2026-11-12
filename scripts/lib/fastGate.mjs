// ── ทางผ่านแบบเร็ว (บอสสั่งโหมดเร็ว 12 พ.ย. 69 · คนรวมงานอนุมัติแบบ 13 พ.ย. 69) ─────────────────────────────────────
//   รอบที่ไม่มีใบปรับฐาน และไม่แตะไฟล์สิทธิ์/เงิน/เครื่องมือรอบ (scripts/gate-risky-paths.json) = ไม่ต้องรอบตรวจเต็ม
//   ทดสอบเฉพาะไฟล์ทดสอบที่แตะ + ชุดเช็กหลัก (typecheck · checks · vitest · build) → บันทึกลายนิ้วมือป้าย "เร็ว:" ลงไฟล์เดิม
//   (supabase/gate-passed-code.txt) → session-merge / pre-push / Vercel รับผ่าน ตรวจcommitผ่าน ตัวเดียวกับรอบเต็ม
//   ป้ายเร็ว = "เร็ว:<ลายนิ้วมือไฟล์เสี่ยงของ commit ฐาน>" — ตอนตรวจ (รวม Vercel ที่ clone ตื้น ไม่มี commit ฐาน) เทียบกับ
//     ลายนิ้วมือไฟล์เสี่ยงของ commit ที่ตรวจเอง → ไฟล์เสี่ยงต่างจากฐาน (เช่นเติมบรรทัดเองหรือรวมใบมาทีหลัง) = ไม่นับ
//   ใช้ที่: scripts/gate-fast.mjs (คำสั่ง) · scripts/lib/commitGate.mjs (ตรวจ) · ข้อทดสอบ tests/tools/gate-fast.test.mjs
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

export const ไฟล์รายการเสี่ยง = "scripts/gate-risky-paths.json";
export const คำนำป้ายเร็ว = "เร็ว:";
const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 << 20 }).trim();

/** แบบ glob (** = ทุกชั้น · * = ในชั้นเดียว) → RegExp เทียบทั้งพาธ */
export function แบบเป็นregex(แบบ) {
  let s = "";
  for (let i = 0; i < แบบ.length; i++) {
    const c = แบบ[i];
    if (c === "*" && แบบ[i + 1] === "*") { s += ".*"; i++; }
    else if (c === "*") s += "[^/]*";
    else s += c.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${s}$`);
}

/** รายการเสี่ยง [{ หมวด, แบบ }] จากไฟล์ใน commit (sha) หรือไฟล์ในโฟลเดอร์ (ไม่ส่ง sha) */
export function อ่านรายการเสี่ยง(cwd = process.cwd(), sha = null) {
  const ข้อความ = sha ? git(["show", `${sha}:${ไฟล์รายการเสี่ยง}`], cwd) : readFileSync(path.join(cwd, ไฟล์รายการเสี่ยง), "utf8");
  const j = JSON.parse(ข้อความ);
  // ไฟล์รายการเองเสี่ยงเสมอ (ไม่ขึ้นกับเนื้อไฟล์) — เดิมแก้รายการให้ว่างแล้วไฟล์รายการหลุดออกเอง = หลบทางเร็วได้ (ข้อทดสอบจับได้ 13 พ.ย. 69)
  return [{ หมวด: "เครื่องมือรอบ", แบบ: ไฟล์รายการเสี่ยง, re: แบบเป็นregex(ไฟล์รายการเสี่ยง) },
    ...Object.entries(j).filter(([, v]) => Array.isArray(v)).flatMap(([หมวด, v]) => v.map(แบบ => ({ หมวด, แบบ, re: แบบเป็นregex(แบบ) })))];
}
/** รายการรวมของ 2 commit (ฐาน ∪ HEAD) — commit ไหนไม่มีไฟล์รายการ ข้าม (ฐานเก่า) · ใช้ตอนตัดสิน ไม่ให้ HEAD ตัดรายการของฐานทิ้ง */
export function รายการรวม(cwd, ...shas) {
  const ทั้งหมด = shas.flatMap(s => { try { return อ่านรายการเสี่ยง(cwd, s); } catch { return []; } });
  const เห็น = new Set();
  return ทั้งหมด.filter(x => { const k = `${x.หมวด}|${x.แบบ}`; if (เห็น.has(k)) return false; เห็น.add(k); return true; });
}

/** ไฟล์ที่ตรงรายการเสี่ยง → [{ ไฟล์, หมวด, แบบ }] */
export function ไฟล์เสี่ยง(ไฟล์, รายการ) {
  return ไฟล์.flatMap(f => { const x = รายการ.find(r => r.re.test(f)); return x ? [{ ไฟล์: f, หมวด: x.หมวด, แบบ: x.แบบ }] : []; });
}

/** ลายนิ้วมือของไฟล์เสี่ยงทั้งหมดใน commit (เส้นทาง + blob) — ไม่ต้องมี commit อื่น (Vercel clone ตื้นตรวจได้)
 *  รายการ = ของ commit ที่ตรวจ (ไม่ส่ง = อ่านจาก sha เอง) — ตอนบันทึกคิดฐานด้วยรายการของ HEAD (ฐานเก่าอาจยังไม่มีไฟล์รายการ)
 *  ไฟล์รายการเป็นไฟล์เสี่ยงเอง → ตอนตรวจ รายการของ sha = รายการที่ใช้ตอนบันทึกเสมอ */
export function ลายนิ้วมือเสี่ยง(sha, cwd = process.cwd(), รายการ = อ่านรายการเสี่ยง(cwd, sha)) {
  const แถว = git(["ls-tree", "-r", "--full-tree", sha], cwd).split("\n").filter(Boolean)
    .filter(l => { const f = l.slice(l.indexOf("\t") + 1); return รายการ.some(r => r.re.test(f)); });
  return createHash("sha256").update(แถว.join("\n"), "utf8").digest("hex");
}

/** ไฟล์ทดสอบหน้าจอที่ diff แตะและยังอยู่ใน commit */
export const specที่แตะ = (ไฟล์) => ไฟล์.filter(f => /^tests\/scenario\/.+\.spec\.ts$/.test(f));
/** ไฟล์ที่นับเป็นเอกสาร (แก้อย่างเดียว = ไม่ต้องรันข้อทดสอบหน้าจอ) */
export const เป็นเอกสาร = (f) => /^docs\//.test(f) || /\.md$/i.test(f);

/**
 * ตัดสินว่าใช้ทางเร็วได้ไหม (ไม่รันอะไร — ตัวคำนวณล้วน)
 * @param {{ ไฟล์ที่เปลี่ยน: string[], ไฟล์ที่ลบ?: string[], รายการ: ReturnType<typeof อ่านรายการเสี่ยง>, ไฟล์ระบุ?: string[], ฐานผ่าน: boolean, ฐานเป็นบรรพบุรุษ: boolean }} x
 * @returns {{ ได้: boolean, เหตุ: string[], เสี่ยง: {ไฟล์:string,หมวด:string,แบบ:string}[], spec: string[] }}
 */
export function ตัดสินทางเร็ว({ ไฟล์ที่เปลี่ยน, ไฟล์ที่ลบ = [], รายการ, ไฟล์ระบุ = [], ฐานผ่าน, ฐานเป็นบรรพบุรุษ }) {
  const เหตุ = [];
  if (!ฐานผ่าน) เหตุ.push("commit ฐานไม่มีผลรอบตรวจผ่าน — ฐานต้องเป็น commit ที่ขึ้นเว็บแล้ว (origin/monorepo) หรือผ่านรอบตรวจแล้ว");
  if (!ฐานเป็นบรรพบุรุษ) เหตุ.push("commit ฐานไม่ใช่บรรพบุรุษของ commit ที่ตรวจ — ใช้ฐานจาก origin/monorepo");
  const เสี่ยง = ไฟล์เสี่ยง([...new Set([...ไฟล์ที่เปลี่ยน, ...ไฟล์ที่ลบ])], รายการ);
  if (เสี่ยง.length) เหตุ.push(`แตะไฟล์เสี่ยง ${เสี่ยง.length} ไฟล์ (${[...new Set(เสี่ยง.map(x => x.หมวด))].join(" · ")}) → ต้องรอบตรวจเต็ม: ${เสี่ยง.map(x => x.ไฟล์).join(" · ")}`);
  const spec = [...new Set([...specที่แตะ(ไฟล์ที่เปลี่ยน), ...ไฟล์ระบุ])].sort();
  const โค้ด = ไฟล์ที่เปลี่ยน.filter(f => !เป็นเอกสาร(f));
  if (โค้ด.length && !spec.length)
    เหตุ.push(`แก้โค้ด ${โค้ด.length} ไฟล์แต่ไม่แตะไฟล์ทดสอบหน้าจอเลย — ระบุไฟล์ทดสอบที่ครอบงานนี้เอง: npm run gate:fast -- --ไฟล์ tests/scenario/<ไฟล์>.spec.ts (กันผ่านโดยไม่รันข้อทดสอบใด · คนรวมงานเลือกแทนบอส 13 พ.ย. 69)`);
  if (!ไฟล์ที่เปลี่ยน.length && !ไฟล์ที่ลบ.length) เหตุ.push("ไม่มีอะไรเปลี่ยนจาก commit ฐาน — ไม่ต้องบันทึกผล");
  return { ได้: !เหตุ.length, เหตุ, เสี่ยง, spec };
}

/** ป้ายของบรรทัดบันทึกทางเร็ว */
export const ป้ายเร็ว = (ลายเสี่ยงฐาน) => `${คำนำป้ายเร็ว}${ลายเสี่ยงฐาน}`;
/** บรรทัดเร็วนี้ยังนับได้ไหม — ไฟล์เสี่ยงของ commit ที่ตรวจต้องตรงกับของฐานตอนบันทึก */
export function ป้ายเร็วยังใช้ได้(ป้าย, sha, cwd = process.cwd()) {
  if (!ป้าย.startsWith(คำนำป้ายเร็ว)) return { เร็ว: false, ได้: true };
  let ลาย = "";
  try { ลาย = ลายนิ้วมือเสี่ยง(sha, cwd); } catch (e) { return { เร็ว: true, ได้: false, เหตุ: `อ่านรายการไฟล์เสี่ยงใน commit ไม่ได้ (${String(e.message).slice(0, 120)})` }; }
  return ลาย === ป้าย.slice(คำนำป้ายเร็ว.length)
    ? { เร็ว: true, ได้: true }
    : { เร็ว: true, ได้: false, เหตุ: "ผลทางเร็วใช้ไม่ได้ — ไฟล์เสี่ยง (ใบปรับฐาน/สิทธิ์/เงิน/เครื่องมือรอบ) ต่างจาก commit ฐานตอนบันทึก → ต้องรอบตรวจเต็ม" };
}
