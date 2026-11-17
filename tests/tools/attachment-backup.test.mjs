// ── ข้อทดสอบ: สำรองไฟล์แนบแบบดาวน์โหลดเฉพาะไฟล์ใหม่/เปลี่ยน + กู้ได้ครบ (บอสเลือกทาง 3 · ข้อ 8 · 18 พ.ย. 69) ─────────────
//   เดิม scripts/backup.mjs ไม่สำรองตัวไฟล์แนบเลย → โค้ดเดิมตกตั้งแต่ข้อแรก (ไม่มี _attachments)
//   รันกับฐานทดสอบในเครื่องเท่านั้น (--test · ที่อยู่ต้องเป็น 127.0.0.1/localhost) · ชุดสำรองอยู่ในโฟลเดอร์ชั่วคราว ไม่ใช่ pms-prod-backups
//   1) ชุด A: ไฟล์ทดสอบ 2 ไฟล์ถูกดาวน์โหลด เนื้อหาตรง
//   2) แก้ไฟล์ที่ 2 + เพิ่มไฟล์ที่ 3 → ชุด B: ดาวน์โหลดเฉพาะไฟล์ 2/3 · ไฟล์ 1 และไฟล์อื่นทั้งหมดคัดลอกจากชุด A
//   3) ทำไฟล์ 1 ในชุด B เสีย → ชุด C ต้องดาวน์โหลดไฟล์ 1 ใหม่ (ไม่คัดลอกของเสีย) · ชุด B ไม่ถูกใช้เป็นชุดก่อนถ้าไม่ครบ (ตรวจด้วยหน่วย)
//   4) ซ้อมกู้: ลบไฟล์ 1 + เขียนทับไฟล์ 3 ในที่เก็บ → restore.mjs (ตรวจ) เห็นหาย 1 ต่าง 1 → --apply --yes → เนื้อหากลับมาตรงทุกไฟล์
//      → restore.mjs (ตรวจ) อีกรอบ = ตรงกัน
// รัน: node tests/tools/attachment-backup.test.mjs (ถือล็อกฐานทดสอบระหว่างรัน)
import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { readEnvFile } from "../../scripts/lib/targetEnv.mjs";
import { ขอล็อกฐานทดสอบ } from "../../scripts/lib/testDbLock.mjs";
import { รอถ้าฐานไม่ว่าง } from "../../scripts/lib/testDbWait.mjs";
import { sha256, ชื่อบนดิสก์, โฟลเดอร์ไฟล์แนบ } from "../../scripts/lib/attachmentBackup.mjs";

รอถ้าฐานไม่ว่าง("ข้อทดสอบสำรองไฟล์แนบ");

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n${String(เพิ่ม).slice(0, 2000)}`}`); };

const env = readEnvFile("apps/hq/.env.local");
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+/.test(env.NEXT_PUBLIC_SUPABASE_URL ?? "")) {
  console.error("⛔ apps/hq/.env.local ไม่ได้ชี้ฐานทดสอบในเครื่อง — ไม่รัน");
  process.exit(2);
}
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ฐานชุด = mkdtempSync(path.join(os.tmpdir(), "pms-attach-backup-"));
if (/pms-prod-backups/i.test(ฐานชุด)) { console.error("⛔ ห้ามใช้ pms-prod-backups"); process.exit(2); }
const BUCKET = "dealer-files";
const คำนำ = `ZZT/attach-backup-${process.pid}`;
const ไฟล์ = [1, 2, 3].map((n) => `${คำนำ}/file-${n}.pdf`);   // ชื่อ ASCII — ที่เก็บไฟล์ไม่รับชื่ออักษรไทย
const เนื้อ = { 1: "ZZTEST ไฟล์ 1 รุ่นแรก", 2: "ZZTEST ไฟล์ 2 รุ่นแรก", 3: "ZZTEST ไฟล์ 3" };

