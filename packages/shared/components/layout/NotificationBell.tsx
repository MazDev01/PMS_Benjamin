"use client";
// ── กระดิ่งแจ้งเตือน (ใบ 0231 · บอสสั่ง 21 ต.ค. 69 รอบ 4) ───────────────────────────────────────────
//
// แสดงเฉพาะแจ้งเตือนจากตารางกลางที่ฐานสร้าง (useNotifications) — เรื่องที่คนรับต้องทำอะไรต่อเท่านั้น
//   ดีลเลอร์: HQ ส่งราคา · ราคา HQ ใกล้หมด/หมดอายุ · ใบส่งลูกค้าใกล้หมดอายุ · นัดวันนี้ · HQ ส่งลีด/ย้อนการปิดการขาย
//   HQ: คำขอใหม่ · ขอแก้ราคา · คำขอค้างเกิน 14 วัน (สรุปวันละครั้ง) · ลูกค้าตอบรับ · ใบค่าแฟรนไชส์เกินกำหนดชำระ
//       · ยกเลิกคำขอ · ผู้สนใจถึงกำหนดติดตาม/ไม่ได้ติดต่อนาน · ใบค่าแฟรนไชส์รอคำตอบนาน/เลยวันมีผล (ใบ 0236 คืนตาม FLOW)
// ⚠️ ห้ามประกอบแจ้งเตือนเองที่นี่ (จากลีด/ใบ/บันทึกการใช้งาน) — เพิ่มเรื่องใหม่ต้องเพิ่มแถวในตารางกลาง + FLOW
//    ตัวตรวจ scripts/check-notification-catalog.mjs ตกถ้าไฟล์นี้ดึงข้อมูลอื่นมาทำแจ้งเตือน
//
// กดเรื่อง = เปิดตรงเรื่องนั้น (href จากตารางกลาง) · อยู่หน้าเดิมอยู่แล้ว = โหลดหน้าใหม่ให้เปิดจาก ?open=
// อ่านแล้ว/ยังไม่อ่าน จำต่อบัญชีในเบราว์เซอร์ (useReadNotifications) · เรื่องก่อนวันเริ่มใช้ถือว่าอ่านแล้ว
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, FileText, AlertTriangle, CalendarClock, CheckCircle2, Inbox, RotateCcw, Wallet, Clock, XCircle } from "lucide-react";
import { useNotifications } from "@pms/shared/lib/useNotifications";
import { useReadNotifications } from "@pms/shared/lib/useReadNotifications";
import { confirmDiscard } from "@pms/shared/lib/useUnsavedGuard";
import { APP_NOW } from "@pms/shared/context/FilterContext";
import { PRIMARY, STEEL } from "@pms/shared/lib/theme";
import type { AppNotification } from "@pms/shared/lib/data/types";

const BORDER = "#e5e7eb";
const BG = "#fafafa";
const แสดงก่อน = 8;

