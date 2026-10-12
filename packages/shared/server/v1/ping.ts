// ── backend ของเราเอง · เส้นทาง /api/v1 ─────────────────────────────────────────
//
// เริ่มเป็น "เส้นทางตัวอย่าง" ของระยะ 0 (14 ส.ค. 69) — ตอนนี้ย้ายครบทุกกลุ่มแล้ว (18 ส.ค. 69)
// เก็บไว้เป็นจุดเช็กว่า backend มีชีวิตอยู่ + บอกว่ามีกลุ่มงานอะไรบ้าง (ดู docs/BACKEND-MIGRATION.md)
//
// ทำไม handler อยู่ในแพ็กเกจกลาง ไม่ได้อยู่ในแอป:
//   ระบบมี 2 แอป (สำนักงานใหญ่ :3002 · ดีลเลอร์ :3001) ทั้งคู่ต้องมี backend ของตัวเอง
//   ถ้าเขียนแยกในแต่ละแอป = โค้ดเดียวกันสองชุด แก้ที่เดียวลืมอีกที่ (บทเรียนซ้ำ ๆ ในโปรเจกต์นี้)
//   จึงเขียนที่นี่ที่เดียว แล้วให้ไฟล์ route ของแต่ละแอปเป็นแค่บรรทัด re-export
//
//   apps/<app>/app/api/v1/ping/route.ts  →  export { GET } from "@pms/shared/server/v1/ping";
//
// ทำไมไม่แยกเป็นเซิร์ฟเวอร์ต่างหาก:
//   อยู่ในแอปเดียวกัน = ไม่มีเรื่อง CORS · ใบผ่านเดินทางไปกับคำขอเอง · ใช้ deploy เดิม
//   ไม่ต้องจ่ายเซิร์ฟเวอร์เพิ่ม และย้อนกลับง่ายถ้าแผนนี้ไปต่อไม่ไหว
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** ตอบว่า backend ตัวนี้มีชีวิตอยู่ + มีกลุ่มงานอะไรให้เรียกบ้าง */
export async function GET() {
  const { MIGRATED } = await import("@pms/shared/lib/data/http/HttpAdapter");
  return NextResponse.json({
    ok: true,
    api: "v1",
    ports: MIGRATED,
    note: `พร้อมใช้งาน ${MIGRATED.length} กลุ่ม`,
  }, { headers: { "Cache-Control": "no-store" } });
}
