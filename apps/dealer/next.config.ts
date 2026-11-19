import type { NextConfig } from "next";
// หัวข้อความปลอดภัยชุดเดียวกันทั้งสองแอป — แก้ที่เดียวมีผลทั้งระบบ
import { securityHeaderRules } from "../../packages/shared/lib/securityHeaders.mjs";

// รุ่น build สำหรับเว็บ demo (โหมดข้อมูลตัวอย่าง) — เปลี่ยนทุก build → ตัวล้างข้อมูลเก่าในเบราว์เซอร์ (lib/data/local/demoBuildReset.ts)
//   โหมดที่มีฐาน = ค่าว่างคงที่ ไม่ทำให้แคช build ล้างทุกรอบ
const รุ่นเดโม = () => ["api", "supabase"].includes(process.env.NEXT_PUBLIC_DATA_SOURCE ?? "") ? "" : String(Date.now());

const nextConfig: NextConfig = {
  transpilePackages: ["@pms/shared"],
  // ที่เก็บไฟล์ที่ build แล้ว — ตั้งทับด้วย PMS_DIST_DIR ได้
  // ใช้ตอนอยากเปิดเซิร์ฟเวอร์ตัวที่สองพร้อมกัน (เช่น รันโหมดข้อมูลตัวอย่างไว้ทดสอบ)
  // ⚠️ สองเซิร์ฟเวอร์ที่ใช้โฟลเดอร์เดียวกันจะเขียนทับกันจนหน้าเว็บพัง 404 ทั้งเว็บ (เจอจริง 30 ส.ค. 69)
  distDir: process.env.PMS_DIST_DIR || ".next",
  // ชื่อแอป — ใช้ตั้งชื่อ cookie ใบผ่านให้แยกกันคนละแอป (ดู server/v1/_cookie.ts)
  env: { PMS_APP: "dealer", PMS_BUILD_ID: รุ่นเดโม() },
  // ไม่ประกาศชนิดเซิร์ฟเวอร์ให้คนภายนอกรู้ (ตรวจพบ 27 ส.ค. 69) — ลดข้อมูลตั้งต้นให้คนที่ไล่หาช่องโหว่
  poweredByHeader: false,

  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return securityHeaderRules();
  },
};

export default nextConfig;
