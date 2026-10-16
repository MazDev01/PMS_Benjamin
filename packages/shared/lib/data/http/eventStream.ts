// ── สายรับ "ข้อมูลเปลี่ยนแล้ว" จาก backend ของเราเอง (ระยะ 3) ─────────────────────
//
// โหมด supabase เปิด WebSocket 5 ช่องจากเบราว์เซอร์ตรงไปหา Supabase
// โหมด api เปิด "สายเดียว" มาที่ /api/v1/events แล้วแยกแจกตามช่องที่นี่
//   — เบราว์เซอร์ไม่ต้องรู้จักฐานข้อมูลอีกต่อไป ซึ่งเป็นเป้าหมายของทั้งแผน
//
// ⚠️ ทำไมไม่ใช้ EventSource ที่มีมาให้ในเบราว์เซอร์:
//    EventSource แนบ header เองไม่ได้ → ต้องส่งใบผ่านไปทาง URL แทน
//    ใบผ่านใน URL จะไปโผล่ใน log ของเซิร์ฟเวอร์/ตัวกลางทุกชั้น = ความลับรั่วโดยไม่ตั้งใจ
//    ใช้ fetch + อ่านสายเอาเองแทน แนบ header ได้ตามปกติ และคุมการต่อใหม่ได้ละเอียดกว่า
//
// ⚠️ สายนี้ "ถูกปิดเป็นระยะโดยตั้งใจ" — เซิร์ฟเวอร์ไร้เซิร์ฟเวอร์มีเพดานอายุคำขอ
//    ฝั่งนี้จึงต้องต่อใหม่ทันทีเมื่อสายจบแบบปกติ ไม่ใช่ถือว่าพัง
import { captureError } from "@pms/shared/lib/observability";
import type { SalesChange } from "../ports";
import { DATA_SOURCE } from "../config";

const COOKIE_AUTH = DATA_SOURCE === "api";   // ใบผ่านอยู่ใน cookie (ระยะ 4)

/** ชื่อช่อง — ต้องตรงกับที่เซิร์ฟเวอร์ส่งมา (events.ts) */
export type EventChannel = "sales" | "settings" | "notes" | "dealerSettings";

type Listener = (payload?: SalesChange) => void;
const listeners = new Map<EventChannel, Set<Listener>>();

let abort: AbortController | null = null;
let running = false;
let attempt = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
/** ถอยห่างขึ้นเรื่อย ๆ เหมือนฝั่ง supabase (subscribeWithRetry) — ต่อติดเมื่อไหร่ล้างตัวนับ */
const RETRY_MS = [1_000, 3_000, 8_000];

function emit(ch: EventChannel, payload?: SalesChange) {
  const set = listeners.get(ch);
  if (!set) return;
  for (const fn of [...set]) {
    try { fn(payload); } catch (e) { console.warn("[events] ตัวรับ event โยน error", ch, e); }
  }
}

function anyListeners(): boolean {
  for (const s of listeners.values()) if (s.size) return true;
  return false;
}

async function token(): Promise<string> {
  try {
    const { getSupabase } = await import("../supabase/client");
    const { data } = await getSupabase().auth.getSession();
    return data.session?.access_token ?? "";
  } catch { return ""; }
}

/** อ่านสายจนจบ — คืน true ถ้าเคยได้ข้อมูลจริงอย่างน้อยหนึ่งครั้ง (= ต่อติดแล้ว) */
async function readStream(res: Response): Promise<boolean> {
  const reader = res.body?.getReader();
  if (!reader) return false;
  const dec = new TextDecoder();
  let buf = "";
  let gotAny = false;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    // ข้อความ SSE คั่นด้วยบรรทัดว่าง · ชิ้นสุดท้ายอาจยังมาไม่ครบ เก็บไว้รอบหน้า
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.split("\n").find(l => l.startsWith("data:"));
      if (!line) continue;                     // ": ping" — แค่กันสายเงียบ ไม่ใช่ข้อมูล
      let msg: { ch?: string; change?: SalesChange };
      try { msg = JSON.parse(line.slice(5).trim()); } catch { continue; }
      gotAny = true;
      if (msg.ch === "ready") continue;        // แค่บอกว่าสายพร้อม
      if (msg.ch) emit(msg.ch as EventChannel, msg.change);
    }
  }
  return gotAny;
}

// ⚠️ ทุกจุดที่ await เสร็จ ต้องเช็ก "รอบนี้ยังเป็นรอบปัจจุบันอยู่ไหม" ก่อนทำต่อเสมอ
//    เหตุ: React ในโหมดพัฒนาเรียก effect ซ้ำ (mount → unmount → mount ทันที)
//    ตัวเลิกรับตัวสุดท้ายสั่งหยุด แล้วตัวสมัครตัวใหม่สั่งเริ่มในจังหวะเดียวกัน
//    ถ้าเช็กแค่ `running` รอบเก่าที่กำลังค้างอยู่ที่ await จะเห็น running กลับเป็น true
//    แล้ววนต่อ = มีสองรอบทำงานพร้อมกัน เปิดสายซ้อนกันสองสาย และแย่ง AbortController กันเอง
//    (ของจริงจะเห็นเป็น "event มาซ้ำสองครั้ง" ซึ่งไล่หายากมาก)
let gen = 0;

