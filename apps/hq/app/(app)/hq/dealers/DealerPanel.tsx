"use client";
// ── แผงดีลเลอร์ด้านขวา (บอสสั่ง 30 ต.ค. 69 · FLOW H11 งานดูแล ไม่มีตัวเลขยอดขาย) ────────────────────────────────
//   แท็บ "ภาพรวม" = ข้อมูลทั้งหมดของดีลเลอร์ในหน้าเดียว · ตัวเลขคิดที่ฐาน (hq_dealer_panel · ใบ 0266) · ไม่มี ฿ ในแผงนี้
//   แท็บอื่น (ลูกค้าเป้าหมาย · ใบเสนอราคา · ลูกค้า · กิจกรรม) ดูอย่างเดียว · กดแถว = เปิดแผงของเรื่องนั้น
//   ผลงานดีลเลอร์ (ยอดขาย/เป้า/อัตราปิด) อยู่ที่ภาพรวมยอดขายที่เดียว — ปุ่ม "ดูผลงาน" พาไป (เลือกดีลเลอร์นี้ไว้ให้)
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X, LogIn, Pencil, EyeOff, Eye, BarChart3, AlertTriangle, Users, FileText, Inbox, Clock, Activity, Building2 } from "lucide-react";
import { metrics as metricsRepo, dealers as dealersRepo, quotations as quotationsRepo } from "@pms/shared/lib/data";
import { REAL_BACKEND } from "@pms/shared/lib/data/config";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { dealerCodeOf } from "@pms/shared/lib/dealerCode";
import { useRepoValue } from "@pms/shared/lib/useRepoState";
import { useNetworkDealerDetail, useNetworkQuotations, useHQCustomersPage, useCustomerBuildings } from "@pms/shared/lib/useNetworkData";
import { useQuoteValidityDays } from "@pms/shared/lib/useHQConfig";
import { toQuoteRows, dealerLookups, type QuoteRow } from "@pms/shared/lib/hqQuotations";
import { QuotationDrawer } from "@pms/shared/components/hq/quotations/QuotationDrawer";
import { CustomerDrawer } from "@pms/shared/components/hq/customers/CustomerDrawer";
import { buildingOf, regionOf, type CustomerDbRow } from "@pms/shared/lib/customerDb";
import { วันที่ขายของใบ } from "@pms/shared/lib/salesDate";
import { DealerCredentialsCard } from "@pms/shared/components/hq/DealerCredentialsCard";
import { TablePagination, pageSlice, pageCountOf } from "@pms/shared/components/ui/TablePagination";
import { dealerStatusLabel, dealerStatusColor, quotationStatusColor, quotationStatusLabel, fmtISOToThai, type DealerRow, type HQQuotation } from "@pms/shared/lib/mock";
import { ชื่อภาค } from "@pms/shared/lib/provinces";
import { วันเวลาไทย } from "@pms/shared/lib/thaiDate";
import { ชื่อขั้น, สีขั้น, เลขขั้นจากผล } from "@pms/shared/lib/leadStage";
import { ป้ายสถานะชำระ, type แผงดีลเลอร์ } from "@pms/shared/lib/hqDealerPanel";

const PRIMARY = "#003366";
const MUTED = "#6b7280";
type แท็บ = "overview" | "leads" | "quotes" | "customers" | "activity";
const ชื่อแท็บ: Record<แท็บ, string> = { overview: "ภาพรวม", leads: "ลูกค้าเป้าหมาย", quotes: "ใบเสนอราคา", customers: "ลูกค้า", activity: "กิจกรรม" };
const เวลา = (s: string | null | undefined) => { if (!s) return "—"; const d = new Date(s); return Number.isNaN(d.getTime()) ? "—" : วันเวลาไทย(d); };


