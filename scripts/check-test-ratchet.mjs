// ── ตัวตรวจ "ห้ามเพิ่ม ลดได้" ในข้อทดสอบ (บอสสั่ง 12 พ.ย. 69 · งานข้อทดสอบหยิบแถวแรก 25 จุด) ─────────────────────────────
//   (ก) รอตายตัว — page.waitForTimeout( / setTimeout ในตัวข้อ ทำให้ผลขึ้นกับความเร็วเครื่อง (ข้อ appointment-auto-tick: กรองไม่ทัน 0.9 วิ = เปิดแถวผิด)
//   (ข) หยิบแถวแรกของรายการ — .first() / .nth(0) ต่อจากตัวหาแถว (tbody tr · role row · ปุ่ม "ดูรายละเอียด" · [data-…row…]) โดยไม่กรองชื่อ/ค่า
//       ในบรรทัดเดียวกัน: รายการเรียงใหม่สุดก่อน แถวแรกเป็นของข้ออื่นที่รันพร้อมกันได้ (window-width deploy20) · ใช้ แถวตามชื่อ() ใน helpers.ts แทน
//   นับรายไฟล์ เทียบเพดานใน scripts/test-ratchet.json — เกินเพดาน = ตก (ไฟล์ใหม่เพดาน 0) · ต่ำกว่าเพดาน = ผ่าน + บอกให้ลดเพดาน (--update ลดให้)
//   --update ลดเพดานลงเท่าที่นับได้เท่านั้น ไม่ขึ้น (ขึ้นได้ทางเดียวคือแก้ไฟล์เพดานเอง ซึ่งคนตรวจงานเห็นในส่วนต่าง)
//   (ค) ผ่านหลอก (บอสสั่ง 12 พ.ย. 69 · เจอ quote-request-prefill:79 หาป้ายเก่าไม่เจอแล้วผ่าน) — หาของไม่เจอแล้วข้ามการตรวจ:
//       if (await x.count()/isVisible()/isEnabled()/isChecked()/isHidden()) … · ?: / && ด้วย count/isVisible ·
//       .catch(() => {} | false | null | undefined | 0 | "" | []) กลืนความผิดพลาด — นับทุกจุด (รวมที่มีป้าย "ไม่ใช่การข้าม") ไม่ให้เพิ่ม
// ข้อทดสอบ: tests/tools/test-ratchet.test.mjs · รัน: node scripts/check-test-ratchet.mjs [โฟลเดอร์ทดสอบ] [--update]
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const อาร์ก = process.argv.slice(2);
const ปรับ = อาร์ก.includes("--update");
const โฟลเดอร์ = อาร์ก.find(a => !a.startsWith("--")) ?? "tests/scenario";
const ไฟล์เพดาน = process.env.PMS_TEST_RATCHET_FILE ?? "scripts/test-ratchet.json";

