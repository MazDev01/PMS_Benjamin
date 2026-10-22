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
//   • ใบที่เปิดอยู่มีการแก้ค้าง แล้วกดแถวอื่น/ปุ่มกลุ่ม = ถามก่อนทิ้ง · ยกเลิก = อยู่ใบเดิม ข้อมูลที่พิมพ์ยังอยู่ (ไม่ถอดใบออก)
//   • ระหว่างบันทึก/ส่งใบ ห้ามเปลี่ยนแถวหรือกลุ่ม (เปลี่ยนระหว่างรอคำตอบ = ต้นเหตุข้อไม่นิ่งรอบก่อน ๆ)
// FLOW.html ขั้น 4–6: รับเรื่อง → ทำ BOQ → บันทึกร่าง → ส่งใบ (ล็อกเวอร์ชัน · หยุดนับ 14 วัน · อีเมลถึงดีลเลอร์)
import { useCallback, useEffect, useRef, useState } from "react";
import { Search, X, Inbox } from "lucide-react";
import { quoteRequests as repo } from "@pms/shared/lib/data";
import {
  type QuoteBoard, type QuoteBoardGroup, type QuoteBoardRow, quoteBoardGroups, quoteBoardTag, วันไทยสั้น,
} from "@pms/shared/lib/quoteRequests";
import { TablePagination, pageSlice } from "@pms/shared/components/ui/TablePagination";
import { ยืนยัน } from "@pms/shared/components/ui/ConfirmToast";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { HqQuoteEditor } from "@pms/shared/components/hq/HqQuoteEditor";

const ส้ม = "#b45309";
const รอ = (r: QuoteBoardRow) => r.waitingDays === 0 ? "วันนี้" : `รอ ${r.waitingDays} วัน`;

