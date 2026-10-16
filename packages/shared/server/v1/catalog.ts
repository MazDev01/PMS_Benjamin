// ── /api/v1/catalog — แม่แบบเลิกใช้แล้ว (บอสสั่งเอาแม่แบบออกทั้งระบบ 16 ต.ค. 69) ──────────────────────────
//
// ฐานเก็บตาราง/ข้อมูลแม่แบบไว้ (ห้าม drop) แต่ไม่มีโค้ดแอปไหนอ่านหรือเขียนอีก — ทางนี้ตอบ 410 ทุกคำขอ
//   ไม่ต้องเข้าสู่ระบบก็ได้คำตอบเดียวกัน (ไม่มีข้อมูลอะไรให้กันอยู่แล้ว · ไม่แตะฐาน)
//   ตัวตรวจ scripts/check-no-catalog.mjs กันโค้ดแอปกลับไปอ่านตาราง/มุมมองแม่แบบ
import { NextResponse } from "next/server";

export { runtime } from "./_ctx";

const เลิกใช้ = () => NextResponse.json(
  { error: "แม่แบบเลิกใช้แล้ว — สำนักงานใหญ่ทำรายการในใบ HQ เอง (ชื่อ · จำนวน · หน่วย · ต้นทุน)" },
  { status: 410, headers: { "cache-control": "no-store" } },
);

export const GET = async (): Promise<Response> => เลิกใช้();
export const PUT = async (): Promise<Response> => เลิกใช้();
export const DELETE = async (): Promise<Response> => เลิกใช้();
