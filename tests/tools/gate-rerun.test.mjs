// ── ข้อทดสอบ: รอบตรวจเต็มรันซ้ำเฉพาะไฟล์ที่ตก (บอสสั่ง 28 ต.ค. 69 · scripts/lib/gateRerun.mjs) ─────────────────────────────
// ใช้ playwright จริง (retries: 1 เหมือนรอบตรวจ) กับข้อจำลองในโฟลเดอร์ชั่วคราว — ข้อจำลองนับครั้งที่รันในไฟล์ แล้วตกตามจำนวนที่ตั้ง
//   ก. ตกในรอบหลัก (ตกทั้งครั้งแรกและครั้งลองซ้ำในรอบ) แล้วผ่านตอนรันซ้ำไฟล์ → รอบผ่าน · จดไม่นิ่ง 1 บรรทัด · รันซ้ำเฉพาะไฟล์ที่ตก
//      + ข้อต่อเนื่อง (serial) ที่ไม่ได้รันในรอบหลัก ได้รันในรอบซ้ำ → ตัวตรวจ check-e2e-ran ผ่านเมื่อส่งรายงานรันซ้ำต่อท้าย
//   ข. ตก 2 ครั้ง (รอบหลัก + รันซ้ำ) → รอบตก (ตกจริง)
//   ค. ผ่านตอนรันซ้ำ แต่ข้อนั้นไม่นิ่งครบเกณฑ์ 3 ครั้งโดยไม่มีต้นเหตุ → รอบตก
// รัน: node tests/tools/gate-rerun.test.mjs
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ตัดสินพร้อมรันซ้ำ } from "../../scripts/lib/gateRerun.mjs";
import { ตรวจไม่นิ่งท้ายรอบ, ไฟล์บันทึกไม่นิ่ง } from "../../scripts/lib/flakyLog.mjs";

const ราก = process.cwd();
const ที่ = path.join(ราก, "test-results", `gate-rerun-sim-${process.pid}`);   // ใน repo (หา @playwright/test เจอ) · git ไม่เก็บ
const config = path.join(ที่, "pw.config.mjs");
let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(-1500)}`}`); };
const เงียบ = () => {};

function เตรียม(ตกกี่ครั้ง, ไม่นิ่งเดิม = 0) {
  rmSync(ที่, { recursive: true, force: true });
  mkdirSync(path.join(ที่, "tests"), { recursive: true });
  writeFileSync(config, `export default { testDir: ".", testMatch: /\\.spec\\.mjs$/, retries: 1, workers: 1, reporter: [["line"]],
    outputDir: "./out", projects: [{ name: "sim" }] };\n`);
  // ข้อจำลอง: ไฟล์ serial — ข้อแรกตกตามจำนวนครั้งที่ตั้ง (นับข้ามรอบด้วยไฟล์) · ข้อสองผ่านเสมอแต่ไม่ได้รันถ้าข้อแรกตก
  writeFileSync(path.join(ที่, "sim.spec.mjs"), `import { test, expect } from "@playwright/test";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const f = ${JSON.stringify(path.join(ที่, "count.txt"))};
test.describe.configure({ mode: "serial" });
test("ข้อจำลองไม่นิ่ง", () => {
  const n = (existsSync(f) ? Number(readFileSync(f, "utf8")) : 0) + 1; writeFileSync(f, String(n));
  expect(n, "ครั้งที่ " + n).toBeGreaterThan(${ตกกี่ครั้ง});
});
test("ข้อต่อจากข้อไม่นิ่ง", () => { expect(1).toBe(1); });
`);
  writeFileSync(path.join(ที่, "ok-sim.spec.mjs"), `import { test, expect } from "@playwright/test";
test("ข้อที่ผ่านเสมอ", () => { expect(1).toBe(1); });
`);
  if (ไม่นิ่งเดิม) writeFileSync(path.join(ที่, ไฟล์บันทึกไม่นิ่ง),
    Array.from({ length: ไม่นิ่งเดิม }, (_, i) => `ไม่นิ่ง | 2026-10-2${i} | รอบก่อน${i} | sim.spec.mjs › ข้อจำลองไม่นิ่ง`).join("\n") + "\n");
}
const pw = (args, รายงาน) => spawnSync(process.execPath, [path.join(ราก, "node_modules/@playwright/test/cli.js"), "test", "-c", config, "--reporter=line,json", ...args],
  { cwd: ราก, encoding: "utf8", env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: รายงาน } });

async function รอบ(ตกกี่ครั้ง, ไม่นิ่งเดิม = 0) {
  เตรียม(ตกกี่ครั้ง, ไม่นิ่งเดิม);
  const หลัก = path.join(ที่, "report.sim.json");
  const r = pw(["--project=sim"], หลัก);
  const ไฟล์ที่รันซ้ำ = [];
  const ตัดสิน = await ตัดสินพร้อมรันซ้ำ({ ช่วง: [{ โปรเจกต์: "sim", รายงาน: หลัก, code: r.status ?? 1 }], cwd: ราก, log: เงียบ,
    รันซ้ำ: async (p, ไฟล์, รายงานใหม่) => { ไฟล์ที่รันซ้ำ.push(...ไฟล์); return pw([`--project=${p}`, ...ไฟล์], รายงานใหม่).status ?? 1; } });
  const รายงานรวม = [หลัก, ...ตัดสิน.รายงานรันซ้ำ];
  const ไม่นิ่งตก = ตรวจไม่นิ่งท้ายรอบ(รายงานรวม, { รอบ: "ข้อทดสอบ", cwd: ที่, log: เงียบ, err: เงียบ, เพิ่ม: ตัดสิน.ไม่นิ่ง });
  const ตรวจ = spawnSync(process.execPath, [path.join(ราก, "scripts/check-e2e-ran.mjs"), ...รายงานรวม], { encoding: "utf8" });
  const ตรวจหลักอย่างเดียว = spawnSync(process.execPath, [path.join(ราก, "scripts/check-e2e-ran.mjs"), หลัก], { encoding: "utf8" });
  const บันทึก = (() => { try { return readFileSync(path.join(ที่, ไฟล์บันทึกไม่นิ่ง), "utf8"); } catch { return ""; } })();
  return { หลักcode: r.status, ตัดสิน, ไม่นิ่งตก, ตรวจ, ตรวจหลักอย่างเดียว, ไฟล์ที่รันซ้ำ, บันทึก, รอบผ่าน: !ตัดสิน.ตก && !ไม่นิ่งตก && ตรวจ.status === 0 };
}

