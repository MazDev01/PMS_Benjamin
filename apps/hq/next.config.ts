import type { NextConfig } from "next";
import path from "node:path";
// หัวข้อความปลอดภัยชุดเดียวกันทั้งสองแอป — แก้ที่เดียวมีผลทั้งระบบ
import { securityHeaderRules } from "../../packages/shared/lib/securityHeaders.mjs";

// รุ่น build สำหรับเว็บ demo (โหมดข้อมูลตัวอย่าง) — เปลี่ยนทุก build → ตัวล้างข้อมูลเก่าในเบราว์เซอร์ (lib/data/local/demoBuildReset.ts)
//   โหมดที่มีฐาน = ค่าว่างคงที่ ไม่ทำให้แคช build ล้างทุกรอบ
const รุ่นเดโม = () => ["api", "supabase"].includes(process.env.NEXT_PUBLIC_DATA_SOURCE ?? "") ? "" : String(Date.now());

const nextConfig: NextConfig = {
  transpilePackages: ["@pms/shared"],
  // ที่เก็บไฟล์ที่ build แล้ว — ตั้งทับด้วย PMS_DIST_DIR (รอบตรวจ build ลง .next-test แยกจาก .next ของ npm run dev · 28 ต.ค. 69)
  // ⚠️ สองเซิร์ฟเวอร์ที่ใช้โฟลเดอร์เดียวกันจะเขียนทับกันจนหน้าเว็บพัง (เหมือนแอปดีลเลอร์)
  distDir: process.env.PMS_DIST_DIR || ".next",
  // ไม่ประกาศชนิดเซิร์ฟเวอร์ให้คนภายนอกรู้ (ตรวจพบ 27 ส.ค. 69) — ลดข้อมูลตั้งต้นให้คนที่ไล่หาช่องโหว่
  poweredByHeader: false,
  // โฟลเดอร์ .local (โฟลเดอร์เซสชัน · ฐานในเครื่อง · ข้อมูลจริง/กุญแจ · git ไม่เก็บ) ห้ามติดไปกับผล build ของเซิร์ฟเวอร์ (26 พ.ย. 69)
  //   ทางเทียบจากโฟลเดอร์แอป · ข้อทดสอบ tests/tools/local-folder.test.mjs
  outputFileTracingExcludes: { "*": ["../../.local/**", ".local/**"] },
  // รากของ repo = 2 ชั้นเหนือโฟลเดอร์แอป (26 พ.ย. 69) — โฟลเดอร์เซสชันอยู่ใต้ .local/wt ของโฟลเดอร์หลักที่มี pnpm-lock.yaml อีกตัว
  //   ไม่ตั้ง = Next เลือกโฟลเดอร์หลักเป็นราก + เตือน "Detected additional lockfiles" · บน Vercel ได้รากเดิม (ราก repo ที่มี lockfile ตัวเดียว)
  outputFileTracingRoot: path.resolve(__dirname, "../.."),

  eslint: { ignoreDuringBuilds: true },
  // แอป HQ: หน้า login อยู่ที่ /hq/login (ไม่มี /login เปล่า) — ให้ AuthGuard (แชร์) เด้งมาที่นี่แทน /login
  env: { NEXT_PUBLIC_LOGIN_PATH: "/hq/login", PMS_APP: "hq", PMS_BUILD_ID: รุ่นเดโม() },
  // รวมหน้า login เก่า /login/hq (ดีไซน์ dark-stripe) → หน้า HQ ใหม่ /hq/login (split-panel) ให้เหลือดีไซน์เดียว
  async redirects() {
    return [{ source: "/login/hq", destination: "/hq/login", permanent: false }];
  },
  async headers() {
    return securityHeaderRules();
  },
};

export default nextConfig;
