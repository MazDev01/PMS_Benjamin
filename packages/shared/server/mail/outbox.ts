// ── ตัวส่งอีเมลจากกล่องขาออก (email_outbox · ใบ 0193) ─────────────────────────────────────────
//
// ฐานข้อมูลวางจดหมายลงกล่องขาออกในธุรกรรมเดียวกับเหตุการณ์ (คำขอใหม่ · ยกเลิก · ขอแก้ราคา · เกิน 14 วัน)
// ตัวนี้หยิบจดหมายที่ถึงเวลาไปส่งทาง SMTP แล้วบันทึกผล — รันจากงานตั้งเวลา (/api/cron/send-email)
// และเรียกทันทีได้จากเส้นทางที่ต้องส่งเร็ว (เช่นโค้ดยืนยันอีเมล)
//
// หลัก:
//   - SMTP ล่ม = จดหมายค้างในกล่อง รอรอบถัดไป ไม่โยนข้อผิดพลาดออกไปทำให้งานของผู้ใช้ล้ม
//   - ยังไม่ได้ตั้งค่า SMTP = ไม่แตะจดหมายเลย (ไม่นับเป็นการพยายาม) · preflight ตกเรื่องนี้แยกต่างหาก
//   - "จอง" ก่อนส่ง (เพิ่มครั้งที่พยายาม + เลื่อนเวลาครั้งถัดไป) — สองเครื่องรันพร้อมกันไม่ส่งฉบับเดียวกันซ้ำ
//   - ล้มครบ 5 ครั้ง = เลิก (failed) เหลือร่องรอยข้อผิดพลาดไว้ให้ดู
import type { SupabaseClient } from "@supabase/supabase-js";

export const พยายามสูงสุด = 5;

export type จดหมาย = { id: number; to_email: string; subject: string; body: string; attempts: number };
export type ตัวส่ง = { from: string; ส่ง(m: { to: string; subject: string; text: string }): Promise<void> };
export type ผลการส่ง = { ส่งแล้ว: number; ไม่สำเร็จ: number; ข้าม: string };

/** ที่เก็บกล่องขาออก — แยกออกมาให้ทดสอบได้โดยไม่ต้องมีฐานข้อมูล */
export interface คลังกล่องขาออก {
  สแกนเกินกำหนด(): Promise<number>;
  จองที่ถึงเวลา(จำนวน: number): Promise<จดหมาย[]>;
  บันทึกส่งแล้ว(id: number): Promise<void>;
  บันทึกส่งไม่สำเร็จ(id: number, ข้อผิดพลาด: string, ล้มถาวร: boolean): Promise<void>;
}

export async function ส่งอีเมลค้างส่ง(คลัง: คลังกล่องขาออก, ตัวส่ง: ตัวส่ง | null, จำนวน = 50): Promise<ผลการส่ง> {
  // ตรวจคำขอเกินกำหนดก่อนส่งทุกรอบ — ไม่ต้องรองานตั้งเวลาของฐาน (และยังทำงานถ้าฐานไม่มี pg_cron)
  try { await คลัง.สแกนเกินกำหนด(); } catch (e) { console.error("[email] ตรวจคำขอเกินกำหนดไม่สำเร็จ", e); }
  if (!ตัวส่ง) return { ส่งแล้ว: 0, ไม่สำเร็จ: 0, ข้าม: "ยังไม่ได้ตั้งค่า SMTP — จดหมายรออยู่ในกล่องขาออก" };

  const ผล: ผลการส่ง = { ส่งแล้ว: 0, ไม่สำเร็จ: 0, ข้าม: "" };
  for (const m of await คลัง.จองที่ถึงเวลา(จำนวน)) {
    try {
      await ตัวส่ง.ส่ง({ to: m.to_email, subject: m.subject, text: m.body });
      await คลัง.บันทึกส่งแล้ว(m.id);
      ผล.ส่งแล้ว++;
    } catch (e) {
      const ข้อความ = String((e as Error)?.message ?? e).slice(0, 500);
      await คลัง.บันทึกส่งไม่สำเร็จ(m.id, ข้อความ, m.attempts >= พยายามสูงสุด);
      ผล.ไม่สำเร็จ++;
    }
  }
  return ผล;
}

