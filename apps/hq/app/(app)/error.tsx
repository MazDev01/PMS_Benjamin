"use client";

// error boundary ระดับ (app) — กัน exception ตอนเรนเดอร์ในหน้าใดหน้าหนึ่งทำทั้งแอปจอขาว
// (พบจากผลตรวจสอบระบบเต็มรูปแบบรอบ 2, 31 ก.ค. 69: ไม่มี error.tsx เลยทั้งสองแอปมาก่อน)
// จงใจไม่พึ่ง context/hook ของแอป (SalesContext ฯลฯ) เพราะตัวที่พังอาจเป็นตัวเดียวกัน
import { useEffect } from "react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[AppError]", error);
  }, [error]);

  return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 8 }}>เกิดข้อผิดพลาดในหน้านี้</div>
        <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 20, lineHeight: 1.6 }}>
          ระบบเจอปัญหาที่ไม่คาดคิดขณะแสดงหน้านี้ ข้อมูลของคุณยังปลอดภัย ลองโหลดหน้านี้ใหม่อีกครั้ง
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button className="btn btn-primary" onClick={() => reset()}>ลองใหม่</button>
          <button className="btn btn-secondary" onClick={() => { window.location.href = "/hq/dashboard"; }}>กลับหน้าหลัก</button>
        </div>
      </div>
    </div>
  );
}
