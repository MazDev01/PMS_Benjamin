// ── ตรวจฐานข้อมูล: ทุกตารางที่ผูกกับดีลเลอร์ ต้องถูกจัดการในคำสั่งลบดีลเลอร์และคำสั่งย้ายข้อมูลดีลเลอร์ ──────
//
// ทำไมต้องมี (พบ 13 ต.ค. 69 · ใบ 0189): delete_dealer_atomic / move_dealer_data_atomic เขียนรายชื่อตารางไว้ตายตัว
//   ตั้งแต่ก่อนมีตารางคำขอราคาและใบ HQ ของ Flow ใหม่ (0183) — เพิ่มตารางใหม่ที่ผูกกับสาขาแล้วไม่มีอะไรเตือนให้กลับมาแก้สองคำสั่งนี้
//   รอบนี้ไม่เสียหายเพราะกุญแจนอกของคำขอราคาพาตามลูกค้าเป้าหมายไปเอง แต่เป็นความบังเอิญของโครง ไม่ใช่ความตั้งใจของคำสั่ง
//
// วิธีตรวจ (ไม่เขียนรายชื่อตารางด้วยมือ):
//   1) ไล่โครงกุญแจนอกจริงของฐาน หาทุกตารางที่ต่อถึง dealers ได้ ทั้งทางตรงและผ่านตารางอื่นกี่ทอดก็ตาม
//      (เช่น hq_quotes → quote_requests → dealers) รวมกับตารางที่มีคอลัมน์ dealer_code แต่ไม่ได้ผูกกุญแจนอกไว้
//   2) แต่ละตาราง × แต่ละคำสั่ง ต้องเข้าข้อใดข้อหนึ่ง
//      ก. ชื่อตารางอยู่ในเนื้อคำสั่ง (คำสั่งจัดการเอง)
//      ข. อยู่ในรายการยกเว้นด้านล่าง พร้อมเหตุผล — ถ้าเหตุผลอิงกติกาของกุญแจนอก (ลบตาม / แก้ตาม) ตัวตรวจจะยืนยันกับโครงจริงด้วย
//         กติกาเปลี่ยนเมื่อไหร่ ข้อยกเว้นนั้นตกทันที
//   รายการยกเว้นที่ไม่ตรงกับตารางไหนแล้ว หรือตารางนั้นถูกคำสั่งจัดการเองแล้ว = ตก ต้องเอาออก
//
// ⚠️ อ่านโครงของฐานผ่าน Docker (ฐานทดสอบในเครื่องที่แอปใช้อยู่) · อ่านอย่างเดียว · ไม่มี Docker / ฐานไม่ได้เปิด = ข้าม และบอกว่าข้าม
// รัน: node scripts/db-audit5.mjs
import { execFileSync } from "node:child_process";
import { localDbContainer } from "./lib/localDbContainer.mjs";
import { อาร์กิวเมนต์psql } from "./lib/testDbGuard.mjs";

const คำสั่ง = { ลบ: "delete_dealer_atomic", ย้าย: "move_dealer_data_atomic" };

/** ข้อยกเว้น: { table, fn: "ลบ" | "ย้าย", reason, fk? }
 *  fk = กติกาของกุญแจนอกที่เหตุผลอิงอยู่ ตัวตรวจยืนยันกับโครงจริง: { to: ตารางแม่, del?: "CASCADE"|"SET NULL"|"RESTRICT", upd?: "CASCADE" } */
