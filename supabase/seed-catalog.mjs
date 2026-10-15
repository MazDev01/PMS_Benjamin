// Seed แคตตาล็อกแม่แบบ/ราคากลาง (solutionProducts จาก mock.ts) เข้าตาราง master_catalog
// ใช้บัญชี HQ (is_hq) เขียน — ไม่ต้องใช้ service_role · idempotent (upsert ตาม id)
//
// รัน:  SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=… HQ_EMAIL=… HQ_PASSWORD=… node supabase/seed-catalog.mjs
// จำเป็นเมื่อใช้ NEXT_PUBLIC_DATA_SOURCE=supabase — ไม่งั้นหน้า "แม่แบบ" ของตัวแทนจะว่าง
import { createClient } from "@supabase/supabase-js";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// ฐานในเครื่องเท่านั้น (15 ต.ค. 69 · ก่อนขึ้นระบบจริง ข้อ 5): เดิมไม่ใส่ SUPABASE_URL = ยิงฐานจริงเป็นค่าตั้งต้น
//   แคตตาล็อกฐานจริงแก้ที่หน้า HQ เท่านั้น · ต้องระบุที่อยู่เอง และต้องเป็น 127.0.0.1/localhost
//   เดิมมีอีเมล/รหัสผู้ดูแลเป็นค่าตั้งต้นในโค้ด — เลิกแล้ว ต้องใส่เองทุกครั้ง
//   ฐานทดสอบแบบครบชุดใช้ scripts/reset-test-db.mjs แทน
const URL = process.env.SUPABASE_URL ?? "";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL)) {
  console.error("❌ ตั้ง SUPABASE_URL เป็นฐานในเครื่อง (http://127.0.0.1:<พอร์ต>) — ตัวนี้ไม่รันกับฐานบนคลาวด์");
  process.exit(1);
}
const ANON = process.env.SUPABASE_ANON_KEY ?? "", EMAIL = process.env.HQ_EMAIL ?? "", PASSWORD = process.env.HQ_PASSWORD ?? "";
if (!ANON || !EMAIL || !PASSWORD) { console.error("❌ ต้องตั้ง SUPABASE_ANON_KEY · HQ_EMAIL · HQ_PASSWORD"); process.exit(1); }

const require = createRequire(import.meta.url);
const ts = require("typescript");
const here = path.dirname(fileURLToPath(import.meta.url));
const MOCK = path.join(here, "..", "packages", "shared", "lib", "mock.ts");

// mock.ts ไม่มี import ใด ๆ → transpile แล้วรันตรง ๆ เพื่อดึงข้อมูลจริงออกมา (แหล่งเดียวกับที่แอปใช้)
const js = ts.transpileModule(readFileSync(MOCK, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = { exports: {} };
new Function("exports", "module", "require", js)(mod.exports, mod, require);
const { solutionProducts } = mod.exports;
if (!Array.isArray(solutionProducts) || !solutionProducts.length) {
  console.error("❌ อ่าน solutionProducts จาก mock.ts ไม่ได้"); process.exit(1);
}

const c2s = (k) => k.replace(/[A-Z]/g, (ch) => "_" + ch.toLowerCase());
const toSnake = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [c2s(k), v]));

const sb = createClient(URL, ANON, { auth: { persistSession: false } });
const { error: se } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (se) { console.error("❌ ล็อกอิน HQ ไม่สำเร็จ:", se.message); process.exit(1); }

const rows = solutionProducts.map(toSnake);
const { error } = await sb.from("master_catalog").upsert(rows, { onConflict: "id" });
if (error) { console.error("❌ upsert ล้มเหลว:", error.message); process.exit(1); }

const { data } = await sb.from("master_catalog").select("id,name,price").order("id");
console.log(`✓ seed แคตตาล็อก ${rows.length} รายการ → master_catalog มีทั้งหมด ${(data ?? []).length} รายการ`);
for (const p of data ?? []) console.log(`   · ${p.id} — ${p.name} (฿${Number(p.price).toLocaleString("th-TH")})`);
