// ── ฐานทดสอบเขียนได้เฉพาะผู้ถือล็อก (บอสสั่ง 26 ต.ค. 69) ────────────────────────────────────────────────────────────
//
// เหตุ: ล็อกฐานทดสอบ (testDbLock.mjs) เดิมเป็นแค่ข้อตกลง — สคริปต์ที่ไม่ขอล็อก หรือ docker exec psql ตรง ๆ เขียนได้เสมอ
// วิธี: ขอล็อก = สุ่ม "กุญแจเขียน" ใหม่ · ปล่อยล็อก = สุ่มทิ้ง (ไม่มีใครรู้) · ทุกทางเขียนต้องมีกุญแจของรอบนี้
//   ① ต่อฐานตรง (psql ในคอนเทนเนอร์ · พอร์ตฐาน): pg_hba ไม่มี trust/peer แล้ว · บัญชีเขียน pms_writer รหัส = กุญแจของรอบ
//      บัญชีบริการของ supabase (authenticator · supabase_admin · auth · storage · postgres) เข้าได้เฉพาะจากคอนเทนเนอร์ของบริการนั้น
//   ② ทาง API (PostgREST): คำสั่งก่อนทุกคำขอ (pms_lock.pre_request) — ไม่มีหัวคำขอ x-pms-lock = กุญแจของรอบ
//      = ธุรกรรมอ่านอย่างเดียว ทุกบทบาท (anon · service · ผู้ใช้ที่ล็อกอิน)
//      ใครแนบให้: โปรแกรม Node ของผู้ถือล็อก (สคริปต์ · ข้อทดสอบ · เซิร์ฟเวอร์แอป) = testDbFetchKey.mjs ทาง NODE_OPTIONS
//                 เบราว์เซอร์ = เว็บที่เปิดขณะถือล็อกได้ NEXT_PUBLIC_PMS_TESTDB_LOCK (packages/shared/lib/data/supabase/client.ts)
//   ③ ตัวเครื่องมือเอง: บัญชี pms_lockadmin รหัสอยู่นอก repo (~/.pms-testdb-admin.json) ใช้เปลี่ยนกุญแจเท่านั้น
//   อ่านอย่างเดียวไม่ต้องถือล็อก: บัญชี pms_reader (รหัสเปิดเผย · ไม่มีสิทธิ์เขียน) → อาร์กิวเมนต์psql(c, { เขียน: false })
//   งานตามเวลา (pg_cron) ในฐานทดสอบไม่ทำงาน — ต่อฐานทาง localhost แบบไม่ใส่รหัส ซึ่งถูกปิดแล้ว (ข้อทดสอบเรียกคำสั่งตรงอยู่แล้ว)
// ที่ยังกันไม่ได้ (บอกบอสแล้ว): สิทธิ์ root ของ docker (แก้ไฟล์ในคอนเทนเนอร์ได้) · อ่านไฟล์รหัสผู้ดูแลโดยตั้งใจ
//   · อัปโหลดไฟล์ (storage) และสร้างบัญชีผ่านระบบเข้าสู่ระบบ (ไม่ผ่าน PostgREST) · งานตามเวลา (pg_cron) ไม่ทำงาน
//   (ข้อจำกัดที่รู้อยู่ · บอสรับแล้ว 26 ต.ค. 69 · docs/ทำงานหลายเซสชัน.md)
// ไม่อยู่ในใบปรับฐาน (ของฐานทดสอบเท่านั้น · ฐานจริง/ฐาน dev ไม่มี) · ติดตั้ง/ซ่อมเองทุกครั้งที่ขอล็อก
// ข้อทดสอบ: tests/tools/testdb-guard.test.mjs
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// ⚠️ ห้าม import testDbPsql.mjs — ไฟล์นั้นถูกตัวรัน playwright โหลดแบบ CommonJS แล้วตัวนี้ (ESM แท้) ดึงชื่อส่งออกไม่ได้ · ตรรกะเดียวกัน ข้อทดสอบหน่วยเทียบให้ (tests/unit/testDbPsql.test.ts)
export const คอนเทนเนอร์ = process.env.PMS_TESTDB_CONTAINER || "supabase_db_pms-dbcheck";
const โปรเจกต์ = คอนเทนเนอร์.replace(/^supabase_db_/, "");
export const ไฟล์รหัสผู้ดูแล = () => process.env.PMS_TESTDB_ADMIN_FILE || path.join(os.homedir(), ".pms-testdb-admin.json");
export const ป้ายhba = "# PMS: ฐานทดสอบเขียนได้เฉพาะผู้ถือล็อก (scripts/lib/testDbGuard.mjs) — ห้ามแก้มือ";

