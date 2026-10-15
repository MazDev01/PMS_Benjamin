"use client";

// ── ภาพรวม HQ 3 กล่องตาม FLOW ช่วงที่ 3 "สิ่งที่ HQ เห็นในภาพรวม" (ด่าน 5) ───────────────────────────────────────
//   ตัวเลขทั้งหมดคิดที่ฐานข้อมูล (hq_overview · ใบ 0209) — ที่นี่แสดงอย่างเดียว ไม่คิดใหม่
//   ตัวเลข ณ ตอนนี้ ไม่ขึ้นกับตัวกรองช่วงเวลา/ดีลเลอร์ของหน้า (บอกไว้บนหัวการ์ด)
//   โหลดไม่ได้ = บอกตรง ๆ พร้อมปุ่มลองใหม่ ห้ามแสดงเป็นศูนย์
import React, { useCallback, useEffect, useState } from "react";
import { UserPlus, FileText, TrendingUp } from "lucide-react";
import { metrics as metricsRepo } from "@pms/shared/lib/data";
import type { HqOverview } from "@pms/shared/lib/hqOverview";
import { PROSPECT_STATUS_ORDER, prospectStatusLabel } from "@pms/shared/lib/dealerProspects";
import { fmtBaht } from "@pms/shared/lib/format";
import { friendlyError } from "@pms/shared/lib/friendlyError";

const PRIMARY = "#003366";
const MUTED = "#6b7280";
const ร้อยละ = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("th-TH", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);

