// ── ตัวตรวจ: ทุกหน้า (route) และทุกเมนู ของทั้งสองแอป ต้องอยู่ในตาราง "ทุกหน้าในระบบ" ของ docs/FLOW.html ───────────
//   บอสสั่ง 19 ต.ค. 69 (รอบ 2 งานไล่ flow): "ระบบจะได้ไม่มีหน้าเก่าโผล่กลับมา"
//   ตก เมื่อ:  มีหน้าในแอปที่ไม่อยู่ในตาราง · ตารางมีหน้าที่ไม่มีในแอปแล้ว · เมนูซ้ายมีรายการที่ตารางไม่ได้ผูกชื่อเมนูไว้
//              · ตารางบอกว่าหน้านั้นมีเมนู แต่เมนูซ้ายไม่มี (ชื่อต้องตรงทุกตัวอักษร)
//   แหล่งข้อมูล: apps/<แอป>/app/**/page.tsx (ตัดกลุ่ม "(…)" ออก) · packages/shared/components/layout/navConfig.tsx (DEALER_NAV / HQ_NAV)
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.argv[2] ?? ".";
const FLOW = readFileSync(path.join(ROOT, "docs/FLOW.html"), "utf8");
const NAV = readFileSync(path.join(ROOT, "packages/shared/components/layout/navConfig.tsx"), "utf8");

function หน้าในแอป(app) {
  const base = path.join(ROOT, "apps", app, "app");
  const out = new Set();
  const เดิน = (dir) => {
    for (const n of readdirSync(dir)) {
      const p = path.join(dir, n);
      if (statSync(p).isDirectory()) { if (n !== "api" && !n.startsWith("_")) เดิน(p); continue; }
      if (n !== "page.tsx") continue;
      const rel = path.relative(base, path.dirname(p)).split(path.sep).filter(s => !/^\(.*\)$/.test(s));
      out.add("/" + rel.join("/"));
    }
  };
  เดิน(base);
  return out;
}

function ตารางFlow(app) {
  const m = FLOW.match(new RegExp(`<table data-routes="${app}">([\\s\\S]*?)</table>`));
  if (!m) return null;
  const rows = new Map();
  for (const r of m[1].matchAll(/<tr><td><code>([^<]+)<\/code><\/td><td data-menu="([^"]*)">/g)) rows.set(r[1], r[2]);
  return rows;
}

function เมนู(name) {
  const m = NAV.match(new RegExp(`export const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\n\\];`));
  if (!m) return null;
  return [...m[1].matchAll(/label:\s*"([^"]+)",\s*href:\s*"([^"]+)"/g)].map(x => ({ label: x[1], href: x[2] }));
}

const ผิด = [];
let นับหน้า = 0, นับเมนู = 0;
for (const [app, navName] of [["dealer", "DEALER_NAV"], ["hq", "HQ_NAV"]]) {
  const หน้า = หน้าในแอป(app), ตาราง = ตารางFlow(app), เมนูซ้าย = เมนู(navName);
  if (!ตาราง) { ผิด.push(`FLOW.html ไม่มีตาราง data-routes="${app}"`); continue; }
  if (!เมนูซ้าย?.length) { ผิด.push(`อ่านเมนู ${navName} ใน navConfig.tsx ไม่ได้`); continue; }
  นับหน้า += หน้า.size; นับเมนู += เมนูซ้าย.length;
  for (const r of หน้า) if (!ตาราง.has(r)) ผิด.push(`[${app}] หน้า ${r} ไม่อยู่ในตาราง flow (docs/FLOW.html #routes)`);
  for (const r of ตาราง.keys()) if (!หน้า.has(r)) ผิด.push(`[${app}] ตาราง flow มีหน้า ${r} แต่แอปไม่มีหน้านี้แล้ว`);
  for (const m of เมนูซ้าย) {
    if (!ตาราง.has(m.href)) ผิด.push(`[${app}] เมนู "${m.label}" (${m.href}) ไม่อยู่ในตาราง flow`);
    else if (ตาราง.get(m.href) !== m.label) ผิด.push(`[${app}] เมนู "${m.label}" (${m.href}) ตาราง flow ผูกชื่อเมนูไว้ว่า "${ตาราง.get(m.href)}"`);
  }
  for (const [r, label] of ตาราง) if (label && !เมนูซ้าย.some(m => m.href === r && m.label === label)) ผิด.push(`[${app}] ตาราง flow บอกว่า ${r} มีเมนู "${label}" แต่เมนูซ้ายไม่มี`);
}

if (ผิด.length) {
  console.error(`check-flow-routes: ตก ${ผิด.length} จุด`);
  for (const e of ผิด) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`check-flow-routes: ผ่าน — ทุกหน้า (${นับหน้า}) และทุกเมนู (${นับเมนู}) ของทั้งสองแอปอยู่ในตาราง flow`);
