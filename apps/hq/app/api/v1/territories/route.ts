// เส้นทาง /api/v1/territories — handler จริงอยู่ในแพ็กเกจกลาง (พื้นที่ของดีลเลอร์ · ใบ 0195)
export { territoriesGET as GET, territoriesPOST as POST } from "@pms/shared/server/v1/territories";

// ⚠️ ต้องประกาศตรงนี้เป็นค่าตัวอักษร ห้าม re-export มาจากไฟล์กลาง
export const runtime = "nodejs";
