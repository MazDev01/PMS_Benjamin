// ── วางใบเสนอราคาแบบเดิม (ไม่มีใบ HQ) ลงฐานทดสอบในเครื่อง สำหรับตัวตรวจที่วัด "กฎของตาราง" ──────────────────────
//
// ตั้งแต่ด่าน 3 (ใบ 0201) ฐานปฏิเสธใบใหม่ที่ไม่มีใบ HQ ทุกทาง — ตัวตรวจที่ต้องการแถวใบเสนอราคาไว้วัดกฎอื่น
// (ยอดต้องตรงรายการ · FK · สถานะ · ประวัติราคา) จึงวางแถวที่ฐานตรง ๆ โดยปิดตัวดักสร้างใบเฉพาะคำสั่งนี้
// ⚠️ ใช้กับฐานทดสอบในเครื่องเท่านั้น (docker) — ไม่มีทางยิงถึงระบบจริง
import { execFileSync } from "node:child_process";
import { localDbContainer } from "./localDbContainer.mjs";

export function วางใบเดิมที่ฐาน(rows) {
  if (!rows.length) return;
  const json = JSON.stringify(rows).replace(/\$json\$/g, "");
  const cols = [...new Set(rows.flatMap(r => Object.keys(r)))].filter(c => /^[a-z_]+$/.test(c)).join(", ");
  const sql = `begin;
    alter table public.quotations disable trigger quotations_hq_link_guard;
    insert into public.quotations (${cols}) select ${cols} from jsonb_populate_recordset(null::public.quotations, $json$${json}$json$::jsonb);
    alter table public.quotations enable trigger quotations_hq_link_guard;
    commit;`;
  execFileSync("docker", ["exec", "-i", localDbContainer(), "psql", "-U", "postgres", "-d", "postgres", "-q", "-v", "ON_ERROR_STOP=1"],
    { input: sql, stdio: ["pipe", "ignore", "pipe"] });
}
