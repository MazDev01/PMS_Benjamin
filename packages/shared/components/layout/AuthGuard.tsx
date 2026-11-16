"use client";

import { useRole } from "@pms/shared/context/RoleContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { hasStoredSession } from "@pms/shared/lib/data/supabase/client";

// เส้นทางหน้า login ต่อแอป — dealer ใช้ "/login" (ค่าเริ่มต้น) · HQ ตั้ง NEXT_PUBLIC_LOGIN_PATH="/hq/login"
// (แอป HQ ไม่มี route "/login" เปล่า — เดิม hardcode "/login" จึงเด้งไปเจอ 404)
const LOGIN_PATH = process.env.NEXT_PUBLIC_LOGIN_PATH || "/login";

// รอเงียบ ๆ ได้แค่นี้ ถ้ายังไม่ได้คำตอบค่อยบอกผู้ใช้ว่ากำลังเชื่อมต่ออยู่
// (สั้นกว่านี้จะกะพริบทุกครั้งที่เปิดหน้า · ยาวกว่านี้ผู้ใช้จะนึกว่าจอค้าง)
const บอกว่ากำลังเชื่อมต่อหลัง = 2500;

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, hydrated } = useRole();
  const router = useRouter();
  const [รอนาน, setรอนาน] = useState(false);

  useEffect(() => {
    if (hydrated && !isLoggedIn) {
      router.replace(LOGIN_PATH);
    }
  }, [isLoggedIn, hydrated, router]);

  // ── เข้าระบบแล้วต้องอยู่ต่อจนกว่าจะกดออกเอง (บอสสั่ง 20 ส.ค. 69) ──────────────
  // ระหว่างที่ยังตอบไม่ได้ว่า "ยังล็อกอินอยู่ไหม" (เน็ตสะดุด/เซิร์ฟเวอร์ช้า) RoleContext
  // จะลองใหม่เรื่อย ๆ โดยไม่ตั้ง hydrated — ที่นี่จึงต้องบอกผู้ใช้ว่ากำลังเชื่อมต่ออยู่
  // ไม่ใช่ปล่อยจอว่างเปล่าให้เดาเอาเองว่าแอปค้างหรือหลุดออกจากระบบไปแล้ว
  useEffect(() => {
    if (hydrated) { setรอนาน(false); return; }
    const t = setTimeout(() => setรอนาน(true), บอกว่ากำลังเชื่อมต่อหลัง);
    return () => clearTimeout(t);
  }, [hydrated]);

  // ยังกู้ session ไม่เสร็จ — ต้องเรนเดอร์ children ไว้ (แค่ซ่อน) ไม่ใช่ null
  //   ตอน build/prerender ค่านี้เป็น false เสมอ ถ้าคืน null จะไม่มีเนื้อหาให้ Next สร้างหน้า
  if (!hydrated) {
    return (
      <>
        <div style={{ visibility: "hidden" }}>{children}</div>
        {รอนาน && hasStoredSession() && (
          <div role="status" aria-live="polite" style={{
            position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
            flexDirection: "column", gap: 10, background: "#fff", zIndex: 9999,
          }}>
            <div style={{
              width: 26, height: 26, borderRadius: "50%",
              border: "2.5px solid #e6eaf0", borderTopColor: "#003366",
              animation: "spin 0.8s linear infinite",
            }} />
            <div style={{ fontSize: "0.82rem", color: "#6b7280", fontWeight: 600 }}>กำลังเชื่อมต่อ…</div>
            <div style={{ fontSize: "0.72rem", color: "#9ca3af" }}>ยังอยู่ในระบบ ไม่ต้องเข้าระบบใหม่</div>
            <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
          </div>
        )}
      </>
    );
  }

  // รู้แน่แล้วว่าไม่ได้ล็อกอิน → ห้ามเรนเดอร์เนื้อหาข้างในเด็ดขาด (7 ส.ค. 69)
  //   เดิมซ่อนด้วย CSS แต่ยังเรนเดอร์อยู่ → ทุก hook ข้างในทำงานเต็มที่ ยิงขอข้อมูลจริงไปที่ฐานข้อมูล
  //   ทั้งที่ยังไม่มีสิทธิ์อะไรเลย · ยืนยันจากการยิงจริง: เปิด /dashboard โดยไม่ล็อกอิน
  //   แอปยิงขอ 13 อย่าง (ลูกค้าเป้าหมาย ลูกค้า ใบเสนอราคา ทะเบียนสาขา ฯลฯ) และทะเบียนสาขาตอบ 401
  //   "permission denied for view dealers_directory" เด้งเป็นหน้าจอ error แดงคาหน้า login
  //   (สิทธิ์ฝั่งฐานข้อมูลถูกแล้ว — คนไม่ล็อกอินต้องอ่านไม่ได้ · ที่ผิดคือแอปไม่ควรถามตั้งแต่แรก)
  if (!isLoggedIn) return null;

  return <>{children}</>;
}
