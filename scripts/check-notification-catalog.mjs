// ── ตัวตรวจ: แจ้งเตือนมาจากตารางกลางที่เดียว (บอสสั่ง 21 ต.ค. 69 · รอบ 4 · ใบ 0231) ─────────────────────────────
//
// กติกา: กระดิ่งทั้งสองแอปและอีเมลอ่านจากตาราง notification_kinds ที่ฐาน · สร้างแจ้งเตือนได้ทาง _notify() ทางเดียว
// ตกเมื่อ:
//   1) ใบแก้ฐานข้อมูล (ตั้งแต่ 0231) เขียน notifications / email_outbox หรือเรียกตัววางจดหมายตรง นอกตัวกลาง
//   2) โค้ดหน้าเว็บ/เซิร์ฟเวอร์เขียนตาราง notifications · เขียน email_outbox นอกไฟล์ที่อนุญาต (โค้ดยืนยันอีเมล · ตัวส่ง)
//   3) กระดิ่งประกอบแจ้งเตือนเองจากแหล่งอื่น (ลีด/ใบ/นัด/บันทึกการใช้งาน/กฎแจ้งเตือนเดิม) หรือมีกระดิ่งตัวที่สอง
//   4) ตารางแจ้งเตือนใน docs/FLOW.html ไม่ตรงกับตารางกลางในใบแก้ฐานข้อมูล (ชนิด · กระดิ่ง · อีเมล)
//   5) แถวแจ้งเตือนอ้างขั้นใน FLOW ไม่ได้ · หรือขั้นที่ช่อง "ใครได้แจ้งเตือน" ไม่ใช่ "—" ไม่มีแถวแจ้งเตือน
// ข้อทดสอบของตัวตรวจ: tests/tools/check-notification-catalog.test.mjs (ทำของผิดแล้วต้องตก)
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ราก = process.argv[2] ?? process.cwd();
const ผิด = [];
const อ่าน = p => readFileSync(join(ราก, p), "utf8");

