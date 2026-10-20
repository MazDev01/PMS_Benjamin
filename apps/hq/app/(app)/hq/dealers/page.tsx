"use client";
import { TopbarActions } from "@pms/shared/components/layout/TopbarActions";

import { useEffect, useState } from "react";
import { แจ้งพลาด } from "@pms/shared/components/ui/ConfirmToast";
import { ตรึงคอลัมน์ปุ่ม } from "@pms/shared/components/ui/stickyActionCol";
import { TablePagination, pageSlice, pageCountOf, ROWS_PER_PAGE } from "@pms/shared/components/ui/TablePagination";
import { AdminGate } from "@pms/shared/components/layout/AdminGate";
import {
  dealerStatusLabel, dealerStatusColor,
  type DealerRow, type DealerStatus,
} from "@pms/shared/lib/mock";
import { useRepoState } from "@pms/shared/lib/useRepoState";
import { REAL_BACKEND } from "@pms/shared/lib/data/config";
import { dealers as dealersRepo, dealerSettings as dealerSettingsRepo, prospects as prospectsRepo } from "@pms/shared/lib/data";
import { ClickableRow } from "@pms/shared/components/ui/ClickableRow";
import { impersonateDealer, listDealerLoginEmails } from "@pms/shared/lib/adminApi";
import { useDealerPerformance, EMPTY_PERF } from "@pms/shared/lib/useDealerPerformance";
import { useRole } from "@pms/shared/context/RoleContext";
import { ExportMenu } from "@pms/shared/components/ui/ExportMenu";
import { useRouter } from "next/navigation";
import { ไม่ใช่แถวHQ } from "@pms/shared/lib/hqDealerRow";
import { Search, LogIn, Clock, Store, Coins, Briefcase, LayoutGrid, List } from "lucide-react";
import { AccountRequestsCard } from "@pms/shared/components/hq/AccountRequestsCard";
import { TerritoryUnmatchedCard } from "@pms/shared/components/hq/TerritoryUnmatchedCard";
import { packageLabel } from "@pms/shared/lib/dealerProposals";
import type { DealerPackage } from "@pms/shared/lib/data/types";

const REGIONS = ["เหนือ", "กลาง", "ตะวันออก", "ตะวันตก", "ใต้", "อีสาน"];
// เวลาที่เพิ่มดีลเลอร์ (ms) — ไม่มีค่า (ข้อมูลตัวอย่างเดิม) = 0 ไปอยู่ท้าย
const เวลาเพิ่ม = (d: DealerRow) => { const t = d.createdAt ? Date.parse(d.createdAt) : NaN; return Number.isFinite(t) ? t : 0; };
/** การ์ดต่อหน้า — 12 ใบ = แถวละ 4 ใบ 3 แถวเต็ม (จอเล็ก 2 ใบ / มือถือ 1 ใบ ก็ยังเต็มแถว) */
const CARDS_PER_PAGE = 12;
// แถวละ 4 ใบตายตัว (บอสสั่ง 14 ก.ย. 69: "ในแถวมีแค่ 4 การ์ด เอาใหญ่หน่อย ห้ามมีที่เหลือว่าง")
//   เดิมใช้ auto-fill จอกว้างได้แถวละ 5 ใบ → 12 ใบเหลือแถวท้าย 2 ใบ ว่างครึ่งแถว
const CARD_GRID_CSS = `
.dealer-card-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
.dealer-card { transition: box-shadow .15s, transform .15s; }
.dealer-card:hover { box-shadow: 0 8px 24px rgba(0,51,102,.12); transform: translateY(-1px); }
.dealer-card:focus-visible { outline: 2px solid #003366; outline-offset: 2px; }
@media (max-width: 1100px) { .dealer-card-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 560px)  { .dealer-card-grid { grid-template-columns: minmax(0, 1fr); } }
`;
// สีจางไล่มุมล่างของการ์ด วนตามลำดับ (ตามภาพตัวอย่างที่บอสส่ง 14 ก.ย. 69) — แค่ตกแต่ง ไม่ได้สื่อความหมาย
const สีการ์ด = ["#eaf2fd", "#e8f6ef", "#f0ecfb"];
/** ป้ายแพ็กเกจของดีลเลอร์ (บอสสั่ง 15 ก.ย. 69: "เอา Standard Exclusive ไปใช้แสดงข้อมูลของแต่ละดีลเลอร์ด้วย")
 *  ไม่มีแพ็กเกจ = "—" ไม่เดาแพ็กเกจให้ */
function ป้ายแพ็กเกจ({ p }: { p?: DealerPackage | null }) {
  if (!p) return <span style={{ color: "#C0C0C0", fontSize: "0.8rem" }}>—</span>;
  const สี = p === "exclusive" ? { background: "#fdf3e1", color: "#b45309" } : { background: "#e8f0fe", color: "#1d4ed8" };
  return <span className="badge" style={สี}>{packageLabel[p]}</span>;
}
/** ตัวย่อชื่อบนการ์ดที่ยังไม่มีรูป — ตัดคำนำหน้าบริษัท/คุณ ออกก่อน */
const ตัวย่อ = (d: DealerRow) => d.name.replace(/บจ\.|หจก\.|บริษัท|คุณ/g, "").trim().slice(0, 2) || d.code.slice(0, 2);

// ── Dealer status ───────────────────────────────────────────────
// คำเรียก/สี มาจาก @pms/shared/lib/mock (แหล่งเดียว) — หน้ารายละเอียดดีลเลอร์ใช้ชุดเดียวกัน
// สถานะจริงมี 2 ค่าเท่านั้นตาม DealerRow.status — ไม่มี "ระงับ" (ดูเหตุผลใน mock.ts)
const dealerStatus = (d: { status: DealerStatus }): DealerStatus => d.status;
const STATUS_PILLS: { value: DealerStatus | "all"; label: string }[] = [
  { value: "all",      label: "ทั้งหมด" },
  { value: "active",   label: dealerStatusLabel.active },
  { value: "inactive", label: dealerStatusLabel.inactive },
];

function StatusBadge({ status }: { status: DealerStatus }) {
  const c = dealerStatusColor[status];
  return <span className="badge" style={{ background: c.bg, color: c.color }}>{dealerStatusLabel[status]}</span>;
}

