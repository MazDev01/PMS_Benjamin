// ── git pre-push: กัน push ขึ้น monorepo (= ขึ้นเว็บจริงทันทีผ่าน Vercel) ก่อนพร้อม (บอสสั่ง 22 ต.ค. 69) ─────────────────
//
// push ไป monorepo ได้เมื่อ (scripts/lib/commitGate.mjs)
//   1) commit ที่จะ push มีผลรอบตรวจเต็มผ่าน (หรือต่อจาก commit ที่ผ่านโดยเพิ่มแค่ไฟล์บันทึกของรอบตรวจ)
//   2) ฐานจริงมีใบปรับฐานครบทุกใบใน commit นั้น — ถามฐานจริงแบบอ่านอย่างเดียว · ถามไม่ได้ = ไม่ให้ push
// ลบ monorepo บนเครื่องปลายทางก็ไม่ให้ · branch อื่น (wip/* ฯลฯ) push ได้ตามปกติ
// ติดตั้ง: npm run hooks:install (ตั้ง core.hooksPath = .githooks) · ห้ามข้ามด้วย --no-verify
// ข้อทดสอบ: tests/tools/pre-push-guard.test.mjs (remote ปลอม — ค่าทดสอบ PMS_PROD_VERSIONS_FILE ใช้ได้เฉพาะ remote ที่ไม่ใช่ GitHub)
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { ตรวจcommitผ่าน, ใบในcommit } from "../lib/commitGate.mjs";

const [, , remoteName = "", remoteUrl = ""] = process.argv;
const สาขาที่ขึ้นเว็บจริง = "refs/heads/monorepo";
const ศูนย์ = /^0+$/;
const ของจริง = /github\.com/i.test(remoteUrl);

const คำขอ = readFileSync(0, "utf8").split(/\r?\n/).filter(Boolean)
  .map(l => { const [localRef, localSha, remoteRef, remoteSha] = l.split(" "); return { localRef, localSha, remoteRef, remoteSha }; })
  .filter(x => x.remoteRef === สาขาที่ขึ้นเว็บจริง);
if (!คำขอ.length) process.exit(0);   // ไม่ได้แตะ monorepo — push ได้ตามปกติ

const ปฏิเสธ = (บรรทัด) => {
  console.error(`\n⛔ ไม่ให้ push ขึ้น monorepo (${remoteName}) — monorepo = ขึ้นเว็บจริงทันที`);
  for (const b of บรรทัด) console.error(`   ${b}`);
  console.error("   push ไป wip/* ได้ตามปกติ · ห้ามข้ามด้วย --no-verify\n");
  process.exit(1);
};

/** ใบปรับฐานที่ลงฐานจริงแล้ว (อ่านอย่างเดียว) · คืน null = ถามไม่ได้ */
function ใบบนฐานจริง() {
  if (!ของจริง && process.env.PMS_PROD_VERSIONS_FILE) {
    try { return JSON.parse(readFileSync(process.env.PMS_PROD_VERSIONS_FILE, "utf8")); } catch { return null; }
  }
  const ที่ = process.env.PMS_PROD_OPS_DIR ?? "C:/.claude/pms-prod-ops";
  const d = mkdtempSync(path.join(tmpdir(), "pms-prepush-"));
  try {
    const q = path.join(d, "q.sql");
    writeFileSync(q, "select version from supabase_migrations.schema_migrations order by version;\n");
    const r = spawnSync("npx", ["supabase", "db", "query", "--linked", "-f", q, "--output-format", "json"],
      { cwd: ที่, encoding: "utf8", shell: true, timeout: 120_000 });
    if (r.status !== 0) return null;
    const j = JSON.parse(r.stdout.slice(r.stdout.indexOf("{")));
    return (j.rows ?? []).map(x => String(x.version));
  } catch { return null; } finally { rmSync(d, { recursive: true, force: true }); }
}

for (const x of คำขอ) {
  if (ศูนย์.test(x.localSha)) ปฏิเสธ(["ห้ามลบ monorepo บนปลายทาง"]);
  const ผล = ตรวจcommitผ่าน(x.localSha);
  if (!ผล.ผ่าน) ปฏิเสธ([ผล.เหตุ]);
  const ในโค้ด = ใบในcommit(x.localSha);
  const บนฐาน = ใบบนฐานจริง();
  if (!บนฐาน) ปฏิเสธ(["ตรวจใบปรับฐานบนฐานจริงไม่ได้ (ต่อฐานจริงไม่ได้/ไม่ได้ผูก C:/.claude/pms-prod-ops) — ไม่รู้ว่าใบลงครบไหม จึงไม่ให้ push"]);
  const ยังไม่ลง = ในโค้ด.filter(v => !บนฐาน.includes(v));
  if (ยังไม่ลง.length) ปฏิเสธ([`ใบปรับฐานยังไม่ลงฐานจริง ${ยังไม่ลง.length} ใบ: ${ยังไม่ลง.join(", ")}`,
    "ให้บอสรัน npm run db:push:prod ลงใบก่อน แล้วค่อย push ขึ้นเว็บ"]);
  console.log(`✓ push ขึ้น monorepo ได้ — ${x.localSha.slice(0, 7)} ผ่านรอบตรวจเต็ม (${(ผล.จาก ?? "").slice(0, 7)}) · ใบปรับฐาน ${ในโค้ด.length} ใบลงฐานจริงครบ`);
}
process.exit(0);