// ไอคอน/สีตามชนิด (หน้าตาเท่านั้น · ชนิดที่ไม่รู้จักใช้ไอคอนกระดิ่ง)
const ICON: Record<string, { el: React.ReactNode; bg: string; color: string }> = {
  hq_quote_sent:             { el: <FileText size={14} />,      bg: "#dcfce7", color: "#166534" },
  hq_quote_expiring:         { el: <Clock size={14} />,         bg: "#fef3c7", color: "#b45309" },
  hq_quote_expired:          { el: <AlertTriangle size={14} />, bg: "#fee2e2", color: "#dc2626" },
  quote_expiring:            { el: <Clock size={14} />,         bg: "#fef3c7", color: "#b45309" },
  appointment_due:           { el: <CalendarClock size={14} />, bg: "#dce5f0", color: "#003366" },
  lead_from_hq:              { el: <Inbox size={14} />,         bg: "#dce5f0", color: "#003366" },
  won_reverted:              { el: <RotateCcw size={14} />,     bg: "#fee2e2", color: "#dc2626" },
  request_new:               { el: <Inbox size={14} />,         bg: "#dce5f0", color: "#003366" },
  request_reprice:           { el: <RotateCcw size={14} />,     bg: "#fef3c7", color: "#b45309" },
  requests_overdue:          { el: <AlertTriangle size={14} />, bg: "#fee2e2", color: "#dc2626" },
  customer_accepted:         { el: <CheckCircle2 size={14} />,  bg: "#d1fae5", color: "#059669" },
  franchise_payment_overdue: { el: <Wallet size={14} />,        bg: "#fee2e2", color: "#dc2626" },
  request_cancelled:         { el: <XCircle size={14} />,       bg: "#eef2f7", color: "#475569" },
  prospect_followup_due:     { el: <CalendarClock size={14} />, bg: "#fff3cd", color: "#d97706" },
  prospect_idle:             { el: <AlertTriangle size={14} />, bg: "#fff3cd", color: "#d97706" },
  proposal_awaiting:         { el: <Clock size={14} />,         bg: "#dce5f0", color: "#003366" },
  proposal_expired:          { el: <FileText size={14} />,      bg: "#fdecec", color: "#dc2626" },
};
const ICON_อื่น = { el: <Bell size={14} />, bg: "#eef2f7", color: "#475569" };

// วันที่ไทย (YYYY-MM-DD) ของเวลาที่ฐานจด — จัดกลุ่มวันนี้/เมื่อวาน และเทียบวันเริ่มใช้
const วันไทย = (at: string) => { const t = Date.parse(at); return Number.isFinite(t) ? new Date(t + 7 * 3_600_000).toISOString().slice(0, 10) : ""; };
const เวลาไทย = (at: string) => {
  const t = Date.parse(at); if (!Number.isFinite(t)) return "";
  const d = new Date(t + 7 * 3_600_000);
  const เดือน = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."][d.getUTCMonth()];
  return `${d.getUTCDate()} ${เดือน} ${d.getUTCFullYear() + 543} · ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} น.`;
};
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const วันนี้ = iso(APP_NOW);
const เมื่อวาน = (() => { const d = new Date(APP_NOW); d.setDate(d.getDate() - 1); return iso(d); })();
const กลุ่มของ = (วัน: string) => วัน === วันนี้ ? "วันนี้" : วัน === เมื่อวาน ? "เมื่อวาน" : "ก่อนหน้า";
const กุญแจ = (n: AppNotification) => `n:${n.id}`;

