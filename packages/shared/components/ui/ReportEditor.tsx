"use client";

// ─── ตัวแก้รายงานติดตามของลูกค้าเป้าหมาย — แหล่งเดียวของทั้งแอป ──────────────────
// เดิมเขียนฝังอยู่ในหน้า /leads หน้าเดียว · ย้ายออกมาเพื่อให้แผงงานขายในหน้า /customers ใช้ซ้ำได้
// รายงานเก็บที่ LeadRow.report = ผูกกับ "ดีล" ไม่ใช่ลูกค้า → 1 ลูกค้ามีหลายดีล แต่ละดีลมีรายงานของตัวเอง
import type { LeadIntent } from "@pms/shared/lib/leadIntent";
import { useState, useEffect } from "react";
import { buildLeadReport, type LeadRow } from "@pms/shared/lib/mock";
import { APP_NOW } from "@pms/shared/context/FilterContext";
import { leads as leadsRepo } from "@pms/shared/lib/data";
import { logRepoRead } from "@pms/shared/lib/repoLog";

const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const thaiDateStr = (d: Date) => `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
// วันหัวรายงาน = "วันนี้" ของระบบ (APP_NOW) ไม่ใช่นาฬิกาเครื่อง — เดิม new Date() ได้วันจริงที่ล้ำยุคข้อมูล
const todayStr = () => thaiDateStr(APP_NOW);

export function ReportEditor({ lead, onSave }: { lead: LeadRow; onSave: (intent: LeadIntent) => void }) {
  // ⚠ รายการลูกค้าเป้าหมายไม่ได้ส่ง report มาด้วย (เป็นข้อความยาว กินขนส่งราว 1 ใน 3 ของขนาดแถว)
  //   ตัวนี้จึงโหลดเองตอนเปิด — ทำที่เดียวตรงนี้ ทุกหน้าที่เรียกใช้จึงปลอดภัยเหมือนกัน
  //   ห้ามเดาว่าไม่มีรายงานแล้วเสนอเทมเพลตทันที — ผู้ใช้กดบันทึกครั้งเดียว รายงานจริงหายทันที
  const [text, setText] = useState("");
  const [พร้อม, setพร้อม] = useState(false);   // รู้เนื้อหาจริงของรายนี้แล้วหรือยัง
  const [เดิม, setเดิม] = useState("");             // ข้อความที่บันทึกไว้จริง (ใช้เทียบว่ามีการแก้หรือยัง)

  useEffect(() => {
    let alive = true;
    const ใช้ = (r: string | undefined) => {
      if (!alive) return;
      setเดิม(r ?? "");
      setText(r ?? buildLeadReport(lead, todayStr()));
      setพร้อม(true);
    };
    if (lead.report !== undefined) { ใช้(lead.report); return () => { alive = false; }; }
    setพร้อม(false); setText("");
    leadsRepo.get(lead.id)
      .then(full => ใช้(full?.report ?? ""))
      .catch(e => { logRepoRead("leads.get", e); if (alive) setพร้อม(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id, lead.report]);

  const dirty = พร้อม && text !== เดิม;

  // ป้ายชื่อช่องให้หนาเข้มเท่ากับหัวข้ออื่นในการ์ด (บอสสั่ง 28 ส.ค. 69) — เดิมเป็นสีเทาจาง อ่านแล้วเหมือนคำอธิบาย ไม่ใช่หัวข้อ
  const lbl: React.CSSProperties = { display: "block", fontSize: "0.72rem", fontWeight: 800, color: "#2D2D2D", marginBottom: 8 };

  return (
    <div>
      <label style={lbl}>เนื้อหารายงาน</label>
      <textarea aria-label="เนื้อหารายงาน" value={พร้อม ? text : "กำลังโหลดรายงาน…"} onChange={e => setText(e.target.value)}
        readOnly={!พร้อม} spellCheck={false}
        style={{ width: "100%", minHeight: 320, padding: "12px 14px", borderRadius: 10, border: "1px solid #e5e7eb",
          fontSize: "0.8rem", lineHeight: 1.7, fontFamily: "inherit", color: "#2D2D2D", background: "#fff", resize: "vertical", whiteSpace: "pre-wrap" }} />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
        {dirty && <button onClick={() => setText(เดิม || buildLeadReport(lead, todayStr()))} className="btn btn-secondary btn-sm" style={{ color: "#374151" }}>ยกเลิก</button>}
        <button onClick={() => { onSave({ fields: { report: text } }); setเดิม(text); }} disabled={!dirty}
          className="btn btn-primary btn-sm" style={!dirty ? { opacity: 0.5, cursor: "not-allowed" } : undefined}>
          บันทึกรายงาน
        </button>
      </div>
    </div>
  );
}
