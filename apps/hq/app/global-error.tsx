"use client";

// เซฟตี้เน็ตชั้นบนสุด — ดัก exception ที่เกิดใน root layout เอง (เช่นใน provider ก่อนถึง children)
// ซึ่ง (app)/error.tsx ดักไม่ถึง (คนละ segment) ต้องนิยาม <html>/<body> เองเพราะแทนที่ root layout ทั้งชุด
// จงใจไม่ import globals.css/font ของแอป — ถ้า root layout พังเอง ทรัพยากรพวกนั้นอาจเป็นสาเหตุด้วย
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="th">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f9fafb" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ maxWidth: 420, textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 8 }}>ระบบเปิดใช้งานไม่สำเร็จ</div>
            <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 20, lineHeight: 1.6 }}>
              เกิดข้อผิดพลาดร้ายแรงขณะเปิดระบบ กรุณาลองโหลดหน้าใหม่ ถ้ายังไม่หายให้แจ้งผู้ดูแลระบบ
            </p>
            <button
              style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#003366", color: "#fff", fontWeight: 600, cursor: "pointer" }}
              onClick={() => reset()}
            >โหลดใหม่</button>
          </div>
        </div>
      </body>
    </html>
  );
}
