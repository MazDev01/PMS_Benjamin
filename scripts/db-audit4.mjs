// ── ตรวจฐานข้อมูล: คำสั่งสิทธิ์สูง (SECURITY DEFINER) ที่ผู้ใช้เรียกได้ ต้องตรวจสิทธิ์ข้างในเอง ───────
//
// ทำไมต้องมี (พบ 13 ต.ค. 69): restore_sync_sequences() ตั้งตัวนับเลขใหม่ทั้งฐาน ทำงานด้วยสิทธิ์เจ้าของ
//   แต่ใครเข้าระบบได้ก็เรียกได้ และข้างในไม่ตรวจสิทธิ์อะไรเลย — มีไว้ให้สคริปต์กู้ข้อมูลเรียกเท่านั้น
//   คำสั่งแบบนี้ "ข้ามกฎสิทธิ์รายตารางทั้งหมด" ด่านเดียวที่เหลือคือการตรวจในตัวมันเอง — ไม่มี = เปิดโล่ง
//
// กติกา: ฟังก์ชันใน public ที่เป็น SECURITY DEFINER + ผู้ใช้ที่เข้าระบบ (authenticated) หรือคนนอก (anon) เรียกได้
//   ต้องอ้างตัวช่วยตรวจสิทธิ์อย่างน้อยหนึ่งตัวในเนื้อคำสั่ง — ไม่อ้างเลย = ตก
//   (ตัวดักของตาราง — คืนค่า trigger — ไม่นับ: เรียกตรงไม่ได้)
//   ยกเว้นรายตัวได้ใน ยกเว้น ด้านล่าง: ต้องมีเหตุผลว่าทำไมไม่ต้องตรวจสิทธิ์
//
// ⚠️ ต้องอ่านโครงของฐานโดยตรง (รายการสิทธิ์ + เนื้อคำสั่ง) ซึ่งทาง REST มองไม่เห็น
//    จึงตรวจกับฐานทดสอบในเครื่องผ่าน Docker เท่านั้น — ไม่มี Docker / ฐานไม่ได้เปิด = ข้าม และบอกว่าข้าม
//    โครงของฐานจริงมาจากใบแก้ฐานข้อมูลชุดเดียวกัน ผลจึงใช้แทนกันได้ตราบที่ขึ้นใบครบ
// รัน: node scripts/db-audit4.mjs
import { execFileSync } from "node:child_process";
import { localDbContainer } from "./lib/localDbContainer.mjs";

const คอนเทนเนอร์ = localDbContainer();
const ตัวช่วยตรวจสิทธิ์ = "(auth_dealer|auth_role|is_hq|can_write_|can_price_quotes|is_account_active|is_own_identity|auth\\.uid\\(\\)|auth\\.role\\(\\))";

/** ฟังก์ชันที่ไม่ต้องตรวจสิทธิ์ — ระบุชื่อ + เหตุผล (รายการที่ไม่ตรงกับฟังก์ชันไหนแล้ว = ตก ต้องเอาออก) */
const ยกเว้น = [
  { name: "catalog_price_hidden", reason: "คืนค่าเปิด/ปิดตัวเดียวของสวิตช์ซ่อนราคา ไม่มีข้อมูลของสาขา — กฎสิทธิ์ของตารางแม่แบบเรียกใช้ จึงต้องเรียกได้ทุกบัญชี (ข้อตัดสิน 13 ต.ค. 69)" },
  { name: "package_annual_target", reason: "คืนตัวเลขเป้าของแพ็กเกจตามภาค เป็นค่าตั้งของสำนักงานใหญ่ที่หน้าจอต้องใช้คำนวณเป้า ไม่ใช่ข้อมูลของสาขา (ข้อตัดสิน 13 ต.ค. 69)" },
];

let rows;
try {
  const out = execFileSync("docker", ["exec", "-i", คอนเทนเนอร์, "psql", "-U", "postgres", "-d", "postgres", "-At", "-F", "\t", "-c", `
    select p.proname,
           pg_get_function_identity_arguments(p.oid),
           has_function_privilege('anon', p.oid, 'execute'),
           has_function_privilege('authenticated', p.oid, 'execute'),
           p.prosrc ~ '${ตัวช่วยตรวจสิทธิ์}'
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.prosecdef
       and p.prorettype <> 'trigger'::regtype
       and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
     order by 1`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  rows = out.split(/\r?\n/).filter(Boolean).map(l => { const [name, args, anon, auth, checks] = l.split("\t"); return { name, args, anon: anon === "t", auth: auth === "t", checks: checks === "t" }; });
} catch (e) {
  console.log(`คำสั่งสิทธิ์สูงที่ไม่ตรวจสิทธิ์: ข้าม (ต่อฐานทดสอบในเครื่องไม่ได้ — ${String(e?.message ?? e).split("\n")[0].slice(0, 70)})`);
  process.exit(0);
}

const ชื่อยกเว้น = new Map(ยกเว้น.map(x => [x.name, x]));
const พบ = rows.filter(r => !r.checks && !ชื่อยกเว้น.has(r.name));
const ยกเว้นค้าง = ยกเว้น.filter(x => !rows.some(r => r.name === x.name && !r.checks) || String(x.reason ?? "").trim().length < 20);

for (const r of พบ) {
  console.log(`  ✗ ${r.name}(${r.args})  เรียกได้โดย: ${[r.anon && "คนที่ยังไม่เข้าระบบ", r.auth && "ทุกคนที่เข้าระบบ"].filter(Boolean).join(" + ")}`);
}
if (พบ.length) {
  console.log("      คำสั่งพวกนี้ทำงานด้วยสิทธิ์เจ้าของและไม่ตรวจว่าใครเรียก — ถอนสิทธิ์เรียก (revoke execute) ให้เหลือเฉพาะฝั่งเซิร์ฟเวอร์");
  console.log("      หรือเพิ่มการตรวจสิทธิ์ในตัวคำสั่ง · ถ้าตั้งใจให้เปิด ใส่ในรายการยกเว้นพร้อมเหตุผล (scripts/db-audit4.mjs)");
}
for (const x of ยกเว้นค้าง) console.log(`  ✗ รายการยกเว้นที่ใช้ไม่ได้: ${x.name} — ไม่มีฟังก์ชันนี้แล้ว / ตรวจสิทธิ์แล้ว / เหตุผลสั้นเกินไป`);
console.log(`คำสั่งสิทธิ์สูงที่ผู้ใช้เรียกได้แต่ไม่ตรวจสิทธิ์: ${พบ.length} (ตรวจ ${rows.length} ตัว · ยกเว้น ${ยกเว้น.length - ยกเว้นค้าง.length})`);
process.exit(พบ.length || ยกเว้นค้าง.length ? 1 : 0);
