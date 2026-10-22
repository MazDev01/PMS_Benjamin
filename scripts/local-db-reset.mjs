// ── คืนฐานข้อมูล "ในเครื่อง" ให้เป็นชุดตัวอย่างสะอาด ────────────────────────────
//
// ใช้เมื่อไหร่: หลังรันชุดทดสอบหลาย ๆ รอบแล้วฐานในเครื่องเริ่มมีขยะสะสม
//   (ลูกค้าชื่อซ้ำ · แม่แบบทดสอบ ZZ* · ลูกค้าที่ลงวันที่เป็นลูกค้าล่วงหน้าจากเทสต์ประกัน)
//   ขยะพวกนี้ทำให้ภาพหน้าจอที่ถ่ายไปใช้นำเสนอดูไม่น่าเชื่อถือ และทำให้เทสต์บางตัวตกแบบไม่มีสาเหตุ
//
//   node scripts/local-db-reset.mjs
//
// ⚠️ ทำเฉพาะฐานในเครื่อง (127.0.0.1) — ตรวจ URL ก่อนเสมอ ถ้าไม่ใช่จะหยุดทันที
// ⚠️ ไม่แตะตารางสาขา (dealers) และบัญชีผู้ใช้ — สองอย่างนี้เป็นของตั้งต้นที่ชุดทดสอบต้องใช้
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { ขอล็อกฐานทดสอบ } from "./lib/testDbLock.mjs";

// เขียนฐานทดสอบ = ถือล็อกฐานทดสอบ — เซสชันอื่นใช้ฐานอยู่ (เช่นรอบตรวจเต็ม) = หยุด บอกว่าใคร (scripts/lib/testDbLock.mjs · 22 ต.ค. 69)
ขอล็อกฐานทดสอบ("local-db-reset");

const อ่าน = (p) => Object.fromEntries(fs.readFileSync(p, "utf8").split(/\r?\n/)
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));

const env = อ่าน("apps/hq/.env.local");
if (!env.NEXT_PUBLIC_SUPABASE_URL.includes("127.0.0.1")) {
  console.error("หยุด — ไฟล์ตั้งค่าไม่ได้ชี้ฐานในเครื่อง:", env.NEXT_PUBLIC_SUPABASE_URL);
  process.exit(1);
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const DIR = "backups/ชุดตัวอย่างสะอาด-2569-09-02";
const ตาราง = ["master_catalog", "customers", "leads", "quotations", "appointments"];

// 1) ล้างของเดิม — ไล่จาก "ลูก" ไป "แม่" ไม่งั้นติดกุญแจนอก
//    ⚠️ ห้ามใช้ .gte("id", 0): ตาราง leads/quotations ใช้รหัสเป็นข้อความ ("#L-123")
//       เงื่อนไขจะไม่ตรงกับแถวไหนเลย → สั่งลบสำเร็จแต่ไม่มีอะไรถูกลบ (เจอจริง 2 ก.ย. 69)
for (const t of ["dealer_files", "appointments", "quotations", "leads", "customers", "master_catalog"]) {
  const { error } = await db.from(t).delete().not("id", "is", null);
  if (error && error.code === "42P01") continue;              // ไม่มีตารางนี้ในสคีมา = ข้ามไป
  console.log("ล้าง", t, error ? error.message.slice(0, 70) : "เรียบร้อย");
}

// 2) ใส่ชุดตัวอย่างสะอาดกลับเข้าไป (ลำดับต้องตรงข้ามกับตอนลบ)
for (const t of ตาราง) {
  const rows = JSON.parse(fs.readFileSync(`${DIR}/${t}.json`, "utf8"));
  let ใส่ = 0, พลาด = "";
  for (let i = 0; i < rows.length; i += 50) {
    const { error } = await db.from(t).insert(rows.slice(i, i + 50));
    if (error) { พลาด = error.message.slice(0, 80); break; }
    ใส่ += rows.slice(i, i + 50).length;
  }
  console.log("ใส่คืน", t, `${ใส่}/${rows.length}`, พลาด);
}

// 3) ตรวจว่าไม่เหลือขยะจริง
const { data: cust } = await db.from("customers").select("company,dealer_code,join_date");
const นับ = new Map();
for (const c of cust ?? []) {
  const k = `${c.dealer_code}|${String(c.company).trim().toLowerCase()}`;
  นับ.set(k, (นับ.get(k) ?? 0) + 1);
}
const วันนี้ = new Date().toISOString().slice(0, 10);
const เช็กแท็ก = async (t, ช) => (await db.from(t).select("id", { count: "exact", head: true }).ilike(ช, "ZZ%")).count ?? 0;
const ขยะ = (await เช็กแท็ก("master_catalog", "name")) + (await เช็กแท็ก("leads", "company"))
  + (await เช็กแท็ก("customers", "company")) + (await เช็กแท็ก("quotations", "customer"));
console.log(`\nข้อมูลทดสอบที่เหลือ ${ขยะ} แถว · ลูกค้าชื่อซ้ำ ${[...นับ.values()].reduce((s, n) => s + (n - 1), 0)} แถว`
  + ` · ลูกค้าลงวันที่ล่วงหน้า ${(cust ?? []).filter((c) => String(c.join_date ?? "") > วันนี้).length} แถว`);
