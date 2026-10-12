import type { Metadata } from "next";
import HeroSection from "@pms/shared/components/auth/HeroSection";
import LoginCard from "@pms/shared/components/auth/LoginCard";

export const metadata: Metadata = {
  title: "เข้าสู่ระบบ · Benjamin PMS",
  description: "ระบบบริหารงานขายและดีลเลอร์ สำหรับธุรกิจอาคารเหล็กสำเร็จรูป",
};

// เฟรมการ์ดเดียวกึ่งกลางบนพื้นสีขาว (บอสสั่ง 15 ก.ย. 69 "ทำให้เป็นสีขาว") · 2 คอลัมน์ (ซ้าย ~46% แบรนด์ · ขวา ~54% ฟอร์ม)
// จอเล็ก (<lg) ซ้อนเป็นคอลัมน์เดียว (แบรนด์บน · ฟอร์มล่าง)
export default function LoginPage() {
  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-white p-0 sm:p-6">
      <div className="grid w-full max-w-[1008px] grid-cols-1 overflow-hidden rounded-none bg-white shadow-none ring-0 sm:rounded-[26px] sm:shadow-[0_30px_70px_-25px_rgba(14,42,92,0.35)] sm:ring-1 sm:ring-slate-200 lg:min-h-[600px] lg:grid-cols-[46%_54%]">
        <HeroSection />
        <LoginCard />
      </div>
    </main>
  );
}