const ยกเว้น = [
  // ── ลบดีลเลอร์ ──
  { table: "quote_counters", fn: "ลบ", reason: "ตัวนับเลขใบเสนอราคาของสาขา หายตามแถวสาขา", fk: { to: "dealers", del: "CASCADE" } },
  { table: "dealer_territories", fn: "ลบ", reason: "พื้นที่ (จังหวัด) ของสาขา หายตามแถวสาขา — จังหวัดนั้นกลับเป็นจังหวัดว่าง (ใบ 0195)", fk: { to: "dealers", del: "CASCADE" } },
  { table: "entity_counters", fn: "ลบ", reason: "ตัวนับเลขของสาขา หายตามแถวสาขา", fk: { to: "dealers", del: "CASCADE" } },
  { table: "dealer_settings", fn: "ลบ", reason: "ค่าตั้งของสาขา หายตามแถวสาขา", fk: { to: "dealers", del: "CASCADE" } },
  { table: "dealer_login_secrets", fn: "ลบ", reason: "สำเนารหัสผ่านของสาขา หายตามแถวสาขา", fk: { to: "dealers", del: "CASCADE" } },
  { table: "dealer_prospects", fn: "ลบ", reason: "ผู้สนใจเป็นดีลเลอร์ ต้นทางของสาขา: เส้นทางของ HQ ลบให้หลังลบสาขาสำเร็จ (บอสสั่ง 15 ก.ย. 69) · ฐานแค่ล้างรหัสสาขา", fk: { to: "dealers", del: "SET NULL" } },
  { table: "dealer_package_proposals", fn: "ลบ", reason: "ใบค่าแฟรนไชส์ หายตามผู้สนใจเป็นดีลเลอร์ ต้นทาง", fk: { to: "dealer_prospects", del: "CASCADE" } },
  { table: "dealer_prospect_activities", fn: "ลบ", reason: "บันทึกการติดต่อ หายตามผู้สนใจเป็นดีลเลอร์ ต้นทาง", fk: { to: "dealer_prospects", del: "CASCADE" } },
  { table: "quote_request_events", fn: "ลบ", reason: "ประวัติคำขอราคา — เหตุผลเดียวกับใบ HQ: สาขาที่มีคำขอราคาลบไม่ได้", fk: { to: "quote_requests", del: "CASCADE" } },

  // ── ย้ายข้อมูลดีลเลอร์ (ย้ายเฉพาะข้อมูลงานขาย · ตัวตน บัญชี และค่าตั้งของสาขาต้นทางอยู่กับต้นทาง) ──
  { table: "profiles", fn: "ย้าย", reason: "บัญชีผู้ใช้ของสาขาต้นทาง ไม่ใช่ข้อมูลงานขาย — อยู่กับสาขาเดิมจนกว่าจะลบสาขา" },
  { table: "dealer_login_secrets", fn: "ย้าย", reason: "สำเนารหัสผ่านของบัญชีสาขาต้นทาง — อยู่กับบัญชี" },
  { table: "dealer_account_changes", fn: "ย้าย", reason: "ประวัติการแก้บัญชีของสาขาต้นทาง — อยู่กับบัญชี" },
  { table: "dealer_account_requests", fn: "ย้าย", reason: "คำขอเปลี่ยนบัญชีของสาขาต้นทาง — อยู่กับบัญชี" },
  { table: "dealer_settings", fn: "ย้าย", reason: "ค่าตั้งของสาขาต้นทาง — สาขาปลายทางใช้ค่าตั้งของตัวเอง" },
  { table: "dealer_territories", fn: "ย้าย", reason: "พื้นที่ของสาขาต้นทางไม่ย้ายตามข้อมูลงานขาย — HQ กำหนดพื้นที่ของสาขาปลายทางเองตามกฎหนึ่งจังหวัดหนึ่งดีลเลอร์ (ใบ 0195)" },
  { table: "dealer_lead_rules", fn: "ย้าย", reason: "กฎติดตามลูกค้าเป้าหมายของสาขาต้นทาง — สาขาปลายทางใช้กฎของตัวเอง" },
  { table: "quote_counters", fn: "ย้าย", reason: "ตัวนับเลขใบเสนอราคาของสาขาต้นทาง — ใบที่ย้ายถือเลขเดิมซึ่งมีรหัสสาขาต้นทางอยู่ในเลข จึงไม่ชนกับเลขของปลายทาง" },
  { table: "dealer_prospects", fn: "ย้าย", reason: "ผู้สนใจเป็นดีลเลอร์ ที่กลายมาเป็นสาขาต้นทาง — เป็นประวัติของตัวสาขา ไม่ใช่งานขาย" },
  { table: "dealer_package_proposals", fn: "ย้าย", reason: "ใบค่าแฟรนไชส์ของสาขาต้นทาง — ผูกกับผู้สนใจเป็นดีลเลอร์ ต้นทาง", fk: { to: "dealer_prospects" } },
  { table: "dealer_prospect_activities", fn: "ย้าย", reason: "บันทึกการติดต่อของผู้สนใจเป็นดีลเลอร์ ต้นทาง", fk: { to: "dealer_prospects" } },
  { table: "quote_request_events", fn: "ย้าย", reason: "ประวัติคำขอราคา ไม่มีรหัสสาขาของตัวเอง — ผูกกับคำขอราคาด้วยเลขคำขอ ซึ่งไม่เปลี่ยนตอนย้าย", fk: { to: "quote_requests" } },
];

