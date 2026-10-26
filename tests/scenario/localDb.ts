import { execFileSync } from "node:child_process";
import { SUPABASE_URL } from "./supabaseEnv";
import { อาร์กิวเมนต์psql } from "../../scripts/lib/testDbGuard.mjs";

/** ชื่อคอนเทนเนอร์ของ "ฐานในเครื่องที่ชุดทดสอบใช้อยู่" — หาจากพอร์ตของ NEXT_PUBLIC_SUPABASE_URL (process.env ก่อนไฟล์)
 *  เดิมแต่ละไฟล์หาคอนเทนเนอร์ชื่อมีคำว่า "dbcheck" → สั่งรันกับฐานอีกตัว แอปไปฐานใหม่ แต่คำสั่งตรงยังยิงฐานเดิม
 *  (พบ 15 ต.ค. 69 ตอนพิสูจน์ว่าฐานทดสอบสร้างซ้ำได้ · ก่อนขึ้นระบบจริง ข้อ 5)
 *  ชนิด: db = Postgres · auth = GoTrue · คืน "" ถ้าไม่ใช่ฐานในเครื่อง/ไม่พบ */
export function คอนเทนเนอร์ฐาน(ชนิด: "db" | "auth" = "db"): string {
  const port = SUPABASE_URL.match(/^http:\/\/(?:127\.0\.0\.1|localhost):(\d+)\/?$/)?.[1];
  if (!port) return "";
  try {
    const kong = execFileSync("docker", ["ps", "--filter", `publish=${port}`, "--format", "{{.Names}}"], { encoding: "utf8" })
      .split(/\r?\n/).map(n => n.trim()).find(n => n.startsWith("supabase_kong_"));
    return kong ? `supabase_${ชนิด}_${kong.slice("supabase_kong_".length)}` : "";
  } catch { return ""; }
}

/** รันคำสั่ง SQL ที่ฐานในเครื่อง (ฐานเดียวกับที่ชุดทดสอบใช้) เป็นธุรกรรมเดียว · deadlock = ลองใหม่ (ไม่ใช่รอนานขึ้น)
 *  ที่มา (15 ต.ค. 69): ตัวเก็บกวาดใช้ ALTER TABLE … disable trigger (ล็อกตารางเต็ม) ขณะ worker อื่นใช้ตารางเดียวกัน
 *    → Postgres ตัด "deadlock detected" → ข้อทดสอบตกที่ขั้นเก็บกวาด และเดิม stdio: "ignore" กลืน error ทิ้ง ไม่รู้สาเหตุ
 *  คืนผลลัพธ์ (psql -At) · ไม่พบฐาน = คืน null · พลาดจริง = โยน error พร้อมข้อความจากฐาน */
export function รันSQLในฐาน(sql: string, opts: { ครั้ง?: number } = {}): string | null {
  const c = คอนเทนเนอร์ฐาน();
  if (!c) return null;
  const ครั้ง = opts.ครั้ง ?? 5;
  let ล่าสุด = "";
  for (let i = 1; i <= ครั้ง; i++) {
    try {
      return execFileSync("docker", [...อาร์กิวเมนต์psql(c), "-q", "-At", "-v", "ON_ERROR_STOP=1"],
        { input: `begin;\n${sql}\ncommit;`, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    } catch (e) {
      ล่าสุด = String((e as { stderr?: string }).stderr ?? (e as Error).message);
      if (!/deadlock detected|could not obtain lock|lock timeout/i.test(ล่าสุด) || i === ครั้ง) break;
      execFileSync(process.execPath, ["-e", `setTimeout(()=>{}, ${150 * i})`]);   // เว้นจังหวะสั้น ๆ ให้ธุรกรรมอีกฝั่งจบก่อน
    }
  }
  throw new Error(`[รันSQLในฐาน] ${ล่าสุด.trim().split(/\r?\n/).slice(0, 3).join(" | ")}`);
}
