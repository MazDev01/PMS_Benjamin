"use client";

// ── เส้นทางการทำงานของผู้สนใจเป็นดีลเลอร์ — แบบเดียวกับ "งาน/ความคืบหน้า" ของดีลเลอร์ (LeadTasks) ──
//   บอสสั่ง 14 ก.ย. 69: "ให้มันทำงานแบบเดียวกับดีลเลอร์"
//
//   ติ๊กงานตามลำดับ → ขั้นเลื่อนเอง · % คิดจากงาน (ปรับเองไม่ได้)
//   งานที่ต้องมีของจริง (บันทึกการติดต่อ / ใบเสนอที่ส่งแล้ว) กดแล้วพาไปทำของจริงแทน ระบบติ๊กให้ทีหลัง
//   ปิดท้าย: ตั้งเป็นดีลเลอร์ / ไม่สำเร็จ (ต้องมีเหตุผล) / เปิดติดตามใหม่
//   กติกาชุดเดียวกับฐานข้อมูล (lib/prospectJourney.ts ↔ migration 0174)
import React, { useState } from "react";
import { Check, Lock, Store, XCircle, RotateCcw, Trophy } from "lucide-react";
import type { DealerProspect, DealerProspectStatus } from "@pms/shared/lib/data/types";
import { prospectStatusLabel, prospectStatusColor } from "@pms/shared/lib/dealerProspects";
import { งานมาตรฐาน, งานเสร็จแล้ว, ความคืบหน้า, ติ๊กงาน, ยกเลิกงาน, ลำดับขั้น } from "@pms/shared/lib/prospectJourney";
import { ชื่องานที่ใช้, type HQRecruitSettings } from "@pms/shared/lib/recruitSettings";
import { ถามเหตุผล } from "@pms/shared/components/ui/ConfirmToast";

const PRIMARY = "#003366";