const psql = sql => execFileSync("docker", [...อาร์กิวเมนต์psql(localDbContainer(), { เขียน: false }), "-At", "-F", "\t", "-c", sql.replace(/\s+/g, " ")],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024 });

let ตาราง, กุญแจนอก, เนื้อ;
try {
  // ทุกตารางใน public ที่ต่อถึง dealers ผ่านกุญแจนอกได้ (ไล่ซ้ำจนไม่มีตารางใหม่) + ตารางที่มีคอลัมน์ dealer_code
  ตาราง = psql(`
    with recursive fk as (
      select conrelid as child, confrelid as parent from pg_constraint
       where contype = 'f' and connamespace = 'public'::regnamespace and conrelid <> confrelid),
    reach(t, via) as (
      select 'public.dealers'::regclass::oid, ''::text
      union
      select fk.child, fk.parent::regclass::text from fk join reach on fk.parent = reach.t)
    select c.relname, coalesce(string_agg(distinct nullif(r.via, ''), ',' order by nullif(r.via, '')), ''),
           exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'dealer_code' and not a.attisdropped)
      from pg_class c
      left join reach r on r.t = c.oid
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
       and (r.t is not null or exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'dealer_code' and not a.attisdropped))
     group by c.oid, c.relname order by c.relname`)
    .split(/\r?\n/).filter(Boolean).map(l => { const [name, via, col] = l.split("\t"); return { name, via: via ? via.split(",") : [], มีคอลัมน์: col === "t" }; });
  กุญแจนอก = psql(`
    select conrelid::regclass::text, confrelid::regclass::text,
           case confdeltype when 'c' then 'CASCADE' when 'n' then 'SET NULL' when 'r' then 'RESTRICT' when 'a' then 'NO ACTION' else confdeltype::text end,
           case confupdtype when 'c' then 'CASCADE' when 'n' then 'SET NULL' when 'r' then 'RESTRICT' when 'a' then 'NO ACTION' else confupdtype::text end
      from pg_constraint where contype = 'f' and connamespace = 'public'::regnamespace`)
    .split(/\r?\n/).filter(Boolean).map(l => { const [child, parent, del, upd] = l.split("\t"); return { child, parent, del, upd }; });
  เนื้อ = Object.fromEntries(Object.entries(คำสั่ง).map(([k, fn]) =>
    [k, psql(`select replace(replace(prosrc, E'\\n', ' '), E'\\t', ' ') from pg_proc where pronamespace = 'public'::regnamespace and proname = '${fn}'`)]));
} catch (e) {
  console.log(`ตารางของดีลเลอร์ที่คำสั่งลบ/ย้ายไม่รู้จัก: ข้าม (ต่อฐานทดสอบในเครื่องไม่ได้ — ${String(e?.message ?? e).split("\n")[0].slice(0, 60)})`);
  process.exit(0);
}
for (const [k, fn] of Object.entries(คำสั่ง)) if (!เนื้อ[k].trim()) { console.error(`❌ ไม่พบคำสั่ง ${fn} ในฐาน`); process.exit(1); }

