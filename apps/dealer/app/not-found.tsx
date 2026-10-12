// หน้า "ไม่พบหน้าที่ต้องการ" ของแอปดีลเลอร์
//
// ⚠️ ทำไมต้องมี (พบจากผลตรวจรอบสุดท้าย 10 ส.ค. 69):
//   เดิมใช้หน้า 404 มาตรฐานของ Next.js ซึ่งเป็นภาษาอังกฤษล้วน
//   ("404 · This page could not be found.") ในระบบที่เป็นภาษาไทยทั้งระบบ
//   ผู้ใช้ที่พิมพ์ที่อยู่ผิดหรือกดลิงก์เก่าจะเจอหน้าที่อ่านไม่ออกและไม่รู้ว่าต้องทำอะไรต่อ
//   หน้า 404 ที่ดีต้องบอกทางออก ไม่ใช่แค่บอกว่าผิด
import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{
      minHeight: "70vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 14, padding: 24, textAlign: "center",
    }}>
      <div style={{ fontSize: "2.4rem", fontWeight: 900, color: "#003366", lineHeight: 1 }}>404</div>
      <div style={{ fontSize: "1rem", fontWeight: 800, color: "#2D2D2D" }}>ไม่พบหน้าที่ต้องการ</div>
      <div style={{ fontSize: "0.84rem", color: "#6b7280", maxWidth: 420, lineHeight: 1.7 }}>
        หน้านี้อาจถูกย้าย เปลี่ยนชื่อ หรือไม่มีอยู่แล้ว — ลองกลับไปที่แดชบอร์ดแล้วเข้าจากเมนูอีกครั้ง
      </div>
      <Link href="/dashboard" className="btn btn-primary btn-md" style={{ marginTop: 4 }}>
        กลับไปหน้าแดชบอร์ด
      </Link>
    </div>
  );
}
