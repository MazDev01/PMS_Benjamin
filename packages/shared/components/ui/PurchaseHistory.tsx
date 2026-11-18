"use client";
// ── ประวัติการซื้อของลูกค้า — ตัวกลางเดียว HQ + ดีลเลอร์ (บอสสั่ง 18 พ.ย. 69 · แทนแท็บ "อาคารที่ซื้อ") ───────────────────────────
//   รายการ = ใบที่ลูกค้าตอบรับ (won) ใหม่สุดก่อน · ยอดรวม = ผลรวมใบที่ตอบรับ
//   กดรายการ = หน้าต่างรายละเอียดงาน: งาน · พื้นที่ · จังหวัด · วันที่ตอบรับ · เลขใบ · ยอด + รายการที่ซื้อ (รายการในใบ)
//     + รูปแปลน/ไฟล์แนบของงาน (ไฟล์ที่แนบที่ลูกค้าเป้าหมายของงานนั้น · รูปดูได้ในหน้าต่าง) · ไม่มี = "—"
//   ระหว่างโหลด = "กำลังโหลด…" ไม่ใช่ว่างหลอก (บอสถาม 18 พ.ย. 69 "ทำไมไม่มีข้อมูล" — แผงเดิมขึ้น (0) ระหว่างโหลด)
//   ใช้ข้อมูลที่มีอยู่ (ใบ · ไฟล์ของสาขา) ไม่มีตารางใหม่ · ข้อทดสอบ purchase-history.spec
import { useEffect, useState } from "react";
import { History, X, MapPin, CalendarDays, Ruler, FileText, Wallet, Package, ImageIcon, Paperclip } from "lucide-react";
import type { QuotationMock, DealerFile } from "@pms/shared/lib/mock";
import { files as filesRepo, storage as storageRepo } from "@pms/shared/lib/data";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { fmtBaht } from "@pms/shared/lib/format";
import { toThaiDate } from "@pms/shared/lib/thaiDate";
import { ความกว้างหน้าต่าง } from "@pms/shared/lib/windowSize";
import { ModalCard } from "@pms/shared/components/ui/ModalCard";
import { DataLink } from "@pms/shared/components/ui/RecordLink";

const PRIMARY = "#003366";
const MUTED = "#6b7280";

/** วันที่ตอบรับของใบ (เวลาที่ฐานเก็บ · ไม่มี = วันที่ใบ) */
const วันตอบรับ = (q: QuotationMock): Date | null => {
  const t = q.wonAt ? new Date(q.wonAt) : q.date ? new Date(`${q.date.slice(0, 10)}T12:00:00+07:00`) : null;
  return t && !Number.isNaN(t.getTime()) ? t : null;
};
const เลขใบ = (q: QuotationMock) => q.id;
const ขีด = (v: string | number | null | undefined) => (v == null || v === "" || v === 0 ? "—" : v);

