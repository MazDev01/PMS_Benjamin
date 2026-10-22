"use client";

// ── รายการเตือนของลูกค้าเป้าหมาย (รอบ 4 · บอสสั่ง 21 ต.ค. 69) ───────────────────────────────────────────────────────
//   เดิม "งานตามเส้นทางการขาย": ติ๊กแล้วเลื่อนขั้น · มี % ความคืบหน้า · มีปุ่ม ได้งาน/ไม่ได้งาน/เปิดใหม่ → สถานะเปลี่ยนได้หลายทาง
//   ตอนนี้: อยู่ในแท็บ "ประวัติ" เป็นรายการเตือนอย่างเดียว — ติ๊กไว้กันลืม ไม่ขยับสถานะ ไม่มี % · ปิดงานทำที่กล่องขั้นต่อไป/ใบเสนอราคา
//   งานที่ระบบติ๊กให้เอง (ทำใบ/ส่งใบ/นัดหมาย) กดเองไม่ได้ — ทำของจริงแล้วระบบติ๊กให้
import { diffLeadTasks, type LeadIntent } from "@pms/shared/lib/leadIntent";
import { Check } from "lucide-react";
import {
  applyTaskTemplate, QUOTE_TASK_KEY, SEND_QUOTE_TASK_KEY, findAppointmentTask,
  type LeadRow, type LeadTask,
} from "@pms/shared/lib/mock";
import { APP_NOW } from "@pms/shared/context/FilterContext";
import { useLeadTaskTemplate } from "@pms/shared/lib/useHQConfig";
import { ชั่วโมงนาทีไทย } from "@pms/shared/lib/thaiDate";

const THAI_MONTHS = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
// วันประทับ = "วันนี้" ของระบบ (APP_NOW) ไม่ใช่นาฬิกาเครื่อง — กติกาเดียวกับ useAudit/ทั้งระบบ · เวลา (ชม.:นาที) ใช้นาฬิกาจริง
function stampNow() {
  return `${APP_NOW.getDate()} ${THAI_MONTHS[APP_NOW.getMonth()]} ${APP_NOW.getFullYear() + 543} · ${ชั่วโมงนาทีไทย()}`;
}

export function LeadTasks({ lead, performedBy, onSave }: {
  lead: LeadRow; performedBy: string; onSave: (intent: LeadIntent) => void;
}) {
  const taskTpl = useLeadTaskTemplate();
  // งานที่เห็นต้องตรงกับชุดที่ HQ ตั้งไว้เสมอ (บอสแจ้ง 19 ส.ค. 69) · งานปิดการขายไม่ใช่รายการเตือน (ปิดงานทำที่กล่องขั้นต่อไป)
  const tasks: LeadTask[] = applyTaskTemplate(lead.tasks, taskTpl, lead.status).filter(t => t.key !== "close");
  const closed = lead.status === "PAID" || lead.status === "CANCELLED";
  const งานนัด = findAppointmentTask(tasks.map(t => ({ key: t.key, label: t.label, stage: "BULLET" as const })))?.key;
  const ระบบติ๊กเมื่อ = (key: string): string =>
    key === QUOTE_TASK_KEY ? "ระบบติ๊กให้เมื่อทำใบเสนอราคา" : key === SEND_QUOTE_TASK_KEY ? "ระบบติ๊กให้เมื่อส่งใบให้ลูกค้า"
      : key === งานนัด ? "ระบบติ๊กให้เมื่อบันทึกนัดหมาย" : "";

  function toggle(key: string) {
    if (closed || ระบบติ๊กเมื่อ(key)) return;
    const next = tasks.map(t => t.key !== key ? t
      : t.done ? { ...t, done: false, doneAt: undefined, doneBy: undefined }
      : { ...t, done: true, doneAt: stampNow(), doneBy: performedBy });
    onSave({ tasks: diffLeadTasks(tasks, next) });   // รายการเตือน — ไม่ส่งขั้น ฐานไม่เลื่อนสถานะจากงาน (ใบ 0232)
  }

  return (
    <div>
      <div style={{ fontSize: "0.65rem", fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: "#003366", marginBottom: 10 }}>
        รายการเตือน · ติ๊กไว้กันลืม (ไม่เปลี่ยนขั้นของลูกค้าเป้าหมาย)
      </div>
      {tasks.length === 0 ? (
        <div style={{ color: "#9aa2ad", fontSize: "0.8rem", padding: "14px 0", textAlign: "center" }}>ยังไม่มีรายการเตือน</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {tasks.map(t => {
            const auto = ระบบติ๊กเมื่อ(t.key);
            return (
              <button key={t.key} type="button" role="checkbox" aria-checked={t.done} onClick={() => toggle(t.key)} disabled={closed || !!auto}
                data-auto-task={auto ? "1" : undefined} title={auto || undefined}
                style={{ display: "flex", alignItems: "flex-start", gap: 11, width: "100%", textAlign: "left", padding: "9px 12px", borderRadius: 10,
                  border: `1px solid ${t.done ? "#bbf7d0" : "#e5e7eb"}`, background: t.done ? "#f0fdf4" : "#fff",
                  cursor: closed || auto ? "default" : "pointer", fontFamily: "inherit", opacity: closed && !t.done ? 0.6 : 1 }}>
                <span style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1, border: `2px solid ${t.done ? "#059669" : "#cbd5e1"}`,
                  background: t.done ? "#059669" : "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {t.done && <Check size={13} color="#fff" strokeWidth={3} />}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: "0.84rem", fontWeight: 600, color: t.done ? "#065f46" : "#2D2D2D", textDecoration: t.done ? "line-through" : "none" }}>{t.label}</span>
                  {!t.done && auto && <span style={{ display: "block", fontSize: "0.65rem", color: "#6b7280", marginTop: 2 }}>{auto}</span>}
                  {t.done && (t.doneBy || t.doneAt) && (
                    <span style={{ display: "block", fontSize: "0.65rem", color: "#6b7280", marginTop: 2 }}>✓ {t.doneBy ?? "—"}{t.doneAt ? ` · ${t.doneAt}` : ""}</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