// raw = ตัวเลขจริงใต้ข้อความที่ย่อแล้ว (เช่น ฿289.3M) — data-value ให้ผู้อ่านเครื่อง/ข้อทดสอบอ่านค่าเต็มได้
function แถว({ label, value, testid, tone, raw }: { label: string; value: React.ReactNode; testid?: string; tone?: "warn"; raw?: number | null }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: "0.8rem", padding: "5px 0", borderBottom: "1px solid #f1f3f6" }}>
      <span style={{ color: "#374151" }}>{label}</span>
      <span data-testid={testid} data-value={raw ?? undefined} style={{ fontWeight: 800, color: tone === "warn" ? "#b45309" : PRIMARY, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{value}</span>
    </div>
  );
}
function หัวย่อย({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: "0.68rem", fontWeight: 800, color: "#8a929c", letterSpacing: "0.04em", margin: "12px 0 4px" }}>{children}</div>;
}
function การ์ด({ title, Icon, label, children }: { title: string; Icon: typeof UserPlus; label: string; children: React.ReactNode }) {
  return (
    <section className="card" aria-label={label} style={{ marginBottom: 0, padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Icon size={16} color={PRIMARY} />
        <div className="card-title" style={{ margin: 0 }}>{title}</div>
      </div>
      {children}
    </section>
  );
}

export function HqOverviewBoxes() {
  const [o, setO] = useState<HqOverview | null>(null);
  const [err, setErr] = useState("");
  const โหลด = useCallback(async () => {
    try { setO(await metricsRepo.hqOverview()); setErr(""); }
    catch (e) { setErr(friendlyError(e, "โหลดภาพรวมไม่สำเร็จ")); }
  }, []);
  useEffect(() => { void โหลด(); }, [โหลด]);

  if (err) return (
    <div role="alert" className="card" style={{ marginBottom: "1.25rem", padding: 14, color: "#b91c1c", display: "flex", gap: 10, alignItems: "center" }}>
      {err} <button className="btn btn-secondary btn-sm" onClick={() => void โหลด()}>ลองใหม่</button>
    </div>
  );
  if (!o) return <div className="card" style={{ marginBottom: "1.25rem", padding: 14, color: MUTED, fontSize: "0.8rem" }}>กำลังโหลดภาพรวม…</div>;

  const { recruit: rc, requests: rq, sales: sl } = o;
  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <div style={{ fontSize: "0.7rem", color: MUTED, marginBottom: 6 }}>ภาพรวม ณ ตอนนี้ (ไม่ขึ้นกับตัวกรองช่วงเวลา/ดีลเลอร์ด้านบน)</div>
      <div className="hq-overview3" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.25rem", alignItems: "stretch" }}>
        <การ์ด title="หาดีลเลอร์ใหม่" Icon={UserPlus} label="ภาพรวม: หาดีลเลอร์ใหม่">
          <หัวย่อย>ผู้สนใจแต่ละขั้น</หัวย่อย>
          {PROSPECT_STATUS_ORDER.map(s => <แถว key={s} label={prospectStatusLabel[s]} value={rc.stages[s] ?? 0} testid={`ov-stage-${s}`} raw={rc.stages[s] ?? 0} />)}
          <หัวย่อย>ใบค่าแฟรนไชส์ที่รอตอบ</หัวย่อย>
          <แถว label={`${rc.proposalsWaiting.count} ใบ`} value={fmtBaht(rc.proposalsWaiting.amount)} testid="ov-proposals-waiting" raw={rc.proposalsWaiting.amount} />
          <span hidden data-testid="ov-proposals-waiting-count" data-value={rc.proposalsWaiting.count} />
          <หัวย่อย>จังหวัดที่มีลูกค้าเป้าหมายแต่ยังไม่มีดีลเลอร์ ({rc.provincesNoDealer.length})</หัวย่อย>
          {rc.provincesNoDealer.length === 0
            ? <div style={{ fontSize: "0.78rem", color: MUTED }}>—</div>
            : rc.provincesNoDealer.slice(0, 8).map(p => <แถว key={p.province} label={p.province} value={`${p.leads} ราย`} testid={`ov-province-${p.province}`} tone="warn" />)}
          {rc.provincesNoDealer.length > 8 && <div style={{ fontSize: "0.7rem", color: MUTED, marginTop: 4 }}>และอีก {rc.provincesNoDealer.length - 8} จังหวัด</div>}
        </การ์ด>

        <การ์ด title="คำขอใบเสนอราคา" Icon={FileText} label="ภาพรวม: คำขอใบเสนอราคา">
          <หัวย่อย>คิวงานแยกตามผู้รับผิดชอบ (ยังเปิดอยู่)</หัวย่อย>
          {rq.queue.length === 0
            ? <div style={{ fontSize: "0.78rem", color: MUTED }}>ไม่มีคำขอค้าง</div>
            : rq.queue.map(q => <แถว key={q.assignee ?? "—"} label={q.assignee ?? "ยังไม่มีผู้รับ"}
                value={`${q.open} คำขอ${q.overdue ? ` · เกิน ${q.overdue}` : ""}`} testid={`ov-queue-${q.assignee ?? "ไม่มีผู้รับ"}`} tone={q.overdue ? "warn" : undefined} />)}
          <หัวย่อย>ตัวชี้วัด</หัวย่อย>
          <แถว label="คำขอเกิน 14 วัน" value={rq.overdue} testid="ov-overdue" tone={rq.overdue ? "warn" : undefined} raw={rq.overdue} />
          <แถว label="เวลาตอบเฉลี่ย (ส่งคำขอ → ส่งใบ HQ)" value={rq.avgResponseDays == null ? "—" : `${rq.avgResponseDays.toLocaleString("th-TH", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} วัน`} testid="ov-avg-response" />
          <แถว label={`ใบ HQ ที่ปิดการขายได้ (${rq.closeRate.won} จาก ${rq.closeRate.won + rq.closeRate.lost})`} value={ร้อยละ(rq.closeRate.pct)} testid="ov-close-rate" />
          <แถว label={`อัตรายกเลิก (${rq.cancel.cancelled} จาก ${rq.cancel.total})`} value={ร้อยละ(rq.cancel.pct)} testid="ov-cancel-rate" />
          {rq.cancel.reasons.length > 0 && (
            <div data-testid="ov-cancel-reasons" style={{ fontSize: "0.72rem", color: MUTED, marginTop: 4 }}>
              เหตุผล: {rq.cancel.reasons.map(r => `${r.reason} ${r.count}`).join(" · ")}
            </div>
          )}
        </การ์ด>

        <การ์ด title="ยอดขายเครือข่าย" Icon={TrendingUp} label="ภาพรวม: ยอดขายเครือข่าย">
          <หัวย่อย>ยอดขาย</หัวย่อย>
          <แถว label="ยอดขาย HQ จากใบที่สั่งผลิต" value={fmtBaht(sl.hqOrdered)} testid="ov-hq-ordered" raw={sl.hqOrdered} />
          <แถว label="ยอดขายดีลเลอร์ให้ลูกค้า (ใบที่ลูกค้าตอบรับ)" value={fmtBaht(sl.dealerWon)} testid="ov-dealer-won" raw={sl.dealerWon} />
          <หัวย่อย>margin เฉลี่ยแต่ละดีลเลอร์ (ใบที่ทำจากใบ HQ)</หัวย่อย>
          {sl.marginByDealer.length === 0
            ? <div style={{ fontSize: "0.78rem", color: MUTED }}>—</div>
            : sl.marginByDealer.map(m => <แถว key={m.dealerCode} label={`${m.dealerCode} (${m.quotes} ใบ)`}
                value={`${ร้อยละ(m.pctOfSale)} ของราคาขาย · บวก ${ร้อยละ(m.pctOfCost)}`} testid={`ov-margin-${m.dealerCode}`} />)}
        </การ์ด>
      </div>
    </div>
  );
}
