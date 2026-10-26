// ── ข้อทดสอบ: ฐานทดสอบที่มีของจากเซสชันอื่นค้าง → ขอล็อกแล้วต้องสร้างใหม่จากไฟล์ (บอสสั่ง 26 ต.ค. 69 · scripts/lib/testDbSchema.mjs) ──
// ใช้ฐานทดสอบจริง · ทำให้ฐานถูกสร้างใหม่อย่างน้อย 1 ครั้ง (ราว 2–4 นาที) → รันเดี่ยวเท่านั้น (ใต้ล็อกของตัวแม่ = ข้าม)
//   ① ถือล็อกแล้ว "ลงของที่ไม่อยู่ในไฟล์ใบ" ค้างไว้: ฟังก์ชันจร + ประวัติใบเลข 9999 (เหมือนเซสชันอื่นลองใบใหม่แล้วไม่คืนฐาน)
//   ② ขอล็อกใหม่ (โปรเซสใหม่ · เหมือนรอบตรวจเต็มเริ่ม) → ต้องบอกว่าไม่ตรงอะไร + น่าจะมาจากไหน แล้วสร้างใหม่ → ของค้างต้องหายหมด
// mutation proof: PMS_GUARD_LIB_DIR=<โฟลเดอร์ที่คัดตัวล็อกไปแก้ให้ไม่เทียบ> → ข้อทดสอบต้องตก (tests/tools/testdb-schema-mutation.mjs)
// รัน: node tests/tools/testdb-schema.test.mjs
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

if (process.env.PMS_TESTDB_LOCK_HELD) { console.log("- ข้าม: รันใต้ล็อกของตัวแม่ (ข้อนี้สร้างฐานทดสอบใหม่ — รันเดี่ยวเท่านั้น)\n\nALL PASS"); process.exit(0); }
const ราก = process.cwd();
const ที่ตัวล็อก = process.env.PMS_GUARD_LIB_DIR || path.join(ราก, "scripts/lib");
const { อาร์กิวเมนต์psql, คอนเทนเนอร์ } = await import(pathToFileURL(path.join(ราก, "scripts/lib/testDbGuard.mjs")).href);

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(0, 1500)}`}`); };
// ขอล็อกในโปรเซสใหม่ (ตัวล็อกจาก ที่ตัวล็อก) แล้วรัน sql ระหว่างถือ · คืน stderr ของการขอล็อก
const ถือแล้วรัน = (sql = "") => spawnSync(process.execPath, ["--input-type=module", "-e", `
  const { ขอล็อกฐานทดสอบ } = await import(${JSON.stringify(pathToFileURL(path.join(ที่ตัวล็อก, "testDbLock.mjs")).href)});
  const { อาร์กิวเมนต์psql, คอนเทนเนอร์ } = await import(${JSON.stringify(pathToFileURL(path.join(ราก, "scripts/lib/testDbGuard.mjs")).href)});
  const { spawnSync } = await import("node:child_process");
  const ล็อก = ขอล็อกฐานทดสอบ("ข้อทดสอบโครงสร้างฐานตรงกับไฟล์", { รอนาที: 60 });
  const sql = ${JSON.stringify(sql)};
  if (sql) { const r = spawnSync("docker", [...อาร์กิวเมนต์psql(คอนเทนเนอร์), "-X", "-q", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" }); if (r.status) { console.error("SQL ล้ม: " + r.stderr); process.exit(9); } }
  ล็อก.release();`], { cwd: ราก, encoding: "utf8", maxBuffer: 64 << 20 });
const อ่าน = (sql) => spawnSync("docker", อาร์กิวเมนต์psql(คอนเทนเนอร์, { เขียน: false }).concat(["-X", "-At", "-c", sql]), { encoding: "utf8" }).stdout.trim();

// ⓪ เริ่มจากฐานที่ตรงกับไฟล์ (ครั้งแรกของชุดใบนี้ = สร้างใหม่)
const เริ่ม = ถือแล้วรัน();
ผล(เริ่ม.status === 0, "ขอล็อกครั้งแรก: ได้ล็อก (ฐานตรงกับไฟล์ / สร้างใหม่ให้ตรง)", เริ่ม.stderr);

