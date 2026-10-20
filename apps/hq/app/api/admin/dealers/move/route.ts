// ── ย้ายข้อมูลงานขายจากสาขาหนึ่งไปอีกสาขา: ยกเลิกแล้ว (บอสตัดสิน 19 ต.ค. 69 · รอบ 2 ช่วง ข) ──────────────────────────
//   เดิมเป็นทางออกของ "ลบสาขาที่ยังมีข้อมูล" — ลบดีลเลอร์เอาออกทั้งระบบแล้ว (ใช้ปิดใช้งานแทน) ทางนี้จึงปิดตาม
//   ตรวจสิทธิ์ก่อนเหมือนเดิม · คำสั่งของฐาน move_dealer_data_atomic ยังอยู่สำหรับงานดูแลระบบด้วยกุญแจฝั่งเซิร์ฟเวอร์
import { NextResponse, type NextRequest } from "next/server";
import { authorizeAdmin, withErrors } from "@pms/shared/lib/adminRoute";

export const runtime = "nodejs";

const DENY = "ไม่มีสิทธิ์จัดการดีลเลอร์";
const NOT_CONFIGURED = "ระบบยังไม่ได้ตั้งค่าสิทธิ์ผู้ดูแล";

export const POST = withErrors("move-dealer-data", async (req: NextRequest) => {
  const authz = await authorizeAdmin(req, "dealers:manage", DENY, NOT_CONFIGURED);
  if (!authz.ok) return authz.res;
  return NextResponse.json({ error: "ยกเลิกแล้ว — ย้ายข้อมูลระหว่างสาขาไม่ได้" }, { status: 410 });
});
