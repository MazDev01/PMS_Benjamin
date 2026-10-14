// แยกจาก hqQuoteFixture.ts — global-setup เรียกได้โดยไม่ต้องโหลดตัวช่วยเข้าระบบ
import { execFileSync } from "node:child_process";

/** วาง "ใบเสนอราคาแบบเดิม" (ไม่มีใบ HQ) ลงฐานทดสอบในเครื่องตรง ๆ — ใช้กับข้อมูลตั้งต้นที่จำลองประวัติก่อนปิดทางเดิมเท่านั้น
 *  (ระบบจริงมีใบแบบนี้อยู่ และหน้าจอยังต้องแสดงได้) · ปิดตัวดัก hq_quote_required เฉพาะคำสั่งนี้แล้วเปิดคืนในทรานแซกชันเดียว
 *  ⚠️ ไม่ใช่ทางสร้างใบของแอป — ข้อทดสอบที่วัด "การสร้างใบ" ต้องใช้ เตรียมใบHQ + ทำใบลูกค้าจากใบHQ */
export function วางใบเดิมที่ฐาน(rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const json = JSON.stringify(rows).replace(/\$json\$/g, "");
  // ระบุเฉพาะคอลัมน์ที่ส่งมา — คอลัมน์อื่นใช้ค่าตั้งต้นของตาราง (populate_recordset ใส่ null ให้ทุกคอลัมน์ที่ไม่มี)
  const cols = [...new Set(rows.flatMap(r => Object.keys(r)))].filter(c => /^[a-z_]+$/.test(c)).join(", ");
  const sql = `begin;
    alter table public.quotations disable trigger quotations_hq_link_guard;
    insert into public.quotations (${cols}) select ${cols} from jsonb_populate_recordset(null::public.quotations, $json$${json}$json$::jsonb);
    alter table public.quotations enable trigger quotations_hq_link_guard;
    commit;`;
  const c = execFileSync("docker", ["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split(/\r?\n/).find(n => n.includes("dbcheck")) ?? "";
  if (!c) throw new Error("[วางใบเดิมที่ฐาน] ไม่พบฐานทดสอบในเครื่อง (docker) — วางใบแบบเดิมไม่ได้ตั้งแต่ปิดทางเดิม (ด่าน 3)");
  execFileSync("docker", ["exec", "-i", c, "psql", "-U", "postgres", "-d", "postgres", "-q", "-v", "ON_ERROR_STOP=1"], { input: sql, stdio: ["pipe", "ignore", "pipe"] });
}
