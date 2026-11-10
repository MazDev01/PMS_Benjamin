"use client";


// ── บันทึกการติดต่อ + ประวัติ ของผู้สนใจเป็นดีลเลอร์ ────────────────────────────────────
//   บอสสั่ง 14 ก.ย. 69: "ให้มันทำงานแบบเดียวกับดีลเลอร์" (กิจกรรม/รายงานติดตามของดีลเลอร์)
//
//   บันทึกการติดต่อ: ช่องทาง · คุยอะไร · นัดติดตามครั้งถัดไป
//     → ฐานข้อมูลตั้ง ติดต่อล่าสุด / นัดติดตาม / วันเริ่มติดต่อ / รอติดต่อ→ติดต่อแล้ว ให้เอง (0174)
//     → หน้าแม่ต้องโหลดรายนั้นใหม่ (onAdded) ไม่งั้นตารางยังโชว์ค่าเก่า
//   ประวัติ: ระบบบันทึกเอง แก้/ลบไม่ได้ — ไม่มีปุ่มแก้/ลบให้กดตั้งแต่ต้น
import { ชื่อขั้นปัจจุบัน } from "@pms/shared/lib/dealerProspects";
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
import { FieldLabel, FieldError, useช่องบังคับ, กรอบผิด } from "@pms/shared/components/ui/FieldLabel";
import { แจ้งสำเร็จ } from "@pms/shared/components/ui/ConfirmToast";
import { useแทนรหัสในบันทึก } from "@pms/shared/lib/dealerDisplay";

const ป้ายชนิด: Record<ProspectActivity["kind"], { type: string; label: string }> = {
  created:  { type: "note",   label: "เพิ่มรายชื่อ" },
  status:   { type: "status", label: "เปลี่ยนขั้น" },
  contact:  { type: "call",   label: "ติดต่อ" },
  proposal: { type: "quote",  label: "ใบค่าแฟรนไชส์" },
};

