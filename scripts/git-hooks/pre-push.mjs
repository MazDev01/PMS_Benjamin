// ── git pre-push: กัน push ขึ้น monorepo (= ขึ้นเว็บจริงทันทีผ่าน Vercel) ก่อนพร้อม (บอสสั่ง 22 ต.ค. 69) ─────────────────
//
// เซสชันลูก (มี .pms-session.json): push ได้เฉพาะ session/<ชื่อ> ของตัวเอง — wip/* · monorepo · main = คนรวมงานเท่านั้น
// คนรวมงาน (โฟลเดอร์หลัก): push ไป monorepo ได้เมื่อ (scripts/lib/commitGate.mjs)
//   1) commit ที่จะ push มีผลรอบตรวจเต็มผ่าน (ลายนิ้วมือโค้ดอยู่ใน supabase/gate-passed-code.txt ของ commit นั้น)
//   2) ฐานจริงมีใบปรับฐานครบทุกใบใน commit นั้น — ถามฐานจริงแบบอ่านอย่างเดียว · ถามไม่ได้ = ไม่ให้ push
//      (บอกเหตุที่ถามไม่ได้ + วิธีแก้เป็นขั้นตอน — บอสสั่ง 29 ต.ค. 69)
// ลบ monorepo บนเครื่องปลายทางก็ไม่ให้ · branch อื่น (wip/* ฯลฯ) push ได้ตามปกติ
// ติดตั้ง: npm run hooks:install (ตั้ง core.hooksPath = .githooks) · ห้ามข้ามด้วย --no-verify
// ข้อทดสอบ: tests/tools/pre-push-guard.test.mjs (remote ปลอม — ค่าทดสอบ PMS_PROD_VERSIONS_FILE ใช้ได้เฉพาะ remote ที่ไม่ใช่ GitHub)
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { ตรวจcommitผ่าน, ใบในcommit } from "../lib/commitGate.mjs";
import { อ่านเซสชัน } from "../lib/session.mjs";

const [, , remoteName = "", remoteUrl = ""] = process.argv;
const สาขาที่ขึ้นเว็บจริง = "refs/heads/monorepo";
const ศูนย์ = /^0+$/;
const ของจริง = /github\.com/i.test(remoteUrl);

const ทั้งหมด = readFileSync(0, "utf8").split(/\r?\n/).filter(Boolean)
  .map(l => { const [localRef, localSha, remoteRef, remoteSha] = l.split(" "); return { localRef, localSha, remoteRef, remoteSha }; });

// เซสชันลูก: push ได้เฉพาะ branch ของตัวเอง
const เซสชัน = อ่านเซสชัน(process.cwd());
if (เซสชัน) {
  const ของตัวเอง = `refs/heads/session/${เซสชัน.ชื่อ}`;
  const ผิดที่ = ทั้งหมด.filter(x => x.remoteRef !== ของตัวเอง);
  if (ผิดที่.length) {
    console.error(`\n⛔ เซสชัน ${เซสชัน.ชื่อ} push ได้เฉพาะ session/${เซสชัน.ชื่อ} — ไม่ให้ push ไป ${ผิดที่.map(x => x.remoteRef.replace("refs/heads/", "")).join(", ")}`);
    console.error("   รวมงานเข้า wip/integration / monorepo = งานของคนรวมงานเท่านั้น (npm run session:merge) · ห้ามข้ามด้วย --no-verify\n");
    process.exit(1);
  }
  process.exit(0);
}

const คำขอ = ทั้งหมด.filter(x => x.remoteRef === สาขาที่ขึ้นเว็บจริง);
if (!คำขอ.length) process.exit(0);   // ไม่ได้แตะ monorepo — push ได้ตามปกติ

const ปฏิเสธ = (บรรทัด) => {
  console.error(`\n⛔ ไม่ให้ push ขึ้น monorepo (${remoteName}) — monorepo = ขึ้นเว็บจริงทันที`);
  for (const b of บรรทัด) console.error(`   ${b}`);
  console.error("   push ไป wip/* ได้ตามปกติ · ห้ามข้ามด้วย --no-verify\n");
  process.exit(1);
};

const ที่ฐานจริง = process.env.PMS_PROD_OPS_DIR ?? "C:/.claude/pms-prod-ops";