// ── Sub-components ──────────────────────────────────────────────

function RevBar({ actual, target }: { actual: number; target: number }) {
  // ⚠️ ตัวเลขที่โชว์ต้องเป็นค่าจริง · ตัดที่ 100 ได้เฉพาะ "ความยาวแท่ง" (บอสสั่ง 24 ส.ค. 69)
  //   เดิมใช้ค่าที่ตัดแล้วทั้งสองที่ → ดีลเลอร์ที่ทำได้ 410% ของเป้าขึ้นว่า "100%"
  //   อ่านแล้วเข้าใจว่าถึงเป้าพอดี ทั้งที่ทำได้เกินเป้าสี่เท่า และหน้าเดียวกัน (แผงเจาะรายสาขา)
  //   กลับโชว์ 410% อยู่ — เลขสองตัวในหน้าเดียวขัดกันเอง
  const pct = target > 0 ? Math.round(actual / target * 100) : 0;
  const pctBar = Math.min(100, pct);
  const color = pct >= 100 ? "#059669" : pct >= 75 ? "#003366" : pct >= 50 ? "#f59e0b" : "#dc2626";
  return (
    // ⚠️ ห้ามใส่ minWidth ที่กล่องข้างใน (แก้ 10 ส.ค. 69)
    //   ช่องตารางมีระยะขอบซ้ายขวารวม ~32px · กล่องข้างในที่กว้างตายตัวจึงล้นออกนอกช่อง
    //   แล้วโดน overflow:hidden ตัดทิ้ง → ป้าย "100%" ถูกเฉือนเหลือ "10" อ่านเป็นสิบเปอร์เซ็นต์
    //   ดีลเลอร์ที่ทำได้เต็มเป้าถูกอ่านว่าทำได้แค่ 10% · ความกว้างคุมที่ colgroup แทน (table-layout:fixed)
    <div>
      {/* ⚠️ ตัวเลขย่อ (฿24.6M) ต้องดูค่าเต็มได้ — ฝั่งดีลเลอร์โชว์เต็ม (฿24,600,000) พอเอามาเทียบกันแล้ว
          ผู้ใช้ไม่แน่ใจว่าเป็นเลขเดียวกันไหม (ผลตรวจภายนอก DL-12 · 24 ส.ค. 69) */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 6, fontSize: "0.72rem", marginBottom: 3 }}
        title={`ยอดขายสะสม ฿${Math.round(actual).toLocaleString("th-TH")} · เป้า ฿${Math.round(target).toLocaleString("th-TH")}`}>
        <span style={{ color: "#6b7280" }}>฿{(actual / 1_000_000).toFixed(1)}M</span>
        <span style={{ fontWeight: 700, color }}>{pct}%</span>
      </div>
      <div style={{ height: 6, background: "#f0f0f5", borderRadius: 99, overflow: "hidden" }}>
        <div className="top5-bar" style={{ height: "100%", width: `${pctBar}%`, background: color, borderRadius: 99 }} />
      </div>
      <div style={{ fontSize: "0.65rem", color: "#6b7280", marginTop: 2 }}>
        เป้า ฿{(target / 1_000_000).toFixed(1)}M
      </div>
    </div>
  );
}

// ยังไม่มีข้อมูลให้วัด = "—" (null) · ห้ามแสดง 0% เพราะ 0% แปลว่า "วัดแล้วได้ศูนย์"
function OnTimeBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span style={{ color: "#C0C0C0", fontSize: "0.8rem" }}>—</span>;
  const color = pct >= 85 ? "#059669" : pct >= 70 ? "#f59e0b" : "#dc2626";
  return (
    <span className="badge" style={{ background: color + "22", color }}>
      {pct}%
    </span>
  );
}

// secret = ปิดบังค่าไว้ก่อน ต้องกดตาถึงเห็น (ยังคัดลอกได้โดยไม่ต้องเปิดดู)
// ใช้กับรหัสผ่านในแผงรายละเอียดดีลเลอร์ — เดิมโชว์รหัสจริงเต็ม ๆ ทันทีที่เปิดแถว
// ใครเดินผ่านหลังจอ/แชร์หน้าจอ/ถ่ายภาพหน้าจอ ก็ได้รหัสเข้าระบบของดีลเลอร์ไปเลย
// (โมดัลตอนสร้าง/รีเซ็ตยังโชว์เต็มโดยตั้งใจ — เป็นจังหวะเดียวที่ HQ ต้องอ่านไปแจ้งดีลเลอร์)
// CopyField / DealerPasswordField ย้ายไปเป็นของกลางที่ DealerCredentialsCard.tsx แล้ว (13 ส.ค. 69)



// ⛔ ห้ามสร้างฟังก์ชัน "เดาอีเมลจากรหัสสาขา" กลับมาอีก
//   เคยมี dealerLoginEmail(code) = `<code>@dealer.benjaminpebsteel.com` ซึ่งเป็นสูตรของบัญชีที่สร้างผ่านหน้าจอนี้
//   เท่านั้น · สาขาที่มีอยู่จริงใช้อีเมลธุรกิจของตัวเอง (CNX = sales@cmsteelbuild.co.th)
//   → หน้าจอโชว์อีเมลที่ไม่มีอยู่จริงคู่กับรหัสผ่านที่ถูกต้อง HQ คัดลอกไปแล้วเข้าระบบไม่ได้
//   อีเมลจริงต้องมาจาก /api/admin/dealers/logins เท่านั้น · ไม่รู้ = ขึ้น "—"

// รหัสผ่านใหม่ตอนรีเซ็ต — deterministic (ไม่สุ่ม) เดโมจึงทวนซ้ำได้
// nonce = ความยาวรหัสเดิม → กดรีเซ็ตซ้ำได้รหัสใหม่เรื่อย ๆ ไม่วนกลับมาซ้ำของเดิม
// ฟอร์แมต: PEB-{รหัส}-{4 หลัก}

// ── Main page ───────────────────────────────────────────────────

// จัดการดีลเลอร์ (แก้ไข/รีเซ็ตรหัส/ลบ) = ต้องมีสิทธิ์ dealers:manage — HQ_STAFF เข้าไม่ได้

