// ── ปุ่ม "ดึงตอนนี้" ในหน้าต่างนำเข้าจาก Google Sheets (ใบ 0295 · คนรวมงานสั่ง 23 พ.ย. 69) ──────────────────────────────────
//
// POST → ดึงชีตที่ตั้งไว้หนึ่งรอบ ทางเดียวกับตัวตั้งเวลา (server/prospectSheetSync · คำสั่งของระบบ service_role)
//   สิทธิ์: settings:edit (HQ ที่นำเข้าได้ · ตรวจจาก profiles จริง) · ไม่แจ้งกระดิ่งตัวเอง · ชุดลงชื่อผู้กด · บันทึกการใช้งาน
//   ใช้ลองบน localhost ที่ฐาน dev ไม่มีตัวตั้งเวลาได้ · เพดาน 6 ครั้ง/5 นาที/คน
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@pms/shared/lib/rateLimit";
import { bad, authorizeAdmin, auditLog, withErrors } from "@pms/shared/lib/adminRoute";
import { ดึงชีตรอบเดียว } from "@pms/shared/server/prospectSheetSync";

export const runtime = "nodejs";
export const maxDuration = 60;
const DENY = "นำเข้าผู้สนใจได้เฉพาะผู้ดูแลระบบ/ผู้บริหารสำนักงานใหญ่";

export const POST = withErrors("prospect-sheet-run", async (req: NextRequest) => {
  const authz = await authorizeAdmin(req, "settings:edit", DENY);
  if (!authz.ok) return authz.res;
  const { admin, callerId, prof } = authz.auth;
  if (!(await checkRateLimit(admin, `prospect-sheet-run:${callerId}`, 6, 300))) return bad(429, "กดดึงถี่เกินไป — รอสักครู่แล้วลองใหม่");
  const ผล = await ดึงชีตรอบเดียว(admin, { กดเอง: true, ผู้ทำ: prof.name || "สำนักงานใหญ่" });
  if (ผล.สถานะ === "no_url") return bad(400, "ยังไม่ได้ตั้งลิงก์ Google Sheets — วางลิงก์แล้วกดบันทึกก่อน");
  if (ผล.สถานะ === "busy") return bad(409, "กำลังดึงชีตอยู่ — รอสักครู่แล้วดูผลอีกครั้ง");
  await auditLog(admin, prof, "ดึงผู้สนใจจากชีตตอนนี้", ผล.สถานะ === "done" || ผล.สถานะ === "failed" ? ผล.ข้อความ : ผล.สถานะ);
  return NextResponse.json(ผล);
});
