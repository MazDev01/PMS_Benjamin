#!/usr/bin/env node
// ── ทางผ่านแบบเร็ว (บอสสั่งโหมดเร็ว 12 พ.ย. 69 · คนรวมงานอนุมัติแบบ 13 พ.ย. 69) ─────────────────────────────────────
//   npm run gate:fast                          ฐาน = origin/monorepo (ที่ขึ้นเว็บล่าสุด)
//   npm run gate:fast -- --ไฟล์ tests/scenario/x.spec.ts [--ไฟล์ …]   เพิ่มไฟล์ทดสอบเอง (จำเป็นเมื่อแก้โค้ดแต่ไม่แตะไฟล์ทดสอบ)
//   npm run gate:fast -- --ฐาน <sha>           ระบุฐานเอง (ต้องผ่านรอบตรวจแล้ว + เป็นบรรพบุรุษของ HEAD)
//   npm run gate:fast -- --แค่ตัดสิน           บอกว่าใช้ทางเร็วได้ไหม ไม่รันอะไร
// ขั้น: ① ไม่มีไฟล์ค้าง ② ไม่แตะไฟล์เสี่ยง (scripts/gate-risky-paths.json: ใบปรับฐาน · สิทธิ์ · เงิน · เครื่องมือรอบ) — แตะ = ปฏิเสธ ต้องรอบเต็ม
//       ③ typecheck → checks → test:unit → test:prodbuild เฉพาะไฟล์ทดสอบที่แตะ (--retries=0: ไม่นิ่ง = ตก · มี build ในตัว)
//          แก้แต่เอกสาร = build อย่างเดียว ④ ผ่านทุกขั้น → ต่อท้ายลายนิ้วมือป้าย "เร็ว:" ลง supabase/gate-passed-code.txt
//       แล้ว commit ไฟล์นั้น → session-merge / pre-push / Vercel รับเหมือนรอบเต็ม (ตรวจcommitผ่าน · scripts/lib/commitGate.mjs)
// ไม่แตะเว็บจริง ไม่ลงฐาน · ข้อทดสอบ: tests/tools/gate-fast.test.mjs
import { execFileSync, spawnSync } from "node:child_process";
import { ตรวจcommitผ่าน, ไฟล์ยังไม่commit, บันทึกcommitที่ผ่าน, ไฟล์บันทึกโค้ด } from "./lib/commitGate.mjs";
import { อ่านรายการเสี่ยง, รายการรวม, ตัดสินทางเร็ว, ลายนิ้วมือเสี่ยง, ป้ายเร็ว } from "./lib/fastGate.mjs";

