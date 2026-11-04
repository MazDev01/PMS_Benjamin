// ── ทางเดียวที่ใช้ขึ้นใบแก้ฐานข้อมูลไป "ชุดจริง" ───────────────────────────────────────
//
// ทำไมต้องมี (12 ต.ค. 69 · ตัวกันชั้น 2):
//   เดิม CLI ผูกค้างกับฐานจริง → `npx supabase db push` เฉย ๆ ก็ลงฐานจริง
//   ตอนนี้ค่าปกติของเครื่องคือ "ไม่ผูก" (push ตรง ๆ จะล้มเพราะไม่รู้ปลายทาง)
//   ตัวนี้ผูก → ขึ้น → ปลดผูกให้เองในคำสั่งเดียว
//
// ขั้นตอนทุกครั้ง (บอสสั่ง 20 ต.ค. 69 หลังเหตุสำรองชนกับ db:push ตอน 09:32 — "แก้ที่เครื่องมือ ไม่ใช่ที่คน"):
//   1) ขอล็อก — มีการสำรอง/ซ้อมกู้/db:push อีกตัวรันกับฐานจริงอยู่ = หยุดทันที บอกว่ารออะไร (scripts/lib/prodLock.mjs)
//   2) สำรองเต็ม (โครง + ข้อมูล + ผู้ใช้ + ประวัติใบ) → ซ้อมกู้ลงฐานเปล่า → เทียบทุกตาราง (scripts/prod-backup-verify.mjs)
//      ไม่ตรงแม้ตารางเดียว = หยุด ไม่ลงใบ บอกเหตุผลภาษาไทย
//   3) ผูกฐานจริง → รายชื่อใบที่จะลง (db push --dry-run · ยังไม่แตะฐาน) → ด่านพิมพ์เลขใบ → supabase db push --yes → ปลดผูก
//
// ด่านพิมพ์เลขใบ (บอสสั่ง 4 พ.ย. 69 · เหตุจริง: ใบ 0275 ลงฐานจริงเพราะกด Enter ที่ตัวถาม [Y/n] ของ CLI — ค่าตั้งต้นของ CLI คือ "ลง")
//   ต้องพิมพ์เลขใบสุดท้ายที่จะลง (เช่น 0276 · หลายใบ = เลขใบสุดท้ายในรายการที่ขึ้นจอ) ถึงจะลง
//   Enter เฉย ๆ / Y / yes / เลขผิด / Ctrl+C / ไม่มีคำตอบ = ไม่ลง · ผ่านด่านแล้วสั่ง CLI ด้วย --yes (ตัวถามของ CLI ไม่ใช่ด่านอีกต่อไป)
// บันทึกทุกครั้งที่รัน (บอสสั่ง 4 พ.ย. 69): <PMS_BACKUP_ROOT>/db-push-log.jsonl ต่อท้ายบรรทัดละครั้ง (PMS_PUSH_LOG แทนได้)
//   { เริ่ม, จบ, ผล: ลง/ไม่ลง/ตก/หยุดกลางทาง, เหตุ, ใบ, ชุดสำรอง, ผู้ใช้, เครื่อง, โฟลเดอร์, โหมด, pid, exit }
//   เขียนตอนโปรเซสจบเสมอ — รวมไม่ผ่านด่านใบ/ขอล็อกไม่ได้ (ตัวช่วยสั่ง exit เอง)/สำรองตก/กด Ctrl+C กลางทาง
//
// รัน: npm run db:push:prod -- --yes-prod            (ขึ้นจริง)
//      npm run db:push:prod -- --yes-prod --dry-run  (ดูว่าจะขึ้นใบไหน ไม่แตะฐาน · ไม่ต้องสำรอง แต่ยังขอล็อก)
//
// โหมดทดสอบตัวเครื่องมือ (PMS_PUSH_TEST=1 · tests/tools/db-push-prod-guard.test.mjs): ไม่แตะฐานจริงเลย
//   สำรอง/ซ้อมกู้ใช้ฐานทดสอบในเครื่อง · ขั้นลงใบเปลี่ยนเป็นเขียนไฟล์บันทึก PMS_PUSH_TEST_MARKER ว่า "ถึงขั้นลงใบแล้ว"
//   ใบที่จะลง (แทนผล dry-run ของฐานจริง) = PMS_PUSH_TEST_PENDING (ชื่อไฟล์คั่นด้วย ,) · ไม่ใส่ = ใบล่าสุดในโฟลเดอร์ใบ
//   ด่านพิมพ์เลขใบทำงานเหมือนของจริง (อ่านคำตอบจาก stdin)
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { once } from "node:events";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { loadTarget } from "./lib/targetEnv.mjs";
import { ขอล็อก } from "./lib/prodLock.mjs";
import { ตรวจใบก่อนลง, ข้อความไม่ผ่าน, โฟลเดอร์ใบ } from "./lib/migrationGate.mjs";

