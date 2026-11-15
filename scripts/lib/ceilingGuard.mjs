// ── ตัวกันเพิ่มเพดานของตัวตรวจ "ห้ามเพิ่ม ลดได้" (บอสสั่ง 13 พ.ย. 69) ─────────────────────────────────────
//   เพดาน: คำเตือน lint (scripts/lint-ceiling.json) · รอตายตัว / หยิบแถวแรก / ผ่านหลอก / หาไม่ตรงตัว (scripts/test-ratchet.json)
//   ลดเพดาน = ทำได้เอง · เพิ่มเพดาน (รวมรายการใหม่ที่เดิมไม่มี = จาก 0) = ต้องมีบรรทัดรับทราบจากบอสที่ "ตรงค่า" ใน scripts/ceiling-ack.txt
//   บรรทัดรับทราบเขียนได้ทางเดียว: npm run ceiling:ack (scripts/ceiling-ack.mjs) — บอสรันเองในหน้าต่างคำสั่ง · AI รันไม่ได้ (ตัวกันเดียวกับ round:ack)
//   ตรวจเทียบกับฐาน = merge-base ของ HEAD กับ monorepo (ไม่มี monorepo = HEAD) → เพิ่มใน commit ก่อนหน้าของสาขาก็ยังจับได้
//   ไฟล์ scripts/ceiling-ack.txt บรรทัดละเหตุการณ์ (merge=union):
//     รับทราบเพิ่มเพดาน | <เวลา> | <ผู้รับทราบ> | <ไฟล์เพดาน> | <คีย์> | <ค่า>
// ข้อทดสอบ: tests/tools/ceiling-guard.test.mjs
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

export const ไฟล์เพดาน = ["scripts/lint-ceiling.json", "scripts/test-ratchet.json"];
export const ไฟล์รับทราบ = "scripts/ceiling-ack.txt";
const หัวไฟล์ = "# รับทราบเพิ่มเพดานของตัวตรวจ (บอสสั่ง 13 พ.ย. 69 · scripts/lib/ceilingGuard.mjs) — เขียนด้วย npm run ceiling:ack เท่านั้น (บอสรันเอง)\n";
const เวลาไทย = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 19).replace("T", " ");

/** แผ่ค่าตัวเลขของไฟล์เพดานเป็น คีย์ → ค่า (คีย์ = ทางในวัตถุคั่นด้วย /) · ข้อความ (หมายเหตุ) ไม่นับ */
export function แผ่(ค่า, ทาง = "", ผล = new Map()) {
  if (typeof ค่า === "number") ผล.set(ทาง, ค่า);
  else if (ค่า && typeof ค่า === "object") for (const [k, v] of Object.entries(ค่า)) แผ่(v, ทาง ? `${ทาง}/${k}` : k, ผล);
  return ผล;
}

/** เพดานที่เพิ่ม (เทียบเก่า → ใหม่) · รายการใหม่ที่เดิมไม่มี = เพิ่มจาก 0 */
export function เพดานที่เพิ่ม(เก่า, ใหม่) {
  const ก = แผ่(เก่า), ใ = แผ่(ใหม่);
  return [...ใ].filter(([k, v]) => v > (ก.get(k) ?? 0)).map(([k, v]) => ({ คีย์: k, เดิม: ก.get(k) ?? 0, ใหม่: v }));
}

/** บรรทัดรับทราบ → [{ ไฟล์, คีย์, ค่า }] */
export function อ่านรับทราบ(เนื้อ) {
  return String(เนื้อ ?? "").split(/\r?\n/).filter(l => l.startsWith("รับทราบเพิ่มเพดาน | ")).map(l => {
    const ช = l.split(" | ").map(x => x.trim());
    return { ไฟล์: ช[3] ?? "", คีย์: ช[4] ?? "", ค่า: Number(ช[5]) };
  });
}

/** ตัดสิน: เพดานที่เพิ่มต้องมีรับทราบ "ไฟล์ + คีย์ + ค่า" ตรงกันทุกรายการ (ค่าไม่ตรง = ไม่นับ) */
export function ตัดสิน({ เพิ่ม, รับทราบ }) {
  const ขาด = เพิ่ม.filter(x => !รับทราบ.some(r => r.ไฟล์ === x.ไฟล์ && r.คีย์ === x.คีย์ && r.ค่า === x.ใหม่));
  return { ผ่าน: ขาด.length === 0, ขาด };
}

const git = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
/** ฐานที่เทียบ: merge-base(HEAD, monorepo) → ไม่มี monorepo = HEAD */
export function ฐานเทียบ(cwd = process.cwd(), สาขาหลัก = process.env.PMS_CEILING_BASE || "monorepo") {
  try { return git(cwd, ["merge-base", "HEAD", สาขาหลัก]); } catch { return git(cwd, ["rev-parse", "HEAD"]); }
}
// ไฟล์เพดานที่ฐานยังไม่มี = ตั้งเพดานครั้งแรก (เช่น lint-ceiling.json ตอนเพิ่มตัวตรวจ lint) ไม่นับเป็นเพิ่ม → คืน null
//   ลบไฟล์ในสาขาแล้วเพิ่มกลับ = ฐานยังมีไฟล์ → เทียบตามปกติ (หลบไม่ได้)
const อ่านที่ฐาน = (cwd, ฐาน, f) => { try { return JSON.parse(git(cwd, ["show", `${ฐาน}:${f}`])); } catch { return null; } };
const อ่านตอนนี้ = (cwd, f) => { const p = path.join(cwd, f); return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {}; };

/** ตรวจทั้งชุดในโฟลเดอร์ → { ผ่าน, เพิ่ม[], ขาด[], ฐาน } */
export function ตรวจโฟลเดอร์(cwd = process.cwd()) {
  const ฐาน = ฐานเทียบ(cwd);
  const เพิ่ม = ไฟล์เพดาน.flatMap(f => { const เก่า = อ่านที่ฐาน(cwd, ฐาน, f); return เก่า === null ? [] : เพดานที่เพิ่ม(เก่า, อ่านตอนนี้(cwd, f)).map(x => ({ ไฟล์: f, ...x })); });
  const p = path.join(cwd, ไฟล์รับทราบ);
  const รับทราบ = อ่านรับทราบ(existsSync(p) ? readFileSync(p, "utf8") : "");
  return { ...ตัดสิน({ เพิ่ม, รับทราบ }), เพิ่ม, ฐาน };
}

/** จดรับทราบ (เรียกจาก scripts/ceiling-ack.mjs หลังผ่านตัวกัน AI เท่านั้น) */
export function จดรับทราบ({ ไฟล์, คีย์, ค่า, ผู้รับทราบ = "บอส", cwd = process.cwd() }) {
  if (!ไฟล์เพดาน.includes(ไฟล์)) throw new Error(`ไม่ใช่ไฟล์เพดาน: ${ไฟล์} (มี ${ไฟล์เพดาน.join(" · ")})`);
  if (!คีย์ || !Number.isInteger(ค่า) || ค่า < 0) throw new Error("ต้องระบุ --คีย์ และ --ค่า (จำนวนเต็ม ≥ 0)");
  const p = path.join(cwd, ไฟล์รับทราบ);
  if (!existsSync(p)) appendFileSync(p, หัวไฟล์);
  appendFileSync(p, `รับทราบเพิ่มเพดาน | ${เวลาไทย()} | ${ผู้รับทราบ} | ${ไฟล์} | ${คีย์} | ${ค่า}\n`);
}
