// เส้นทาง /api/v1/quote-files — handler จริงอยู่ในแพ็กเกจกลาง (ไฟล์แนบของคำขอราคา · ใบ 0273)
export { quoteFilesGET as GET, quoteFilesPOST as POST, quoteFilesDELETE as DELETE } from "@pms/shared/server/v1/quoteFiles";

// ⚠️ ต้องประกาศตรงนี้เป็นค่าตัวอักษร ห้าม re-export มาจากไฟล์กลาง —
//    Next.js อ่านค่าพวกนี้จากตัวอักษรในไฟล์ route เท่านั้น re-export มาแล้วมันเตือนแล้วใช้ค่าเริ่มต้นแทน
export const runtime = "nodejs";
