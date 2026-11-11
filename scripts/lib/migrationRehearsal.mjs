// ── ซ้อมลงใบปรับฐานแบบ db push บนฐานแยกชั่วคราว (คนรวมงานเลือกทาง ข 10 พ.ย. 69) ─────────────────────────────────
//   ทำไม: รอบตรวจลงใบทุกใบบนฐานเปล่าแล้วค่อยใส่ข้อมูลตั้งต้น → ส่วนแปลงข้อมูลของใบใหม่ไม่เคยเจอข้อมูล
//     ข้อทดสอบเดิม (lead-stage-four) รันใบซ้ำใน begin…rollback → SET LOCAL ใช้ได้ = ไม่เห็นปัญหาที่ db push ฐานจริงเจอ
//   วิธี: คอนเทนเนอร์ใหม่จากอิมเมจเดียวกับฐานทดสอบ (ชื่อไม่ซ้ำ · ลบทิ้งเสมอ) → คัดโครง auth/storage จากฐานทดสอบ (อ่านอย่างเดียว)
//     → ลงใบก่อนหน้าใบที่ซ้อม → ใส่ข้อมูลของข้อ (ก่อนลงใบ) → ลงใบนั้นด้วย psql ไม่ห่อ transaction (แบบ db push)
//     → เก็บ WARNING ของใบนั้น → รัน SQL ตรวจ (หลังลงใบ · raise exception = ตก)
//   ไม่แตะฐานทดสอบร่วม (ไม่ต้องถือล็อก) · บังคับใช้กับใบใหม่ที่แปลงข้อมูลตั้งแต่ 0286 (scripts/check-migration-rehearsal.mjs)
//   ข้อทดสอบของตัวนี้: tests/tools/migration-rehearsal.test.mjs
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { คอนเทนเนอร์ as คอนเทนเนอร์ฐานทดสอบ } from "./testDbGuard.mjs";

const docker = (args, input) => spawnSync("docker", args, { input, encoding: "utf8", maxBuffer: 256 << 20 });
const เลขใบ = (f) => Number(String(f).slice(0, 4));
/** ข้อความผิดเต็ม (ไม่กรองเหลือแค่บรรทัด ERROR) — ข้อไม่นิ่งรอบ deploy19 (11 พ.ย. 69): ลงใบ 0001 ไม่สำเร็จแต่ข้อความว่าง
 *  เพราะต่อฐานไม่ได้ไม่มีคำว่า ERROR ถูกกรองทิ้งหมด → ไม่รู้ต้นเหตุ · ตอนนี้บอกรหัสออก + stderr ท้าย 1,500 ตัวอักษร */
export const ข้อความผิดเต็ม = (r) => `รหัสออก ${r?.status ?? "—"}${r?.error ? ` · ${r.error.message}` : ""} · ${String(r?.stderr ?? "").trim().slice(-1500) || "(ไม่มีข้อความผิด)"}`;
/** ฐานซ้อมพร้อมจริง = บทบาท supabase_auth_admin มีแล้ว · เป็นเซิร์ฟเวอร์ตัวจริง (listen_addresses ไม่ว่าง — ตัวชั่วคราวตอน init ฟังเฉพาะ socket)
 *  · เวลาเริ่มเซิร์ฟเวอร์เท่าครั้งก่อน (ไม่รีสตาร์ตระหว่างนั้น) — แทนการนับ "ถามได้ 3 วินาทีติดกัน" (ไม่ใช่การเพิ่มเวลารอ)
 *  @param {string|undefined} ผลถาม "บทบาท|listen_addresses|เวลาเริ่ม" · @param {string|null} ครั้งก่อน เวลาเริ่มที่อ่านได้ครั้งก่อน */
export function อ่านความพร้อม(ผลถาม, ครั้งก่อน) {
  const [บทบาท, ฟัง, เริ่ม] = String(ผลถาม ?? "").trim().split("|");
  const ตัวจริง = บทบาท === "1" && !!ฟัง && !!เริ่ม;
  return { พร้อม: ตัวจริง && ครั้งก่อน === เริ่ม, เวลาเริ่ม: ตัวจริง ? เริ่ม : null };
}

/** ซ้อมลงใบ — คืน { warnings: string[], ผลตรวจ: string } · ลงใบก่อนหน้า/ข้อมูล/ใบ/ตรวจ ล้ม = throw (ข้อความบอกขั้น)
 *  @param {{ ใบ: string; ก่อนลงใบ?: string; หลังลงใบ?: string; โฟลเดอร์ใบ?: string }} ตั้ง */
