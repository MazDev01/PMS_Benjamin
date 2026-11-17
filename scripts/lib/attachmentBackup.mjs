// ── สำรอง/กู้ไฟล์แนบ (ที่เก็บไฟล์ของ Supabase) แบบดาวน์โหลดเฉพาะไฟล์ใหม่/เปลี่ยน ─────────────────
//
// บอสเลือกทาง 3 (18 พ.ย. 69 · ข้อ 8): เดิม scripts/backup.mjs ไม่สำรองตัวไฟล์แนบเลย (นับแค่จำนวนแถว)
//   ทุกชุดสำรองต้องกู้ไฟล์แนบได้ครบด้วยตัวเอง แต่ไม่ดาวน์โหลดใหม่ทั้งหมดทุกวัน:
//   ไฟล์ที่ไม่เปลี่ยนตั้งแต่ชุดก่อน (id · เวลาแก้ · ขนาด · eTag ตรง และไฟล์ในชุดก่อนยังตรง sha256 ที่จดไว้)
//   = คัดลอกจากชุดก่อนมาไว้ในชุดนี้ · ไฟล์ใหม่/เปลี่ยน/ไฟล์ชุดก่อนเสีย = ดาวน์โหลดใหม่
//   คัดลอก (ไม่ใช้ hard link) — ไฟล์ในชุดหนึ่งเสีย ชุดอื่นไม่เสียตาม
//
// โครงในโฟลเดอร์ชุดสำรอง:  _attachments/manifest.json  +  _attachments/<bucket>/<sha256(bucket/name) 32 ตัว>
//   (ชื่อไฟล์บนดิสก์เป็นค่าแฮช — ชื่อไฟล์จริงอาจมีอักษรที่ Windows ไม่รับ · ชื่อจริงอยู่ใน manifest)
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export const โฟลเดอร์ไฟล์แนบ = "_attachments";
const หน้า = 1000;

export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
export const คีย์ = (bucket, name) => `${bucket}/${name}`;
export const ชื่อบนดิสก์ = (bucket, name) => path.join(bucket, sha256(Buffer.from(คีย์(bucket, name))).slice(0, 32));

/** ไฟล์เดียวกับในชุดก่อนไหม — ตัดสินจากข้อมูลของที่เก็บไฟล์เท่านั้น (ยังไม่ตรวจไฟล์บนดิสก์) */
export function ไม่เปลี่ยน(ปัจจุบัน, ก่อน) {
  return !!ก่อน && ปัจจุบัน.id === ก่อน.id && ปัจจุบัน.updated_at === ก่อน.updated_at
    && ปัจจุบัน.size === ก่อน.size && (ปัจจุบัน.etag ?? null) === (ก่อน.etag ?? null);
}

/**
 * แผนสำรอง: ไฟล์ไหนคัดลอกจากชุดก่อน ไฟล์ไหนต้องดาวน์โหลด
 * @param {Array<{bucket,name,id,updated_at,size,etag}>} รายการ ไฟล์ในที่เก็บตอนนี้
 * @param {{dir:string, manifest:{files:Array}}|null} ชุดก่อน
 * @param {(file:string)=>Buffer|null} อ่าน อ่านไฟล์ในชุดก่อน (ไม่มี = null)
 */
export function วางแผน(รายการ, ชุดก่อน, อ่าน = (f) => (existsSync(f) ? readFileSync(f) : null)) {
  const เดิม = new Map((ชุดก่อน?.manifest?.files ?? []).map((f) => [คีย์(f.bucket, f.name), f]));
  const คัดลอก = [], ดาวน์โหลด = [];
  for (const o of รายการ) {
    const ก่อน = เดิม.get(คีย์(o.bucket, o.name));
    if (!ไม่เปลี่ยน(o, ก่อน)) { ดาวน์โหลด.push({ ...o, เหตุ: ก่อน ? "เปลี่ยน" : "ใหม่" }); continue; }
    const ไฟล์ = path.join(ชุดก่อน.dir, โฟลเดอร์ไฟล์แนบ, ก่อน.file);
    const buf = อ่าน(ไฟล์);
    if (!buf || sha256(buf) !== ก่อน.sha256) { ดาวน์โหลด.push({ ...o, เหตุ: "ไฟล์ชุดก่อนเสีย/หาย" }); continue; }
    คัดลอก.push({ ...o, จาก: ไฟล์, sha256: ก่อน.sha256 });
  }
  return { คัดลอก, ดาวน์โหลด };
}

