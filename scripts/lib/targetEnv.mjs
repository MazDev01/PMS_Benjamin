// ── ตัวเลือกฐานข้อมูลของสคริปต์ดูแลระบบ ─────────────────────────────────────────
//
// ทำไมต้องมี (แยกฐานข้อมูล 11 ส.ค. 69):
//   ตั้งแต่แยกฐานข้อมูลเป็น 2 ชุด ไฟล์ apps/hq/.env.local ไม่ได้ชี้ฐานจริงอีกต่อไป
//   มันชี้ "ฐานทดสอบ" เพราะแอปตอนพัฒนาและชุดทดสอบต้องใช้ตัวนั้น
//
//   สคริปต์ดูแลระบบ (สำรอง · กู้คืน · ล้างของทดสอบ) เดิมอ่านไฟล์นั้นตรง ๆ
//   ถ้าปล่อยไว้ **การสำรองข้อมูลจะไปสำรองฐานทดสอบแทนฐานจริงโดยไม่มีใครรู้**
//   แล้ววันที่ต้องกู้จริงถึงจะรู้ว่าไฟล์สำรองทั้งกองไม่มีข้อมูลของลูกค้าเลยสักแถว
//   — ความผิดพลาดแบบที่ไม่มีสัญญาณเตือนจนกว่าจะสายไปแล้ว
//
//   ตัวนี้จึงอ่าน .env.production.local เป็นหลัก และ **บอกทุกครั้งว่ากำลังแตะฐานไหน**
//   ผู้ใช้จะได้เห็นด้วยตาก่อนกด ไม่ต้องเดา
//
// ใช้:  import { loadTarget } from "./lib/targetEnv.mjs";
//       const { url, serviceKey, ref, label } = loadTarget();   // ฐานจริง
//       const t = loadTarget({ allowTest: true });              // ยอมให้ชี้ฐานทดสอบได้ด้วย --test
//
// ชี้ฐานจริง = รอให้ db:push / สำรอง+ซ้อมกู้ ที่ถือล็อกฐานจริงอยู่จบก่อน (scripts/lib/prodLock.mjs · รอฐานจริงว่าง)
//   ตัวที่ขอล็อกเองหลังเรียกตัวนี้ (db-push-prod · prod-backup-verify) ส่ง { ถือล็อกเอง: true } — ไม่รอ แต่ขอล็อก (ไม่ได้ = หยุดบอกเหตุ)
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { รอฐานจริงว่าง } from "./prodLock.mjs";

export function readEnvFile(file) {
  const out = {};
  try {
    for (const l of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  } catch { /* ไม่มีไฟล์ */ }
  return out;
}

/** รหัสโปรเจกต์จาก URL — ใช้แสดงให้คนอ่านรู้ว่ากำลังแตะฐานไหน */
export function refOf(url) {
  return (String(url).match(/https?:\/\/([a-z0-9]+)\.supabase\./) ?? [])[1] ?? "(ไม่ทราบ)";
}

/**
 * @param {{ allowTest?: boolean, quiet?: boolean, ถือล็อกเอง?: boolean }} opt
 *   allowTest — ให้ใส่ --test ตอนเรียกเพื่อสลับไปฐานทดสอบได้ (ค่าตั้งต้น: ไม่ให้)
 *   ถือล็อกเอง — สคริปต์ขอล็อกฐานจริงเองต่อจากนี้ (db:push · สำรอง+ซ้อมกู้) = ไม่รอคิวตรงนี้
 */
export function loadTarget(opt = {}) {
  const wantTest = opt.allowTest && process.argv.includes("--test");
  const file = wantTest ? "apps/hq/.env.local" : ".env.production.local";
  if (!wantTest && !opt.ถือล็อกเอง) รอฐานจริงว่าง(`อ่าน/เขียนฐานจริง (${path.basename(process.argv[1] ?? "สคริปต์")})`);

  if (!existsSync(file)) {
    // ยังไม่ได้แยกไฟล์ (เครื่องที่ยัง setup ไม่ครบ) — ถอยไปใช้ของแอปแต่ต้องบอกให้รู้ตัว
    const fallback = readEnvFile("apps/hq/.env.local");
    if (!fallback.NEXT_PUBLIC_SUPABASE_URL) {
      console.error(`❌ ไม่พบค่าเชื่อมต่อฐานข้อมูล — ต้องมี ${file} หรือ apps/hq/.env.local`);
      process.exit(1);
    }
    console.log(`⚠️  ไม่พบ ${file} — ใช้ค่าจาก apps/hq/.env.local แทน`);
    console.log("   ถ้าเครื่องนี้แยกฐานทดสอบ/ฐานจริงแล้ว นี่อาจเป็นฐานทดสอบ ตรวจรหัสโปรเจกต์ข้างล่างก่อนทำต่อ");
    return describe(fallback, "(ไม่ระบุ)", opt);
  }
  return describe(readEnvFile(file), wantTest ? "ชุดทดสอบ" : "ชุดจริง", opt);
}

function describe(env, label, opt) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL, serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("❌ ค่าเชื่อมต่อไม่ครบ (ต้องมีทั้ง NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY)");
    process.exit(1);
  }
  const ref = refOf(url);
  if (!opt.quiet) console.log(`\n🎯 ฐานข้อมูลที่จะแตะ: ${label} · ${ref}`);
  return { url, serviceKey, anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", ref, label, env };
}

/** ฐานจริงคือที่อยู่นี้หรือไม่ (เทียบรหัสโปรเจกต์กับ .env.production.local) — ไม่มีไฟล์ฐานจริง = ถือว่าไม่ใช่ */
export function เป็นฐานจริง(url) {
  const prod = refOf(readEnvFile(".env.production.local").NEXT_PUBLIC_SUPABASE_URL ?? "");
  return prod !== "(ไม่ทราบ)" && refOf(url) === prod;
}
/** เครื่องมือของฐานทดสอบ: ชี้ฐานจริงเมื่อไร หยุดทันที (บอสสั่ง 19 ต.ค. 69 · ตัวนับเลขเอกสารของฐานจริงห้ามถูกตั้ง/กระโดด) */
export function ห้ามฐานจริง(url, ชื่อเครื่องมือ) {
  if (!เป็นฐานจริง(url)) return;
  console.error(`❌ ${ชื่อเครื่องมือ} ชี้ไปที่ฐานจริง — หยุด (เครื่องมือนี้ใช้กับฐานทดสอบเท่านั้น · ไฟล์ค่าเชื่อมต่อถูกสลับไปชี้ฐานจริงหรือเปล่า)`);
  process.exit(1);
}
