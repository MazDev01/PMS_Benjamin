import type { Metadata } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import { RoleProvider } from "@pms/shared/context/RoleContext";
import { SalesProvider } from "@pms/shared/context/SalesContext";
import { leads as demoLeads } from "@pms/shared/lib/mock";
import { REAL_BACKEND } from "@pms/shared/lib/data/config";
import { ConfirmToaster } from "@pms/shared/components/ui/ConfirmToast";
import "@pms/shared/globals.css";

// ── สร้างหน้าตอนถูกเรียก ไม่ใช่สร้างล่วงหน้าตอน build ─────────────────────────────
// จำเป็นสำหรับ CSP แบบ "รหัสยืนยันต่อคำขอ" (nonce) ที่ middleware ออกให้
//   HTML ที่สร้างล่วงหน้าตอน build ใส่รหัสที่สุ่มรายคำขอไม่ได้ → สคริปต์ทุกตัวไม่มีรหัส แล้วถูกบล็อกหมด
//   ยิงพิสูจน์แล้ว 7 ส.ค. 69: หน้าที่สร้างตอนเรียก (/hq/dealers/[code]) มีรหัสครบ ·
//   หน้าที่สร้างล่วงหน้า (/hq/login) ได้ 0 ตัว และถูกบล็อกทั้ง 29 สคริปต์
// ต้นทุนที่จ่าย: เสียการแคช HTML ตอน build — ซึ่งแทบไม่มีผลกับระบบนี้ เพราะทุกหน้าเป็น
//   client component ที่ดึงข้อมูลตอนใช้งานอยู่แล้ว HTML ที่สร้างล่วงหน้าเป็นแค่โครงเปล่า
export const dynamic = "force-dynamic";


const notoThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-noto-thai",
  display: "swap",
});

// เดิม title เดียวกันเป๊ะกับแอปดีลเลอร์ — เปิดสองแอปพร้อมกันแยกแท็บไม่ออก (พบจากผลตรวจสอบระบบรอบ 2, 31 ก.ค. 69)
export const metadata: Metadata = {
  title: "Benjamin PMS · สำนักงานใหญ่",
  description: "ระบบบริหารจัดการ Benjamin — Pre-Engineered Steel Building (สำนักงานใหญ่)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={notoThai.variable}>
      <body className={notoThai.className}>
        {/* ⚠️ ข้อมูลตัวอย่างส่งได้เฉพาะโหมดเดโม (local) เท่านั้น
            layout นี้เป็น Server Component — prop ที่ส่งให้ client component ถูกฝังลง HTML
            ของ "ทุกหน้า ทุกคำขอ" รวมหน้าที่ยังไม่ล็อกอิน · เจอจริงบนระบบจริง 14 ส.ค. 69:
            ชื่อบริษัท/ผู้ติดต่อ/เบอร์โทรของข้อมูลตัวอย่างติดมากับ HTML หน้าแดชบอร์ด ~15KB ต่อคำขอ
            ทั้งที่โหมด supabase ไม่เคยใช้ค่านี้เลย (SalesContext เริ่มด้วยรายการว่างเสมอ) */}
        <RoleProvider><SalesProvider initialLeads={REAL_BACKEND ? [] : demoLeads}>{children}</SalesProvider></RoleProvider>
        {/* กล่องยืนยันของระบบ — ต้องอยู่ที่ layout ราก จึงใช้ได้ทั้งหน้าที่ล็อกอินแล้วและหน้าเข้าสู่ระบบ */}
        <ConfirmToaster />
      </body>
    </html>
  );
}
