// เส้นทาง /api/v1/material-templates — handler จริงอยู่ในแพ็กเกจกลาง (แม่แบบวัสดุ · ใบ 0244)
export { materialTemplatesGET as GET, materialTemplatesPOST as POST } from "@pms/shared/server/v1/materialTemplates";

// ⚠️ ต้องประกาศตรงนี้เป็นค่าตัวอักษร ห้าม re-export มาจากไฟล์กลาง —
//    Next.js อ่านค่าพวกนี้จากตัวอักษรในไฟล์ route เท่านั้น re-export มาแล้วมันเตือนแล้วใช้ค่าเริ่มต้นแทน
export const runtime = "nodejs";
