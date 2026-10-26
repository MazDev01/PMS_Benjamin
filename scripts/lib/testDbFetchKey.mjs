// ── แนบกุญแจเขียนของผู้ถือล็อก (หัวคำขอ x-pms-lock) ไปกับทุกคำขอที่ไปฐานทดสอบ (scripts/lib/testDbGuard.mjs · 26 ต.ค. 69) ──────
//
// ฐานทดสอบรับเขียนเฉพาะคำขอที่มีกุญแจของรอบ ไม่ว่าจะใช้กุญแจ anon/service หรือล็อกอินเป็นผู้ใช้
//   สคริปต์/ข้อทดสอบ/เซิร์ฟเวอร์แอปส่งคำขอจากหลายสิบที่ — ตัวนี้แนบให้ตอนส่ง: ปลายทาง = API ฐานทดสอบ + มี PMS_TESTDB_PG_PASSWORD (ได้เมื่อถือล็อก)
//   ไม่ได้ถือล็อก = ไม่แนบ = เขียนไม่ได้ · ปลายทางอื่น = ไม่แตะ
// โหลดเอง: testDbLock.mjs (โปรเซสที่ขอล็อก) + NODE_OPTIONS --import (ตัวลูกทุกตัว: playwright worker · next · สคริปต์)
import { readFileSync } from "node:fs";

const ports = JSON.parse(readFileSync(new URL("./ports.json", import.meta.url), "utf8"));
const พอร์ตAPI = String(ports.ฐาน?.ทดสอบ?.api ?? 55321);
const ปลายทาง = (u) => { try { const x = new URL(u); return /^(127\.0\.0\.1|localhost)$/.test(x.hostname) && x.port === พอร์ตAPI; } catch { return false; } };

if (typeof globalThis.fetch === "function" && !globalThis.__pmsTestDbKey) {
  globalThis.__pmsTestDbKey = true;
  const เดิม = globalThis.fetch;
  globalThis.fetch = function (input, init) {
    const key = process.env.PMS_TESTDB_PG_PASSWORD;
    const url = typeof input === "string" || input instanceof URL ? String(input) : input?.url;
    if (!key || !ปลายทาง(url)) return เดิม.call(this, input, init);
    const h = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    h.set("x-pms-lock", key);
    return input instanceof Request ? เดิม.call(this, new Request(input, { ...init, headers: h })) : เดิม.call(this, input, { ...init, headers: h });
  };
}
