#!/usr/bin/env node
// ── ตัวกันภาษาไทย: Stop hook ของ Claude Code (งาน rmwbmmzod4ov · บอสสั่ง 11 พ.ย. 69) ─────────────────────────────
//   ตรวจข้อความสุดท้ายที่ AI จะส่งถึงบอส · มีประโยคภาษาอังกฤษนอกโค้ด/ชื่อไฟล์/ชื่อคำสั่ง = ตีกลับให้เขียนใหม่เป็นไทย
//   ไม่ตรวจ: code block (``` ... ```) · `โค้ดในบรรทัด` · ที่อยู่เว็บ · ชื่อไฟล์/พาธ · ตัวย่อ/ชื่อเฉพาะตัวพิมพ์ใหญ่ (HQ, VAT, PDF ...)
//   "ประโยคอังกฤษ" = คำอังกฤษ (ตัวพิมพ์เล็กอย่างน้อย 1 ตัว) ติดกัน ≥ 4 คำ โดยไม่มีอักษรไทยคั่น
//   stop_hook_active = true (ตีกลับไปแล้วรอบหนึ่ง) → ไม่ตีซ้ำ กันวนไม่จบ
//
// ⚠️ ไฟล์นี้ยังไม่ถูกใช้จนกว่าบอสวางเองใน .claude/settings.json ของโปรเจกต์ (AI ห้ามแก้ settings/hook):
//   "hooks": { "Stop": [ { "hooks": [ { "type": "command", "command": "node scripts/hooks/thai-guard.mjs" } ] } ] }
//   (เติมเข้าอาร์เรย์ Stop เดิมถ้ามี ไม่แทนของเดิม)
// ข้อทดสอบ: tests/tools/thai-guard.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const คำยกเว้น = new Set(["e.g", "i.e", "etc", "vs"]);

/** ตัดส่วนที่ไม่ตรวจออก (โค้ด · ที่อยู่เว็บ · พาธ/ชื่อไฟล์ · ชื่อคำสั่งแบบ npm run x / node x) */
export function ตัดส่วนไม่ตรวจ(ข้อความ) {
  return String(ข้อความ ?? "")
    .replace(/```[\s\S]*?(```|$)/g, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")                                   // ลิงก์ markdown: ตรวจเฉพาะข้อความ
    .replace(/(?:[A-Za-z]:)?[\w.@-]*[\\/][\w.@\\/-]+/g, " ")                   // พาธ
    .replace(/\b[\w-]+\.(mjs|js|ts|tsx|json|sql|md|html|css|txt|log|yml|yaml|env|cmd|sh|ps1)\b/gi, " ")
    .replace(/\b(npm run|npx|node|git|pnpm)\s+[\w:@./-]+(\s+--?[\w-]+)*/g, " ");
}

/** ประโยคอังกฤษที่เจอ (คำอังกฤษติดกัน ≥ 4 คำ ไม่มีไทยคั่น · ตัวย่อพิมพ์ใหญ่ล้วนไม่นับ) */
export function หาประโยคอังกฤษ(ข้อความ, { อย่างน้อย = 4 } = {}) {
  const เจอ = [];
  // แบ่งเป็นช่วงที่ไม่มีอักษรไทย/ขึ้นบรรทัดใหม่คั่น
  for (const ช่วง of ตัดส่วนไม่ตรวจ(ข้อความ).split(/[฀-๿\n·|]+/)) {
    const คำ = ช่วง.match(/[A-Za-z][A-Za-z'’-]*/g) ?? [];
    let ชุด = [];
    const ปิด = () => { if (ชุด.length >= อย่างน้อย) เจอ.push(ชุด.join(" ")); ชุด = []; };
    for (const w of คำ) {
      const นับ = /[a-z]/.test(w) && !คำยกเว้น.has(w.toLowerCase());
      if (นับ) ชุด.push(w); else ปิด();
    }
    ปิด();
  }
  return เจอ;
}

/** ข้อความของ AI ในเทิร์นล่าสุด (หลังข้อความผู้ใช้ล่าสุด) จาก transcript jsonl */
export function ข้อความเทิร์นล่าสุด(เนื้อjsonl) {
  const แถว = String(เนื้อjsonl ?? "").split(/\r?\n/).filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const ข้อความ = [];
  for (let i = แถว.length - 1; i >= 0; i--) {
    const r = แถว[i];
    if (r.type === "user") {
      const c = r.message?.content;
      const เป็นผลเครื่องมือ = Array.isArray(c) && c.length > 0 && c.every(x => x?.type === "tool_result");
      if (!เป็นผลเครื่องมือ) break;
      continue;
    }
    if (r.type !== "assistant") continue;
    for (const b of [...(r.message?.content ?? [])].reverse()) if (b?.type === "text" && b.text) ข้อความ.unshift(b.text);
  }
  return ข้อความ.join("\n");
}

/** ผลของ hook: null = ผ่าน · { decision: "block", reason } = ตีกลับ */
export function ตัดสิน(input, อ่านไฟล์ = (f) => readFileSync(f, "utf8")) {
  if (input?.stop_hook_active) return null;
  let เนื้อ = "";
  try { เนื้อ = input?.transcript_path ? อ่านไฟล์(input.transcript_path) : ""; } catch { return null; }
  const เจอ = หาประโยคอังกฤษ(ข้อความเทิร์นล่าสุด(เนื้อ));
  if (!เจอ.length) return null;
  return {
    decision: "block",
    reason: `ข้อความถึงบอสมีประโยคภาษาอังกฤษ ${เจอ.length} จุด — เขียนใหม่เป็นภาษาไทย (ชื่อไฟล์/คำสั่ง/โค้ดใส่ใน \`...\` ได้): ${เจอ.slice(0, 3).map(s => `"${s.slice(0, 60)}"`).join(" · ")}`,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let ข้อมูล = "";
  try { ข้อมูล = readFileSync(0, "utf8"); } catch { /* ไม่มี stdin */ }
  let input = {};
  try { input = JSON.parse(ข้อมูล || "{}"); } catch { process.exit(0); }   // อ่านไม่ออก = ไม่ขวาง
  const ผล = ตัดสิน(input);
  if (ผล) process.stdout.write(JSON.stringify(ผล));
  process.exit(0);
}
