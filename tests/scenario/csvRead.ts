// ── ตัวอ่าน CSV ตามมาตรฐาน RFC 4180 (สำหรับข้อทดสอบ) ─────────────────────────────────────────────
//   เขียนแยกจากตัวเขียน (scripts/lib/dealerLoginExport.mjs) — ตรวจไฟล์ด้วยกติกาของ CSV เอง ไม่ใช่ตรรกะเดียวกับตัวเขียน
//   ช่องในเครื่องหมายคำพูดมีจุลภาค / "" / ขึ้นบรรทัดได้ · แถวคั่นด้วย CRLF หรือ LF นอกเครื่องหมายคำพูด · ตัด BOM หน้าไฟล์
export function อ่านCSV(text: string): string[][] {
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const แถว: string[][] = [];
  let ช่อง = "", แถวนี้: string[] = [], ในคำพูด = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (ในคำพูด) {
      if (c === '"') {
        if (s[i + 1] === '"') { ช่อง += '"'; i++; } else ในคำพูด = false;
      } else ช่อง += c;
      continue;
    }
    if (c === '"' && ช่อง === "") ในคำพูด = true;
    else if (c === ",") { แถวนี้.push(ช่อง); ช่อง = ""; }
    else if (c === "\r" || c === "\n") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      แถวนี้.push(ช่อง); แถว.push(แถวนี้); แถวนี้ = []; ช่อง = "";
    } else ช่อง += c;
  }
  if (ในคำพูด) throw new Error("CSV ไม่สมบูรณ์: เครื่องหมายคำพูดเปิดค้าง");
  if (ช่อง !== "" || แถวนี้.length) { แถวนี้.push(ช่อง); แถว.push(แถวนี้); }
  return แถว;
}