/** หัวข้อของส่วนในแท็บภาพรวม — แบบเดียวกันทุกส่วน */
function ส่วน({ title, icon, children, testid }: { title: string; icon: React.ReactNode; children: React.ReactNode; testid: string }) {
  return (
    <section className="card" data-panel-section={testid} style={{ marginBottom: 12 }}>
      <div className="card-header"><div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ color: PRIMARY, display: "flex" }}>{icon}</span><div className="card-title">{title}</div></div></div>
      <div className="card-body" style={{ paddingTop: 0 }}>{children}</div>
    </section>
  );
}
function แถว({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "128px minmax(0,1fr)", gap: 10, padding: "6px 0", borderTop: "1px solid #f1f5f9", fontSize: "0.8rem" }}>
      <span style={{ color: MUTED }}>{label}</span><span style={{ color: "#1F2937", fontWeight: 600, overflowWrap: "anywhere" }}>{value}</span>
    </div>
  );
}

export function DealerPanel({ dealer, onClose, onEdit, onToggle, onEnter, entering }: {
  dealer: DealerRow; onClose: () => void; onEdit: () => void; onToggle: () => void; onEnter: () => void; entering: boolean;
}) {
  const router = useRouter();
  const code = dealer.code;
  const [แท็บ, setแท็บ] = useState<แท็บ>("overview");
  const [ข้อมูล, setข้อมูล] = useState<แผงดีลเลอร์ | null | undefined>(undefined);   // undefined = กำลังโหลด
  const [กิจกรรมทั้งหมด, setกิจกรรมทั้งหมด] = useState<แผงดีลเลอร์["activity"] | null>(null);
  useEffect(() => {
    let alive = true;
    setข้อมูล(undefined); setกิจกรรมทั้งหมด(null); setแท็บ("overview");
    metricsRepo.hqDealerPanel(code, 10).then(r => { if (alive) setข้อมูล(r); }).catch(e => { logRepoRead("metrics.hqDealerPanel", e); if (alive) setข้อมูล(null); });
    return () => { alive = false; };
  }, [code, dealer.status, dealer.name, dealer.province, dealer.region]);
  useEffect(() => {
    if (แท็บ !== "activity" || กิจกรรมทั้งหมด) return;
    let alive = true;
    metricsRepo.hqDealerPanel(code, 100).then(r => { if (alive) setกิจกรรมทั้งหมด(r?.activity ?? []); }).catch(e => logRepoRead("metrics.hqDealerPanel", e));
    return () => { alive = false; };
  }, [แท็บ, code, กิจกรรมทั้งหมด]);
  // ปิดด้วย Esc
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [onClose]);

  const detail = useNetworkDealerDetail(code);
  const ลูกค้า = useHQCustomersPage(useMemo(() => ({ dealerCode: code, limit: 500, offset: 0 }), [code]));
  // แผงใบเสนอราคา (QuotationDrawer) ใช้แถวรูปแบบเดียวกับหน้าใบเสนอราคาทั้งเครือ
  const netQuotes = useNetworkQuotations();
  const validityDays = useQuoteValidityDays();
  const allDealers = useRepoValue<DealerRow[]>(() => dealersRepo.list(), []);
  const look = useMemo(() => dealerLookups(allDealers), [allDealers]);
  const [ดูใบ, setดูใบ] = useState<QuoteRow | null>(null);
  // กดใบในแท็บใบเสนอราคา = หน้าต่างใบเสนอราคาฝั่ง HQ (QuotationDrawer)
  //   พบ 9 พ.ย. 69: เดิมกดแล้วไม่เปิดอะไร — เทียบ id ("LIVE-<เลขที่>") แทนเลขที่ และฝั่ง HQ (ฐานจริง) ไม่ถือใบทั้งเครือใน SalesContext
  //   → เทียบเลขที่ · ไม่มีในชุดที่ถือ (ฐานจริง) = อ่านใบนั้นจากฐาน (ชุดเดียวกับแท็บ · สิทธิ์ HQ อ่านได้ทั้งเครือ) + ผู้รับผิดชอบจากลีดที่ผูก
  const เปิดใบ = async (no: string) => {
    let q: HQQuotation[] = netQuotes.filter(x => x.quoteNo === no && dealerCodeOf(x) === code);
    if (!q.length && REAL_BACKEND) {
      try {
        const r = await quotationsRepo.listPage(undefined, { limit: 20, offset: 0, dealerCodes: [code], search: no });
        const raw = r.rows.find(x => x.id === no);
        if (raw) {
          const ผู้รับผิดชอบ = await quotationsRepo.salesperson(no, code).catch(e => { logRepoRead("quotations.salesperson", e); return null; });
          q = [{ id: `LIVE-${raw.id}`, quoteNo: raw.id, dealerCode: code, dealerName: dealer.name, customer: raw.customer, valueNum: raw.totalValue,
            status: raw.status, createdAt: fmtISOToThai(raw.date), salesDate: วันที่ขายของใบ(raw), salesperson: ผู้รับผิดชอบ ?? "", productLine: raw.project || "",
            materialCost: raw.materialCost, lineItems: raw.lineItems,
            dateISO: raw.date, expiry: raw.expiry, revision: raw.revision, vatPercent: raw.vatPercent, whtRate: raw.whtRate, province: raw.province || undefined }];
        }
      } catch (e) { logRepoRead("quotations.listPage(dealerPanel)", e); }
    }
    const row = toQuoteRows(q, validityDays, look)[0];
    if (row) setดูใบ(row);
  };
  // แผงลูกค้า (CustomerDrawer) — ประกอบแถวแบบเดียวกับหน้าลูกค้าทั้งเครือ (ใบตอบรับของลูกค้ารายนั้น)
  const [ดูลูกค้า, setดูลูกค้า] = useState<number | null>(null);
  const แถวลูกค้า = ลูกค้า?.rows.find(r => r.id === ดูลูกค้า) ?? null;
  const ใบของลูกค้า = useCustomerBuildings(ดูลูกค้า, แถวลูกค้า ? code : null);
  const รายละเอียดลูกค้า: CustomerDbRow | null = useMemo(() => {
    if (!แถวลูกค้า) return null;
    const buildings = (ใบของลูกค้า ?? [])
      .map(q => buildingOf({ quoteNo: q.id, productLine: q.project || "", valueNum: q.totalValue, createdAt: fmtISOToThai(q.date), salesDate: วันที่ขายของใบ(q) }))
      .sort((a, b) => (a.wonAt?.getTime() ?? 0) - (b.wonAt?.getTime() ?? 0));
    const lastBuy = [...buildings].filter(b => b.wonAt).pop() ?? null;
    return {
      id: แถวลูกค้า.id, localId: แถวลูกค้า.id, name: แถวลูกค้า.name, dealerCode: แถวลูกค้า.dealerCode, dealerName: แถวลูกค้า.dealerName,
      province: แถวลูกค้า.province, dealsWon: 0, totalRevenue: แถวลูกค้า.totalValue, status: "active", lastContact: "—", segment: "sme",
      contact: แถวลูกค้า.contact, phone: แถวลูกค้า.phone, email: แถวลูกค้า.email, address: แถวลูกค้า.address,
      region: regionOf(แถวลูกค้า.province), buildings, lastPurchase: lastBuy?.wonDate ?? null, lastPurchaseAt: lastBuy?.wonAt ?? null,
      isRepeat: buildings.length > 1,
    };
  }, [แถวลูกค้า, ใบของลูกค้า]);

  const ไปแท็บ = (t: แท็บ) => setแท็บ(t);
  const ลิงก์ผลงาน = `/hq/pipeline?dealer=${encodeURIComponent(code)}`;
  const สีสถานะ = dealerStatusColor[dealer.status];
  const จำนวนแท็บ: Partial<Record<แท็บ, number>> = { leads: detail.leads.length, quotes: detail.quotes.length, customers: ลูกค้า?.total ?? undefined };

  // ปุ่มหัวแผง — ทุกปุ่มมีคำอธิบายภาษาไทยเมื่อชี้
  const ปุ่ม = (label: string, title: string, icon: React.ReactNode, on: () => void, primary = false, disabled = false) => (
    <button type="button" className={`btn btn-sm ${primary ? "btn-primary" : "btn-secondary"}`} title={title} disabled={disabled} onClick={on}
      style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>{icon}{label}</button>
  );

  return (
    <>
      <div onClick={onClose} data-dealer-panel-backdrop style={{ position: "fixed", inset: 0, background: "rgba(45,45,45,.45)", zIndex: 240 }} />
      <aside role="dialog" aria-label={`แผงดีลเลอร์ ${dealer.name}`} data-dealer-panel={code} className="side-drawer"
        style={{ position: "fixed", top: 12, right: 12, bottom: 12, width: 640, maxWidth: "calc(100vw - 24px)", zIndex: 241,
          background: "#F8FAFC", boxShadow: "0 24px 70px rgba(0,0,0,.24)", borderRadius: 18, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {/* ── 1. หัวแผง: ชื่อ · รหัส · สถานะ · จังหวัด/ภูมิภาค · ปุ่ม ── */}
        <header style={{ background: "linear-gradient(135deg,#003366 0%,#00284F 60%,#001B36 100%)", padding: "16px 18px 14px", color: "#fff", flexShrink: 0 }}>
          <div data-panel-head style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div data-panel-name style={{ fontSize: "1rem", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={dealer.name}>{dealer.name}</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 6, fontSize: "0.72rem" }}>
                <span className="badge" style={{ background: "rgba(255,255,255,.16)", color: "#fff", fontFamily: "monospace" }}>{code}</span>
                <span className="badge" data-panel-status style={{ background: สีสถานะ.bg, color: สีสถานะ.color }}>{dealerStatusLabel[dealer.status]}</span>
                <span style={{ color: "rgba(255,255,255,.8)" }}>{dealer.province || "—"} · {ชื่อภาค(dealer.region)}</span>
              </div>
            </div>
            <button type="button" onClick={onClose} title="ปิดแผง" aria-label="ปิดแผง"
              style={{ background: "rgba(255,255,255,.12)", border: "none", color: "#fff", width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
              <X size={16} />
            </button>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
            {ปุ่ม(entering ? "..." : "เข้าระบบ", "เข้าระบบแทนดีลเลอร์", <LogIn size={13} />, onEnter, true, entering)}
            {ปุ่ม("แก้ไข", "แก้ไขข้อมูลดีลเลอร์", <Pencil size={13} />, onEdit)}
            {ปุ่ม(dealer.status === "active" ? "ปิดใช้งาน" : "เปิดใช้งาน", dealer.status === "active" ? "ปิดใช้งานดีลเลอร์ (เข้าระบบไม่ได้)" : "เปิดใช้งานดีลเลอร์",
              dealer.status === "active" ? <EyeOff size={13} /> : <Eye size={13} />, onToggle)}
            {ปุ่ม("ดูผลงาน", "ดูผลงานที่ภาพรวมยอดขาย (เลือกดีลเลอร์นี้ไว้ให้)", <BarChart3 size={13} />, () => router.push(ลิงก์ผลงาน))}
          </div>
        </header>

        <div className="tab-bar" style={{ padding: "0 14px", background: "#fff", flexShrink: 0, overflowX: "auto" }}>
          {(Object.keys(ชื่อแท็บ) as แท็บ[]).map(t => (
            <button key={t} type="button" aria-pressed={แท็บ === t} data-active={แท็บ === t ? "1" : ""} data-panel-tab={t} onClick={() => setแท็บ(t)} className={`tab-item ${แท็บ === t ? "active" : ""}`}
              style={{ display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
              {ชื่อแท็บ[t]}
              {จำนวนแท็บ[t] != null && <span style={{ fontSize: "0.65rem", fontWeight: 700, background: แท็บ === t ? "#dce5f0" : "#e5e7eb", color: แท็บ === t ? PRIMARY : MUTED, borderRadius: 99, padding: "1px 6px" }}>{จำนวนแท็บ[t]}</span>}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 14 }} data-panel-body>
          {/* ป้ายบอกขอบเขต — ไม่บอกคลุมว่าแก้อะไรไม่ได้เลย (บอสแจ้ง 20 ส.ค. 69) · ชี้ทางว่าแก้อะไรได้ที่ไหน */}
          <div data-readonly-note style={{ background: "#f5f7fa", border: "1px solid #e5e7eb", borderLeft: `3px solid ${PRIMARY}`, borderRadius: 10, padding: "8px 12px", marginBottom: 12, fontSize: "0.74rem", color: "#374151", lineHeight: 1.6 }}>
            <strong style={{ color: PRIMARY }}>ข้อมูลงานขายดูอย่างเดียว</strong> — ลูกค้าเป้าหมาย/ใบเสนอราคา/ลูกค้า แก้จากแผงนี้ไม่ได้
            {" · "}ข้อมูลดีลเลอร์แก้ที่ปุ่ม “แก้ไข” · บัญชีเข้าระบบแก้ได้ที่การ์ด “ข้อมูลเข้าระบบของดีลเลอร์” ในแท็บภาพรวม
          </div>
          {แท็บ === "overview" && (ข้อมูล === undefined
            ? <div style={{ padding: 30, textAlign: "center", color: MUTED, fontSize: "0.8rem" }}>กำลังโหลด…</div>
            : <ภาพรวม ข้อมูล={ข้อมูล} dealer={dealer} ไปแท็บ={ไปแท็บ} />)}
          {แท็บ === "leads" && (
            <ตารางย่อย หัว={["รหัส", "ลูกค้า", "จังหวัด", "ขั้นตอน"]} ว่าง="ไม่มีลูกค้าเป้าหมาย" หน่วย="ราย" กว้าง={[120, "38%", "22%", 140]}
              แถว={detail.leads.map(l => ({ key: l.id, ป้าย: `เปิดลูกค้าเป้าหมาย ${l.name}`,
                เปิด: () => router.push(`/hq/leads?open=${encodeURIComponent(`${code}:${l.id}`)}`),
                ช่อง: [l.id, l.name, l.province || "—", <span key="s" className="badge" style={{ background: สีขั้น(เลขขั้นจากผล(l.stage)).bg, color: สีขั้น(เลขขั้นจากผล(l.stage)).text }}>{ชื่อขั้น(เลขขั้นจากผล(l.stage))}</span>] }))} />
          )}
          {แท็บ === "quotes" && (
            <ตารางย่อย หัว={["เลขที่", "ลูกค้า", "สถานะ", "วันที่"]} ว่าง="ไม่มีใบเสนอราคา" หน่วย="ใบ" กว้าง={[200, "38%", 128, 112]}
              แถว={detail.quotes.map(q => ({ key: q.quoteNo, ป้าย: `เปิดใบเสนอราคา ${q.quoteNo}`, เปิด: () => void เปิดใบ(q.quoteNo),
                ช่อง: [<span key="n" data-quote-no style={{ fontWeight: 700, color: PRIMARY, whiteSpace: "nowrap" }}>{q.quoteNo}</span>, q.customer, <span key="s" className="badge" style={{ background: quotationStatusColor[q.status].bg, color: quotationStatusColor[q.status].text }}>{quotationStatusLabel[q.status]}</span>, q.date] }))} />
          )}
          {แท็บ === "customers" && (
            <ตารางย่อย หัว={["ลูกค้า", "จังหวัด", "ผู้ติดต่อ", "ซื้อล่าสุด"]} ว่าง={ลูกค้า ? "ยังไม่มีลูกค้า" : "กำลังโหลด…"} หน่วย="ราย" กว้าง={["36%", "20%", "24%", 112]}
              แถว={(ลูกค้า?.rows ?? []).map(c => ({ key: String(c.id), ป้าย: `เปิดลูกค้า ${c.name}`, เปิด: () => setดูลูกค้า(c.id),
                ช่อง: [c.name, c.province || "—", c.contact || "—", c.lastPurchaseAt ? fmtISOToThai(c.lastPurchaseAt) : "—"] }))} />
          )}
          {แท็บ === "activity" && (
            <ส่วน title="กิจกรรมล่าสุด" icon={<Activity size={15} />} testid="activity-all"><รายการกิจกรรม รายการ={กิจกรรมทั้งหมด} /></ส่วน>
          )}
        </div>
      </aside>
      {ดูใบ && <QuotationDrawer quote={ดูใบ} onClose={() => setดูใบ(null)} />}
      {ดูลูกค้า != null && <CustomerDrawer row={รายละเอียดลูกค้า} onClose={() => setดูลูกค้า(null)} />}
    </>
  );
}

// ── แท็บภาพรวม ──────────────────────────────────────────────────────────────────────────────────────────────
function ภาพรวม({ ข้อมูล, dealer, ไปแท็บ }: { ข้อมูล: แผงดีลเลอร์ | null; dealer: DealerRow; ไปแท็บ: (t: แท็บ) => void }) {
  const c = ข้อมูล?.counts;
  // 2. ตัวเลขงานดูแล (จำนวน · ไม่มีเงิน) — กดแต่ละตัว = แท็บนั้นในแผง · คำขอราคาไปกล่องงานคำขอ (ไม่มีแท็บในแผง)
  const ตัวเลข: { k: string; label: string; v: string; icon: React.ReactNode; on: () => void }[] = [
    { k: "openLeads", label: "ลีดที่เปิดอยู่", v: c ? c.openLeads.toLocaleString() : "—", icon: <Users size={14} />, on: () => ไปแท็บ("leads") },
    { k: "requestsWaitingHq", label: "คำขอราคาที่รอ HQ", v: c ? c.requestsWaitingHq.toLocaleString() : "—", icon: <Inbox size={14} />,
      on: () => { window.location.href = `/hq/quote-requests?q=${encodeURIComponent(dealer.code)}`; } },
    { k: "quotesAwaiting", label: "ใบที่รอลูกค้าตอบ", v: c ? c.quotesAwaiting.toLocaleString() : "—", icon: <FileText size={14} />, on: () => ไปแท็บ("quotes") },
    { k: "customers", label: "ลูกค้า", v: c ? c.customers.toLocaleString() : "—", icon: <Building2 size={14} />, on: () => ไปแท็บ("customers") },
    { k: "lastLogin", label: "เข้าระบบล่าสุด", v: เวลา(ข้อมูล?.lastLoginAt), icon: <Clock size={14} />, on: () => ไปแท็บ("activity") },
    { k: "lastSales", label: "งานขายล่าสุด", v: เวลา(ข้อมูล?.lastSalesAt), icon: <Activity size={14} />, on: () => ไปแท็บ("activity") },
  ];
  const i = ข้อมูล?.issuer, f = ข้อมูล?.franchise, p = ข้อมูล?.contact;
  const ผู้ติดต่อ = p ? [p.name, p.email, p.phone].filter(Boolean).join(" · ") || "—" : "—";
  return (
    <>
      <div data-panel-stats style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8, marginBottom: 12 }}>
        {ตัวเลข.map(t => (
          <button key={t.k} type="button" data-stat={t.k} onClick={t.on} title={`${t.label} — กดเพื่อดูรายการ`} className="card clickable"
            style={{ textAlign: "left", padding: "10px 12px", border: "1px solid #e5e7eb", cursor: "pointer", background: "#fff", marginBottom: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: MUTED, fontSize: "0.68rem", fontWeight: 700 }}>{t.icon}{t.label}</div>
            <div data-value style={{ marginTop: 4, fontSize: t.k.startsWith("last") ? "0.78rem" : "1.15rem", fontWeight: 800, color: "#1F2937", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={t.v}>{t.v}</div>
          </button>
        ))}
      </div>

      {/* 3. ข้อมูลดีลเลอร์ — ต้องครบก่อนส่งใบแรก (กติกาเดียวกับด่านที่ฐาน _issuer_missing · ใบ 0247) */}
      <ส่วน title="ข้อมูลดีลเลอร์" icon={<Building2 size={15} />} testid="company">
        {i?.missing && (
          <div role="alert" data-issuer-missing style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412", borderRadius: 10, padding: "8px 10px", fontSize: "0.76rem", margin: "4px 0 8px" }}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>ข้อมูลบริษัทยังไม่ครบ (ขาด: {i.missing}) — ต้องกรอกให้ครบก่อนส่งใบเสนอราคาใบแรก</span>
          </div>
        )}
        <แถว label="บริษัท" value={i?.company || "—"} />
        <แถว label="ที่อยู่" value={i?.address || "—"} />
        <แถว label="เลขผู้เสียภาษี" value={i?.taxId || "—"} />
        <แถว label="โทรศัพท์" value={i?.phone || "—"} />
        <แถว label="ผู้ติดต่อ" value={ผู้ติดต่อ} />
      </ส่วน>

      {/* 4. ข้อมูลเข้าระบบ — ชื่อผู้ใช้ · ดูรหัสผ่าน · แก้อีเมล/รหัสผ่าน · สิทธิ์แก้เอง · คืนสิทธิ์ (การ์ดกลางชุดเดิม) */}
      <div data-panel-section="login" style={{ marginBottom: 12 }}><DealerCredentialsCard dealer={dealer} /></div>

      {/* 5. แฟรนไชส์ — ใบค่าแฟรนไชส์ · สถานะชำระ (ไม่มียอดเงินในแผงนี้) */}
      <ส่วน title="แฟรนไชส์" icon={<FileText size={15} />} testid="franchise">
        <แถว label="ใบค่าแฟรนไชส์" value={f ? <Link href={`/hq/proposals?open=${f.proposalId}`} style={{ color: PRIMARY, fontWeight: 700 }}>{f.proposalNo}</Link> : "—"} />
        <แถว label="สถานะชำระ" value={f ? <span data-payment={f.payment}>{ป้ายสถานะชำระ[f.payment]}</span> : "—"} />
      </ส่วน>

      {/* 6. กิจกรรมล่าสุด 10 รายการ */}
      <ส่วน title="กิจกรรมล่าสุด" icon={<Activity size={15} />} testid="activity">
        <รายการกิจกรรม รายการ={ข้อมูล?.activity ?? []} />
      </ส่วน>
    </>
  );
}

function รายการกิจกรรม({ รายการ }: { รายการ: แผงดีลเลอร์["activity"] | null }) {
  if (!รายการ) return <div style={{ padding: 20, textAlign: "center", color: MUTED, fontSize: "0.8rem" }}>กำลังโหลด…</div>;
  if (!รายการ.length) return <div style={{ padding: 16, textAlign: "center", color: "#9ca3af", fontSize: "0.8rem" }}>ยังไม่มีกิจกรรม</div>;
  return (
    <div data-activity-list>
      {รายการ.map((a, n) => (
        <div key={`${a.at}-${n}`} data-activity-row style={{ display: "flex", gap: 10, padding: "8px 0", borderTop: n ? "1px solid #f1f5f9" : "none", fontSize: "0.78rem" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: "#1F2937", overflowWrap: "anywhere" }}>{a.action}</div>
            <div style={{ color: MUTED, fontSize: "0.7rem", overflowWrap: "anywhere" }}>{a.target}{a.user ? ` · ${a.user}` : ""}</div>
          </div>
          <span style={{ color: "#9ca3af", fontSize: "0.7rem", whiteSpace: "nowrap" }}>{เวลา(a.at)}</span>
        </div>
      ))}
    </div>
  );
}

/** ตารางดูอย่างเดียวในแผง — กดแถว = เปิดแผงของเรื่องนั้น · แบ่งหน้า 10 แถว (แถบเปลี่ยนหน้ากลาง) */
function ตารางย่อย({ หัว, แถว, ว่าง, หน่วย, กว้าง }: { หัว: string[]; แถว: { key: string; ป้าย: string; เปิด: () => void; ช่อง: React.ReactNode[] }[]; ว่าง: string; หน่วย: string;
  /** ความกว้างคอลัมน์ (table-layout: fixed — แก้ที่ colgroup เท่านั้น) */ กว้าง: (number | string)[] }) {
  const [หน้า, setหน้า] = useState(0);
  const cur = Math.min(หน้า, pageCountOf(แถว.length) - 1);
  return (
    <div className="card" style={{ marginBottom: 0, overflow: "hidden" }}>
      <div className="table-wrap">
        <table>
          <colgroup>{กว้าง.map((w, n) => <col key={n} style={{ width: w }} />)}</colgroup>
          <thead><tr>{หัว.map(h => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {!แถว.length && <tr><td colSpan={หัว.length} className="empty-row">{ว่าง}</td></tr>}
            {pageSlice(แถว, cur).map(r => (
              <tr key={r.key} className="clickable" tabIndex={0} role="button" aria-label={r.ป้าย} data-panel-row onClick={r.เปิด}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); r.เปิด(); } }}>
                {r.ช่อง.map((c, n) => <td key={n} title={typeof c === "string" ? c : undefined}>{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TablePagination page={cur} total={แถว.length} onPage={setหน้า} unit={หน่วย} />
    </div>
  );
}