export function NotificationBell({ scope, open, onOpenChange }: {
  /** บัญชีที่จำว่าอ่านแล้ว ("hq" หรือรหัสสาขา) */
  scope: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [ทั้งหมด, setทั้งหมด] = useState(false);
  const items = useNotifications(!!scope, open);
  const { isRead, markRead } = useReadNotifications(scope, วันนี้);

  const close = useCallback(() => { onOpenChange(false); setทั้งหมด(false); }, [onOpenChange]);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, close]);

  const rows = useMemo(() => items.map(n => ({ n, วัน: วันไทย(n.createdAt) })), [items]);
  const อ่านแล้ว = (r: { n: AppNotification; วัน: string }) => isRead(กุญแจ(r.n), r.วัน);
  const unread = rows.filter(r => !อ่านแล้ว(r)).length;
  const shown = ทั้งหมด ? rows : rows.slice(0, แสดงก่อน);

  async function เปิด(n: AppNotification) {
    if (!(await confirmDiscard())) return;
    markRead([กุญแจ(n)]);
    close();
    // อยู่หน้าเดิมอยู่แล้ว (เปลี่ยนแค่ ?open=) หน้าไม่โหลดใหม่ และบางหน้าไม่ได้ฟัง bpms:open-record
    //   → โหลดหน้าใหม่ทั้งหน้า ให้ทุกหน้าเปิดเรื่องจาก ?open= ทางเดียวกับมาจากหน้าอื่น (กดแล้วต้องเปิดตรงเรื่องเสมอ)
    if (new URL(n.href, window.location.origin).pathname === window.location.pathname) window.location.assign(n.href);
    else router.push(n.href);
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="icon-btn" aria-label="การแจ้งเตือน" onClick={() => onOpenChange(!open)}>
        <Bell size={18} strokeWidth={2} />
        {unread > 0 && (
          <span data-unread-count={unread} style={{
            position: "absolute", top: -2, right: -2, minWidth: 16, height: 16, padding: "0 4px",
            display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: 99, background: "#dc2626", color: "#fff",
            fontSize: "0.65rem", fontWeight: 800, lineHeight: 1, border: "2px solid #fff",
          }}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 10px)", right: 0, width: 380, maxWidth: "calc(100vw - 24px)", background: "#fff", borderRadius: 14, border: `1px solid ${BORDER}`, boxShadow: "0 16px 48px rgba(0,0,0,.16)", zIndex: 300, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: `1px solid ${BORDER}` }}>
            <span style={{ fontSize: "0.86rem", fontWeight: 800, color: STEEL }}>การแจ้งเตือน</span>
            <button onClick={() => markRead(items.map(กุญแจ))} style={{ fontSize: "0.72rem", color: PRIMARY, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>อ่านทั้งหมด</button>
          </div>
          <div style={{ maxHeight: 400, overflowY: "auto" }}>
            {rows.length === 0 && (
              <div style={{ padding: "28px 16px", textAlign: "center", fontSize: "0.8rem", color: "#9ca3af" }}>ไม่มีการแจ้งเตือน</div>
            )}
            {shown.map((r, i) => {
              const { n } = r;
              const ic = ICON[n.kind] ?? ICON_อื่น;
              const read = อ่านแล้ว(r);
              const กลุ่ม = กลุ่มของ(r.วัน);
              const เริ่มกลุ่ม = i === 0 || กลุ่มของ(shown[i - 1].วัน) !== กลุ่ม;
              return (
                <div key={n.id}>
                  {เริ่มกลุ่ม && (
                    <div style={{ padding: "9px 16px 4px", fontSize: "0.65rem", fontWeight: 800, color: "#9ca3af", letterSpacing: "0.05em", background: BG, borderBottom: `1px solid ${BG}` }}>{กลุ่ม}</div>
                  )}
                  <button data-notif-kind={n.kind} onClick={() => เปิด(n)}
                    style={{ display: "flex", alignItems: "flex-start", gap: 10, width: "100%", padding: "11px 16px", border: "none",
                      borderBottom: `1px solid ${BG}`, background: read ? "#fff" : "#f6f9ff", cursor: "pointer", textAlign: "left" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = BG; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = read ? "#fff" : "#f6f9ff"; }}>
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: "50%", background: ic.bg, color: ic.color, flexShrink: 0 }}>{ic.el}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: "0.8rem", fontWeight: 700, color: STEEL }}>{n.title}</span>
                        {!read && <span data-unread-dot style={{ width: 6, height: 6, borderRadius: "50%", background: "#dc2626", flexShrink: 0 }} />}
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "#6b7280", lineHeight: 1.4 }}>{n.body}</div>
                      <div style={{ fontSize: "0.65rem", color: "#9ca3af", marginTop: 3 }}>{เวลาไทย(n.createdAt)}</div>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
          {rows.length > แสดงก่อน && (
            <div style={{ padding: "10px 16px", borderTop: `1px solid ${BORDER}` }}>
              <button data-notif-more onClick={() => setทั้งหมด(v => !v)}
                style={{ width: "100%", padding: "7px", border: `1px solid ${BORDER}`, borderRadius: 9, background: "#fff", color: STEEL, fontSize: "0.72rem", fontWeight: 600, cursor: "pointer" }}>
                {ทั้งหมด ? "แสดงน้อยลง" : `ดูทั้งหมด (${rows.length})`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