const args = process.argv.slice(2);
const ทดสอบ = process.env.PMS_PUSH_TEST === "1";
const dry = args.includes("--dry-run");

// ── บันทึกการรัน: เขียนตอนโปรเซสจบเสมอ (process.exit จากตัวช่วยใด ๆ ก็ผ่าน "exit") ──
const ไฟล์บันทึก = process.env.PMS_PUSH_LOG
  || path.join(process.env.PMS_BACKUP_ROOT || "C:/.claude/pms-prod-backups", "db-push-log.jsonl");
const บันทึก = {
  เริ่ม: new Date().toISOString(), จบ: null, ผล: "ตก", เหตุ: "จบก่อนถึงขั้นลงใบ", ใบ: [], ชุดสำรอง: null,
  ผู้ใช้: (() => { try { return os.userInfo().username; } catch { return process.env.USERNAME ?? null; } })(),
  เครื่อง: os.hostname(), โฟลเดอร์: process.cwd(), โหมด: ทดสอบ ? "ทดสอบเครื่องมือ" : dry ? "ดูอย่างเดียว" : "ฐานจริง",
  pid: process.pid, exit: null,
};
const ตั้งผล = (ผล, เหตุ) => { บันทึก.ผล = ผล; บันทึก.เหตุ = เหตุ; };
process.on("exit", code => {
  บันทึก.จบ = new Date().toISOString(); บันทึก.exit = code;
  try {
    mkdirSync(path.dirname(ไฟล์บันทึก), { recursive: true });
    appendFileSync(ไฟล์บันทึก, JSON.stringify(บันทึก) + "\n");
    console.log(`📝 บันทึกการรันแล้ว (${บันทึก.ผล}) → ${ไฟล์บันทึก}`);
  } catch (e) { console.error(`⚠️ เขียนบันทึกการรันไม่ได้ (${ไฟล์บันทึก}): ${e.message}`); }
});

if (!ทดสอบ && !args.includes("--yes-prod")) {
  console.error("❌ คำสั่งนี้แก้โครงฐานข้อมูลชุดจริง — ต้องใส่ --yes-prod เพื่อยืนยันว่าตั้งใจ");
  ตั้งผล("ไม่ลง", "ไม่ได้ใส่ --yes-prod");
  process.exit(1);
}
if (ทดสอบ) console.log("🧪 โหมดทดสอบเครื่องมือ — ไม่แตะฐานจริง (สำรอง/ซ้อมกู้ใช้ฐานทดสอบในเครื่อง · ไม่ลงใบจริง)");

// ⓪ ใบปรับฐานทุกใบต้องผ่านรอบตรวจเต็มแล้ว และไม่ถูกแก้หลังรอบตรวจ (บอสสั่ง 21 ต.ค. 69 · scripts/lib/migrationGate.mjs)
//    ตรวจก่อนขอล็อก/ก่อนแตะฐานจริง — ไม่ผ่าน = หยุดทันที ไม่สำรอง ไม่ลงใบ
{
  const { ผ่าน, ไม่ผ่าน } = ตรวจใบก่อนลง();
  if (!ผ่าน) {
    console.error("\n❌ หยุด ไม่ลงใบ — มีใบปรับฐานที่ยังไม่ผ่านรอบตรวจเต็ม:");
    for (const บรรทัด of ข้อความไม่ผ่าน(ไม่ผ่าน)) console.error(`   ${บรรทัด}`);
    console.error("   รันรอบตรวจเต็ม (npm run test:prodbuild) ให้ผ่าน ตก 0 แล้วสั่ง db:push:prod ใหม่");
    บันทึก.ใบ = ไม่ผ่าน.map(x => x.ไฟล์);
    ตั้งผล("ไม่ลง", "มีใบยังไม่ผ่านรอบตรวจเต็ม");
    process.exit(4);
  }
  console.log("✓ ใบปรับฐานทุกใบผ่านรอบตรวจเต็มแล้ว และไม่ถูกแก้หลังรอบตรวจ");
}
const { ref } = ทดสอบ ? { ref: "" } : loadTarget({ ถือล็อกเอง: true });   // พิมพ์ "🎯 ฐานข้อมูลที่จะแตะ" ให้เห็นก่อน · ขอล็อกเองบรรทัดถัดไป (ไม่รอคิว — ชน = หยุดบอกเหตุ)

