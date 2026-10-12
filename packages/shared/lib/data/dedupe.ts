"use client";

// รวมคำขอ "อ่าน" ที่เหมือนกันและค้างอยู่พร้อมกัน ให้ยิงจริงครั้งเดียว (in-flight dedup) — H7
//
// อาการ: เปิดหน้า HQ หนึ่งหน้า มีหลายคอมโพเนนต์ (Topbar · แดชบอร์ด · useNetworkData ·
//   useFilterOptions · หน้า HQ อีกหลายหน้า) เรียก dealers.list() / settings.getTargets() ฯลฯ
//   พร้อมกัน → ยิง select เดียวกัน 4–6 รอบซ้อน
//
// วิธีที่ปลอดภัยสุด: dedup "เฉพาะช่วงที่คำขอค้างอยู่" (in-flight) ไม่แคชข้ามเวลา
//   • คำขอที่ค้างอยู่ → ผู้เรียกถัดไปแชร์ promise เดิม (ยิงจริงครั้งเดียว)
//   • คำขอเสร็จ (settle) → ล้าง key ทันที → เรียกครั้งต่อไปได้ค่าสด
//   → ไม่มีปัญหา staleness เลย เพราะไม่เคยคืน "ค่าเก่า" ให้ใคร มีแต่ "รวมคำขอที่เกิดพร้อมกัน"
//
// ใช้กับ read ที่ "ไม่มีพารามิเตอร์" เท่านั้น (dealers.list · settings.get* · catalog.list)
// read ที่มี scope/args ต่างกันห้าม dedup ด้วย key เดียว (จะคืนข้อมูลผิดชุด)
const inflight = new Map<string, Promise<unknown>>();

export function dedupeRead<T>(key: string, run: () => Promise<T>): Promise<T> {
  const hit = inflight.get(key);
  if (hit) return hit as Promise<T>;
  const p = Promise.resolve().then(run).finally(() => { inflight.delete(key); });
  inflight.set(key, p);
  return p;
}

// ── TTL cache — สำหรับข้อมูลอ้างอิงที่แทบไม่เปลี่ยนภายใน session เดียว ──────────
// (ทะเบียนดีลเลอร์ · แคตตาล็อกกลาง · กฎธุรกิจ/เป้า · ผู้รับผิดชอบต่อสาขา) ต่างจาก dedupeRead
// (รวมแค่คำขอที่ค้างพร้อมกัน) ตัวนี้ "จำค่าที่โหลดสำเร็จไว้ข้ามเวลา" จริง — จึงต้อง invalidate เอง
// ทุกจุดที่มีการเขียนทับข้อมูลชุดเดียวกัน (ดู index.ts: ต่อ save/remove ของแต่ละ repo เข้ากับ invalidateCache)
// พบจากผลตรวจสอบระบบรอบ 2 (31 ก.ค. 69): เปิดหน้า HQ 6 หน้า → ยิงซ้ำ endpoint เดิม 4-6 รอบ
type CacheEntry<T> = { value: T; at: number };
const cache = new Map<string, CacheEntry<unknown>>();

export function ttlCacheRead<T>(key: string, run: () => Promise<T>, ttlMs: number): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return Promise.resolve(hit.value as T);
  return dedupeRead(key, run).then(v => { cache.set(key, { value: v, at: Date.now() }); return v; });
}

/** ล้าง cache หลังเขียนข้อมูล — คีย์ตรง = ล้างรายการเดียว · ไม่ส่ง key = ล้างทั้งหมด (เผื่อผู้เรียกไม่รู้คีย์ชัด) */
export function invalidateCache(key?: string): void {
  if (key === undefined) { cache.clear(); return; }
  cache.delete(key);
}