/** ใบปรับฐานที่ลงฐานจริงแล้ว (อ่านอย่างเดียว) · คืน { ใบ } หรือ { เหตุ } = ถามไม่ได้ (เหตุบอกว่าติดตรงไหน) */
function ใบบนฐานจริง() {
  if (!ของจริง && process.env.PMS_PROD_VERSIONS_FILE) {
    try { return { ใบ: JSON.parse(readFileSync(process.env.PMS_PROD_VERSIONS_FILE, "utf8")) }; } catch { return { เหตุ: "อ่านไฟล์ใบปลอมของข้อทดสอบไม่ได้" }; }
  }
  if (!existsSync(path.join(ที่ฐานจริง, "supabase/.temp/project-ref"))) return { เหตุ: `โฟลเดอร์ ${ที่ฐานจริง} ยังไม่ได้ผูกฐานจริง (ไม่มีโฟลเดอร์ หรือยังไม่ได้ supabase link)` };
  const d = mkdtempSync(path.join(tmpdir(), "pms-prepush-"));
  try {
    const q = path.join(d, "q.sql");
    writeFileSync(q, "select version from supabase_migrations.schema_migrations order by version;\n");
    const r = spawnSync("npx", ["supabase", "db", "query", "--linked", "-f", q, "--output-format", "json"],
      { cwd: ที่ฐานจริง, encoding: "utf8", shell: true, timeout: 120_000 });
    if (r.error?.code === "ETIMEDOUT" || r.signal) return { เหตุ: "ถามฐานจริงนานเกิน 2 นาทีจนหมดเวลา" };
    if (r.status !== 0) {
      const ผิด = `${r.stderr ?? ""}\n${r.stdout ?? ""}`;
      if (/access token|supabase login|not logged in|unauthorized|401/i.test(ผิด)) return { เหตุ: "terminal นี้ยังไม่ได้ล็อกอิน Supabase (ไม่มี access token)" };
      if (/not linked|project ref|supabase link/i.test(ผิด)) return { เหตุ: `โฟลเดอร์ ${ที่ฐานจริง} ยังไม่ได้ผูกฐานจริง` };
      return { เหตุ: `คำสั่งถามฐานจริงตก (รหัส ${r.status}): ${ผิด.trim().split(/\r?\n/).filter(Boolean).pop()?.slice(0, 200) ?? "ไม่มีข้อความ"}` };
    }
    const j = JSON.parse(r.stdout.slice(r.stdout.indexOf("{")));
    return { ใบ: (j.rows ?? []).map(x => String(x.version)) };
  } catch (e) { return { เหตุ: `อ่านคำตอบจากฐานจริงไม่ได้: ${String(e?.message ?? e).slice(0, 200)}` }; } finally { rmSync(d, { recursive: true, force: true }); }
}

/** ถามฐานจริงไม่ได้ → บอกวิธีแก้เป็นขั้นตอน (บอสสั่ง 29 ต.ค. 69: ไม่ใช่แค่บอกว่าต่อไม่ได้) */
const วิธีแก้ต่อฐานไม่ได้ = (เหตุ) => [
  `ตรวจใบปรับฐานบนฐานจริงไม่ได้ — ${เหตุ} · ไม่รู้ว่าใบลงครบไหม จึงไม่ให้ push`,
  "วิธีแก้ (ทำทีละขั้น แล้ว push ใหม่):",
  `  1. เปิด terminal แล้วไปที่โฟลเดอร์ทำงานกับฐานจริง:  cd ${ที่ฐานจริง}`,
  "  2. ทดลองถามฐานจริง:  npx supabase db query --linked \"select max(version) from supabase_migrations.schema_migrations\"",
  "  3. ข้อ 2 ขึ้นว่ายังไม่ได้ล็อกอิน / access token:  npx supabase login  (ล็อกอินในเบราว์เซอร์) แล้วกลับไปข้อ 2",
  "  4. ข้อ 2 ขึ้นว่ายังไม่ได้ผูกโปรเจกต์ (not linked) หรือไม่มีโฟลเดอร์:  npx supabase link --project-ref <รหัสโปรเจกต์ฐานจริง ดูใน C:/.claude/pms-prod-secrets/> แล้วกลับไปข้อ 2",
  "  5. ข้อ 2 รอนานเกิน 2 นาที:  รันซ้ำอีกครั้ง (ครั้งแรกเครื่องมืออาจโหลดนาน) · ยังค้าง = เน็ตหรือฐานจริงมีปัญหา แจ้งคนรวมงาน",
  "  6. ข้อ 2 ได้เลขใบล่าสุดแล้ว → push ใหม่จากโฟลเดอร์หลัก",
];

for (const x of คำขอ) {
  if (ศูนย์.test(x.localSha)) ปฏิเสธ(["ห้ามลบ monorepo บนปลายทาง"]);
  const ผล = ตรวจcommitผ่าน(x.localSha);
  if (!ผล.ผ่าน) ปฏิเสธ([ผล.เหตุ]);
  const ในโค้ด = ใบในcommit(x.localSha);
  const ถาม = ใบบนฐานจริง();
  if (!ถาม.ใบ) ปฏิเสธ(วิธีแก้ต่อฐานไม่ได้(ถาม.เหตุ));
  const บนฐาน = ถาม.ใบ;
  const ยังไม่ลง = ในโค้ด.filter(v => !บนฐาน.includes(v));
  if (ยังไม่ลง.length) ปฏิเสธ([`ใบปรับฐานยังไม่ลงฐานจริง ${ยังไม่ลง.length} ใบ: ${ยังไม่ลง.join(", ")}`,
    "ให้บอสรัน npm run db:push:prod ลงใบก่อน แล้วค่อย push ขึ้นเว็บ"]);
  console.log(`✓ push ขึ้น monorepo ได้ — ${x.localSha.slice(0, 7)} ผ่านรอบตรวจเต็ม (${(ผล.จาก ?? "").slice(0, 7)}) · ใบปรับฐาน ${ในโค้ด.length} ใบลงฐานจริงครบ`);
}
process.exit(0);
