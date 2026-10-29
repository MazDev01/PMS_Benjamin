"use client";

import { useState } from "react";
import Link from "next/link";
import { use } from "react";
import { dealerStatusLabel, dealerStatusColor, quotationStatusColor, quotationStatusLabel, type DealerRow, type DealerLeadItem, type DealerQuoteItem, type HQCustomer } from "@pms/shared/lib/mock";
import { useRepoValueLoaded } from "@pms/shared/lib/useRepoState";
import { dealers as dealersRepo } from "@pms/shared/lib/data";
import { useNetworkDealerDetail, useNetworkCustomersForDealer } from "@pms/shared/lib/useNetworkData";
import { packageLabel } from "@pms/shared/lib/dealerProposals";
import { DealerCredentialsCard } from "@pms/shared/components/hq/DealerCredentialsCard";
import { TablePagination, pageSlice, pageCountOf } from "@pms/shared/components/ui/TablePagination";
import { ArrowLeft, Users, Lock, ScrollText, Pencil, EyeOff, Eye } from "lucide-react";
import { DealerEditModal, type DealerEdit } from "@pms/shared/components/hq/DealerEditModal";
import { HQ_DEALER_CODE } from "@pms/shared/lib/hqDealerRow";
import { useRole } from "@pms/shared/context/RoleContext";
import { ยืนยัน, แจ้งพลาด, แจ้งสำเร็จ } from "@pms/shared/components/ui/ConfirmToast";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import { ชื่อขั้น, สีขั้น, เลขขั้นจากผล, type ผลขั้น } from "@pms/shared/lib/leadStage";

// ── Helpers ─────────────────────────────────────────────────────


const BADGE = (bg: string, color: string): React.CSSProperties => ({ background: bg, color });

// ขั้นของลีด — ชื่อชุดเดียวกับแผงลีดฝั่งดีลเลอร์ (ตัวแปลงกลาง lib/leadStage.ts · รอบ 4)
//   เดิมเขียนกลุ่มเอง 4 ป้าย (ติดต่อแล้ว / ส่งใบเสนอ / ปิดสำเร็จ / ปิดไม่สำเร็จ) ไม่ตรงกับแถบ 5 ขั้นของดีลเลอร์
//   ชื่อ/สีจากตัวกลางชุดเดียวกับตารางลีดและแถบในแผงลีด (บอสสั่ง 27 ต.ค. 69)
function ป้ายขั้น({ stage }: { stage: ผลขั้น }) {
  const n = เลขขั้นจากผล(stage);
  const สี = สีขั้น(n);
  return <span className="badge" data-stage-label style={BADGE(สี.bg, สี.text)}>{ชื่อขั้น(n)}</span>;
}

// ── หน้ารายละเอียดดีลเลอร์ = งานดูแล (รอบ 4 · บอสตัดสิน 21 ต.ค. 69) ───────────────────────────────────────────
//   ไม่มีตัวเลขยอดขาย/เป้า/อัตราปิด/กราฟ — ผลงานดีลเลอร์อยู่ที่ "ภาพรวมยอดขาย" ที่เดียว (ปุ่มลิงก์ในแท็บภาพรวม)
function OverviewTab({ dealer }: { dealer: DealerRow }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      {/* ข้อมูลเข้าระบบของสาขานี้ — แสดงเฉพาะผู้มีสิทธิ์จัดการดีลเลอร์ (การ์ดเช็คสิทธิ์เอง) */}
      <DealerCredentialsCard dealer={dealer} />
      <div className="card" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
        <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>ผลงานดีลเลอร์</div>
        <div style={{ fontSize: "0.82rem", color: "#374151", lineHeight: 1.6 }}>ยอดขาย เป้า และอัตราปิดการขายของดีลเลอร์ทุกราย ดูที่หน้า ภาพรวมยอดขาย ที่เดียว</div>
        <Link href="/hq/pipeline" className="btn btn-secondary btn-sm" style={{ color: "#003366", textDecoration: "none" }}>
          ดูผลงานที่ภาพรวมยอดขาย
        </Link>
      </div>
    </div>
  );
}