export default function HQQuoteRequestsPage() {
  const [กลุ่ม, setกลุ่ม] = useState<QuoteBoardGroup>("todo");
  const [พิมพ์, setพิมพ์] = useState("");
  const [ค้นหา, setค้นหา] = useState("");
  const [กล่อง, setกล่อง] = useState<QuoteBoard | null>(null);
  const [เลือก, setเลือก] = useState<QuoteBoardRow | null>(null);
  const [page, setPage] = useState(0);
  const [กำลังบันทึก, setกำลังบันทึก] = useState(false);
  const แก้ค้าง = useRef(false);
  const ล็อก = useRef(false);
  const ตั้งแก้ค้าง = useCallback((v: boolean) => { แก้ค้าง.current = v; }, []);
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
    if (!(await ออกจากใบได้())) return;
    แก้ค้าง.current = false;
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

  /** ออกจากใบที่เปิดอยู่ได้ไหม — กำลังบันทึก = ไม่ได้ · มีการแก้ค้าง = ถามก่อนทิ้ง */
  const ออกจากใบได้ = async (): Promise<boolean> => {
    if (ล็อก.current) return false;
    if (!แก้ค้าง.current) return true;
    return ยืนยัน({ หัวข้อ: "มีการแก้ที่ยังไม่บันทึก จะทิ้งหรือไม่", รายละเอียด: "ทิ้ง = รายการที่พิมพ์ในใบนี้หายไป · ยกเลิก = อยู่ที่ใบเดิม ข้อมูลยังอยู่ครบ", ปุ่มตกลง: "ทิ้งการแก้", ปุ่มยกเลิก: "ยกเลิก" });
  };
  const เปิดแถว = async (r: QuoteBoardRow) => {
    if (r.id === เลือก?.id) return;
    if (await ออกจากใบได้()) { แก้ค้าง.current = false; setเลือก(r); }
  };
  const เปลี่ยนกลุ่ม = async (g: QuoteBoardGroup) => {
    if (g === กลุ่ม) return;
    if (await ออกจากใบได้()) { แก้ค้าง.current = false; setเลือก(null); setกลุ่ม(g); }
  };

  const แถว = กล่อง?.rows ?? [];
  return (
    <div className="erp">
      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 440px) minmax(0, 1fr)", gap: 16, alignItems: "start" }} className="hq-qr-board">
        {/* ── ซ้าย: กล่องงาน ── */}
        <section aria-label="กล่องคำขอราคา" className="card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "16px 16px 12px", display: "grid", gap: 12, borderBottom: "1px solid #e5e7eb" }}>
            <div role="tablist" aria-label="กรองตามสถานะ" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {quoteBoardGroups.map(g => {
                const on = g.key === กลุ่ม;
                const n = กล่อง?.counts[g.key];
                return (
                  <button key={g.key} type="button" role="tab" aria-selected={on} disabled={กำลังบันทึก} onClick={() => void เปลี่ยนกลุ่ม(g.key)}
                    style={{ height: 36, padding: "0 12px", borderRadius: 99, border: on ? "none" : "1px solid #cbd2d9", background: on ? ส้ม : "#fff",
                      color: on ? "#fff" : "#1f2933", fontFamily: "inherit", fontSize: "0.8rem", fontWeight: on ? 700 : 500, cursor: "pointer" }}>
                    {g.label} · {n == null ? "…" : n.toLocaleString()}
                  </button>
                );
              })}
            </div>
            {กลุ่ม === "todo" && (กล่อง?.counts.overdue ?? 0) > 0 && (
              <div style={{ fontSize: "0.78rem", color: "#b91c1c", fontWeight: 700 }}>เกินกำหนด 14 วัน {กล่อง!.counts.overdue.toLocaleString()} คำขอ — อยู่บนสุดของรายการ</div>
            )}
            <div className="search-bar">
              <Search size={14} />
              <input value={พิมพ์} onChange={e => setพิมพ์(e.target.value)} placeholder="ค้นหาเลขคำขอ / ดีลเลอร์ / ลูกค้าเป้าหมาย / งาน / จังหวัด" aria-label="ค้นหาคำขอ" />
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
                  <button type="button" disabled={กำลังบันทึก && !on} onClick={() => void เปิดแถว(r)} aria-current={on ? "true" : undefined} aria-label={`${r.requestNo} ${r.leadCompany}`}
                    style={{ width: "100%", textAlign: "left", display: "grid", gap: 3, padding: "12px 16px", border: "none", cursor: "pointer", fontFamily: "inherit",
                      borderLeft: `4px solid ${on ? ส้ม : t.bar}`, background: on ? "#fff4e5" : t.bg }}>
                    <span style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: "0.88rem", fontWeight: 700, color: "#1f2933" }}>
                      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.dealerCode} · {r.leadCompany || "—"}</span>
                      <span style={{ color: t.color, fontSize: "0.76rem", whiteSpace: "nowrap" }}>{t.label}</span>
                    </span>
                    <span style={{ fontSize: "0.78rem", color: "#52606d" }}>
                      {r.requestNo} · {r.product}{r.subtype ? ` · ${r.subtype}` : ""} · {
                        กลุ่ม === "todo" ? รอ(r)
                        : กลุ่ม === "quoted" ? `ยืนราคาถึง ${r.validUntil ? วันไทยสั้น(r.validUntil) : "—"}`
                        : `ปิดเมื่อ ${r.closedAt ? วันไทยสั้น(r.closedAt) : "—"}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <TablePagination page={page} total={แถว.length} onPage={setPage} unit="คำขอ" />
        </section>

        {/* ── ขวา: ใบ HQ ของคำขอที่เลือก (ฝังในหน้า) ── */}
        <div style={{ minWidth: 0 }}>
          {เลือก ? (
            <HqQuoteEditor key={เลือก.id} inline request={เลือก} dealerName={เลือก.dealerName} onClose={() => setเลือก(null)} onChanged={โหลด}
              onDirtyChange={ตั้งแก้ค้าง} onBusyChange={ตั้งกำลังบันทึก} />
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
