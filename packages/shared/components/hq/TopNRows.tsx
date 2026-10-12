"use client";

// ─── กติกา Top N — การ์ดกราฟแบบ "รายการ" โชว์แค่อันดับต้น ที่เหลือกดดู ────────
// ปัญหาที่แก้: การ์ดที่วาด 1 แถวต่อ 1 ดีลเลอร์/จังหวัด สูงตามจำนวนข้อมูล = ไม่มีเพดาน
// (เคยสูง 479–775px และจะโตอีกถ้าเพิ่มดีลเลอร์) ทำให้หน้า HQ ยาว 5–7 จอ
//
// ทำไมไม่ใช้ "ตรึงความสูงแล้วให้เลื่อนในการ์ด": Chromium ใช้แถบเลื่อนแบบลอย (overlay)
// ที่โผล่ตอน hover เท่านั้น → การ์ดจะซ่อนของ 435px โดยไม่มีอะไรบอก = ตัดเงียบ
// คนอ่านนึกว่าเครือมีแค่ 4 ดีลเลอร์ ทั้งที่มี 10 · ปุ่มบอกจำนวนที่ซ่อนตรง ๆ เชื่อถือได้กว่า
//
// HQ ต้องการรู้ "ใครเด่น ใครมีปัญหา" ไม่ได้ต้องการไล่อ่านทุกแถว — อันดับต้นตอบคำถามได้แล้ว
import { useState, type ReactNode } from "react";

const PRIMARY = "#003366";

export function TopNRows({ children, topN = 5, unit = "ราย", gap = 12 }: {
  /** แถวที่ map มาแล้ว — ตัวนี้แค่ตัดให้สั้นลง ไม่ยุ่งกับหน้าตาของแถว */
  children: ReactNode;
  topN?: number;
  /** หน่วยในข้อความปุ่ม เช่น "ราย" · "ภาค" · "ประเภท" */
  unit?: string;
  gap?: number;
}) {
  const [all, setAll] = useState(false);
  const items = Array.isArray(children) ? children.flat() : [children];
  const shown = all ? items : items.slice(0, topN);
  const hidden = items.length - shown.length;
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap }}>{shown}</div>
      {/* ห้ามตัดเงียบ — ถ้าซ่อนของไว้ ต้องบอกว่าซ่อนไปกี่รายการ */}
      {/* ⚠️ ปุ่ม "ย่อกลับ" ต้องโผล่เฉพาะตอนมีของให้ย่อจริง (แก้ 10 ส.ค. 69)
           เดิมเช็กแค่ all → กรองจนเหลือ 4 แถวแล้วปุ่มยังบอกว่า "ย่อกลับเป็น 5 อันดับแรก"
           ซึ่งมากกว่าจำนวนที่มีอยู่ ผู้ใช้อ่านแล้วสับสนว่าตกลงมีกี่รายการกันแน่ */}
      {(hidden > 0 || (all && items.length > topN)) && (
        <button type="button" onClick={() => setAll(v => !v)}
          style={{
            marginTop: 10, alignSelf: "flex-start", background: "none", border: "none", padding: 0,
            cursor: "pointer", fontFamily: "inherit", fontSize: "0.68rem", fontWeight: 700, color: PRIMARY,
          }}>
          {all ? `ย่อกลับเป็น ${topN} อันดับแรก` : `ดูทั้งหมด (อีก ${hidden} ${unit})`}
        </button>
      )}
    </>
  );
}
