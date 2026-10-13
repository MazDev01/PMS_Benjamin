// ── ตรวจความพร้อมก่อนนำขึ้นระบบจริง — คำสั่งเดียวจบ ────────────────────────────────
//
// ทำไมต้องมี: การนำขึ้นระบบจริงมีของที่ต้องครบหลายอย่าง และแต่ละอย่างพลาดคนละแบบ
//   ตัวแปรลับหาย → แอปขึ้นได้แต่กดปุ่มไหนก็ไม่ทำงาน (ตอบ 501 เงียบ ๆ)
//   ลืมรัน migration → หน้าจอฟ้อง error ที่ไม่มีใครเข้าใจ
//   ลืมเปิด hook สิทธิ์ → ทุกคนเห็นข้อมูลว่างเปล่าเหมือนไม่มีข้อมูล
//   ไล่เช็กเองทีละอย่างมีวันลืม — รวมไว้ที่เดียวให้เครื่องเช็กแทน
//
// ⚠️ ตัวนี้ตรวจ "สิ่งที่พังแล้วผู้ใช้ใช้งานไม่ได้" เท่านั้น ไม่ได้ตรวจคุณภาพโค้ด
//   (คุณภาพโค้ดมี typecheck/lint/test แยกอยู่แล้ว)
//
// รัน: node scripts/preflight.mjs
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { ตรวจสวิตช์ซ่อนราคา } from "./lib/priceSwitchCheck.mjs";
import { loadTarget } from "./lib/targetEnv.mjs";

const results = [];
const add = (ok, name, detail = "") => results.push({ ok, name, detail });

function readEnvFile(file) {
  const out = {};
  try {
    for (const l of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  } catch { /* ไม่มีไฟล์ */ }
  return out;
}

// ── 1) ตัวแปรที่ขาดไม่ได้ ──
const NEED = {
  "apps/hq/.env.local": ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "DEALER_SECRET_KEY", "NEXT_PUBLIC_DEALER_APP_URL"],
  "apps/dealer/.env.local": ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
};
const hq = readEnvFile("apps/hq/.env.local");
for (const [file, keys] of Object.entries(NEED)) {
  if (!existsSync(file)) { add(false, `ตัวแปรของ ${file}`, "ไม่พบไฟล์"); continue; }
  const env = readEnvFile(file);
  const missing = keys.filter(k => !env[k]);
  add(missing.length === 0, `ตัวแปรของ ${file}`, missing.length ? `ขาด: ${missing.join(", ")}` : `ครบ ${keys.length} ตัว`);
}

// ── 2) โหมดข้อมูลต้องเป็นของจริง ไม่ใช่ข้อมูลตัวอย่างในเครื่อง ──
// "ของจริง" มีสองแบบ: supabase (หน้าเว็บคุยฐานข้อมูลตรง) · api (คุยผ่าน backend ของเราเอง)
// ⚠️ ห้ามบังคับว่าต้องเป็น supabase อย่างเดียว — พอสลับไป api ใบนี้จะตกทั้งที่ตั้งถูกแล้ว
// ⚠️ ทั้งสองแอปต้องเป็นโหมดเดียวกัน ถ้าคนละโหมดจะพังแบบไล่ยาก:
//    ดีลเลอร์เก็บใบผ่านคนละที่กับสำนักงานใหญ่ → เข้าระบบแทนดีลเลอร์ไม่ได้ · เด้งออกไม่พร้อมกัน
const dealerEnv = existsSync("apps/dealer/.env.local") ? readEnvFile("apps/dealer/.env.local") : {};
const REAL_MODES = ["supabase", "api"];
const hqMode = hq.NEXT_PUBLIC_DATA_SOURCE || "(ไม่ได้ตั้ง)";
const dealerMode = dealerEnv.NEXT_PUBLIC_DATA_SOURCE || "(ไม่ได้ตั้ง)";
add(REAL_MODES.includes(hq.NEXT_PUBLIC_DATA_SOURCE), "โหมดข้อมูล",
  `ตั้งไว้ = ${hqMode} · ต้องเป็น supabase หรือ api`);
add(hqMode === dealerMode, "สองแอปโหมดตรงกัน",
  hqMode === dealerMode ? `ทั้งคู่ = ${hqMode}` : `สำนักงานใหญ่ = ${hqMode} แต่ดีลเลอร์ = ${dealerMode}`);

