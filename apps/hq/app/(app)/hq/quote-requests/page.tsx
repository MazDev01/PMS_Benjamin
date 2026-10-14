"use client";

// ─── HQ · คำขอใบเสนอราคา (คิวของสำนักงานใหญ่ · FLOW.html ขั้น 4 · ด่าน 1) ────────────────────────────────────
//
// ขั้น 4: คำขอเข้าคิว HQ (อีเมลแจ้ง · เริ่มนับ 14 วัน) — ตารางสถานะ
//   แถว 2 "HQ กดรับเรื่อง" → กำลังทำราคา (ผู้รับผิดชอบ = ผู้กด) · ลูกค้าเป้าหมายของดีลเลอร์คงเดิม
//   แถว 3 "ครบ 14 วันยังไม่ส่งใบ" → ป้ายแดง เกินกำหนด (อีเมลถึงผู้รับของ HQ ส่งจากงานตั้งเวลา)
// ขั้น 5–6 (ด่าน 2): ปุ่ม "ทำใบ HQ" เปิดแผงทำ BOQ ด้วยราคาแม่แบบ → บันทึกร่าง → ส่งใบ (ล็อกเวอร์ชัน · หยุดนับ 14 วัน · อีเมลถึงดีลเลอร์)
//   คำขอที่ส่งใบแล้วเปิดดูใบได้แบบอ่านอย่างเดียว
// เรียงตามกำหนดส่งที่ใกล้สุดก่อน — คิวงานคือ "อะไรต้องทำก่อน" ไม่ใช่ "อะไรมาใหม่สุด" (ข้อยกเว้นของกติกาเรียงใหม่สุดก่อน: งานตามขั้น/ด่วน)
import { useCallback, useEffect, useMemo, useState } from "react";
import { Inbox, Search, X } from "lucide-react";
import { quoteRequests as repo, dealers as dealersRepo } from "@pms/shared/lib/data";
import {
  type QuoteRequest, quoteRequestStatusLabel, quoteRequestStatusColor, เกินกำหนด, วันไทยสั้น,
} from "@pms/shared/lib/quoteRequests";
import type { DealerRow } from "@pms/shared/lib/mock";
import { useRepoValue } from "@pms/shared/lib/useRepoState";
import { TablePagination, pageSlice } from "@pms/shared/components/ui/TablePagination";
import { แจ้งพลาด, แจ้งสำเร็จ } from "@pms/shared/components/ui/ConfirmToast";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { HqQuoteEditor } from "@pms/shared/components/hq/HqQuoteEditor";