// ── ค่าตั้ง SMTP จากตัวแปรแวดล้อม ─────────────────────────────────────────────────────
export type ค่าSMTP = { host: string; port: number; secure: boolean; user: string; pass: string; from: string };
export function ค่าSMTPจากตัวแปร(env: Record<string, string | undefined>): ค่าSMTP | null {
  const host = (env.SMTP_HOST ?? "").trim(), from = (env.SMTP_FROM ?? "").trim();
  if (!host || !from) return null;
  const port = Number(env.SMTP_PORT ?? "") || 587;
  return { host, port, secure: env.SMTP_SECURE ? env.SMTP_SECURE === "true" : port === 465, user: env.SMTP_USER ?? "", pass: env.SMTP_PASS ?? "", from };
}

/** ตัวส่งจริงผ่าน nodemailer — คืน null ถ้ายังไม่ได้ตั้งค่า */
export async function ตัวส่งSMTP(env: Record<string, string | undefined> = process.env): Promise<ตัวส่ง | null> {
  const c = ค่าSMTPจากตัวแปร(env);
  if (!c) return null;
  const nodemailer = (await import("nodemailer")).default;
  const t = nodemailer.createTransport({
    host: c.host, port: c.port, secure: c.secure,
    auth: c.user ? { user: c.user, pass: c.pass } : undefined,
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
  });
  return { from: c.from, ส่ง: async m => { await t.sendMail({ from: c.from, to: m.to, subject: m.subject, text: m.text }); } };
}

// ── คลังจริงบนฐานข้อมูล (กุญแจฝั่งเซิร์ฟเวอร์) ──────────────────────────────────────────────
const หน่วงครั้งถัดไป = (ครั้ง: number) => Math.min(60, 2 ** ครั้ง) * 60_000;   // 2 · 4 · 8 · 16 · 32 นาที

/** @param เฉพาะ  ส่งเฉพาะจดหมายเลขนี้ (เส้นทางที่ต้องส่งทันที เช่นโค้ดยืนยันอีเมล) — ไม่หยิบฉบับอื่นไปด้วย */
export function คลังบนฐาน(admin: SupabaseClient, เฉพาะ?: number): คลังกล่องขาออก {
  return {
    async สแกนเกินกำหนด() {
      if (เฉพาะ != null) return 0;
      const { data, error } = await admin.rpc("quote_requests_overdue_scan");
      if (error) throw new Error(error.message);
      return Number(data ?? 0);
    },
    async จองที่ถึงเวลา(จำนวน) {
      const now = new Date().toISOString();
      let q = admin.from("email_outbox").select("id, to_email, subject, body, attempts")
        .eq("status", "pending").lte("next_attempt_at", now).order("id").limit(จำนวน);
      if (เฉพาะ != null) q = q.eq("id", เฉพาะ);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const ได้: จดหมาย[] = [];
      for (const m of (data ?? []) as จดหมาย[]) {
        // จองด้วยเงื่อนไข "ครั้งที่พยายามยังเท่าเดิม" — เครื่องอื่นจองไปก่อนแล้วจะได้ 0 แถว
        const { data: จอง } = await admin.from("email_outbox")
          .update({ attempts: m.attempts + 1, next_attempt_at: new Date(Date.now() + หน่วงครั้งถัดไป(m.attempts + 1)).toISOString() })
          .eq("id", m.id).eq("status", "pending").eq("attempts", m.attempts).select("id");
        if (จอง?.length) ได้.push({ ...m, attempts: m.attempts + 1 });
      }
      return ได้;
    },
    async บันทึกส่งแล้ว(id) {
      const { error } = await admin.from("email_outbox").update({ status: "sent", sent_at: new Date().toISOString(), last_error: "" }).eq("id", id);
      if (error) console.error(`[email] บันทึกว่าส่งแล้วไม่สำเร็จ (#${id}) — อาจถูกส่งซ้ำรอบหน้า`, error);
    },
    async บันทึกส่งไม่สำเร็จ(id, ข้อผิดพลาด, ล้มถาวร) {
      const { error } = await admin.from("email_outbox").update({ last_error: ข้อผิดพลาด, ...(ล้มถาวร ? { status: "failed" } : {}) }).eq("id", id);
      if (error) console.error(`[email] บันทึกผลส่งไม่สำเร็จ (#${id})`, error);
    },
  };
}
