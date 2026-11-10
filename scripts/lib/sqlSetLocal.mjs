// ── หา SET LOCAL ระดับบนสุดของไฟล์ SQL (นอกตัวฟังก์ชัน/DO $…$ · นอกข้อความ · นอกคอมเมนต์) ─────────────
//   เหตุ (10 พ.ย. 69): supabase db push ไม่ห่อใบปรับฐานด้วย transaction → SET LOCAL ระดับบนสุดไม่มีผล
//     ขึ้น WARNING "SET LOCAL can only be used in transaction blocks" (ใบ 0284 บนฐานจริง) = ปิดตัวดัก (session_replication_role) ไม่ได้
//   ใน $…$ (ฟังก์ชัน/DO) ไม่นับ — ตัวฟังก์ชันรันใน transaction เสมอ · ใช้แทน: DO $$ begin perform set_config('session_replication_role', 'replica', true); … end $$;
//   ใช้โดย scripts/check-migration-set-local.mjs · ข้อทดสอบ tests/unit/sqlSetLocal.test.ts
/** @returns {{ line: number; text: string }[]} */
export function setLocalระดับบน(sql) {
  const s = sql.replace(/\r\n/g, "\n");
  const ผล = [];
  let i = 0, line = 1;
  const นับ = (a, b) => { for (let k = a; k < b; k++) if (s[k] === "\n") line++; };
  while (i < s.length) {
    const c = s[i], n = s[i + 1];
    if (c === "-" && n === "-") { const e = s.indexOf("\n", i); i = e < 0 ? s.length : e; continue; }
    if (c === "/" && n === "*") { const e = s.indexOf("*/", i + 2); const end = e < 0 ? s.length : e + 2; นับ(i, end); i = end; continue; }
    if (c === "$") {
      const m = /^\$([A-Za-z_฀-๿][\w฀-๿]*)?\$/.exec(s.slice(i));
      if (m) { const e = s.indexOf(m[0], i + m[0].length); const end = e < 0 ? s.length : e + m[0].length; นับ(i, end); i = end; continue; }
    }
    if (c === "'" || c === "\"") {
      let k = i + 1;
      const escape = c === "'" && i > 0 && /[eE]/.test(s[i - 1]) && !/[\w฀-๿]/.test(s[i - 2] ?? "");
      for (; k < s.length; k++) { if (escape && s[k] === "\\") { k++; continue; } if (s[k] === c) { if (s[k + 1] === c) { k++; continue; } break; } }
      นับ(i, k + 1); i = k + 1; continue;
    }
    if (/[sS]/.test(c) && !/[\w฀-๿]/.test(s[i - 1] ?? "")) {
      const m = /^set\s+local\b/i.exec(s.slice(i, i + 40));
      if (m) { const e = s.indexOf("\n", i); ผล.push({ line, text: s.slice(i, e < 0 ? s.length : e).trim().slice(0, 80) }); }
    }
    if (c === "\n") line++;
    i++;
  }
  return ผล;
}
