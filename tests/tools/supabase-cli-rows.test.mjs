// ── ข้อทดสอบ: อ่านผล Supabase CLI ได้ทั้ง 2 รูปแบบ · อ่านไม่ได้ = หยุดก่อนลบ · ใช้ CLI รุ่นของโปรเจกต์ (เหตุจริง 3 พ.ย. 69) ──
//   บอสรันล้างข้อมูลทดสอบเอง → CLI ตอบ [ {...} ] (คนรัน) แทน { rows } (AI รัน) → ตัวอ่านเดิมตัดจาก { ตัวแรก → ตกที่ขั้นนับ
//   ไม่แตะฐานใด ๆ: CLI ปลอม (PMS_SUPABASE_CLI) พิมพ์ข้อความยืนยัน "Confirmed by --yes" ลง stderr แล้วตอบผลตามโหมด
//   1) แถวจากผลCLI: [ ... ] · { rows } · มีข้อความนำหน้า → อ่านได้ · ว่าง/ไม่ใช่ JSON/ผลผิดพลาดของ CLI → โยนข้อผิดพลาด
//   2) รันSQLไฟล์ ผ่าน CLI ปลอม: ถามยืนยันแล้วตอบ 2 รูปแบบ → อ่านได้ · ผลเพี้ยน/รหัสไม่ใช่ 0 → โยนข้อผิดพลาด
//   3) run.mjs ขั้นล้าง: อ่านผลด้วยตัวกลาง · อ่านไม่ได้ = ตาย · ขั้นนับมาก่อนคำสั่งลบ (cleanup.sql) → หยุดก่อนลบ
//   4) ทุกจุดที่คุยกับฐานจริงในโฟลเดอร์ผูกฐาน ไม่เรียก "npx supabase" (รุ่นลอย) แล้ว
//   หลักฐานตกเมื่อเพี้ยน: ตัวอ่านเดิม (ตัดจาก { ตัวแรก) ต้องอ่านผลแบบที่บอสได้ไม่ได้
// รัน: node tests/tools/supabase-cli-rows.test.mjs
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const ราก = process.cwd();
const ที่ = path.join(ราก, "test-results", `supabase-cli-rows-${process.pid}`);
rmSync(ที่, { recursive: true, force: true });
mkdirSync(ที่, { recursive: true });
let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(0, 400)}`}`); };
const โยน = (fn) => { try { fn(); return null; } catch (e) { return e; } };

// CLI ปลอม: ต้องได้ --yes ก่อน (ไม่ได้ = ถามยืนยันไม่ได้ ตกแบบ CLI จริง) · ตอบตามโหมด
const ปลอม = path.join(ที่, "fake-cli.mjs");
writeFileSync(ปลอม, `const a = process.argv.slice(2);
if (!a.includes("--yes")) { console.log(JSON.stringify({ _tag: "Error", error: { code: "HostedMutationConsentRequiredError" } })); process.exit(1); }
process.stderr.write("Warning: --linked is deprecated\\nConfirmed by --yes: Run a SQL statement on project · production\\n");
const แถว = [{ "จะลบ": 45, "ปนแถวจริง": 0, "เหลือ": 54 }];
const โหมด = process.env.FAKE_MODE;
if (โหมด === "array") console.log(JSON.stringify(แถว, null, 2));
else if (โหมด === "object") console.log(JSON.stringify({ boundary: "b", rows: แถว, warning: "w" }, null, 2));
else if (โหมด === "garbage") console.log("Initialising login role...\\nไม่ใช่ผล");
else if (โหมด === "fail") { console.error("boom"); process.exit(2); }
`);
process.env.PMS_SUPABASE_CLI = `"${process.execPath}" "${ปลอม}"`;
const { แถวจากผลCLI, รันSQLไฟล์ } = await import(new URL(`file:///${path.join(ราก, "scripts/lib/supabaseCli.mjs").replace(/\\/g, "/")}`).href);