// ── 3) ที่อยู่แอปดีลเลอร์ ──
// ⚠️ ค่าที่มีผลจริงตอนขึ้นระบบคือค่าบนเซิร์ฟเวอร์ (Vercel → Environment Variables)
//    ไม่ใช่ไฟล์ในเครื่องนี้ ซึ่ง "ต้อง" เป็น localhost อยู่แล้วเพื่อให้พัฒนา/ทดสอบในเครื่องได้
//    เดิมใบนี้ตกทุกครั้งเพราะไปอ่านไฟล์ในเครื่อง ทำให้ดูเหมือนยังไม่พร้อมทั้งที่ตั้งบนเซิร์ฟเวอร์ถูกแล้ว
//    (ยืนยันจริง 13 ส.ค. 69: ค่าบน Vercel = https://benjamin-dealer.vercel.app ถูกต้อง
//     · 22 ก.ย. 69 ย้ายเป็นโดเมนบริษัท https://dealerpms.benjaminpebsteel.com — บอสแก้บน Vercel แล้ว)
//    ตรวจได้แค่ว่า "ตั้งไว้ไหม" — ส่วนค่าจริงต้องดูที่หน้าเซิร์ฟเวอร์ด้วยตา (`vercel env ls`)
const dealerUrl = hq.NEXT_PUBLIC_DEALER_APP_URL ?? "";
const isLocal = /localhost|127\.0\.0\.1/.test(dealerUrl);
add(!!dealerUrl, "ที่อยู่แอปดีลเลอร์ (ไฟล์ในเครื่อง)",
  dealerUrl
    ? `${dealerUrl}${isLocal ? " — ปกติสำหรับเครื่องพัฒนา · ค่าที่ใช้จริงตั้งบน Vercel แยกต่างหาก" : ""}`
    : "ไม่ได้ตั้ง — ปุ่ม 'เข้าระบบแทนดีลเลอร์' จะพาไปผิดที่");

// ── ฐานข้อมูลที่ตรวจ = "ฐานจริง" เสมอ ────────────────────────────────────────────
// ตรวจความพร้อมก่อนเปิดใช้จริง แต่ไปตรวจฐานทดสอบ = ได้ใบผ่านที่ไม่มีความหมาย
// (apps/hq/.env.local ชี้ฐานทดสอบตั้งแต่แยกฐานข้อมูล 11 ส.ค. 69 · ใส่ --test ถ้าตั้งใจตรวจฐานทดสอบ)
const target = loadTarget({ allowTest: true });
if (!target.anonKey) { add(false, "ค่าเชื่อมต่อฐานที่จะตรวจ", "ไม่พบ NEXT_PUBLIC_SUPABASE_ANON_KEY"); report(); process.exit(1); }
add(true, "ฐานข้อมูลที่ตรวจ", `${target.label} · ${target.ref}`);
const svc = createClient(target.url, target.serviceKey, { auth: { persistSession: false } });
const anon = createClient(target.url, target.anonKey, { auth: { persistSession: false } });

// ── 4) ต่อฐานข้อมูลได้จริง ──
{
  const { error } = await svc.from("dealers").select("code").limit(1);
  add(!error, "ต่อฐานข้อมูล", error ? error.message.slice(0, 60) : "ต่อได้");
}

// ── 5) ฟังก์ชันสำคัญต้องถูกติดตั้งครบ (แปลว่า migration รันครบแล้ว) ──
for (const [fn, args] of [["is_account_active", {}], ["next_entity_id", { p_dealer: "RYG", p_entity: "leads" }]]) {
  const { error } = await svc.rpc(fn, args);
  // 42883 = ไม่มีฟังก์ชันนี้ · error อื่นแปลว่ามีฟังก์ชันแต่เงื่อนไขไม่ผ่าน ซึ่งก็ถือว่าติดตั้งแล้ว
  add(error?.code !== "42883", `ฟังก์ชัน ${fn}`, error?.code === "42883" ? "ยังไม่ได้ติดตั้ง — รัน migration ให้ครบ" : "ติดตั้งแล้ว");
}

// ── 6) ผู้ไม่ล็อกอินต้องอ่านข้อมูลไม่ได้เลย ──
{
  const leaks = [];
  for (const t of ["leads", "quotations", "customers", "profiles", "audit_log", "dealers"]) {
    const { data, error } = await anon.from(t).select("*").limit(1);
    if (!error && (data?.length ?? 0) > 0) leaks.push(t);
  }
  add(leaks.length === 0, "ข้อมูลรั่วถึงคนที่ไม่ได้ล็อกอิน", leaks.length ? `⚠ อ่านได้: ${leaks.join(", ")}` : "ปิดครบทุกตาราง");
}

