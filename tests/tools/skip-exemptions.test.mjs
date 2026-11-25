// ── ข้อทดสอบ: ตัวตรวจท้ายรอบ check-e2e-ran — ข้อที่ถูกข้ามต้องอยู่ในรายชื่อยกเว้นที่บอสอนุมัติ (บอสสั่ง 12 พ.ย. 69) ─────────────
//   รายงาน Playwright จำลอง + รายชื่อยกเว้นจริง (scripts/skip-exemptions.json) / จำลอง (PMS_SKIP_EXEMPTIONS_FILE)
//   ตกบนโค้ดเดิม: ข้อที่ข้ามพร้อมเหตุผลในโค้ด (เช่น โหมดของระบบ) ผ่านตัวตรวจทุกรอบ · ไม่มีรายชื่อยกเว้น
// รัน: node tests/tools/skip-exemptions.test.mjs
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(0, 900)}`}`); };

const ที่ = mkdtempSync(join(tmpdir(), "skip-ex-"));
/** รายงานจำลอง: ข้อ = [ไฟล์, ชื่อ, สถานะ ("expected" | "skipped"), เหตุผลข้าม] */
const รายงาน = (ข้อ) => {
  const f = join(ที่, `r-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(f, JSON.stringify({ suites: ข้อ.map(([file, title, status, why], i) => ({ file, specs: [{ file, line: i + 1, title,
    tests: [{ projectName: "chromium", status, annotations: why ? [{ type: "skip", description: why }] : [], results: [] }] }] })) }));
  return f;
};
const ตรวจ = (f, env = {}) => { const r = spawnSync(process.execPath, ["scripts/check-e2e-ran.mjs", f], { encoding: "utf8", env: { ...process.env, ...env } }); return { ผ่าน: r.status === 0, ข้อความ: (r.stdout ?? "") + (r.stderr ?? "") }; };
try {
  const จริง = JSON.parse(readFileSync("scripts/skip-exemptions.json", "utf8")).ยกเว้น;
  ผล(Array.isArray(จริง) && จริง.length === 23, "รายชื่อยกเว้นที่บอสอนุมัติ = 23 ข้อ (สคริปต์ถ่ายรูป zz-shots · ลดจาก 24 — zz-shots-material-templates ไม่มีไฟล์แล้ว · บอสสั่งตรง 25 พ.ย. 69 \"อันไหนของโปรเจคนี้ไม่ใช้แล้วลบได้เลย\")", JSON.stringify(จริง?.length));
  ผล(จริง.every(e => e.ไฟล์ && e.ชื่อ && e.เหตุผล === "สคริปต์ถ่ายรูป ไม่ใช่ข้อทดสอบ" && e.อนุมัติ && !/[*?]/.test(e.ไฟล์ + e.ชื่อ)),
    "ทุกรายการมีไฟล์ + ชื่อข้อตรงตัว + เหตุผล + ผู้อนุมัติ · ไม่มีตัวแทนคำ (* ?)");
  const ตัวอย่าง = จริง[0];

  let r = ตรวจ(รายงาน([["a.spec.ts", "ผ่าน", "expected"], [ตัวอย่าง.ไฟล์, ตัวอย่าง.ชื่อ, "skipped", "ถ่ายรูปเมื่อสั่ง"]]));
  ผล(r.ผ่าน, "ข้ามข้อที่อยู่ในรายชื่อยกเว้น (ไฟล์ + ชื่อตรงตัว) → ผ่าน", r.ข้อความ);

  // แบบเดิม: ข้ามเพราะโหมดของระบบ (dealer-lead-rules / scenario-fixes [2][3] ก่อน 12 พ.ย. 69) → ตก
  r = ตรวจ(รายงาน([["a.spec.ts", "ผ่าน", "expected"], ["scenario-fixes.spec.ts", "[2] /leads ป้ายกับตัวกรองตรงกับกฎที่ตั้ง", "skipped", "seed ผ่าน localStorage — ใช้โหมด local เท่านั้น"]]));
  ผล(!r.ผ่าน && /ไม่อยู่ในรายชื่อยกเว้น/.test(r.ข้อความ) && /scenario-fixes/.test(r.ข้อความ), "ข้ามเพราะโหมดของระบบ (มีเหตุผลในโค้ด) แต่ไม่อยู่ในรายชื่อ → ตก", r.ข้อความ);

  // ไฟล์ zz-shots ใหม่ที่ไม่อยู่ในรายชื่อ → ตก (ห้ามยกเว้นตามคำขึ้นต้น)
  r = ตรวจ(รายงาน([["zz-shots-ใหม่.spec.ts", "ถ่ายรูป: หน้าใหม่", "skipped", "ถ่ายรูปเมื่อสั่ง PMS_SHOTS (ไม่ใช่ข้อทดสอบ)"]]));
  ผล(!r.ผ่าน && /zz-shots-ใหม่/.test(r.ข้อความ), "ไฟล์ zz-shots ใหม่ (ชื่อขึ้นต้นเหมือนกัน) ไม่อยู่ในรายชื่อ → ตก", r.ข้อความ);
  // ชื่อข้อตรงแต่คนละไฟล์ / ไฟล์ตรงแต่คนละชื่อ → ตก
  r = ตรวจ(รายงาน([["อื่น.spec.ts", ตัวอย่าง.ชื่อ, "skipped", "x"]]));
  ผล(!r.ผ่าน, "ชื่อข้อตรงแต่คนละไฟล์ → ตก", r.ข้อความ);
  r = ตรวจ(รายงาน([[ตัวอย่าง.ไฟล์, ตัวอย่าง.ชื่อ + " (เพิ่ม)", "skipped", "x"]]));
  ผล(!r.ผ่าน, "ไฟล์ตรงแต่ชื่อข้อไม่ตรงตัว → ตก", r.ข้อความ);
  // ที่อยู่ไฟล์แบบมีโฟลเดอร์ (รายงานบางช่วง) ก็เทียบด้วยชื่อไฟล์
  r = ตรวจ(รายงาน([[`tests\\scenario\\${ตัวอย่าง.ไฟล์}`, ตัวอย่าง.ชื่อ, "skipped", "x"]]));
  ผล(r.ผ่าน, "ที่อยู่ไฟล์มีโฟลเดอร์นำหน้า → เทียบชื่อไฟล์ ผ่าน", r.ข้อความ);
  // รายชื่อว่าง = ข้ามอะไรไม่ได้เลย
  const ว่าง = join(ที่, "ว่าง.json"); writeFileSync(ว่าง, JSON.stringify({ ยกเว้น: [] }));
  r = ตรวจ(รายงาน([[ตัวอย่าง.ไฟล์, ตัวอย่าง.ชื่อ, "skipped", "x"]]), { PMS_SKIP_EXEMPTIONS_FILE: ว่าง });
  ผล(!r.ผ่าน, "รายชื่อว่าง → ข้ามข้อไหนก็ตก", r.ข้อความ);
} finally { rmSync(ที่, { recursive: true, force: true }); }

// ไฟล์ทดสอบปัจจุบันไม่มี test.skip เพราะโหมดของระบบเหลือ (5 ข้อเดิมเขียนใหม่แล้ว)
for (const f of ["tests/scenario/dealer-lead-rules.spec.ts", "tests/scenario/scenario-fixes.spec.ts"]) {
  const s = existsSync(f) ? readFileSync(f, "utf8") : "";
  ผล(!/test\.skip\(\s*REAL_BACKEND/.test(s), `${f}: ไม่มี test.skip(REAL_BACKEND …) เหลือ`);
}

console.log(ตก ? `\n✗ ตก ${ตก} ข้อ` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
