// เส้นทาง /api/v1/quote-requests — handler จริงอยู่ในแพ็กเกจกลาง (คำขอใบเสนอราคา · ใบ 0183)
export { quoteRequestsGET as GET, quoteRequestsPOST as POST } from "@pms/shared/server/v1/quoteRequests";

// ⚠️ ต้องประกาศตรงนี้เป็นค่าตัวอักษร ห้าม re-export มาจากไฟล์กลาง
export const runtime = "nodejs";