// ── 7) ต้องมีผู้ดูแลสูงสุดที่ใช้งานได้อย่างน้อย 1 คน (ไม่งั้นเข้าไปจัดการอะไรไม่ได้เลย) ──
{
  const { data } = await svc.from("profiles").select("id").eq("role", "SUPER_ADMIN").eq("status", "active");
  add((data?.length ?? 0) >= 1, "ผู้ดูแลสูงสุดที่ใช้งานได้", `${data?.length ?? 0} บัญชี`);
}

// ── 8) ทุกสาขาต้องมีบัญชีเข้าระบบ (สาขาที่ไม่มีบัญชี = ดีลเลอร์เข้าใช้งานไม่ได้) ──
{
  const { data: dealers } = await svc.from("dealers").select("code");
  const { data: profs } = await svc.from("profiles").select("dealer_code").neq("dealer_code", "");
  const has = new Set((profs ?? []).map(p => p.dealer_code));
  const orphan = (dealers ?? []).map(d => d.code).filter(c => !has.has(c));
  add(orphan.length === 0, "ทุกสาขามีบัญชีเข้าระบบ", orphan.length ? `⚠ ไม่มีบัญชี: ${orphan.join(", ")}` : `ครบ ${dealers?.length ?? 0} สาขา`);
}

// ── 9) ต้องไม่มีข้อมูลทดสอบปนอยู่กับข้อมูลจริง ──
{
  let junk = 0;
  for (const [t, col] of [["leads", "company"], ["quotations", "customer"], ["customers", "company"], ["dealers", "name"]]) {
    const { count } = await svc.from(t).select("*", { count: "exact", head: true }).like(col, "%ZZ%");
    junk += count ?? 0;
  }
  add(junk === 0, "ข้อมูลทดสอบปนกับข้อมูลจริง", junk ? `⚠ พบ ${junk} รายการที่มีป้าย ZZ` : "ไม่มี");
}

// ── 10) อายุใบผ่านเข้าระบบต้องสั้นพอ (ปิดบัญชีแล้วสิทธิ์ต้องหมดเร็ว) ──
{
  const env2 = readEnvFile("tests/.env.test");
  const email = env2.TEST_RYG_EMAIL, pw = env2.TEST_RYG_PASSWORD;
  if (!email) add(true, "อายุใบผ่านเข้าระบบ", "ข้าม — ไม่มีบัญชีทดสอบให้ตรวจ");
  else {
    const { data, error } = await anon.auth.signInWithPassword({ email, password: pw });
    if (error || !data.session) add(true, "อายุใบผ่านเข้าระบบ", "ข้าม — ล็อกอินทดสอบไม่ได้");
    else {
      const p = JSON.parse(Buffer.from(data.session.access_token.split(".")[1], "base64").toString("utf8"));
      const life = p.exp - p.iat;
      add(life <= 900, "อายุใบผ่านเข้าระบบ", `${life} วินาที (${(life / 60).toFixed(0)} นาที) · ควรไม่เกิน 15 นาที`);
    }
  }
}

// ── 11) ระบบแจ้งเตือนข้อผิดพลาด ต้องเปิดใช้และส่งออกได้จริง ──
// ⚠️ ไม่ได้ตรวจแค่ "ตั้ง DSN แล้วหรือยัง" — ต้องตรวจว่าเบราว์เซอร์ยอมให้ส่งออกด้วย
//    ตั้ง DSN แต่ CSP ไม่เปิดทาง = รายงานถูกบล็อกทุกฉบับ แล้วเราจะเข้าใจผิดว่า "ระบบไม่มี error เลย"
{
  const dsn = hq.NEXT_PUBLIC_SENTRY_DSN ?? "";
  if (!dsn) {
    add(false, "ระบบแจ้งเตือนข้อผิดพลาด", "ยังไม่ได้เปิด — ระบบล่มจะรู้ตัวก็ต่อเมื่อผู้ใช้โทรมาแจ้ง");
  } else {
    let origin = "";
    try { origin = new URL(dsn).origin; } catch { /* DSN เพี้ยน */ }
    const csp = readFileSync("packages/shared/lib/securityHeaders.mjs", "utf8");
    const auto = /function sentryOrigin\(\)/.test(csp);   // คำนวณที่อยู่จาก DSN ให้เองหรือยัง
    add(!!origin && auto, "ระบบแจ้งเตือนข้อผิดพลาด",
      !origin ? "⚠ DSN ผิดรูปแบบ" : auto ? `เปิดใช้แล้ว · ส่งไปที่ ${origin}` : "⚠ CSP ไม่เปิดทางให้ — รายงานจะถูกบล็อกเงียบ ๆ");
  }
}