const สุ่ม = () => randomBytes(24).toString("base64url");
const docker = (args, input) => spawnSync("docker", args, { input, encoding: "utf8", maxBuffer: 64 << 20 });

export function รหัสผู้ดูแล() {
  const f = ไฟล์รหัสผู้ดูแล();
  if (!existsSync(f)) writeFileSync(f, JSON.stringify({ user: "pms_lockadmin", password: สุ่ม() }), { mode: 0o600 });
  return JSON.parse(readFileSync(f, "utf8")).password;
}

/** psql ด้วยบัญชีผู้ดูแลกุญแจ · คืน { ok, out, err } */
export function sqlผู้ดูแล(sql) {
  const r = docker(["exec", "-i", "-e", `PGPASSWORD=${รหัสผู้ดูแล()}`, คอนเทนเนอร์, "psql", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1",
    "-h", "127.0.0.1", "-U", "pms_lockadmin", "-d", "postgres"], sql);
  return { ok: r.status === 0, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim() };
}

/** วงเครือข่าย docker ของชุดฐานทดสอบ + ประตูออกสู่เครื่อง (สำหรับ pg_hba)
 *  ⚠️ เดิมอนุญาตบริการทีละเลขที่อยู่ (/32) — เปิดเครื่องใหม่ docker แจกเลขใหม่ บริการ (auth/storage) ถูกปฏิเสธจนรีสตาร์ตวน (27 ต.ค. 69)
 *     จึงอนุญาตทั้งวงของเครือข่ายนี้ (มีแต่คอนเทนเนอร์ของชุดฐานทดสอบ) และปฏิเสธประตูออก (= การต่อจากเครื่องผ่านพอร์ตฐาน) ก่อนเสมอ */
function เครือข่ายบริการ() {
  const r = docker(["network", "inspect", `supabase_network_${โปรเจกต์}`, "--format", "{{range .IPAM.Config}}{{.Subnet}} {{.Gateway}} {{end}}"]);
  const [วง, ประตู] = (r.stdout ?? "").trim().split(/\s+/);
  if (!วง || !ประตู) throw new Error(`อ่านวงเครือข่ายของฐานทดสอบไม่ได้ (supabase_network_${โปรเจกต์}): ${r.stderr ?? ""}`);
  return { วง, ประตู };
}

export function เนื้อhba() {
  const { วง, ประตู } = เครือข่ายบริการ();
  const บรรทัด = (ผู้ใช้) => `host  all  ${ผู้ใช้}  ${วง}  scram-sha-256`;
  return [
    ป้ายhba,
    "local all  pms_lockadmin  scram-sha-256",
    "host  all  pms_lockadmin  127.0.0.1/32  scram-sha-256",
    "local all  pms_writer  scram-sha-256",
    "host  all  pms_writer  all  scram-sha-256",
    "local all  pms_reader  scram-sha-256",
    "host  all  pms_reader  all  scram-sha-256",
    // ต่อจากเครื่อง (พอร์ตฐาน) มาทางประตูออกของวง — บัญชีบริการห้ามเข้าทางนี้ (ปฏิเสธก่อนบรรทัดอนุญาตทั้งวง)
    `host  all  all  ${ประตู}/32  reject`,
    บรรทัด("authenticator"), บรรทัด("supabase_auth_admin"), บรรทัด("supabase_storage_admin"),
    บรรทัด("supabase_admin"), บรรทัด("postgres"),
    "local all  all  reject",
    "host  all  all  all  reject",
    "",
  ].join("\n");
}

