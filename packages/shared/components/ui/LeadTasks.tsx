"use client";

import { diffLeadTasks, type LeadIntent } from "@pms/shared/lib/leadIntent";
import { useState, useMemo } from "react";
import { Check, Trophy, XCircle, RotateCcw, Lock } from "lucide-react";
import {
  applyTaskTemplate, taskProgress, stageFromTasks, leadStatusLabel, leadStatusColor,
  QUOTE_TASK_KEY, SEND_QUOTE_TASK_KEY, findAppointmentTask, OTHER_LOST_REASON, OTHER_REASON_OPTION,
  type LeadRow, type LeadTask, type LeadStatus,
} from "@pms/shared/lib/mock";
import { APP_NOW } from "@pms/shared/context/FilterContext";
import { useLostReasons, useLeadTaskTemplate } from "@pms/shared/lib/useHQConfig";
import { ชั่วโมงนาทีไทย } from "@pms/shared/lib/thaiDate";

const THAI_MONTHS = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
// วันประทับ = "วันนี้" ของระบบ (APP_NOW = 30 มิ.ย. 2569) ไม่ใช่นาฬิกาเครื่อง — กติกาเดียวกับ useAudit/ทั้งระบบ
// เดิมใช้ new Date() → task ที่เพิ่งติ๊กได้วันจริง (เช่น 20 ก.ค. 2569) ล้ำ "วันนี้" ของระบบ + ไม่ตรงกับ doneAt
// ที่ระบบเติมอัตโนมัติ (30 มิ.ย.) · เวลา (ชม.:นาที) ยังใช้นาฬิกาจริงได้ — ไว้เรียงเหตุการณ์ในวันเดียวกัน
function stampNow() {
  return `${APP_NOW.getDate()} ${THAI_MONTHS[APP_NOW.getMonth()]} ${APP_NOW.getFullYear() + 543} · ${ชั่วโมงนาทีไทย()}`;
}