export function ProspectActivityPanel({ prospect, activities, loaded, loadErr, editable, formOpen, setFormOpen, onReload, onAdded, ช่องทาง = ช่องทางติดต่อ, โหมดนัดคุย = false, onนัดคุยแล้ว, onยกเลิก }: {
  /** ฟอร์มนัดคุย (บอสตอบ P2 · 5 พ.ย. 69): วันที่/เวลา/สถานที่ ลงบันทึกการติดต่อ + ตั้งวันติดตาม = วันนัด · ยังไม่มีปฏิทิน HQ */
  โหมดนัดคุย?: boolean;
  /** บันทึกนัดคุยสำเร็จ → หน้าแม่เลื่อนขั้นเป็น "นัดคุยแล้ว" (บันทึกก่อน · ขั้นทีหลัง) */
  onนัดคุยแล้ว?: () => void | Promise<void>;
  /** กดยกเลิกฟอร์ม (ไม่บันทึก) — บอร์ดใช้หยุดลำดับฟอร์มที่ลากมา */
  onยกเลิก?: () => void;
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
  const แทนรหัส = useแทนรหัสในบันทึก();   // รหัสดีลเลอร์ในข้อความบันทึก → ชื่อ ตอนแสดง (บอสตอบ 6 พ.ย. 69 · ฐานคงข้อความดิบ)
  const [channel, setChannel] = useState("");
  const [body, setBody] = useState("");
  const [nextFollowUp, setNextFollowUp] = useState("");
  const [วันนัด, setวันนัด] = useState(""), [เวลานัด, setเวลานัด] = useState(""), [สถานที่, setสถานที่] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // เปิดฟอร์มแล้วเติมวันนัดติดตามที่ตั้งไว้ในแท็บภาพรวมให้เลย ไม่ต้องกรอกซ้ำ (บอสสั่ง 14 ก.ย. 69)
  //   เติมเฉพาะวันที่ยังไม่เลย — วันที่เลยไปแล้วเติมมาก็บันทึกไม่ผ่าน (ห้ามนัดย้อนหลัง) ปล่อยว่างให้ตั้งใหม่
  React.useEffect(() => {
    if (!formOpen) return;
    setNextFollowUp(prospect.followUp && prospect.followUp >= APP_NOW_ISO ? prospect.followUp : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- เติมตอนเปิดฟอร์มเท่านั้น ไม่ทับที่ผู้ใช้กำลังแก้
  }, [formOpen, prospect.id]);

  // ช่องบังคับ: ช่องทาง · คุยอะไรไป (ฐานบังคับ · 4 พ.ย. 69 ตัวกลาง) — ขาด = กรอบแดง + ข้อความใต้ช่อง · ตัวตรวจเดิมยังตรวจความยาว/วันย้อนหลัง
  const บังคับ = useช่องบังคับ();
  async function บันทึก() {
    if (!บังคับ.ตรวจ(โหมดนัดคุย ? [
      { key: "channel", label: "ช่องทาง", value: channel, ข้อความ: "ต้องเลือกช่องทางที่ติดต่อ" },
      { key: "meetDate", label: "วันที่นัด", value: วันนัด, ข้อความ: "ต้องระบุวันที่นัดคุย" },
      { key: "meetTime", label: "เวลา", value: เวลานัด, ข้อความ: "ต้องระบุเวลานัดคุย" },
      { key: "meetPlace", label: "สถานที่", value: สถานที่, ข้อความ: "ต้องระบุสถานที่นัดคุย" },
    ] : [
      { key: "channel", label: "ช่องทาง", value: channel, ข้อความ: "ต้องเลือกช่องทางที่ติดต่อ" },
      { key: "body", label: "คุยอะไรไป", value: body, ข้อความ: "ต้องบันทึกว่าคุยอะไรไป" },
    ])) return;
    // นัดคุย = บันทึกการติดต่อข้อความมาตรฐาน + วันติดตาม = วันนัด (ห้ามย้อนหลัง · ตัวตรวจเดิม)
    const ข้อความนัด = `นัดคุย ${fmtISOToThai(วันนัด)} เวลา ${เวลานัด} น. · สถานที่ ${สถานที่.trim()}${body.trim() ? ` · ${body.trim()}` : ""}`;
    const row = เตรียมบันทึกการติดต่อ({ prospectId: prospect.id, channel, body: โหมดนัดคุย ? ข้อความนัด : body, nextFollowUp: โหมดนัดคุย ? วันนัด : nextFollowUp });
    const ผิด = ตรวจบันทึกการติดต่อ(row, APP_NOW_ISO);
    if (ผิด) { setErr(ผิด); return; }
    setBusy(true); setErr("");
    try {
      await activitiesRepo.addContact(row);
      แจ้งสำเร็จ(โหมดนัดคุย ? "บันทึกนัดคุยแล้ว" : prospect.status === "new" ? "บันทึกการติดต่อแล้ว · ติ๊กงาน “ติดต่อครั้งแรก” ให้อัตโนมัติ" : "บันทึกการติดต่อแล้ว");
      setChannel(""); setBody(""); setNextFollowUp(""); setวันนัด(""); setเวลานัด(""); setสถานที่("");
      setFormOpen(false);
      onAdded();
      if (โหมดนัดคุย) await onนัดคุยแล้ว?.();
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
    text: แทนรหัส(ชื่อขั้นปัจจุบัน(a.kind === "contact" && a.nextFollowUp ? `${a.body} · นัดติดตาม ${fmtISOToThai(a.nextFollowUp)}` : a.body)),   // รหัสดีลเลอร์ → ชื่อ ตอนแสดง (6 พ.ย. 69)   // ชื่อขั้นเดิม → ใหม่ตอนแสดง
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
          <div style={{ fontSize: "0.8rem", fontWeight: 800, color: "#2D2D2D", marginBottom: 12 }}>{โหมดนัดคุย ? "บันทึกนัดคุย" : "บันทึกการติดต่อ"} · {prospect.name}</div>
          {err && <div role="alert" style={{ fontSize: "0.74rem", color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "7px 10px", marginBottom: 10 }}>{err}</div>}
          <fieldset disabled={busy} style={{ border: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
            <div>
              <FieldLabel htmlFor="pc-channel" required>ช่องทาง</FieldLabel>
              <select id="pc-channel" className="form-select" value={channel} {...บังคับ.ผูก("channel")}
                onChange={e => { บังคับ.ล้าง("channel"); setChannel(e.target.value); }} style={{ cursor: "pointer", ...(บังคับ.ผิด.channel ? กรอบผิด : null) }}>
                <option value="">— ยังไม่ระบุ —</option>
                {ช่องทาง.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <FieldError>{บังคับ.ผิด.channel}</FieldError>
            </div>
            {โหมดนัดคุย && (<>
              <div>
                <FieldLabel htmlFor="pc-meet-date" required>วันที่นัด</FieldLabel>
                <input id="pc-meet-date" className="form-input" type="date" min={APP_NOW_ISO} value={วันนัด} {...บังคับ.ผูก("meetDate")}
                  onChange={e => { บังคับ.ล้าง("meetDate"); setวันนัด(e.target.value); }} style={บังคับ.ผิด.meetDate ? กรอบผิด : undefined} />
                <FieldError>{บังคับ.ผิด.meetDate}</FieldError>
              </div>
              <div>
                <FieldLabel htmlFor="pc-meet-time" required>เวลา</FieldLabel>
                <input id="pc-meet-time" className="form-input" type="time" value={เวลานัด} {...บังคับ.ผูก("meetTime")}
                  onChange={e => { บังคับ.ล้าง("meetTime"); setเวลานัด(e.target.value); }} style={บังคับ.ผิด.meetTime ? กรอบผิด : undefined} />
                <FieldError>{บังคับ.ผิด.meetTime}</FieldError>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <FieldLabel htmlFor="pc-meet-place" required>สถานที่</FieldLabel>
                <input id="pc-meet-place" className="form-input" value={สถานที่} placeholder="เช่น สำนักงานผู้สนใจ · ออนไลน์ (LINE/Zoom)" {...บังคับ.ผูก("meetPlace")}
                  onChange={e => { บังคับ.ล้าง("meetPlace"); setสถานที่(e.target.value); }} style={บังคับ.ผิด.meetPlace ? กรอบผิด : undefined} />
                <FieldError>{บังคับ.ผิด.meetPlace}</FieldError>
              </div>
            </>)}
            {!โหมดนัดคุย && <div>
              <label className="form-label" htmlFor="pc-next">นัดติดตามครั้งถัดไป</label>
              <input id="pc-next" className="form-input" type="date" min={APP_NOW_ISO} value={nextFollowUp} onChange={e => setNextFollowUp(e.target.value)} />
              <div style={{ fontSize: "0.66rem", color: "#6b7280", marginTop: 3 }}>
                {prospect.followUp && nextFollowUp === prospect.followUp ? "ใช้วันที่ตั้งไว้เดิม — แก้ได้ถ้านัดใหม่" : "ไม่บังคับ · ใส่แล้ววันนัดของรายนี้เปลี่ยนตาม"}
              </div>
            </div>}
            <div style={{ gridColumn: "1 / -1" }}>
              {โหมดนัดคุย ? <label className="form-label" htmlFor="pc-body">รายละเอียดเพิ่มเติม</label> : <FieldLabel htmlFor="pc-body" required>คุยอะไรไป</FieldLabel>}
              <textarea id="pc-body" className="form-input" rows={3} value={body} {...บังคับ.ผูก("body")} onChange={e => { บังคับ.ล้าง("body"); setBody(e.target.value); }}
                placeholder="เช่น สนใจเป็นดีลเลอร์ ขอข้อมูลค่าแรกเข้า นัดคุยอีกครั้งสัปดาห์หน้า" style={{ resize: "vertical", ...(บังคับ.ผิด.body ? กรอบผิด : null) }} />
              <FieldError>{บังคับ.ผิด.body}</FieldError>
            </div>
          </fieldset>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => { setFormOpen(false); setErr(""); onยกเลิก?.(); }}>ยกเลิก</button>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void บันทึก()}>{busy ? "กำลังบันทึก…" : โหมดนัดคุย ? "บันทึกนัดคุย" : "บันทึกการติดต่อ"}</button>
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
