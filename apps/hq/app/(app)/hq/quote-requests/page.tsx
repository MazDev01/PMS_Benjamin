"use client";

// ─── HQ · คำขอใบเสนอราคา — ตารางเต็มความกว้าง แบบหน้าใบค่าแฟรนไชส์ (บอสสั่ง 6 พ.ย. 69 · แทนรายการซ้าย + แผงขวา) ───────────────
//
//   การ์ด 4 ใบคงไว้ (ต้องตีราคา · เกิน 14 วัน · เวลาตอบเฉลี่ย · อัตรายกเลิก — คิดที่ฐาน ไม่ขึ้นกับคำค้น) กดแล้วกรองตาราง
//   9 พ.ย. 69 (บอสสั่ง · ทำงานแบบเดิม คงแบบตาราง): 2 มุมมอง ตารางหน้าตาเดียวกัน
//     • ต้องตีราคา (ตารางหลัก) = เฉพาะคำขอที่ HQ ยังต้องตีราคา (ใหม่ + กำลังตีราคา) · ไม่มีตัวกรองสถานะ · ปุ่มเล็ก "เฉพาะเกินกำหนด (n)"
//     • ประวัติคำขอ = ส่งใบคืนดีลเลอร์แล้ว / ปิด / ยกเลิกแล้ว · ค้นหา/กรองดีลเลอร์/ตัวกรองสถานะ · เปิดดูได้ แก้ไม่ได้ (ไม่มีปุ่มทำใบ · หน้าต่างอ่านอย่างเดียว
//       ตามสถานะคำขอ · ยกเลิกแล้วยังเปิดดูร่าง/ไฟล์ได้ ใบ 0280)
//     การ์ด: ต้องตีราคา = ตารางหลัก · เกิน 14 วัน = ตารางหลักเฉพาะเกินกำหนด (กดซ้ำ = ล้าง) · เวลาตอบเฉลี่ย = ประวัติทุกสถานะ · อัตรายกเลิก = ประวัติ "ยกเลิกแล้ว"
//   (เดิม 6 พ.ย. 69 — ตารางเดียวทุกสถานะ:) แถวเครื่องมือ: ค้นหา + ตัวกรองสถานะ (ทุกสถานะ · ต้องตีราคา · ส่งแล้ว รอดีลเลอร์ · ปิด · ยกเลิกแล้ว) + ตัวกรองดีลเลอร์ (ชื่อ · ชื่อซ้ำ "ชื่อ (รหัส)")
//   คอลัมน์: เลขที่คำขอ · ดีลเลอร์ · ลูกค้า/โครงการ · จังหวัด · พื้นที่ ตร.ม. · สถานะ · วันที่ขอ · กำหนดส่ง (เกินกำหนด = แดง "เกิน x วัน") · จัดการ (ดู · ทำใบ)
//   เรียงค่าเริ่มต้น: มีกำหนดส่งก่อน เร็วสุด/เกินมากสุดบนสุด · ไม่มีกำหนดส่งต่อท้าย ใหม่สุดก่อน (ทับกติกาใหม่สุดก่อนเฉพาะหน้านี้ · lib เรียงคำขอตามกำหนด)
//   กดแถว = หน้าต่างรายละเอียดกลางจอ กว้าง 820 = หน้าต่างใบเสนอราคา (บอสตอบ 10 พ.ย. 69 · เดิมเต็มจอ) (ใบ HQ · ทำใบ/ไฟล์แนบ/ร่าง เหมือนเดิม · ยกเลิกแล้วเปิดดูร่างได้ ใบ 0280)
//   ข้อมูล: ฐานส่งทุกแถวครั้งเดียว (hq_quote_board "all" · ค้นหาที่ฐาน) — ตัวกรองสถานะ/ดีลเลอร์ + ตัวนับตัวเลือกคิดจากชุดเดียวกับตาราง (กติกากลุ่มเดียวกับฐาน)
// คงจากเดิม: ไม่มีปุ่ม "รับเรื่อง" (บันทึกร่าง = รับเรื่อง) · ร่างที่พิมพ์ค้างไม่หาย ปิดหน้าต่างแล้วเปิดใหม่ยังอยู่ · ออกจากหน้าขณะมีร่างค้าง = เตือน
//   ระหว่างบันทึก/ส่งใบ ปิดหน้าต่างไม่ได้ · มาจากกระดิ่ง ?open=เลขคำขอ = เปิดคำขอนั้น · ?overdue=1 = เฉพาะเกินกำหนด
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, X, ClipboardList, AlarmClock, Timer, Ban, Paperclip, Eye, FilePen, History } from "lucide-react";
import { quoteRequests as repo, metrics as metricsRepo, quoteFiles } from "@pms/shared/lib/data";
import type { จำนวนไฟล์คำขอ } from "@pms/shared/lib/quoteFiles";
import {
  type QuoteBoard, type QuoteBoardRow, type ตัวกรองประวัติ, ตัวเลือกสถานะประวัติ, ตรงสถานะคำขอ, เรียงคำขอตามกำหนด, ป้ายสถานะคำขอ, มีกำหนดส่ง,
  วันไทยสั้น, เหลือหรือเกิน, ร่างล่าสุด,
} from "@pms/shared/lib/quoteRequests";
import type { HqOverview } from "@pms/shared/lib/hqOverview";
import { TablePagination, pageSlice } from "@pms/shared/components/ui/TablePagination";
import { KpiRow, KpiCard } from "@pms/shared/components/ui/KpiCard";
import { ClickableRow } from "@pms/shared/components/ui/ClickableRow";
import { ตรึงคอลัมน์ปุ่ม } from "@pms/shared/components/ui/stickyActionCol";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { useUnsavedGuard } from "@pms/shared/lib/useUnsavedGuard";
import { HqQuoteEditor, type ร่างใบHQ } from "@pms/shared/components/hq/HqQuoteEditor";
import { useชื่อดีลเลอร์ } from "@pms/shared/lib/dealerDisplay";
import { ความกว้างคอลัมน์ชื่อ } from "@pms/shared/lib/tableFit";