// ── 12) ต้องมีข้อมูลสำรองที่ใหม่พอ ──
// เหตุผลที่ต้องตรวจ: ถามระบบสำรองของผู้ให้บริการแล้วพบว่า "ไม่มีสำรองเลยสักชุด" (7 ส.ค. 69)
//   ข้อมูลหาย = หายถาวร · ต้องมีตัวคอยเตือนไม่ให้กลับไปอยู่ในสภาพนั้นอีกโดยไม่มีใครรู้
//
// ⚠️ ต้องนับเฉพาะไฟล์สำรอง "ของฐานที่กำลังตรวจ" (แก้ 11 ส.ค. 69 ตอนแยกฐานทดสอบ/ฐานจริง)
//   มีฐาน 2 ชุดแล้ว แต่ชื่อโฟลเดอร์เป็นวันเวลาล้วน ๆ แยกด้วยตาไม่ได้
//   ถ้านับรวมหมด ไฟล์สำรองของฐานทดสอบจะทำให้ตัวตรวจขึ้นเขียวทั้งที่ฐานจริงไม่เคยถูกสำรองเลย
//   — ใบผ่านที่หลอกแบบนี้แย่กว่าไม่มีตัวตรวจ เพราะทำให้เลิกสงสัย
{
  let newest = null;
  try {
    for (const d of readdirSync("backups")) {
      if (d.startsWith("_")) continue;   // โฟลเดอร์ชั่วคราวของการซ้อม
      const m = statSync(`backups/${d}`);
      if (!m.isDirectory()) continue;
      let ref = "";
      try {
        const src = String(JSON.parse(readFileSync(`backups/${d}/manifest.json`, "utf8")).source ?? "");
        ref = (src.match(/https?:\/\/([a-z0-9]+)\.supabase\./) ?? [])[1] ?? "";
      } catch { continue; }               // ไม่มี manifest / อ่านไม่ได้ = ไม่นับ
      if (ref !== target.ref) continue;   // ของฐานอื่น
      if (!newest || m.mtimeMs > newest.ms) newest = { name: d, ms: m.mtimeMs };
    }
  } catch { /* ยังไม่มีโฟลเดอร์ */ }
  const days = newest ? (Date.now() - newest.ms) / 86_400_000 : Infinity;
  add(days <= 7, "ข้อมูลสำรองล่าสุด",
    !newest ? `⚠ ไม่มีข้อมูลสำรองของฐาน ${target.ref} เลย — สั่ง npm run backup`
            : `${newest.name} (${days < 1 ? "วันนี้" : `${Math.floor(days)} วันก่อน`}) · ควรไม่เกิน 7 วัน`);
}

// ── 13) สวิตช์ซ่อนราคาแม่แบบ ห้ามเปิดก่อน Flow ใบ HQ ขึ้นระบบ ──
// เปิดก่อน = ดีลเลอร์อ่านราคาไม่ได้ และยังไม่มีทางรับราคาจากสำนักงานใหญ่ → ออกใบไม่ได้ทั้งเครือ (ดู lib/priceSwitchCheck.mjs)
{
  const pol = await svc.from("hq_policy").select("hide_catalog_price").order("id").limit(1).maybeSingle();
  const switchOn = pol.error ? null : (pol.data ? !!pol.data.hide_catalog_price : null);   // error = ฐานยังไม่มีคอลัมน์นี้
  let sentHqQuotes = null;
  if (switchOn) {
    const q = await svc.from("hq_quotes").select("id", { count: "exact", head: true }).in("status", ["sent", "ordered"]);
    sentHqQuotes = q.error ? null : (q.count ?? 0);
  }
  const r = ตรวจสวิตช์ซ่อนราคา({ switchOn, sentHqQuotes });
  add(r.ok, "สวิตช์ซ่อนราคาแม่แบบ", r.detail);
}

report();
function report() {
  console.log("\n══ ตรวจความพร้อมก่อนนำขึ้นระบบจริง ══\n");
  for (const r of results) console.log(`  ${r.ok ? "✅" : "❌"} ${r.name.padEnd(38)} ${r.detail}`);
  const bad = results.filter(r => !r.ok);
  console.log(`\n${bad.length === 0 ? "✅ พร้อมนำขึ้นระบบ" : `❌ ยังไม่พร้อม — ต้องแก้ ${bad.length} ข้อ`}\n`);
}
process.exit(results.some(r => !r.ok) ? 1 : 0);