// ตัดหมายเหตุออกก่อนนับ (บรรทัด // และส่วนท้ายบรรทัดหลัง // ที่ไม่อยู่ในสตริง — ตัดแบบง่าย: เฉพาะบรรทัดที่ขึ้นต้นด้วย // หรือ *)
const บรรทัดโค้ด = (s) => s.split(/\r?\n/).filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l));
const รอตายตัว = /\bwaitForTimeout\s*\(|\bnew Promise\s*\(\s*\w+\s*=>\s*setTimeout\s*\(/;
const ตัวหาแถว = /(tbody tr|getByRole\(\s*["']row["']|\[data-[\w-]*row[\w-]*\]|name:\s*["']ดูรายละเอียด["']|getByTitle\(\s*["'](ดูรายละเอียด|จัดการ)["'])/;
// [data-kpi-row] (แถวการ์ด) · [data-filter-row] (แถบตัวกรอง) ไม่ใช่แถวข้อมูล
const ไม่ใช่แถวข้อมูล = (l) => l.replace(/\[data-(kpi|filter)-row\]/g, "");
// แบบที่ 2: เก็บรายการแถวไว้ในตัวแปรก่อน แล้วไล่ตามลำดับ (แถว.nth(i) · rows.first()) — แบบ lost-reason-other เดิม (ไล่ 5 แถวแรกของ RYG)
const ไล่ตามลำดับ = /(?<![\p{L}\p{M}\w])(แถว|rows?)\.(nth\(|first\(\))/u;   // \b ใช้กับอักษรไทยไม่ได้ → มองย้อนว่าไม่ใช่อักษร
const แถวแรก = (l0) => {
  const l = ไม่ใช่แถวข้อมูล(l0);
  if (ไล่ตามลำดับ.test(l)) return true;
  return ตัวหาแถว.test(l) && /\.(first\(\)|nth\(0\))/.test(l) && !/\.filter\(|hasText|name:\s*`|exact:\s*true\s*}\)\.(first|nth)/.test(l);
};

const ผ่านหลอกแบบ = [
  /\bif\s*\(\s*!?\s*\(?\s*await\s+[^;]*?\.(count|isVisible|isEnabled|isChecked|isHidden)\(\s*\)/,
  /await\s+[^;]*?\.(count|isVisible)\(\s*\)\s*(\)\s*)?(&&|\?)/,
  /\.catch\(\s*\(\s*\)\s*=>\s*(\{\s*\}|false|null|undefined|0|""|''|\[\])\s*\)/,
];
const ผ่านหลอก = (l) => ผ่านหลอกแบบ.some(re => re.test(l));
const ชนิดทั้งหมด = ["รอตายตัว", "แถวแรก", "ผ่านหลอก"];
const ชื่อชนิด = { รอตายตัว: "รอตายตัว (waitForTimeout/setTimeout)", แถวแรก: "หยิบแถวแรกของรายการ (.first()/.nth(0) ไม่กรองชื่อ)", ผ่านหลอก: "ผ่านหลอก (if count/isVisible · .catch กลืนผิดพลาด)" };

export function นับ(ข้อความ) {
  const ล = บรรทัดโค้ด(ข้อความ);
  return { รอตายตัว: ล.filter(l => รอตายตัว.test(l)).length, แถวแรก: ล.filter(แถวแรก).length, ผ่านหลอก: ล.filter(ผ่านหลอก).length };
}

const ไฟล์ = existsSync(โฟลเดอร์) ? readdirSync(โฟลเดอร์).filter(f => /\.(spec\.)?ts$/.test(f)) : [];   // รวมไฟล์ zz- ด้วย (ตั้งชื่อหลบตัวตรวจไม่ได้)
const ผล = Object.fromEntries(ไฟล์.map(f => [f, นับ(readFileSync(path.join(โฟลเดอร์, f), "utf8"))]));
const เพดาน = existsSync(ไฟล์เพดาน) ? JSON.parse(readFileSync(ไฟล์เพดาน, "utf8")) : {};
// ชนิดที่ยังไม่มีในไฟล์เพดาน (เพิ่มชนิดใหม่) = ตั้งครั้งแรกจากจำนวนปัจจุบันได้ด้วย --update · ชนิดที่มีแล้วขึ้นไม่ได้
const ชนิดใหม่ = new Set(ชนิดทั้งหมด.filter(ช => !(ช in เพดาน)));

if (ปรับ) {
  for (const ชนิด of ชนิดทั้งหมด) {
    เพดาน[ชนิด] ??= {};
    for (const [f, n] of Object.entries(ผล)) {
      const เดิม = เพดาน[ชนิด][f];
      if (เดิม === undefined) { if (n[ชนิด] > 0 && (!existsSync(ไฟล์เพดาน) || ชนิดใหม่.has(ชนิด))) เพดาน[ชนิด][f] = n[ชนิด]; }   // ตั้งครั้งแรกของชนิดเท่านั้น
      else if (n[ชนิด] < เดิม) เพดาน[ชนิด][f] = n[ชนิด];
    }
    for (const f of Object.keys(เพดาน[ชนิด])) if (!ผล[f] || เพดาน[ชนิด][f] === 0) delete เพดาน[ชนิด][f];
  }
  const เรียง = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(ไฟล์เพดาน, JSON.stringify({ หมายเหตุ: "เพดานจำนวนจุดต่อไฟล์ — ห้ามเพิ่ม ลดได้ (scripts/check-test-ratchet.mjs · บอสสั่ง 12 พ.ย. 69)", ...Object.fromEntries(ชนิดทั้งหมด.map(ช => [ช, เรียง(เพดาน[ช])])) }, null, 2) + "\n");
  console.log(`ปรับเพดานแล้ว (${ไฟล์เพดาน})`);
}
const เกิน = [], ลดได้ = [];
for (const ชนิด of ชนิดทั้งหมด) {
  for (const [f, n] of Object.entries(ผล)) {
    const ได้ = เพดาน[ชนิด]?.[f] ?? 0;
    if (n[ชนิด] > ได้) เกิน.push(`${ชื่อชนิด[ชนิด]} ${f}: ${n[ชนิด]} จุด เกินเพดาน ${ได้}`);
    else if (n[ชนิด] < ได้) ลดได้.push(`${ชนิด} ${f}: ${ได้} → ${n[ชนิด]}`);
  }
}
const รวม = (ชนิด) => Object.values(ผล).reduce((a, n) => a + n[ชนิด], 0);
if (เกิน.length) {
  console.error(`✗ check-test-ratchet: เกินเพดาน ${เกิน.length} จุด\n   ${เกิน.join("\n   ")}\n   แก้: รอจนสิ่งที่ต้องการขึ้นจริง (expect…toBeVisible / toHaveCount) แทนรอตายตัว · เปิดแถวด้วย แถวตามชื่อ() (helpers.ts) แทนแถวแรก · ตรวจตรง ๆ (expect…toBeVisible/toHaveCount) แทนครอบ if/.catch`);
  process.exit(1);
}
console.log(`✓ check-test-ratchet: รอตายตัว ${รวม("รอตายตัว")} · หยิบแถวแรก ${รวม("แถวแรก")} · ผ่านหลอก ${รวม("ผ่านหลอก")} จุด ไม่เกินเพดาน${ลดได้.length && !ปรับ ? ` · ลดเพดานได้ ${ลดได้.length} ไฟล์ (node scripts/check-test-ratchet.mjs --update)` : ""}`);
