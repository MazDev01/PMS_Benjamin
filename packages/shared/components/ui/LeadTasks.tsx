"use client";

// ── งานในแต่ละขั้นของลูกค้าเป้าหมาย (รอบ 4 · FLOW 5 ขั้น 27 ต.ค. 69 · ใบ 0250 · ย้ายมาแท็บภาพรวม 28 ต.ค. 69 · FLOW D7) ─────────
//   อยู่แท็บภาพรวม ใต้แถบ 5 ขั้น — ติ๊กไว้กันลืม ไม่ขยับขั้น · จัดกลุ่มตาม 5 ขั้นของ leadStage.ts (หัวกลุ่ม = ชื่อขั้น ไม่มีเลข)
//   ขั้นปัจจุบันเปิดไว้ ขั้นอื่นพับไว้ กดเปิดได้ (บอสสั่ง 28 ต.ค. 69)
//   รายการของระบบ (นัดหมาย · ส่งคำขอราคา · ได้ใบ HQ · จัดทำใบ · ส่งใบ) ฐานติ๊กเมื่อทำจริง กดเองไม่ได้ (ฐานกันด้วย) · ป้าย "ระบบติ๊กให้"
//   วันที่ทำแสดงผ่านตัวจัดรูปวันที่กลาง (พ.ศ.) — ข้อมูลเดิมบางส่วนเก็บแบบ ค.ศ.
import { useEffect, useState } from "react";
import { diffLeadTasks, type LeadIntent } from "@pms/shared/lib/leadIntent";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { applyTaskTemplate, ระบบติ๊กเมื่อ, type LeadRow, type LeadTask } from "@pms/shared/lib/mock";
import { APP_NOW } from "@pms/shared/context/FilterContext";
import { useLeadTaskTemplate } from "@pms/shared/lib/useHQConfig";
import { ชั่วโมงนาทีไทย, วันที่แสดงไทย } from "@pms/shared/lib/thaiDate";
import { ชื่อขั้น, type เลขขั้น } from "@pms/shared/lib/leadStage";

const THAI_MONTHS = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
// วันประทับ = "วันนี้" ของระบบ (APP_NOW) ไม่ใช่นาฬิกาเครื่อง — กติกาเดียวกับ useAudit/ทั้งระบบ · เวลา (ชม.:นาที) ใช้นาฬิกาจริง
function stampNow() {
  return `${APP_NOW.getDate()} ${THAI_MONTHS[APP_NOW.getMonth()]} ${APP_NOW.getFullYear() + 543} · ${ชั่วโมงนาทีไทย()}`;
}

