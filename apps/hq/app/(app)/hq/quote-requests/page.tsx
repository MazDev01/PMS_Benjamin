"use client";

// ─── HQ · คำขอใบเสนอราคา แบบกล่องงาน (หน้า 5 · UI ตาม flow · บอสอนุมัติ 16 ต.ค. 69) ─────────────────────────────
//
// ปัญหาที่แก้: เดิมเป็นตารางยาว + หน้าต่างลอยทำใบ HQ — HQ ดูไม่ออกว่าอะไรต้องทำก่อน และต้องเปิด/ปิดหน้าต่างทีละคำขอ
// ตอนนี้ 2 ช่อง: ซ้าย = กล่องงาน 4 กลุ่ม (จำนวนคิดที่ฐาน · ใบ 0215 hq_quote_board) · ขวา = ใบ HQ ของคำขอที่เลือก ฝังในหน้า
//   ต้องตีราคา = ใหม่ + กำลังตีราคา · ส่งแล้ว รอดีลเลอร์ · สั่งผลิต · ปิด/ยกเลิก
//   ลำดับ + ป้ายของแถว (เกิน 14 วัน · ขอแก้ราคา · ร่างค้าง · ใหม่) มาจากฐาน — หน้านี้ไม่นับ/เรียงเอง
// บอสตัดสิน 19 ต.ค. 69:
//   • ไม่มีปุ่ม "รับเรื่อง" — "บันทึกร่าง" รับเรื่องให้เองทางเดียว (ฐานทำใน hq_quote_save)
//   • เข้าหน้าแล้วเปิดคำขอบนสุดให้ทันที — แค่เปิดดู ไม่เปลี่ยนสถานะ ไม่บันทึกอะไร
//   • (ทับโดยคำสั่ง 26 ต.ค. 69) ร่างที่พิมพ์ค้างห้ามหาย — สลับแถว/กลุ่มได้ทันทีไม่ต้องถาม ร่างเก็บไว้ที่หน้า (ร่างค้าง) แล้วคืนเมื่อกลับมา
//     ออกจากหน้า/ปิดแท็บขณะมีร่างค้าง = เตือนก่อน (useUnsavedGuard)
//   • ระหว่างบันทึก/ส่งใบ ห้ามเปลี่ยนแถวหรือกลุ่ม (เปลี่ยนระหว่างรอคำตอบ = ต้นเหตุข้อไม่นิ่งรอบก่อน ๆ)
// FLOW.html ขั้น 4–6: รับเรื่อง → ทำ BOQ → บันทึกร่าง → ส่งใบ (ล็อกเวอร์ชัน · หยุดนับ 14 วัน · อีเมลถึงดีลเลอร์) — ไม่เปลี่ยนขั้น H7–H9
// ให้ใช้ง่าย (บอสสั่ง 26 ต.ค. 69): แถวบนการ์ด 4 ใบ (ต้องตีราคา · เกิน 14 วัน · เวลาตอบเฉลี่ย · อัตรายกเลิก — คิดที่ฐาน ไม่ขึ้นกับคำค้น)
//   ปุ่มกรองแถวเดียว (เลื่อนแนวนอนจอแคบ) · ค้นหาเต็มความกว้าง · ซ่อนแถบเปลี่ยนหน้าเมื่อมีหน้าเดียว (เฉพาะหน้านี้ · ทับกติกา 13 ส.ค. 69)
//   แถวขึ้น "เหลือ X วัน / เกิน X วัน" แทนวันที่
import { useCallback, useEffect, useRef, useState } from "react";
import { Search, X, Inbox, ClipboardList, AlarmClock, Timer, Ban } from "lucide-react";
import { quoteRequests as repo, metrics as metricsRepo } from "@pms/shared/lib/data";
import {
  type QuoteBoard, type QuoteBoardGroup, type QuoteBoardRow, quoteBoardGroups, quoteBoardTag, วันไทยสั้น, เหลือหรือเกิน,
} from "@pms/shared/lib/quoteRequests";
import type { HqOverview } from "@pms/shared/lib/hqOverview";
import { TablePagination, pageSlice, ROWS_PER_PAGE } from "@pms/shared/components/ui/TablePagination";
import { KpiRow, KpiCard } from "@pms/shared/components/ui/KpiCard";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { useUnsavedGuard } from "@pms/shared/lib/useUnsavedGuard";
import { HqQuoteEditor, type ร่างใบHQ } from "@pms/shared/components/hq/HqQuoteEditor";

