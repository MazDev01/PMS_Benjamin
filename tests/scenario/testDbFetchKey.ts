// ── แนบกุญแจเขียนของผู้ถือล็อก (หัวคำขอ x-pms-lock) ในโปรเซสของ playwright (26 ต.ค. 69) ─────────────────────────────────
//   ตัวเดียวกับ scripts/lib/testDbFetchKey.mjs แต่เป็น TypeScript — ตัวตั้งค่า (playwright.config.ts) โหลดในโปรเซสหลักและทุก worker
//   ทำไมไม่ใช้ NODE_OPTIONS อย่างเดียว: playwright ตั้ง NODE_OPTIONS ของ worker เอง ตัวโหลดล่วงหน้าของเราจึงไม่ถึง worker
//   และส่ง --import ของ scripts/lib/testDbFetchKey.mjs ต่อให้โปรแกรมลูกที่ข้อทดสอบเปิด (สคริปต์ล้าง/ตัวช่วย) ด้วย
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ราก = path.resolve(__dirname, "../..");
const ports = JSON.parse(readFileSync(path.join(ราก, "scripts/lib/ports.json"), "utf8"));
const พอร์ตAPI = String(ports.ฐาน?.ทดสอบ?.api ?? 55321);
const ปลายทาง = (u: string | undefined) => { try { const x = new URL(String(u)); return /^(127\.0\.0\.1|localhost)$/.test(x.hostname) && x.port === พอร์ตAPI; } catch { return false; } };

const g = globalThis as typeof globalThis & { __pmsTestDbKey?: boolean };
if (typeof g.fetch === "function" && !g.__pmsTestDbKey) {
  g.__pmsTestDbKey = true;
  const เดิม = g.fetch;
  g.fetch = function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
    const key = process.env.PMS_TESTDB_PG_PASSWORD;
    const url = typeof input === "string" || input instanceof URL ? String(input) : (input as Request)?.url;
    if (!key || !ปลายทาง(url)) return เดิม.call(this, input, init);
    const h = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    h.set("x-pms-lock", key);
    return input instanceof Request ? เดิม.call(this, new Request(input, { ...init, headers: h })) : เดิม.call(this, input, { ...init, headers: h });
  } as typeof fetch;
}

/** ให้โปรแกรมลูกที่ข้อทดสอบเปิดได้ตัวแนบกุญแจด้วย (NODE_OPTIONS ของ worker ถูก playwright ตั้งทับ) */
export function ส่งตัวแนบให้ลูก(): void {
  if (!process.env.PMS_TESTDB_PG_PASSWORD) return;
  const เดิม = process.env.NODE_OPTIONS ?? "";
  if (เดิม.includes("testDbFetchKey.mjs")) return;
  process.env.NODE_OPTIONS = `${เดิม} --import=${pathToFileURL(path.join(ราก, "scripts/lib/testDbFetchKey.mjs")).href}`.trim();
}
