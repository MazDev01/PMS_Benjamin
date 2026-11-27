// ── ข้อทดสอบ: สำรองฐานจริง + กุญแจ อยู่นอก repo (บอสสั่ง 26 พ.ย. 69) ─────────────────────────────────────────────────
//   1) ตัวตรวจ scripts/check-private-outside-repo.mjs: ราก repo ปลอม (โฟลเดอร์ชั่วคราว) ไม่มีโฟลเดอร์ชื่อต้องห้าม = ผ่าน
//      · โฟลเดอร์ว่างชื่อ prod-backups / prod-secrets / pms-prod-backups / pms-prod-secrets ที่ใดก็ได้ (ราก · .local · โฟลเดอร์เซสชัน
//      · ตัวพิมพ์ใหญ่) = ตก · รันในโฟลเดอร์เซสชันก็ตรวจทั้งโฟลเดอร์หลัก · ไม่พิมพ์ชื่อไฟล์ข้างใน · PMS_PRIVATE_ROOT ใต้ repo = ตก
//      · อยู่ใน pnpm checks
//   2) ตัวกลางที่อยู่: prod-backups/prod-secrets ไม่อยู่ในตารางย้าย .local · ที่ส่วนตัว() = <PMS_PRIVATE_ROOT>/<ชื่อ> · ไม่มี = หยุด (ไม่สร้าง)
//      · ค่าตั้งต้น C:/.claude/pms-private
//   3) db:push · ตัวสำรอง · ด่านผลซ้อมกู้: ไม่เจอที่เก็บสำรองนอก repo = หยุดพร้อมบอกที่อยู่ ไม่สร้างโฟลเดอร์
//   ตกบนโค้ดเดิม: ไม่มีตัวตรวจ · ตารางย้ายยังมี prod-backups · ไม่มี ที่ส่วนตัว
//   ไม่เปิด/อ่านไฟล์ใน C:/.claude/pms-private — ทุกข้อใช้โฟลเดอร์ชั่วคราว (PMS_PRIVATE_ROOT ชี้ที่จำลอง) · ไม่ใช้เว็บ/ฐานใด ๆ
// รัน: node tests/tools/private-outside-repo.test.mjs
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { envตัวลูกแยกจากรอบ } from "../../scripts/lib/childEnv.mjs";

const ราก = process.cwd();
let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(0, 1200)}`}`); };
const ชั่วคราว = mkdtempSync(path.join(tmpdir(), "private-outside-"));
const ส่วนตัวปลอม = path.join(ชั่วคราว, "private");   // รากส่วนตัวจำลอง (นอกราก repo ปลอมทุกตัว)
const envลูก = { ...envตัวลูกแยกจากรอบ(), PMS_PRIVATE_ROOT: ส่วนตัวปลอม };
for (const k of ["PMS_BACKUP_ROOT", "PMS_PUSH_LOG", "PMS_BACKUP_RESULT"]) delete envลูก[k];
const ตัวตรวจ = path.join(ราก, "scripts/check-private-outside-repo.mjs");
const ตรวจ = (cwd, env = envลูก) => spawnSync(process.execPath, [ตัวตรวจ], { cwd, encoding: "utf8", env });
const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const ชื่อต้องห้าม = ["prod-backups", "prod-secrets", "pms-prod-backups", "pms-prod-secrets"];

