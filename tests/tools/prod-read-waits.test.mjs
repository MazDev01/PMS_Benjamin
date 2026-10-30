// ── ข้อทดสอบ: คำสั่งอ่านฐานจริงต้องรอ db:push / สำรอง+ซ้อมกู้ ที่ถือล็อกอยู่ (ไม่ยิงแทรก) ───────────────────────────────
// เหตุจริง 29 ต.ค. 69: อ่านฐานจริงทุก 30 วิ (supabase db query --linked) ระหว่างบอส db:push 0261 0262
//   CLI ตั้งรหัสใหม่ให้ cli_login_postgres ทุกครั้ง → ขั้นสำรอง 3-auth-data ตก "password authentication failed"
// จำลอง: โปรเซสหนึ่งถือล็อกฐานจริง ("สำรองฐานจริง + ซ้อมกู้") ~3 วิ แล้วสั่งคำสั่งอ่านทุกทางระหว่างนั้น
//   ก. สคริปต์ที่ใช้ loadTarget (ชี้ฐานจริง) · ข. npm run prod:query · ค. prod-live --target prod
//   → ต้องรอจนล็อกปล่อย (จบหลังเวลาปล่อย + บอก "⏳ รอ") · ไม่ยิงแทรก
//   ง. ตัวที่ขอล็อกเอง (db:push · loadTarget({ ถือล็อกเอง: true })) ไม่รอ · จ. ตัวลูกของผู้ถือ (PMS_PROD_LOCK_HELD) ไม่รอ
//   ฉ. ล็อกค้างของโปรเซสที่ตายแล้ว ไม่ต้องรอ
// ไม่แตะฐานใด ๆ: ไฟล์ล็อกชั่วคราว (PMS_PROD_LOCK) · กุญแจปลอมชี้ http://127.0.0.1:9 · prod:query แบบไม่รันจริง (PMS_PROD_QUERY_DRY)
//   prod-live หยุดที่ด่านผลซ้อมกู้ (ไฟล์ผลชั่วคราวไม่มี) หลังรอเสร็จ — ไม่ถึงขั้นต่อฐาน
// รัน: node tests/tools/prod-read-waits.test.mjs
//   พิสูจน์ว่าตกบนโค้ดเดิม: PMS_GUARD_ROOT=<โฟลเดอร์ที่แตกโค้ดรุ่นก่อน (scripts + tests/prod-live)> node tests/tools/prod-read-waits.test.mjs
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ราก = process.cwd();
const โค้ด = process.env.PMS_GUARD_ROOT ? path.resolve(process.env.PMS_GUARD_ROOT) : ราก;
const ที่ = path.join(ราก, "test-results", `prod-read-waits-${process.pid}`);   // ใน repo (หา node_modules เจอ) · git ไม่เก็บ
const ล็อก = path.join(ที่, "prod.lock");
let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(-800)}`}`); };

rmSync(ที่, { recursive: true, force: true });
mkdirSync(ที่, { recursive: true });
writeFileSync(path.join(ที่, ".env.production.local"),
  "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9\nNEXT_PUBLIC_SUPABASE_ANON_KEY=ปลอม\nSUPABASE_SERVICE_ROLE_KEY=ปลอม\n");
const url = (p) => pathToFileURL(path.join(โค้ด, p)).href;
const env = { ...process.env, PMS_PROD_LOCK: ล็อก, PMS_PROD_QUERY_DRY: "1", PMS_BACKUP_RESULT: path.join(ที่, "ไม่มีผลซ้อมกู้.json"),
  PMS_PROD_OPS_DIR: ที่, PMS_PROD_READ_WAIT_MS: "60000" };
delete env.PMS_PROD_LOCK_HELD;

// ผู้ถือล็อก: ขอล็อกแบบเดียวกับ prod-backup-verify · ถือ ~3 วิ · จดเวลาปล่อยลงไฟล์ก่อนจบ
const เวลาปล่อย = path.join(ที่, "ปล่อย.txt");
const ตัวถือ = path.join(ที่, "holder.mjs");
writeFileSync(ตัวถือ, `import { ขอล็อก } from ${JSON.stringify(url("scripts/lib/prodLock.mjs"))};
import { writeFileSync } from "node:fs";
const l = ขอล็อก("สำรองฐานจริง + ซ้อมกู้ (จำลอง)");
console.log("TOKEN " + l.token);
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(process.argv[2] || 3000));
writeFileSync(${JSON.stringify(เวลาปล่อย)}, String(Date.now()));
l.release();
`);
const อ่านผ่านloadTarget = path.join(ที่, "reader.mjs");
writeFileSync(อ่านผ่านloadTarget, `import { loadTarget } from ${JSON.stringify(url("scripts/lib/targetEnv.mjs"))};
loadTarget({ quiet: true, ...(process.argv[2] === "self" ? { ถือล็อกเอง: true } : {}) });
console.log("END " + Date.now());
`);

