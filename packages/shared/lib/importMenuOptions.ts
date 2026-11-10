// ตัวเลือกของเมนูนำเข้า ตัวกลาง (ImportMenu · บอสสั่ง 5 พ.ย. 69) — แยกจากคอมโพเนนต์ให้ข้อทดสอบหน่วยอ่านได้
//   ข้อความสั้น บรรทัดเดียวทุกบรรทัด ยาวใกล้เมนู "ส่งออก" (บอสสั่งย่อ 5 พ.ย. 69)
export type ชนิดไฟล์นำเข้า = "xlsx" | "csv";
export const ตัวเลือกนำเข้า: readonly { key: ชนิดไฟล์นำเข้า | "template"; label: string; desc: string; accept?: string }[] = [
  { key: "xlsx", label: "Excel", desc: "ไฟล์ .xlsx", accept: ".xlsx" },
  { key: "csv", label: "CSV", desc: "ไฟล์ .csv", accept: ".csv" },
  { key: "template", label: "แบบฟอร์มตัวอย่าง", desc: "ไฟล์เปล่าพร้อมหัวตาราง" },
];
