import type { NextConfig } from "next";
// หัวข้อความปลอดภัยชุดเดียวกันทั้งสองแอป — แก้ที่เดียวมีผลทั้งระบบ
import { securityHeaderRules } from "../../packages/shared/lib/securityHeaders.mjs";

const nextConfig: NextConfig = {
  transpilePackages: ["@pms/shared"],
  // ที่เก็บไฟล์ที่ build แล้ว — ตั้งทับด้วย PMS_DIST_DIR (รอบตรวจ build ลง .next-test แยกจาก .next ของ npm run dev · 28 ต.ค. 69)
  // ⚠️ สองเซิร์ฟเวอร์ที่ใช้โฟลเดอร์เดียวกันจะเขียนทับกันจนหน้าเว็บพัง (เหมือนแอปดีลเลอร์)
  distDir: process.env.PMS_DIST_DIR || ".next",
  // ไม่ประกาศชนิดเซิร์ฟเวอร์ให้คนภายนอกรู้ (ตรวจพบ 27 ส.ค. 69) — ลดข้อมูลตั้งต้นให้คนที่ไล่หาช่องโหว่
  poweredByHeader: false,

  eslint: { ignoreDuringBuilds: true },
  // แอป HQ: หน้า login อยู่ที่ /hq/login (ไม่มี /login เปล่า) — ให้ AuthGuard (แชร์) เด้งมาที่นี่แทน /login
  env: { NEXT_PUBLIC_LOGIN_PATH: "/hq/login", PMS_APP: "hq" },
  // รวมหน้า login เก่า /login/hq (ดีไซน์ dark-stripe) → หน้า HQ ใหม่ /hq/login (split-panel) ให้เหลือดีไซน์เดียว
  async redirects() {
    return [{ source: "/login/hq", destination: "/hq/login", permanent: false }];
  },
  async headers() {
    return securityHeaderRules();
  },
};

export default nextConfig;
