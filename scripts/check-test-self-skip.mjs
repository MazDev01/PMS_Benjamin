#!/usr/bin/env node
// ── ตัวตรวจ: ข้อทดสอบห้ามข้ามตัวเองเมื่อไม่มีข้อมูล (บอสสั่ง 11 พ.ย. 69) ────────────────────────────────────────────────
//   เหตุ: ~17 จุดข้าม/คืนค่าเงียบเมื่อฐานทดสอบไม่มีข้อมูล → ผลเป็น "ผ่าน" หรือ "ข้าม" ทั้งที่ไม่ได้ตรวจอะไร
//   กติกา (ไฟล์ทดสอบ tests/scenario/*.ts):
//   ① test.skip / test.fixme / testInfo.skip / info.skip / test.info().skip ที่มีเงื่อนไข ต้องเป็นเรื่องสภาพแวดล้อม (skipReason · กุญแจ ·
//      โหมดฐาน · ตัวแปรแวดล้อม · เบราว์เซอร์/โปรเจกต์ · ชุดถ่ายรูป) หรือมีเครื่องหมาย "// ข้ามตั้งใจ: <เหตุผล>" บรรทัดเดียวกัน/บรรทัดบน
//      ข้ามเพราะไม่มีข้อมูล = ห้าม → เปลี่ยนเป็น expect(..., "ขาดข้อมูล: ...") แล้วใส่ข้อมูลตั้งต้น (tests/fixtures/test-baseline.sql)
//   ② คืนค่า/ข้ามวนเงียบก่อนตรวจ (if (... count()/isVisible()/length ...) return|continue · if (!x) return|continue ·
//      if (await x.count()) { ตรวจ }) ต้องมีเครื่องหมาย "// ไม่ใช่การข้าม: <เหตุผล>" (เช่น ตัวช่วยล้าง · วนรอ · มีข้อตรวจท้ายวน)
//   ③ ข้ามโดยไม่มีข้อความเหตุผล (test.skip() เปล่า) = ห้าม เว้นมีเครื่องหมายข้ามตั้งใจ
//   ผลรอบตรวจแยกจำนวนข้อที่ข้ามตามเหตุผล: scripts/check-e2e-ran.mjs
// ใช้: node scripts/check-test-self-skip.mjs [โฟลเดอร์ · ค่าตั้งต้น tests/scenario] (อยู่ใน npm run checks) · ข้อทดสอบ: tests/tools/test-self-skip.test.mjs
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";

const ที่ = process.argv[2] ?? "tests/scenario";
if (!existsSync(ที่)) { console.log(`check-test-self-skip: ไม่มี ${ที่}`); process.exit(0); }

// เงื่อนไขที่เป็นเรื่องสภาพแวดล้อม (ไม่ใช่ข้อมูล)
const สภาพแวดล้อม = /skipReason|SERVICE_ROLE|REAL_BACKEND|SEED_LOCAL_ONLY|API_MODE|process\.env|browserName|isMobile|\.project\b|projectName|testInfo\.project|CRON|JWT|[Dd]ocker|status\(\)\s*===\s*501|ช่วง|LIVE_|PMS_SHOTS|ถ่ายรูป|ฐานในเครื่อง|ที่อยู่เว็บ/;
const คำสั่งข้าม = /\b(?:test|testInfo|info|test\.info\(\))\.(?:skip|fixme)\s*\(/;
const คืนเงียบ = [
  /^\s*if\s*\(.*(?:\.count\(\)|isVisible\(|\.length\b).*\)\s*(?:return|continue)\s*;/,
  /^\s*if\s*\(\s*!\s*[\w฀-๿.?]+\s*\)\s*(?:return|continue)\s*;/,
  /^\s*if\s*\(\s*await\s+[^)]*\.count\(\)\s*\)\s*\{/,
];
const มีเครื่องหมาย = (L, i, คำ) => [L[i], L[i - 1] ?? ""].some(l => new RegExp(`//\\s*(${คำ})\\s*:\\s*\\S`).test(l));

const ผิด = [];
for (const f of readdirSync(ที่).filter(n => /\.ts$/.test(n)).sort()) {
  const L = readFileSync(path.join(ที่, f), "utf8").split(/\r?\n/);
  L.forEach((l, i) => {
    const โค้ด = l.replace(/\/\/.*$/, "");
    if (/^\s*(\/\/|\*)/.test(l)) return;
    if (คำสั่งข้าม.test(โค้ด)) {
      const ว่าง = /\.(?:skip|fixme)\s*\(\s*\)/.test(โค้ด);
      if (ว่าง && !มีเครื่องหมาย(L, i, "ข้ามตั้งใจ")) ผิด.push(`${f}:${i + 1}: ข้ามโดยไม่มีเหตุผล — ${l.trim().slice(0, 90)}`);
      else if (!ว่าง && !สภาพแวดล้อม.test(โค้ด) && !มีเครื่องหมาย(L, i, "ข้ามตั้งใจ"))
        ผิด.push(`${f}:${i + 1}: ข้ามด้วยเงื่อนไขที่ไม่ใช่สภาพแวดล้อม (ข้ามเพราะไม่มีข้อมูล?) — ${l.trim().slice(0, 90)}`);
    }
    // เงื่อนไขสภาพแวดล้อม (กุญแจ/ตัวแปรแวดล้อม/โหมดฐาน) ไม่ใช่การข้ามเพราะข้อมูล
    if (คืนเงียบ.some(r => r.test(โค้ด)) && !สภาพแวดล้อม.test(โค้ด) && !/SERVICE_ROLE_KEY|PG_PASSWORD/.test(โค้ด) && !มีเครื่องหมาย(L, i, "ไม่ใช่การข้าม|ข้ามตั้งใจ"))
      ผิด.push(`${f}:${i + 1}: คืนค่า/ข้ามวนเงียบก่อนตรวจ — ${l.trim().slice(0, 90)}`);
  });
}
if (ผิด.length) {
  console.error(`✗ check-test-self-skip: ข้อทดสอบข้ามตัวเองแบบไม่มีเหตุผล ${ผิด.length} จุด (บอสสั่ง 11 พ.ย. 69 — ไม่มีข้อมูล = ตก ไม่ใช่ข้าม):`);
  for (const x of ผิด) console.error(`   ${x}`);
  console.error("   แก้: ไม่มีข้อมูล → expect(..., \"ขาดข้อมูล: ...\") + ใส่ข้อมูลตั้งต้น · ตั้งใจข้ามจริง → // ข้ามตั้งใจ: <เหตุผล> · ไม่ใช่การข้าม (ตัวช่วยล้าง/วนรอ/มีข้อตรวจท้ายวน) → // ไม่ใช่การข้าม: <เหตุผล>");
  process.exit(1);
}
console.log("✓ check-test-self-skip: ข้อทดสอบไม่ข้ามตัวเองเมื่อไม่มีข้อมูล · ทุกการข้ามมีเหตุผล");