const เขียนhba = (เนื้อ) => {
  const r = docker(["exec", "-i", "-u", "postgres", คอนเทนเนอร์, "sh", "-c", "cat > /etc/postgresql/pg_hba.conf && psql_reload() { pg_ctl reload -D /var/lib/postgresql/data >/dev/null 2>&1 || kill -HUP 1; }; psql_reload"], เนื้อ);
  if (r.status !== 0) throw new Error(`เขียน pg_hba ไม่ได้: ${r.stderr}`);
};

// คำสั่งก่อนทุกคำขอของ PostgREST — ไม่มีกุญแจของรอบ = ธุรกรรมอ่านอย่างเดียว · ตรวจลาย md5 ทุกครั้งที่ขอล็อก (ถูกแก้ = ลงใหม่)
const เนื้อคำสั่งก่อนคำขอ = `
declare k text; h boolean; ส่งมา text;
begin
  select key, held into k, h from pms_lock.current where id = 1;
  -- กุญแจของรอบต้องมากับทุกคำขอ (หัวคำขอ x-pms-lock) ไม่ว่าจะล็อกอินเป็นใคร — บอสสั่ง 26 ต.ค. 69 (ปิดช่องผู้ใช้ล็อกอินระหว่างคนอื่นถือล็อก)
  ส่งมา := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb ->> 'x-pms-lock';
  if h and ส่งมา is not null and ส่งมา = k then return; end if;
  perform set_config('transaction_read_only', 'on', true);
end
`;
const ลายคำสั่งก่อนคำขอ = createHash("md5").update(เนื้อคำสั่งก่อนคำขอ).digest("hex");

const sqlติดตั้ง = (รหัสแอดมิน) => `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'pms_lockadmin') then create role pms_lockadmin login superuser; end if;
  if not exists (select 1 from pg_roles where rolname = 'pms_writer') then create role pms_writer login superuser; end if;
  if not exists (select 1 from pg_roles where rolname = 'pms_reader') then create role pms_reader login; end if;
end $$;
-- อ่านอย่างเดียว (ตัวตรวจ/สคริปต์ดูข้อมูล ไม่ต้องถือล็อก) · ไม่มีสิทธิ์เขียนตารางใดเลย ปิดโหมดอ่านอย่างเดียวเองก็เขียนไม่ได้
alter role pms_reader password 'pms_reader' nosuperuser nocreatedb nocreaterole;
alter role pms_reader set default_transaction_read_only = on;
alter role pms_reader bypassrls;
grant pg_read_all_data to pms_reader;
alter role pms_lockadmin password '${รหัสแอดมิน}';
-- บัญชีเขียนทำงานในฐานะ postgres ตั้งแต่ต่อเข้า (เหมือน docker exec psql -U postgres เดิม) — ของที่สร้างเป็นของ postgres · ข้อทดสอบฐานที่สลับบทบาทกลับ postgres ใช้ต่อได้
alter role pms_writer set role = 'postgres';
create schema if not exists pms_lock;
revoke all on schema pms_lock from public;
create table if not exists pms_lock.current (id int primary key default 1 check (id = 1), key text not null, held boolean not null default false);
revoke all on pms_lock.current from public;
insert into pms_lock.current (key) values ('${สุ่ม()}') on conflict (id) do nothing;
create or replace function pms_lock.pre_request() returns void language plpgsql security definer set search_path = '' as $f$${เนื้อคำสั่งก่อนคำขอ}$f$;
revoke all on function pms_lock.pre_request() from public;
grant usage on schema pms_lock to anon, authenticated, service_role;
grant execute on function pms_lock.pre_request() to anon, authenticated, service_role;
alter role authenticator set pgrst.db_pre_request = 'pms_lock.pre_request';
notify pgrst, 'reload config';
`;

