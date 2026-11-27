#!/usr/bin/env node
// ── ตัวย้ายโฟลเดอร์ในเครื่อง C:/.claude/pms-* → <โฟลเดอร์หลัก>/.local/ (บอสเลือก 24 พ.ย. 69 "ย้ายเข้า Benjamin-HQ-main") ─────────
//   ค่าเริ่ม = ดูอย่างเดียว (พิมพ์แผน เดิม→ใหม่ + จำนวนไฟล์/ขนาด · ไม่แตะอะไร) · --ย้าย = ย้ายจริง (บอสหรือคนรวมงานเป็นคนรัน)
//   ตารางย้ายอยู่ที่ scripts/lib/localPaths.mjs (ตัวเดียวกับที่โค้ดใช้หาที่อยู่ — ก่อนย้ายใช้ที่เดิม · ย้ายแล้วใช้ที่ใหม่เอง)
// ไม่ยอมย้ายเมื่อ: รอบตรวจเต็มสถานะ "กำลังตรวจ" · มีผู้ถือล็อกฐานทดสอบ/ฐานจริงที่ยังทำงาน · โฟลเดอร์เซสชันมีงานค้าง (git status ไม่ว่าง)
//   · รันจากในโฟลเดอร์ที่จะย้าย · ที่ใหม่มีอยู่แล้วทั้งที่ที่เดิมยังอยู่ (ชนกัน)
// ขั้นตอนตอน --ย้าย:
//   1) นับไฟล์+ขนาดทุกโฟลเดอร์ (ไม่เดินตามทางลัด · ไม่เปิดไฟล์)
//   prod-backups / prod-secrets ไม่อยู่ในตารางย้ายแล้ว (26 พ.ย. 69) — อยู่นอก repo ที่ C:/.claude/pms-private (ที่ส่วนตัว ใน localPaths) · ตัวย้ายไม่แตะ
//   2) หยุดฐานในเครื่องที่รันอยู่ (supabase stop · ไม่ใส่ --no-backup = ข้อมูลใน volume อยู่ครบ)
//   3) worktree (โฟลเดอร์เซสชัน · pms-dbcheck · pms-blank): ถอดทางลัดทุกตัวก่อน → git worktree move → สร้างทางลัดคืน (ชี้ที่ใหม่)
//      ห้าม rename worktree ตรง ๆ (git จะหาโฟลเดอร์ไม่เจอ) · ที่เหลือ rename ทั้งโฟลเดอร์ (ไดรฟ์เดียวกัน · ไม่คัดลอก)
//   4) แก้ที่อยู่ในทะเบียนเซสชัน (<git common dir>/pms-sessions.json + .pms-session.json ของแต่ละเซสชัน)
//   5) ทะเบียนบทบาท→เซสชัน: วางตัวส่งต่อ registry.mjs ที่ที่เดิม (settings ของบอสยังชี้ที่เดิม · AI แก้ settings ไม่ได้) + พิมพ์บรรทัดใหม่ให้บอสแก้
//   6) เปิดฐานที่หยุดไว้คืน · นับไฟล์+ขนาดอีกรอบ เทียบก่อน/หลังทุกโฟลเดอร์ (ไม่เท่า = แจ้งตก)
// ใช้ (จากโฟลเดอร์หลัก): node scripts/move-local.mjs            ดูแผน
//                        node scripts/move-local.mjs --ย้าย     ย้ายจริง
// ข้อทดสอบ: tests/tools/local-folder.test.mjs (โฟลเดอร์ชั่วคราว · PMS_LEGACY_ROOT/PMS_LOCAL_ROOT ชี้ที่จำลอง)
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ตารางย้าย, ห้ามเปิด, รากLocal, ที่เดิม, โฟลเดอร์หลัก } from "./lib/localPaths.mjs";
import { หาทางลัด, ถอดทางลัดทั้งหมด } from "./lib/sessions.mjs";
import { อ่านรอบ } from "./lib/roundQueue.mjs";
import { ไฟล์ล็อกฐานทดสอบ } from "./lib/testDbLock.mjs";
import { lockPath as ไฟล์ล็อกฐานจริง } from "./lib/prodLock.mjs";
import { อ่านล็อก, ยังทำงานอยู่ } from "./lib/fileLock.mjs";