const cwd = process.cwd();
const อาร์ก = process.argv.slice(2);
const ค่า = (k) => { const i = อาร์ก.indexOf(`--${k}`); return i >= 0 ? อาร์ก[i + 1] : undefined; };
const ทุกค่า = (k) => อาร์ก.flatMap((a, i) => a === `--${k}` && อาร์ก[i + 1] ? อาร์ก[i + 1].split(",") : []).map(x => x.trim().replace(/\\/g, "/")).filter(Boolean);
const git = (...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const ตาย = (ข้อความ, code = 1) => { console.error(`✗ gate:fast — ${ข้อความ}`); process.exit(code); };

const ค้าง = ไฟล์ยังไม่commit(cwd);
if (ค้าง.length) ตาย(`มีไฟล์ยังไม่ commit ${ค้าง.length} ไฟล์ (${ค้าง.slice(0, 5).join(" · ")}) — ผลต้องเป็นของ commit เท่านั้น commit ก่อนแล้วสั่งใหม่`);

const sha = git("rev-parse", "HEAD");
let ฐาน;
try { ฐาน = git("rev-parse", ค่า("ฐาน") ?? "origin/monorepo"); } catch { ตาย(`หา commit ฐานไม่เจอ (${ค่า("ฐาน") ?? "origin/monorepo"}) — git fetch หรือระบุ --ฐาน <sha>`); }
const ฐานเป็นบรรพบุรุษ = spawnSync("git", ["merge-base", "--is-ancestor", ฐาน, sha], { cwd }).status === 0;
const ฐานผ่าน = ตรวจcommitผ่าน(ฐาน, cwd).ผ่าน;
const diff = (filter) => git("diff", "--name-only", "--no-renames", `--diff-filter=${filter}`, ฐาน, sha).split("\n").filter(Boolean);
const มีใน = (f) => spawnSync("git", ["cat-file", "-e", `${sha}:${f}`], { cwd }).status === 0;
const ไฟล์ระบุ = ทุกค่า("ไฟล์");
const ไม่มี = ไฟล์ระบุ.filter(f => !มีใน(f));
if (ไม่มี.length) ตาย(`ไฟล์ทดสอบที่ระบุไม่มีใน commit: ${ไม่มี.join(" · ")}`);

let รายการ;
try { อ่านรายการเสี่ยง(cwd, sha); รายการ = รายการรวม(cwd, ฐาน, sha); } catch (e) { ตาย(`อ่านรายการไฟล์เสี่ยง (scripts/gate-risky-paths.json) ใน commit ไม่ได้ — ${e.message}`); }
const ผล = ตัดสินทางเร็ว({ ไฟล์ที่เปลี่ยน: diff("ACMRT"), ไฟล์ที่ลบ: diff("D"), รายการ, ไฟล์ระบุ, ฐานผ่าน, ฐานเป็นบรรพบุรุษ });
console.log(`▶ gate:fast · ฐาน ${ฐาน.slice(0, 12)} → ${sha.slice(0, 12)} · ไฟล์ทดสอบ ${ผล.spec.length ? ผล.spec.join(" · ") : "ไม่มี (แก้แต่เอกสาร)"}`);
if (!ผล.ได้) ตาย(`ใช้ทางเร็วไม่ได้:\n   ${ผล.เหตุ.join("\n   ")}`);
if (อาร์ก.includes("--แค่ตัดสิน")) { console.log("✓ ใช้ทางเร็วได้ (ไม่ได้รันอะไร · --แค่ตัดสิน)"); process.exit(0); }

const ขั้น = [["typecheck", "npm", ["run", "-s", "typecheck"]], ["checks", "npm", ["run", "-s", "checks"]], ["test:unit", "npm", ["run", "-s", "test:unit"]],
  ผล.spec.length
    ? ["ไฟล์ทดสอบที่แตะ + build", "node", ["scripts/test-prodbuild.mjs", ...ผล.spec, "--retries=0"]]
    : ["build", "npm", ["run", "-s", "build"]]];
for (const [ชื่อ, คำสั่ง, a] of ขั้น) {
  console.log(`▶ ${ชื่อ}`);
  const r = spawnSync(คำสั่ง, a, { cwd, stdio: "inherit", shell: true });
  if (r.status !== 0) ตาย(`ขั้น ${ชื่อ} ไม่ผ่าน (exit ${r.status}) — ไม่บันทึกผล`);
}
if (git("rev-parse", "HEAD") !== sha || ไฟล์ยังไม่commit(cwd).length) ตาย("โค้ดเปลี่ยนระหว่างตรวจ — ไม่บันทึกผล สั่งใหม่");
const ป้าย = ป้ายเร็ว(ลายนิ้วมือเสี่ยง(ฐาน, cwd, รายการ));
const ผิด = บันทึกcommitที่ผ่าน({ sha, ค้าง: [], ป้าย, cwd });
if (ผิด) ตาย(ผิด);
console.log(`✓ gate:fast ผ่าน — บันทึกลายนิ้วมือ (ทางเร็ว) ลง ${ไฟล์บันทึกโค้ด} แล้ว · commit ไฟล์นั้น:\n   git commit -m "chore(gate): ผลทางเร็ว ${sha.slice(0, 12)}" -- ${ไฟล์บันทึกโค้ด}`);