/** ตอนนี้กันอยู่ครบไหม · คืนรายการที่ขาด ([] = ครบ) — ตรวจทั้งไฟล์ pg_hba (ตรงตัว) · บัญชีผู้ดูแล · เนื้อคำสั่งก่อนทุกคำขอ */
export function สภาพการกัน() {
  const ขาด = [];
  const hba = docker(["exec", คอนเทนเนอร์, "cat", "/etc/postgresql/pg_hba.conf"]).stdout ?? "";
  if (!hba.startsWith(ป้ายhba)) ขาด.push("pg_hba");
  else if (hba !== เนื้อhba()) ขาด.push("pg_hba (ไม่ตรงที่ควรเป็น)");
  const r = sqlผู้ดูแล(`select coalesce((select md5(prosrc) from pg_proc where proname = 'pre_request' and pronamespace = 'pms_lock'::regnamespace), '-')
    || chr(31) || coalesce((select array_to_string(rolconfig, ';') from pg_roles where rolname = 'authenticator'), '')
    || chr(31) || coalesce((select (rolsuper or rolbypassrls is false or not pg_has_role('pms_reader', 'pg_read_all_data', 'member'))::text from pg_roles where rolname = 'pms_reader'), 'x')`);
  if (!r.ok) ขาด.push("บัญชีผู้ดูแลกุญแจ");
  else {
    const [ลาย, cfg, reader] = r.out.split(String.fromCharCode(31));
    if (ลาย !== ลายคำสั่งก่อนคำขอ) ขาด.push("pms_lock.pre_request (ไม่มี/ถูกแก้)");
    if (!cfg.includes("pgrst.db_pre_request=pms_lock.pre_request")) ขาด.push("PostgREST pre-request");
    if (reader !== "false") ขาด.push("บัญชีอ่าน pms_reader");
  }
  return ขาด;
}

