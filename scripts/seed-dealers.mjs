// ── ลงทะเบียนดีลเลอร์ตั้งต้น + เปิดบัญชีเข้าระบบให้ทุกสาขา ────────────────────────
//
// ข้อมูลมาจากไฟล์ที่เบนจามินส่งมา (แผ่น dealer) คัดด้วยเกณฑ์ที่บอสสั่งไว้:
//   ตัวอักษรชื่อเป็น "สีดำ" (แดง/ส้ม/ทอง = ข้อมูลไม่ครบ ไม่เอา) + โทรแล้ว + มีเบอร์ + มีจังหวัดจริง
//   313 แถว → 154 ราย · รายละเอียดการคัดอยู่ใน docs/ตัวแทนจำหน่าย-นำเข้าระบบ.xlsx แท็บ "ที่มาของแต่ละราย"
//
// อีเมล/รหัสผ่าน: ระบบตั้งให้อัตโนมัติ (บอสสั่ง 7 ก.ย. 69) — ดีลเลอร์เข้าไปเปลี่ยนเองภายหลังได้
//   อีเมล   = <รหัสสาขาตัวเล็ก>@partner-agent.co.th   (โดเมนเดียวกับที่ route ของระบบใช้)
//   รหัสผ่าน = สุ่มตามกติกา strongPassword ของ adminRoute.ts
//
// ⚠️ รหัสสาขาต้องเป็น A–Z 2–5 ตัวเท่านั้น — ทุก route ของผู้ดูแล (สร้าง/รีเซ็ตรหัส/สวมสิทธิ์/ย้ายสาขา)
//    ตรวจด้วย /^[A-Z]{2,5}$/ ถ้ามีตัวเลขปนจะใช้งานเมนูพวกนั้นกับสาขานั้นไม่ได้เลยสักอัน
//
// ลำดับการทำงานเหมือน apps/hq/app/api/admin/dealers/route.ts เป๊ะ ๆ:
//   auth user → dealers → profiles(DEALER_ADMIN) → dealer_settings(ชื่อบริษัทตั้งต้น) → สำเนารหัส(เข้ารหัส)
//
// ใช้:  node scripts/seed-dealers.mjs            → ดูว่าจะทำอะไรบ้าง (ไม่แตะฐานข้อมูล)
//       node scripts/seed-dealers.mjs --apply    → ลงมือจริง
//       เพิ่ม --replace-codes ถ้าต้องล้างทะเบียนเดิมทิ้งก่อน (ใช้ตอนรหัสชุดเดิมผิดกติกา)
//       เพิ่ม --only=HQ,CNXA เพื่อทำเฉพาะบางสาขา (เช่นเติมสาขาใหม่ทีหลัง ไม่ต้องแตะของเดิม)
import { readFileSync, writeFileSync } from "node:fs";
import { createCipheriv, randomBytes, createHash, webcrypto } from "node:crypto";
import { loadTarget, readEnvFile } from "./lib/targetEnv.mjs";

const APPLY = process.argv.includes("--apply");
const REPLACE = process.argv.includes("--replace-codes");
const DOMAIN = "partner-agent.co.th";
const SEED = "scripts/data/dealers-seed.json";
// ⚠️ ตอนทำเฉพาะบางสาขา ต้องเขียนคนละไฟล์ — ไม่งั้นไปทับรายชื่อรหัสผ่านของรอบที่แล้วจนหายทั้งกอง
const OUT = process.argv.some(a => a.startsWith("--only="))
  ? `backups/dealer-accounts-${new Date().toISOString().slice(0, 10)}.json`
  : "backups/dealer-accounts.json";

const { url, serviceKey } = loadTarget();
const SECRET_KEY = readEnvFile(".env.production.local").DEALER_SECRET_KEY ?? "";
const ONLY = (process.argv.find(a => a.startsWith("--only=")) ?? "").slice(7)
  .split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
const ทั้งหมด = JSON.parse(readFileSync(SEED, "utf8"));
const rows = ONLY.length ? ทั้งหมด.filter(d => ONLY.includes(d.code)) : ทั้งหมด;
if (ONLY.length) {
  const ไม่เจอ = ONLY.filter(c => !ทั้งหมด.some(d => d.code === c));
  if (ไม่เจอ.length) { console.error("❌ ไม่มีรหัสนี้ในไฟล์ตั้งต้น:", ไม่เจอ.join(", ")); process.exit(1); }
}
const h = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };

const ผิดกติกา = rows.filter(d => !/^[A-Z]{2,5}$/.test(d.code));
if (ผิดกติกา.length) {
  console.error("❌ รหัสสาขาผิดกติกา (ต้องเป็น A–Z 2–5 ตัว):", ผิดกติกา.map(d => d.code).join(", "));
  process.exit(1);
}

/** รหัสผ่านสุ่ม — กติกาเดียวกับ adminRoute.strongPassword (ไม่มีตัวที่อ่านสับสน เช่น 0/O, 1/l) */
function strongPassword(prefix) {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ", lower = "abcdefghijkmnpqrstuvwxyz", digit = "23456789";
  const all = upper + lower + digit, b = new Uint8Array(16);
  webcrypto.getRandomValues(b);
  const pick = (s, i) => s[b[i] % s.length];
  let out = pick(upper, 0) + pick(lower, 1) + pick(digit, 2);
  for (let i = 3; i < 14; i++) out += pick(all, i);
  return prefix + out;
}