export default function HQQuoteRequestsPage() {
  const [รายการ, setรายการ] = useState<QuoteRequest[] | null>(null);
  const [ค้นหา, setค้นหา] = useState("");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(0);
  const [เปิดใบ, setเปิดใบ] = useState<QuoteRequest | null>(null);
  const dealers = useRepoValue<DealerRow[]>(() => dealersRepo.list(), []);
  const ชื่อดีลเลอร์ = (c: string) => dealers.find(d => d.code === c)?.name ?? "";

  const โหลด = useCallback(() => {
    repo.listQueue().then(setรายการ).catch(e => { logRepoRead("quoteRequests.listQueue", e); setรายการ([]); });
  }, []);
  useEffect(โหลด, [โหลด]);

  const กรอง = useMemo(() => {
    const q = ค้นหา.trim().toLowerCase();
    return (รายการ ?? []).filter(r => !q || [r.requestNo, r.dealerCode, r.leadCompany ?? "", r.product, r.province].some(v => v.toLowerCase().includes(q)));
  }, [รายการ, ค้นหา]);
  useEffect(() => setPage(0), [ค้นหา]);

  const รับเรื่อง = async (r: QuoteRequest) => {
    setBusy(r.id);
    try { await repo.accept(r.id); แจ้งสำเร็จ(`รับเรื่อง ${r.requestNo} แล้ว`); โหลด(); }
    catch (e) { แจ้งพลาด(friendlyError(e)); }
    finally { setBusy(0); }
  };
  const เกิน = (รายการ ?? []).filter(r => เกินกำหนด(r)).length;

  return (
    <div className="erp">
      <div className="card hq-sticky-filter" style={{ marginBottom: 16 }}>
        <div className="card-body" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", paddingTop: 14, paddingBottom: 14 }}>
          <Inbox size={18} color="#003366" />
          <div style={{ fontSize: "0.84rem", color: "#374151" }}>
            คำขอที่ยังเปิดอยู่ <b>{(รายการ ?? []).length.toLocaleString()}</b> รายการ
            {เกิน > 0 && <span style={{ color: "#b91c1c", fontWeight: 700 }}> · เกินกำหนด {เกิน}</span>}
          </div>
          <div className="search-bar" style={{ marginLeft: "auto" }}>
            <Search size={14} />
            <input value={ค้นหา} onChange={e => setค้นหา(e.target.value)} placeholder="ค้นหาเลขคำขอ / ดีลเลอร์ / บริษัท / จังหวัด" aria-label="ค้นหาคำขอ" />
            {ค้นหา && <button type="button" onClick={() => setค้นหา("")} aria-label="ล้างคำค้น"><X size={13} /></button>}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="table-scroll">
          <table className="table" style={{ width: "100%" }}>
            <thead>
              <tr><th>เลขคำขอ</th><th>ดีลเลอร์</th><th>ลูกค้าเป้าหมาย</th><th>แม่แบบ</th><th>จังหวัด</th><th>สถานะ</th><th>กำหนดส่งใบ HQ</th><th>ผู้รับผิดชอบ</th><th style={{ width: 190 }}></th></tr>
            </thead>
            <tbody>
              {รายการ === null && <tr><td colSpan={9} style={{ textAlign: "center", color: "#9ca3af", padding: 24 }}>กำลังโหลด…</td></tr>}
              {รายการ !== null && กรอง.length === 0 && <tr><td colSpan={9} style={{ textAlign: "center", color: "#9ca3af", padding: 24 }}>ไม่มีคำขอที่ยังเปิดอยู่</td></tr>}
              {pageSlice(กรอง, page).map(r => {
                const c = quoteRequestStatusColor[r.status];
                return (
                  <tr key={r.id} aria-label={`${r.requestNo} ${r.leadCompany ?? ""}`}>
                    <td style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{r.requestNo}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{r.dealerCode} <span style={{ color: "#6b7280", fontSize: "0.76rem" }}>{ชื่อดีลเลอร์(r.dealerCode)}</span></td>
                    <td>{r.leadCompany || "—"}</td>
                    <td>{r.product}{r.subtype ? ` · ${r.subtype}` : ""}</td>
                    <td>{r.province || "—"}</td>
                    <td>
                      <span className="badge" style={{ background: c.bg, color: c.text }}>{quoteRequestStatusLabel[r.status]}</span>
                      {เกินกำหนด(r) && <span className="badge" style={{ marginLeft: 6, background: "#fee2e2", color: "#b91c1c" }}>เกินกำหนด</span>}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{r.status === "quoted" ? "—" : วันไทยสั้น(r.dueAt)}</td>
                    <td>{r.assigneeName || "—"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {r.status === "new" && (
                        <button type="button" className="btn btn-outline btn-sm" disabled={busy === r.id} onClick={() => void รับเรื่อง(r)} style={{ marginRight: 6 }}>รับเรื่อง</button>
                      )}
                      <button type="button" className={r.status === "quoted" ? "btn btn-outline btn-sm" : "btn btn-primary btn-sm"} onClick={() => setเปิดใบ(r)}>
                        {r.status === "quoted" ? "ดูใบ HQ" : "ทำใบ HQ"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <TablePagination page={page} total={กรอง.length} onPage={setPage} unit="คำขอ" />
      </div>

      {เปิดใบ && (
        <HqQuoteEditor request={เปิดใบ} dealerName={ชื่อดีลเลอร์(เปิดใบ.dealerCode)} onClose={() => setเปิดใบ(null)} onChanged={โหลด} />
      )}
    </div>
  );
}