/** ติดตั้ง/ซ่อมการกัน (เรียกตอนถือล็อกเท่านั้น) — ทำซ้ำได้ · ลงคำสั่งใหม่ทุกครั้ง (ของที่ถูกแก้กลับเป็นของเดิม) */
export function ติดตั้งการกัน() {
  const ก่อน = สภาพการกัน();
  const แอดมิน = รหัสผู้ดูแล();
  if (ก่อน.some(x => x.startsWith("pg_hba") || x === "บัญชีผู้ดูแลกุญแจ")) {
    // ช่องชั่วคราว: supabase_admin เข้าทาง socket ได้ระหว่างติดตั้ง (คนถือล็อกคนเดียว) แล้วปิดทันที
    เขียนhba(`local all  supabase_admin  trust
${เนื้อhba()}`);
    const r = docker(["exec", "-i", "-u", "postgres", คอนเทนเนอร์, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", "postgres"], sqlติดตั้ง(แอดมิน));
    เขียนhba(เนื้อhba());
    if (r.status !== 0) throw new Error(`ติดตั้งการกันฐานทดสอบไม่สำเร็จ: ${r.stderr}`);
  } else {
    const r = sqlผู้ดูแล(sqlติดตั้ง(แอดมิน));
    if (!r.ok) throw new Error(`ติดตั้งการกันฐานทดสอบไม่สำเร็จ: ${r.err}`);
  }
  const เหลือ = สภาพการกัน();
  if (เหลือ.length) throw new Error(`ติดตั้งการกันแล้วยังขาด: ${เหลือ.join(", ")}`);
  return ก่อน;
}

/** เปิดการเขียนให้ผู้ถือล็อกรอบนี้ → คืนค่า env ที่ส่งให้ตัวลูก */
/** @param {string} [key] @param {{ ตัวแนบ?: string }} [opt] ตัวแนบ = ที่อยู่ไฟล์ testDbFetchKey.mjs (file URL) ให้ตัวลูกโหลดทาง NODE_OPTIONS
 *  (ไฟล์นี้ห้ามใช้ import.meta — ข้อทดสอบ TypeScript ดึงไปใช้ตรง ๆ แล้วตัวรัน playwright โหลดแบบ CommonJS) */
export function เปิดการเขียน(key = สุ่ม(), { ตัวแนบ = "" } = {}) {
  ติดตั้งการกัน();
  const r = sqlผู้ดูแล(`update pms_lock.current set key = '${key}', held = true where id = 1; alter role pms_writer password '${key}';`);
  if (!r.ok) throw new Error(`เปิดการเขียนฐานทดสอบไม่ได้: ${r.err}`);
  // ตัวลูกทุกตัวโหลดตัวสลับกุญแจ API (testDbFetchKey.mjs) ผ่าน NODE_OPTIONS
  const โหลด = ตัวแนบ ? `--import=${ตัวแนบ}` : "";
  const เดิม = process.env.NODE_OPTIONS ?? "";
  return {
    PMS_TESTDB_PG_PASSWORD: key,
    NEXT_PUBLIC_PMS_TESTDB_LOCK: key,   // เว็บที่เปิดขณะถือล็อกแนบกุญแจไปกับคำขอจากเบราว์เซอร์ (packages/shared/lib/data/supabase/client.ts)
    NODE_OPTIONS: !โหลด || เดิม.includes("testDbFetchKey.mjs") ? เดิม : `${เดิม} ${โหลด}`.trim(),
  };
}

/** ปล่อยล็อก: สุ่มกุญแจทิ้ง (ไม่มีใครรู้) · ผู้ใช้ล็อกอินเขียนไม่ได้แล้ว */
export function ปิดการเขียน(ของเรา) {
  // เปลี่ยนเฉพาะถ้ากุญแจยังเป็นของเรา — ผู้ถือคนถัดไปได้กุญแจใหม่ไปแล้ว ต้องไม่โดนทับ
  return sqlผู้ดูแล(`do $$ begin
    update pms_lock.current set key = '${สุ่ม()}', held = false where id = 1 and key = '${ของเรา}';
    if found then execute format('alter role pms_writer password %L', '${สุ่ม()}'); end if;
  end $$;`).ok;
}

/** อาร์กิวเมนต์ของ docker สำหรับ psql — ใช้แทน ["exec", "-i", c, "psql", "-U", "postgres", "-d", "postgres"] ทุกที่ (ข้อทดสอบ TypeScript ใช้ testDbPsql.mjs ตรรกะเดียวกัน) */
export function อาร์กิวเมนต์psql(container, { เขียน = true } = {}) {
  if (container !== คอนเทนเนอร์) return ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres"];
  if (!เขียน) return ["exec", "-i", "-e", "PGPASSWORD=pms_reader", container, "psql", "-h", "127.0.0.1", "-U", "pms_reader", "-d", "postgres"];
  const รหัส = process.env.PMS_TESTDB_PG_PASSWORD;
  if (!รหัส) throw new Error("เขียนฐานทดสอบต้องถือล็อกก่อน (ขอล็อกฐานทดสอบ · scripts/lib/testDbLock.mjs) — ไม่มี PMS_TESTDB_PG_PASSWORD");
  return ["exec", "-i", "-e", `PGPASSWORD=${รหัส}`, container, "psql", "-h", "127.0.0.1", "-U", "pms_writer", "-d", "postgres"];
}

/** ล้างฐานด้วยคำสั่ง supabase (db reset) ซึ่งต่อฐานด้วยบัญชี postgres — เปิดทางให้ชั่วคราวเฉพาะผู้ถือล็อก แล้วติดตั้งการกันกลับ
 *  ล้างแล้วตารางกุญแจหาย (ฐานสร้างใหม่) → ตั้งกุญแจเดิมของรอบนี้กลับ (ตัวลูกที่ได้ env ไปแล้วใช้ต่อได้) */
export function ระหว่างล้างฐาน(งาน) {
  const key = process.env.PMS_TESTDB_PG_PASSWORD;
  if (!key) throw new Error("ล้างฐานทดสอบต้องถือล็อกก่อน");
  เขียนhba(`host  all  postgres  all  scram-sha-256
${เนื้อhba()}`);
  try { return งาน(); }
  finally { เปิดการเขียน(key); }
}