// ① ลงของที่ไม่อยู่ในไฟล์ใบค้างไว้
const ค้าง = ถือแล้วรัน(`
  create function public.zz_stray_from_other_session() returns int language sql as 'select 1';
  alter table public.dealers add column zz_stray_col text;
  insert into supabase_migrations.schema_migrations (version, name) values ('9999', 'zz_stray_migration');`);
ผล(ค้าง.status === 0 && อ่าน("select count(*) from pg_proc where proname = 'zz_stray_from_other_session'") === "1", "จำลองเซสชันอื่น: ลงฟังก์ชัน + คอลัมน์ + ประวัติใบ 9999 ที่ไม่มีไฟล์ค้างไว้", ค้าง.stderr);

// ② ขอล็อกใหม่ (เหมือนรอบตรวจเต็มเริ่ม) → ต้องบอกส่วนที่ไม่ตรง + ที่มา แล้วสร้างใหม่
const ต่อ = ถือแล้วรัน();
ผล(ต่อ.status === 0, "ขอล็อกหลังมีของค้าง: ได้ล็อก (สร้างใหม่สำเร็จ ไม่ค้าง)", ต่อ.stderr);
ผล(/ไม่ตรงกับไฟล์ใบปรับฐาน/.test(ต่อ.stderr) && /zz_stray_from_other_session/.test(ต่อ.stderr) && /zz_stray_col/.test(ต่อ.stderr),
  "บอกว่าส่วนไหนไม่ตรง (ฟังก์ชัน + คอลัมน์ที่ค้าง)", ต่อ.stderr);
ผล(/น่าจะมาจาก: .*9999/.test(ต่อ.stderr), "บอกที่มาที่น่าจะเป็น (ใบ 9999 ที่ไม่มีไฟล์)", ต่อ.stderr);
ผล(/สร้างฐานทดสอบใหม่จากไฟล์ใบชุด/.test(ต่อ.stderr), "สร้างฐานทดสอบใหม่จากไฟล์ใบของโฟลเดอร์นี้ก่อนให้ล็อก", ต่อ.stderr);
ผล(อ่าน("select count(*) from pg_proc where proname = 'zz_stray_from_other_session'") === "0", "หลังสร้างใหม่: ฟังก์ชันที่ค้างหายไป");
ผล(อ่าน("select count(*) from information_schema.columns where table_name = 'dealers' and column_name = 'zz_stray_col'") === "0", "หลังสร้างใหม่: คอลัมน์ที่ค้างหายไป");
ผล(อ่าน("select count(*) from supabase_migrations.schema_migrations where version = '9999'") === "0", "หลังสร้างใหม่: ประวัติใบที่ไม่มีไฟล์หายไป");

// ③ ขอล็อกซ้ำทันที (ไม่มีอะไรค้าง) → ไม่สร้างใหม่ (ไม่เปลืองเวลาทุกครั้ง)
const ซ้ำ = ถือแล้วรัน();
ผล(ซ้ำ.status === 0 && !/สร้างใหม่/.test(ซ้ำ.stderr), "ฐานตรงกับไฟล์อยู่แล้ว → ขอล็อกแล้วไม่สร้างใหม่", ซ้ำ.stderr);

// ตัวล็อกถูกแก้ (mutation) แล้วของค้างยังอยู่ → ขอล็อกด้วยตัวจริงเพื่อคืนฐาน
if (process.env.PMS_GUARD_LIB_DIR && อ่าน("select count(*) from pg_proc where proname = 'zz_stray_from_other_session'") !== "0") {
  spawnSync(process.execPath, ["--input-type=module", "-e", `const { ขอล็อกฐานทดสอบ } = await import(${JSON.stringify(pathToFileURL(path.join(ราก, "scripts/lib/testDbLock.mjs")).href)}); ขอล็อกฐานทดสอบ("คืนฐานหลัง mutation", { รอนาที: 60 }).release();`], { cwd: ราก, stdio: "inherit",
    env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== "PMS_TESTDB_SCHEMA_CACHE" && k !== "PMS_GUARD_LIB_DIR")) });   // ลายของจริง
}

console.log(ตก ? `\n${ตก} FAIL` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
