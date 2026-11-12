import Link from "next/link";

// 404 มีแบรนด์ — เดิมใช้หน้าเปล่าของ Next เอง (ไม่มีทางกลับนอกจากปุ่มย้อนกลับเบราว์เซอร์)
// (พบจากผลตรวจสอบระบบรอบ 2, 31 ก.ค. 69) — อยู่ใต้ (app) จึงยังมีแถบเมนู/แถบบนของแอปครอบอยู่
export default function NotFound() {
  return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 380, textAlign: "center" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 8 }}>ไม่พบหน้านี้</div>
        <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 20, lineHeight: 1.6 }}>
          ลิงก์นี้อาจไม่ถูกต้อง หรือหน้าที่ต้องการถูกย้าย/ลบไปแล้ว
        </p>
        <Link href="/dashboard" className="btn btn-primary" style={{ display: "inline-flex", textDecoration: "none" }}>
          กลับหน้าหลัก
        </Link>
      </div>
    </div>
  );
}
