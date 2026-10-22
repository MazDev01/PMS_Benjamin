"use client";

// ── บันทึกการติดต่อ + ประวัติ ของผู้สนใจเป็นดีลเลอร์ ────────────────────────────────────
//   บอสสั่ง 14 ก.ย. 69: "ให้มันทำงานแบบเดียวกับดีลเลอร์" (กิจกรรม/รายงานติดตามของดีลเลอร์)
//
//   บันทึกการติดต่อ: ช่องทาง · คุยอะไร · นัดติดตามครั้งถัดไป
//     → ฐานข้อมูลตั้ง ติดต่อล่าสุด / นัดติดตาม / วันเริ่มติดต่อ / รอติดต่อ→ติดต่อแล้ว ให้เอง (0174)
//     → หน้าแม่ต้องโหลดรายนั้นใหม่ (onAdded) ไม่งั้นตารางยังโชว์ค่าเก่า
//   ประวัติ: ระบบบันทึกเอง แก้/ลบไม่ได้ — ไม่มีปุ่มแก้/ลบให้กดตั้งแต่ต้น
import React, { useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { prospectActivities as activitiesRepo } from "@pms/shared/lib/data";
import type { DealerProspect, ProspectActivity } from "@pms/shared/lib/data/types";
import { ช่องทางติดต่อ, เตรียมบันทึกการติดต่อ, ตรวจบันทึกการติดต่อ } from "@pms/shared/lib/prospectJourney";
import { วันเวลาไทย } from "@pms/shared/lib/thaiDate";
import { fmtISOToThai } from "@pms/shared/lib/mock";
import { APP_NOW_ISO } from "@pms/shared/context/FilterContext";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import { ActivityTimeline, type ActivityTimelineItem } from "@pms/shared/components/ui/ActivityTimeline";
import { แจ้งสำเร็จ } from "@pms/shared/components/ui/ConfirmToast";

const ป้ายชนิด: Record<ProspectActivity["kind"], { type: string; label: string }> = {
  created:  { type: "note",   label: "เพิ่มรายชื่อ" },
  status:   { type: "status", label: "เปลี่ยนขั้น" },
  contact:  { type: "call",   label: "ติดต่อ" },
  proposal: { type: "quote",  label: "ใบค่าแฟรนไชส์" },
};

export function ProspectActivityPanel({ prospect, activities, loaded, loadErr, editable, formOpen, setFormOpen, onReload, onAdded, ช่องทาง = ช่องทางติดต่อ }: {
  prospect: DealerProspect;
  /** ช่องทางที่เลือกได้ (หน้าตั้งค่า › หาดีลเลอร์) — ไม่ส่ง = รายการเริ่มต้น */
  ช่องทาง?: readonly string[];
  activities: ProspectActivity[];
  loaded: boolean;
  loadErr: string;
  editable: boolean;
  /** หน้าแม่คุมการเปิดฟอร์ม — งาน "ติดต่อครั้งแรก" กดแล้วต้องพามาเปิดฟอร์มนี้ได้ */
  formOpen: boolean;
  setFormOpen: (open: boolean) => void;
  onReload: () => void;
  onAdded: () => void;
}) {
  const [channel, setChannel] = useState("");
  const [body, setBody] = useState("");
  const [nextFollowUp, setNextFollowUp] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // เปิดฟอร์มแล้วเติมวันนัดติดตามที่ตั้งไว้ในแท็บภาพรวมให้เลย ไม่ต้องกรอกซ้ำ (บอสสั่ง 14 ก.ย. 69)
  //   เติมเฉพาะวันที่ยังไม่เลย — วันที่เลยไปแล้วเติมมาก็บันทึกไม่ผ่าน (ห้ามนัดย้อนหลัง) ปล่อยว่างให้ตั้งใหม่
  React.useEffect(() => {
    if (!formOpen) return;
    setNextFollowUp(prospect.followUp && prospect.followUp >= APP_NOW_ISO ? prospect.followUp : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- เติมตอนเปิดฟอร์มเท่านั้น ไม่ทับที่ผู้ใช้กำลังแก้
  }, [formOpen, prospect.id]);

  async function บันทึก() {
    const row = เตรียมบันทึกการติดต่อ({ prospectId: prospect.id, channel, body, nextFollowUp });
    const ผิด = ตรวจบันทึกการติดต่อ(row, APP_NOW_ISO);
    if (ผิด) { setErr(ผิด); return; }
    setBusy(true); setErr("");
    try {
      await activitiesRepo.addContact(row);
      แจ้งสำเร็จ(prospect.status === "new" ? "บันทึกการติดต่อแล้ว · ติ๊กงาน “ติดต่อครั้งแรก” ให้อัตโนมัติ" : "บันทึกการติดต่อแล้ว");
      setChannel(""); setBody(""); setNextFollowUp("");
      setFormOpen(false);
      onAdded();
    } catch (e) {
      setErr(friendlyError(e, "บันทึกการติดต่อไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  const items: ActivityTimelineItem[] = activities.map(a => ({
    id: a.id,
    type: ป้ายชนิด[a.kind]?.type ?? "note",
    label: a.kind === "contact" && a.channel ? `ติดต่อทาง ${a.channel}` : ป้ายชนิด[a.kind]?.label,
    text: a.kind === "contact" && a.nextFollowUp ? `${a.body} · นัดติดตาม ${fmtISOToThai(a.nextFollowUp)}` : a.body,
    time: `${วันเวลาไทย(new Date(a.createdAt))} · ${a.actor === "system" ? "ระบบ" : a.actor}`,
  }));

  return (
    <div>
      {editable && !formOpen && (
        <button className="btn btn-primary btn-sm" onClick={() => setFormOpen(true)} style={{ marginBottom: 12 }}>
          <MessageSquarePlus size={13} /> บันทึกการติดต่อ
        </button>
      )}
      {editable && formOpen && (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 14, marginBottom: 14, background: "#fafbfc" }}>
          <div style={{ fontSize: "0.8rem", fontWeight: 800, color: "#2D2D2D", marginBottom: 12 }}>บันทึกการติดต่อ · {prospect.name}</div>
          {err && <div role="alert" style={{ fontSize: "0.74rem", color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "7px 10px", marginBottom: 10 }}>{err}</div>}
          <fieldset disabled={busy} style={{ border: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
            <div>
              <label className="form-label" htmlFor="pc-channel">ช่องทาง *</label>
              <select id="pc-channel" className="form-select" value={channel} onChange={e => setChannel(e.target.value)} style={{ cursor: "pointer" }}>
                <option value="">— ยังไม่ระบุ —</option>
                {ช่องทาง.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label" htmlFor="pc-next">นัดติดตามครั้งถัดไป</label>
              <input id="pc-next" className="form-input" type="date" min={APP_NOW_ISO} value={nextFollowUp} onChange={e => setNextFollowUp(e.target.value)} />
              <div style={{ fontSize: "0.66rem", color: "#6b7280", marginTop: 3 }}>
                {prospect.followUp && nextFollowUp === prospect.followUp ? "ใช้วันที่ตั้งไว้เดิม — แก้ได้ถ้านัดใหม่" : "ไม่บังคับ · ใส่แล้ววันนัดของรายนี้เปลี่ยนตาม"}
              </div>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="form-label" htmlFor="pc-body">คุยอะไรไป *</label>
              <textarea id="pc-body" className="form-input" rows={3} value={body} onChange={e => setBody(e.target.value)}
                placeholder="เช่น สนใจแพ็กเกจ Exclusive ขอข้อมูลค่าแรกเข้า นัดคุยอีกครั้งสัปดาห์หน้า" style={{ resize: "vertical" }} />
            </div>
          </fieldset>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => { setFormOpen(false); setErr(""); }}>ยกเลิก</button>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void บันทึก()}>{busy ? "กำลังบันทึก…" : "บันทึกการติดต่อ"}</button>
          </div>
          <div style={{ fontSize: "0.65rem", color: "#9ca3af", marginTop: 8 }}>บันทึกแล้วแก้/ลบไม่ได้ — เป็นประวัติของรายนี้</div>
        </div>
      )}

      {loadErr ? (
        <div role="alert" style={{ fontSize: "0.78rem", color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", display: "flex", gap: 8, alignItems: "center" }}>
          {loadErr}
          <button className="btn btn-secondary btn-sm" onClick={onReload}>ลองใหม่</button>
        </div>
      ) : !loaded ? (
        <div style={{ fontSize: "0.78rem", color: "#6b7280" }}>กำลังโหลด…</div>
      ) : (
        <ActivityTimeline items={items} />
      )}
    </div>
  );
}