// ── 1) ใบแก้ฐานข้อมูลตั้งแต่ 0231 ────────────────────────────────────────────────────────────────
const ตัวกลาง = new Set(["_notify", "_email_enqueue_hq", "_email_enqueue_dealer"]);
const ใบ = readdirSync(join(ราก, "supabase/migrations")).filter(f => /^\d{4}_.*\.sql$/.test(f) && Number(f.slice(0, 4)) >= 231).sort();
const ต้องห้ามSQL = [/insert\s+into\s+(public\.)?(notifications|email_outbox)\b/i, /\b_email_enqueue_(hq|dealer)\s*\(/i];
for (const f of ใบ) {
  const sql = readFileSync(join(ราก, "supabase/migrations", f), "utf8").replace(/--[^\n]*/g, "");
  // ตัดเป็นช่วงของแต่ละฟังก์ชัน: ช่วงที่อยู่ในตัวกลางอนุญาต
  const ช่วง = [];
  const re = /create\s+or\s+replace\s+function\s+(?:public\.)?([a-z_0-9]+)\s*\(/gi;
  let m;
  while ((m = re.exec(sql))) {
    const เริ่ม = m.index, จบ = sql.indexOf("$$;", sql.indexOf("$$", เริ่ม) + 2);
    ช่วง.push({ ชื่อ: m[1], เริ่ม, จบ: จบ < 0 ? sql.length : จบ });
  }
  for (const r of ต้องห้ามSQL) {
    const g = new RegExp(r.source, "gi");
    let x;
    while ((x = g.exec(sql))) {
      const ใน = ช่วง.find(c => x.index > c.เริ่ม && x.index < c.จบ);
      // ประกาศตัววางจดหมายเอง (create function _email_enqueue_*() ) ไม่นับเป็นการเรียก
      if (ใน && (ตัวกลาง.has(ใน.ชื่อ))) continue;
      if (!ใน && /function\s+(public\.)?_email_enqueue_/i.test(sql.slice(Math.max(0, x.index - 40), x.index + 20))) continue;
      if (/revoke|grant/i.test(sql.slice(Math.max(0, x.index - 40), x.index))) continue;
      ผิด.push(`${f}: สร้างแจ้งเตือน/อีเมลนอกตัวกลาง${ใน ? ` (ในฟังก์ชัน ${ใน.ชื่อ})` : ""} → ใช้ _notify('ชนิดในตารางกลาง', …)`);
    }
  }
}

// ── 2) + 3) โค้ดแอป ────────────────────────────────────────────────────────────────────────────
const ไล่ = (dir, out = []) => {
  if (!existsSync(join(ราก, dir))) return out;
  for (const n of readdirSync(join(ราก, dir))) {
    if (n === "node_modules" || n === ".next" || n.startsWith(".")) continue;
    const p = join(dir, n);
    if (statSync(join(ราก, p)).isDirectory()) ไล่(p, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(n)) out.push(p.replace(/\\/g, "/"));
  }
  return out;
};
const ไฟล์แอป = [...ไล่("apps"), ...ไล่("packages")];
const เขียนกล่องได้ = new Set(["packages/shared/server/contactEmail.ts", "packages/shared/server/mail/outbox.ts"]);
for (const f of ไฟล์แอป) {
  const s = อ่าน(f);
  if (/from\(\s*["']notifications["']\s*\)\s*\.(insert|update|upsert|delete)\b/.test(s) || /from\(\s*["']notifications["']\s*\)[\s\S]{0,200}?\.(insert|upsert)\(/.test(s))
    ผิด.push(`${f}: เขียนตาราง notifications จากแอป — แจ้งเตือนสร้างที่ฐานทาง _notify เท่านั้น`);
  if (!เขียนกล่องได้.has(f) && /from\(\s*["']email_outbox["']\s*\)/.test(s))
    ผิด.push(`${f}: แตะกล่องขาออกอีเมลนอกไฟล์ที่อนุญาต — อีเมลแจ้งเตือนวางที่ฐานทาง _notify เท่านั้น`);
  if (/\bbuild(HQ)?Notifications\s*\(|\bbuildHQAlerts\s*\(|\buseHQAlerts\s*\(/.test(s))
    ผิด.push(`${f}: ประกอบแจ้งเตือนเองในหน้าเว็บ (buildNotifications/buildHQAlerts) — กระดิ่งอ่านจากตารางกลางเท่านั้น`);
  if (f !== "packages/shared/components/layout/NotificationBell.tsx" && /aria-label=["']การแจ้งเตือน["']/.test(s))
    ผิด.push(`${f}: มีปุ่มกระดิ่งตัวที่สอง — ใช้ NotificationBell ตัวเดียว`);
}
for (const f of ["packages/shared/components/layout/NotificationBell.tsx", "packages/shared/lib/useNotifications.ts"]) {
  const s = อ่าน(f);
  const แหล่งอื่น = s.match(/\b(useSales|useAuditEntries|useAudit|useHQAlerts|useDealerSettings|leads|quotations|appointments|audit|prospects|proposals)\b(?=[^\n]*from\s+["']@pms)/g)
    ?? s.match(/import\s*\{[^}]*\b(useSales|useAuditEntries|useHQAlerts)\b[^}]*\}/g);
  if (แหล่งอื่น) ผิด.push(`${f}: กระดิ่งดึงข้อมูลจากแหล่งอื่น (${[...new Set(แหล่งอื่น)].join(", ")}) — อ่านจาก notifications อย่างเดียว`);
}

// ── 4) FLOW ↔ ตารางกลาง ────────────────────────────────────────────────────────────────────────
const ใบตารางกลาง = ใบ.map(f => readFileSync(join(ราก, "supabase/migrations", f), "utf8")).join("\n");
// รวมทุกก้อน insert ของทุกใบ (0231 ตั้งตาราง · 0236 คืน 3 เรื่องตาม flow · ใบถัดไปเพิ่มต่อ)
const ก้อนทั้งหมด = [...ใบตารางกลาง.matchAll(/insert\s+into\s+public\.notification_kinds\s*\([^)]*\)\s*values([\s\S]*?);\s*\n/gi)];
const ตาราง = new Map();
if (!ก้อนทั้งหมด.length) ผิด.push("ไม่พบตารางกลาง notification_kinds ในใบแก้ฐานข้อมูล");
for (const ก้อน of ก้อนทั้งหมด) for (const r of ก้อน[1].matchAll(/\(\s*'([a-z_]+)'\s*,\s*'([DH]\d)'\s*,\s*'(dealer|hq)'\s*,\s*(true|false)\s*,\s*(true|false)/g))
  ตาราง.set(r[1], { แถว: r[2], กระดิ่ง: r[4] === "true", อีเมล: r[5] === "true" });
const flow = อ่าน("docs/FLOW.html");
const ในFLOW = new Map();
const แถวแจ้งเตือน = [];   // { แถว, ขั้น[] }
const ค่า = (tag, ชื่อ) => tag.match(new RegExp(`${ชื่อ}="([^"]*)"`))?.[1];
for (const m of flow.matchAll(/<tr\s+data-notif-row="[^>]*>/g)) {
  const tag = m[0];
  const แถว = ค่า(tag, "data-notif-row"), kinds = ค่า(tag, "data-notif-kinds") ?? "";
  แถวแจ้งเตือน.push({ แถว, ขั้น: (ค่า(tag, "data-flow-steps") ?? "").split(/\s+/).filter(Boolean) });
  for (const k of kinds.split(/\s+/).filter(Boolean))
    ในFLOW.set(k, { แถว, กระดิ่ง: ค่า(tag, "data-bell") === "1", อีเมล: ค่า(tag, "data-email") === "1" });
}

// ── 5) ขั้นใน FLOW ↔ แถวแจ้งเตือน (บอสสั่ง 21 ต.ค. 69 "เอาตาม flow") ─────────────────────────────────────
//   ตารางขั้น D/H = ตารางที่มีหัวคอลัมน์ "ใครได้แจ้งเตือน" · ช่องสุดท้ายไม่ใช่ "—" = ขั้นนั้นมีคนได้แจ้งเตือน
//   ทุกแถวแจ้งเตือนต้องอ้างขั้นที่มีอยู่และช่องไม่ใช่ "—" · ทุกขั้นที่ช่องไม่ใช่ "—" ต้องมีแถวแจ้งเตือนอ้างถึง
const ขั้น = new Map();   // รหัสขั้น → ข้อความช่องใครได้แจ้งเตือน
for (const t of flow.matchAll(/<table>([\s\S]*?)<\/table>/g)) {
  if (!/<th>ใครได้แจ้งเตือน<\/th>/.test(t[1])) continue;
  for (const r of t[1].matchAll(/<tr><td>([DH]\d+[a-z]?)<\/td>([\s\S]*?)<\/tr>/g)) {
    const ช่อง = [...r[2].matchAll(/<td>([\s\S]*?)<\/td>/g)].map(c => c[1].replace(/<[^>]+>/g, "").trim());
    ขั้น.set(r[1], ช่อง.at(-1) ?? "");
  }
}
const มีแจ้ง = (ข้อความ) => ข้อความ !== "" && !ข้อความ.startsWith("—");
if (!ขั้น.size) ผิด.push("ไม่พบตารางขั้นของ FLOW ที่มีคอลัมน์ \"ใครได้แจ้งเตือน\"");
for (const r of แถวแจ้งเตือน) {
  if (!r.ขั้น.length) ผิด.push(`แถวแจ้งเตือน ${r.แถว} ไม่ได้อ้างขั้นใน FLOW (data-flow-steps)`);
  for (const s of r.ขั้น) {
    if (!ขั้น.has(s)) ผิด.push(`แถวแจ้งเตือน ${r.แถว} อ้างขั้น ${s} ที่ไม่มีในตารางขั้นของ FLOW`);
    else if (!มีแจ้ง(ขั้น.get(s))) ผิด.push(`แถวแจ้งเตือน ${r.แถว} อ้างขั้น ${s} แต่ช่อง "ใครได้แจ้งเตือน" ของขั้นนั้นเป็น "—"`);
  }
}
const ขั้นที่ถูกอ้าง = new Set(แถวแจ้งเตือน.flatMap(r => r.ขั้น));
for (const [s, ข้อความ] of ขั้น) if (มีแจ้ง(ข้อความ) && !ขั้นที่ถูกอ้าง.has(s))
  ผิด.push(`ขั้น ${s} ใน FLOW บอกว่ามีคนได้แจ้งเตือน (${ข้อความ}) แต่ไม่มีแถวในตารางแจ้งเตือน`);
for (const [k, v] of ตาราง) {
  const f = ในFLOW.get(k);
  if (!f) ผิด.push(`ชนิด ${k} อยู่ในตารางกลางแต่ไม่อยู่ในตารางแจ้งเตือนของ docs/FLOW.html`);
  else if (f.แถว !== v.แถว || f.กระดิ่ง !== v.กระดิ่ง || f.อีเมล !== v.อีเมล)
    ผิด.push(`ชนิด ${k}: FLOW (${f.แถว} กระดิ่ง ${f.กระดิ่ง} อีเมล ${f.อีเมล}) ไม่ตรงตารางกลาง (${v.แถว} กระดิ่ง ${v.กระดิ่ง} อีเมล ${v.อีเมล})`);
}
for (const k of ในFLOW.keys()) if (!ตาราง.has(k)) ผิด.push(`ชนิด ${k} อยู่ใน FLOW แต่ไม่อยู่ในตารางกลาง`);

if (ผิด.length) {
  console.error(`check-notification-catalog: ตก ${ผิด.length} ข้อ`);
  for (const x of ผิด) console.error("  - " + x);
  process.exit(1);
}
console.log(`check-notification-catalog: ผ่าน — ตารางกลาง ${ตาราง.size} ชนิด · ${แถวแจ้งเตือน.length} แถว ตรงกับ FLOW · ขั้นที่มีแจ้งเตือน ${[...ขั้น.values()].filter(มีแจ้ง).length}/${ขั้น.size} ขั้นมีแถวครบ · ไม่มีโค้ดสร้างแจ้งเตือนนอกตารางกลาง (ตรวจใบ ${ใบ.length} ใบ · ไฟล์แอป ${ไฟล์แอป.length} ไฟล์)`);