// 1) ตัวอ่าน
const บอสได้ = '[\n  {\n    "จะลบ": 45,\n    "ปนแถวจริง": 0,\n    "เหลือ": 54\n  }\n]\n';   // รูปที่บอสได้ใน cmd (3 พ.ย. 69)
const aiได้ = '{\n  "boundary": "x",\n  "rows": [\n    {\n      "จะลบ": 45,\n      "ปนแถวจริง": 0,\n      "เหลือ": 54\n    }\n  ],\n  "warning": "w"\n}\n';
for (const [ชื่อ, ข้อความ] of [["แบบรายการ [ {...} ] (คนรันเอง)", บอสได้], ["แบบ { rows } (AI รัน)", aiได้], ["มีข้อความนำหน้า", `Initialising login role...\n${บอสได้}`]]) {
  const e = โยน(() => { const r = แถวจากผลCLI(ข้อความ); if (r[0]?.["จะลบ"] !== 45 || r[0]?.["ปนแถวจริง"] !== 0) throw new Error(JSON.stringify(r)); });
  ผล(!e, `อ่านได้ — ${ชื่อ}`, e?.message);
}
for (const [ชื่อ, ข้อความ] of [["ว่าง", ""], ["ไม่ใช่ JSON", "Initialising login role..."], ["ผลผิดพลาดของ CLI", '{"_tag":"Error","error":{"code":"X"}}'], ["JSON ขาด", "[ { \"a\": 1 "]]) {
  ผล(!!โยน(() => แถวจากผลCLI(ข้อความ)), `อ่านไม่ได้ → โยนข้อผิดพลาด — ${ชื่อ}`);
}
// หลักฐานตกเมื่อเพี้ยน: ตัวอ่านเดิมของ run.mjs / pre-push อ่านผลแบบที่บอสได้ไม่ได้ (ข้อทดสอบข้างบนจึงจับได้)
const ตัวอ่านเดิม = (t) => JSON.parse(t.slice(t.indexOf("{"))).rows ?? [];
ผล(!!โยน(() => ตัวอ่านเดิม(บอสได้)), "หลักฐาน: ตัวอ่านเดิม (ตัดจาก { ตัวแรก) อ่านผลแบบรายการไม่ได้ — ตรงกับที่บอสเจอ");

// 2) ผ่าน CLI ปลอมที่ถามยืนยัน
const ไฟล์ = path.join(ที่, "นับ.sql");
writeFileSync(ไฟล์, "select 1;\n");
for (const โหมด of ["array", "object"]) {
  process.env.FAKE_MODE = โหมด;
  const e = โยน(() => { const r = รันSQLไฟล์(ไฟล์, { cwd: ที่, workdir: ที่ }); if (r[0]?.["จะลบ"] !== 45) throw new Error(JSON.stringify(r)); });
  ผล(!e, `CLI ถามยืนยัน (Confirmed by --yes ใน stderr) แล้วตอบแบบ ${โหมด} → อ่านได้`, e?.message);
}
for (const โหมด of ["garbage", "fail"]) {
  process.env.FAKE_MODE = โหมด;
  ผล(!!โยน(() => รันSQLไฟล์(ไฟล์, { cwd: ที่ })), `CLI ตอบ ${โหมด} → โยนข้อผิดพลาด (ผู้เรียกหยุด)`);
}