// Task-driven Sales Journey — เช็ก Task → บันทึกเวลา/ผู้ทำ → คำนวณ % → เลื่อน Stage อัตโนมัติ
export function LeadTasks({ lead, performedBy, onSave, onRequestQuotation, onRequestAppointment, whyCannotWin }: {
  lead: LeadRow; performedBy: string; onSave: (intent: LeadIntent) => void;
  /** งานที่ต้องมี "ของจริง" ถึงจะติ๊กได้ (จัดทำ/ส่งใบเสนอราคา) — หน้าแม่ส่งฟังก์ชันนี้มาเมื่องานนั้น
   *  ยังทำไม่ได้จริง แล้วพาผู้ใช้ไปทำของจริงแทน · คืน false = ไม่ได้จัดการ ให้ติ๊กตามปกติ
   *  (กดติ๊กเองแล้วขั้นขยับทั้งที่ยังไม่มีใบ/ยังไม่ได้ส่ง = ตัวเลขบนแดชบอร์ดไม่ตรงกับของจริงที่ถึงลูกค้า) */
  onRequestQuotation?: (taskKey: string) => boolean;
  /** งาน "นัดหมาย" ก็ต้องมีของจริงเหมือนกัน (บอสสั่ง 20 ส.ค. 69)
   *  ยังไม่เคยลงนัดหมายเลย = ติ๊กเองไม่ได้ ต้องกดนัดหมายจริงก่อน แล้วระบบติ๊กให้
   *  คืน true = จัดการแทนแล้ว (พาไปลงนัด) · false = มีนัดจริงแล้ว ติ๊กได้ตามปกติ */
  onRequestAppointment?: () => boolean;
  /** เหตุที่ยังปิดการขายสำเร็จไม่ได้ — คืนสตริงว่าง = ปิดได้
   *  บอสสั่ง (19 ส.ค. 69): ห้ามปิดการขายถ้ายังไม่มีใบเสนอราคาที่ส่งถึงลูกค้าแล้ว
   *  เดิมกด "ได้งาน" ได้ตลอด → ได้ลูกค้ายอดสะสม ฿0 ปนในฐาน ทำให้ยอดขาย/อัตราปิดการขายในรายงานเพี้ยน */
  whyCannotWin?: () => string;
}) {
  const lostReasons = useLostReasons(); // รายการที่ HQ กำหนด (อ่านผ่าน repo — ไม่ใช่ localStorage ของ origin ตัวเอง)
  const taskTpl = useLeadTaskTemplate(); // งานมาตรฐานที่ HQ ตั้ง — ลูกค้าเป้าหมายที่ยังไม่มี checklist ใช้ชุดนี้สร้าง
  // งานที่เห็นต้องตรงกับชุดที่ HQ ตั้งไว้เสมอ — เดิมอ่าน lead.tasks ตรง ๆ
  // ลูกค้าเป้าหมายที่มีอยู่ก่อน HQ แก้งานจึงค้างชุดเก่าตลอดไป (บอสแจ้ง 19 ส.ค. 69)
  const tasks: LeadTask[] = applyTaskTemplate(lead.tasks, taskTpl, lead.status);
  const closed = lead.status === "PAID" || lead.status === "CANCELLED";
  const pct = closed ? 100 : taskProgress(tasks);
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const [otherText, setOtherText] = useState("");   // เหตุผลที่พิมพ์เอง (ใช้เมื่อเลือก "อื่นๆ")
  // เหตุผลที่จะบันทึกจริง — โหมด "อื่นๆ" ต้องพิมพ์ก่อนถึงจะยืนยันได้ (ค่า __OTHER__ ห้ามหลุดลง DB)
  const finalLostReason = lostReason === OTHER_LOST_REASON ? otherText.trim() : lostReason;
  const [hint, setHint] = useState("");

  // ลำดับงาน (ไม่รวม "ปิดการขาย") — ใช้บังคับติ๊กตามลำดับ ห้ามข้ามขั้น
  const normalTasks = tasks.filter(t => t.key !== "close");
  const orderIndex = (key: string) => normalTasks.findIndex(t => t.key === key);
  // เช็กขั้นนี้ได้ก็ต่อเมื่อขั้นก่อนหน้าเสร็จครบ · ยกเลิกได้เฉพาะขั้นล่าสุด (ไม่มีขั้นถัดไปที่เช็กไว้)
  const canCheck   = (i: number) => normalTasks.slice(0, i).every(x => x.done);
  const canUncheck = (i: number) => !normalTasks.slice(i + 1).some(x => x.done);

  // ── จับงานเข้ากับ "ขั้น" ของเส้นทางการขาย ────────────────────────────────────
  // งานที่บันทึกไว้ในลูกค้าเป้าหมายเก็บแค่ ชื่อ/ติ๊กแล้วหรือยัง — ขั้นของงานอยู่ที่แม่แบบของ HQ
  // ไม่จัดกลุ่มให้เห็น ผู้ใช้จะเดาไม่ออกว่าติ๊กงานไหนแล้วการ์ดจะเลื่อนไปคอลัมน์ไหนบนกระดาน
  //   (บอสสั่ง 19 ส.ค. 69: "ทำให้งานสัมพันธ์กับเส้นทางการขาย")
  // ⚠️ ห้ามเรียงงานใหม่ตามขั้น — ลำดับที่เก็บไว้คือกติกาการติ๊ก (ห้ามข้ามขั้น) เรียงใหม่ = ลำดับติ๊กเพี้ยน
  //   จึงแค่ "ตัดกลุ่ม" ตามลำดับเดิม · งานเก่าที่ HQ ลบออกจากแม่แบบแล้วไม่มีขั้น ให้อยู่กลุ่มเดียวกับงานก่อนหน้า
  const stageGroups = useMemo(() => {
    const stageOf = new Map(taskTpl.map(t => [t.key, t.stage]));
    const groups: { stage: LeadStatus; items: { t: LeadTask; i: number }[] }[] = [];
    normalTasks.forEach((t, i) => {
      const last = groups[groups.length - 1];
      const stage = stageOf.get(t.key) ?? last?.stage ?? "WAITING";
      if (last && last.stage === stage) last.items.push({ t, i });
      else groups.push({ stage, items: [{ t, i }] });
    });
    return groups;
  }, [normalTasks, taskTpl]);

  function toggle(key: string) {
    if (closed) return;
    const i = orderIndex(key);
    if (i < 0) return;
    const cur = normalTasks[i];
    if (!cur.done) {
      if (!canCheck(i)) { setHint("ทำงานก่อนหน้าให้ครบก่อน จึงจะติ๊กงานนี้ได้ (ห้ามข้ามขั้น)"); return; }
      // งานที่ต้องมี "ของจริง" ถึงจะติ๊กได้ — พาไปออก/ส่งใบจริง แล้วระบบจะติ๊กให้เองตอนนั้น
      if ((key === QUOTE_TASK_KEY || key === SEND_QUOTE_TASK_KEY) && onRequestQuotation?.(key)) {
        setHint("");
        return;
      }
      // งาน "นัดหมาย" — ต้องมีนัดจริงก่อน ถึงจะถือว่าทำแล้ว (เหมือนงานที่ต้องมีใบเสนอราคา)
      // ⚠️ ห้ามเทียบรหัสตายตัว: สำนักงานใหญ่แก้ชื่องานเมื่อไร รหัสเปลี่ยนตาม (appointment → task_bullet_1)
      //    แล้วด่านนี้จะเงียบหายไปเฉย ๆ โดยไม่มีอะไรฟ้อง (เจอจริง 21 ส.ค. 69 — ติ๊กงานนัดหมายเองได้ทั้งที่ยังไม่มีนัด)
      if (key === findAppointmentTask(tasks.map(t => ({ key: t.key, label: t.label, stage: "BULLET" as const })))?.key && onRequestAppointment?.()) {
        setHint("");
        return;
      }
    } else {
      if (!canUncheck(i)) { setHint("ยกเลิกได้เฉพาะงานล่าสุด — ต้องยกเลิกงานถัดไปก่อน"); return; }
    }
    setHint("");
    const now = stampNow();
    const next = tasks.map(t => t.key === key
      ? (t.done
          ? { ...t, done: false, doneAt: undefined, doneBy: undefined }
          : { ...t, done: true, doneAt: now, doneBy: performedBy })
      : t);
    // เช็ก Task → คำนวณ stage ใหม่อัตโนมัติ (เลื่อน stage ตาม task ที่ทำล่าสุด)
    // ฐานคิดขั้นจากงานในฐาน (ใบ 0211) — ส่งเฉพาะงานนี้ ไม่ส่งรายการงานทั้งชุด (หน้าค้างจะไม่ทับงานที่ฐานเพิ่งติ๊ก)
    onSave({ tasks: diffLeadTasks(tasks, next), deriveStage: "any" });
  }

  function close(outcome: "won" | "lost", reason?: string) {
    const now = stampNow();
    // ปิดการขาย → ทุก task ถือว่าเสร็จ = 100% · stage = Won / Lost
    const next = tasks.map(t => ({ ...t, done: true, doneAt: t.doneAt ?? now, doneBy: t.doneBy ?? performedBy }));
    onSave({ tasks: diffLeadTasks(tasks, next),
      stage: { status: outcome === "won" ? "PAID" : "CANCELLED", ...(outcome === "lost" ? { lostReason: reason ?? "" } : {}) } });
    setLostOpen(false); setLostReason(""); setOtherText("");
  }

  function reopen() {
    const next = tasks.map(t => t.key === "close" ? { ...t, done: false, doneAt: undefined, doneBy: undefined } : t);
    onSave({ tasks: diffLeadTasks(tasks, next), stage: { status: stageFromTasks(next, taskTpl) } });
  }

  const barColor = lead.status === "CANCELLED" ? "#dc2626" : lead.status === "PAID" ? "#059669" : "#003366";
  // เหตุที่กด "ได้งาน" ไม่ได้ (ว่าง = กดได้) — หน้าแม่เป็นคนตัดสิน เพราะมีข้อมูลใบเสนอราคาของลูกค้าเป้าหมายรายนี้
  const winBlock = closed ? "" : (whyCannotWin?.() ?? "");

  return (
    <div>
      <div style={{ fontSize: "0.65rem", fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: "#003366", marginBottom: 12 }}>
        งานตามเส้นทางการขาย · ติ๊กแล้วเลื่อนขั้นอัตโนมัติ
      </div>

      {/* ── ความคืบหน้า (คำนวณจากจำนวน Task · อ่านอย่างเดียว) ── */}
      <div style={{ background: "#f8f9fb", border: "1px solid #f0f4f8", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div>
            <span style={{ fontSize: "0.72rem", color: "#6b7280", fontWeight: 600 }}>สถานะปัจจุบัน</span>
            <div style={{ fontSize: "0.92rem", fontWeight: 800, color: barColor }}>{leadStatusLabel[lead.status]}</div>
          </div>
          <div style={{ fontSize: "1.7rem", fontWeight: 800, color: barColor, fontVariantNumeric: "tabular-nums" }}>{pct}%</div>
        </div>
        <div style={{ height: 10, background: "#e5e7eb", borderRadius: 999, overflow: "hidden" }}>
          <div className="bar-grow" style={{ height: "100%", width: `${pct}%`, borderRadius: 999, background: barColor }} />
        </div>
        <div style={{ fontSize: "0.65rem", color: "#9ca3af", marginTop: 6 }}>
          คำนวณจาก {tasks.filter(t => t.done).length}/{tasks.length} งาน — เลื่อนขั้นอัตโนมัติเมื่อติ๊กงาน (ปรับ % เองไม่ได้)
        </div>
      </div>

      {/* ── ข้อความเตือนเมื่อพยายามข้ามขั้น ── */}
      {hint && !closed && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, background: "#fff7ed", border: "1px solid #fed7aa", color: "#b45309", borderRadius: 9, padding: "8px 11px", marginBottom: 10, fontSize: "0.72rem", fontWeight: 600 }}>
          <Lock size={13} /> {hint}
        </div>
      )}

      {/* ── Checklist งาน — จัดกลุ่มตามขั้นของเส้นทางการขาย (ติ๊กตามลำดับ ห้ามข้ามขั้น) ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
        {stageGroups.map(g => {
        const sc = leadStatusColor[g.stage];
        const groupDone = g.items.every(x => x.t.done);
        // ขั้นที่การ์ดยืนอยู่จริงบนกระดาน = สถานะของลูกค้าเป้าหมาย · หัวข้อต้องตรงกัน ไม่งั้นอ่านแล้วขัดกันเอง
        const isCurrentStage = !closed && lead.status === g.stage;
        // งานชุดถัดไปที่ติ๊กได้แล้วตอนนี้ — การ์ดจะเลื่อนมาคอลัมน์นี้เมื่อติ๊ก
        const groupNext = !closed && !groupDone && !isCurrentStage && g.items.some(x => canCheck(x.i));
        const dim = !groupDone && !isCurrentStage && !groupNext;   // ขั้นที่ยังไม่ถึง — จางไว้ให้สายตาโฟกัสขั้นที่ทำอยู่
        return (
        <div key={`${g.stage}-${g.items[0].i}`}>
          {/* หัวขั้น — จุดสี + ชื่อขั้น ชุดเดียวกับหัวคอลัมน์บนกระดาน เพื่อให้เห็นว่าติ๊กแล้วการ์ดไปอยู่คอลัมน์ไหน */}
          <div data-stage-head={g.stage} style={{ display: "flex", alignItems: "center", gap: 7, padding: "0 2px 8px" }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: sc.text, flexShrink: 0, opacity: dim ? 0.35 : 1 }} />
            <span style={{ fontSize: "0.72rem", fontWeight: 800, color: dim ? "#9aa4b0" : "#2D2D2D", whiteSpace: "nowrap" }}>{leadStatusLabel[g.stage]}</span>
            {isCurrentStage
              ? <span className="badge" style={{ background: sc.bg, color: sc.text, border: "none" }}>ขั้นปัจจุบัน</span>
              : groupDone
                ? <span className="badge" style={{ background: "#e5faf0", color: "#059669", border: "none" }}>ผ่านแล้ว</span>
                : groupNext
                  ? <span className="badge" style={{ background: "#eef3f8", color: "#003366", border: "none" }}>ทำต่อได้เลย</span>
                  : <span className="badge" style={{ background: "#f4f6f8", color: "#9aa4b0", border: "none" }}>ยังไม่ถึง</span>}
            <span style={{ flex: 1, height: 1, background: "#eef0f4" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {g.items.map(({ t, i }) => {
          const lockedCheck = !closed && !t.done && !canCheck(i);   // ยังเช็กไม่ได้ (ขั้นก่อนหน้ายังไม่ครบ)
          const lockedUncheck = !closed && t.done && !canUncheck(i); // ยกเลิกไม่ได้ (มีขั้นถัดไปที่เช็กแล้ว)
          const locked = lockedCheck || lockedUncheck;
          return (
            // ปุ่มงานคือ "ช่องติ๊ก" ในสายตาผู้ใช้ — ต้องบอกสถานะให้โปรแกรมอ่านหน้าจอ (และเทสต์) รู้ด้วย
            // เดิมเป็นปุ่มเปล่า ๆ ที่วาดสี่เหลี่ยมเขียวเอง คนใช้เครื่องอ่านหน้าจอจึงไม่รู้ว่างานไหนเสร็จแล้ว
            // และเทสต์ที่นับ input[type=checkbox] ก็ได้ 0 เสมอ = ผ่านทั้งที่ไม่ได้ตรวจอะไรเลย (3 ก.ย. 69)
            <button key={t.key} type="button" role="checkbox" aria-checked={t.done} onClick={() => toggle(t.key)} disabled={closed}
              title={lockedCheck ? "ทำงานก่อนหน้าให้ครบก่อน" : lockedUncheck ? "ยกเลิกได้เฉพาะงานล่าสุด" : undefined}
              style={{
                display: "flex", alignItems: "flex-start", gap: 11, width: "100%", textAlign: "left",
                padding: "10px 12px", borderRadius: 10, border: `1px solid ${t.done ? "#bbf7d0" : lockedCheck ? "#eceff3" : "#e5e7eb"}`,
                background: t.done ? "#f0fdf4" : lockedCheck ? "#fafbfc" : "#fff",
                cursor: closed ? "default" : locked ? "not-allowed" : "pointer", fontFamily: "inherit",
                opacity: (closed && !t.done) || lockedCheck ? 0.6 : 1,
              }}>
              <span style={{
                width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1,
                border: `2px solid ${t.done ? "#059669" : lockedCheck ? "#d5dbe3" : "#cbd5e1"}`, background: t.done ? "#059669" : "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {t.done ? <Check size={13} color="#fff" strokeWidth={3} /> : lockedCheck ? <Lock size={11} color="#b6bfca" /> : null}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: "0.86rem", fontWeight: 600, color: t.done ? "#065f46" : lockedCheck ? "#9aa4b0" : "#2D2D2D", textDecoration: t.done ? "line-through" : "none" }}>{t.label}</span>
                {t.done && (t.doneBy || t.doneAt) && (
                  <span style={{ display: "block", fontSize: "0.65rem", color: "#6b7280", marginTop: 2 }}>
                    ✓ {t.doneBy ?? "—"}{t.doneAt ? ` · ${t.doneAt}` : ""}
                  </span>
                )}
                {lockedCheck && <span style={{ display: "block", fontSize: "0.62rem", color: "#b6bfca", marginTop: 2 }}>ล็อก — ทำงานก่อนหน้าให้ครบก่อน</span>}
              </span>
            </button>
          );
        })}
          </div>
        </div>
        );
        })}
      </div>

      {/* ── ปิดการขาย (Won / Lost) → 100% ── */}
      <div style={{ marginTop: 14, borderTop: "1px solid #eef0f4", paddingTop: 14 }}>
        {closed ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 14px", borderRadius: 10, background: lead.status === "PAID" ? "#e5faf0" : "#fee2e2" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              {lead.status === "PAID" ? <Trophy size={18} color="#059669" /> : <XCircle size={18} color="#dc2626" />}
              <div>
                <div style={{ fontSize: "0.86rem", fontWeight: 800, color: lead.status === "PAID" ? "#059669" : "#dc2626" }}>
                  {lead.status === "PAID" ? "ปิดการขายสำเร็จ" : "ปิดการขายไม่สำเร็จ"}
                </div>
                {lead.status === "CANCELLED" && lead.lostReason && <div style={{ fontSize: "0.72rem", color: "#991b1b" }}>เหตุผล: {lead.lostReason}</div>}
              </div>
            </div>
            {/* ปิดการขายสำเร็จแล้ว ดีลเลอร์ย้อนเองไม่ได้ — HQ ย้อนการตอบรับได้คนเดียว (บอสตัดสิน 19 ต.ค. 69 · ใบ 0217) */}
            {lead.status === "PAID" ? (
              <span style={{ fontSize: "0.72rem", color: "#6b7280", maxWidth: 220, textAlign: "right", lineHeight: 1.5 }}>ย้อนได้เฉพาะสำนักงานใหญ่</span>
            ) : (
              <button type="button" onClick={reopen} className="btn btn-secondary btn-sm" style={{ color: "#374151" }}>
                <RotateCcw size={13} /> เปิดใหม่
              </button>
            )}
          </div>
        ) : lostOpen ? (
          <div style={{ padding: "12px 14px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca" }}>
            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#dc2626", marginBottom: 8 }}>
              {lostReason === OTHER_LOST_REASON ? "ระบุเหตุผลที่ปิดการขายไม่ได้" : "เลือกเหตุผลที่ปิดการขายไม่ได้"}
            </div>
            {/* เหตุผลจริงไม่ตรงกับรายการที่ HQ กำหนดเลย → กรอกเองได้ (บอสสั่ง 17 ส.ค. 69)
                ⚠️ ค่า __OTHER__ เป็นแค่ "โหมดพิมพ์เอง" ห้ามบันทึกลงฐานข้อมูล — ปุ่มยืนยันจึงล็อกไว้จนกว่าจะพิมพ์จริง
                   (ไม่งั้นรายงาน "เหตุผลที่เสียโอกาส" จะมีแท่งชื่อ __OTHER__ โผล่มา) */}
            {lostReason === OTHER_LOST_REASON ? (
              <div style={{ marginBottom: 10 }}>
                <input autoFocus value={otherText} onChange={e => setOtherText(e.target.value)} placeholder="พิมพ์เหตุผล…"
                  style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 11px", fontSize: "0.8rem", color: "#2D2D2D", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
                <button type="button" onClick={() => { setLostReason(""); setOtherText(""); }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#003366", fontSize: "0.72rem", fontWeight: 700, padding: "6px 0 0" }}>
                  ← กลับไปเลือกจากรายการ
                </button>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
                {/* ⚠️ "อื่นๆ (ระบุเอง)" อยู่ในรายการที่สำนักงานใหญ่ตั้งไว้แล้ว (บอสสั่ง 21 ส.ค. 69)
                    กดปุ่มนี้ = เปิดโหมดพิมพ์เอง ไม่ใช่บันทึกคำว่า "อื่นๆ" ลงไปตรง ๆ
                    และห้ามมีปุ่มซ้ำสองอัน — ปุ่มพิมพ์เองที่ต่อท้ายจึงโผล่เฉพาะตอนที่รายการไม่มีตัวเลือกนี้ */}
                {lostReasons.map(r => (
                  <button key={r} type="button" onClick={() => setLostReason(r === OTHER_REASON_OPTION ? OTHER_LOST_REASON : r)}
                    style={{ padding: "8px 10px", borderRadius: 8, cursor: "pointer", fontSize: "0.8rem", fontFamily: "inherit", textAlign: "left",
                      border: `1px solid ${lostReason === r ? "#dc2626" : "#e5e7eb"}`, background: lostReason === r ? "#fee2e2" : "#fff",
                      color: lostReason === r ? "#dc2626" : "#2D2D2D", fontWeight: lostReason === r ? 700 : 400 }}>{r}</button>
                ))}
                {!lostReasons.includes(OTHER_REASON_OPTION) && (
                  <button type="button" onClick={() => setLostReason(OTHER_LOST_REASON)}
                    style={{ padding: "8px 10px", borderRadius: 8, cursor: "pointer", fontSize: "0.8rem", fontFamily: "inherit", textAlign: "left",
                      border: "1px dashed #9ca3af", background: "#fafafa", color: "#6b7280", fontWeight: 700 }}>{OTHER_REASON_OPTION}</button>
                )}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setLostOpen(false); setLostReason(""); setOtherText(""); }}>ยกเลิก</button>
              <button type="button" className="btn btn-sm" disabled={!finalLostReason}
                style={{ background: finalLostReason ? "#dc2626" : "#f3f4f6", color: finalLostReason ? "#fff" : "#9ca3af", cursor: finalLostReason ? "pointer" : "not-allowed" }}
                onClick={() => close("lost", finalLostReason)}>ยืนยันปิดการขาย</button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={{ flex: 1, fontSize: "0.8rem", fontWeight: 700, color: "#374151", alignSelf: "center" }}>ปิดการขาย :</span>
            {/* ปิดการขายสำเร็จได้ก็ต่อเมื่อมีใบที่ส่งถึงลูกค้าแล้ว (กติกาเดียวกับด่านของขั้นเสนอราคา) */}
            <button type="button" className="btn btn-sm" onClick={() => close("won")}
              disabled={!!winBlock} title={winBlock || undefined}
              style={winBlock
                ? { background: "#f3f4f6", color: "#9ca3af", cursor: "not-allowed" }
                : { background: "#059669", color: "#fff" }}><Trophy size={13} /> ได้งาน</button>
            <button type="button" className="btn btn-sm" onClick={() => setLostOpen(true)}
              style={{ background: "#fff", color: "#dc2626", border: "1px solid #fecaca" }}><XCircle size={13} /> ไม่ได้งาน</button>
            {winBlock && (
              <div style={{ flexBasis: "100%", display: "flex", alignItems: "center", gap: 7, marginTop: 2,
                background: "#fff7ed", border: "1px solid #fed7aa", color: "#b45309", borderRadius: 9, padding: "8px 11px", fontSize: "0.72rem", fontWeight: 600 }}>
                <Lock size={13} style={{ flexShrink: 0 }} /> {winBlock}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