const PRIMARY = "#003366", STEEL = "#2D2D2D", MUTED = "#6b7280", BORDER = "#e5e7eb", แดง = "#b91c1c";
const ร้อยละ = (v: number) => `${v.toLocaleString("th-TH", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const ปุ่มไอคอน: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 7, border: `1px solid ${BORDER}`, background: "#fff", color: PRIMARY, cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0,
};
const ตัดบรรทัด: React.CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
/** บรรทัดย่อยในช่องสถานะ: ส่งแล้ว = วันยืนราคา · ยกเลิก = วันที่ยกเลิก · ปิด = วันที่ปิด · ต้องตีราคา = ไม่มี (นับวันอยู่คอลัมน์กำหนดส่ง) */
const บรรทัดสถานะ = (r: QuoteBoardRow): string => {
  if (มีกำหนดส่ง(r)) return "";
  if (r.status === "quoted") return r.validUntil ? `ยืนราคา ${เหลือหรือเกิน(r.validUntil)}` : "ยืนราคา —";
  if (r.status === "cancelled") { const t = r.cancelledAt ?? r.closedAt; return `ยกเลิกเมื่อ ${t ? วันไทยสั้น(t) : "—"}`; }
  return `ปิดเมื่อ ${r.closedAt ? วันไทยสั้น(r.closedAt) : "—"}`;
};

export default function HQQuoteRequestsPage() {
  const ชื่อของ = useชื่อดีลเลอร์();   // ชื่อแสดง ไม่มีรหัส · ชื่อซ้ำ = "ชื่อ (รหัส)" (บอสสั่ง 6 พ.ย. 69)
  // มุมมอง (บอสสั่ง 9 พ.ย. 69): ตารางหลัก = ต้องตีราคา · ประวัติ = ส่งแล้ว/ปิด/ยกเลิก
  const [มุมมอง, setมุมมอง] = useState<"main" | "history">("main");
  const [เฉพาะเกิน, setเฉพาะเกิน] = useState(false);
  /** ตัวกรองสถานะของประวัติ (ตารางหลักไม่มีตัวกรองสถานะ) */
  const [สถานะ, setสถานะ] = useState<ตัวกรองประวัติ>("all");
  const [ดีลเลอร์, setดีลเลอร์] = useState("");
  const [พิมพ์, setพิมพ์] = useState("");
  const [ค้นหา, setค้นหา] = useState("");
  const [กล่อง, setกล่อง] = useState<QuoteBoard | null>(null);
  const [เปิดรหัส, setเปิดรหัส] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const ล็อก = useRef(false);
  // ร่างที่พิมพ์ค้างของทุกคำขอ (คีย์ = เลขคำขอ) — ปิดหน้าต่างแล้วเปิดใหม่ ร่างยังอยู่ (บอสสั่ง 26 ต.ค. 69)
  const ร่างค้าง = useRef(new Map<number, ร่างใบHQ>()).current;
  const [ใบนี้แก้ค้าง, setใบนี้แก้ค้าง] = useState(false);
  const ตั้งแก้ค้าง = useCallback((v: boolean) => setใบนี้แก้ค้าง(v), []);
  useUnsavedGuard(ใบนี้แก้ค้าง || ร่างค้าง.size > 0);
  // การ์ด 4 ใบ — ตัวเลขจากฐาน ไม่ขึ้นกับคำค้น/ตัวกรอง (ตัวนับของกล่องที่โหลดโดยไม่มีคำค้น)
  const [นับคิว, setนับคิว] = useState<QuoteBoard["counts"] | null | undefined>(undefined);
  const [ภาพรวม, setภาพรวม] = useState<HqOverview["requests"] | null | undefined>(undefined);
  const โหลดภาพรวม = useCallback(() => {
    metricsRepo.hqOverview().then(o => setภาพรวม(o.requests)).catch(e => { logRepoRead("metrics.hqOverview", e); setภาพรวม(null); });
  }, []);
  useEffect(() => โหลดภาพรวม(), [โหลดภาพรวม]);
  const ตั้งกำลังบันทึก = useCallback((v: boolean) => { ล็อก.current = v; }, []);

  // มาจากกระดิ่ง (ใบ 0231): ?open=เลขคำขอ = เปิดหน้าต่างของคำขอนั้น · ?overdue=1 = เฉพาะเกินกำหนด · ?q= = เติมช่องค้นหา
  //   ?view=todo (แถว "วันนี้ต้องทำ" ของแดชบอร์ด · บอสสั่ง 11 พ.ย. 69) = แท็บต้องตีราคา ไม่กรองเพิ่ม — จำนวนแถว = ตัวเลขในกล่อง (สถานะ new/pricing ทั้งเครือ)
  const เปิดจากลิงก์ = useCallback((search: string) => {
    const u = new URLSearchParams(search);
    const q = u.get("q"), open = Number(u.get("open")), overdue = u.get("overdue"), view = u.get("view");
    if (!q && !open && !overdue && view !== "todo") return;
    window.history.replaceState(null, "", window.location.pathname);
    if (q) { setพิมพ์(q); return; }
    if (ล็อก.current) return;
    setพิมพ์(""); setดีลเลอร์("");
    if (overdue || view === "todo") { setเปิดรหัส(null); setมุมมอง("main"); setเฉพาะเกิน(!!overdue); return; }
    setเฉพาะเกิน(false); setสถานะ("all"); setเปิดรหัส(open);   // มุมมองตามกลุ่มของคำขอนั้น (ด้านล่าง เมื่อโหลดแถวแล้ว)
  }, []);
  useEffect(() => { เปิดจากลิงก์(window.location.search); }, [เปิดจากลิงก์]);
  useEffect(() => {
    const on = (e: Event) => {
      const href = String((e as CustomEvent).detail ?? "");
      if (href.startsWith("/hq/quote-requests?")) เปิดจากลิงก์(href.slice(href.indexOf("?")));
    };
    window.addEventListener("bpms:open-record", on);
    return () => window.removeEventListener("bpms:open-record", on);
  }, [เปิดจากลิงก์]);
  // คำค้นส่งไปฐานหลังหยุดพิมพ์ (ฐานกรองทั้งจำนวนและรายการด้วยคำเดียวกัน)
  useEffect(() => { const t = setTimeout(() => setค้นหา(พิมพ์.trim()), 250); return () => clearTimeout(t); }, [พิมพ์]);
  useEffect(() => setPage(0), [ค้นหา, สถานะ, ดีลเลอร์, มุมมอง, เฉพาะเกิน]);

  const โหลด = useCallback(() => {
    let alive = true;
    repo.board("all", ค้นหา).then(b => {
      if (!alive) return;
      setกล่อง(b);
      if (!ค้นหา) setนับคิว(b.counts);   // ตัวนับทั้งหมด (ไม่มีคำค้น) = ตัวเลขของการ์ด
    }).catch(e => {
      logRepoRead("quoteRequests.board", e);
      if (alive) { setกล่อง({ counts: { todo: 0, overdue: 0, quoted: 0, won: 0, closed: 0, cancelled: 0 }, rows: [] }); if (!ค้นหา) setนับคิว(null); }
    });
    return () => { alive = false; };
  }, [ค้นหา]);
  useEffect(() => โหลด(), [โหลด]);
  const เมื่อเปลี่ยน = useCallback(() => {
    โหลด(); โหลดภาพรวม();
    if (ค้นหา) repo.board("todo", "").then(b => setนับคิว(b.counts)).catch(e => logRepoRead("quoteRequests.board(kpi)", e));
  }, [โหลด, โหลดภาพรวม, ค้นหา]);

  const ทุกแถว = useMemo(() => กล่อง?.rows ?? [], [กล่อง]);
  // ตัวเลือกดีลเลอร์ = ดีลเลอร์ที่มีคำขอ (ชื่อแสดง · เรียงตามชื่อ)
  const ตัวเลือกดีลเลอร์ = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of ทุกแถว) if (!m.has(r.dealerCode)) m.set(r.dealerCode, ชื่อของ(r.dealerCode, r.dealerName));
    return [...m].sort((a, b) => a[1].localeCompare(b[1], "th"));
  }, [ทุกแถว, ชื่อของ]);
  const ตามดีลเลอร์ = useMemo(() => ทุกแถว.filter(r => !ดีลเลอร์ || r.dealerCode === ดีลเลอร์), [ทุกแถว, ดีลเลอร์]);
  const ต้องตีราคา = useMemo(() => ตามดีลเลอร์.filter(r => ตรงสถานะคำขอ(r, "todo")), [ตามดีลเลอร์]);
  const ประวัติ = useMemo(() => ตามดีลเลอร์.filter(r => !ตรงสถานะคำขอ(r, "todo")), [ตามดีลเลอร์]);
  const แถว = useMemo(() => เรียงคำขอตามกำหนด(มุมมอง === "main"
    ? ต้องตีราคา.filter(r => !เฉพาะเกิน || ตรงสถานะคำขอ(r, "overdue"))
    : ประวัติ.filter(r => สถานะ === "all" || ตรงสถานะคำขอ(r, สถานะ))), [มุมมอง, ต้องตีราคา, ประวัติ, เฉพาะเกิน, สถานะ]);
  const ในหน้า = pageSlice(แถว, page);
  const เปิด = เปิดรหัส == null ? null : ทุกแถว.find(r => r.id === เปิดรหัส) ?? null;
  // เปิดจากกระดิ่ง/ลิงก์: มุมมองตามกลุ่มของคำขอที่เปิด (ส่งใบแล้ว/ปิด/ยกเลิก = ประวัติ)
  const กลุ่มที่เปิด = เปิด ? (ตรงสถานะคำขอ(เปิด, "todo") ? "main" : "history") : null;
  useEffect(() => { if (กลุ่มที่เปิด) setมุมมอง(กลุ่มที่เปิด); }, [กลุ่มที่เปิด, เปิดรหัส]);

  /** การ์ด → มุมมอง/ตัวกรอง (บอสสั่ง 9 พ.ย. 69) · การ์ดเกิน 14 วันกดซ้ำ = ล้าง */
  const ไปตารางหลัก = (เกิน: boolean) => { setมุมมอง("main"); setเฉพาะเกิน(เกิน); };
  const ไปประวัติ = (k: ตัวกรองประวัติ) => { setมุมมอง("history"); setสถานะ(k); };
  const เปิดแถว = (r: QuoteBoardRow) => { if (!ล็อก.current) setเปิดรหัส(r.id); };
  const ปิดหน้าต่าง = () => { if (!ล็อก.current) setเปิดรหัส(null); };

  // ป้ายจำนวนไฟล์แนบของแถวในหน้า (ใบ 0273) — ฐานนับเฉพาะไฟล์ที่ลงถังแล้ว แยกฝั่งดีลเลอร์/HQ
  const [ไฟล์ของแถว, setไฟล์ของแถว] = useState<Map<number, จำนวนไฟล์คำขอ>>(new Map());
  const [รอบไฟล์, setรอบไฟล์] = useState(0);
  const idsในหน้า = ในหน้า.map(r => r.id).join(",");
  useEffect(() => {
    const ids = idsในหน้า ? idsในหน้า.split(",").map(Number) : [];
    if (!ids.length) { setไฟล์ของแถว(new Map()); return; }
    let alive = true;
    quoteFiles.counts(ids).then(ls => alive && setไฟล์ของแถว(new Map(ls.map(c => [c.request, c]))))
      .catch(e => logRepoRead("quoteFiles.counts", e));
    return () => { alive = false; };
  }, [idsในหน้า, รอบไฟล์]);

  // คอลัมน์ลูกค้า/โครงการกว้างพอดีชื่อ (เพดาน 25% · ตัวกลาง tableFit) · อื่น ๆ สัดส่วนคงที่ — พอดีจอ 1366 ไม่มีแถบเลื่อนแนวนอน
  const นับตัวเลือก = (k: ตัวกรองประวัติ) => (k === "all" ? ประวัติ : ประวัติ.filter(r => ตรงสถานะคำขอ(r, k))).length;
  const นับเกิน = ต้องตีราคา.filter(r => ตรงสถานะคำขอ(r, "overdue")).length;
  const ดูอย่างเดียว = มุมมอง === "history";

  return (
    <div className="erp">
      {/* การ์ด 4 ใบ (บอสสั่ง 26 ต.ค. 69) — ไม่มีข้อมูล = "—" พร้อมเหตุผล (ห้าม 0 หลอก) · กดแล้วกรองตาราง กดซ้ำ = ล้าง */}
      <div data-testid="request-stats">
        <KpiRow label="สรุปคำขอใบเสนอราคา">
          <KpiCard kpi="todo" label="ต้องตีราคา" icon={ClipboardList} color="#b45309" bg="#fff4e5"
            value={นับคิว == null ? null : นับคิว.todo.toLocaleString()} rawValue={นับคิว?.todo} unit="คำขอ · ใหม่ + กำลังตีราคา"
            empty={นับคิว === null ? "โหลดตัวเลขไม่สำเร็จ" : "กำลังโหลด…"} onClick={() => ไปตารางหลัก(false)} testId="kpi-todo" />
          <KpiCard kpi="overdue" label="เกิน 14 วัน" icon={AlarmClock} color="#dc2626" bg="#fdecec" danger={(นับคิว?.overdue ?? 0) > 0}
            value={นับคิว == null ? null : นับคิว.overdue.toLocaleString()} rawValue={นับคิว?.overdue} unit="คำขอ · เลยกำหนดส่งใบ HQ"
            empty={นับคิว === null ? "โหลดตัวเลขไม่สำเร็จ" : "กำลังโหลด…"} onClick={() => ไปตารางหลัก(!(มุมมอง === "main" && เฉพาะเกิน))} testId="kpi-overdue" />
          <KpiCard kpi="avg-response" label="เวลาตอบเฉลี่ย" icon={Timer} color="#0891B2" bg="#E6F4F9"
            value={ภาพรวม?.avgResponseDays == null ? null : `${ภาพรวม.avgResponseDays.toLocaleString("th-TH", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} วัน`}
            rawValue={ภาพรวม?.avgResponseDays} unit="ส่งคำขอ → ส่งใบ HQ · ทั้งหมด"
            empty={ภาพรวม === undefined ? "กำลังโหลด…" : ภาพรวม === null ? "โหลดตัวเลขไม่สำเร็จ" : "ยังไม่มีคำขอที่ส่งใบ HQ แล้ว"}
            onClick={() => ไปประวัติ("all")} actionLabel="ดูรายการ" testId="request-avg-days" />
          <KpiCard kpi="cancel-rate" label="อัตรายกเลิกคำขอ" icon={Ban} color="#7C3AED" bg="#F0EBFB"
            value={ภาพรวม?.cancel.pct == null ? null : ร้อยละ(ภาพรวม.cancel.pct)} rawValue={ภาพรวม?.cancel.pct} unit="ดีลเลอร์ยกเลิกเอง · ทั้งหมด"
            sub={ภาพรวม ? <>({ภาพรวม.cancel.cancelled.toLocaleString()} จาก {ภาพรวม.cancel.total.toLocaleString()}){ภาพรวม.cancel.reasons[0] ? <span data-testid="request-cancel-reasons"> · เหตุผลหลัก {ภาพรวม.cancel.reasons[0].reason}</span> : null}</> : null}
            empty={ภาพรวม === undefined ? "กำลังโหลด…" : ภาพรวม === null ? "โหลดตัวเลขไม่สำเร็จ" : "ยังไม่มีคำขอ"}
            onClick={() => ไปประวัติ("cancelled")} actionLabel="ดูรายการ" testId="request-cancel-pct" />
        </KpiRow>
      </div>

      {/* มุมมอง 2 แท็บ (บอสสั่ง 9 พ.ย. 69) — จำนวน = แถวที่จะเห็นหลังคำค้น + ดีลเลอร์ */}
      <div className="tab-bar" role="tablist" aria-label="มุมมองคำขอ" style={{ marginBottom: 12 }}>
        {([["main", "ต้องตีราคา", ClipboardList, ต้องตีราคา.length], ["history", "ประวัติคำขอ", History, ประวัติ.length]] as const).map(([k, ชื่อ, Icon, n]) => (
          <button key={k} type="button" role="tab" aria-selected={มุมมอง === k} data-view-tab={k} data-count={กล่อง ? n : ""}
            className={`tab-item${มุมมอง === k ? " active" : ""}`} onClick={() => { setมุมมอง(k); if (k === "history") setเฉพาะเกิน(false); }}>
            <Icon size={14} /> {ชื่อ}{กล่อง ? ` (${n.toLocaleString()})` : ""}
          </button>
        ))}
      </div>

      {/* แถวเครื่องมือ — แบบหน้าใบค่าแฟรนไชส์ */}
      <div className="card" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "10px 14px", marginBottom: 16 }}>
        <div className="search-bar">
          <Search size={14} color="#9ca3af" />
          <input value={พิมพ์} onChange={e => setพิมพ์(e.target.value)} placeholder="ค้นหาเลขคำขอ ดีลเลอร์ ลูกค้า งาน จังหวัด" aria-label="ค้นหาคำขอ" title="ค้นหาเลขคำขอ / ดีลเลอร์ / ลูกค้าเป้าหมาย / งาน / จังหวัด" />
          {พิมพ์ && <button type="button" onClick={() => setพิมพ์("")} aria-label="ล้างคำค้น" style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", display: "flex", padding: 0 }}><X size={13} /></button>}
        </div>
        <div style={{ flex: 1 }} />
        {/* ตารางหลัก: ปุ่มเล็กเฉพาะเกินกำหนด (แทนตัวเลือก "ต้องตีราคา · เกินกำหนด") · ประวัติ: ตัวกรองสถานะ — ตัวนับ = แถวที่จะเห็น (หลังคำค้น + ดีลเลอร์) */}
        {มุมมอง === "main" ? (
          <button type="button" data-act="only-overdue" aria-pressed={เฉพาะเกิน} data-count={กล่อง ? นับเกิน : ""} onClick={() => setเฉพาะเกิน(v => !v)}
            className={`btn btn-sm ${เฉพาะเกิน ? "btn-primary" : "btn-outline"}`} style={เฉพาะเกิน ? undefined : { color: นับเกิน > 0 ? แดง : undefined }}>
            <AlarmClock size={13} /> เฉพาะเกินกำหนด{กล่อง ? ` (${นับเกิน.toLocaleString()})` : ""}
          </button>
        ) : (
          <select aria-label="กรองตามสถานะคำขอ" value={สถานะ} onChange={e => setสถานะ(e.target.value as ตัวกรองประวัติ)} className="form-select" style={{ width: "auto", cursor: "pointer" }}>
            <option value="all" data-count={กล่อง ? นับตัวเลือก("all") : ""}>ทุกสถานะ{กล่อง ? ` (${นับตัวเลือก("all").toLocaleString()})` : ""}</option>
            {ตัวเลือกสถานะประวัติ.filter(o => o.key !== "all").map(o => {
              const n = กล่อง ? นับตัวเลือก(o.key) : null;
              return <option key={o.key} value={o.key} data-count={n ?? ""}>{o.label}{n == null ? "" : ` (${n.toLocaleString()})`}</option>;
            })}
          </select>
        )}
        <select aria-label="กรองตามดีลเลอร์" value={ดีลเลอร์} onChange={e => setดีลเลอร์(e.target.value)} className="form-select" style={{ width: "auto", maxWidth: 260, cursor: "pointer" }}>
          <option value="">ทุกดีลเลอร์</option>
          {ตัวเลือกดีลเลอร์.map(([code, ชื่อ]) => <option key={code} value={code}>{ชื่อ}</option>)}
        </select>
      </div>

      <div className="card">
        <div className="table-wrap fit" style={{ borderTop: "none" }}>
          <table aria-label="ตารางคำขอใบเสนอราคา" data-view={มุมมอง} data-readonly={ดูอย่างเดียว ? "" : undefined}>
            {/* เพิ่ม/ลบคอลัมน์ต้องแก้ colgroup ด้วย (table-layout: fixed) */}
            <colgroup>
              <col style={{ width: "11%" }} />{/* เลขที่คำขอ */}
              <col style={{ width: "10%" }} />{/* ดีลเลอร์ · ล็อกความกว้าง 10 พ.ย. 69 (บอสสั่ง): % ของตาราง รวม 100 · ไม่ขึ้นกับข้อมูล · คิดจากจอ 1366 (ตาราง ≈ 1,042px) */}
              <col style={{ width: ความกว้างคอลัมน์ชื่อ }} />{/* ลูกค้า/โครงการ */}
              <col style={{ width: "9%" }} />{/* จังหวัด */}
              <col style={{ width: "7%" }} />{/* พื้นที่ */}
              <col style={{ width: "12%" }} />{/* สถานะ */}
              <col style={{ width: "9%" }} />{/* วันที่ขอ */}
              <col style={{ width: "10%" }} />{/* กำหนดส่ง */}
              <col style={{ width: "8%" }} />{/* จัดการ */}
            </colgroup>
            <thead>
              <tr>
                <th>เลขที่คำขอ</th><th>ดีลเลอร์</th><th>ลูกค้า/ชื่องาน</th><th>จังหวัด</th><th className="num">พื้นที่ ตร.ม.</th>
                <th>สถานะ</th><th>วันที่ขอ</th><th>กำหนดส่ง</th>
                <th style={{ ...ตรึงคอลัมน์ปุ่ม(true), textAlign: "right" }}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {กล่อง === null && <tr><td colSpan={9} className="empty-row">กำลังโหลด…</td></tr>}
              {กล่อง !== null && แถว.length === 0 && (
                <tr><td colSpan={9} className="empty-row">{ค้นหา || ดีลเลอร์ ? "ไม่พบคำขอที่ตรงกับตัวกรอง" : มุมมอง === "main" ? (เฉพาะเกิน ? "ไม่มีคำขอที่เกินกำหนด" : "ไม่มีคำขอที่ต้องตีราคา") : "ไม่มีคำขอในประวัติตามตัวกรองนี้"}</td></tr>
              )}
              {ในหน้า.map(r => {
                const ป้าย = ป้ายสถานะคำขอ(r);
                const เกิน = r.tag === "overdue";
                const นับ = มีกำหนดส่ง(r) ? เหลือหรือเกิน(r.dueAt) : "";
                const ย่อยสถานะ = บรรทัดสถานะ(r);
                const f = ไฟล์ของแถว.get(r.id);
                const งาน = `${r.product}${r.subtype ? ` · ${r.subtype}` : ""}`;
                return (
                  <ClickableRow key={`${r.dealerCode}-${r.id}`} className="clickable" onActivate={() => เปิดแถว(r)} label={`${r.requestNo} ${r.leadCompany}`}
                    style={{ background: เปิดรหัส === r.id ? "#f0f6ff" : เกิน ? "#fff7f7" : undefined }}>
                    <td style={{ fontWeight: 800, color: PRIMARY, fontFamily: "monospace", ...ตัดบรรทัด }}>{r.requestNo}</td>
                    <td title={ชื่อของ(r.dealerCode, r.dealerName)} style={{ fontWeight: 600, color: STEEL, ...ตัดบรรทัด }}>{ชื่อของ(r.dealerCode, r.dealerName)}</td>
                    <td title={`${r.leadCompany || "—"} · ${งาน}`} style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: STEEL, ...ตัดบรรทัด }}>{r.leadCompany || "—"}</div>
                      <div data-row-sub style={{ color: MUTED, fontWeight: 500, ...ตัดบรรทัด }}>{งาน}</div>
                      {f && f.dealer + f.hq > 0 && (
                        <div data-testid="row-files" data-dealer-files={f.dealer} data-hq-files={f.hq} data-row-sub
                          style={{ display: "flex", alignItems: "center", gap: 4, color: MUTED, ...ตัดบรรทัด }}>
                          <Paperclip size={11} /> ไฟล์จากดีลเลอร์ {f.dealer} · จาก HQ {f.hq}
                        </div>
                      )}
                    </td>
                    <td style={ตัดบรรทัด}>{r.province || "—"}</td>
                    <td className="num" style={{ whiteSpace: "nowrap" }}>{r.area == null ? "—" : Number(r.area).toLocaleString()}</td>
                    <td style={{ minWidth: 0 }}>
                      <span data-testid="row-tag" data-tag={r.tag} style={{ fontWeight: 700, color: ป้าย.color, ...ตัดบรรทัด, display: "block" }}>{ป้าย.label}</span>
                      {/* กำลังตีราคา: บอกว่าแก้ร่างใบ HQ ล่าสุดเมื่อไร (วันจากฐาน · ไม่มี = "—") */}
                      {r.status === "pricing" && <div data-testid="row-draft-age" data-row-sub style={{ color: MUTED, ...ตัดบรรทัด }}>{ร่างล่าสุด(r.draftUpdatedAt)}</div>}
                      {ย่อยสถานะ && <div data-testid="row-status-sub" data-row-sub style={{ color: MUTED, ...ตัดบรรทัด }}>{ย่อยสถานะ}</div>}
                      {ร่างค้าง.has(r.id) && <div data-row-sub style={{ color: "#92400e", fontWeight: 700, ...ตัดบรรทัด }}>ร่างยังไม่บันทึก</div>}
                    </td>
                    <td style={{ color: MUTED, whiteSpace: "nowrap" }}>{r.submittedAt ? วันไทยสั้น(r.submittedAt) : "—"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {นับ ? <>
                        <div style={{ color: เกิน ? แดง : MUTED }}>{วันไทยสั้น(r.dueAt)}</div>
                        <div data-testid="row-countdown" data-row-sub style={{ color: เกิน ? แดง : MUTED, fontWeight: เกิน ? 800 : 600 }}>{นับ}</div>
                      </> : <span style={{ color: MUTED }}>—</span>}
                    </td>
                    <td style={ตรึงคอลัมน์ปุ่ม()} onClick={e => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                        <button type="button" onClick={() => เปิดแถว(r)} title="ดูรายละเอียด" aria-label={`ดูคำขอ ${r.requestNo}`} style={ปุ่มไอคอน}><Eye size={13} /></button>
                        {/* ประวัติ = ดูอย่างเดียว ไม่มีปุ่มทำใบ (บอสสั่ง 9 พ.ย. 69) */}
                        {!ดูอย่างเดียว && <button type="button" onClick={() => เปิดแถว(r)} disabled={!มีกำหนดส่ง(r)} data-act="make-hq-quote"
                          title={มีกำหนดส่ง(r) ? "ทำใบ HQ" : "ทำใบได้เฉพาะคำขอที่ต้องตีราคา"} aria-label={`ทำใบ HQ ${r.requestNo}`}
                          style={{ ...ปุ่มไอคอน, ...(มีกำหนดส่ง(r) ? {} : { opacity: .35, cursor: "not-allowed" }) }}><FilePen size={13} /></button>}
                      </div>
                    </td>
                  </ClickableRow>
                );
              })}
            </tbody>
          </table>
        </div>
        <TablePagination page={page} total={แถว.length} onPage={setPage} unit="คำขอ" />
      </div>

      {/* ══ หน้าต่างรายละเอียดกลางจอ (820 · บอสตอบ 10 พ.ย. 69 · เดิมเต็มจอ) — ใบ HQ ของคำขอ (ทำใบ · ไฟล์แนบ · ร่าง เหมือนเดิม) · ระหว่างบันทึก/ส่งใบ ปิดไม่ได้ ══ */}
      {เปิด && (
        <HqQuoteEditor key={เปิด.id} request={เปิด} dealerName={เปิด.dealerName} onClose={ปิดหน้าต่าง} onChanged={เมื่อเปลี่ยน}
          onFilesChanged={() => setรอบไฟล์(n => n + 1)}
          onDirtyChange={ตั้งแก้ค้าง} onBusyChange={ตั้งกำลังบันทึก} ร่างค้าง={ร่างค้าง} />
      )}
    </div>
  );
}
