// ── หาข้อความในเครื่องหมายคำพูดเดี่ยวที่ขึ้นบรรทัดด้วยการกด Enter ในไฟล์ SQL (รวมในตัวฟังก์ชัน $$ … $$) ───────────────────────
//   เหตุ (9 พ.ย. 69): ใบ 0281 เขียนขึ้นบรรทัดในอีเมลด้วย Enter ใน E'…' → เครื่องที่ git แปลงเป็น CRLF ลงฐานได้ \r\n · ต้องใช้ E'\n' / chr(10)
//   อ่านแบบตัวแยกคำง่าย ๆ: คอมเมนต์ -- และ /* */ · ตัวฟังก์ชัน $tag$ … $tag$ (อ่านซ้อนข้างใน) · '…' ('' = ' ) · E'…' (\' และ \\ )
//   ใช้โดย scripts/check-migration-multiline-strings.mjs · ข้อทดสอบ tests/unit/sqlMultilineStrings.test.ts
/** @returns {{ line: number; text: string }[]} บรรทัดเริ่มของข้อความที่มีขึ้นบรรทัดอยู่ข้างใน */
const เป็นJson = (t) => { try { JSON.parse(t); return true; } catch { return false; } };
export function ข้อความหลายบรรทัด(sql, เริ่มบรรทัด = 1) {
  const s = sql.replace(/\r\n/g, "\n");
  const ผล = [];
  let i = 0, line = เริ่มบรรทัด;
  const นับบรรทัด = (a, b) => { for (let k = a; k < b; k++) if (s[k] === "\n") line++; };
  while (i < s.length) {
    const c = s[i], n = s[i + 1];
    if (c === "-" && n === "-") { const e = s.indexOf("\n", i); i = e < 0 ? s.length : e; continue; }
    if (c === "/" && n === "*") { const e = s.indexOf("*/", i + 2); const end = e < 0 ? s.length : e + 2; นับบรรทัด(i, end); i = end; continue; }
    if (c === "$") {
      const m = /^\$([A-Za-z_฀-๿][\w฀-๿]*)?\$/.exec(s.slice(i));
      if (m) {
        const tag = m[0], bodyStart = i + tag.length, e = s.indexOf(tag, bodyStart);
        const bodyEnd = e < 0 ? s.length : e;
        const บรรทัดตัว = line + (s.slice(i, bodyStart).split("\n").length - 1);
        ผล.push(...ข้อความหลายบรรทัด(s.slice(bodyStart, bodyEnd), บรรทัดตัว));
        const end = e < 0 ? s.length : e + tag.length;
        นับบรรทัด(i, end); i = end; continue;
      }
    }
    if (c === "'") {
      const escape = i > 0 && /[eE]/.test(s[i - 1]) && !/[\w฀-๿]/.test(s[i - 2] ?? "");
      let k = i + 1;
      for (; k < s.length; k++) {
        if (escape && s[k] === "\\") { k++; continue; }
        if (s[k] === "'") { if (s[k + 1] === "'") { k++; continue; } break; }
      }
      const เนื้อ = s.slice(i + 1, k);
      // JSON หลายบรรทัด (เช่น รายการงาน/ป้ายขั้น) ไม่นับ — CR/LF ระหว่างค่าเป็นช่องว่างของ JSON ค่าข้างในไม่เปลี่ยน
      if (เนื้อ.includes("\n") && !เป็นJson(เนื้อ)) ผล.push({ line, text: เนื้อ.split("\n")[0].slice(0, 80) });
      นับบรรทัด(i, k + 1); i = k + 1; continue;
    }
    if (c === "\n") line++;
    i++;
  }
  return ผล;
}
