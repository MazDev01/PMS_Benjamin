// เส้นทาง /api/account ของแอปดีลเลอร์ = ทางผ่านไปยัง API บัญชีของสำนักงานใหญ่
// (โหมด api เก็บใบผ่านใน cookie หน้าเว็บแนบเองไม่ได้ — ดู accountProxy.ts)
export { GET, POST } from "@pms/shared/server/v1/accountProxy";

// ⚠️ ต้องประกาศตรงนี้เป็นค่าตัวอักษร ห้าม re-export มาจากไฟล์กลาง
export const runtime = "nodejs";
