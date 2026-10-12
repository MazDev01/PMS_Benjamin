// รันชุดทดสอบ "ในโหมดเดียวกับเว็บจริง" (NEXT_PUBLIC_DATA_SOURCE=api)
//
// ทำไมต้องมี: เครื่องพัฒนาตั้งเป็นโหมด supabase (เบราว์เซอร์คุยกับฐานข้อมูลตรง ๆ)
// แต่เว็บจริงบน Vercel ตั้งเป็นโหมด api (คุยผ่าน backend ของเราเอง + cookie)
// สองโหมดนี้เดินคนละเส้นทางโค้ด — 26 ส.ค. 69 เจอบั๊กบนเว็บจริง 3 ตัวรวด
// (แดชบอร์ด HQ พังตอนเลือก "วันนี้" · กราฟรายชั่วโมงดีลเลอร์ · เข้าระบบแทนดีลเลอร์ใช้ไม่ได้เลย)
// ทั้งสามตัวชุดทดสอบ 394 ข้อจับไม่ได้ เพราะไม่เคยรันในโหมดที่เว็บจริงใช้
//
// ใช้: npm run test:api            (ทั้งชุด)
//      npm run test:api -- tests/scenario/user.spec.ts
//
// ⚠️ ต้องเป็นสคริปต์ node ไม่ใช่ VAR=x หน้าคำสั่งใน package.json — บน Windows รูปแบบนั้นพัง
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const env = { ...process.env, NEXT_PUBLIC_DATA_SOURCE: "api" };

console.log("▶ รันชุดทดสอบในโหมด api (โหมดเดียวกับเว็บจริง)");
const child = spawn("npx", ["playwright", "test", ...args], {
  env, stdio: "inherit", shell: true,
});
child.on("exit", code => process.exit(code ?? 1));
