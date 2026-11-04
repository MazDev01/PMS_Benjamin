// เส้นทาง /api/v1/prospect-import — handler จริงอยู่ในแพ็กเกจกลาง (นำเข้าผู้สนใจ · ใบ 0275)
export { prospectImportGET as GET, prospectImportPOST as POST } from "@pms/shared/server/v1/prospectImport";

// ⚠️ ต้องประกาศตรงนี้เป็นค่าตัวอักษร ห้าม re-export มาจากไฟล์กลาง
export const runtime = "nodejs";
