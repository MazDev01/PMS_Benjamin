// ── ดึงผู้สนใจจาก Google Sheets หนึ่งรอบ (ใบ 0295 · บอสสั่ง 23 พ.ย. 69 "ดึงลีดจาก Google Sheets อัตโนมัติ") ─────────────────────
//   ผู้เรียก: /api/cron/prospect-sheet (ตัวตั้งเวลาของฐานทุกชั่วโมง) · /api/admin/prospect-sheet (ปุ่ม "ดึงตอนนี้" — ทางเดียวกัน)
//   ทางเดิมทั้งหมด (ไม่มีทางที่สอง): ตารางจากชีต (ตัวดึง/ตัวอ่านของ /api/v1/prospect-sheet) → เตรียมแถวเฟซบุ๊ก → แถวเฟซบุ๊กส่งฐาน
//     → hq_prospects_import (ผ่านตัวห่อ _prospect_sheet_import ของระบบ · service_role เท่านั้น)
//   รับงาน/จบงานที่ฐาน (_prospect_sheet_claim / _finish): ปิดอยู่ = ไม่ทำ · รอบก่อนยังไม่จบ = ไม่ทำ (กันรันซ้อน) · จดผลให้หน้าต่างนำเข้าแสดง
//   ไม่มีแถวใหม่ = ไม่สร้างชุด · ชีตไม่เปิดแชร์/ไม่ใช่หัวตาราง Facebook = ไม่นำเข้า + จดผล (ฐานเตือนกระดิ่งวันละครั้ง เฉพาะอัตโนมัติ)
//   ⚠️ ไม่ลงลิงก์/เนื้อหาชีตใน log (ชื่อ/เบอร์คนจริง)
import type { SupabaseClient } from "@supabase/supabase-js";
import { รหัสชีต, ตารางจากชีต, ดึงชีตไม่ได้ } from "./v1/prospectSheet";
import { เป็นไฟล์เฟซบุ๊ก, เตรียมแถวเฟซบุ๊ก, แถวเฟซบุ๊กส่งฐาน } from "../lib/facebookLeadImport";

/** แถวที่ส่งฐานได้ต่อชุด (เพดานของ hq_prospects_import) — เกิน = นำเข้า 1,000 แถวแรก ที่เหลือรอบถัดไป */
export const แถวต่อรอบ = 1000;

export type ผลดึงชีต =
  | { สถานะ: "off" | "no_url" | "busy" }
  | { สถานะ: "done"; นำเข้า: number; เคยนำเข้า: number; เหลือ: number; ชุด: number | null; ข้อความ: string }
  | { สถานะ: "failed"; ข้อความ: string };

/** วันนี้ตามเวลาไทย (ตัดวันทิ้งเบอร์ที่เกินวันนี้ — ฐานไม่รับ) */
const วันนี้ไทย = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

async function กุญแจที่นำเข้าแล้ว(admin: SupabaseClient): Promise<string[]> {
  const ผล: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from("prospect_import_keys").select("key").order("key").range(from, from + 999);
    if (error) throw new Error(`อ่านแถวที่เคยนำเข้าไม่สำเร็จ (${error.code ?? "db"})`);
    ผล.push(...(data ?? []).map(r => String((r as { key: string }).key)));
    if (!data || data.length < 1000) return ผล;
  }
}