try {
  // ── 1) ตัวตรวจ ──
  ผล(existsSync(ตัวตรวจ), "มีตัวตรวจ scripts/check-private-outside-repo.mjs");
  const checks = JSON.parse(readFileSync(path.join(ราก, "package.json"), "utf8")).scripts?.checks ?? "";
  ผล(/node scripts\/check-private-outside-repo\.mjs(\s|$)/.test(checks), "ตัวตรวจอยู่ใน pnpm checks");
  if (existsSync(ตัวตรวจ)) {
    const ปลอม = path.join(ชั่วคราว, "repo");   // ไม่ใช่ git = ราก repo คือ cwd
    mkdirSync(path.join(ปลอม, ".local/wt/s1/apps"), { recursive: true });
    mkdirSync(path.join(ปลอม, "apps/hq"), { recursive: true });
    let r = ตรวจ(ปลอม);
    ผล(r.status === 0 && /ใต้ repo: 0/.test(r.stdout), "ราก repo ปลอมไม่มีโฟลเดอร์ชื่อต้องห้าม = ผ่าน", r.stdout + r.stderr);
    const ที่วาง = [".local", "", ".local/wt/s1", ".local/wt/s1/apps"];
    for (const [i, ชื่อ] of ชื่อต้องห้าม.entries()) {
      const ที่ = path.join(ปลอม, ที่วาง[i], ชื่อ);
      mkdirSync(ที่, { recursive: true });   // โฟลเดอร์ว่าง
      r = ตรวจ(ปลอม);
      const rel = [ที่วาง[i], ชื่อ].filter(Boolean).join("/");
      ผล(r.status === 1 && r.stdout.includes(`✗ ${rel}`), `โฟลเดอร์ว่าง ${rel} = ตก`, `${r.status}\n${r.stdout}${r.stderr}`);
      rmSync(ที่, { recursive: true, force: true });
    }
    mkdirSync(path.join(ปลอม, ".local/PROD-Secrets"));
    r = ตรวจ(ปลอม);
    ผล(r.status === 1 && /✗ \.local\/PROD-Secrets/.test(r.stdout), "ชื่อตัวพิมพ์ใหญ่ (.local/PROD-Secrets) = ตก", r.stdout);
    writeFileSync(path.join(ปลอม, ".local/PROD-Secrets/zz-ห้ามพิมพ์ชื่อ.env"), "ZZ=1\n");
    r = ตรวจ(ปลอม);
    ผล(r.status === 1 && !/zz-ห้ามพิมพ์ชื่อ/.test(r.stdout + r.stderr), "ไม่เดินเข้าโฟลเดอร์ที่เจอ (ไม่พิมพ์ชื่อไฟล์ข้างใน)", r.stdout);
    rmSync(path.join(ปลอม, ".local/PROD-Secrets"), { recursive: true, force: true });
    r = ตรวจ(ปลอม);
    ผล(r.status === 0, "ลบออกแล้ว = ผ่าน", r.stdout + r.stderr);

    // รันในโฟลเดอร์เซสชัน (ใต้ .local/wt ของ repo git) → ตรวจทั้งโฟลเดอร์หลัก ไม่ใช่แค่โฟลเดอร์ที่รัน
    const หลัก = path.join(ชั่วคราว, "main");
    mkdirSync(หลัก);
    git(หลัก, "init", "-q", "-b", "monorepo");
    const เซสชัน = path.join(หลัก, ".local/wt/s1");
    mkdirSync(เซสชัน, { recursive: true });
    mkdirSync(path.join(หลัก, ".local/prod-backups"));
    r = ตรวจ(เซสชัน);
    ผล(r.status === 1 && /✗ \.local\/prod-backups/.test(r.stdout), "รันในโฟลเดอร์เซสชัน = ตรวจทั้งโฟลเดอร์หลัก (เจอ .local/prod-backups ของโฟลเดอร์หลัก)", r.stdout + r.stderr);
    rmSync(path.join(หลัก, ".local/prod-backups"), { recursive: true });
    mkdirSync(path.join(หลัก, "node_modules/x/prod-secrets"), { recursive: true });
    r = ตรวจ(เซสชัน);
    ผล(r.status === 0, "node_modules ข้ามได้ (ไม่ใช่ที่เก็บของเรา)", r.stdout + r.stderr);

    r = ตรวจ(ปลอม, { ...envลูก, PMS_PRIVATE_ROOT: path.join(ปลอม, ".local/private") });
    ผล(r.status === 1 && /รากส่วนตัว .* อยู่ใต้ repo/.test(r.stdout), "PMS_PRIVATE_ROOT ชี้เข้าใต้ repo = ตก", r.stdout);
  }

  // ── 2) ตัวกลางที่อยู่ ──
  const lp = await import(pathToFileURL(path.join(ราก, "scripts/lib/localPaths.mjs")).href);
  ผล(!("prod-backups" in lp.ตารางย้าย) && !("prod-secrets" in lp.ตารางย้าย), "prod-backups · prod-secrets ไม่อยู่ในตารางย้าย .local (ไม่ย้ายเข้า repo อีก)", Object.keys(lp.ตารางย้าย).join(", "));
  const ts = readFileSync(path.join(ราก, "tests/scenario/localPaths.ts"), "utf8");
  ผล(!/"prod-(backups|secrets)"/.test(ts), "ฉบับ spec (tests/scenario/localPaths.ts) ก็ไม่มี 2 ชื่อนี้");
  ผล(typeof lp.ที่ส่วนตัว === "function" && typeof lp.รากส่วนตัว === "function", "มี ที่ส่วนตัว() · รากส่วนตัว() ใน localPaths");
  if (typeof lp.ที่ส่วนตัว === "function") {
    const เดิม = process.env.PMS_PRIVATE_ROOT;
    try {
      delete process.env.PMS_PRIVATE_ROOT;
      if (process.platform === "win32") ผล(lp.รากส่วนตัว() === "C:/.claude/pms-private", "ค่าตั้งต้นรากส่วนตัว = C:/.claude/pms-private", lp.รากส่วนตัว());
      process.env.PMS_PRIVATE_ROOT = ส่วนตัวปลอม;
      let โยน = ""; try { lp.ที่ส่วนตัว("prod-backups", { cwd: ราก }); } catch (e) { โยน = e.message; }
      ผล(/ไม่เจอโฟลเดอร์/.test(โยน) && โยน.includes("private/prod-backups") && !existsSync(path.join(ส่วนตัวปลอม, "prod-backups")), "ไม่มีที่เก็บ = หยุดพร้อมบอกที่อยู่ ไม่สร้างใหม่", โยน);
      mkdirSync(path.join(ส่วนตัวปลอม, "prod-backups"), { recursive: true });
      ผล(lp.ที่ส่วนตัว("prod-backups", { cwd: ราก }) === `${ส่วนตัวปลอม.replace(/\\/g, "/")}/prod-backups`, "มีที่เก็บ = <PMS_PRIVATE_ROOT>/prod-backups");
      rmSync(path.join(ส่วนตัวปลอม, "prod-backups"), { recursive: true });
      โยน = ""; try { lp.ที่ใน("prod-backups"); } catch (e) { โยน = e.message; }
      ผล(/ไม่รู้จักชื่อ/.test(โยน), "ที่ใน(\"prod-backups\") = หยุด (ไม่มีทางถอยไป .local หรือที่เดิม)", โยน);
      const repoปลอม = path.join(ชั่วคราว, "repo");
      process.env.PMS_PRIVATE_ROOT = path.join(repoปลอม, ".local/private");
      mkdirSync(path.join(repoปลอม, ".local/private/prod-secrets"), { recursive: true });
      โยน = ""; try { lp.ที่ส่วนตัว("prod-secrets", { cwd: repoปลอม }); } catch (e) { โยน = e.message; }
      ผล(/อยู่ใต้ repo/.test(โยน), "รากส่วนตัวใต้ repo = หยุด (แม้โฟลเดอร์มีอยู่)", โยน);
      rmSync(path.join(repoปลอม, ".local/private"), { recursive: true });
    } finally { if (เดิม === undefined) delete process.env.PMS_PRIVATE_ROOT; else process.env.PMS_PRIVATE_ROOT = เดิม; }
  }

  // ── 3) เครื่องมือ: ไม่เจอที่เก็บสำรองนอก repo = หยุดก่อนทำอะไร ──
  rmSync(ส่วนตัวปลอม, { recursive: true, force: true });
  mkdirSync(ส่วนตัวปลอม);
  const envเครื่องมือ = { ...envลูก, PMS_PUSH_TEST: "1", PMS_PROD_LOCK: path.join(ชั่วคราว, "prod.lock"), PMS_ROUND_DIR: path.join(ชั่วคราว, "round"), PMS_TESTDB_LOCK: path.join(ชั่วคราว, "testdb.lock") };
  let r = spawnSync(process.execPath, ["scripts/db-push-prod.mjs", "--yes-prod", "--dry-run"], { cwd: ราก, encoding: "utf8", env: envเครื่องมือ, input: "", timeout: 60_000 });
  ผล(r.status === 2 && /ไม่เจอโฟลเดอร์ .*private\/prod-backups/.test(r.stderr), "db:push ไม่เจอที่เก็บสำรอง = หยุด (exit 2) พร้อมบอกที่อยู่", `${r.status}\n${r.stdout}${r.stderr}`);
  r = spawnSync(process.execPath, ["scripts/prod-backup-verify.mjs", "--target", "local", "zz-ทดสอบ"], { cwd: ราก, encoding: "utf8", env: envเครื่องมือ, timeout: 60_000 });
  ผล(r.status === 2 && /ไม่เจอโฟลเดอร์ .*private\/prod-backups/.test(r.stderr), "ตัวสำรองไม่เจอที่เก็บ = หยุด (exit 2) พร้อมบอกที่อยู่", `${r.status}\n${r.stdout}${r.stderr}`);
  ผล(readdirSync(ส่วนตัวปลอม).length === 0, "เครื่องมือไม่สร้างโฟลเดอร์ใหม่ในที่เก็บ", readdirSync(ส่วนตัวปลอม).join(", "));
  const mark = await import(pathToFileURL(path.join(ราก, "scripts/lib/prodBackupMark.mjs")).href);
  const เดิม = { r: process.env.PMS_PRIVATE_ROOT, b: process.env.PMS_BACKUP_ROOT, x: process.env.PMS_BACKUP_RESULT };
  try {
    process.env.PMS_PRIVATE_ROOT = ส่วนตัวปลอม; delete process.env.PMS_BACKUP_ROOT; delete process.env.PMS_BACKUP_RESULT;
    const ด่าน = mark.ผลสำรองล่าสุด();
    ผล(/ไม่เจอโฟลเดอร์ .*private\/prod-backups/.test(ด่าน.ปัญหา ?? ""), "ด่านผลซ้อมกู้ (prod-live) ไม่เจอที่เก็บ = ไม่รัน พร้อมบอกที่อยู่", JSON.stringify(ด่าน));
  } finally {
    for (const [k, v] of [["PMS_PRIVATE_ROOT", เดิม.r], ["PMS_BACKUP_ROOT", เดิม.b], ["PMS_BACKUP_RESULT", เดิม.x]]) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
} catch (e) {
  ผล(false, "ข้อทดสอบรันจนจบ", e.stack ?? e);
} finally {
  rmSync(ชั่วคราว, { recursive: true, force: true, maxRetries: 3 });
}

console.log(ตก ? `\n✗ ตก ${ตก} ข้อ` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