const ทับ = (p) => String(p).replace(/\\/g, "/").replace(/\/+$/, "");
const ปกติ = (p) => ทับ(path.resolve(p)).toLowerCase();
const อยู่ใน = (ลูก, แม่) => { const a = ปกติ(ลูก), b = ปกติ(แม่); return a === b || a.startsWith(b + "/"); };
const gitที่ = (cwd) => (...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** worktree ทั้งหมดของ repo (ยกเว้นโฟลเดอร์หลัก) */
export function รายการworktree(หลัก) {
  return gitที่(หลัก)("worktree", "list", "--porcelain").split(/\r?\n/).filter(l => l.startsWith("worktree "))
    .map(l => ทับ(l.slice(9))).filter(p => ปกติ(p) !== ปกติ(หลัก));
}

/** นับไฟล์+ขนาด ไม่เดินตามทางลัด (ทางลัดนับเป็น 1 รายการ) · ใช้แค่ชื่อ/ขนาด ไม่เปิดไฟล์ */
export function นับ(ที่) {
  let ไฟล์ = 0, ขนาด = 0, ลิงก์ = 0;
  if (!existsSync(ที่)) return { ไฟล์, ขนาด, ลิงก์, มี: false };
  const st0 = lstatSync(ที่);
  if (!st0.isDirectory()) return { ไฟล์: 1, ขนาด: st0.size, ลิงก์: 0, มี: true };
  const เดิน = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      let st; try { st = lstatSync(p); } catch { continue; }
      if (st.isSymbolicLink()) { ลิงก์++; continue; }
      if (st.isDirectory()) { เดิน(p); continue; }
      ไฟล์++; ขนาด += st.size;
    }
  };
  เดิน(ที่);
  return { ไฟล์, ขนาด, ลิงก์, มี: true };
}

/** แผนย้าย: [{ ชื่อ, เดิม, ใหม่, วิธี }] · วิธี = "ไม่มี" | "ย้ายแล้ว" | "ชนกัน" | "worktree" | "ที่เก็บเซสชัน" | "ทั้งโฟลเดอร์" */
export function วางแผน(หลัก = โฟลเดอร์หลัก()) {
  const wts = รายการworktree(หลัก);
  return Object.keys(ตารางย้าย).map(ชื่อ => {
    const เดิม = ที่เดิม(ชื่อ), ใหม่ = `${รากLocal(หลัก)}/${ชื่อ}`;
    const มีเดิม = !!เดิม && existsSync(เดิม) && !เป็นตัวส่งต่อ(เดิม), มีใหม่ = existsSync(ใหม่);
    let วิธี = "ทั้งโฟลเดอร์";
    if (!มีเดิม) วิธี = มีใหม่ ? "ย้ายแล้ว" : "ไม่มี";
    else if (มีใหม่) วิธี = "ชนกัน";
    else if (wts.some(w => ปกติ(w) === ปกติ(เดิม))) วิธี = "worktree";
    else if (ชื่อ === "wt") วิธี = "ที่เก็บเซสชัน";
    return { ชื่อ, เดิม, ใหม่, วิธี, ห้ามเปิด: ห้ามเปิด.includes(ชื่อ) };
  });
}

/** เหตุที่ยังย้ายไม่ได้ (ว่าง = ย้ายได้) */
export function ตรวจก่อนย้าย(แผน, หลัก = โฟลเดอร์หลัก(), cwd = process.cwd()) {
  const เหตุ = [];
  for (const x of แผน.filter(x => x.วิธี === "ชนกัน")) เหตุ.push(`${x.ชื่อ}: มีทั้งที่เดิม (${x.เดิม}) และที่ใหม่ (${x.ใหม่}) — รวมเองก่อน ตัวย้ายไม่ทับ`);
  for (const x of แผน.filter(x => ["worktree", "ที่เก็บเซสชัน", "ทั้งโฟลเดอร์"].includes(x.วิธี)))
    if (อยู่ใน(cwd, x.เดิม)) เหตุ.push(`กำลังรันจากในโฟลเดอร์ที่จะย้าย (${x.เดิม}) — รันจากโฟลเดอร์หลัก ${หลัก}`);
  let รอบ = null; try { รอบ = อ่านรอบ(); } catch { /* ไม่มีที่เก็บรอบ */ }
  if (รอบ?.สถานะ === "กำลังตรวจ") เหตุ.push(`รอบตรวจเต็ม ${รอบ.รอบ} สถานะ "กำลังตรวจ" — รอจบ (ผ่านหรือยกเลิก) ก่อน`);
  for (const [ชื่อ, ไฟล์] of [["ฐานทดสอบ", ไฟล์ล็อกฐานทดสอบ()], ["ฐานจริง", ไฟล์ล็อกฐานจริง()]]) {
    const ล = อ่านล็อก(ไฟล์);
    if (ล && ยังทำงานอยู่(ล.pid)) เหตุ.push(`มีผู้ถือล็อก${ชื่อ}อยู่ (${ล.งาน ?? "ไม่ทราบงาน"} · pid ${ล.pid}) — รอปล่อยล็อกก่อน`);
  }
  const ที่เก็บ = แผน.find(x => x.ชื่อ === "wt");
  for (const w of รายการworktree(หลัก).filter(w => ที่เก็บ?.เดิม && อยู่ใน(w, ที่เก็บ.เดิม))) {
    let ค้าง = ""; try { ค้าง = gitที่(w)("status", "--porcelain"); } catch (e) { ค้าง = `อ่านสถานะไม่ได้ (${String(e.message).slice(0, 80)})`; }
    if (ค้าง) เหตุ.push(`เซสชัน ${w} มีงานค้าง (${ค้าง.split(/\r?\n/).length} รายการ) — commit หรือปิดเซสชันก่อน`);
  }
  return เหตุ;
}