/** ขั้นตอนนี้ = เลขขั้นจาก leadStage.ts (ผู้เรียกคิดจากสถานะ + ใบร่าง) · ปิดแล้ว (6/7) = ไม่เปิดกลุ่มไหนไว้ */
export function LeadTasks({ lead, performedBy, onSave, ขั้นตอนนี้ }: {
  lead: LeadRow; performedBy: string; onSave: (intent: LeadIntent) => void; ขั้นตอนนี้: เลขขั้น;
}) {
  const taskTpl = useLeadTaskTemplate();
  // งานที่เห็นต้องตรงกับชุดที่ HQ ตั้งไว้เสมอ (บอสแจ้ง 19 ส.ค. 69) · ลีดที่ปิดแล้วคงรายการเดิม
  //   (รายการ flow เก่าไม่มีในฐานแล้ว และฐานไม่รับ — ใบ 0257 · ไม่ต้องกรองที่หน้าจอ)
  const tasks: LeadTask[] = applyTaskTemplate(lead.tasks, taskTpl, lead.status);
  const closed = lead.status === "PAID" || lead.status === "CANCELLED";
  const ขั้นของรายการ = new Map(taskTpl.map(d => [d.key, d.step] as const));
  // รายการเฉพาะของลีด (ไม่อยู่ในแม่แบบ) ไปอยู่ขั้น 1
  const กลุ่ม = ([1, 2, 3, 4, 5] as const).map(n => ({ step: n, ชื่อ: ชื่อขั้น(n), งาน: tasks.filter(t => (ขั้นของรายการ.get(t.key) ?? 1) === n) }));
  // กลุ่มที่เปิดอยู่ — เริ่มที่ขั้นปัจจุบัน · ขั้นเปลี่ยน (หรือเปิดลีดอื่น) = เปิดขั้นใหม่ให้
  const [เปิด, setเปิด] = useState<Set<number>>(() => new Set([ขั้นตอนนี้]));
  useEffect(() => { setเปิด(new Set([ขั้นตอนนี้])); }, [ขั้นตอนนี้, lead.id]);
  const สลับ = (n: number) => setเปิด(s => { const x = new Set(s); if (x.has(n)) x.delete(n); else x.add(n); return x; });

  function toggle(key: string) {
    if (closed || ระบบติ๊กเมื่อ(key)) return;
    const next = tasks.map(t => t.key !== key ? t
      : t.done ? { ...t, done: false, doneAt: undefined, doneBy: undefined }
      : { ...t, done: true, doneAt: stampNow(), doneBy: performedBy });
    onSave({ tasks: diffLeadTasks(tasks, next) });   // รายการเตือน — ไม่ส่งขั้น ฐานไม่เลื่อนสถานะจากงาน (ใบ 0232)
  }

  return (
    <div>
      <div style={{ fontSize: "0.65rem", fontWeight: 800, letterSpacing: ".06em", color: "#003366", marginBottom: 10 }}>
        งานในแต่ละขั้น
      </div>
      {tasks.length === 0 ? (
        <div style={{ color: "#9aa2ad", fontSize: "0.8rem", padding: "14px 0", textAlign: "center" }}>ยังไม่มีงาน</div>
      ) : (
        <div data-lead-tasks style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {กลุ่ม.map(g => {
            const เปิดอยู่ = เปิด.has(g.step);
            const เสร็จ = g.งาน.filter(t => t.done).length;
            return (
              <section key={g.step} data-task-step={g.step} data-open={เปิดอยู่ ? "1" : "0"} aria-label={`ขั้น ${g.ชื่อ}`}
                style={{ border: "1px solid #eef0f4", borderRadius: 10, background: g.step === ขั้นตอนนี้ ? "#f8fbff" : "#fff" }}>
                <button type="button" aria-expanded={เปิดอยู่} onClick={() => สลับ(g.step)}
                  style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "8px 10px", background: "none", border: "none",
                    cursor: "pointer", fontFamily: "inherit", fontSize: "0.76rem", fontWeight: 800, color: "#475569", textAlign: "left" }}>
                  {เปิดอยู่ ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span style={{ flex: 1 }}>{g.ชื่อ}{g.step === ขั้นตอนนี้ && <span style={{ marginLeft: 6, fontSize: "0.64rem", fontWeight: 700, color: "#b45309" }}>· ขั้นตอนนี้</span>}</span>
                  <span style={{ fontSize: "0.66rem", fontWeight: 600, color: "#94a3b8" }}>{เสร็จ}/{g.งาน.length}</span>
                </button>
                {เปิดอยู่ && (g.งาน.length === 0 ? (
                  <div style={{ fontSize: "0.72rem", color: "#9aa2ad", padding: "0 12px 10px" }}>ไม่มีงานในขั้นนี้</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 7, padding: "0 10px 10px" }}>
                    {g.งาน.map(t => {
                      const auto = ระบบติ๊กเมื่อ(t.key);
                      const วันที่ = วันที่แสดงไทย(t.doneAt);
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
                            {auto && <span data-system-badge className="badge" style={{ marginLeft: 6, background: "#eef3f8", color: "#475569", fontSize: "0.6rem", fontWeight: 700, verticalAlign: "middle" }}>ระบบติ๊กให้</span>}
                            {!t.done && auto && <span style={{ display: "block", fontSize: "0.65rem", color: "#6b7280", marginTop: 2 }}>{auto}</span>}
                            {t.done && (t.doneBy || วันที่) && (
                              <span style={{ display: "block", fontSize: "0.65rem", color: "#6b7280", marginTop: 2 }}>✓ {t.doneBy ?? "—"}{วันที่ ? ` · ${วันที่}` : ""}</span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
