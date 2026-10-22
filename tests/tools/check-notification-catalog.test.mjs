// ── ข้อทดสอบของตัวตรวจ check-notification-catalog (mutation proof · ใบ 0231 · รอบ 4) ──────────────────────
// สร้างโฟลเดอร์จำลองจากไฟล์จริง แล้วทำของผิดทีละแบบ — ตัวตรวจต้องตกทุกแบบ และผ่านเมื่อไม่มีของผิด
// รัน: node tests/tools/check-notification-catalog.test.mjs
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";

const repo = process.cwd();
const ไฟล์จริง = [
  "supabase/migrations/0231_notification_catalog.sql",
  "supabase/migrations/0236_notification_flow_restore.sql",
  "docs/FLOW.html",
  "packages/shared/components/layout/NotificationBell.tsx",
  "packages/shared/lib/useNotifications.ts",
  "packages/shared/server/v1/notifications.ts",
  "packages/shared/server/mail/outbox.ts",
  "packages/shared/server/contactEmail.ts",
];
function จำลอง(แก้ = () => {}) {
  const root = mkdtempSync(join(tmpdir(), "notif-check-"));
  for (const f of ไฟล์จริง) { mkdirSync(dirname(join(root, f)), { recursive: true }); copyFileSync(join(repo, f), join(root, f)); }
  mkdirSync(join(root, "apps"), { recursive: true });
  แก้(root);
  const r = spawnSync(process.execPath, [join(repo, "scripts/check-notification-catalog.mjs"), root], { encoding: "utf8" });
  rmSync(root, { recursive: true, force: true });
  return { ผ่าน: r.status === 0, ข้อความ: (r.stdout + r.stderr).trim() };
}
const เขียน = (root, f, s) => { mkdirSync(dirname(join(root, f)), { recursive: true }); writeFileSync(join(root, f), s); };
const แทน = (root, f, a, b) => {
  const s = readFileSync(join(root, f), "utf8");
  if (typeof a === "string" ? !s.includes(a) : !a.test(s)) throw new Error(`ไม่พบข้อความใน ${f}: ${a}`);
  writeFileSync(join(root, f), s.replace(a, b));
};

const กรณี = [
  ["ใบใหม่: ฟังก์ชันอื่นเขียน notifications เอง", root => เขียน(root, "supabase/migrations/0299_rogue.sql",
    "create or replace function public.zz() returns void language sql as $$ insert into notifications (kind) values ('x') $$;\n")],
  ["ใบใหม่: ตัวดักเรียกตัววางจดหมายตรง (ยกเลิกคำขอส่งอีเมล)", root => เขียน(root, "supabase/migrations/0299_rogue.sql",
    "create or replace function public.zz() returns trigger language plpgsql as $$ begin perform _email_enqueue_hq('x:1','s','b','t','1'); return new; end $$;\n")],
  ["แอปเขียนตาราง notifications", root => เขียน(root, "packages/shared/lib/zz.ts", `sb.from("notifications").insert({ kind: "x" });\n`)],
  ["แอปแตะกล่องขาออกนอกไฟล์ที่อนุญาต", root => เขียน(root, "apps/hq/zz.ts", `admin.from("email_outbox").insert({});\n`)],
  ["หน้าเว็บประกอบแจ้งเตือนเอง", root => เขียน(root, "packages/shared/components/layout/Topbar.tsx", "const n = buildNotifications(leads, quotes);\n")],
  ["กระดิ่งตัวที่สอง", root => เขียน(root, "apps/dealer/zz.tsx", `<button aria-label="การแจ้งเตือน" />\n`)],
  ["กระดิ่งดึงข้อมูลลีดเอง", root => แทน(root, "packages/shared/components/layout/NotificationBell.tsx",
    `import { useNotifications } from "@pms/shared/lib/useNotifications";`,
    `import { useNotifications } from "@pms/shared/lib/useNotifications";\nimport { useSales } from "@pms/shared/context/SalesContext";`)],
  ["FLOW บอกอีเมลไม่ตรงตารางกลาง", root => แทน(root, "docs/FLOW.html",
    `data-notif-kinds="hq_quote_expired" data-bell="1" data-email="0"`,
    `data-notif-kinds="hq_quote_expired" data-bell="1" data-email="1"`)],
  ["ตารางกลางมีชนิดที่ไม่อยู่ใน FLOW", root => แทน(root, "supabase/migrations/0231_notification_catalog.sql",
    `('franchise_payment_overdue', 'H5', 'hq', true, false,`, `('quote_request_cancelled', 'H6', 'hq', true, true, 'x', 'x', '/', 160),\n  ('franchise_payment_overdue', 'H5', 'hq', true, false,`)],
  // ขั้นใน FLOW ↔ แถวแจ้งเตือน (ใบ 0236 · บอสสั่ง "เอาตาม flow")
  ["ขั้นใน FLOW มีคนได้แจ้งเตือนแต่ไม่มีแถว (ลูกค้าปฏิเสธ D8x)", root => แทน(root, "docs/FLOW.html",
    /(<tr><td>D8x<\/td>[\s\S]*?)<td>—<\/td><\/tr>/, "$1<td>HQ (อีเมล)</td></tr>")],
  ["แถวแจ้งเตือนอ้างขั้นที่ช่องเป็น \"—\" (ตัดแจ้งเตือนยกเลิกคำขอออกจากขั้น D3x)", root => แทน(root, "docs/FLOW.html",
    /(<tr><td>D3x<\/td>[\s\S]*?)<td><span class="pill h">[^<]*<\/span><\/td><\/tr>/, "$1<td>—</td></tr>")],
  ["แถวแจ้งเตือนอ้างขั้นที่ไม่มีใน FLOW", root => แทน(root, "docs/FLOW.html", `data-flow-steps="D3x"`, `data-flow-steps="D99"`)],
  ["แถวแจ้งเตือนไม่บอกขั้นใน FLOW", root => แทน(root, "docs/FLOW.html", ` data-flow-steps="H2" `, ` `)],
  ["ตัดแถวที่คืนตาม flow ออกจากตารางกลาง (ยกเลิกคำขอ)", root => แทน(root, "supabase/migrations/0236_notification_flow_restore.sql",
    /\s*\('request_cancelled',[^\n]*\n[^\n]*\n/, "\n")],
];

let ตก = 0;
const ปกติ = จำลอง();
if (!ปกติ.ผ่าน) { console.error("FAIL: ไม่มีของผิดแต่ตัวตรวจตก\n" + ปกติ.ข้อความ); ตก++; } else console.log("ok  ไม่มีของผิด → ผ่าน");
for (const [ชื่อ, แก้] of กรณี) {
  const r = จำลอง(แก้);
  if (r.ผ่าน) { console.error(`FAIL: ${ชื่อ} → ตัวตรวจต้องตกแต่ผ่าน`); ตก++; }
  else console.log(`ok  ${ชื่อ} → ตก (${r.ข้อความ.split("\n")[1]?.trim() ?? ""})`);
}
if (ตก) { console.error(`ตก ${ตก} ข้อ`); process.exit(1); }
console.log("ALL PASS");
