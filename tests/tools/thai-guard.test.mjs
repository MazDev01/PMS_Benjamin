// ── ข้อทดสอบ: ตัวกันภาษาไทย (Stop hook · scripts/hooks/thai-guard.mjs · งาน rmwbmmzod4ov · บอสสั่ง 11 พ.ย. 69) ────────────
//   ข้อความอังกฤษถูกตีกลับ · ข้อความไทยที่มีชื่อไฟล์/คำสั่ง/โค้ด/ตัวย่อผ่าน · ตีกลับไปแล้ว (stop_hook_active) ไม่ตีซ้ำ
//   อ่านเฉพาะข้อความของ AI ในเทิร์นล่าสุด (ผลเครื่องมือภาษาอังกฤษไม่นับ · เทิร์นก่อนไม่นับ)
//   ตกบนโค้ดเดิม: ไม่มีสคริปต์
// รัน: node tests/tools/thai-guard.test.mjs (ไม่แตะฐาน · ไม่แตะ settings)
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const ราก = process.cwd();
let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(-800)}`}`); };
const สคริปต์ = join(ราก, "scripts/hooks/thai-guard.mjs");
ผล(existsSync(สคริปต์), "มีสคริปต์ scripts/hooks/thai-guard.mjs");
if (!existsSync(สคริปต์)) { console.log(`\n✗ ตก ${ตก} ข้อ`); process.exit(1); }   // ไม่ใช่การข้าม: ไม่มีสคริปต์ = ตกแล้ว
const m = await import(pathToFileURL(สคริปต์).href);

// 1) ตัวตรวจประโยค
const ตี = [
  "Done. I fixed the bug and ran the tests.",
  "รอบอส: ok\nThe backup now downloads only new files from storage.",
  "สรุป: everything looks good to me now · ผ่านหมด",
];
for (const s of ตี) ผล(m.หาประโยคอังกฤษ(s).length > 0, `ตีกลับ: ${JSON.stringify(s.slice(0, 50))}`, JSON.stringify(m.หาประโยคอังกฤษ(s)));
const ผ่าน = [
  "รอบอส: เลือก ก/ข · แก้ใน [backup.mjs](scripts/backup.mjs) แล้ว",
  "รัน `npm run test:prodbuild -- tests/scenario/a.spec.ts` ผ่าน 32 ตก 0",
  "ใช้ npm run round:pass แล้ว · ไฟล์ scripts/lib/attachmentBackup.mjs",
  "ส่งออก PDF และ Excel ได้ · HQ VAT 7% · ใบ HQ ส่งแล้ว",
  "```\nError: permission denied for function hq_quote_send at line 3\n```\nผลข้างบนคือฐานปฏิเสธ",
  "ดู https://example.test/some/long/path?with=english words here",
  "ตัวอย่างคำว่า Safari กับ Chrome ใช้ได้ทั้งคู่",
];
for (const s of ผ่าน) ผล(m.หาประโยคอังกฤษ(s).length === 0, `ผ่าน: ${JSON.stringify(s.slice(0, 50))}`, JSON.stringify(m.หาประโยคอังกฤษ(s)));

// 2) อ่านเทิร์นล่าสุดจาก transcript
const แถว = (o) => JSON.stringify(o);
const ทรานสคริปต์ = (ข้อความท้าย) => [
  แถว({ type: "user", message: { role: "user", content: "สรุปให้หน่อย" } }),
  แถว({ type: "assistant", message: { content: [{ type: "text", text: "This older turn is in English but does not count." }] } }),
  แถว({ type: "user", message: { role: "user", content: "ทำต่อ" } }),
  แถว({ type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Bash", input: {} }] } }),
  แถว({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "All tests passed successfully without any errors" }] } }),
  แถว({ type: "assistant", message: { content: [{ type: "text", text: ข้อความท้าย }] } }),
].join("\n");
ผล(m.ข้อความเทิร์นล่าสุด(ทรานสคริปต์("ไทยล้วน")) === "ไทยล้วน", "อ่านเฉพาะข้อความ AI เทิร์นล่าสุด (ไม่เอาผลเครื่องมือ/เทิร์นก่อน)", m.ข้อความเทิร์นล่าสุด(ทรานสคริปต์("ไทยล้วน")));

// 3) ตัว hook จริง (stdin → stdout JSON)
const ที่ = mkdtempSync(join(tmpdir(), "thai-guard-"));
try {
  const เรียก = (ข้อความท้าย, เพิ่ม = {}) => {
    const f = join(ที่, `t-${Math.random().toString(36).slice(2)}.jsonl`);
    writeFileSync(f, ทรานสคริปต์(ข้อความท้าย));
    const r = spawnSync(process.execPath, [สคริปต์], { input: JSON.stringify({ transcript_path: f, stop_hook_active: false, ...เพิ่ม }), encoding: "utf8" });
    let out = null; try { out = r.stdout ? JSON.parse(r.stdout) : null; } catch { out = { อ่านไม่ออก: r.stdout }; }
    return { status: r.status, out };
  };
  let r = เรียก("I have finished all the remaining work for tonight.");
  ผล(r.status === 0 && r.out?.decision === "block" && /ภาษาไทย/.test(r.out?.reason ?? ""), "hook: ข้อความอังกฤษ → decision block + เหตุผลภาษาไทย", JSON.stringify(r));
  r = เรียก("ไม่ต้องทำอะไร\nเสร็จแล้ว commit `29116785` · ไฟล์ scripts/proof-folder.mjs");
  ผล(r.status === 0 && r.out === null, "hook: ข้อความไทย + ชื่อไฟล์/โค้ด → ผ่าน (ไม่พิมพ์อะไร)", JSON.stringify(r));
  r = เรียก("I have finished all the remaining work for tonight.", { stop_hook_active: true });
  ผล(r.status === 0 && r.out === null, "hook: ตีกลับไปแล้ว (stop_hook_active) → ไม่ตีซ้ำ กันวน", JSON.stringify(r));
  const ไม่มีไฟล์ = spawnSync(process.execPath, [สคริปต์], { input: JSON.stringify({ transcript_path: join(ที่, "ไม่มี.jsonl") }), encoding: "utf8" });
  ผล(ไม่มีไฟล์.status === 0 && !ไม่มีไฟล์.stdout, "hook: อ่าน transcript ไม่ได้ → ไม่ขวาง");
} finally { rmSync(ที่, { recursive: true, force: true }); }

console.log(ตก ? `\n✗ ตก ${ตก} ข้อ` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
