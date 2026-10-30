// ── ข้อทดสอบ: ตัวกรองกลางข้อมูลทดสอบบนฐานจริง + ตัวตรวจสคริปต์นับฐานจริง (บอสสั่ง 29 ต.ค. 69 · คิวข้อ 11) ─────────────────
// เหตุจริง 29 ต.ค. 69: ef นับใบตอบรับของสาขาทดสอบ ZZT เป็นใบจริง
//   ก. ตัวกรอง scripts/lib/prodRealData.mjs: สาขา ZZT/ZZ…/ZT… · อีเมล @example.test / live-… · ป้าย ZZTEST/ZZLOAD = ทดสอบ · ของจริงผ่าน
//   ข. ตัวตรวจ scripts/check-prod-count-filter.mjs (โฟลเดอร์จำลอง PMS_PCF_ROOT): สคริปต์นับฐานจริงที่ไม่ใช้ตัวกรอง = ตก ·
//      ใช้ตัวกรอง = ผ่าน · ชื่อในรายการที่ไม่มีไฟล์แล้ว = ตก · ของจริงในโฟลเดอร์นี้ผ่าน
//   ค. โค้ดรุ่นก่อน (PMS_PCF_OLD = โฟลเดอร์ที่แตกโค้ดรุ่นก่อน) ต้องตก: acceptance-check / preflight นับโดยไม่ตัดข้อมูลทดสอบ
// ไม่แตะฐานใด ๆ (อ่านไฟล์อย่างเดียว)
// รัน: node tests/tools/prod-count-filter.test.mjs
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ราก = process.cwd();
const ที่ = path.join(ราก, "test-results", `prod-count-filter-${process.pid}`);
let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(-800)}`}`); };

// ── ก. ตัวกรองกลาง ──
const f = await import(pathToFileURL(path.join(ราก, "scripts/lib/prodRealData.mjs")).href);
ผล(f.เป็นรหัสสาขาทดสอบ("ZZT") && f.เป็นรหัสสาขาทดสอบ("ZTABC") && f.เป็นรหัสสาขาทดสอบ("ZZWWW"), "ก1 สาขา ZZT · ZTABC · ZZWWW = สาขาทดสอบ");
ผล(!f.เป็นรหัสสาขาทดสอบ("RYG") && !f.เป็นรหัสสาขาทดสอบ("CNX") && !f.เป็นรหัสสาขาทดสอบ("HQ") && !f.เป็นรหัสสาขาทดสอบ(""), "ก2 สาขาจริง (RYG CNX HQ) และค่าว่าง ไม่ใช่สาขาทดสอบ");
ผล(f.เป็นอีเมลทดสอบ("live-hq-123@example.test") && f.เป็นอีเมลทดสอบ("a@example.test") && f.เป็นอีเมลทดสอบ("live-dealer-9@x.com"), "ก3 อีเมล @example.test และบัญชีชั่วคราว live-… = ทดสอบ");
ผล(!f.เป็นอีเมลทดสอบ("ryg@dealer.benjaminpebsteel.com") && !f.เป็นอีเมลทดสอบ(null), "ก4 อีเมลจริงและค่าว่าง ไม่ใช่ทดสอบ");
const แถว = [
  { dealer_code: "RYG", customer: "บจ. จริง", status: "won" },
  { dealer_code: "ZZT", customer: "ลูกค้า", status: "won" },            // ใบตอบรับของ prod-live (เหตุจริง)
  { dealer_code: "CNX", customer: "ZZTEST-ลูกค้า", status: "won" },
  { id: 1, email: "live-hq-1@example.test" },
  { code: "ZTQWE", name: "สาขาของข้อ" },
  { code: "BKK", name: "สาขาจริง" },
];
const จริง = f.แถวจริง(แถว);
ผล(จริง.length === 2 && จริง[0].dealer_code === "RYG" && จริง[1].code === "BKK", "ก5 แถวจริง() ตัดใบ ZZT · ป้าย ZZTEST · บัญชี live · สาขา ZT… เหลือของจริง 2 แถว", JSON.stringify(จริง));
ผล(f.แถวจริง(null).length === 0, "ก6 แถวจริง(null) = [] (ผลฐานว่างไม่ทำให้ล้ม)");
ผล(f.เงื่อนไขSQLสาขาจริง("q.dealer_code") === "coalesce(q.dealer_code, '') !~ '^Z[ZT][A-Z]{1,3}$'", "ก7 เงื่อนไข SQL ใช้กติกาเดียวกับตัวกรอง", f.เงื่อนไขSQLสาขาจริง("q.dealer_code"));

// ── ข. ตัวตรวจ (โฟลเดอร์จำลอง) ──
const ตรวจ = (root) => spawnSync(process.execPath, [path.join(ราก, "scripts/check-prod-count-filter.mjs")],
  { encoding: "utf8", env: { ...process.env, PMS_PCF_ROOT: root } });
