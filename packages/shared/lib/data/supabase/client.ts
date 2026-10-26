"use client";

// Supabase client — จุดเชื่อมต่อ backend จริง (เฟส B)
// อ่านค่าจาก ENV · ถ้ายังไม่ตั้งค่า → ใช้ LocalAdapter (ดู config.ts / index.ts)
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
// กุญแจเขียนของผู้ถือล็อกฐานทดสอบ (scripts/lib/testDbGuard.mjs · 26 ต.ค. 69) — มีเฉพาะเว็บที่ชุดทดสอบเปิดขณะถือล็อก
//   ฐานทดสอบรับเขียนเฉพาะคำขอที่มีกุญแจของรอบ (แม้ล็อกอินเป็นผู้ใช้) · เว็บจริง/ฐาน dev ไม่มีค่านี้ = ไม่ส่งอะไรเพิ่ม
const กุญแจฐานทดสอบ = process.env.NEXT_PUBLIC_PMS_TESTDB_LOCK ?? "";

/** ตั้งค่า Supabase ครบหรือยัง (มี URL + anon key) */
export function isSupabaseConfigured(): boolean {
  return Boolean(URL && ANON);
}

let _client: SupabaseClient | null = null;

/** client แบบ singleton — สร้างครั้งเดียว ใช้ซ้ำทั้งแอป */
export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase ยังไม่ตั้งค่า — กำหนด NEXT_PUBLIC_SUPABASE_URL และ NEXT_PUBLIC_SUPABASE_ANON_KEY ใน .env.local",
    );
  }
  if (!_client) {
    _client = createClient(URL, ANON, {
      // ── ที่เก็บใบผ่านเข้าระบบ: localStorage (ใช้ร่วมกันทุกแท็บ) ────────────────────
      //
      // เคยเป็น sessionStorage (แยกต่อแท็บ) เพื่อกันบั๊กบัญชีปนข้ามแท็บ:
      //   เปิดสาขา ก. ไว้ แล้วล็อกอินสาขา ข. ในแท็บใหม่ → แท็บของสาขา ก. รีเฟรชแล้ว
      //   เห็นข้อมูลของสาขา ข. แบบเงียบ ๆ ทั้งที่หัวจอยังเขียนชื่อสาขา ก.
      //
      // แต่มันแลกมาด้วยราคาที่ผู้ใช้จ่ายทุกวัน (ยืนยันด้วยเบราว์เซอร์จริง 11 ส.ค. 69):
      //   เปิดแท็บใหม่ = เด้งกลับหน้าเข้าสู่ระบบ ทั้งที่ยังไม่เคยกดออกจากระบบเลย
      //   ปิดเบราว์เซอร์แล้วเปิดใหม่ = ต้องล็อกอินใหม่ทุกครั้ง
      //   กดลิงก์ที่เปิดแท็บใหม่ = ต้องล็อกอินใหม่
      //
      // จึงกลับมาใช้ localStorage แล้วกันบั๊กเดิมที่ต้นเหตุจริงแทน — ดูตัวกันสลับบัญชี
      // ใน supabaseAuth.ts (sbOnChange): ถ้าบัญชีในเบราว์เซอร์เปลี่ยนคน แท็บที่ค้างอยู่
      // จะโหลดหน้าใหม่ทั้งหน้า ไม่ใช่เอาข้อมูลบัญชีใหม่มาปะทับหน้าจอของบัญชีเดิม
      // (แก้ที่ต้นเหตุ = ได้ทั้งความถูกต้องและความสะดวก ไม่ต้องเลือกอย่างใดอย่างหนึ่ง)
      auth: { persistSession: true, autoRefreshToken: true },
      // ── นาฬิกาเครื่องกับเซิร์ฟเวอร์ไม่ตรงกัน → ลองใหม่ให้เอง (บอสเจอ 21 ส.ค. 69) ──────
      //
      // อาการ: หน้าจอขึ้น "JWT issued at future" แล้วการ์ด/กราฟบางใบว่างไปเฉย ๆ
      // สาเหตุ: ใบผ่านเข้าระบบมีเวลา "ออกเมื่อ" (iat) ที่ออกโดยเซิร์ฟเวอร์ยืนยันตัวตน
      //   ถ้าฐานข้อมูลเห็นว่าเวลานั้นล้ำอนาคตของนาฬิกาตัวเอง (เครื่องผู้ใช้/เซิร์ฟเวอร์เดินไม่ตรงกัน
      //   แค่ไม่กี่วินาทีก็พอ) มันจะปฏิเสธคำขอนั้นทันที
      // ธรรมชาติของปัญหา: หายเองเมื่อเวลาเดินไปถึงจุดนั้น (ไม่กี่วินาที) — จึงควร "รอแล้วลองใหม่"
      //   ไม่ใช่โยน error ให้ผู้ใช้เห็นเป็นหน้าจอพัง ทั้งที่ข้อมูลไม่ได้มีอะไรผิด
      // ⚠️ ลองใหม่ครั้งเดียวเท่านั้น — ถ้านาฬิกาเพี้ยนเป็นนาที ต้องปล่อยให้ล้มและฟ้อง
      //    ไม่งั้นจะกลายเป็นวนลูปยิงซ้ำไม่รู้จบโดยไม่มีใครรู้ว่าต้นเหตุคือนาฬิกา
      global: {
        ...(กุญแจฐานทดสอบ ? { headers: { "x-pms-lock": กุญแจฐานทดสอบ } } : {}),
        fetch: async (input, init) => {
          // ── ต่อฐานข้อมูลไม่ติดเลย ต้องบอกว่า "ต่อไม่ติด" ไม่ใช่ "Failed to fetch" ────────
          //    เจอจริง 2 ก.ย. 69: ฐานข้อมูลในเครื่องดับ (Docker ปิด) แล้วหน้าจอขึ้นกล่องแดง
          //    "Failed to fetch" พร้อมโค้ดของไลบรารี — อ่านแล้วไม่มีใครรู้ว่าต้องไปเปิดอะไร
          //    ที่นี่จึงแปลงเป็นข้อความที่บอกที่อยู่ที่ต่อไม่ติด แล้วโยนต่อให้ friendlyError จัดการ
          let res: Response;
          try {
            res = await fetch(input, init);
          } catch (e) {
            // ⚠️ คำขอที่ "ถูกยกเลิกเอง" ไม่ใช่การต่อไม่ติด — ต้องโยนของเดิมกลับไปตามเดิม
            //    (หน้าเปลี่ยน/คอมโพเนนต์ถูกถอด ระบบจะยกเลิกคำขอที่ค้างอยู่เป็นเรื่องปกติ)
            //    เจอจริง 3 ก.ย. 69: แปลงทุก error เป็น "เชื่อมต่อฐานข้อมูลไม่ได้" แล้วหน้าจอ
            //    ขึ้น error เต็มไปหมดทั้งที่ฐานข้อมูลปกติดี — เทสต์ 3 ข้อตกเพราะเรื่องนี้
            const ยกเลิกเอง = (e as { name?: string })?.name === "AbortError"
              || (init as { signal?: { aborted?: boolean } })?.signal?.aborted === true;
            if (ยกเลิกเอง) throw e;
            // ⚠️ ห้ามใช้ new URL() ที่นี่ — ในไฟล์นี้ชื่อ URL ถูกใช้เป็นค่าตั้งค่าไปแล้ว (ชนกัน)
            //    แกะชื่อโฮสต์ด้วยการตัดสตริงตรง ๆ พอ ไม่ต้องพึ่งตัวแยกที่อยู่
            const ที่อยู่ = String(typeof input === "string" ? input : (input as { url?: string })?.url ?? input);
            const host = (ที่อยู่.split("//")[1] ?? ที่อยู่).split("/")[0];
            const ในเครื่อง = /^(127\.0\.0\.1|localhost)/.test(host);
            // ⚠️ ต้องคงคำว่า "Failed to fetch" ไว้ในข้อความเสมอ
            //    ตัวแยก "คำขอถูกยกเลิกตอนเปลี่ยนหน้า" (repoLog.isAbortedRequest) ดูจากคำนี้
            //    ตัดออกเมื่อไหร่ = คำขอที่ถูกยกเลิกตามปกติจะกลายเป็น error ดังลั่นทั้งจอ
            //    (เจอจริง 3 ก.ย. 69: เทสต์ 3 ข้อตกทันทีหลังเปลี่ยนข้อความ ทั้งที่ฐานข้อมูลปกติ)
            throw new Error(
              ในเครื่อง
                ? `Failed to fetch — เชื่อมต่อฐานข้อมูลในเครื่องไม่ได้ (${host}) เปิดฐานข้อมูลก่อนด้วยคำสั่ง npx supabase start`
                : `Failed to fetch — เชื่อมต่อฐานข้อมูลไม่ได้ (${host}) ตรวจอินเทอร์เน็ตแล้วลองใหม่`,
              { cause: e },
            );
          }
          if (res.status !== 401 && res.status !== 400) return res;
          const สำเนา = res.clone();
          const ข้อความ = await สำเนา.text().catch(() => "");
          if (!/issued at future|JWSInvalidSignature|clock/i.test(ข้อความ)) return res;
          await new Promise(r => setTimeout(r, 1200));
          console.warn("[supabase] เวลาของเครื่องกับเซิร์ฟเวอร์ไม่ตรงกัน — ลองส่งคำขอใหม่อีกครั้ง");
          return fetch(input, init);
        },
      },
    });
  }
  return _client;
}