/** เริ่มผู้ถือ → รอจนไฟล์ล็อกเกิด → คืน { token, จบ: Promise } */
async function เริ่มผู้ถือ(ms = 3000) {
  rmSync(ล็อก, { force: true }); rmSync(เวลาปล่อย, { force: true });
  const p = spawn(process.execPath, [ตัวถือ, String(ms)], { cwd: ที่, env, stdio: ["ignore", "pipe", "pipe"] });
  let out = ""; p.stdout.on("data", d => out += d);
  const จบ = new Promise(r => p.on("exit", r));
  const เริ่ม = Date.now();
  while (!/TOKEN \S+/.test(out) && Date.now() - เริ่ม < 15_000) await new Promise(r => setTimeout(r, 50));
  return { token: out.match(/TOKEN (\S+)/)?.[1] ?? "", จบ };
}
/** รันคำสั่งอ่านแบบไม่บล็อก (ผู้ถือต้องทำงานต่อได้) → { status, ออก, จบเมื่อ } */
function รัน(args, เพิ่มenv = {}) {
  return new Promise(res => {
    const p = spawn(process.execPath, args, { cwd: ที่, env: { ...env, ...เพิ่มenv } });
    let ออก = ""; p.stdout.on("data", d => ออก += d); p.stderr.on("data", d => ออก += d);
    p.on("exit", status => res({ status, ออก, จบเมื่อ: Date.now() }));
  });
}
const ปล่อยเมื่อ = () => existsSync(เวลาปล่อย) ? Number(readFileSync(เวลาปล่อย, "utf8")) : Infinity;

// ── ก–ค: คำสั่งอ่านต้องรอจนผู้ถือปล่อย ──
const คำสั่งอ่าน = [
  ["ก. สคริปต์ที่ใช้ loadTarget (ชี้ฐานจริง)", [อ่านผ่านloadTarget], (r) => r.status === 0 && /END \d+/.test(r.ออก)],
  ["ข. npm run prod:query (คำสั่งถามฐานจริงแบบอ่าน)", [path.join(โค้ด, "scripts/prod-query.mjs"), "select 1"], (r) => r.status === 0 && /\[ไม่รันจริง\] npx supabase db query --linked/.test(r.ออก)],
  ["ค. prod-live --target prod (ขั้น cleanup ต่อฐานแบบ --linked)", [path.join(โค้ด, "tests/prod-live/run.mjs"), "--target", "prod", "cleanup"], (r) => r.status === 3 && /ไม่รัน/.test(r.ออก)],
];
for (const [ชื่อ, args, จบปกติ] of คำสั่งอ่าน) {
  const ถือ = await เริ่มผู้ถือ();
  const r = await รัน(args);
  await ถือ.จบ;
  const ปล่อย = ปล่อยเมื่อ();
  ผล(r.จบเมื่อ >= ปล่อย, `${ชื่อ}: รอจนล็อกปล่อยก่อน (จบหลังเวลาปล่อย ${r.จบเมื่อ - ปล่อย} ms)`, r.ออก);
  ผล(/⏳ รอ/.test(r.ออก), `${ชื่อ}: บอกบนจอว่ากำลังรองานที่แตะฐานจริง`, r.ออก);
  ผล(จบปกติ(r), `${ชื่อ}: รอเสร็จแล้วทำงานต่อตามปกติ (ไม่ใช่หยุดเพราะล็อก)`, r.ออก);
}

// ── ง: ตัวที่ขอล็อกเอง (db:push · สำรอง) ไม่รอคิวใน loadTarget — ไปขอล็อกเองแล้วหยุดบอกเหตุตามเดิม ──
{
  const ถือ = await เริ่มผู้ถือ(4000);
  const r = await รัน([อ่านผ่านloadTarget, "self"]);
  ผล(r.status === 0 && r.จบเมื่อ < ปล่อยเมื่อ() && !/⏳ รอ/.test(r.ออก), "ง. loadTarget({ ถือล็อกเอง: true }) ไม่รอคิว (db:push ขอล็อกเอง ชน = หยุดบอกเหตุ)", r.ออก);
  await ถือ.จบ;
}
// ── จ: ตัวลูกของผู้ถือล็อก (PMS_PROD_LOCK_HELD = รหัสล็อก) ไม่รอตัวแม่ ──
{
  const ถือ = await เริ่มผู้ถือ(4000);
  const r = await รัน([อ่านผ่านloadTarget], { PMS_PROD_LOCK_HELD: ถือ.token });
  ผล(r.status === 0 && r.จบเมื่อ < ปล่อยเมื่อ() && !/⏳ รอ/.test(r.ออก), "จ. ตัวลูกของผู้ถือล็อก (PMS_PROD_LOCK_HELD) ไม่รอตัวแม่", r.ออก);
  await ถือ.จบ;
}
// ── ฉ: ล็อกค้างของโปรเซสที่ตายแล้ว ไม่ต้องรอ ──
{
  writeFileSync(ล็อก, JSON.stringify({ token: "ค้าง", pid: 999_999_999, งาน: "ล็อกค้าง", เริ่ม: new Date().toISOString() }));
  const r = await รัน([อ่านผ่านloadTarget]);
  ผล(r.status === 0 && !/⏳ รอ/.test(r.ออก), "ฉ. ล็อกค้างของโปรเซสที่ไม่อยู่แล้ว ไม่ต้องรอ", r.ออก);
  rmSync(ล็อก, { force: true });
}

rmSync(ที่, { recursive: true, force: true });
if (ตก) { console.log(`\nFAIL ${ตก} ข้อ`); process.exit(1); }
console.log("\nALL PASS");