// ตัดหมายเหตุ (-- …) ออกก่อนหาชื่อตาราง — ชื่อที่อยู่ในหมายเหตุไม่นับว่าคำสั่งจัดการ
//   (เนื้อคำสั่งถูกยุบเป็นบรรทัดเดียวไปแล้ว จึงอ่านเนื้อดิบอีกรอบแบบคงบรรทัดไว้)
const เนื้อดิบ = k => execFileSync("docker", [...อาร์กิวเมนต์psql(localDbContainer(), { เขียน: false }), "-At", "-c",
  `select prosrc from pg_proc where pronamespace = 'public'::regnamespace and proname = '${คำสั่ง[k]}'`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
  .split(/\r?\n/).map(l => l.replace(/--.*$/, "")).join("\n");
const จัดการเอง = (k, table) => new RegExp(`(^|[^a-z_0-9])${table}([^a-z_0-9]|$)`).test(เนื้อดิบ(k));

const พบ = [];
const ใช้แล้ว = new Set();
for (const t of ตาราง) {
  for (const k of Object.keys(คำสั่ง)) {
    const เอง = จัดการเอง(k, t.name);
    const ex = ยกเว้น.find(e => e.table === t.name && e.fn === k);
    if (ex) ใช้แล้ว.add(ex);
    if (เอง && ex) { พบ.push(`${t.name} · คำสั่ง${k}: คำสั่งจัดการตารางนี้เองแล้ว — เอาออกจากรายการยกเว้น`); continue; }
    if (เอง) continue;
    if (!ex) {
      const ทาง = t.via.length ? `ต่อถึงดีลเลอร์ผ่าน ${t.via.join(", ")}` : "มีคอลัมน์ dealer_code (ไม่ได้ผูกกุญแจนอก)";
      พบ.push(`${t.name} · คำสั่ง${k} (${คำสั่ง[k]}) ไม่ได้จัดการตารางนี้ และไม่มีในรายการยกเว้น — ${ทาง}`);
      continue;
    }
    if (ex.fk) {
      const f = กุญแจนอก.filter(x => x.child === t.name && x.parent === ex.fk.to);
      if (!f.length) พบ.push(`${t.name} · คำสั่ง${k}: ข้อยกเว้นอ้างกุญแจนอกไปที่ ${ex.fk.to} แต่ไม่มีกุญแจนอกนั้นแล้ว`);
      else if (ex.fk.del && !f.some(x => x.del === ex.fk.del)) พบ.push(`${t.name} · คำสั่ง${k}: ข้อยกเว้นอิงกติกา "ลบแม่ → ${ex.fk.del}" แต่โครงจริงเป็น ${f.map(x => x.del).join("/")}`);
      else if (ex.fk.upd && !f.some(x => x.upd === ex.fk.upd)) พบ.push(`${t.name} · คำสั่ง${k}: ข้อยกเว้นอิงกติกา "แก้แม่ → ${ex.fk.upd}" แต่โครงจริงเป็น ${f.map(x => x.upd).join("/")}`);
    }
  }
}
for (const e of ยกเว้น) if (!ใช้แล้ว.has(e)) พบ.push(`${e.table} · คำสั่ง${e.fn}: รายการยกเว้นไม่ตรงกับตารางที่ผูกกับดีลเลอร์แล้ว — เอาออก`);

for (const p of พบ) console.log(`  ✗ ${p}`);
if (พบ.length) console.log("      แก้: เพิ่มตารางนั้นในคำสั่ง (ใบแก้ฐานข้อมูลใหม่) หรือเพิ่มในรายการยกเว้นของ scripts/db-audit5.mjs พร้อมเหตุผลว่าทำไมไม่ต้องจัดการ");
console.log(`ตารางของดีลเลอร์ที่คำสั่งลบ/ย้ายไม่รู้จัก: ${พบ.length} (ตรวจ ${ตาราง.length} ตารางที่ผูกกับดีลเลอร์ × 2 คำสั่ง · ยกเว้น ${ยกเว้น.length})`);
process.exit(พบ.length ? 1 : 0);