/** รายการประวัติการซื้อ — ใบ = null ระหว่างโหลด · ฝั่ง = ใครดู (HQ อ่านไฟล์ทั้งเครือ · ดีลเลอร์อ่านไฟล์ของสาขาตัวเอง) */
export function PurchaseHistory({ ใบ, ฝั่ง, เปิด: เปิดเอง }: {
  ใบ: QuotationMock[] | null; ฝั่ง: "hq" | "dealer";
  /** ดีลเลอร์: กดรายการ = หน้าต่างงานเดิมของแผงลูกค้า (มีไทม์ไลน์/หมายเหตุ/นัด · ใส่ส่วนไฟล์ของงานตัวกลางเดียวกัน) · ไม่ส่ง = หน้าต่างรายละเอียดงานตัวกลาง */
  เปิด?: (q: QuotationMock) => void;
}) {
  const [เปิด, setเปิด] = useState<QuotationMock | null>(null);
  if (ใบ == null) return <div data-purchase-loading style={{ fontSize: "0.78rem", color: MUTED, padding: "10px 2px" }}>กำลังโหลด…</div>;
  const ตอบรับ = ใบ.filter(q => q.status === "won").sort((a, b) => (วันตอบรับ(b)?.getTime() ?? 0) - (วันตอบรับ(a)?.getTime() ?? 0));
  if (!ตอบรับ.length) return <div data-purchase-empty style={{ fontSize: "0.78rem", color: MUTED, padding: "10px 2px" }}>ยังไม่มีงานที่ลูกค้าตอบรับ</div>;
  const รวม = ตอบรับ.reduce((s, q) => s + (q.totalValue || 0), 0);
  return (
    <div data-purchase-history style={{ background: "#fff", border: "1px solid #e9edf2", borderRadius: 12, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.78rem", fontWeight: 800, color: PRIMARY, marginBottom: 10 }}>
        <History size={14} /> ประวัติการซื้อ ({ตอบรับ.length.toLocaleString()} งาน)
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {ตอบรับ.map(q => {
          const ว = วันตอบรับ(q);
          return (
            <button key={q.id} type="button" data-purchase-row={q.id} onClick={() => (เปิดเอง ? เปิดเอง(q) : setเปิด(q))} aria-label={`ดูรายละเอียดงาน ${เลขใบ(q)}`}
              style={{ all: "unset", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 12px", border: "1px solid #e9edf2", borderRadius: 10 }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#1F2937" }}>{q.project || "—"}</span>
                <span style={{ display: "block", fontSize: "0.66rem", color: MUTED, marginTop: 2 }}>
                  {เลขใบ(q)} · ตอบรับ {ว ? toThaiDate(ว) : "—"}{q.area > 0 ? ` · ${q.area.toLocaleString()} ตร.ม.` : ""}
                </span>
              </span>
              <span style={{ fontSize: "0.8rem", fontWeight: 800, color: PRIMARY, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{fmtBaht(q.totalValue)}</span>
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #F1F5F9", display: "flex", justifyContent: "space-between", fontSize: "0.78rem", fontWeight: 800, color: PRIMARY }}>
        <span>รวมจากใบที่ลูกค้าตอบรับ</span><span data-purchase-total={รวม}>{fmtBaht(รวม)}</span>
      </div>
      {เปิด && <PurchaseDetail q={เปิด} ฝั่ง={ฝั่ง} onClose={() => setเปิด(null)} />}
    </div>
  );
}

const ส่วน = ({ icon: Icon, title, children }: { icon: typeof History; title: string; children: React.ReactNode }) => (
  <div style={{ background: "#fff", border: "1px solid #e9edf2", borderRadius: 12, padding: 14 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.78rem", fontWeight: 800, color: PRIMARY, marginBottom: 10 }}><Icon size={14} /> {title}</div>
    {children}
  </div>
);
const คู่ = ({ icon: Icon, l, v }: { icon: typeof History; l: string; v: React.ReactNode }) => (
  <div style={{ display: "grid", gridTemplateColumns: "130px minmax(0, 1fr)", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid #F1F5F9", fontSize: "0.78rem" }}>
    <span style={{ display: "flex", alignItems: "center", gap: 6, color: MUTED }}><Icon size={13} /> {l}</span>
    <span style={{ fontWeight: 700, color: "#1F2937", overflowWrap: "anywhere" }}>{v}</span>
  </div>
);
const เป็นรูป = (f: DealerFile) => f.ext === "png" || f.ext === "jpg";

/** หน้าต่างรายละเอียดงานที่ซื้อ (กลางจอ · กว้างเท่าหน้าต่างเอกสาร · ซ้อนบนแผงลูกค้า) */
function PurchaseDetail({ q, ฝั่ง, onClose }: { q: QuotationMock; ฝั่ง: "hq" | "dealer"; onClose: () => void }) {
  const ว = วันตอบรับ(q);
  const รายการ = q.lineItems ?? [];
  return (
    <>
      <div onClick={onClose} data-purchase-detail-backdrop style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 300 }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 301, display: "flex", alignItems: "center", justifyContent: "center", padding: 12, pointerEvents: "none" }}>
        <ModalCard onClose={onClose} label={`รายละเอียดงาน ${เลขใบ(q)}`}
          style={{ width: ความกว้างหน้าต่าง, maxWidth: "100%", maxHeight: "calc(100vh - 24px)", display: "flex", flexDirection: "column", background: "#F8FAFC", borderRadius: 18, overflow: "hidden", pointerEvents: "auto", boxShadow: "0 24px 70px rgba(0,0,0,.24)" }}>
          <div data-purchase-detail={q.id} style={{ display: "contents" }} />
          <div style={{ background: PRIMARY, color: "#fff", padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "0.95rem", fontWeight: 800 }}>{q.project || "งานที่ซื้อ"}</div>
              <div style={{ fontSize: "0.7rem", opacity: 0.85, marginTop: 2 }}>{q.customer} · {เลขใบ(q)}</div>
            </div>
            <button type="button" onClick={onClose} aria-label="ปิดหน้าต่าง" style={{ background: "rgba(255,255,255,.15)", border: "none", borderRadius: 8, padding: 6, color: "#fff", cursor: "pointer", display: "flex" }}><X size={16} /></button>
          </div>
          <div style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
            <ส่วน icon={FileText} title="รายละเอียดงาน">
              <คู่ icon={Package} l="งาน" v={ขีด(q.project)} />
              <คู่ icon={Ruler} l="พื้นที่" v={q.area > 0 ? `${q.area.toLocaleString()} ตร.ม.` : "—"} />
              <คู่ icon={MapPin} l="จังหวัด" v={ขีด(q.province)} />
              <คู่ icon={CalendarDays} l="วันที่ตอบรับ" v={ว ? toThaiDate(ว) : "—"} />
              <คู่ icon={FileText} l="เลขใบ" v={<DataLink เป้า={{ ชนิด: "quotation", รหัส: q.id }}>{เลขใบ(q)}</DataLink>} />
              <คู่ icon={Wallet} l="ยอด" v={fmtBaht(q.totalValue)} />
            </ส่วน>
            <ส่วน icon={Package} title={`รายการที่ซื้อ (${รายการ.length.toLocaleString()})`}>
              {รายการ.length ? (
                <div className="table-wrap fit">
                  <table data-purchase-items style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", fontSize: "0.76rem" }}>
                    <colgroup><col style={{ width: "6%" }} /><col style={{ width: "40%" }} /><col style={{ width: "12%" }} /><col style={{ width: "10%" }} /><col style={{ width: "15%" }} /><col style={{ width: "17%" }} /></colgroup>
                    <thead><tr style={{ color: MUTED, textAlign: "left" }}>
                      <th style={{ padding: "6px 4px" }}>ลำดับ</th><th style={{ padding: "6px 4px" }}>รายการ</th>
                      <th style={{ padding: "6px 4px", textAlign: "right" }}>จำนวน</th><th style={{ padding: "6px 4px" }}>หน่วย</th>
                      <th style={{ padding: "6px 4px", textAlign: "right" }}>ราคาต่อหน่วย</th><th style={{ padding: "6px 4px", textAlign: "right" }}>รวม</th>
                    </tr></thead>
                    <tbody>{รายการ.map((l, i) => (
                      <tr key={l.id ?? i} style={{ borderTop: "1px solid #F1F5F9" }}>
                        <td style={{ padding: "6px 4px" }}>{i + 1}</td>
                        <td style={{ padding: "6px 4px", overflowWrap: "anywhere" }}>{l.name || "—"}</td>
                        <td style={{ padding: "6px 4px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{l.qty.toLocaleString()}</td>
                        <td style={{ padding: "6px 4px" }}>{l.unit || "—"}</td>
                        <td style={{ padding: "6px 4px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtBaht(l.unitPrice)}</td>
                        <td style={{ padding: "6px 4px", textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtBaht(Math.round(l.qty * l.unitPrice * 100) / 100)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : <div style={{ fontSize: "0.78rem", color: MUTED }}>—</div>}
            </ส่วน>
            <JobAttachments q={q} ฝั่ง={ฝั่ง} />
          </div>
        </ModalCard>
      </div>
    </>
  );
}

/** รูปแปลน/ไฟล์แนบของงาน (ไฟล์ที่แนบที่ลูกค้าเป้าหมายของงาน) — ใช้ทั้งหน้าต่างตัวกลางและหน้าต่างงานของแผงลูกค้าดีลเลอร์ */
export function JobAttachments({ q, ฝั่ง }: { q: QuotationMock; ฝั่ง: "hq" | "dealer" }) {
  // ไฟล์ของงาน = ไฟล์ที่แนบที่ลูกค้าเป้าหมายของงานนี้ (ไฟล์ของสาขา source "lead" · recordId = เลขลีด) — undefined = กำลังโหลด
  const [ไฟล์, setไฟล์] = useState<DealerFile[] | null | undefined>(undefined);
  const [ลิงก์, setลิงก์] = useState<Record<number, string | null>>({});
  useEffect(() => {
    let alive = true;
    filesRepo.list(ฝั่ง === "hq" ? { isHQ: true } : { dealerCode: q.dealerCode })
      .then(ls => { if (alive) setไฟล์(ls.filter(f => f.dealerCode === q.dealerCode && (
        (q.dealId != null && f.source === "lead" && f.recordId === q.dealId)
        // ใบที่ไม่ผูกลูกค้าเป้าหมาย (ใบเก่า/นำเข้า): ไฟล์ที่แนบที่ลูกค้าของใบ และชื่อไฟล์มีเลขใบ
        || (f.source === "customer" && f.recordId === q.customerId && f.name.includes(q.id))))); })
      .catch(e => { logRepoRead("files.list(purchase)", e); if (alive) setไฟล์(null); });
    return () => { alive = false; };
  }, [q.id, q.dealId, q.customerId, q.dealerCode, ฝั่ง]);
  useEffect(() => {
    let alive = true;
    for (const f of (ไฟล์ ?? []).filter(x => x.storagePath)) {
      storageRepo.signedUrl(f.storagePath!).then(u => { if (alive) setลิงก์(m => ({ ...m, [f.id]: u })); })
        .catch(e => { logRepoRead("storage.signedUrl(purchase)", e); if (alive) setลิงก์(m => ({ ...m, [f.id]: null })); });
    }
    return () => { alive = false; };
  }, [ไฟล์]);
  return (
    <ส่วน icon={ImageIcon} title="รูปแปลน / ไฟล์แนบของงาน">
      {ไฟล์ === undefined ? <div style={{ fontSize: "0.78rem", color: MUTED }}>กำลังโหลด…</div>
        : ไฟล์ === null ? <div style={{ fontSize: "0.78rem", color: "#b91c1c" }}>โหลดไฟล์ไม่สำเร็จ</div>
        : !ไฟล์.length ? <div data-purchase-files-empty style={{ fontSize: "0.78rem", color: MUTED }}>—</div>
        : (
          <div data-purchase-files style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
            {ไฟล์.map(f => (
              <div key={f.id} data-purchase-file={f.name} style={{ border: "1px solid #e9edf2", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
                {เป็นรูป(f) && ลิงก์[f.id] ? (
                  <img src={ลิงก์[f.id]!} alt={f.name} style={{ display: "block", width: "100%", height: 160, objectFit: "contain", background: "#f8fafc" }} />
                ) : (
                  <div style={{ height: 70, display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", color: MUTED }}><Paperclip size={18} /></div>
                )}
                <div style={{ padding: "8px 10px", fontSize: "0.72rem" }}>
                  {ลิงก์[f.id] ? <a href={ลิงก์[f.id]!} target="_blank" rel="noreferrer" style={{ color: PRIMARY, fontWeight: 700 }}>{f.name}</a> : <span style={{ fontWeight: 700 }}>{f.name}</span>}
                  <div style={{ color: MUTED, marginTop: 2 }}>{f.category} · {f.size}</div>
                </div>
              </div>
            ))}
          </div>
        )}
    </ส่วน>
  );
}