/** มีเซสชันเก็บอยู่ในแท็บนี้ไหม (ยังไม่ตรวจว่าหมดอายุ — แค่ "เคยล็อกอินและยังไม่ออก")
 *
 *  ใช้กันไม่ให้ยิงคำขอข้อมูลตอนที่ยังไม่ได้ล็อกอิน (7 ส.ค. 69)
 *  คำขอพวกนั้นถูกฐานข้อมูลปฏิเสธทุกครั้งอยู่แล้ว (401) จึงไม่มีประโยชน์ที่จะยิง
 *  มีแต่ทำให้หน้า login มีหน้าจอ error แดงเด้งคาไว้ · อ่านจาก localStorage โดยตรง
 *  (คีย์ของ supabase-js) เพราะต้องตอบได้ทันทีแบบไม่ต้องรอ — getSession() เป็น async
 */
export function hasStoredSession(): boolean {
  if (typeof window === "undefined") return false;
  // ⚠️ ต้องอ่านที่เดียวกับที่ createClient เก็บ (localStorage) — อ่านคนละที่แล้วจะตอบว่า
  //    "ยังไม่ได้ล็อกอิน" ทั้งที่ล็อกอินอยู่ ทุกคำขอข้อมูลจะถูกปฏิเสธก่อนออกจากเครื่องด้วยซ้ำ
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith("sb-") && k.endsWith("-auth-token")) return true;
    }
  } catch { /* เบราว์เซอร์ปิด storage — ถือว่าไม่มี */ }
  return false;
}

/** ตรวจว่าเชื่อมต่อ DB ได้จริงไหม (ping ตาราง dealers) — ใช้ตอน health-check */
export async function checkConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await getSupabase().from("dealers").select("code").limit(1);
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** ใบผ่านของผู้ใช้ที่ล็อกอินอยู่ — ใช้แนบไปกับคำขอข้ามแอป (เช่น ดีลเลอร์ยิงไป API ของสำนักงานใหญ่)
 *  ไม่มี session = คืน null ให้ผู้เรียกตัดสินใจเอง (ห้ามส่งคำขอแบบไม่มีใบผ่านแล้วหวังให้ผ่าน) */
export async function getAccessToken(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data } = await getSupabase().auth.getSession();
    return data.session?.access_token ?? null;
  } catch { return null; }
}