const กลุ่ม = (n) => n.toLocaleString("en-US");
const ป้าย = (c) => c.มี ? `${กลุ่ม(c.ไฟล์)} ไฟล์ · ${กลุ่ม(c.ขนาด)} ไบต์${c.ลิงก์ ? ` · ทางลัด ${กลุ่ม(c.ลิงก์)}` : ""}` : "—";

/** ฐาน supabase ในโฟลเดอร์ (project_id จาก supabase/config.toml) */
const รหัสโปรเจกต์ = (ที่) => { try { return readFileSync(path.join(ที่, "supabase/config.toml"), "utf8").match(/^\s*project_id\s*=\s*"([^"]+)"/m)?.[1] ?? ""; } catch { return ""; } };
const ฐานรันอยู่ = (id) => { const r = spawnSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" }); return r.status === 0 && r.stdout.split(/\r?\n/).includes(`supabase_db_${id}`); };
const supabase = (คำสั่ง, ที่, หลัก) => spawnSync("npx", ["supabase", คำสั่ง, "--workdir", ที่], { cwd: หลัก, stdio: "inherit", shell: process.platform === "win32" });

/** ย้ายโฟลเดอร์ที่มีทางลัด: จดทางลัด → ถอด → ย้าย (ทำ()) → สร้างคืน (ปลายทางที่อยู่ในโฟลเดอร์เดิมเปลี่ยนเป็นที่ใหม่) */
export function ย้ายพร้อมทางลัด(เดิม, ใหม่, ทำ) {
  const ทางลัด = หาทางลัด(เดิม).map(x => ({ ที่: ทับ(x.ที่), ไป: ทับ(path.resolve(path.dirname(x.ที่), x.ไป)) }));
  const ถอดไม่ได้ = ถอดทางลัดทั้งหมด(เดิม);
  if (ถอดไม่ได้.length) throw new Error(`ถอดทางลัดไม่หมด ${ถอดไม่ได้.length} ตัวใน ${เดิม} — ไม่ย้าย: ${ถอดไม่ได้.slice(0, 3).join(" · ")}`);
  ทำ();
  const แทน = (p) => อยู่ใน(p, เดิม) ? ทับ(ใหม่) + p.slice(ทับ(เดิม).length) : p;
  let สร้าง = 0;
  for (const x of ทางลัด) {
    const ที่ = แทน(x.ที่), ไป = แทน(x.ไป);
    mkdirSync(path.dirname(ที่), { recursive: true });
    symlinkSync(ไป, ที่, "junction");
    สร้าง++;
  }
  return { ทางลัด: ทางลัด.length, สร้าง };
}

/** แก้ที่อยู่โฟลเดอร์ในทะเบียนเซสชัน (pms-sessions.json + .pms-session.json) ตามคู่ เดิม→ใหม่ */
export function แก้ทะเบียน(หลัก, คู่) {
  const แทน = (p) => { for (const [เก่า, ใหม่] of คู่) if (อยู่ใน(p, เก่า)) return ทับ(ใหม่) + ทับ(path.resolve(p)).slice(ทับ(path.resolve(เก่า)).length); return p; };
  const ทะเบียน = path.resolve(หลัก, gitที่(หลัก)("rev-parse", "--git-common-dir"), "pms-sessions.json");
  let แก้ = 0;
  if (existsSync(ทะเบียน)) {
    const t = JSON.parse(readFileSync(ทะเบียน, "utf8"));
    for (const s of Object.values(t)) if (s?.โฟลเดอร์) { const n = แทน(s.โฟลเดอร์); if (n !== s.โฟลเดอร์) { s.โฟลเดอร์ = n; แก้++; } }
    writeFileSync(ทะเบียน, JSON.stringify(t, null, 1) + "\n");
    for (const s of Object.values(t)) {
      const f = s?.โฟลเดอร์ && path.join(s.โฟลเดอร์, ".pms-session.json");
      if (!f || !existsSync(f)) continue;
      const x = JSON.parse(readFileSync(f, "utf8"));
      if (x.โฟลเดอร์ !== s.โฟลเดอร์) { x.โฟลเดอร์ = s.โฟลเดอร์; writeFileSync(f, JSON.stringify(x, null, 1) + "\n"); }
    }
  }
  return แก้;
}

const ป้ายตัวส่งต่อ = "// ตัวส่งต่อ (scripts/move-local.mjs";
/** ที่เดิมเหลือแค่ตัวส่งต่อที่ตัวย้ายวางไว้ = ย้ายแล้ว (ไม่ใช่ชนกัน) */
export function เป็นตัวส่งต่อ(ที่) {
  try { const n = readdirSync(ที่); return n.length === 1 && n[0] === "registry.mjs" && readFileSync(path.join(ที่, "registry.mjs"), "utf8").startsWith(ป้ายตัวส่งต่อ); } catch { return false; }
}

/** ตัวส่งต่อที่ที่เดิมของทะเบียนบทบาท (settings ของบอสยังเรียก <เดิม>/registry.mjs) */
export function วางตัวส่งต่อ(เดิม, ใหม่) {
  mkdirSync(เดิม, { recursive: true });
  writeFileSync(path.join(เดิม, "registry.mjs"),
    `${ป้ายตัวส่งต่อ} · ${new Date().toISOString().slice(0, 10)}): ทะเบียนบทบาทย้ายไป ${ทับ(ใหม่)}/registry.mjs\n` +
    "//   ลบโฟลเดอร์นี้ได้หลังบอสแก้ hook ใน settings ให้ชี้ที่ใหม่แล้ว\n" +
    `await import(${JSON.stringify(pathToFileURL(path.join(ใหม่, "registry.mjs")).href)});\n`);
}

export function ย้าย(แผน, หลัก = โฟลเดอร์หลัก(), { พิมพ์ = console.log } = {}) {
  const ทำ = แผน.filter(x => ["worktree", "ที่เก็บเซสชัน", "ทั้งโฟลเดอร์"].includes(x.วิธี));
  const ก่อน = Object.fromEntries(ทำ.map(x => [x.ชื่อ, นับ(x.เดิม)]));
  mkdirSync(รากLocal(หลัก), { recursive: true });
  const git = gitที่(หลัก);
  // 2) หยุดฐานที่รันอยู่ (ไม่ลบ volume)
  const หยุด = [];
  for (const x of ทำ) {
    const id = รหัสโปรเจกต์(x.เดิม);
    if (id && ฐานรันอยู่(id)) {
      พิมพ์(`▶ หยุดฐาน ${id} (${x.เดิม}) — ข้อมูลใน volume อยู่ครบ`);
      if (supabase("stop", x.เดิม, หลัก).status !== 0) throw new Error(`หยุดฐาน ${id} ไม่สำเร็จ — ยังไม่ย้ายโฟลเดอร์นี้และที่เหลือ`);
      หยุด.push({ id, ใหม่: x.ใหม่ });
    }
  }
  const wts = รายการworktree(หลัก);
  const คู่ = [];
  for (const x of ทำ) {
    if (x.วิธี === "worktree") {
      ย้ายพร้อมทางลัด(x.เดิม, x.ใหม่, () => git("worktree", "move", x.เดิม, x.ใหม่));
    } else if (x.วิธี === "ที่เก็บเซสชัน") {
      mkdirSync(x.ใหม่, { recursive: true });
      for (const n of readdirSync(x.เดิม)) {
        const จาก = ทับ(path.join(x.เดิม, n)), ไป = ทับ(path.join(x.ใหม่, n));
        if (wts.some(w => ปกติ(w) === ปกติ(จาก))) ย้ายพร้อมทางลัด(จาก, ไป, () => git("worktree", "move", จาก, ไป));
        else if (lstatSync(จาก).isDirectory() && หาทางลัด(จาก).length) ย้ายพร้อมทางลัด(จาก, ไป, () => renameSync(จาก, ไป));
        else renameSync(จาก, ไป);
      }
      rmdirSync(x.เดิม);
    } else {
      renameSync(x.เดิม, x.ใหม่);   // prod-backups/prod-secrets: ย้ายทั้งโฟลเดอร์ ไม่เปิดไฟล์ข้างใน
    }
    คู่.push([x.เดิม, x.ใหม่]);
    พิมพ์(`✓ ${x.เดิม} → ${x.ใหม่}`);
  }
  const หลัง = Object.fromEntries(ทำ.map(x => [x.ชื่อ, นับ(x.ใหม่)]));   // นับก่อนแก้ทะเบียน (แก้ .pms-session.json = ขนาดเปลี่ยนโดยตั้งใจ)
  const แก้ = แก้ทะเบียน(หลัก, คู่);
  const ทะเบียนบทบาท = ทำ.find(x => x.ชื่อ === "session-registry");
  if (ทะเบียนบทบาท) วางตัวส่งต่อ(ทะเบียนบทบาท.เดิม, ทะเบียนบทบาท.ใหม่);
  for (const { id, ใหม่ } of หยุด) {
    พิมพ์(`▶ เปิดฐาน ${id} คืน (${ใหม่})`);
    if (supabase("start", ใหม่, หลัก).status !== 0) พิมพ์(`⚠️ เปิดฐาน ${id} ไม่สำเร็จ — เปิดเอง: npx supabase start --workdir ${ใหม่}`);
  }
  return { ทำ, ก่อน, หลัง, แก้ทะเบียน: แก้, ตัวส่งต่อ: ทะเบียนบทบาท ? ทะเบียนบทบาท.เดิม : "" };
}

function หลักโปรแกรม() {
  const จริง = process.argv.includes("--ย้าย");
  const หลัก = โฟลเดอร์หลัก(process.cwd());
  const แผน = วางแผน(หลัก);
  console.log(`${จริง ? "ย้ายจริง" : "ดูอย่างเดียว (ไม่แตะอะไร · ย้ายจริงใส่ --ย้าย)"} · ที่ใหม่ ${รากLocal(หลัก)}`);
  for (const x of แผน) {
    const c = x.วิธี === "ไม่มี" ? null : นับ(x.วิธี === "ย้ายแล้ว" ? x.ใหม่ : x.เดิม);
    console.log(`  ${x.เดิม || "(ไม่มีที่เดิม)"} → ${x.ใหม่} · ${x.วิธี}${x.ห้ามเปิด ? " · ไม่เปิดไฟล์ข้างใน" : ""}${c ? ` · ${ป้าย(c)}` : ""}`);
  }
  const เหตุ = ตรวจก่อนย้าย(แผน, หลัก);
  if (เหตุ.length) { console.log(`\n⛔ ยังย้ายไม่ได้ ${เหตุ.length} ข้อ:`); for (const x of เหตุ) console.log(`  ✗ ${x}`); }
  if (!จริง) { console.log(เหตุ.length ? "" : "\n✓ ย้ายได้ — รันซ้ำพร้อม --ย้าย (บอสหรือคนรวมงาน)"); process.exit(เหตุ.length ? 1 : 0); }
  if (เหตุ.length) process.exit(1);
  const ผล = ย้าย(แผน, หลัก);
  console.log("\nจำนวนไฟล์ก่อน/หลัง:");
  let ไม่เท่า = 0;
  for (const x of ผล.ทำ) {
    const ก = ผล.ก่อน[x.ชื่อ], ห = ผล.หลัง[x.ชื่อ];
    const เท่า = ก.ไฟล์ === ห.ไฟล์ && ก.ขนาด === ห.ขนาด && ก.ลิงก์ === ห.ลิงก์;
    if (!เท่า) ไม่เท่า++;
    console.log(`  ${เท่า ? "✓" : "✗"} ${x.ชื่อ}: ก่อน ${ป้าย(ก)} · หลัง ${ป้าย(ห)}`);
  }
  console.log(`\nแก้ที่อยู่ในทะเบียนเซสชัน ${ผล.แก้ทะเบียน} รายการ`);
  if (ผล.ตัวส่งต่อ) {
    const ใหม่ = ทับ(path.join(รากLocal(หลัก), "session-registry", "registry.mjs"));
    console.log(`\nทะเบียนบทบาท: วางตัวส่งต่อไว้ที่ ${ผล.ตัวส่งต่อ}/registry.mjs แล้ว (ใช้ต่อได้ทันที)`);
    console.log("บอสแก้ hook ใน settings 2 บรรทัด (AI แก้ settings ไม่ได้) — เปลี่ยนที่อยู่ในคำสั่งเป็น:");
    console.log(`  node ${ใหม่} ...   (เดิม node ${ผล.ตัวส่งต่อ}/registry.mjs ...)`);
  }
  process.exit(ไม่เท่า ? 1 : 0);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) หลักโปรแกรม();