/** ชุดก่อนล่าสุดที่สำรองไฟล์แนบครบ จากต้นทางเดียวกัน (ไม่นับชุดที่กำลังทำ) */
export function หาชุดก่อน(ฐาน, ชุดนี้, ต้นทาง) {
  if (!existsSync(ฐาน)) return null;
  let ดีสุด = null;
  for (const ชื่อ of readdirSync(ฐาน)) {
    const dir = path.join(ฐาน, ชื่อ);
    if (path.resolve(dir) === path.resolve(ชุดนี้)) continue;
    const f = path.join(dir, โฟลเดอร์ไฟล์แนบ, "manifest.json");
    if (!existsSync(f)) continue;
    let m; try { m = JSON.parse(readFileSync(f, "utf8")); } catch { continue; }
    if (m.ครบ !== true || m.source !== ต้นทาง) continue;
    if (!ดีสุด || m.at > ดีสุด.manifest.at) ดีสุด = { dir, manifest: m };
  }
  return ดีสุด;
}

/** รายการไฟล์ทั้งหมดในทุก bucket (ไล่โฟลเดอร์ย่อย · ทีละหน้า) */
export async function รายการไฟล์(svc) {
  const { data: buckets, error } = await svc.storage.listBuckets();
  if (error) throw new Error(`อ่านรายชื่อที่เก็บไฟล์ไม่ได้: ${error.message}`);
  const ผล = [];
  for (const b of buckets ?? []) {
    const คิว = [""];
    while (คิว.length) {
      const prefix = คิว.shift();
      for (let offset = 0; ; offset += หน้า) {
        const { data, error: e } = await svc.storage.from(b.id).list(prefix, { limit: หน้า, offset, sortBy: { column: "name", order: "asc" } });
        if (e) throw new Error(`อ่านรายการไฟล์ ${b.id}/${prefix} ไม่ได้: ${e.message}`);
        for (const x of data ?? []) {
          const name = prefix ? `${prefix}/${x.name}` : x.name;
          if (x.id == null) { คิว.push(name); continue; }   // โฟลเดอร์
          ผล.push({ bucket: b.id, name, id: x.id, updated_at: x.updated_at, size: x.metadata?.size ?? null,
            etag: x.metadata?.eTag ?? null, mimetype: x.metadata?.mimetype ?? null });
        }
        if ((data?.length ?? 0) < หน้า) break;
      }
    }
  }
  return ผล;
}

/**
 * สำรองไฟล์แนบลง <dir>/_attachments · คืน { ครบ, ทั้งหมด, ดาวน์โหลด, คัดลอก, พลาด[] }
 * @param {{svc, dir:string, ฐาน:string, ต้นทาง:string, log?:(s:string)=>void}} opt
 */
export async function สำรองไฟล์แนบ({ svc, dir, ฐาน, ต้นทาง, log = console.log }) {
  const ปลาย = path.join(dir, โฟลเดอร์ไฟล์แนบ);
  mkdirSync(ปลาย, { recursive: true });
  const รายการ = await รายการไฟล์(svc);
  const ชุดก่อน = หาชุดก่อน(ฐาน, dir, ต้นทาง);
  const แผน = วางแผน(รายการ, ชุดก่อน);
  const files = [], พลาด = [];
  for (const o of แผน.คัดลอก) {
    const file = ชื่อบนดิสก์(o.bucket, o.name);
    mkdirSync(path.join(ปลาย, o.bucket), { recursive: true });
    copyFileSync(o.จาก, path.join(ปลาย, file));
    files.push({ bucket: o.bucket, name: o.name, id: o.id, updated_at: o.updated_at, size: o.size, etag: o.etag,
      mimetype: o.mimetype, sha256: o.sha256, file, ที่มา: "ชุดก่อน" });
  }
  for (const o of แผน.ดาวน์โหลด) {
    const { data, error } = await svc.storage.from(o.bucket).download(o.name);
    if (error || !data) { พลาด.push(`${คีย์(o.bucket, o.name)}: ${error?.message ?? "ไม่ได้ไฟล์"}`); continue; }
    const buf = Buffer.from(await data.arrayBuffer());
    const file = ชื่อบนดิสก์(o.bucket, o.name);
    mkdirSync(path.join(ปลาย, o.bucket), { recursive: true });
    writeFileSync(path.join(ปลาย, file), buf);
    files.push({ bucket: o.bucket, name: o.name, id: o.id, updated_at: o.updated_at, size: o.size, etag: o.etag,
      mimetype: o.mimetype, sha256: sha256(buf), file, ที่มา: "ดาวน์โหลด", เหตุ: o.เหตุ });
  }
  const ครบ = พลาด.length === 0;
  writeFileSync(path.join(ปลาย, "manifest.json"), JSON.stringify({
    at: new Date().toISOString(), source: ต้นทาง, ครบ, ชุดก่อน: ชุดก่อน ? path.basename(ชุดก่อน.dir) : null,
    files, พลาด,
  }, null, 1), "utf8");
  const ดาวน์โหลด = files.filter((f) => f.ที่มา === "ดาวน์โหลด").length;
  log(`  ${ครบ ? "✅" : "❌"} ${"ไฟล์แนบ".padEnd(24)} ${String(files.length).padStart(6)} ไฟล์  (ดาวน์โหลดใหม่ ${ดาวน์โหลด} · คัดลอกจากชุดก่อน ${files.length - ดาวน์โหลด}${ชุดก่อน ? ` [${path.basename(ชุดก่อน.dir)}]` : " · ไม่มีชุดก่อน"}${พลาด.length ? ` · พลาด ${พลาด.length}` : ""})`);
  for (const p of พลาด.slice(0, 5)) log(`     ❌ ${p.slice(0, 120)}`);
  return { ครบ, ทั้งหมด: files.length, ดาวน์โหลด, คัดลอก: files.length - ดาวน์โหลด, พลาด };
}

