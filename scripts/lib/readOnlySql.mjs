// ── ตัวกันคำสั่งเขียนสำหรับ prod:query (บอสสั่ง 3 พ.ย. 69 · เลือก ก) ─────────────────────────────────────────────────────
//   Supabase CLI 2.109 ถามยืนยันทุกคำสั่ง SQL กับฐานจริงเมื่อถูกเรียกจาก AI → prod:query ใส่ --yes ได้เฉพาะคำสั่งอ่าน
//   คำสั่งที่เขียน/แก้โครง/แก้สิทธิ์/สั่งงานฐาน = ปฏิเสธทั้งชุดก่อนต่อฐาน · ขั้นเขียนฐานจริง (ล้างข้อมูลทดสอบ) บอสรันเอง
//   ตัดหมายเหตุและข้อความในเครื่องหมายคำพูดออกก่อนตรวจ (คำว่า delete ในข้อความค้นหาไม่นับ) แล้วตรวจทุกคำสั่งที่คั่นด้วย ;
//   ข้อทดสอบ: tests/tools/prod-read-only.test.mjs

// คำที่ห้ามปรากฏที่ไหนก็ได้ในคำสั่ง (เป็นคำเดี่ยว) — ครอบ CTE ที่เขียน (with d as (delete …)) · select … into · for update · explain analyze
//   คำสั่งที่ไม่ได้ขึ้นต้นด้วย select/with/explain/show/table/values (do · call · set · begin · grant …) ถูกปฏิเสธที่ด่านคำขึ้นต้นอยู่แล้ว
const คำห้าม = [
  "insert", "update", "delete", "merge", "upsert", "truncate", "alter", "drop", "create", "grant", "revoke",
  "copy", "vacuum", "analyze", "analyse", "reindex", "cluster", "refresh", "into", "lock", "notify", "listen",
];
// ฟังก์ชันที่เขียน/สั่งงานฐานทั้งที่อยู่ใน select
const ฟังก์ชันห้าม = [
  "nextval", "setval", "set_config", "pg_terminate_backend", "pg_cancel_backend", "pg_reload_conf",
  "pg_rotate_logfile", "pg_switch_wal", "pg_create_restore_point", "pg_advisory_lock", "pg_advisory_xact_lock",
  "pg_try_advisory_lock", "lo_import", "lo_export", "lo_unlink", "lo_create", "lo_from_bytea", "lo_put",
  "dblink", "dblink_exec", "pg_read_file", "pg_read_binary_file", "pg_ls_dir", "pg_file_write", "http", "http_post",
  "net", "pg_notify", "pg_sleep", "txid_current", "pg_current_xact_id",
];
const คำขึ้นต้นที่ได้ = ["select", "with", "explain", "show", "table", "values"];

/** ตัดหมายเหตุ ข้อความในเครื่องหมายคำพูด และ $$…$$ ออก (แทนด้วยช่องว่าง) */
export function ตัดข้อความ(sql) {
  let s = String(sql);
  s = s.replace(/\$([A-Za-z_][A-Za-z0-9_]*)?\$[\s\S]*?\$\1\$/g, " '' ");   // $$…$$ / $tag$…$tag$
  s = s.replace(/\/\*[\s\S]*?\*\//g, " ");                                // /* … */
  s = s.replace(/--[^\n]*/g, " ");                                        // -- …
  s = s.replace(/'(?:[^']|'')*'/g, " '' ");                               // 'ข้อความ'
  s = s.replace(/"(?:[^"]|"")*"/g, " x ");                                // "ชื่อ"
  return s;
}

/** คืน { ได้: true } หรือ { ได้: false, เหตุ } */
export function ตรวจอ่านอย่างเดียว(sql) {
  const ล้วน = ตัดข้อความ(sql).toLowerCase();
  if (/\/\*|\*\//.test(ล้วน)) return { ได้: false, เหตุ: "หมายเหตุ /* */ ปิดไม่ครบ" };
  if (/\$/.test(ล้วน)) return { ได้: false, เหตุ: "มีเครื่องหมาย $ ที่ตรวจไม่ได้ (ปิดข้อความไม่ครบ)" };
  if (/['"]/.test(ล้วน.replace(/''/g, ""))) return { ได้: false, เหตุ: "เครื่องหมายคำพูดไม่ครบคู่" };
  const คำสั่งย่อย = ล้วน.split(";").map(x => x.trim()).filter(Boolean);
  if (!คำสั่งย่อย.length) return { ได้: false, เหตุ: "ไม่มีคำสั่ง" };
  for (const c of คำสั่งย่อย) {
    const ต้น = c.match(/^[a-z_]+/)?.[0] ?? "";
    if (!คำขึ้นต้นที่ได้.includes(ต้น)) return { ได้: false, เหตุ: `คำสั่งขึ้นต้นด้วย "${ต้น || c.slice(0, 20)}" — prod:query รับเฉพาะ ${คำขึ้นต้นที่ได้.join("/")}` };
  }
  for (const w of คำห้าม) if (new RegExp(`(^|[^a-z0-9_])${w}([^a-z0-9_]|$)`).test(ล้วน)) return { ได้: false, เหตุ: `มีคำสั่งเขียน/สั่งงานฐาน "${w}"` };
  for (const f of ฟังก์ชันห้าม) if (new RegExp(`(^|[^a-z0-9_])${f}\\s*\\(`).test(ล้วน)) return { ได้: false, เหตุ: `เรียกฟังก์ชันที่เขียน/สั่งงานฐาน "${f}()"` };
  return { ได้: true };
}