/** ดึงหนึ่งรอบ · admin = client service_role · กดเอง = ไม่แจ้งกระดิ่ง/ไม่เตือน (ผู้กดเห็นผลบนจอ) · ผู้ทำ = ชื่อที่ลงในชุดนำเข้า */
export async function ดึงชีตรอบเดียว(admin: SupabaseClient, opt: { กดเอง: boolean; ผู้ทำ: string; fetcher?: typeof fetch }): Promise<ผลดึงชีต> {
  const { data: งาน, error: รับไม่ได้ } = await admin.rpc("_prospect_sheet_claim", { p_manual: opt.กดเอง });
  if (รับไม่ได้) throw new Error(`รับงานดึงชีตไม่สำเร็จ (${รับไม่ได้.code ?? "db"})`);
  const g = งาน as { status: string; url?: string };
  if (g.status !== "run") return { สถานะ: g.status as "off" | "no_url" | "busy" };

  const จบ = async (ok: boolean, ข้อความ: string, ชุด: number | null) => {
    const { error } = await admin.rpc("_prospect_sheet_finish", { p_ok: ok, p_result: ข้อความ, p_batch: ชุด, p_manual: opt.กดเอง });
    if (error) console.error("[prospectSheetSync] จดผลไม่สำเร็จ", error.code);
  };
  try {
    const รหัส = รหัสชีต(g.url);
    if (!รหัส) { await จบ(false, "ลิงก์ที่ตั้งไว้ไม่ใช่ลิงก์ Google Sheets — ตั้งลิงก์ใหม่", null); return { สถานะ: "failed", ข้อความ: "ลิงก์ที่ตั้งไว้ไม่ใช่ลิงก์ Google Sheets — ตั้งลิงก์ใหม่" }; }
    const เล่ม = new Map(await ตารางจากชีต(รหัส, opt.fetcher));
    if (!เป็นไฟล์เฟซบุ๊ก(เล่ม)) {
      const ข้อความ = "ชีตไม่มีหัวตารางแบบไฟล์ Facebook (full_name · phone_number) — ตรวจชีต";
      await จบ(false, ข้อความ, null);
      return { สถานะ: "failed", ข้อความ };
    }
    const แถว = เตรียมแถวเฟซบุ๊ก(เล่ม, [], วันนี้ไทย(), await กุญแจที่นำเข้าแล้ว(admin));
    const เคยนำเข้า = แถว.filter(r => r.ชนิดข้าม === "เคยนำเข้า").length;
    const พร้อม = แถว.filter(r => !r.ข้าม);
    if (!พร้อม.length) {
      const ข้อความ = `ไม่มีแถวใหม่ (เคยนำเข้าแล้ว ${เคยนำเข้า.toLocaleString()} แถว)`;
      await จบ(true, ข้อความ, null);
      return { สถานะ: "done", นำเข้า: 0, เคยนำเข้า, เหลือ: 0, ชุด: null, ข้อความ };
    }
    const รอบนี้ = พร้อม.slice(0, แถวต่อรอบ), เหลือ = พร้อม.length - รอบนี้.length;
    const { data, error } = await admin.rpc("_prospect_sheet_import", {
      p_file: `Google Sheets ${รหัส.slice(0, 6)}… (${opt.กดเอง ? "ดึงตอนนี้" : "ดึงอัตโนมัติ"})`,
      p_rows: รอบนี้.map(แถวเฟซบุ๊กส่งฐาน), p_actor: opt.ผู้ทำ, p_notify: !opt.กดเอง,
    });
    if (error) {
      const ข้อความ = `นำเข้าไม่สำเร็จ: ${error.message.replace(/^[a-z_]+:\s*/, "")}`;
      await จบ(false, ข้อความ, null);
      return { สถานะ: "failed", ข้อความ };
    }
    const ผล = data as { batch: number; inserted: number; already?: number };
    const รวมเคย = เคยนำเข้า + Number(ผล.already ?? 0);
    const ข้อความ = `นำเข้า ${Number(ผล.inserted).toLocaleString()} ราย · เคยนำเข้าแล้ว ${รวมเคย.toLocaleString()} แถว`
      + (เหลือ ? ` · เหลือ ${เหลือ.toLocaleString()} แถว ดึงรอบถัดไป` : "");
    await จบ(true, ข้อความ, ผล.batch);
    return { สถานะ: "done", นำเข้า: Number(ผล.inserted), เคยนำเข้า: รวมเคย, เหลือ, ชุด: ผล.batch, ข้อความ };
  } catch (e) {
    const ข้อความ = e instanceof ดึงชีตไม่ได้ ? e.message : "ดึงชีตไม่สำเร็จ — ลองใหม่อีกครั้ง";
    if (!(e instanceof ดึงชีตไม่ได้)) console.error("[prospectSheetSync] ดึงชีตไม่สำเร็จ", (e as Error)?.name);
    await จบ(false, ข้อความ, null);
    return { สถานะ: "failed", ข้อความ };
  }
}