function LeadsTab({ leads }: { leads: DealerLeadItem[] }) {
  const [page, setPage] = useState(0);
  const cur = Math.min(page, pageCountOf(leads.length) - 1);
  const rows = pageSlice(leads, cur);
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">ลูกค้าเป้าหมายที่ได้รับมอบหมาย</div>
      </div>
      <div className="table-wrap">
        <table>
          {/* ถอดคอลัมน์ "แม่แบบ" (เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69) → 14% ยกให้คอลัมน์ "ลูกค้า" */}
          <colgroup>
            <col style={{ width: "12%" }} />
            <col style={{ width: "38%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "16%" }} />
          </colgroup>
          <thead>
            <tr>
              {["รหัสลูกค้าเป้าหมาย", "ลูกค้า", "จังหวัด", "ขั้นตอน", "มอบหมายเมื่อ"].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 32, textAlign: "center", fontSize: "0.8rem", color: "#9ca3af" }}>ไม่มีลูกค้าเป้าหมาย</td></tr>
            )}
            {rows.map(l => {
              return (
                <tr key={l.id}>
                  <td style={{ fontSize: "0.72rem", color: "#6b7280", fontWeight: 600 }}>{l.id}</td>
                  <td style={{ fontSize: "0.8rem", fontWeight: 700, color: "#2D2D2D" }}>{l.name}</td>
                  <td style={{ fontSize: "0.8rem", color: "#6b7280" }}>{l.province}</td>
                  <td><ป้ายขั้น stage={l.stage} /></td>
                  <td style={{ fontSize: "0.72rem", color: "#9ca3af" }}>{l.assignedAt}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <TablePagination page={cur} total={leads.length} onPage={setPage} unit="ราย" />
    </div>
  );
}

function QuotesTab({ quotes }: { quotes: DealerQuoteItem[] }) {
  const [page, setPage] = useState(0);
  const cur = Math.min(page, pageCountOf(quotes.length) - 1);
  const rows = pageSlice(quotes, cur);
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">ใบเสนอราคา</div>
      </div>
      <div className="table-wrap">
        <table>
          {/* ตัดคอลัมน์ "ส่วนลด" ออก (ระบบไม่มีส่วนลดแล้ว) → เกลี่ย % ใหม่ให้ครบ 100
              ตัดคอลัมน์ "แม่แบบ" ออก (เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69) → 16% ยกให้คอลัมน์ "ลูกค้า" */}
          <colgroup>
            <col style={{ width: 200 }} />{/* เลขที่ — ฉบับใหม่ต้องเห็น "-V2" เต็ม (บอสสั่ง 21 ต.ค. 69) · รหัสดีลเลอร์ 5 ตัว "Q-WWWWW-2026-0001-V2" ต้องพอ (เดิม 170 · 29 ต.ค. 69) */}
            <col style={{ width: "46%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "14%" }} />
          </colgroup>
          <thead>
            <tr>
              {["เลขที่", "ลูกค้า", "สถานะ", "วันที่"].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {quotes.length === 0 && (
              <tr><td colSpan={4} style={{ padding: 32, textAlign: "center", fontSize: "0.8rem", color: "#9ca3af" }}>ไม่มีใบเสนอ</td></tr>
            )}
            {rows.map(q => {
              const st = quotationStatusColor[q.status];
              return (
                <tr key={q.quoteNo}>
                  <td data-quote-no style={{ fontSize: "0.72rem", fontWeight: 700, color: "#003366", whiteSpace: "nowrap" }}>{q.quoteNo}</td>
                  <td style={{ fontSize: "0.8rem", fontWeight: 600, color: "#2D2D2D" }}>{q.customer}</td>
                  <td><span className="badge" style={BADGE(st.bg, st.text)}>{quotationStatusLabel[q.status]}</span></td>
                  <td style={{ fontSize: "0.72rem", color: "#9ca3af" }}>{q.date}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <TablePagination page={cur} total={quotes.length} onPage={setPage} unit="ใบ" />
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────

const TABS = [
  { key: "overview",  label: "ภาพรวม" },
  { key: "leads",     label: "ลูกค้าเป้าหมาย" },
  { key: "quotes",    label: "ใบเสนอ" },
  { key: "customers", label: "ลูกค้า" },
  { key: "activity",  label: "กิจกรรม" },
] as const;

// ── Customer tab (read-only) — ลูกค้าที่ดีลเลอร์นี้ดูแล ────────────────────────────
function CustomerTab({ customers }: { customers: HQCustomer[] }) {
  const [page, setPage] = useState(0);
  const cur = Math.min(page, pageCountOf(customers.length) - 1);
  const rows = pageSlice(customers, cur);
  return (
    <div className="card">
      <div className="card-header"><div className="card-title">ลูกค้าที่ดีลเลอร์นี้ดูแล</div></div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>{["ลูกค้า", "จังหวัด", "ดีลที่ปิด", "สถานะ"].map(h => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {customers.length === 0 && (
              <tr><td colSpan={4} style={{ padding: 32, textAlign: "center", fontSize: "0.8rem", color: "#9ca3af" }}>ยังไม่มีลูกค้า</td></tr>
            )}
            {rows.map(c => (
              <tr key={c.id}>
                <td style={{ fontSize: "0.8rem", fontWeight: 700, color: "#2D2D2D" }}>{c.name}</td>
                <td style={{ fontSize: "0.8rem", color: "#6b7280" }}>{c.province}</td>
                <td className="num" style={{ fontSize: "0.8rem", fontWeight: 700, color: "#2D2D2D" }}>{c.dealsWon}</td>
                <td><span className="badge" style={c.status === "active" ? BADGE("#e5faf0", "#059669") : BADGE("#f0f0f5", "#9ca3af")}>{c.status === "active" ? "ใช้งาน" : "ไม่ใช้งาน"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TablePagination page={cur} total={customers.length} onPage={setPage} unit="ราย" />
    </div>
  );
}

// ── Activity tab (read-only) — ไทม์ไลน์งาน: ออกใบเสนอ + รับมอบหมายลูกค้าเป้าหมาย ──
function ActivityTab({ leads, quotes }: { leads: DealerLeadItem[]; quotes: DealerQuoteItem[] }) {
  const items = [
    ...quotes.map(q => ({ id: `q-${q.quoteNo}`, icon: <ScrollText size={14} />, color: "#003366",
      title: `ออกใบเสนอราคา ${q.customer}`, sub: quotationStatusLabel[q.status], date: q.date })),
    ...leads.map(l => ({ id: `l-${l.id}`, icon: <Users size={14} />, color: "#6b7280",
      title: `รับมอบหมายลูกค้าเป้าหมาย ${l.name}`, sub: l.province, date: l.assignedAt })),
  ];
  return (
    <div className="card">
      <div className="card-header"><div className="card-title">กิจกรรมล่าสุด</div></div>
      <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {items.length === 0 && <div style={{ padding: 20, textAlign: "center", fontSize: "0.8rem", color: "#9ca3af" }}>ยังไม่มีกิจกรรม</div>}
        {items.map((it, i) => (
          <div key={it.id} style={{ display: "flex", gap: 12, padding: "12px 4px", borderTop: i ? "1px solid #f1f5f9" : "none" }}>
            <span style={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0, background: it.color + "14", color: it.color, display: "flex", alignItems: "center", justifyContent: "center" }}>{it.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "#2D2D2D" }}>{it.title}</div>
              <div style={{ fontSize: "0.72rem", color: "#6b7280", marginTop: 1 }}>{it.sub}</div>
            </div>
            <span style={{ fontSize: "0.7rem", color: "#9ca3af", flexShrink: 0 }}>{it.date}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type TabKey = typeof TABS[number]["key"];

export default function DealerDrillDownPage({ params }: { params: Promise<{ dealerCode: string }> }) {
  const { dealerCode } = use(params);
  // อ่านจากชุดที่ persist (HQ_DEALERS_KEY) — ดีลเลอร์ที่ HQ เพิ่มใหม่ต้องเปิดหน้านี้ได้ ไม่ใช่ 404
  const { value: dealers, loaded } = useRepoValueLoaded<DealerRow[]>(() => dealersRepo.list(), []);
  const [tab, setTab] = useState<TabKey>("overview");
  const code = dealerCode.toUpperCase();
  // แก้ไข/ปิดใช้งาน ย้ายมาอยู่หน้านี้ (บอสตัดสิน 19 ต.ค. 69 · รอบ 2 ช่วง ข) — ผลที่บันทึกแล้วทับค่าที่โหลดมา
  const [แก้แล้ว, setแก้แล้ว] = useState<DealerRow | null>(null);
  const [เปิดแก้, setเปิดแก้] = useState(false);
  const { can } = useRole();
  // แถว HQ ไม่ใช่ดีลเลอร์ (ใบ 0222 · ซ่อนจากทะเบียน) — เปิดตรงด้วย URL ก็ไม่แสดงเป็นดีลเลอร์
  const dealer = code === HQ_DEALER_CODE ? undefined : (แก้แล้ว ?? dealers.find(d => d.code === code));
  async function บันทึก(next: DealerRow) {
    await dealersRepo.save([next]);
    setแก้แล้ว(next);
  }
  async function สลับสถานะ(d: DealerRow) {
    const ปิด = d.status === "active";
    if (!(await ยืนยัน({ หัวข้อ: ปิด ? `ปิดใช้งาน "${d.name}" ?` : `เปิดใช้งาน "${d.name}" ?`,
      รายละเอียด: ปิด ? "ดีลเลอร์รายนี้จะเข้าระบบไม่ได้จนกว่าจะเปิดใช้งานอีกครั้ง · ข้อมูลงานขายยังอยู่ครบ" : "ดีลเลอร์รายนี้จะเข้าระบบได้ตามปกติ",
      ปุ่มตกลง: ปิด ? "ปิดใช้งาน" : "เปิดใช้งาน", อันตราย: ปิด }))) return;
    try {
      await บันทึก({ ...d, status: ปิด ? "inactive" : "active" });
      แจ้งสำเร็จ(ปิด ? "ปิดใช้งานดีลเลอร์แล้ว" : "เปิดใช้งานดีลเลอร์แล้ว");
    } catch (e) { แจ้งพลาด(friendlyError(e)); }
  }
  // รายละเอียดดีลเลอร์แบบเชื่อมต่อ: CNX = ข้อมูลสด (leads/projects/quotes/ยอดรายเดือน) · สาขาอื่น = seed
  const detail = useNetworkDealerDetail(code);
  const custs = useNetworkCustomersForDealer(code); // ลูกค้าของดีลเลอร์นี้ (กรองที่ repo ตรง ๆ — ไม่ดึงทั้งเครือ)

  // ทะเบียนดีลเลอร์มาจาก repo (async) — ต้องรอโหลดจบก่อน ไม่งั้นเรนเดอร์แรกเด้ง 404 ทุกครั้ง
  if (!loaded) return <div className="erp" />;
  // รหัสดีลเลอร์ที่พิมพ์ผิด/บุ๊กมาร์กเก่า/สาขาที่ถูกลบไปแล้ว — เรนเดอร์ข้อความในหน้าเอง (ไม่ใช้ notFound())
  // เพราะ notFound() ในคอมโพเนนต์ "use client" ที่ไม่มี not-found.tsx ครอบ เคยขึ้นจอเปล่าเงียบ ๆ
  // ไม่มี error เลยด้วย (พบจริงจากผลตรวจสอบระบบเต็มรูปแบบรอบ 2, 31 ก.ค. 69)
  if (!dealer) {
    return (
      <div className="erp" style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ maxWidth: 380, textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 8 }}>ไม่พบดีลเลอร์รหัส &quot;{code}&quot;</div>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 20, lineHeight: 1.6 }}>
            อาจพิมพ์รหัสผิด หรือดีลเลอร์รายนี้ถูกลบ/ยังไม่ถูกสร้างในระบบ
          </p>
          <Link href="/hq/dealers" className="btn btn-primary" style={{ display: "inline-flex", textDecoration: "none" }}>
            <ArrowLeft size={14} style={{ marginRight: 6 }} /> กลับไปหน้าดีลเลอร์
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="erp">
      {/* Back link */}
      <Link href="/hq/dealers" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "0.8rem", color: "#6b7280", textDecoration: "none", marginBottom: 16, fontWeight: 600 }}>
        <ArrowLeft size={14} /> กลับไปหน้าดีลเลอร์
      </Link>

      {/* Header */}
      <div className="page-head">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <h2 style={{ marginBottom: 0 }}>{dealer.name}</h2>
            <span className="badge" style={BADGE("#f0f0f5", "#6b7280")}>{dealer.code}</span>
            {/* แพ็กเกจของดีลเลอร์ (บอสสั่ง 15 ก.ย. 69) — สีเดียวกับป้ายในหน้า /hq/dealers · ไม่มีแพ็กเกจ = ไม่แสดง */}
            {dealer.package && (
              <span className="badge" style={dealer.package === "exclusive" ? BADGE("#fdf3e1", "#b45309") : BADGE("#e8f0fe", "#1d4ed8")}>
                แพ็กเกจ {packageLabel[dealer.package]}
              </span>
            )}
            {/* ป้าย/สี มาจาก @pms/shared/lib/mock แหล่งเดียว — ให้ตรงกับตารางหน้า /hq/dealers เป๊ะ */}
            {dealer.status === "inactive" && (
              <span className="badge" style={BADGE(dealerStatusColor.inactive.bg, dealerStatusColor.inactive.color)}>
                {dealerStatusLabel.inactive}
              </span>
            )}
          </div>
          {/* ชื่อปุ่มตาม FLOW H11 ("เข้าระบบ" · "แก้ไข" · ปิด/เปิดใช้งาน) — เดิม "แก้ไขข้อมูลดีลเลอร์" (หัวหน้าต่างแก้ไขยังชื่อเดิม) */}
          {can("dealers:manage") && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0 6px" }}>
              <button className="btn btn-primary btn-sm" onClick={() => setเปิดแก้(true)}><Pencil size={13} /> แก้ไข</button>
              <button className="btn btn-secondary btn-sm" onClick={() => void สลับสถานะ(dealer)}>
                {dealer.status === "active" ? <><EyeOff size={13} /> ปิดใช้งาน</> : <><Eye size={13} /> เปิดใช้งาน</>}
              </button>
            </div>
          )}
          <p>
            ภาค{dealer.region || "—"} · จังหวัด{dealer.province || "—"}
          </p>
        </div>
      </div>

      {/* โหมดดูอย่างเดียว — HQ เจาะดูข้อมูลดีลเลอร์ได้ทั้งหมด แก้ไม่ได้ (จัดการที่หน้าดีลเลอร์) */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: "#f5f7fa", border: "1px solid #e5e7eb",
        borderLeft: "3px solid #003366", borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
        <Lock size={15} color="#003366" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: "0.78rem", color: "#374151", flex: 1, minWidth: 180 }}>
          {/* ⚠️ ข้อความเดิมพูดคลุมเกินจริง (บอสแจ้ง 20 ส.ค. 69: กำลังจะแก้อีเมล/รหัสผ่านแล้วมาเจอป้ายนี้)
              หน้านี้แก้ "บัญชีเข้าระบบ" ได้จริงที่การ์ดด้านล่าง — ป้ายที่บอกว่าแก้อะไรไม่ได้เลย
              ทำให้ผู้ดูแลไม่กล้ากดต่อ หรือนึกว่าปุ่มที่เห็นเป็นปุ่มที่กดไม่ได้ */}
          <strong style={{ color: "#003366" }}>ข้อมูลงานขายดูอย่างเดียว</strong> — ลูกค้าเป้าหมาย/ใบเสนอราคา/ลูกค้า แก้จากหน้านี้ไม่ได้
          {" · "}ข้อมูลดีลเลอร์แก้ที่ปุ่ม “แก้ไข” · บัญชีเข้าระบบแก้ได้ที่การ์ด “ข้อมูลเข้าระบบของดีลเลอร์” ด้านล่าง
        </span>
        {/* ⚠️ ปุ่ม "เข้าสู่โหมดจัดการ" ถูกลบเมื่อ 10 ส.ค. 69 — เดิมเขียน disabled ตายตัวในโค้ด
            ทดสอบด้วยบัญชีผู้ดูแลระบบจริงก็ยังกดไม่ได้ พร้อมคำอธิบายว่า "เฉพาะ Super Admin"
            ซึ่งผู้ใช้เข้าเงื่อนไขอยู่แล้ว = ปุ่มที่ไม่มีวันกดได้และบอกเหตุผลผิด
            การจัดการดีลเลอร์ทำที่หน้าทะเบียนดีลเลอร์อยู่แล้ว จึงชี้ทางไปที่นั่นแทน */}
      </div>

      {เปิดแก้ && (
        <DealerEditModal dealer={dealer} onClose={() => setเปิดแก้(false)}
          onSave={async (e: DealerEdit) => {
            try { await บันทึก({ ...dealer, ...e }); แจ้งสำเร็จ("บันทึกข้อมูลดีลเลอร์แล้ว"); }
            catch (err) { throw new Error(friendlyError(err)); }
          }} />
      )}

      {/* Tabs */}
      <div className="tab-bar" style={{ marginBottom: 20, overflowX: "auto" }}>
        {TABS.map(t => {
          const count = t.key === "leads" ? detail.leads.length
            : t.key === "quotes" ? detail.quotes.length
            : t.key === "customers" ? custs.length
            : null;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`tab-item ${tab === t.key ? "active" : ""}`}
              style={{ display: "flex", alignItems: "center", gap: 5 }}>
              {t.label}
              {count !== null && (
                <span style={{ fontSize: "0.65rem", fontWeight: 700, background: tab === t.key ? "#dce5f0" : "#e5e7eb", color: tab === t.key ? "#003366" : "#6b7280", borderRadius: 99, padding: "1px 6px" }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content — เชื่อมต่อ: CNX = ข้อมูลสด · สาขาอื่น = seed (แต่ละแท็บมี empty state ในตัว) */}
      {tab === "overview"  && <OverviewTab dealer={dealer} />}
      {tab === "leads"     && <LeadsTab    leads={detail.leads} />}
      {tab === "quotes"    && <QuotesTab   quotes={detail.quotes} />}
      {tab === "customers" && <CustomerTab customers={custs} />}
      {tab === "activity"  && <ActivityTab leads={detail.leads} quotes={detail.quotes} />}
    </div>
  );
}
