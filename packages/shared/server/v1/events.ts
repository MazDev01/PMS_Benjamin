// ── /api/v1/events — ส่ง "ข้อมูลเปลี่ยนแล้ว" ต่อให้เบราว์เซอร์ผ่าน SSE ──────────────
//
// ระยะ 3 ของแผนแยก backend · กลุ่มสุดท้ายที่เหลือ (realtime)
//
// โหมด supabase: เบราว์เซอร์เปิด WebSocket ไปหา Supabase เอง 5 ช่อง
// โหมด api    : เบราว์เซอร์ไม่ควรต่อฐานข้อมูลตรงอีกต่อไป → ให้เซิร์ฟเวอร์ของเราเป็นคนต่อแทน
//               แล้วส่งต่อลงมาทางเดียว (Server-Sent Events) — ช่องเดียวพอ ไม่ต้องเขียน WebSocket เอง
//
// ⚠️ ต่อ "ในนามผู้ใช้ที่เรียกมา" เหมือนทุกเส้นทางในระยะ 1 — ต้องเรียก realtime.setAuth(token)
//    ไม่ใช่แค่ใส่ header · ถ้าลืม ช่องจะต่อแบบไม่มีตัวตน แล้ว RLS จะกรองทุก event ทิ้งหมด
//    ผลคือ "เงียบสนิท ไม่มี error" ซึ่งแยกไม่ออกจาก "ไม่มีอะไรเปลี่ยน" (กับดักคลาสเดิมของโปรเจกต์นี้)
//
// ⚠️ อายุของคำขอมีเพดาน — เซิร์ฟเวอร์ไร้เซิร์ฟเวอร์ (Vercel) ตัดคำขอที่ยาวเกินโควตาของแพ็กเกจ
//    (แพ็กเกจ Hobby = 60 วินาที) ถ้าปล่อยให้ถูกตัดเอง เบราว์เซอร์จะเห็นเป็น "สายหลุดผิดปกติ"
//    จึงปิดเองอย่างสุภาพก่อนถึงเพดาน แล้วให้ฝั่งเบราว์เซอร์ต่อใหม่ทันที (มันเตรียมรับไว้แล้ว)
import type { NextRequest } from "next/server";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import { rowToLead, rowToQuote, rowToAppt } from "@pms/shared/lib/data/supabase/rowMappers";
import { toCamel } from "@pms/shared/lib/data/supabase/mappers";
import type { CustomerRow } from "@pms/shared/lib/data/types";
import { callerToken } from "./_cookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";   // ห้ามแคช — เป็นสายที่ไหลตลอด ไม่ใช่หน้าเว็บ

type Row = Record<string, unknown>;
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** ปิดสายเองก่อนถูกตัด — ตั้งได้ด้วย ENV เผื่อย้ายไปแพ็กเกจที่ให้ยาวกว่านี้ */
const MAX_SECONDS = Math.max(10, Number(process.env.REALTIME_SSE_MAX_SECONDS) || 50);
const PING_MS = 20_000;   // กันตัวกลาง (proxy) ปิดสายที่เงียบเกินไป

/** ตารางงานขาย → ตัวแปลงแถวให้เป็นรูปแบบที่หน้าเว็บใช้ (ชุดเดียวกับฝั่ง supabase) */
const SALES_ROW: Record<string, (r: Row) => unknown> = {
  leads: rowToLead,
  quotations: rowToQuote,
  appointments: rowToAppt,
  customers: (r) => toCamel<CustomerRow>(r),
};

/** ตารางที่แค่ต้องรู้ว่า "เปลี่ยนแล้ว" ไม่ต้องรู้ว่าเปลี่ยนอะไร → ช่องไหนของหน้าเว็บ */
const PING_TABLES: { table: string; ch: string }[] = [
  { table: "hq_policy",        ch: "settings" },
  { table: "hq_targets",       ch: "settings" },
  { table: "hq_notif_rules",   ch: "settings" },
  { table: "hq_sales_journey", ch: "settings" },
  { table: "hq_recruit_settings", ch: "settings" },
  { table: "customer_notes",   ch: "notes" },
  { table: "dealer_settings",  ch: "dealerSettings" },
];