export default function HQDealersPage() {
  return <AdminGate perm="dealers:manage"><HQDealersPageInner /></AdminGate>;
}
function HQDealersPageInner() {
  const { login } = useRole();
  const router = useRouter();

  const [dealers, , dealersLoaded] = useRepoState<DealerRow[]>(() => dealersRepo.list(), (v) => dealersRepo.save(v), []);
  // อีเมลเข้าระบบจริงของแต่ละสาขา (ถามเซิร์ฟเวอร์ครั้งเดียวตอนเปิดหน้า)
  //   ห้ามคำนวณจากรหัสสาขาเด็ดขาด — สูตร `<code>@dealer.benjaminpebsteel.com` ใช้ได้เฉพาะบัญชีที่สร้าง
  //   ผ่านหน้าจอนี้ · สาขาที่มีอยู่จริงใช้อีเมลธุรกิจของตัวเอง (CNX = sales@cmsteelbuild.co.th)
  //   เดิมโชว์อีเมลที่เดาไว้ HQ คัดลอกไปใช้คู่กับรหัสผ่านที่ถูกต้อง แล้วเข้าระบบไม่ได้
  const [loginEmails, setLoginEmails] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    listDealerLoginEmails().then(m => { if (alive) setLoginEmails(m); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  // อีเมลที่ "ยืนยันแล้วว่ามีจริง" เท่านั้น — ไม่รู้ ให้ขึ้น "—" ไม่เดาให้ผู้ใช้เข้าใจผิด
  const loginEmailOf = (code: string) => loginEmails[code] ?? "—";
  const [q, setQ] = useState("");
  const [regionFilter, setRegionFilter] = useState("ทั้งหมด");
  const [statusFilter, setStatusFilter] = useState<DealerStatus | "all">("all");
  // แบ่งหน้า 10 แถวเท่ากับทุกตารางในระบบ (สั่งโดยผู้บริหาร 7 ส.ค. 69)
  // ⚠️ ทุกตัวกรองต้องพากลับหน้า 1 — ไม่งั้นกรองแล้วค้างอยู่หน้ากลางลิสต์ที่ไม่มีข้อมูลแล้ว
  const [page, setPage] = useState(0);
  // มุมมองการ์ดมีรูป (บอสสั่ง 14 ก.ย. 69: "ให้แสดงแบบเป็นการ์ด มีรูปแสดง ทำเป็นแบบเฉย ๆ") · ตารางเดิมยังสลับดูได้
  // เปิดมาเป็น "ตาราง" (บอสสั่ง 14 ก.ย. 69: "ให้แสดงหน้านี้เป็นหลัก" — ชี้ปุ่มมุมมองตาราง) · การ์ดกดสลับดูได้
  const [มุมมอง, setมุมมอง] = useState<"card" | "table">("table");
  // ?view=card / ?view=table → เปิดตามที่ระบุ (ลิงก์ตรง/เทสต์) · ตั้งหลังเปิดหน้า ไม่ใช่ค่าเริ่มของ state
  //   ค่าเริ่มที่อ่านจาก URL จะไม่ตรงกับหน้าที่เซิร์ฟเวอร์เรนเดอร์ไว้ แล้วเบราว์เซอร์ฟ้องข้อผิดพลาด
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("view");
    if (v === "card" || v === "table") setมุมมอง(v);
  }, []);
  // รูปของแต่ละสาขา — ใช้เฉพาะรูปที่มีจริง ไม่มี = ตัวย่อชื่อ (ห้ามเอารูปอื่นมาใส่แทน)
  //   1) โลโก้ที่ดีลเลอร์ตั้งเองในหน้าตั้งค่าของสาขา  2) รูปประจำตัวตอนเป็นลูกค้าเป้าหมาย (HQ) ของสาขานั้น
  const [รูปสาขา, setรูปสาขา] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    void Promise.allSettled([dealerSettingsRepo.logos(), prospectsRepo.list()]).then(([โลโก้, ราย]) => {
      if (!alive) return;
      const map: Record<string, string> = {};
      if (ราย.status === "fulfilled") for (const r of ราย.value) if (r.dealerCode && r.logo) map[r.dealerCode] = r.logo;
      if (โลโก้.status === "fulfilled") Object.assign(map, โลโก้.value);   // โลโก้ที่สาขาตั้งเองมาก่อน
      setรูปสาขา(map);
    });
    return () => { alive = false; };
  }, []);

  const [entering, setEntering] = useState<string | null>(null);

  // ผลงานจริงจากใบเสนอราคา/ลูกค้าเป้าหมาย — ห้ามอ่าน d.revenueActual / d.winRate / d.activeProjects อีก
  // (คอลัมน์พวกนั้นเป็นค่าเดโมที่ seed ไว้ ไม่ขยับตามข้อมูลจริง และขัดกับหน้าแดชบอร์ด)
  const perf = useDealerPerformance();
  const perfOf = (code: string) => perf.get(code) ?? EMPTY_PERF;

  // Filter + sort — กรองจริงด้วยสถานะ/ภาค/ค้นหา (local ในหน้านี้ทั้งหมด)
  const filtered = dealers.filter(d => {
    // แถว HQ ไม่ใช่ดีลเลอร์ — ซ่อนจากทะเบียนและไม่นับในตัวเลขดีลเลอร์ (บอสตัดสิน 19 ต.ค. 69 · ยกเลิกตรึงบนสุด 7 ก.ย. 69)
    if (!ไม่ใช่แถวHQ(d)) return false;
    if (statusFilter !== "all" && dealerStatus(d) !== statusFilter) return false;
    if (regionFilter !== "ทั้งหมด" && d.region !== regionFilter) return false;
    if (q && !`${d.code} ${d.name} ${d.province} ${d.region}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
    // ดีลเลอร์ที่เพิ่มล่าสุดขึ้นก่อน (บอสสั่ง 21 ก.ย. 69 ทุกตาราง) · เพิ่มพร้อมกัน/ไม่มีเวลา → ตามยอดขายเดิม
  }).sort((a, b) => เวลาเพิ่ม(b) - เวลาเพิ่ม(a)
    || perfOf(b.code).revenue - perfOf(a.code).revenue);

  // Stats — คำนวณจากชุดที่กรองแล้ว (ตัวเลขสะสมจริง ไม่สเกลตามช่วงเวลา)
  const active = filtered.filter(d => dealerStatus(d) === "active");
  const totalRevenue = filtered.reduce((s, d) => s + perfOf(d.code).revenue, 0);
  const totalTarget = filtered.reduce((s, d) => s + d.revenueTarget, 0);
  const totalProjects = filtered.reduce((s, d) => s + perfOf(d.code).openLeads, 0);
  // ── ดีลเลอร์ที่ปิดใช้งาน ยังถูกนับรวมในการ์ดยอดรวม (บอสตัดสิน 24 ส.ค. 69) ──
  // เหตุผล: ยอดขายที่เคยทำไว้ยังเป็นของเครือ ตัดออกแล้วยอดรวมทั้งเครือจะหด ทั้งที่เงินเข้าจริง
  // แต่ต้องเขียนบอกไว้ ไม่งั้นอ่านแล้วขัดกับ "เปิดใช้งาน N ดีลเลอร์" บนการ์ดใบแรก (ผลตรวจภายนอก HQ-11)
  const ปิดใช้งาน = filtered.filter(d => dealerStatus(d) !== "active");
  const มีงานค้างที่ปิดใช้งาน = ปิดใช้งาน.filter(d => perfOf(d.code).openLeads > 0).length;
  const หมายเหตุปิดใช้งาน = ปิดใช้งาน.length > 0 ? ` · รวมดีลเลอร์ที่ปิดใช้งาน ${ปิดใช้งาน.length} ราย` : "";
  // เฉลี่ยเฉพาะดีลเลอร์ที่ "มีข้อมูล" (onTimePct > 0) — ตัวที่เป็น 0 = ยังไม่มีข้อมูล (ตารางแสดง "—")
  // เอามาเฉลี่ยเป็น 0 ไม่ได้ = เอา 0 สวมรอย "—" · ไม่มีใครมีข้อมูล → null → การ์ดแสดง "—"
  // เฉลี่ยเฉพาะสาขาที่ "มีข้อมูลให้วัด" — สาขาที่ยังไม่มีลูกค้าเป้าหมาย/ใบ ไม่เอา 0 มาถ่วงค่าเฉลี่ย
  const avgOf = (pick: (c: string) => number | null): number | null => {
    const vals = active.map(d => pick(d.code)).filter((v): v is number => v !== null);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  };
  const avgOnTime = avgOf(c => perfOf(c).onTimePct);
  const totalPct = totalTarget > 0 ? Math.round(totalRevenue / totalTarget * 100) : 0;

  // "เข้าระบบแทนดีลเลอร์" — HQ มีสิทธิ์เข้าบัญชีดีลเลอร์ไหนก็ได้ (บอสยืนยัน)
  //
  // โหมดเดโม (local): เดิมปุ่มนี้เรียก login("dealer") ซึ่งเข้าด้วยบัญชีเดโมตัวเดียวเสมอ (CNX)
  // ไม่ว่าจะกดจากแถวไหน → คงพฤติกรรมเดิมไว้ (ไม่มีระบบยืนยันตัวตนจริงให้ผูกต่อสาขา)
  //
  // โหมดจริง (supabase): เดิมเข้าใจผิดว่าทำไม่ได้เพราะรหัสผ่านดีลเลอร์ถูก hash ไว้ — แต่ service_role
  // ไม่จำเป็นต้อง "รู้" รหัสผ่านเพื่อสร้าง session แทนผู้ใช้อื่น: ใช้ Supabase magic-link
  // (generateLink ฝั่งเซิร์ฟเวอร์ — ดู /api/admin/dealers/impersonate) ออกลิงก์เข้าระบบครั้งเดียว
  // เปิดในแท็บใหม่ไปยังแอปดีลเลอร์ (คนละ origin กับ HQ · session แยกต่อแท็บอยู่แล้ว — ดู client.ts)
  // จึงไม่กระทบ session ของ HQ เองในแท็บปัจจุบันเลย
  const canImpersonate = true;
  async function enterDealer(d: DealerRow) {
    if (!REAL_BACKEND) {
      setEntering(d.id);
      login("dealer");
      router.push("/dashboard");
      return;
    }
    // ── เปิดแท็บ "ตอนคลิก" เท่านั้น (แก้ 20 ส.ค. 69: กดแล้วไม่มีอะไรเกิดขึ้น) ──
    //
    // เดิมขอลิงก์จากเซิร์ฟเวอร์ก่อน แล้วค่อย window.open หลัง await
    //   เบราว์เซอร์ถือว่า "ไม่ได้เกิดจากการคลิกของผู้ใช้" แล้วบล็อกป๊อปอัพเงียบ ๆ
    //   ผู้ใช้เห็นเป็น "กดปุ่มแล้วไม่มีอะไรเกิดขึ้น" โดยไม่มีข้อความอะไรบอกเลย
    // แก้: จองแท็บไว้ตั้งแต่จังหวะคลิก แล้วค่อยพาไปที่ลิงก์เมื่อได้มา
    //   ถ้าจองไม่ได้ (ตัวกันป๊อปอัพเข้มมาก) → ไปในแท็บเดิมแทน ดีกว่าเงียบหาย
    //   (แอปดีลเลอร์คนละ origin กับ HQ · session ของ HQ ไม่หายไปด้วย)
    const แท็บ = window.open("", "_blank");
    setEntering(d.id);
    const res = await impersonateDealer(d.code);
    setEntering(null);
    if (!res.ok) { แท็บ?.close(); แจ้งพลาด(`เข้าระบบแทน "${d.name}" ไม่สำเร็จ: ${res.error}`); return; }
    if (แท็บ) แท็บ.location.href = res.link;
    else window.location.href = res.link;
    // ⚠️ ห้ามบันทึกซ้ำจากตรงนี้ (แก้ 10 ส.ค. 69) — ฝั่งเซิร์ฟเวอร์บันทึกให้แล้วตอนออกลิงก์
    //   กดครั้งเดียวเคยได้บันทึก 2 แถว ("ZZP" กับ "ZZP · ชื่อสาขา") ทำให้นับจำนวนครั้งผิด
    //   และของฝั่งเซิร์ฟเวอร์เชื่อถือได้กว่า เพราะข้ามไม่ได้แม้ผู้ใช้ปิดหน้าจอทันทีหลังกด
    //   (ดู apps/hq/app/api/admin/dealers/impersonate/route.ts)
  }

  // การรีเซ็ตรหัสผ่านให้ดีลเลอร์ ย้ายไปอยู่ในการ์ด "ข้อมูลเข้าระบบของดีลเลอร์"
  // ที่หน้ารายละเอียดดีลเลอร์แล้ว (DealerCredentialsCard · 13 ส.ค. 69)

  return (
    <div className="erp">
      {/* Header */}
      {/* ปุ่ม/ตัวกรองของหน้าอยู่ขวาหัวหน้าเพจ (UI รอบใหม่ 14 ก.ย. 69) — ชื่อหน้า/ป้ายกลุ่มมาจากแถบบนแล้ว */}
      <TopbarActions>
          <ExportMenu filename="dealers" title="ดีลเลอร์ (ทั้งเครือ)"
            headers={["รหัส","ดีลเลอร์","จังหวัด","ภาค","อีเมล","รายได้จริง","เป้า","อัตราปิดการขาย %","โอกาสการขาย","สถานะ"]}
            rows={filtered.map(d=>[d.code,d.name,d.province,d.region,loginEmailOf(d.code),perfOf(d.code).revenue,d.revenueTarget,perfOf(d.code).winRate ?? "—",perfOf(d.code).openLeads,dealerStatusLabel[d.status]])} />
          {/* ⛔ ไม่มีปุ่มสร้าง/เพิ่มดีลเลอร์ที่หน้านี้ (บอสสั่ง 14 ก.ย. 69)
              ดีลเลอร์ต้องมาจาก "ลูกค้าเป้าหมาย (HQ)" ที่สำเร็จแล้วเท่านั้น — เข้าจากเมนูข้างได้เลย
              เคยมีปุ่ม "เพิ่มผ่านลูกค้าเป้าหมาย" ลัดไปหน้านั้น บอสสั่งเอาออก ("เอาออกเลย") — ห้ามใส่กลับ */}
      </TopbarActions>

      {/* คำขอเปลี่ยนบัญชีเข้าระบบจากดีลเลอร์ (โผล่เฉพาะเมื่อมีคำขอ) — ครั้งที่ 3 ขึ้นไปต้องอนุมัติที่นี่ */}
      <AccountRequestsCard />
      {/* จังหวัดทับซ้อน + ดีลเลอร์ที่จับคู่จังหวัดไม่ได้ (กฎพื้นที่ · ด่าน 1) — หน้านี้กั้นด้วยสิทธิ์ dealers:manage อยู่แล้ว */}
      <TerritoryUnmatchedCard />

      {/* ── KPI 4 ใบ — มาตรฐานเดียวกับหน้า HQ อื่นทั้งหมด (แดชบอร์ด · ภาพรวมยอดขาย · ใบเสนอราคา · ลูกค้า) ──
          เดิมหน้านี้ใช้ .stat-card ของเก่า: แถบสีซ้าย + ตัวเลขสีใหญ่ + หน่วยติดในตัวเลข ("10 ดีลเลอร์")
          ซึ่งเป็นที่เดียวในระบบที่ทำแบบนั้น · .stat-grid ยังไม่มี breakpoint ด้วย (จอแคบบีบ 4 ใบค้าง)
          กติกาของ .hq-kpi4: ป้าย → ตัวเลข (เข้ม ไม่ใส่สี) → หน่วย/บริบท · ไอคอนในกล่องสีจางมุมขวา */}
      {/* ⚠️ ทุกใบต้องรอข้อมูลก่อนประกาศตัวเลข — เลข 0 ระหว่างโหลดคือ "ข้อมูลผิด" ไม่ใช่ "ยังว่าง"
          รอบก่อนแก้เฉพาะใบแรก อีก 3 ใบยังประกาศ 0 อยู่ (พบจากผลตรวจรอบสุดท้าย 10 ส.ค. 69) */}
      <div className="hq-kpi4" style={{ marginBottom: "1.25rem" }}>
        {([
          { label: "ดีลเลอร์ทั้งหมด", value: dealersLoaded ? `${filtered.length}` : "—", sub: dealersLoaded ? `เปิดใช้งาน ${active.length} ดีลเลอร์` : "กำลังโหลด…", Icon: Store, color: "#003366", bg: "#E8F0FE" },
          { label: "รายได้รวม", value: dealersLoaded ? `฿${(totalRevenue / 1_000_000).toFixed(1)}M` : "—", sub: `${totalPct}% ของผลรวมเป้ารายดีลเลอร์ ฿${(totalTarget / 1_000_000).toFixed(1)}M${หมายเหตุปิดใช้งาน}`, Icon: Coins, color: "#059669", bg: "#E6F6EF" },
          { label: "โอกาสการขายทั้งหมด", value: dealersLoaded ? `${totalProjects}` : "—", sub: dealersLoaded ? `${active.filter(d => perfOf(d.code).openLeads > 0).length} จาก ${active.length} ดีลเลอร์ที่เปิดใช้งาน มีงานอยู่${มีงานค้างที่ปิดใช้งาน > 0 ? ` · ปิดใช้งานแต่ยังมีงานค้าง ${มีงานค้างที่ปิดใช้งาน} ราย` : ""}` : "กำลังโหลด…", Icon: Briefcase, color: "#0891B2", bg: "#E6F4F9" },
          { label: "ติดตามตรงเวลา", value: avgOnTime === null ? "—" : `${avgOnTime}%`, sub: avgOnTime === null ? "ยังไม่มีข้อมูล" : `${avgOnTime >= 85 ? "ดี" : avgOnTime >= 70 ? "พอใช้" : "ต้องปรับปรุง"} · เฉลี่ยเท่าที่มีข้อมูล`, Icon: Clock, color: "#7C3AED", bg: "#F0EBFB" },
        ] as const).map(t => (
          <div key={t.label} className="card" style={{ marginBottom: 0, padding: "18px 18px 15px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.label}</div>
              <div style={{ fontSize: "1.7rem", fontWeight: 800, color: "#1F2937", marginTop: 7, lineHeight: 1, letterSpacing: "-0.015em", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{t.value}</div>
              <div style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", marginTop: 7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.sub}</div>
            </div>
            <span style={{ width: 36, height: 36, borderRadius: 10, background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <t.Icon size={18} color={t.color} strokeWidth={2.1} />
            </span>
          </div>
        ))}
      </div>

      {/* Toolbar — ค้นหา + ดีลเลอร์/ภาค/สถานะ รวมแถวเดียว (เหมือนหน้าอื่นทั้งระบบ) */}
      <div className="card hq-sticky-filter" style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center", flexWrap: "wrap", padding: "10px 14px" }}>
        <div className="search-bar">
          <Search size={13} color="#6b7280" />
          <input value={q} onChange={e => { setQ(e.target.value); setPage(0); }} placeholder="ค้นหาดีลเลอร์..." />
        </div>
        <div style={{ flex: 1 }} />
        {/* ตัวเลือกแรกคือทั้งหมด — สร้างจากรายการ ["ทั้งหมด", ...REGIONS] */}
        <select aria-label="กรองตามภูมิภาค" value={regionFilter} onChange={e => { setRegionFilter(e.target.value); setPage(0); }} className="form-select" style={{ width: "auto", cursor: "pointer" }}>
          {["ทั้งหมด", ...REGIONS].map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        {/* ตัวเลือกแรกคือทั้งหมด — สร้างจากรายการเช่นเดียวกับตัวกรองภูมิภาค */}
        <select aria-label="กรองตามสถานะดีลเลอร์" value={statusFilter} onChange={e => { setStatusFilter(e.target.value as DealerStatus | "all"); setPage(0); }} className="form-select" style={{ width: "auto", cursor: "pointer" }}>
          {STATUS_PILLS.map(p => <option key={p.value} value={p.value}>{p.value === "all" ? "ทุกสถานะ" : p.label}</option>)}
        </select>
        {/* สลับการ์ด/ตาราง — ขนาดหน้าต่างกัน (12 / 10) จึงกลับหน้า 1 ทุกครั้งที่สลับ */}
        <div role="group" aria-label="รูปแบบการแสดง" style={{ display: "flex", gap: 4 }}>
          {([["card", LayoutGrid, "แสดงแบบการ์ด"], ["table", List, "แสดงแบบตาราง"]] as const).map(([ค่า, Icon, ป้าย]) => (
            <button key={ค่า} type="button" aria-label={ป้าย} title={ป้าย} aria-pressed={มุมมอง === ค่า}
              onClick={() => { setมุมมอง(ค่า); setPage(0); }}
              style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${มุมมอง === ค่า ? "#003366" : "#e5e7eb"}`, background: มุมมอง === ค่า ? "#003366" : "#fff", color: มุมมอง === ค่า ? "#fff" : "#6b7280", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <Icon size={15} />
            </button>
          ))}
        </div>
      </div>

      {/* ── การ์ด — เรียบ ๆ แบบรายชื่อทีม: รูปวงกลม · ชื่อ · รหัส/จังหวัด · สถานะ · ปุ่มหลัก ── */}
      {มุมมอง === "card" && (() => {
        const หน้าการ์ด = Math.min(page, pageCountOf(filtered.length, CARDS_PER_PAGE) - 1);
        return (
          <div className="card" style={{ padding: 16 }}>
            <style>{CARD_GRID_CSS}</style>
            {filtered.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", fontSize: "0.8rem", color: "#6b7280" }}>{dealersLoaded ? "ไม่พบข้อมูล" : "กำลังโหลดข้อมูล…"}</div>
            ) : (
              <div className="dealer-card-grid">
                {pageSlice(filtered, หน้าการ์ด, CARDS_PER_PAGE).map((d, i) => {
                  const รูป = รูปสาขา[d.code];
                  const สถานะ = dealerStatus(d);
                  const สีสถานะ = dealerStatusColor[สถานะ];
                  const สีจาง = สีการ์ด[i % สีการ์ด.length];
                  return (
                    // การ์ดตามภาพตัวอย่างล่าสุด (บอสสั่ง 14 ก.ย. 69 "เอาแบบนี้"):
                    //   ป้ายรหัสมุมซ้ายบน · รูปวงกลมพื้นฟ้าจาง · ชื่อ · จังหวัด/ภาค · สถานะมีจุด · ปุ่มเข้าระบบเต็มความกว้าง + ปุ่มไอคอน 2 ปุ่ม
                    <div key={d.id} className="dealer-card" role="button" tabIndex={0} aria-label={`เปิดรายละเอียดดีลเลอร์ ${d.name}`}
                      onClick={() => router.push(`/hq/dealers/${d.code}`)}
                      onKeyDown={ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); router.push(`/hq/dealers/${d.code}`); } }}
                      style={{
                        background: `linear-gradient(165deg, #ffffff 58%, ${สีจาง} 100%)`, border: "1px solid #e3ebf5", borderRadius: 16,
                        padding: "14px 14px 14px", textAlign: "center", cursor: "pointer", position: "relative",
                        opacity: สถานะ === "active" ? 1 : 0.55, boxShadow: "0 2px 10px rgba(0,51,102,.06)",
                      }}>
                      <span style={{ position: "absolute", top: 12, left: 12, fontSize: "0.62rem", fontWeight: 800, color: "#003366", background: "#eef3fa", border: "1px solid #dde7f3", borderRadius: 99, padding: "2px 8px", letterSpacing: "0.04em" }}>{d.code}</span>
                      <div style={{ width: 84, height: 84, borderRadius: "50%", margin: "10px auto 10px", overflow: "hidden", background: รูป ? "#fff" : "#e4eefb", display: "flex", alignItems: "center", justifyContent: "center", color: "#003366", fontWeight: 800, fontSize: "1.75rem", boxShadow: "inset 0 0 0 1px rgba(0,51,102,.06)" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- รูปเป็น data URL ที่ย่อแล้ว ไม่ผ่านตัวปรับรูปของ Next */}
                        {รูป ? <img src={รูป} alt={`รูปของ ${d.name}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : ตัวย่อ(d)}
                      </div>
                      <div title={d.name} style={{ fontSize: "0.95rem", fontWeight: 800, color: "#1f2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div>
                      <div title={d.province} style={{ fontSize: "0.72rem", color: "#6b7280", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {[d.province, d.region].filter(Boolean).join(" · ") || "—"}
                      </div>
                      <div style={{ marginTop: 7, display: "flex", justifyContent: "center", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "0.68rem", fontWeight: 700, color: สีสถานะ.color, background: สีสถานะ.bg, borderRadius: 99, padding: "2px 9px" }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: สีสถานะ.color }} />
                          {dealerStatusLabel[สถานะ]}
                        </span>
                        {d.package && <ป้ายแพ็กเกจ p={d.package} />}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8, marginTop: 12 }} onClick={ev => ev.stopPropagation()}>
                        {canImpersonate && (
                          <button onClick={() => enterDealer(d)} disabled={entering === d.id} title="เข้าระบบแทนดีลเลอร์"
                            style={{ height: 36, borderRadius: 9, border: "none", background: "linear-gradient(180deg, #0a4a8a 0%, #003366 100%)", color: "#fff", fontSize: "0.78rem", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer", opacity: entering === d.id ? 0.6 : 1, fontFamily: "inherit", boxShadow: "0 3px 8px rgba(0,51,102,.22)" }}>
                            <LogIn size={13} /> {entering === d.id ? "..." : "เข้าระบบ"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ marginTop: 14 }}>
              <TablePagination page={หน้าการ์ด} total={filtered.length} onPage={setPage} size={CARDS_PER_PAGE} unit="สาขา" />
            </div>
          </div>
        );
      })()}

      {/* Table */}
      {มุมมอง === "table" && (
      <div className="card">
        <div className="table-wrap">
          <table>
            {/* เพิ่มคอลัมน์ "จังหวัด" → เกลี่ย % ใหม่ทั้งชุด (รวมต้องได้ 100)
                เดิมมีแค่คอลัมน์ "จังหวัด"/ปุ่ม ที่ตั้ง minWidth ไว้ — คอลัมน์อื่นเป็น % ล้วน
                พอจอแคบ (768px) จึงบีบสัดส่วนจนตัวอักษรเหลือตัวเดียว+จุดไข่ปลา แทนที่จะดัน .table-wrap ให้ scroll
                (ต่างจากตาราง /customers ที่ตั้ง minWidth ครบทุกคอลัมน์) → เติม minWidth ให้ครบเหมือนกัน */}
            {/* ── ความกว้างขั้นต่ำต้องรวมกันไม่เกินพื้นที่จริงของตาราง ─────────────────
                วัดจริง 11 ส.ค. 69 ที่จอ 1440: พื้นที่ตาราง = 1,128px
                ชุดเดิมรวมกัน 1,260px → เกินไป 132px ตารางจึงมีแถบเลื่อนแนวนอนคาอยู่ตลอด
                และคอลัมน์ปุ่มถูกดันออกนอกจอ (ผู้ใช้แจ้ง 11 ส.ค. 69)
                ชุดนี้รวม 1,128px — พอดีจอทำงานทั่วไปโดยยังไม่ต้องตัดปุ่มใด ๆ ออก
                (7 ก.ย. 69 ขยายคอลัมน์ลำดับ 42→68 แล้วเฉือนคอลัมน์ที่ตัดด้วยจุดไข่ปลาได้อยู่แล้วคืนมา 18px)
                จอกว้างกว่านั้นคอลัมน์จะยืดตาม % เองเหมือนตารางอื่นทั้งระบบ
                ⚠️ เพิ่ม/ลดคอลัมน์เมื่อไหร่ ต้องคำนวณผลรวมใหม่ทุกครั้ง (% ก็ต้องรวมได้ 100) */}
            {/* ⚠️ ทุกช่องมีระยะขอบซ้ายขวารวม 32px — minWidth ต้องเผื่อส่วนนี้เสมอ
                ไม่งั้นได้ความกว้างพอดีตัวอักษรแต่เนื้อหาโดนเฉือน (เคยได้ "C..." แทน "CNX") */}
            <colgroup>
              {/* ลำดับ — ต้องกว้างพอสำหรับเลข 3 หลัก (ตอนนี้มี 155 สาขา) + หัวคอลัมน์คำว่า "ลำดับ"
                  เดิม 42px พอแค่เลขหลักเดียว พอขึ้นหน้า 2 เลข 21–40 เลยโดนตัดเหลือ "2…" ทุกแถว
                  จนดูเหมือนลำดับไม่เรียง (บอสทัก 7 ก.ย. 69) */}
              <col style={{ width: "6%", minWidth: 68 }} />{/* ลำดับ */}
              <col style={{ width: 96 }} />{/* รหัส — ต้องอ่านครบ 5 ตัวอักษร (เช่น ZZWWW) ห้ามตัด · กว้างเป็นพิกเซล (minWidth ที่ col ไม่มีผล) */}
              <col style={{ width: "9%", minWidth: 90 }} />{/* ชื่อดีลเลอร์ — ยาวเกินตัดด้วยจุดไข่ปลา + tooltip (ยอมให้ตัดได้) */}
              <col style={{ width: "8%", minWidth: 78 }} />{/* จังหวัด — ยาวเกินตัด + tooltip เช่นกัน */}
              <col style={{ width: "8%", minWidth: 104 }} />{/* ภาค — ป้ายชื่อ ห้ามตัด (ยาวสุด "ตะวันออก" + ระยะขอบของป้าย) */}
              {/* แพ็กเกจ (บอสสั่ง 15 ก.ย. 69) — ป้าย "Exclusive" + ระยะขอบของป้าย ห้ามตัด · minWidth รวมทั้งตาราง 1,228px */}
              <col style={{ width: "7%", minWidth: 100 }} />
              <col style={{ width: "12%", minWidth: 148 }} />{/* ยอด / เป้า — เผื่อระยะขอบช่อง ไม่งั้นป้าย % โดนตัด */}
              <col style={{ width: "7%", minWidth: 92 }} />{/* โอกาสขาย */}
              <col style={{ width: "7%", minWidth: 80 }} />{/* ตรงเวลา — เนื้อหาเป็นป้าย % สั้น ๆ */}
              <col style={{ width: "7%", minWidth: 108 }} />{/* สถานะ — ป้ายชื่อ ห้ามตัด ("เปิดใช้งาน" + ระยะขอบของป้ายเอง) */}
              {/* คอลัมน์ปุ่ม: เข้าระบบ (~99px) + ไอคอน 5 ปุ่ม (28px × 5) + gap 4px × 5 ช่อง ≈ 259px
                  บวกระยะขอบช่อง 32px = 291px · ตั้ง 292px คือพอดีเนื้อหาจริงโดยไม่เผื่อทิ้งเปล่า
                  (เดิม 300px เผื่อไว้เกินจำเป็น ซึ่งไปเบียดพื้นที่คอลัมน์อื่นจนตารางล้นจอ) */}
              <col style={{ width: 140 }} />{/* ปุ่มเข้าระบบปุ่มเดียว (~99px + ระยะขอบ 32px) */}
            </colgroup>
            <thead>
              <tr>
                {/* หัวคอลัมน์ต้องสั้นพอที่จะไม่ถูกตัด (th ตั้ง white-space: nowrap ไว้ทั้งระบบ)
                    "โอกาสการขาย"/"ติดตามตรงเวลา" ยาวเกินความกว้างที่คอลัมน์นั้นต้องใช้จริง จึงย่อเหลือคำที่สื่อเท่ากัน */}
                {/* ⚠️ คอลัมน์ปุ่มถูก "ตรึงไว้ขวาสุด" (sticky) — บอสทัก 26 ส.ค. 69 ว่าปุ่มดูเหมือนโดนตัด
                    ที่จอ 1280 ตารางกว้าง 1120 แต่พื้นที่มีแค่ ~968 จึงต้องเลื่อนแนวนอน
                    เดิมปุ่มเลยหลุดออกนอกกรอบ ต้องเลื่อนก่อนถึงจะกดได้ (คนเห็นแล้วคิดว่าระบบพัง)
                    ตรึงไว้แบบนี้ ปุ่มอยู่ให้กดตลอดทุกความกว้างจอ โดยไม่ต้องตัดคอลัมน์ไหนทิ้ง */}
                {["ลำดับ", "รหัส", "ชื่อดีลเลอร์", "จังหวัด", "ภาค", "แพ็กเกจ", "ยอด / เป้า", "โอกาสขาย", "ตรงเวลา", "สถานะ", ""].map((h, i, arr) => (
                  <th key={i} style={i === arr.length - 1 ? ตรึงคอลัมน์ปุ่ม(true) : undefined}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={11} style={{ padding: "32px", textAlign: "center", fontSize: "0.8rem", color: "#6b7280" }}>{dealersLoaded ? "ไม่พบข้อมูล" : "กำลังโหลดข้อมูล…"}</td></tr>
              ) : pageSlice(filtered, Math.min(page, pageCountOf(filtered.length) - 1)).map((d, i) => (
                <ClickableRow key={d.id} className="clickable" style={{ opacity: dealerStatus(d) === "active" ? 1 : 0.55 }}
                  onActivate={() => router.push(`/hq/dealers/${d.code}`)} label={`เปิดรายละเอียดดีลเลอร์ ${d.name}`}>
                  <td style={{ fontSize: "0.72rem", color: "#6b7280", fontWeight: 600 }}>{Math.min(page, pageCountOf(filtered.length) - 1) * ROWS_PER_PAGE + i + 1}</td>
                  <td data-col="code" style={{ overflow: "visible", textOverflow: "clip" }}>
                    <span style={{ fontWeight: 800, color: "#003366", fontSize: "0.8rem", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{d.code}</span>
                  </td>
                  <td style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={d.name}>
                    <span style={{ fontSize: "0.86rem", fontWeight: 700, color: "#2D2D2D" }}>{d.name}</span>
                  </td>
                  <td style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: "0.82rem", color: "#374151" }} title={d.province}>
                    {d.province || "—"}
                  </td>
                  <td>
                    <span className="badge" style={{ background: "#f0f0f5", color: "#6b7280" }}>{d.region}</span>
                  </td>
                  <td><ป้ายแพ็กเกจ p={d.package} /></td>
                  <td><RevBar actual={perfOf(d.code).revenue} target={d.revenueTarget} /></td>
                  <td>
                    {perfOf(d.code).openLeads > 0
                      ? <span style={{ fontWeight: 700, color: "#2D2D2D", fontSize: "0.86rem" }}>{perfOf(d.code).openLeads}<span style={{ fontSize: "0.72rem", color: "#6b7280", fontWeight: 500 }}> โอกาสการขาย</span></span>
                      : <span style={{ color: "#C0C0C0", fontSize: "0.8rem" }}>—</span>}
                  </td>
                  <td><OnTimeBadge pct={perfOf(d.code).onTimePct} /></td>
                  <td>
                    <StatusBadge status={dealerStatus(d)} />
                  </td>
                  <td style={{ overflow: "visible", ...ตรึงคอลัมน์ปุ่ม() }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "nowrap", justifyContent: "flex-end" }}>
                      {canImpersonate && (
                        <button onClick={e => { e.stopPropagation(); enterDealer(d); }} disabled={entering === d.id} title="เข้าระบบแทนดีลเลอร์"
                          className="btn btn-primary btn-sm" style={{ opacity: entering === d.id ? 0.6 : 1, whiteSpace: "nowrap", flexShrink: 0 }}>
                          <LogIn size={12} /> {entering === d.id ? "..." : "เข้าระบบ"}
                        </button>
                      )}
                      {/* แถวเหลือ "เข้าระบบแทน" ปุ่มเดียว · กดแถวเปิดหน้ารายละเอียด (แก้ไข/ปิดใช้งาน/สถิติอยู่ที่นั่น) · ไม่มีลบดีลเลอร์ (บอสตัดสิน 19 ต.ค. 69) */}
                    </div>
                  </td>
                </ClickableRow>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination page={page} total={filtered.length} onPage={setPage} unit="สาขา" />
      </div>
      )}

      {/* แก้ไขข้อมูล / ปิดใช้งาน / สถิติ ย้ายไปหน้ารายละเอียดดีลเลอร์ · ลบดีลเลอร์และย้ายข้อมูลเอาออกทั้งระบบ (บอสตัดสิน 19 ต.ค. 69)
          โมดัล "รหัสเข้าระบบ/รีเซ็ตรหัสผ่าน" ย้ายไปเป็นการ์ดในหน้ารายละเอียดดีลเลอร์แล้ว (13 ส.ค. 69)
          ดู DealerCredentialsCard — ความสามารถเท่าเดิมทุกอย่าง */}
    </div>
  );
}