// 3) run.mjs ขั้นล้าง: อ่านไม่ได้ = ตาย · นับก่อนลบ
const run = readFileSync(path.join(ราก, "tests/prod-live/run.mjs"), "utf8");
const ล้าง = run.slice(run.indexOf('if (phase === "cleanup")'));
ผล(/try \{ return รันSQLไฟล์\([^)]*\); \} catch \(e\) \{ ตาย\(/.test(ล้าง), "run.mjs: ขั้นล้างอ่านผลด้วยตัวกลาง · อ่านไม่ได้ = ตาย");
const ที่นับ = ล้าง.indexOf("const ก่อน = นับ()"), ที่ตรวจปน = ล้าง.indexOf("Number(ก่อน.ปนแถวจริง) !== 0"), ที่ลบ = ล้าง.indexOf('ถาม(ไฟล์ล้าง, "cleanup.sql")');
ผล(ที่นับ > 0 && ที่ตรวจปน > ที่นับ && ที่ลบ > ที่ตรวจปน, "run.mjs: นับ → ตรวจแถวปน → แล้วค่อยรัน cleanup.sql (อ่านผลนับไม่ได้ = หยุดก่อนลบ)");
ผล(!/JSON\.parse\(r\.stdout\.slice\(r\.stdout\.indexOf\("\{"\)\)\)/.test(ล้าง), "run.mjs: ไม่เหลือตัวอ่านเดิม");
// 3b) มองไม่เห็นทุกแถว (5 พ.ย. 69 · บอสรันล้างจากหน้าจอคน ขึ้น "ลบ 0" ทั้งที่มีแถว · กลไกพิสูจน์ที่ supabase/tests/cleanup_visibility.sql)
//     บัญชีที่ CLI ใช้ข้ามกฎสิทธิ์รายแถวไม่ได้ = นับ 0 · ด่านปนแถวจริง 0 · "เหลือ 0" ผ่านเท็จ → ต้องตรวจตัวชี้ เห็นทุกแถว ก่อนลบ และตอนตรวจเหลือ
const นิพจน์เห็น = "(select rolsuper or rolbypassrls from pg_roles where rolname = current_user) as เห็นทุกแถว";
const ไฟล์นับ = readFileSync(path.join(ราก, "tests/prod-live/cleanup-audit-count.sql"), "utf8");
ผล(ไฟล์นับ.includes(นิพจน์เห็น), "cleanup-audit-count.sql: มีตัวชี้ เห็นทุกแถว (บัญชีข้ามกฎสิทธิ์รายแถวได้ไหม)");
const ที่ตรวจเห็น = ล้าง.indexOf("if (ก่อน.เห็นทุกแถว !== true) ตาย(");
ผล(ที่ตรวจเห็น > ที่นับ && ที่ตรวจเห็น < ที่ลบ, "run.mjs: มองไม่เห็นทุกแถว = หยุดก่อนรัน cleanup.sql");
ผล(ล้าง.includes(นิพจน์เห็น) && /if \(เห็นตอนตรวจ !== true\) ตาย\(/.test(ล้าง), "run.mjs: ตรวจแถวที่เหลือ ต้องเห็นทุกแถวด้วย (ไม่งั้น \"เหลือ 0\" เชื่อไม่ได้)");
const ไฟล์ลบ = readFileSync(path.join(ราก, "tests/prod-live/cleanup.sql"), "utf8");
const ด่านแรก = ไฟล์ลบ.indexOf("role_no_bypassrls"), ด่านZZT = ไฟล์ลบ.indexOf("raise exception 'ZZT ไม่ใช่สาขาทดสอบ"), ลบแรก = ไฟล์ลบ.search(/^\s*delete from /m);
ผล(ด่านแรก > ไฟล์ลบ.indexOf("begin;") && ด่านแรก < ด่านZZT && ด่านแรก < ลบแรก, "cleanup.sql: ด่านแรก = บัญชีต้องข้ามกฎสิทธิ์รายแถวได้ (ก่อนด่านอื่นและก่อนลบ)");

// 4) ไม่เรียก npx supabase ในจุดที่รันในโฟลเดอร์ผูกฐานจริง
const ไม่ลอย = [
  ["tests/prod-live/run.mjs", ล้าง],
  ["scripts/git-hooks/pre-push.mjs", readFileSync(path.join(ราก, "scripts/git-hooks/pre-push.mjs"), "utf8").split("const วิธีแก้ต่อฐานไม่ได้")[0]],
  ["scripts/prod-query.mjs", readFileSync(path.join(ราก, "scripts/prod-query.mjs"), "utf8")],
];
for (const [f, s] of ไม่ลอย) ผล(!/"npx",\s*\[\s*"supabase"|spawnSync\("npx"/.test(s), `${f}: ใช้ CLI ของโปรเจกต์ (ไม่ใช่ npx รุ่นลอย)`);
const สำรอง = readFileSync(path.join(ราก, "scripts/prod-backup-verify.mjs"), "utf8");
ผล(/target === "prod"\s*\?\s*รัน\(คำสั่งCLI\(\), \["db", "dump"/.test(สำรอง) && /รันตรวจ\(ชื่อขั้น, คำสั่งCLI\(\), \["db", "query", "--linked"/.test(สำรอง),
  "prod-backup-verify: ดึงสำรอง + นับฐานจริง ใช้ CLI ของโปรเจกต์");

rmSync(ที่, { recursive: true, force: true });
console.log(ตก ? `FAIL ${ตก}` : "ALL PASS");
process.exit(ตก ? 1 : 0);