const ออกของ = (r) => (r.stdout ?? "") + (r.stderr ?? "");
const รายการ = ["scripts/backup.mjs", "scripts/backup-drill.mjs", "scripts/restore.mjs", "scripts/prod-backup-verify.mjs", "scripts/go-live-reset.mjs",
  "scripts/seed-dealers.mjs", "scripts/seed-hq-leads.mjs", "scripts/seed-hq-settings.mjs", "scripts/git-hooks/pre-push.mjs", "scripts/prod-query.mjs",
  "tests/prod-live/run.mjs"];
function จำลอง(ชื่อ, ไฟล์) {
  const r = path.join(ที่, ชื่อ);
  rmSync(r, { recursive: true, force: true });
  for (const [p, เนื้อ] of Object.entries(ไฟล์)) { mkdirSync(path.dirname(path.join(r, p)), { recursive: true }); writeFileSync(path.join(r, p), เนื้อ); }
  return r;
}
const ทั้งฐาน = Object.fromEntries(รายการ.map(p => [p, `const t = loadTarget(); const n = rows.length;\n`]));
const ไม่กรอง = `import { loadTarget } from "./lib/targetEnv.mjs";\nconst t = loadTarget();\nconst { count } = await db.from("quotations").select("*", { count: "exact", head: true }).eq("status", "won");\nconsole.log(count);\n`;
const กรอง = `import { loadTarget } from "./lib/targetEnv.mjs";\nimport { แถวจริง } from "./lib/prodRealData.mjs";\nconst t = loadTarget();\nconst { data } = await db.from("quotations").select("dealer_code").eq("status", "won");\nconsole.log(แถวจริง(data).length);\n`;
const ผ่านSQL = `import { เงื่อนไขSQLสาขาจริง } from "./lib/prodRealData.mjs";\nspawnSync("npm", ["run", "prod:query", "--", \`select count(*) from quotations where \${เงื่อนไขSQLสาขาจริง()}\`]);\n`;
const ไม่ใช่ฐานจริง = `const rows = []; console.log(rows.length);\n`;

{
  const r = ตรวจ(จำลอง("ไม่กรอง", { ...ทั้งฐาน, "scripts/count-won.mjs": ไม่กรอง, "scripts/count-ok.mjs": กรอง }));
  ผล(r.status === 1 && /scripts\/count-won\.mjs/.test(ออกของ(r)) && !/count-ok\.mjs/.test(ออกของ(r)), "ข1 สคริปต์นับใบตอบรับบนฐานจริงที่ไม่ใช้ตัวกรอง = ตก (ชี้ชื่อไฟล์) · ตัวที่ใช้ตัวกรองไม่ถูกจับ", ออกของ(r));
}
{
  const r = ตรวจ(จำลอง("กรองครบ", { ...ทั้งฐาน, "scripts/count-ok.mjs": กรอง, "scripts/count-sql.mjs": ผ่านSQL, "scripts/local-only.mjs": ไม่ใช่ฐานจริง }));
  ผล(r.status === 0, "ข2 ทุกสคริปต์นับฐานจริงใช้ตัวกรอง (ทั้งแบบแถวและแบบ SQL ผ่าน prod:query) = ผ่าน · สคริปต์ที่ไม่ชี้ฐานจริงไม่เกี่ยว", ออกของ(r));
}
{
  const { ["scripts/go-live-reset.mjs"]: _, ...ขาด } = ทั้งฐาน;
  const r = ตรวจ(จำลอง("รายการค้าง", ขาด));
  ผล(r.status === 1 && /เอาออกจากรายการ/.test(ออกของ(r)) && /go-live-reset/.test(ออกของ(r)), "ข3 ชื่อในรายการ \"ทำทั้งฐาน\" ที่ไม่มีไฟล์แล้ว = ตก ให้เอาออก", ออกของ(r));
}
{
  const r = ตรวจ(จำลอง("ตัวลูกcheck", { ...ทั้งฐาน, "scripts/check-something.mjs": ไม่กรอง }));
  ผล(r.status === 0, "ข4 ตัวตรวจโค้ด (scripts/check-*) ไม่ถูกนับเป็นสคริปต์อ่านฐาน", ออกของ(r));
}
{
  const r = spawnSync(process.execPath, ["scripts/check-prod-count-filter.mjs"], { encoding: "utf8" });
  ผล(r.status === 0, "ข5 ของจริงในโฟลเดอร์นี้ผ่าน", ออกของ(r));
}
// ── ค. โค้ดรุ่นก่อนต้องตก (acceptance-check / preflight นับโดยไม่ตัดข้อมูลทดสอบ) ──
if (process.env.PMS_PCF_OLD) {
  const r = ตรวจ(path.resolve(process.env.PMS_PCF_OLD));
  ผล(r.status === 1 && /acceptance-check\.mjs/.test(ออกของ(r)) && /preflight\.mjs/.test(ออกของ(r)), "ค1 โค้ดรุ่นก่อน: acceptance-check + preflight ถูกจับ", ออกของ(r));
}

rmSync(ที่, { recursive: true, force: true });
if (ตก) { console.log(`\nFAIL ${ตก} ข้อ`); process.exit(1); }
console.log("\nALL PASS");
