import type { Metadata } from "next";
import HeroSection from "@pms/shared/components/auth/HeroSection";
import LoginCard from "@pms/shared/components/auth/LoginCard";

export const metadata: Metadata = {
  title: "เข้าสู่ระบบสำนักงานใหญ่ · Benjamin PMS",
  description: "ศูนย์บริหารเครือข่ายดีลเลอร์ Benjamin — สำหรับทีมสำนักงานใหญ่",
};

// หน้า login สำนักงานใหญ่ (/hq/login) — ใช้ดีไซน์ split-panel เดียวกับพอร์ทัลดีลเลอร์ แต่เป็นฉบับ HQ
// (variant="hq": แบรนด์/หัวข้อ/ฟีเจอร์เชิงบริหารทั้งเครือ · บัญชีทดลองเฉพาะ HQ)
// พื้นหน้าสีขาว (บอสสั่ง 15 ก.ย. 69 "ทำให้เป็นสีขาว") — การ์ดยังมีเงา+เส้นขอบบางแยกจากพื้น
export default function HQLoginPage() {
  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-white p-0 sm:p-6">
      <div className="grid w-full max-w-[1008px] grid-cols-1 overflow-hidden rounded-none bg-white shadow-none ring-0 sm:rounded-[26px] sm:shadow-[0_30px_70px_-25px_rgba(14,42,92,0.35)] sm:ring-1 sm:ring-slate-200 lg:min-h-[600px] lg:grid-cols-[46%_54%]">
        <HeroSection variant="hq" />
        <LoginCard variant="hq" />
      </div>
    </main>
  );
}