try {
  // ก. ตก 2 ครั้งในรอบหลัก (ครั้งแรก + ลองซ้ำในรอบ) → ครั้งที่ 3 (รันซ้ำไฟล์) ผ่าน
  const ก = await รอบ(2);
  ผล(ก.หลักcode !== 0, "ก: รอบหลักตก (ข้อจำลองตกทั้งครั้งแรกและครั้งลองซ้ำในรอบ)");
  ผล(ก.ไฟล์ที่รันซ้ำ.length === 1 && ก.ไฟล์ที่รันซ้ำ[0].endsWith("/sim.spec.mjs"), "ก: รันซ้ำเฉพาะไฟล์ที่ตก (ไม่รันไฟล์ที่ผ่าน)", JSON.stringify(ก.ไฟล์ที่รันซ้ำ));
  const ซ้ำ = ก.ตัดสิน.รายงานรันซ้ำ[0] ? readFileSync(ก.ตัดสิน.รายงานรันซ้ำ[0], "utf8") : null;
  ผล(ซ้ำ != null && !ซ้ำ.includes("ข้อที่ผ่านเสมอ"), "ก: รอบรันซ้ำไม่มีข้อจากไฟล์ที่ผ่าน (ชื่อไฟล์ ok-sim ไม่ถูกจับเพราะชื่อคล้าย)", ซ้ำ == null ? "ไม่มีรายงานรันซ้ำ" : "");
  ผล(ก.รอบผ่าน && ก.ตัดสิน.ไม่นิ่ง.join() === "sim.spec.mjs › ข้อจำลองไม่นิ่ง", "ก: รันซ้ำผ่าน → รอบนี้ผ่าน · นับเป็นไม่นิ่ง", JSON.stringify({ ...ก.ตัดสิน, ตรวจ: ก.ตรวจ.stdout }));
  ผล((ก.บันทึก.match(/^ไม่นิ่ง \|/gm) ?? []).length === 1 && ก.บันทึก.includes("sim.spec.mjs › ข้อจำลองไม่นิ่ง"), "ก: จดบรรทัดไม่นิ่ง 1 บรรทัดลงตัวนับ", ก.บันทึก);
  ผล(ก.ตรวจหลักอย่างเดียว.status !== 0 && ก.ตรวจ.status === 0, "ก: ตัวตรวจท้ายรอบ — รายงานหลักอย่างเดียวตก (ข้อต่อเนื่องไม่ได้รัน) · ต่อท้ายรายงานรันซ้ำแล้วผ่าน", ก.ตรวจ.stdout);

  // ข. ตก 4 ครั้ง = ตกทั้งรอบหลัก (2) และตอนรันซ้ำ (2)
  const ข = await รอบ(4);
  ผล(!ข.รอบผ่าน && ข.ตัดสิน.ตก && ข.ตัดสิน.ตกจริง.some(l => l.includes("ข้อจำลองไม่นิ่ง") && l.includes("รันซ้ำแล้วยังตก")), "ข: ตก 2 ครั้ง (รอบหลัก + รันซ้ำ) → รอบตก (ตกจริง)", JSON.stringify(ข.ตัดสิน));
  ผล(!ข.ตัดสิน.ไม่นิ่ง.length, "ข: ตกจริงไม่ถูกนับเป็นไม่นิ่ง");

  // ค. ผ่านตอนรันซ้ำ แต่ไม่นิ่งมาแล้ว 2 ครั้ง → ครั้งนี้ครบ 3 → รอบตก
  const ค = await รอบ(2, 2);
  ผล(!ค.ตัดสิน.ตก && ค.ไม่นิ่งตก && !ค.รอบผ่าน, "ค: รันซ้ำผ่าน แต่ไม่นิ่งครบเกณฑ์ 3 ครั้งโดยไม่มีต้นเหตุ → รอบตก", JSON.stringify(ค.ตัดสิน));

  // ง. ช่วงตกแต่รายงานไม่มีข้อให้รันซ้ำ (ตัวรันล้ม) → ตกจริง ไม่เดา
  const ง = await ตัดสินพร้อมรันซ้ำ({ ช่วง: [{ โปรเจกต์: "sim", รายงาน: path.join(ที่, "ไม่มีไฟล์.json"), code: 1 }], cwd: ราก, log: เงียบ, รันซ้ำ: async () => 0 });
  ผล(ง.ตก && ง.ตกจริง.some(l => l.includes("ไม่มีรายงาน")), "ง: ช่วงตกแต่ไม่มีรายงาน → ตกจริง (ไม่รันซ้ำ)", JSON.stringify(ง));
} finally {
  rmSync(ที่, { recursive: true, force: true });
}
console.log(ตก ? `\n${ตก} FAIL` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