export const GET = async (req: NextRequest): Promise<Response> => {
  const token = callerToken(req);   // cookie ก่อน แล้วค่อย header (ระยะ 4)
  if (!token || !URL_ || !ANON) {
    return new Response(JSON.stringify({ error: "ยังไม่ได้เข้าสู่ระบบ" }), {
      status: 401, headers: { "content-type": "application/json" },
    });
  }

  const sb = createClient(URL_, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  // ⚠️ บรรทัดนี้คือหัวใจ — realtime มีชั้นยืนยันตัวตนของตัวเอง ไม่ได้อ่านจาก global headers
  //
  // ⚠️⚠️ setAuth เป็นฟังก์ชัน "รอผล" (คืน Promise) — ต้อง await หรือดักพลาดเสมอ
  //   เคยเขียนลอย ๆ ไม่ await มาก่อน แล้วเจอของจริง: พอใบผ่านหมดอายุ/ถูกยกเลิก มันจะ reject
  //   เป็น unhandled rejection ซึ่ง Node ถือเป็นเหตุให้ "ปิดโปรเซสทั้งตัว"
  //   = เซิร์ฟเวอร์ล่มทั้งเครื่องเพราะสายอัปเดตสดสายเดียว (พบตอนรันชุดเต็ม 18 ส.ค. 69
  //     ทุกหน้าต่อไม่ติด 213 ครั้ง ทั้งที่โหมดปกติผ่านหมด)
  try {
    await sb.realtime.setAuth(token);
  } catch (e) {
    console.error("[api/v1/events] ตั้งใบผ่านให้ realtime ไม่สำเร็จ", e);
    return new Response(JSON.stringify({ error: "เปิดสายอัปเดตสดไม่สำเร็จ — ลองใหม่อีกครั้ง" }), {
      status: 503, headers: { "content-type": "application/json" },
    });
  }

  const enc = new TextEncoder();
  let channels: RealtimeChannel[] = [];
  let ping: ReturnType<typeof setInterval> | null = null;
  let stop: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (obj: unknown) => {
        if (closed) return;
        try { controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`)); }
        catch { /* สายปิดไปแล้ว */ }
      };
      const finish = () => {
        if (closed) return;
        closed = true;
        if (ping) clearInterval(ping);
        if (stop) clearTimeout(stop);
        for (const c of channels) { void sb.removeChannel(c).catch(() => { /* ปิดไปแล้ว */ }); }
        channels = [];
        try { controller.close(); } catch { /* ปิดไปแล้ว */ }
      };

      // ช่องงานขาย — ส่ง "แถวที่เปลี่ยน" ไปด้วย หน้าเว็บจะได้แก้เฉพาะแถวนั้น ไม่ต้องโหลดทั้งตาราง
      // DELETE ได้แถวเดิมมาด้วยเพราะตั้ง replica identity full ไว้ตั้งแต่ 0011
      const sales = sb.channel(`sse-sales-${Date.now()}`);
      for (const table of Object.keys(SALES_ROW)) {
        sales.on("postgres_changes", { event: "*", schema: "public", table }, (p) => {
          if (p.eventType === "DELETE") {
            const id = (p.old as Row | undefined)?.id;
            if (id != null) send({ ch: "sales", change: { table, type: "DELETE", id } });
            return;
          }
          send({ ch: "sales", change: { table, type: p.eventType, row: SALES_ROW[table](p.new as Row) } });
        });
      }
      channels.push(sales);

      // ช่องที่เหลือ — รวมไว้ช่องเดียว แล้วบอกแค่ว่า "ฝั่งไหนเปลี่ยน"
      const meta = sb.channel(`sse-meta-${Date.now()}`);
      for (const { table, ch } of PING_TABLES) {
        meta.on("postgres_changes", { event: "*", schema: "public", table }, () => send({ ch }));
      }
      channels.push(meta);

      for (const c of channels) {
        c.subscribe((status) => {
          // ต่อไม่ติด = บอกเบราว์เซอร์ให้ไปต่อใหม่ ดีกว่าเปิดสายค้างไว้เฉย ๆ แล้วไม่มีอะไรมาเลย
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.error(`[api/v1/events] ช่อง realtime มีปัญหา: ${status}`);
            finish();
          }
        });
      }

      // บอกเบราว์เซอร์ว่าสายพร้อมแล้ว — ใช้แยก "ต่อติดแต่เงียบ" ออกจาก "ต่อไม่ติด"
      send({ ch: "ready" });
      ping = setInterval(() => {
        if (closed) return;
        try { controller.enqueue(enc.encode(": ping\n\n")); } catch { /* สายปิดแล้ว */ }
      }, PING_MS);
      stop = setTimeout(finish, MAX_SECONDS * 1000);
      // เบราว์เซอร์หายไปดื้อ ๆ (ปิดเครื่อง/เน็ตหลุด) บางครั้ง cancel() ไม่ถูกเรียก —
      // ผูกกับสัญญาณยกเลิกของคำขอไว้อีกทาง ไม่งั้นช่อง realtime ค้างกินโควตาฝั่ง Supabase
      req.signal.addEventListener("abort", finish, { once: true });
    },
    cancel() {
      // เบราว์เซอร์ปิดสาย (เปลี่ยนหน้า/ปิดแท็บ) — ต้องเก็บช่องคืน ไม่งั้นค้างกินทรัพยากรฝั่ง Supabase
      closed = true;
      if (ping) clearInterval(ping);
      if (stop) clearTimeout(stop);
      for (const c of channels) { void sb.removeChannel(c).catch(() => { /* ปิดไปแล้ว */ }); }
      channels = [];
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",   // กัน nginx อมข้อมูลไว้จนไม่ไหลจริง
    },
  });
};