export function ProspectJourney({ prospect, ขั้นก่อนปิด, มีบันทึกการติดต่อ, มีใบส่งแล้ว, editable, busy, onStage, onLost, onNeedContact, onNeedProposal, onConvert, ค่าตั้ง }: {
  prospect: DealerProspect;
  /** ชื่องาน + รายการเหตุผลที่ไม่สำเร็จ ที่ตั้งไว้ (หน้าตั้งค่า › หาดีลเลอร์) — ไม่ส่ง = ชื่อเดิม/พิมพ์เหตุผลเอง */
  ค่าตั้ง?: Pick<HQRecruitSettings, "taskLabels" | "lostReasons">;
  /** รายที่ไม่สำเร็จ: ขั้นก่อนปิด (ใช้แสดงงานที่ทำไปแล้ว + เปิดติดตามใหม่) */
  ขั้นก่อนปิด: DealerProspectStatus;
  มีบันทึกการติดต่อ: boolean;
  มีใบส่งแล้ว: boolean;
  editable: boolean;
  busy?: boolean;
  onStage: (next: DealerProspectStatus) => void;
  /** ไม่สำเร็จ (กล่องเหตุผลกลางรอฐาน · 28 ต.ค. 69) — ฐานปฏิเสธ = โยน error ให้กล่องแสดง */
  onLost: (lostReason: string) => Promise<unknown>;
  onNeedContact: () => void;
  onNeedProposal: () => void;
  onConvert: () => void;
}) {
  const [hint, setHint] = useState("");
  // ไม่สำเร็จ = กล่องเหตุผลกลาง (บอสสั่ง 28 ต.ค. 69) · มีรายการเหตุผลตั้งไว้ = เลือกจากรายการ (มี "อื่นๆ" ให้พิมพ์เอง) · ไม่มี = พิมพ์เอง
  const ไม่สำเร็จ = () => void ถามเหตุผล({
    หัวข้อ: `ปิด “${prospect.name}” ว่าไม่สำเร็จ ?`,
    รายละเอียด: "เปิดติดตามใหม่ได้ภายหลัง",
    ป้ายช่อง: "เหตุผลที่ไม่สำเร็จ", ตัวเลือก: ค่าตั้ง?.lostReasons ?? [],
    ปุ่มตกลง: "ยืนยันไม่สำเร็จ", ปุ่มกำลังทำ: "กำลังบันทึก…", อันตราย: true,
    ทำ: เหตุผล => onLost(เหตุผล),
  });
  const ชื่อ = (g: (typeof งานมาตรฐาน)[number]) => (ค่าตั้ง ? ชื่องานที่ใช้(ค่าตั้ง, g.key, g.label) : g.label);

  const status = prospect.status;
  const จบแล้ว = status === "won" || status === "lost";
  const ขั้นที่ใช้แสดง = status === "lost" ? ขั้นก่อนปิด : status;
  const pct = ความคืบหน้า(status);
  const สีแถบ = status === "lost" ? "#dc2626" : status === "won" ? "#059669" : PRIMARY;
  const ปิดปุ่ม = !editable || !!busy;

  function กดงาน(i: number) {
    if (ปิดปุ่ม || จบแล้ว) return;
    if (งานเสร็จแล้ว(status, i)) {
      const ผล = ยกเลิกงาน(status, i);
      if ("ผิด" in ผล) { setHint(ผล.ผิด); return; }
      setHint(""); onStage(ผล.ขั้นใหม่);
      return;
    }
    const ผล = ติ๊กงาน(status, i, { มีบันทึกการติดต่อ, มีใบส่งแล้ว });
    if ("ผิด" in ผล) { setHint(ผล.ผิด); return; }
    setHint("");
    if ("ต้องทำก่อน" in ผล) {
      if (ผล.ต้องทำก่อน === "contact") onNeedContact(); else onNeedProposal();
      return;
    }
    onStage(ผล.ขั้นใหม่);
  }

  return (
    <div>
      <div style={{ fontSize: "0.65rem", fontWeight: 800, letterSpacing: ".06em", color: PRIMARY, marginBottom: 12 }}>
        งานตามเส้นทาง · ติ๊กแล้วเลื่อนขั้นอัตโนมัติ
      </div>

      {/* ความคืบหน้า — คำนวณจากงาน (อ่านอย่างเดียว) */}
      <div style={{ background: "#f8f9fb", border: "1px solid #f0f4f8", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div>
            <span style={{ fontSize: "0.72rem", color: "#6b7280", fontWeight: 600 }}>สถานะปัจจุบัน</span>
            <div data-testid="journey-status" style={{ fontSize: "0.92rem", fontWeight: 800, color: สีแถบ }}>{prospectStatusLabel[status]}</div>
          </div>
          <div style={{ fontSize: "1.7rem", fontWeight: 800, color: สีแถบ, fontVariantNumeric: "tabular-nums" }}>{pct}%</div>
        </div>
        <div style={{ height: 10, background: "#e5e7eb", borderRadius: 999, overflow: "hidden" }}>
          <div className="bar-grow" style={{ height: "100%", width: `${pct}%`, borderRadius: 999, background: สีแถบ }} />
        </div>
        <div style={{ fontSize: "0.65rem", color: "#9ca3af", marginTop: 6 }}>
          คำนวณจากงานที่ทำ — เลื่อนขั้นอัตโนมัติเมื่อติ๊กงาน (ปรับ % เองไม่ได้)
        </div>
      </div>

      {hint && !จบแล้ว && (
        <div role="alert" style={{ display: "flex", alignItems: "center", gap: 7, background: "#fff7ed", border: "1px solid #fed7aa", color: "#b45309", borderRadius: 9, padding: "8px 11px", marginBottom: 10, fontSize: "0.72rem", fontWeight: 600 }}>
          <Lock size={13} /> {hint}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {งานมาตรฐาน.map((g, i) => {
          const เสร็จ = งานเสร็จแล้ว(ขั้นที่ใช้แสดง, i);
          const ตอนนี้ = ลำดับขั้น(ขั้นที่ใช้แสดง);
          const ล็อก = !จบแล้ว && !เสร็จ && ตอนนี้ < i;
          const ขั้นสี = prospectStatusColor[g.ไปขั้น];
          return (
            // ปุ่มงาน = ช่องติ๊กในสายตาผู้ใช้ — บอกสถานะให้โปรแกรมอ่านหน้าจอ (และเทสต์) ด้วย role/aria-checked
            <button key={g.key} type="button" role="checkbox" aria-checked={เสร็จ} aria-label={ชื่อ(g)}
              onClick={() => กดงาน(i)} disabled={จบแล้ว || ปิดปุ่ม}
              title={ล็อก ? "ทำงานก่อนหน้าให้ครบก่อน" : g.คำอธิบาย}
              style={{
                display: "flex", alignItems: "flex-start", gap: 11, width: "100%", textAlign: "left",
                padding: "10px 12px", borderRadius: 10, border: `1px solid ${เสร็จ ? "#bbf7d0" : ล็อก ? "#eceff3" : "#e5e7eb"}`,
                background: เสร็จ ? "#f0fdf4" : ล็อก ? "#fafbfc" : "#fff",
                cursor: จบแล้ว || ปิดปุ่ม ? "default" : ล็อก ? "not-allowed" : "pointer", fontFamily: "inherit",
                opacity: (จบแล้ว && !เสร็จ) || ล็อก ? 0.6 : 1,
              }}>
              <span style={{
                width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1,
                border: `2px solid ${เสร็จ ? "#059669" : ล็อก ? "#d5dbe3" : "#cbd5e1"}`, background: เสร็จ ? "#059669" : "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {เสร็จ ? <Check size={13} color="#fff" strokeWidth={3} /> : ล็อก ? <Lock size={11} color="#b6bfca" /> : null}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: "0.86rem", fontWeight: 600, color: เสร็จ ? "#065f46" : ล็อก ? "#9aa4b0" : "#2D2D2D", textDecoration: เสร็จ ? "line-through" : "none" }}>{ชื่อ(g)}</span>
                  <span className="badge" style={{ background: ขั้นสี.bg, color: ขั้นสี.text, border: "none", opacity: ล็อก ? 0.5 : 1 }}>→ {prospectStatusLabel[g.ไปขั้น]}</span>
                </span>
                <span style={{ display: "block", fontSize: "0.65rem", color: "#6b7280", marginTop: 2 }}>{g.คำอธิบาย}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* ปิดท้าย */}
      <div style={{ marginTop: 14, borderTop: "1px solid #eef0f4", paddingTop: 14 }}>
        {status === "won" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "12px 14px", borderRadius: 10, background: "#e5faf0" }}>
            <Trophy size={18} color="#059669" />
            <div style={{ fontSize: "0.86rem", fontWeight: 800, color: "#059669" }}>เป็นดีลเลอร์แล้ว{prospect.dealerCode ? ` · ${prospect.dealerCode}` : ""}</div>
          </div>
        ) : status === "lost" ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 14px", borderRadius: 10, background: "#fee2e2", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <XCircle size={18} color="#dc2626" />
              <div>
                <div style={{ fontSize: "0.86rem", fontWeight: 800, color: "#dc2626" }}>ปิดว่าไม่สำเร็จ</div>
                {prospect.lostReason && <div style={{ fontSize: "0.72rem", color: "#991b1b" }}>เหตุผล: {prospect.lostReason}</div>}
              </div>
            </div>
            {editable && (
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onStage(ขั้นก่อนปิด)}>
                <RotateCcw size={13} /> เปิดติดตามใหม่ ({prospectStatusLabel[ขั้นก่อนปิด]})
              </button>
            )}
          </div>
        ) : editable ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ flex: 1, fontSize: "0.8rem", fontWeight: 700, color: "#374151" }}>ปิดท้าย :</span>
            <button type="button" className="btn btn-sm" disabled={busy} onClick={onConvert} style={{ background: "#059669", color: "#fff" }}>
              <Store size={13} /> ตั้งเป็นดีลเลอร์
            </button>
            <button type="button" className="btn btn-sm" disabled={busy} onClick={ไม่สำเร็จ}
              style={{ background: "#fff", color: "#dc2626", border: "1px solid #fecaca" }}>
              <XCircle size={13} /> ไม่สำเร็จ
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