/** สำเนารหัสผ่านที่ HQ เปิดดูย้อนหลังได้ — เข้ารหัสเสมอ (รูปแบบเดียวกับ dealerSecret.ts) */
function encryptSecret(plain) {
  if (SECRET_KEY.length < 32 || !plain) return null;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", createHash("sha256").update(SECRET_KEY).digest(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

const send = async (method, path, body, prefer) => {
  const r = await fetch(`${url}${path}`, {
    method, headers: prefer ? { ...h, Prefer: prefer } : h,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { ok: r.ok, status: r.status, text: await r.text() };
};

const เดิม = JSON.parse((await send("GET", "/rest/v1/dealers?select=code,name")).text);
console.log(`\nดีลเลอร์ในฐานตอนนี้: ${เดิม.length} ราย · ในไฟล์ตั้งต้น: ${rows.length} ราย`);
console.log(`เก็บสำเนารหัสผ่านให้ HQ เปิดดูได้: ${SECRET_KEY.length >= 32 ? "ได้" : "ไม่ได้ (ยังไม่ได้ตั้ง DEALER_SECRET_KEY)"}`);
if (!APPLY) {
  console.log("\n— โหมดดูอย่างเดียว ยังไม่แตะฐานข้อมูล —");
  console.log(`  ${REPLACE ? "จะลบทะเบียนเดิมทิ้งก่อน แล้ว" : "จะ"}เพิ่มดีลเลอร์ ${rows.length} ราย`);
  console.log(`  จะเปิดบัญชี ${rows.length} บัญชี · อีเมลตัวอย่าง ${rows[0].code.toLowerCase()}@${DOMAIN}`);
  console.log("  ใส่ --apply เพื่อลงมือจริง");
  process.exit(0);
}

if (REPLACE && เดิม.length) {
  const del = await send("DELETE", "/rest/v1/dealers?code=neq.__none__", undefined, "return=minimal");
  console.log("ลบทะเบียนเดิม:", del.ok ? "สำเร็จ" : `ไม่สำเร็จ ${del.status} ${del.text.slice(0, 150)}`);
  if (!del.ok) process.exit(1);
}

const done = [], failed = [];
for (const d of rows) {
  const email = `${d.code.toLowerCase()}@${DOMAIN}`;
  const password = strongPassword("PEB-");
  const u = await send("POST", "/auth/v1/admin/users", { email, password, email_confirm: true });
  if (!u.ok) { failed.push({ code: d.code, ขั้นตอน: "บัญชีเข้าระบบ", ปัญหา: u.text.slice(0, 150) }); continue; }
  const uid = JSON.parse(u.text).id;

  const ins = await send("POST", "/rest/v1/dealers?on_conflict=code", d, "resolution=merge-duplicates,return=minimal");
  if (!ins.ok) { failed.push({ code: d.code, ขั้นตอน: "ทะเบียนสาขา", ปัญหา: ins.text.slice(0, 150) }); continue; }

  const prof = await send("POST", "/rest/v1/profiles?on_conflict=id",
    { id: uid, role: "DEALER_ADMIN", dealer_code: d.code, name: d.name, status: "active" },
    "resolution=merge-duplicates,return=minimal");
  if (!prof.ok) { failed.push({ code: d.code, ขั้นตอน: "โปรไฟล์", ปัญหา: prof.text.slice(0, 150) }); continue; }

  // ชื่อบริษัทตั้งต้นของสาขา — ล้มตรงนี้ไม่ทำให้สาขาใช้ไม่ได้ แต่ห้ามเงียบ
  const st = await send("POST", "/rest/v1/dealer_settings", { dealer_code: d.code, issuer: { company: d.name } }, "return=minimal");
  if (!st.ok && !/23505/.test(st.text)) console.error(`  ตั้งชื่อบริษัทตั้งต้นของ ${d.code} ไม่สำเร็จ`, st.text.slice(0, 100));

  const secret = encryptSecret(password);
  if (secret) {
    const k = await send("POST", "/rest/v1/dealer_login_secrets?on_conflict=dealer_code",
      { dealer_code: d.code, secret, updated_at: new Date().toISOString(), updated_by: "นำเข้าข้อมูลตั้งต้น" },
      "resolution=merge-duplicates,return=minimal");
    if (!k.ok) console.error(`  เก็บสำเนารหัสของ ${d.code} ไม่สำเร็จ`, k.text.slice(0, 100));
  }
  done.push({ รหัสสาขา: d.code, ชื่อ: d.name, จังหวัด: d.province, อีเมล: email, รหัสผ่าน: password });
  if (done.length % 25 === 0) console.log("  เปิดบัญชีแล้ว", done.length, "สาขา");
}

// ⚠️ ไฟล์นี้มีรหัสผ่านของทุกสาขา — อยู่ใน backups/ ซึ่ง .gitignore กันไว้แล้ว ห้ามส่งขึ้น git
writeFileSync(OUT, JSON.stringify({ สร้างเมื่อ: new Date().toISOString(), สำเร็จ: done, ล้มเหลว: failed }, null, 1), "utf8");
console.log(`\nสำเร็จ ${done.length} · ล้มเหลว ${failed.length}`);
if (failed.length) console.log(JSON.stringify(failed.slice(0, 5), null, 1));
console.log(`รายชื่ออีเมล/รหัสผ่านอยู่ที่ ${OUT} (อย่าส่งขึ้น git · แจกให้แต่ละสาขาทางช่องทางที่ปลอดภัย)`);
