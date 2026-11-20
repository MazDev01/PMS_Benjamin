// เส้นทาง /api/v1/prospect-sheet — ดึง Google Sheets (ลีด Facebook) เข้าหน้าตัวอย่างนำเข้าผู้สนใจ · handler จริงอยู่ในแพ็กเกจกลาง
export { prospectSheetPOST as POST } from "@pms/shared/server/v1/prospectSheet";

// ⚠️ ต้องประกาศตรงนี้เป็นค่าตัวอักษร ห้าม re-export มาจากไฟล์กลาง
export const runtime = "nodejs";
