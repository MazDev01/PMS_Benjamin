// ตัวเลือกของเมนูนำเข้า ตัวกลาง (ImportMenu · บอสสั่ง 5 พ.ย. 69) — แยกจากคอมโพเนนต์ให้ข้อทดสอบหน่วยอ่านได้
export type ชนิดไฟล์นำเข้า = "xlsx" | "csv";
export const ตัวเลือกนำเข้า: readonly { key: ชนิดไฟล์นำเข้า | "template"; label: string; desc: string; accept?: string }[] = [
  { key: "xlsx", label: "Excel", desc: "ไฟล์ .xlsx จาก Excel/Google Sheets", accept: ".xlsx" },
  { key: "csv", label: "CSV", desc: "ไฟล์ .csv จากระบบอื่น", accept: ".csv" },
  { key: "template", label: "ดาวน์โหลดแบบฟอร์มตัวอย่าง", desc: "หัวตารางตรงกับที่ระบบอ่าน กรอกแล้วนำเข้าได้เลย" },
];