ตั้งผล("ไม่ลง", "ขอล็อกฐานจริงไม่ได้ (มีงานอื่นรันอยู่)");   // ขอล็อกไม่ได้ = ตัวช่วยสั่ง exit 3 เอง
const ล็อก = ขอล็อก(dry ? "db:push:prod (ดูอย่างเดียว)" : "db:push:prod");
ตั้งผล("ตก", "จบก่อนถึงขั้นลงใบ");
const envลูก = { ...process.env, PMS_PROD_LOCK_HELD: ล็อก.token };
// node เรียกตรงไม่ผ่าน shell (ไม่ต้องพึ่ง cmd.exe · ไม่มีคำเตือน DEP0190) — ชื่อโฟลเดอร์ภาษาไทยที่หายเคยโทษ shell แต่ต้นเหตุจริงอยู่ที่ตัวอ่านคำสั่ง (lib/backupArgs.mjs)
//   npx ต้องผ่าน shell บน Windows (เป็นไฟล์ .cmd)
const รัน = (cmd, a) => {
  const r = cmd === "node"
    ? spawnSync(process.execPath, a, { stdio: "inherit", shell: false, env: envลูก })
    : spawnSync(cmd, a, { stdio: "inherit", shell: true, env: envลูก });
  if (r.error) console.error(`   เรียกโปรแกรม ${cmd} ไม่ได้ (${r.error.code ?? r.error.message})`);
  return r.status === 0;
};
/** รันแล้วเก็บผล (ยังพิมพ์ขึ้นจอให้เห็น) — ใช้กับ db push --dry-run ที่ต้องอ่านรายชื่อใบ */
const รันเก็บผล = (cmd, a) => {
  const r = spawnSync(cmd, a, { encoding: "utf8", shell: true, env: envลูก, maxBuffer: 1 << 26 });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  process.stdout.write(out);
  return { ok: r.status === 0, out };
};
/** ชื่อใบ (NNNN_ชื่อ.sql) ที่ขึ้นในผล dry-run — ไม่ซ้ำ เรียงตามเลข */
const ใบจากผล = (out) => [...new Set([...out.matchAll(/\b(\d{4}_[^\s'"•]+?\.sql)/g)].map(m => m[1]))].sort();

/** ด่านพิมพ์เลขใบ — ผ่านเมื่อพิมพ์เลขใบสุดท้ายตรงเท่านั้น · Enter/Y/เลขผิด/Ctrl+C/ไม่มีคำตอบ = ไม่ผ่าน */
async function ด่านพิมพ์เลข(ใบ) {
  const เลข = ใบ.at(-1).slice(0, 4);
  console.log(`\n⚠️ จะลงใบ ${ใบ.length} ใบกับฐาน${ทดสอบ ? " (โหมดทดสอบ)" : "จริง"}:`);
  for (const f of ใบ) console.log(`   • ${f}`);
  console.log(`   ยืนยัน = พิมพ์เลขใบสุดท้าย "${เลข}" แล้วกด Enter · กด Enter เฉย ๆ / Y / อย่างอื่น = ไม่ลง`);
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
  const คำตอบ = String(await Promise.race([
    rl.question(`   พิมพ์เลขใบ (${เลข}): `),
    once(rl, "close").then(() => ""),
    once(rl, "SIGINT").then(() => ""),
  ]).catch(() => "")).trim();
  rl.close();
  const ตรง = คำตอบ === เลข;
  if (!ตรง) console.log(`\n✋ ไม่ลงใบ — คำตอบ "${คำตอบ}" ไม่ใช่เลขใบ ${เลข}`);
  return { ตรง, คำตอบ, เลข };
}
const ปลดผูก = () => {
  if (ทดสอบ) return;
  for (const f of ["project-ref", "linked-project.json", "pooler-url"]) rmSync(`supabase/.temp/${f}`, { force: true });
  console.log("\n🔓 ปลดการผูก CLI ออกจากฐานจริงแล้ว");
};

let ok = false;
// Ctrl+C ระหว่างทาง (สำรอง/ผูก/ลงใบ) = ปลดผูก + ปล่อยล็อก + บันทึก "หยุดกลางทาง"
process.on("SIGINT", () => {
  ตั้งผล("หยุดกลางทาง", `กด Ctrl+C ระหว่าง: ${บันทึก.เหตุ}`);
  try { ปลดผูก(); } finally { ล็อก.release(); process.exit(130); }
});
try {
  if (!dry) {
    console.log("\n① สำรองเต็ม + ซ้อมกู้ ก่อนลงใบ");
    const ชื่อ = `${new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 19).replace(/[:T]/g, "-")}-ก่อน-db-push`;   // มีวินาที — สั่งซ้ำในนาทีเดียวกันไม่ชนชื่อเดิม
    บันทึก.ชุดสำรอง = ชื่อ;
    บันทึก.เหตุ = "สำรอง/ซ้อมกู้";
    if (!รัน("node", ["scripts/prod-backup-verify.mjs", ...(ทดสอบ ? ["--target", "local"] : []), ชื่อ])) {
      throw new Error("สำรองหรือซ้อมกู้ไม่ผ่าน — ไม่ลงใบ (เหตุผลอยู่ข้างบน) · แก้ให้ผ่านก่อนแล้วสั่งใหม่");
    }
  }
  // ② รายชื่อใบที่จะลง
  let ใบ;
  if (ทดสอบ) {
    ใบ = (process.env.PMS_PUSH_TEST_PENDING ?? readdirSync(โฟลเดอร์ใบ()).filter(n => /^\d{4}_.*\.sql$/.test(n)).sort().slice(-1).join(","))
      .split(",").map(x => x.trim()).filter(Boolean).sort();
  } else {
    console.log("\n② ผูกฐานจริง → รายชื่อใบที่จะลง (db push --dry-run · ยังไม่แตะฐาน)");
    บันทึก.เหตุ = "ผูกฐานจริง/ดูรายชื่อใบ";
    if (!รัน("npx", ["supabase", "link", "--project-ref", ref])) throw new Error("ผูกโปรเจกต์ไม่สำเร็จ");
    const ดู = รันเก็บผล("npx", ["supabase", "db", "push", "--dry-run"]);
    if (!ดู.ok) throw new Error("ดูรายชื่อใบที่จะลงไม่สำเร็จ — ไม่ลงใบ");
    const ครบแล้ว = /up to date/i.test(ดู.out);
    ใบ = ครบแล้ว ? [] : ใบจากผล(ดู.out);
    if (!ใบ.length && !ครบแล้ว) throw new Error("อ่านรายชื่อใบที่จะลงจากผล dry-run ไม่ได้ — ไม่ลงใบ (ดูผลข้างบน)");
  }
  บันทึก.ใบ = ใบ;
  if (!ใบ.length) {
    console.log("\n✓ ฐานมีใบครบแล้ว — ไม่มีใบให้ลง");
    ตั้งผล("ไม่ลง", "ไม่มีใบให้ลง");
    ok = true;
  } else if (dry) {
    console.log(`\n(ดูอย่างเดียว) ไม่ลงใบ — ที่จะลง: ${ใบ.join(", ")}`);
    ตั้งผล("ไม่ลง", "ดูอย่างเดียว (--dry-run)");
    ok = true;
  } else {
    // ③ ด่านพิมพ์เลขใบ — ด่านจริงด่านเดียว (CLI ได้ --yes หลังผ่านด่านนี้)
    บันทึก.เหตุ = "รอพิมพ์เลขใบ";
    const ด่าน = await ด่านพิมพ์เลข(ใบ);
    if (!ด่าน.ตรง) {
      ตั้งผล("ไม่ลง", `พิมพ์ "${ด่าน.คำตอบ}" ไม่ใช่เลขใบ ${ด่าน.เลข}`);
    } else if (ทดสอบ) {
      writeFileSync(process.env.PMS_PUSH_TEST_MARKER || "push-test-marker.txt", `ถึงขั้นลงใบ ${new Date().toISOString()}`);
      console.log("🧪 (โหมดทดสอบ) ผ่านด่านพิมพ์เลขใบ ถึงขั้นลงใบแล้ว — ไม่ได้ลงจริง");
      ตั้งผล("ลง", "โหมดทดสอบ (ไม่ได้ลงจริง)");
      ok = true;
    } else {
      console.log(`\n③ ลงใบ ${ใบ.length} ใบ (พิมพ์เลข ${ด่าน.เลข} ยืนยันแล้ว)`);
      บันทึก.เหตุ = "กำลังลงใบ";
      ok = รัน("npx", ["supabase", "db", "push", "--yes"]);
      if (ok) ตั้งผล("ลง", `ลงใบ ${ใบ.length} ใบสำเร็จ`);
      else ตั้งผล("ตก", "supabase db push ไม่สำเร็จ (ดูข้อความข้างบน)");
    }
  }
} catch (e) {
  console.error(`\n❌ ${e.message}`);
  ตั้งผล("ตก", e.message);
} finally {
  ปลดผูก();
  ล็อก.release();
}
process.exit(ok ? 0 : 1);