async function loop(my: number) {
  const mine = () => running && gen === my && anyListeners();
  while (mine()) {
    const ac = new AbortController();
    abort = ac;
    let connected = false;
    const startedAt = Date.now();
    try {
      // โหมด cookie ไม่ต้องหาใบผ่านมาแนบ — เบราว์เซอร์ส่ง cookie ไปให้เอง (ระยะ 4)
      const t = COOKIE_AUTH ? "" : await token();
      if (!mine()) break;
      if (!COOKIE_AUTH && !t) { await wait(1_000); continue; }   // ยังกู้เซสชันไม่เสร็จ
      const res = await fetch("/api/v1/events", {
        headers: t ? { authorization: `Bearer ${t}` } : {},
        credentials: "same-origin",
        signal: ac.signal,
        cache: "no-store",
      });
      // ⚠️ 401/403 = "ยังไม่ได้ล็อกอิน / หมดสิทธิ์แล้ว" ไม่ใช่สายขัดข้อง — ต่อใหม่ถี่ ๆ ก็ได้ 401 เหมือนเดิม
      //    ต้องรอเงียบ ๆ ไม่ใช่รายงานว่า "อัปเดตสดใช้ไม่ได้" ให้ผู้ใช้ตกใจตอนอยู่หน้าเข้าสู่ระบบ
      if (res.status === 401 || res.status === 403) { await wait(30_000); continue; }
      if (!res.ok) throw new Error(`เซิร์ฟเวอร์ตอบกลับ ${res.status}`);
      connected = await readStream(res);
    } catch (e) {
      if (!mine() || (e instanceof DOMException && e.name === "AbortError")) break;
      // ต่อไม่ติดจริง ๆ — ถอยห่างขึ้นเรื่อย ๆ แล้วค่อยลองใหม่
      if (attempt >= RETRY_MS.length) {
        captureError(
          new Error(`อัปเดตสด: ต่อใหม่ ${RETRY_MS.length} ครั้งแล้วยังไม่ติด — ข้อมูลจะช้ากว่าปกติ (ยังซิงก์ทุก 30 วินาที)`),
          "realtime",
        );
        attempt = 0;
        await wait(30_000);   // ยอมแพ้ชั่วคราว ไม่ถล่มเซิร์ฟเวอร์ต่อ
        continue;
      }
      await wait(RETRY_MS[attempt++]);
      continue;
    }
    // ── สายจบแล้ว จะต่อใหม่เร็วแค่ไหน ต้องดู "อยู่ได้นานพอไหม" ไม่ใช่แค่ "เคยได้ข้อมูลไหม" ──
    //
    // ⚠️ กับดักที่เจอจริง (18 ส.ค. 69): เซิร์ฟเวอร์ส่ง ready ทันทีที่เปิดสาย → ฝั่งนี้นับว่า "ต่อติดแล้ว"
    //    ถ้าหลังจากนั้นช่องมีปัญหาแล้วปิดทันที เราจะต่อใหม่แบบไม่หน่วงเลย → ปิด-เปิดรัวไม่หยุด
    //    หลายแท็บพร้อมกัน = ถล่มเซิร์ฟเวอร์ตัวเองจนทุกหน้าเปิดไม่ขึ้น
    //    (อาการที่เห็นคือ "ต่อเซิร์ฟเวอร์ไม่ได้" ทั้งระบบ ซึ่งดูไม่ออกเลยว่ามาจากสายอัปเดตสด)
    //
    // เกณฑ์: อยู่ได้เกิน 5 วินาที = สายดี (เซิร์ฟเวอร์ปิดตามเพดานอายุตามปกติ) → ต่อใหม่ได้ไว
    //        ปิดเร็วกว่านั้น = ผิดปกติ → ถอยห่างขึ้นเรื่อย ๆ เหมือนกรณีต่อไม่ติด
    const HEALTHY_MS = 5_000;
    const MIN_GAP_MS = 300;      // ไม่ว่ากรณีไหน ห้ามยิงติดกันโดยไม่เว้นวรรคเลย
    const lived = Date.now() - startedAt;
    if (connected && lived >= HEALTHY_MS) {
      attempt = 0;
      await wait(MIN_GAP_MS);
    } else {
      await wait(attempt < RETRY_MS.length ? RETRY_MS[attempt++] : RETRY_MS[RETRY_MS.length - 1]);
    }
  }
  if (gen === my) running = false;   // รอบเก่าที่ถูกแทนแล้ว ห้ามไปปิดสวิตช์ของรอบใหม่
}

function wait(ms: number) {
  return new Promise<void>(r => { retryTimer = setTimeout(() => r(), ms); });
}

function ensureRunning() {
  if (running || typeof window === "undefined") return;
  running = true;
  void loop(++gen);
}

function stopIfIdle() {
  if (anyListeners()) return;
  running = false;
  gen++;                 // ทำให้รอบที่ค้างอยู่กลายเป็น "รอบเก่า" ทันที ต่อให้มีคนสั่งเริ่มใหม่พอดี
  attempt = 0;
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  abort?.abort();
  abort = null;
}

/** สมัครรับ event ของช่องหนึ่ง — คืนฟังก์ชันเลิกรับ (สายจะปิดเองเมื่อไม่มีใครฟังแล้ว) */
export function onChannel(ch: EventChannel, fn: Listener): () => void {
  let set = listeners.get(ch);
  if (!set) { set = new Set(); listeners.set(ch, set); }
  set.add(fn);
  ensureRunning();
  return () => {
    set.delete(fn);
    stopIfIdle();
  };
}