const ล็อก = ขอล็อกฐานทดสอบ("ข้อทดสอบ attachment-backup", { รอนาที: 30 });
const รัน = (สคริปต์, args) => {
  const r = spawnSync(process.execPath, [สคริปต์, ...args, "--test"], {
    encoding: "utf8", maxBuffer: 64 << 20, env: { ...process.env, BACKUP_DIR: ฐานชุด } });
  return { status: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
};
const อัปโหลด = async (i, ข้อความ, upsert) => {
  const { error } = await svc.storage.from(BUCKET).upload(ไฟล์[i - 1], Buffer.from(ข้อความ), { upsert, contentType: "application/pdf" });
  if (error) throw new Error(`อัปโหลดไฟล์ ${i}: ${error.message}`);
};
const อ่านสด = async (i) => {
  const { data } = await svc.storage.from(BUCKET).download(ไฟล์[i - 1]);
  return data ? Buffer.from(await data.arrayBuffer()).toString("utf8") : null;
};
const ใบรายการ = (ชุด) => JSON.parse(readFileSync(path.join(ฐานชุด, ชุด, โฟลเดอร์ไฟล์แนบ, "manifest.json"), "utf8"));
const ของ = (m, i) => (m.files ?? []).find((f) => f.bucket === BUCKET && f.name === ไฟล์[i - 1]);
const เนื้อในชุด = (ชุด, i) => readFileSync(path.join(ฐานชุด, ชุด, โฟลเดอร์ไฟล์แนบ, ชื่อบนดิสก์(BUCKET, ไฟล์[i - 1])), "utf8");

try {
  await svc.storage.from(BUCKET).remove(ไฟล์);
  await อัปโหลด(1, เนื้อ[1], false);
  await อัปโหลด(2, เนื้อ[2], false);

  // ── 1) ชุด A ──
  const a = รัน("scripts/backup.mjs", ["A"]);
  let mA = null; try { mA = ใบรายการ("A"); } catch { /* โค้ดเดิม: ไม่มี */ }
  ผล(a.status === 0 && !!mA && mA.ครบ === true, "ชุด A สำรองไฟล์แนบครบ (มี _attachments/manifest.json)", a.out.slice(-1500));
  if (!mA) throw new Error("หยุด: ไม่มีการสำรองไฟล์แนบ");
  ผล(ของ(mA, 1)?.ที่มา === "ดาวน์โหลด" && ของ(mA, 2)?.ที่มา === "ดาวน์โหลด" && เนื้อในชุด("A", 1) === เนื้อ[1] && เนื้อในชุด("A", 2) === เนื้อ[2],
    "ชุด A: ไฟล์ 1/2 ดาวน์โหลดแล้ว เนื้อหาตรง", JSON.stringify([ของ(mA, 1), ของ(mA, 2)]));
  ผล(mA.files.every((f) => f.ที่มา === "ดาวน์โหลด"), "ชุด A ไม่มีชุดก่อน = ดาวน์โหลดทุกไฟล์", mA.ชุดก่อน);

  // ── 2) แก้ไฟล์ 2 + เพิ่มไฟล์ 3 → ชุด B ──
  เนื้อ[2] = "ZZTEST ไฟล์ 2 รุ่นแก้ (ยาวกว่าเดิม)";
  await อัปโหลด(2, เนื้อ[2], true);
  await อัปโหลด(3, เนื้อ[3], false);
  const b = รัน("scripts/backup.mjs", ["B"]);
  const mB = ใบรายการ("B");
  ผล(b.status === 0 && mB.ครบ && mB.ชุดก่อน === "A", "ชุด B ใช้ชุด A เป็นชุดก่อน", b.out.slice(-1500));
  const ดาวน์โหลดB = mB.files.filter((f) => f.ที่มา === "ดาวน์โหลด").map((f) => f.name).sort();
  ผล(JSON.stringify(ดาวน์โหลดB) === JSON.stringify([ไฟล์[1], ไฟล์[2]].sort()),
    "ชุด B ดาวน์โหลดเฉพาะไฟล์ที่เปลี่ยน/ใหม่ (ไฟล์ 2/3) · ที่เหลือคัดลอกจากชุด A", ดาวน์โหลดB.join("\n"));
  ผล(ของ(mB, 1)?.ที่มา === "ชุดก่อน" && เนื้อในชุด("B", 1) === เนื้อ[1] && เนื้อในชุด("B", 2) === เนื้อ[2] && เนื้อในชุด("B", 3) === เนื้อ[3]
    && mB.files.length === mA.files.length + 1, "ชุด B ครบในตัวเอง: ไฟล์ 1 (คัดลอก) 2 (รุ่นแก้) 3 (ใหม่) + จำนวนไฟล์ = A + 1",
    `${mB.files.length} vs ${mA.files.length}`);

  // ── 3) ไฟล์ในชุดก่อนเสีย → ต้องดาวน์โหลดใหม่ ──
  writeFileSync(path.join(ฐานชุด, "B", โฟลเดอร์ไฟล์แนบ, ชื่อบนดิสก์(BUCKET, ไฟล์[0])), "เสีย");
  const c = รัน("scripts/backup.mjs", ["C"]);
  const mC = ใบรายการ("C");
  ผล(c.status === 0 && mC.ชุดก่อน === "B" && ของ(mC, 1)?.ที่มา === "ดาวน์โหลด" && ของ(mC, 1)?.เหตุ === "ไฟล์ชุดก่อนเสีย/หาย"
    && เนื้อในชุด("C", 1) === เนื้อ[1] && ของ(mC, 2)?.ที่มา === "ชุดก่อน",
    "ไฟล์ในชุดก่อนเสีย (sha256 ไม่ตรง) = ดาวน์โหลดใหม่ ไม่คัดลอกของเสีย", JSON.stringify(ของ(mC, 1)));

  // ── 4) ซ้อมกู้จากชุด C ──
  await svc.storage.from(BUCKET).remove([ไฟล์[0]]);
  await อัปโหลด(3, "ZZTEST ไฟล์ 3 ถูกเขียนทับผิด", true);
  const ตรวจ1 = รัน("scripts/restore.mjs", [path.join(ฐานชุด, "C")]);
  ผล(/ไฟล์แนบ.*หาย 1 · ต่างกัน 1/.test(ตรวจ1.out) && (await อ่านสด(1)) === null,
    "restore (ตรวจ) เห็นไฟล์หาย 1 · ต่างกัน 1 และไม่แตะที่เก็บไฟล์", ตรวจ1.out.slice(-1500));
  const กู้ = รัน("scripts/restore.mjs", [path.join(ฐานชุด, "C"), "--apply", "--yes"]);
  const สด = [await อ่านสด(1), await อ่านสด(2), await อ่านสด(3)];
  ผล(กู้.status === 0 && /✅ กู้คืนครบแล้ว/.test(กู้.out) && สด[0] === เนื้อ[1] && สด[1] === เนื้อ[2] && สด[2] === เนื้อ[3],
    "restore --apply: ไฟล์ที่หาย/ถูกเขียนทับกลับมาเนื้อหาตรงทุกไฟล์", `${กู้.out.slice(-1500)}\n${JSON.stringify(สด)}`);
  const ตรวจ2 = รัน("scripts/restore.mjs", [path.join(ฐานชุด, "C")]);
  ผล(/✅ ไฟล์แนบ\s+ไฟล์\s+\d+\s+ตรงกัน/.test(ตรวจ2.out), "หลังกู้ restore (ตรวจ) = ไฟล์แนบตรงกัน", ตรวจ2.out.slice(-1500));
  ผล(sha256(Buffer.from(สด[0])) === ของ(mC, 1)?.sha256, "sha256 ไฟล์ที่กู้ตรงกับที่จดในชุดสำรอง");
} catch (e) {
  ผล(false, "ข้อทดสอบหยุดกลางทาง", e?.stack ?? e);
} finally {
  await svc.storage.from(BUCKET).remove(ไฟล์);
  rmSync(ฐานชุด, { recursive: true, force: true });
  ล็อก.release();
}
console.log(ตก ? `ตก ${ตก} ข้อ` : "ALL PASS");
process.exit(ตก ? 1 : 0);