/**
 * เทียบ/กู้ไฟล์แนบจากชุดสำรอง — ไฟล์ที่หายหรือเนื้อหาไม่ตรง (ขนาด/sha256) = อัปโหลดกลับ (apply เท่านั้น)
 * ไฟล์ที่เกิดใหม่หลังวันสำรองไม่แตะ (เหมือนการกู้ตาราง) · คืน { หาย, ต่าง, กู้แล้ว, พลาด[] }
 */
export async function กู้ไฟล์แนบ({ svc, dir, apply, log = console.log }) {
  const ต้น = path.join(dir, โฟลเดอร์ไฟล์แนบ);
  const f = path.join(ต้น, "manifest.json");
  if (!existsSync(f)) return null;
  const m = JSON.parse(readFileSync(f, "utf8"));
  const สด = new Map((await รายการไฟล์(svc)).map((o) => [คีย์(o.bucket, o.name), o]));
  let หาย = 0, ต่าง = 0, กู้แล้ว = 0;
  const พลาด = [];
  for (const x of m.files ?? []) {
    const buf = readFileSync(path.join(ต้น, x.file));
    if (sha256(buf) !== x.sha256) { พลาด.push(`${คีย์(x.bucket, x.name)}: ไฟล์ในชุดสำรองไม่ตรง sha256 ที่จดไว้`); continue; }
    const o = สด.get(คีย์(x.bucket, x.name));
    let ตรง = false;
    if (o && o.size === x.size) {
      const { data } = await svc.storage.from(x.bucket).download(x.name);
      ตรง = !!data && sha256(Buffer.from(await data.arrayBuffer())) === x.sha256;
    }
    if (ตรง) continue;
    if (o) ต่าง++; else หาย++;
    if (!apply) continue;
    const { error } = await svc.storage.from(x.bucket).upload(x.name, buf, {
      upsert: !!o, contentType: x.mimetype ?? "application/octet-stream" });
    if (error) พลาด.push(`${คีย์(x.bucket, x.name)}: ${error.message}`); else กู้แล้ว++;
  }
  const ต้องกู้ = หาย + ต่าง;
  log(`  ${ต้องกู้ || พลาด.length ? "🔴" : "✅"} ${"ไฟล์แนบ".padEnd(24)} ไฟล์ ${String(m.files?.length ?? 0).padStart(6)}   ${ต้องกู้ ? `หาย ${หาย} · ต่างกัน ${ต่าง}${apply ? ` · กู้แล้ว ${กู้แล้ว}` : ""}` : "ตรงกัน"}${พลาด.length ? ` · พลาด ${พลาด.length}` : ""}`);
  for (const p of พลาด.slice(0, 5)) log(`     ❌ ${p.slice(0, 120)}`);
  return { หาย, ต่าง, กู้แล้ว, พลาด };
}