export function ซ้อมใบ({ ใบ, ก่อนลงใบ = "", หลังลงใบ = "", โฟลเดอร์ใบ = "supabase/migrations" }) {
  const ทั้งหมด = readdirSync(โฟลเดอร์ใบ).filter(f => /^\d{4}_.*\.sql$/.test(f)).sort();
  if (!ทั้งหมด.includes(ใบ)) throw new Error(`ซ้อมใบ: ไม่พบใบ ${ใบ} ใน ${โฟลเดอร์ใบ}`);
  const อิมเมจ = process.env.PMS_REHEARSAL_IMAGE
    || docker(["inspect", คอนเทนเนอร์ฐานทดสอบ, "--format", "{{.Config.Image}}"]).stdout.trim();
  if (!อิมเมจ) throw new Error(`ซ้อมใบ: อ่านอิมเมจของฐานทดสอบ (${คอนเทนเนอร์ฐานทดสอบ}) ไม่ได้ — ฐานทดสอบต้องเปิดอยู่`);
  // โครง auth/storage (บริการ auth/storage ของ supabase สร้าง ไม่ได้อยู่ในอิมเมจ) — อ่านจากฐานทดสอบด้วยบัญชีอ่านอย่างเดียว
  const โครง = docker(["exec", "-e", "PGPASSWORD=pms_reader", คอนเทนเนอร์ฐานทดสอบ, "pg_dump", "-h", "127.0.0.1", "-U", "pms_reader", "-d", "postgres", "-s", "-n", "auth", "-n", "storage"]);
  if (โครง.status !== 0) throw new Error(`ซ้อมใบ: คัดโครง auth/storage ไม่ได้ — ${(โครง.stderr ?? "").slice(0, 300)}`);
  const ชื่อ = `pms-rehearsal-${process.pid}-${randomBytes(3).toString("hex")}`;
  const เปิด = docker(["run", "-d", "--rm", "--name", ชื่อ, "-e", "POSTGRES_PASSWORD=postgres", อิมเมจ]);
  if (เปิด.status !== 0) throw new Error(`ซ้อมใบ: เปิดคอนเทนเนอร์ไม่ได้ — ${(เปิด.stderr ?? "").slice(0, 300)}`);
  const psql = (sql, ผู้ใช้ = "postgres", หยุดเมื่อผิด = true) => docker(["exec", "-i", ชื่อ, "psql", "-U", ผู้ใช้, "-d", "postgres", "-X", "-q", "-v", `ON_ERROR_STOP=${หยุดเมื่อผิด ? 1 : 0}`], sql);
  try {
    // พร้อมเมื่อ init ของอิมเมจจบ (บทบาท supabase_auth_admin มีแล้ว)
    const เริ่ม = Date.now(), พัก = new Int32Array(new SharedArrayBuffer(4));
    //   อิมเมจรัน init บนเซิร์ฟเวอร์ชั่วคราวแล้วเริ่มตัวจริงใหม่หนึ่งรอบ — เดิมนับ "ถามได้ติดกัน 3 ครั้ง" ซึ่งผ่านได้ตอนยังเป็นตัวชั่วคราว
    //   (ข้อไม่นิ่ง deploy19) → พร้อม = ตัวจริง + เวลาเริ่มเซิร์ฟเวอร์ไม่เปลี่ยนจากครั้งก่อน (อ่านความพร้อม)
    for (let ครั้งก่อน = null, พร้อม = false; !พร้อม;) {
      const ถาม = docker(["exec", ชื่อ, "psql", "-U", "supabase_admin", "-d", "postgres", "-Atc",
        "select (select count(*) from pg_roles where rolname = 'supabase_auth_admin') || '|' || current_setting('listen_addresses') || '|' || pg_postmaster_start_time()"]);
      ({ พร้อม, เวลาเริ่ม: ครั้งก่อน } = อ่านความพร้อม(ถาม.status === 0 ? ถาม.stdout : "", ครั้งก่อน));
      if (พร้อม) break;
      if (Date.now() - เริ่ม > 120_000) throw new Error("ซ้อมใบ: ฐานซ้อมไม่พร้อมภายใน 2 นาที");
      Atomics.wait(พัก, 0, 0, 1000);
    }
    psql(โครง.stdout, "supabase_admin", false);   // ผิดที่คาดไว้: สคีมามีแล้ว · นโยบายที่อ้างฟังก์ชัน public (ใบปรับฐานสร้างตามมา)
    const ก่อนหน้า = ทั้งหมด.filter(f => เลขใบ(f) < เลขใบ(ใบ));
    for (const f of ก่อนหน้า) {   // ทีละใบ คนละ session (ค่า set ของใบหนึ่งไม่ค้างไปใบถัดไป)
      const ลงก่อน = psql(readFileSync(path.join(โฟลเดอร์ใบ, f), "utf8"));
      if (ลงก่อน.status !== 0) throw new Error(`ซ้อมใบ: ลงใบก่อนหน้า ${f} ไม่สำเร็จ — ${ข้อความผิดเต็ม(ลงก่อน)}`);
    }
    if (ก่อนลงใบ) {
      const ข้อมูล = psql(ก่อนลงใบ);
      if (ข้อมูล.status !== 0) throw new Error(`ซ้อมใบ: ใส่ข้อมูลก่อนลงใบไม่สำเร็จ — ${ข้อความผิดเต็ม(ข้อมูล)}`);
    }
    // ลงใบแบบ db push: ไม่ห่อ transaction (ไม่ใช้ -1 / begin) · บัญชี postgres แบบเดียวกับ CLI
    const ลง = psql(readFileSync(path.join(โฟลเดอร์ใบ, ใบ), "utf8"));
    const warnings = (ลง.stderr ?? "").split(/\r?\n/).filter(l => /\bWARNING\b/.test(l)).map(l => l.replace(/^psql:[^:]*:\d+:\s*/, "").trim());
    if (ลง.status !== 0) throw new Error(`ซ้อมใบ: ลงใบ ${ใบ} ไม่สำเร็จ — ${ข้อความผิดเต็ม(ลง)}`);
    let ผลตรวจ = "";
    if (หลังลงใบ) {
      const ตรวจ = docker(["exec", "-i", ชื่อ, "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"], หลังลงใบ);
      if (ตรวจ.status !== 0) throw new Error(`ซ้อมใบ: ตรวจหลังลงใบ ${ใบ} ตก — ${ข้อความผิดเต็ม(ตรวจ)}`);
      ผลตรวจ = (ตรวจ.stdout ?? "").trim();
    }
    return { warnings, ผลตรวจ };
  } finally {
    docker(["rm", "-f", ชื่อ]);
  }
}