const ส้ม = "#b45309";
/** แถวในรายการ: ต้องตีราคา = นับถึงกำหนดส่งใบ HQ · ส่งแล้ว = นับถึงวันยืนราคา · กลุ่มปิด = วันที่ปิด (ไม่มีกำหนดให้นับ) */
const นับวัน = (r: QuoteBoardRow, g: QuoteBoardGroup) =>
  g === "todo" ? `กำหนดส่ง ${เหลือหรือเกิน(r.dueAt)}`
  : g === "quoted" ? (r.validUntil ? `ยืนราคา ${เหลือหรือเกิน(r.validUntil)}` : "ยืนราคา —")
  : `ปิดเมื่อ ${r.closedAt ? วันไทยสั้น(r.closedAt) : "—"}`;
const ร้อยละ = (v: number) => `${v.toLocaleString("th-TH", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

export default function HQQuoteRequestsPage() {
  const [กลุ่ม, setกลุ่ม] = useState<QuoteBoardGroup>("todo");
  const [พิมพ์, setพิมพ์] = useState("");
  const [ค้นหา, setค้นหา] = useState("");
  const [กล่อง, setกล่อง] = useState<QuoteBoard | null>(null);
  const [เลือก, setเลือก] = useState<QuoteBoardRow | null>(null);
  const [page, setPage] = useState(0);
  const [กำลังบันทึก, setกำลังบันทึก] = useState(false);
  const ล็อก = useRef(false);
  // ร่างที่พิมพ์ค้างของทุกคำขอ (คีย์ = เลขคำขอ) — สลับไปคำขออื่นแล้วกลับมา ร่างยังอยู่ (บอสสั่ง 26 ต.ค. 69)
  const ร่างค้าง = useRef(new Map<number, ร่างใบHQ>()).current;
  const [ใบนี้แก้ค้าง, setใบนี้แก้ค้าง] = useState(false);
  const ตั้งแก้ค้าง = useCallback((v: boolean) => setใบนี้แก้ค้าง(v), []);
  useUnsavedGuard(ใบนี้แก้ค้าง || ร่างค้าง.size > 0);
  // การ์ด 4 ใบ — ตัวเลขจากฐาน ไม่ขึ้นกับคำค้น/กลุ่มที่เลือก
  const [นับคิว, setนับคิว] = useState<QuoteBoard["counts"] | null | undefined>(undefined);
  const [ภาพรวม, setภาพรวม] = useState<HqOverview["requests"] | null | undefined>(undefined);
  const โหลดการ์ด = useCallback(() => {
    repo.board("todo", "").then(b => setนับคิว(b.counts)).catch(e => { logRepoRead("quoteRequests.board(kpi)", e); setนับคิว(null); });
    metricsRepo.hqOverview().then(o => setภาพรวม(o.requests)).catch(e => { logRepoRead("metrics.hqOverview", e); setภาพรวม(null); });
  }, []);
  useEffect(() => โหลดการ์ด(), [โหลดการ์ด]);
  const ตั้งกำลังบันทึก = useCallback((v: boolean) => { ล็อก.current = v; setกำลังบันทึก(v); }, []);

  // มาจากกระดิ่ง (ใบ 0231): ?open=เลขคำขอ = เปิดใบของคำขอนั้นตรง ๆ (หากลุ่มที่คำขออยู่ให้เอง)
  //   ?overdue=1 (สรุปคำขอค้างเกิน 14 วัน) = กลุ่ม "ต้องตีราคา" ซึ่งเรียงคำขอเกินกำหนดไว้บนสุด
  //   ?q=คำค้น (ลิงก์รุ่นก่อน) = เติมช่องค้นหา · อยู่หน้านี้อยู่แล้วกดกระดิ่งอีก = ฟัง bpms:open-record
  const เปิดจากลิงก์ = useCallback(async (search: string) => {
    const u = new URLSearchParams(search);
    const q = u.get("q"), open = Number(u.get("open")), overdue = u.get("overdue");
    if (!q && !open && !overdue) return;
    window.history.replaceState(null, "", window.location.pathname);
    if (q) { setพิมพ์(q); return; }
    if (!ออกจากใบได้()) return;
    setพิมพ์("");
    if (overdue) { setเลือก(null); setกลุ่ม("todo"); return; }
    for (const g of quoteBoardGroups) {
      const b = await repo.board(g.key, "").catch(e => { logRepoRead("quoteRequests.board", e); return null; });
      const r = b?.rows.find(x => x.id === open);
      if (r) { setเลือก(r); setกลุ่ม(g.key); return; }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void เปิดจากลิงก์(window.location.search); }, [เปิดจากลิงก์]);
  useEffect(() => {
    const on = (e: Event) => {
      const href = String((e as CustomEvent).detail ?? "");
      if (href.startsWith("/hq/quote-requests?")) void เปิดจากลิงก์(href.slice(href.indexOf("?")));
    };
    window.addEventListener("bpms:open-record", on);
    return () => window.removeEventListener("bpms:open-record", on);
  }, [เปิดจากลิงก์]);
  // คำค้นส่งไปฐานหลังหยุดพิมพ์ (ฐานกรองทั้งจำนวนและรายการด้วยคำเดียวกัน)
  useEffect(() => { const t = setTimeout(() => setค้นหา(พิมพ์.trim()), 250); return () => clearTimeout(t); }, [พิมพ์]);
  useEffect(() => setPage(0), [ค้นหา, กลุ่ม]);

  const โหลด = useCallback(() => {
    let alive = true;
    repo.board(กลุ่ม, ค้นหา).then(b => {
      if (!alive) return;
      setกล่อง(b);
      // คงคำขอที่เปิดอยู่ไว้เสมอ (ข้อมูลล่าสุดจากฐานถ้ายังอยู่ในกลุ่ม) — ห้ามสลับใบเงียบ ๆ
      //   เช่น ส่งใบแล้วคำขอย้ายไปกลุ่ม "รอดีลเลอร์" = ยังเห็นใบที่เพิ่งส่ง (ล็อกแล้ว) ไม่เด้งไปคำขออื่น
      //   เปิดแถวบนสุดให้เฉพาะตอนยังไม่ได้เปิดอะไร (เข้าหน้า · เปลี่ยนกลุ่ม) — แค่เปิดดู ไม่เปลี่ยนสถานะ
      setเลือก(prev => b.rows.find(r => r.id === prev?.id) ?? prev ?? b.rows[0] ?? null);
    }).catch(e => { logRepoRead("quoteRequests.board", e); if (alive) setกล่อง({ counts: { todo: 0, overdue: 0, quoted: 0, won: 0, closed: 0 }, rows: [] }); });
    return () => { alive = false; };
  }, [กลุ่ม, ค้นหา]);
  useEffect(() => โหลด(), [โหลด]);
  const เมื่อเปลี่ยน = useCallback(() => { โหลด(); โหลดการ์ด(); }, [โหลด, โหลดการ์ด]);

  /** ออกจากใบที่เปิดอยู่ได้ไหม — กำลังบันทึก = ไม่ได้ · ร่างค้างไม่ต้องถาม (เก็บไว้ใน ร่างค้าง แล้ว) */
  const ออกจากใบได้ = (): boolean => !ล็อก.current;
  const เปิดแถว = (r: QuoteBoardRow) => {
    if (r.id === เลือก?.id) return;
    if (ออกจากใบได้()) setเลือก(r);
  };
  const เปลี่ยนกลุ่ม = (g: QuoteBoardGroup) => {
    if (g === กลุ่ม) return;
    if (ออกจากใบได้()) { setเลือก(null); setกลุ่ม(g); }
  };

  const แถว = กล่อง?.rows ?? [];
  return (
    <div className="erp">
      {/* การ์ด 4 ใบ (บอสสั่ง 26 ต.ค. 69) — เวลาตอบเฉลี่ย · อัตรายกเลิก = ผลงานของ HQ เอง ทั้งหมด (hq_overview 0209)
          ไม่มีข้อมูล = "—" พร้อมเหตุผล (ห้าม 0 หลอก) · กดแล้วเปิดกลุ่มที่ตรงเรื่อง */}
      <div data-testid="request-stats">
        <KpiRow label="สรุปคำขอใบเสนอราคา">
          <KpiCard kpi="todo" label="ต้องตีราคา" icon={ClipboardList} color="#b45309" bg="#fff4e5"
            value={นับคิว == null ? null : นับคิว.todo.toLocaleString()} rawValue={นับคิว?.todo} unit="คำขอ · ใหม่ + กำลังตีราคา"
            empty={นับคิว === null ? "โหลดตัวเลขไม่สำเร็จ" : "กำลังโหลด…"} onClick={() => เปลี่ยนกลุ่ม("todo")} testId="kpi-todo" />
          <KpiCard kpi="overdue" label="เกิน 14 วัน" icon={AlarmClock} color="#dc2626" bg="#fdecec" danger={(นับคิว?.overdue ?? 0) > 0}
            value={นับคิว == null ? null : นับคิว.overdue.toLocaleString()} rawValue={นับคิว?.overdue} unit="คำขอ · เลยกำหนดส่งใบ HQ (อยู่บนสุดของรายการ)"
            empty={นับคิว === null ? "โหลดตัวเลขไม่สำเร็จ" : "กำลังโหลด…"} onClick={() => เปลี่ยนกลุ่ม("todo")} testId="kpi-overdue" />
          <KpiCard kpi="avg-response" label="เวลาตอบเฉลี่ย" icon={Timer} color="#0891B2" bg="#E6F4F9"
            value={ภาพรวม?.avgResponseDays == null ? null : `${ภาพรวม.avgResponseDays.toLocaleString("th-TH", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} วัน`}
            rawValue={ภาพรวม?.avgResponseDays} unit="ส่งคำขอ → ส่งใบ HQ · ทั้งหมด"
            empty={ภาพรวม === undefined ? "กำลังโหลด…" : ภาพรวม === null ? "โหลดตัวเลขไม่สำเร็จ" : "ยังไม่มีคำขอที่ส่งใบ HQ แล้ว"}
            onClick={() => เปลี่ยนกลุ่ม("quoted")} testId="request-avg-days" />
          <KpiCard kpi="cancel-rate" label="อัตรายกเลิกคำขอ" icon={Ban} color="#7C3AED" bg="#F0EBFB"
            value={ภาพรวม?.cancel.pct == null ? null : ร้อยละ(ภาพรวม.cancel.pct)} rawValue={ภาพรวม?.cancel.pct} unit="ดีลเลอร์ยกเลิกเอง · ทั้งหมด"
            sub={ภาพรวม ? <>({ภาพรวม.cancel.cancelled.toLocaleString()} จาก {ภาพรวม.cancel.total.toLocaleString()}){ภาพรวม.cancel.reasons[0] ? <span data-testid="request-cancel-reasons"> · เหตุผลหลัก {ภาพรวม.cancel.reasons[0].reason}</span> : null}</> : null}
            empty={ภาพรวม === undefined ? "กำลังโหลด…" : ภาพรวม === null ? "โหลดตัวเลขไม่สำเร็จ" : "ยังไม่มีคำขอ"}
            onClick={() => เปลี่ยนกลุ่ม("closed")} testId="request-cancel-pct" />
        </KpiRow>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 440px) minmax(0, 1fr)", gap: 16, alignItems: "start" }} className="hq-qr-board">
        {/* ── ซ้าย: กล่องงาน ── */}
        <section aria-label="กล่องคำขอราคา" className="card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "16px 16px 12px", display: "grid", gap: 12, borderBottom: "1px solid #e5e7eb" }}>
            <div role="tablist" aria-label="กรองตามสถานะ" className="hq-qr-tabs">
              {quoteBoardGroups.map(g => {
                const on = g.key === กลุ่ม;
                const n = กล่อง?.counts[g.key];
                return (
                  <button key={g.key} type="button" role="tab" aria-selected={on} disabled={กำลังบันทึก} onClick={() => เปลี่ยนกลุ่ม(g.key)}
                    style={{ height: 36, padding: "0 12px", borderRadius: 99, border: on ? "none" : "1px solid #cbd2d9", background: on ? ส้ม : "#fff",
                      color: on ? "#fff" : "#1f2933", fontFamily: "inherit", fontSize: "0.8rem", fontWeight: on ? 700 : 500, cursor: "pointer", whiteSpace: "nowrap" }}>
                    {g.label} · {n == null ? "…" : n.toLocaleString()}
                  </button>
                );
              })}
            </div>
            {กลุ่ม === "todo" && (กล่อง?.counts.overdue ?? 0) > 0 && (
              <div style={{ fontSize: "0.78rem", color: "#b91c1c", fontWeight: 700 }}>เกินกำหนด 14 วัน {กล่อง!.counts.overdue.toLocaleString()} คำขอ — อยู่บนสุดของรายการ</div>
            )}
            <div className="search-bar hq-qr-search">
              <Search size={14} />
              <input value={พิมพ์} onChange={e => setพิมพ์(e.target.value)} placeholder="ค้นหาเลขคำขอ ดีลเลอร์ ลูกค้า งาน จังหวัด" aria-label="ค้นหาคำขอ" title="ค้นหาเลขคำขอ / ดีลเลอร์ / ลูกค้าเป้าหมาย / งาน / จังหวัด" />
              {พิมพ์ && <button type="button" onClick={() => setพิมพ์("")} aria-label="ล้างคำค้น"><X size={13} /></button>}
            </div>
          </div>

          <ul aria-label="รายการคำขอ" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {กล่อง === null && <li style={{ padding: 24, textAlign: "center", color: "#9ca3af", fontSize: "0.84rem" }}>กำลังโหลด…</li>}
            {กล่อง !== null && แถว.length === 0 && (
              <li style={{ padding: 28, textAlign: "center", color: "#9ca3af", fontSize: "0.84rem" }}>
                <Inbox size={22} style={{ display: "block", margin: "0 auto 6px" }} />
                {ค้นหา ? "ไม่พบคำขอที่ตรงกับคำค้น" : "ไม่มีคำขอในกลุ่มนี้"}
              </li>
            )}
            {pageSlice(แถว, page).map(r => {
              const t = quoteBoardTag[r.tag];
              const on = เลือก?.id === r.id;
              return (
                <li key={`${r.dealerCode}-${r.id}`} style={{ borderBottom: "1px solid #f0f2f4" }}>
                  <button type="button" disabled={กำลังบันทึก && !on} onClick={() => เปิดแถว(r)} aria-current={on ? "true" : undefined} aria-label={`${r.requestNo} ${r.leadCompany}`}
                    style={{ width: "100%", textAlign: "left", display: "grid", gap: 3, padding: "12px 16px", border: "none", cursor: "pointer", fontFamily: "inherit",
                      borderLeft: `4px solid ${on ? ส้ม : t.bar}`, background: on ? "#fff4e5" : t.bg }}>
                    <span style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: "0.88rem", fontWeight: 700, color: "#1f2933" }}>
                      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.dealerCode} · {r.leadCompany || "—"}</span>
                      <span style={{ color: t.color, fontSize: "0.76rem", whiteSpace: "nowrap" }}>{t.label}</span>
                    </span>
                    <span style={{ fontSize: "0.78rem", color: "#52606d" }}>
                      {r.requestNo} · {r.product}{r.subtype ? ` · ${r.subtype}` : ""} ·{" "}
                      <b data-testid="row-countdown" style={{ fontWeight: 700, color: r.tag === "overdue" ? "#b91c1c" : "#52606d" }}>{นับวัน(r, กลุ่ม)}</b>
                      {ร่างค้าง.has(r.id) && <span style={{ marginLeft: 6, color: "#92400e", fontWeight: 700 }}>· ร่างยังไม่บันทึก</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {/* หน้าเดียว = ไม่ต้องมีแถบเปลี่ยนหน้า (บอสสั่ง 26 ต.ค. 69 · เฉพาะหน้านี้) */}
          {แถว.length > ROWS_PER_PAGE && <TablePagination page={page} total={แถว.length} onPage={setPage} unit="คำขอ" />}
        </section>

        {/* ── ขวา: ใบ HQ ของคำขอที่เลือก (ฝังในหน้า) ── */}
        <div style={{ minWidth: 0 }}>
          {เลือก ? (
            <HqQuoteEditor key={เลือก.id} inline request={เลือก} dealerName={เลือก.dealerName} onClose={() => setเลือก(null)} onChanged={เมื่อเปลี่ยน}
              onDirtyChange={ตั้งแก้ค้าง} onBusyChange={ตั้งกำลังบันทึก} ร่างค้าง={ร่างค้าง} />
          ) : (
            <div className="card" style={{ padding: 40, textAlign: "center", color: "#9ca3af", fontSize: "0.86rem" }}>
              เลือกคำขอทางซ้ายเพื่อทำใบ HQ
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
