// เส้นทาง /api/v1/brand-logo — handler จริงอยู่ในแพ็กเกจกลาง (โลโก้ของระบบที่ HQ เปลี่ยนได้ · ใบ 0304)
export { brandLogoGET as GET, brandLogoPOST as POST, brandLogoDELETE as DELETE } from "@pms/shared/server/v1/brandLogo";

// ⚠️ ต้องประกาศตรงนี้เป็นค่าตัวอักษร ห้าม re-export มาจากไฟล์กลาง —
//    Next.js อ่านค่าพวกนี้จากตัวอักษรในไฟล์ route เท่านั้น re-export มาแล้วมันเตือนแล้วใช้ค่าเริ่มต้นแทน
export const runtime = "nodejs";
