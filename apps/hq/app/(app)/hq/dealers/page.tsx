"use client";
import { TopbarActions } from "@pms/shared/components/layout/TopbarActions";

import { useEffect, useState } from "react";
import { formatMoneyInput, parseMoneyInput } from "@pms/shared/lib/format";
import { ยืนยัน, แจ้งพลาด, แจ้งสำเร็จ } from "@pms/shared/components/ui/ConfirmToast";
import { ตรึงคอลัมน์ปุ่ม } from "@pms/shared/components/ui/stickyActionCol";
import { TablePagination, pageSlice, pageCountOf, ROWS_PER_PAGE } from "@pms/shared/components/ui/TablePagination";
import { ModalCard } from "@pms/shared/components/ui/ModalCard";
import { AdminGate } from "@pms/shared/components/layout/AdminGate";
import {
  DEFAULT_HQ_TARGETS, dealerStatusLabel, dealerStatusColor, fmtISOToThai,
  type DealerRow, type HQTargets, type DealerStatus,
} from "@pms/shared/lib/mock";
import { useRepoState, useRepoValue } from "@pms/shared/lib/useRepoState";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import { REAL_BACKEND } from "@pms/shared/lib/data/config";
import { dealers as dealersRepo, settings as settingsRepo, dealerSettings as dealerSettingsRepo, prospects as prospectsRepo } from "@pms/shared/lib/data";
import { provincesOfRegion, ALL_REGIONS, ALL_PROVINCES } from "@pms/shared/lib/provinces";
import { ClickableRow } from "@pms/shared/components/ui/ClickableRow";
import { deleteDealerAccount, impersonateDealer, listDealerLoginEmails, moveDealerData } from "@pms/shared/lib/adminApi";
import { CopyField, DealerPasswordField } from "@pms/shared/components/hq/DealerCredentialsCard";
import { useDealerPerformance, EMPTY_PERF } from "@pms/shared/lib/useDealerPerformance";
import { useRole } from "@pms/shared/context/RoleContext";
import { useAuditLogger } from "@pms/shared/lib/useAudit";
import { ExportMenu } from "@pms/shared/components/ui/ExportMenu";
import { useRouter } from "next/navigation";
import { Search, X, LogIn, Pencil, Trash2, EyeOff, Eye, AlertTriangle, BarChart2, Trophy, Target, Clock, Store, Coins, Briefcase, LayoutGrid, List, MapPin, Package, CalendarDays } from "lucide-react";
import { AccountRequestsCard } from "@pms/shared/components/hq/AccountRequestsCard";
import { TerritoryUnmatchedCard } from "@pms/shared/components/hq/TerritoryUnmatchedCard";
import { PACKAGE_ORDER, packageLabel } from "@pms/shared/lib/dealerProposals";
import type { DealerPackage } from "@pms/shared/lib/data/types";

const CARD: React.CSSProperties = { background: "#fff", borderRadius: 16, border: "1px solid #e5e7eb", boxShadow: "0 2px 14px rgba(0,51,102,.07)" };
const REGIONS = ["เหนือ", "กลาง", "ตะวันออก", "ตะวันตก", "ใต้", "อีสาน"];
/** รหัสของ "สำนักงานใหญ่" ในทะเบียนดีลเลอร์ — ดูแลทุกภาคทุกจังหวัด และตรึงไว้บนสุดของตารางเสมอ */
const HQ_CODE = "HQ";
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

function InputField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label className="form-label" style={{ textTransform: "none", letterSpacing: "normal", fontSize: "0.72rem" }}>{label}</label>
      {children}
    </div>
  );
}

const INPUT_STYLE: React.CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid #e5e7eb", fontSize: "0.8rem", color: "#2D2D2D", outline: "none", background: "#fafafa", boxSizing: "border-box" };

// ⛔ ห้ามสร้างฟังก์ชัน "เดาอีเมลจากรหัสสาขา" กลับมาอีก
//   เคยมี dealerLoginEmail(code) = `<code>@dealer.benjaminpebsteel.com` ซึ่งเป็นสูตรของบัญชีที่สร้างผ่านหน้าจอนี้
//   เท่านั้น · สาขาที่มีอยู่จริงใช้อีเมลธุรกิจของตัวเอง (CNX = sales@cmsteelbuild.co.th)
//   → หน้าจอโชว์อีเมลที่ไม่มีอยู่จริงคู่กับรหัสผ่านที่ถูกต้อง HQ คัดลอกไปแล้วเข้าระบบไม่ได้
//   อีเมลจริงต้องมาจาก /api/admin/dealers/logins เท่านั้น · ไม่รู้ = ขึ้น "—"

// รหัสผ่านใหม่ตอนรีเซ็ต — deterministic (ไม่สุ่ม) เดโมจึงทวนซ้ำได้
// nonce = ความยาวรหัสเดิม → กดรีเซ็ตซ้ำได้รหัสใหม่เรื่อย ๆ ไม่วนกลับมาซ้ำของเดิม
// ฟอร์แมต: PEB-{รหัส}-{4 หลัก}
function genResetPassword(code: string, nonce: number): string {
  const sum = code.split("").reduce((s, c) => s + c.charCodeAt(0), 0) + nonce * 7;
  return `PEB-${code}-${1000 + (sum % 9000)}`;
}

// ── Main page ───────────────────────────────────────────────────

// จัดการดีลเลอร์ (แก้ไข/รีเซ็ตรหัส/ลบ) = ต้องมีสิทธิ์ dealers:manage — HQ_STAFF เข้าไม่ได้

export default function HQDealersPage() {
  return <AdminGate perm="dealers:manage"><HQDealersPageInner /></AdminGate>;
}
function HQDealersPageInner() {
  const { login } = useRole();
  const logAudit = useAuditLogger(); // บันทึกการกระทำของ admin
  const router = useRouter();

  const [dealers, setDealers, dealersLoaded] = useRepoState<DealerRow[]>(() => dealersRepo.list(), (v) => dealersRepo.save(v), []);
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
  // เกณฑ์สี Win rate / ตรงเวลา = เป้าที่ HQ ตั้งไว้ (แหล่งเดียว) ไม่ hardcode
  const targets = useRepoValue<HQTargets>(() => settingsRepo.getTargets(), DEFAULT_HQ_TARGETS);
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

  // Modals
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<DealerRow | null>(null);
  const [form, setForm] = useState({ code: "", name: "", province: "", region: "", revenueTarget: 0, package: "" as DealerPackage | "", status: "active" as "active" | "inactive" });
  // เป้ายอดขายเป็นของดีลเลอร์รายนั้น — ตั้งจากเป้าในใบค่าแฟรนไชส์ตอนแปลงเป็นดีลเลอร์ (บอสตัดสิน 15 ต.ค. 69 · ใบ 0206)
  //   เป้าของแพ็กเกจ (ตั้งค่า › หาดีลเลอร์) = ค่าตั้งต้นตอนออกใบใหม่เท่านั้น ไม่ผูกกับดีลเลอร์แล้ว (เดิม 0178–0180)
  const [formErr, setFormErr] = useState("");
  // สาขาที่ลบไม่ได้เพราะยังมีข้อมูล → เปิดกล่อง "ย้ายข้อมูลไปสาขาอื่น" ให้แทนที่จะจบแค่แจ้งเตือน
  const [moveFrom, setMoveFrom] = useState<DealerRow | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const [moving, setMoving] = useState(false);
  const [moveErr, setMoveErr] = useState("");
  const [entering, setEntering] = useState<string | null>(null);
  const [selectedDealer, setSelectedDealer] = useState<DealerRow | null>(null);

  // ผลงานจริงจากใบเสนอราคา/ลูกค้าเป้าหมาย — ห้ามอ่าน d.revenueActual / d.winRate / d.activeProjects อีก
  // (คอลัมน์พวกนั้นเป็นค่าเดโมที่ seed ไว้ ไม่ขยับตามข้อมูลจริง และขัดกับหน้าแดชบอร์ด)
  const perf = useDealerPerformance();
  const perfOf = (code: string) => perf.get(code) ?? EMPTY_PERF;

  // Filter + sort — กรองจริงด้วยสถานะ/ภาค/ค้นหา (local ในหน้านี้ทั้งหมด)
  const filtered = dealers.filter(d => {
    if (statusFilter !== "all" && dealerStatus(d) !== statusFilter) return false;
    if (regionFilter !== "ทั้งหมด" && d.region !== regionFilter) return false;
    if (q && !`${d.code} ${d.name} ${d.province} ${d.region}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
    // สำนักงานใหญ่อยู่บนสุดเสมอ (บอสสั่ง 7 ก.ย. 69) — ไม่ใช่สาขาขาย จึงไม่ควรถูกยอดขายดันตกไปหน้าอื่น
    //   ตรึงก่อนเรียงยอด ไม่งั้นพอมี 155 ราย HQ (ยอด 0) จะไปโผล่หน้าสุดท้าย
  }).sort((a, b) => (b.code === HQ_CODE ? 1 : 0) - (a.code === HQ_CODE ? 1 : 0)
    // ถัดจาก HQ = ดีลเลอร์ที่เพิ่มล่าสุดขึ้นก่อน (บอสสั่ง 21 ก.ย. 69 ทุกตาราง) · เพิ่มพร้อมกัน/ไม่มีเวลา → ตามยอดขายเดิม
    || เวลาเพิ่ม(b) - เวลาเพิ่ม(a)
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

  function openEdit(d: DealerRow) { setEditTarget(d); setForm({ code: d.code, name: d.name, province: d.province, region: d.region, revenueTarget: d.revenueTarget, package: d.package ?? "", status: d.status }); setFormErr(""); setShowForm(true); }

  // เปลี่ยนภาค: อัปเดตภาค
  //   และล้างจังหวัดทิ้งถ้ามันไม่ได้อยู่ในภาคใหม่ — กันข้อมูลขัดกันเอง (เช่น ภาค "ใต้" + จังหวัด "เชียงใหม่")
  //   ซึ่งเคยเกิดได้เพราะจังหวัดเป็นช่องพิมพ์อิสระ ไม่ผูกกับภาคเลย
  //   เลือก "ทุกภาค" (สำนักงานใหญ่ ดูแลทั่วประเทศ) = เติมจังหวัดให้เป็น "ทุกจังหวัด" ทันที
  //   ไม่งั้นผู้ใช้ต้องไปเลือกจังหวัดอีกช่องทั้งที่ความหมายคือ "ไม่จำกัดจังหวัด" อยู่แล้ว
  function changeRegion(region: string) {
    setForm(f => ({
      ...f,
      region,
      province: region === ALL_REGIONS ? ALL_PROVINCES
        : provincesOfRegion(region).includes(f.province) ? f.province : "",
    }));
  }

  async function save() {
    // หน้านี้แก้ไขดีลเลอร์ที่มีอยู่ได้อย่างเดียว — สร้างดีลเลอร์ใหม่ต้องผ่านลูกค้าเป้าหมาย (/hq/prospects)
    if (!editTarget) return;
    const code = form.code.trim().toUpperCase();
    if (!code) { setFormErr("ต้องระบุรหัสดีลเลอร์"); return; }
    if (!form.name.trim()) { setFormErr("ต้องระบุชื่อดีลเลอร์"); return; }
    if (!form.region.trim()) { setFormErr("ต้องเลือกภาคก่อน — รายการจังหวัดขึ้นกับภาคที่เลือก"); return; }
    if (!form.province.trim()) { setFormErr("ต้องระบุจังหวัด"); return; }
    const dupe = dealers.find(d => d.code === code && d.id !== editTarget?.id);
    if (dupe) { setFormErr(`รหัส "${code}" มีอยู่แล้ว`); return; }

    if (editTarget) {
      setDealers(prev => prev.map(d => d.id === editTarget.id ? {
        ...d, name: form.name.trim(), province: form.province.trim(), region: form.region,
        revenueTarget: form.revenueTarget,
        package: form.package || null, status: form.status,
      } : d));
      logAudit("แก้ไขดีลเลอร์", `${code} · ${form.name.trim()}`);
      setShowForm(false);
      return;
    }

    // ⛔ ไม่มีการสร้างดีลเลอร์ตรง ๆ ที่หน้านี้แล้ว (บอสสั่ง 14 ก.ย. 69)
    //   ดีลเลอร์ต้องมาจากลูกค้าเป้าหมายที่สำเร็จแล้ว — /hq/prospects › ตั้งเป็นดีลเลอร์
    //   route สร้างดีลเลอร์ก็ปฏิเสธคำขอที่ไม่ผูกลูกค้าเป้าหมายด้วย (กันคนยิง API ตรง)
  }

  async function remove(d: DealerRow) {
    if (!(await ยืนยัน({
      หัวข้อ: `ลบ "${d.name}" ออกจากระบบ ?`,
      รายละเอียด: "การกระทำนี้ไม่สามารถย้อนกลับได้",
      ปุ่มตกลง: "ลบดีลเลอร์", อันตราย: true,
    }))) return;
    // โหมดจริง (supabase): ลบผ่าน route เซิร์ฟเวอร์ (service_role) → ลบบัญชี auth ของสาขาด้วย
    //   ไม่ทิ้งบัญชีกำพร้า · เดิม dealersRepo.remove ลบได้แค่แถว dealers (RLS) บัญชียังค้าง
    if (REAL_BACKEND) {
      void deleteDealerAccount(d.code).then(res => {
        if (!res.ok) {
          // สาขาที่ยังมีข้อมูลงานขายลบไม่ได้โดยตั้งใจ (409) — เดิมจบแค่แจ้งว่าลบไม่ได้
          // แล้วผู้ดูแลไม่มีทางไปต่อ นอกจากลบข้อมูลลูกค้าจริงทิ้ง ซึ่งไม่มีใครกล้าทำ
          // → เสนอทางที่สาม: ยกงานทั้งหมดให้สาขาที่รับช่วงต่อ แล้วค่อยลบสาขาที่ว่างแล้ว
          if (/ยังมีข้อมูล/.test(res.error)) { setMoveFrom(d); return; }
          แจ้งพลาด("ลบดีลเลอร์ไม่สำเร็จ: " + res.error); return;
        }
        // ลบสำเร็จ (หรือสำเร็จบางส่วน) = ทะเบียนสาขาหายไปจากระบบจริงแล้ว ต้องเอาออกจากหน้าจอเสมอ
        //   เดิมกรณี "สำเร็จบางส่วน" ถูกตีความเป็นล้มเหลว แล้วคงสาขาไว้บนจอ ทั้งที่ในระบบไม่มีแล้ว
        //   ผู้ดูแลจึงเห็นเหมือนสาขาฟื้นกลับมา และไม่รู้ว่ายังมีบัญชีค้างต้องเคลียร์
        setDealers(prev => prev.filter(x => x.id !== d.id));
        if (res.warning) แจ้งพลาด(res.warning);
        // audit บันทึกที่ route (server-side · การันตี) แล้ว — ไม่ลง client ซ้ำ
      });
      return;
    }
    // โหมดเดโม (local): ลบตรง ๆ — เดิมแค่เอาออกจากอาร์เรย์แล้วให้ชั้นข้อมูลเดาว่าต้องลบอะไร
    // การเดาแบบนั้นทำให้ "โหลดยังไม่เสร็จแล้วผู้ใช้แก้" กลายเป็นคำสั่งลบทั้งตาราง
    void dealersRepo.remove(d.code)
      .then(() => setDealers(prev => prev.filter(x => x.id !== d.id)))
      .catch(e => แจ้งพลาด("ลบดีลเลอร์ไม่สำเร็จ: " + friendlyError(e)));
    logAudit("ลบดีลเลอร์", `${d.code} · ${d.name}`);
  }

  function toggleStatus(d: DealerRow) {
    const next = d.status === "active" ? "inactive" : "active";
    setDealers(prev => prev.map(x => x.id === d.id ? { ...x, status: next } : x));
    // บันทึกให้ตรงกับสิ่งที่เกิดขึ้นจริง — เดิมเขียน "ระงับดีลเลอร์" ทั้งที่สั่ง "ปิดใช้งาน" (คนละคำกับที่ผู้ใช้กด)
    logAudit(next === "active" ? "เปิดใช้งานดีลเลอร์" : "ปิดใช้งานดีลเลอร์", `${d.code} · ${d.name}`);
  }

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
                      onClick={() => setSelectedDealer(d)}
                      onKeyDown={ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setSelectedDealer(d); } }}
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
                      <div style={{ display: "grid", gridTemplateColumns: canImpersonate ? "1fr auto auto" : "1fr 1fr", gap: 8, marginTop: 12 }} onClick={ev => ev.stopPropagation()}>
                        {canImpersonate && (
                          <button onClick={() => enterDealer(d)} disabled={entering === d.id} title="เข้าระบบแทนดีลเลอร์"
                            style={{ height: 36, borderRadius: 9, border: "none", background: "linear-gradient(180deg, #0a4a8a 0%, #003366 100%)", color: "#fff", fontSize: "0.78rem", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer", opacity: entering === d.id ? 0.6 : 1, fontFamily: "inherit", boxShadow: "0 3px 8px rgba(0,51,102,.22)" }}>
                            <LogIn size={13} /> {entering === d.id ? "..." : "เข้าระบบ"}
                          </button>
                        )}
                        <button onClick={() => router.push(`/hq/dealers/${d.code}`)} title="ดูรายละเอียดดีลเลอร์" aria-label={`ดูรายละเอียดดีลเลอร์ ${d.name}`}
                          style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", border: "1px solid #e3ebf5", borderRadius: 9, color: "#003366", cursor: "pointer" }}>
                          <BarChart2 size={14} />
                        </button>
                        <button onClick={() => openEdit(d)} title="แก้ไข" aria-label={`แก้ไขดีลเลอร์ ${d.name}`}
                          style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", border: "1px solid #e3ebf5", borderRadius: 9, color: "#003366", cursor: "pointer" }}>
                          <Pencil size={14} />
                        </button>
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
              <col style={{ width: "6%", minWidth: 68 }} />{/* รหัส — ต้องอ่านครบ 3 ตัวอักษร ห้ามตัด */}
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
              <col style={{ width: "23%", minWidth: 292 }} />
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
                  onActivate={() => setSelectedDealer(d)} label={`เปิดรายละเอียดดีลเลอร์ ${d.name}`}>
                  <td style={{ fontSize: "0.72rem", color: "#6b7280", fontWeight: 600 }}>{Math.min(page, pageCountOf(filtered.length) - 1) * ROWS_PER_PAGE + i + 1}</td>
                  <td>
                    <span style={{ fontWeight: 800, color: "#003366", fontSize: "0.8rem", letterSpacing: "0.05em" }}>{d.code}</span>
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
                      <button onClick={e => { e.stopPropagation(); router.push(`/hq/dealers/${d.code}`); }} title="ดูรายละเอียดดีลเลอร์"
                        style={{ width: 28, height: 28, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f4f8", border: "1px solid #e5e7eb", borderRadius: 7, color: "#003366", cursor: "pointer" }}>
                        <BarChart2 size={12} />
                      </button>
                      {/* ปุ่มรูปกุญแจ (ดูรหัสเข้าระบบ/รีเซ็ตรหัสผ่าน) ย้ายไปหน้ารายละเอียดดีลเลอร์แล้ว (บอสสั่ง 13 ส.ค. 69)
                          เป็นงานราย "สาขา" ไม่ใช่งานที่ต้องทำรัวจากลิสต์ · ตารางนี้เคยมีปุ่มต่อแถวถึง 6 ปุ่มจนแน่น
                          เข้าถึงได้ที่ปุ่มรูปกราฟข้างบน → การ์ด "ข้อมูลเข้าระบบของดีลเลอร์" ในแท็บภาพรวม */}
                      <button onClick={e => { e.stopPropagation(); openEdit(d); }} title="แก้ไข" aria-label={`แก้ไขดีลเลอร์ ${d.name}`}
                        style={{ width: 28, height: 28, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 7, color: "#6b7280", cursor: "pointer" }}>
                        <Pencil size={12} />
                      </button>
                      <button onClick={e => { e.stopPropagation(); toggleStatus(d); }} title={d.status === "active" ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                        style={{ width: 28, height: 28, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 7, color: "#6b7280", cursor: "pointer" }}>
                        {d.status === "active" ? <EyeOff size={12} /> : <Eye size={12} />}
                      </button>
                      <button onClick={e => { e.stopPropagation(); remove(d); }} title="ลบ"
                        style={{ width: 28, height: 28, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", border: "1px solid #fee2e2", borderRadius: 7, color: "#dc2626", cursor: "pointer" }}>
                        <Trash2 size={12} />
                      </button>
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

      {/* ── Add / Edit Modal ── */}
      {showForm && (
        <div onClick={() => setShowForm(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.42)", zIndex: 1050, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <ModalCard onClose={() => setShowForm(false)} label="ฟอร์มข้อมูลดีลเลอร์" className="modal-fit" style={{ ...CARD, width: 460, maxWidth: '100%' }}>
            <div style={{ padding: "18px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 800, color: "#2D2D2D" }}>แก้ไขข้อมูลดีลเลอร์</h2>
              <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", display: "flex" }}><X size={18} /></button>
            </div>
            <div className="modal-fit-body" style={{ padding: "18px 20px" }}>
              {formErr && <div style={{ background: "#fee2e2", border: "1px solid #dc262630", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: "0.8rem", color: "#dc2626", fontWeight: 600 }}>{formErr}</div>}

              <div className="form-grid" style={{ gridTemplateColumns: "1fr 2fr" }}>
                <div className="form-section">ข้อมูลดีลเลอร์</div>
                <InputField label="รหัสดีลเลอร์ *">
                  <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase().slice(0, 6) }))} placeholder="เช่น BKK" disabled={!!editTarget}
                    style={{ ...INPUT_STYLE, textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.06em", opacity: editTarget ? 0.6 : 1 }} />
                  {editTarget && <div style={{ fontSize: "0.65rem", color: "#6b7280", marginTop: 3 }}>แก้ไขรหัสไม่ได้</div>}
                </InputField>
                <InputField label="ชื่อดีลเลอร์ *">
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="บจ. ตัวอย่างสตีล..." style={INPUT_STYLE} />
                </InputField>
              </div>

              <div className="form-grid">
                <div className="form-section">พื้นที่รับผิดชอบ</div>
                {/* ภาคมาก่อนจังหวัด — เพราะจังหวัดที่เลือกได้ขึ้นกับภาคที่เลือกไว้ */}
                <InputField label="ภาค *">
                  {/* ต้องมี "ยังไม่ระบุ" เหมือนช่องอื่น — เดิมเด้งเป็น "กลาง" ให้เองทั้งที่ไม่มีใครเลือก
                      และติดดาว * เพราะ "จังหวัด" ขึ้นกับภาค — ไม่เลือกภาคก็เลือกจังหวัดไม่ได้เลย (ผู้ใช้แจ้ง 18 ส.ค. 69) */}
                  <select aria-label="ภูมิภาค" value={form.region} onChange={e => changeRegion(e.target.value)} style={{ ...INPUT_STYLE, cursor: "pointer" }}>
                    <option value="">— ยังไม่ระบุ —</option>
                    {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                    {/* สำนักงานใหญ่ดูแลทั้งประเทศ — เลือกอันนี้แล้วจังหวัดจะเป็น "ทุกจังหวัด" ให้เอง */}
                    <option value={ALL_REGIONS}>{ALL_REGIONS} (ทั่วประเทศ)</option>
                  </select>
                </InputField>
                <InputField label="จังหวัดที่ตั้ง *">
                  {/* จังหวัดของดีลเลอร์เดิมที่ไม่อยู่ในรายการของภาคนั้น (สะกดต่าง/ข้อมูลเก่า) ต้องยังเห็นค่าเดิมอยู่
                      ไม่งั้นแค่เปิดฟอร์มมาแก้ชื่อ จังหวัดก็หายไปเงียบ ๆ แล้วถูกบันทึกทับเป็นค่าว่าง */}
                  <select aria-label="จังหวัดที่ตั้ง" value={form.province} onChange={e => setForm(f => ({ ...f, province: e.target.value }))}
                    style={{ ...INPUT_STYLE, cursor: "pointer" }}>
                    <option value="">{form.region ? "— ยังไม่ระบุ —" : "— เลือกภาคก่อน —"}</option>
                    {/* ภาค = ทุกภาค → เลือก "ทุกจังหวัด" ได้ และยังเจาะจงจังหวัดเดียวได้ถ้าต้องการ */}
                    {form.region === ALL_REGIONS && <option value={ALL_PROVINCES}>{ALL_PROVINCES}</option>}
                    {provincesOfRegion(form.region).map(p => <option key={p} value={p}>{p}</option>)}
                    {form.province && form.province !== ALL_PROVINCES && !provincesOfRegion(form.region).includes(form.province) && (
                      <option value={form.province}>{form.province} (นอกภาค {form.region})</option>
                    )}
                  </select>
                </InputField>
                <div className="form-section">เป้าหมายและสถานะ</div>
                <InputField label="แพ็กเกจ">
                  <select aria-label="แพ็กเกจดีลเลอร์" value={form.package} onChange={e => setForm(f => ({ ...f, package: e.target.value as DealerPackage | "" }))}
                    style={{ ...INPUT_STYLE, cursor: "pointer" }}>
                    <option value="">— ยังไม่ระบุ —</option>
                    {PACKAGE_ORDER.map(k => <option key={k} value={k}>{packageLabel[k]}</option>)}
                  </select>
                </InputField>
                <InputField label="เป้ายอดขาย (บาท/ปี)">
                  {/* เป้ายอดขายติดลบไม่มีอยู่จริงในทางธุรกิจ และทำให้ตัวเลขอื่นเพี้ยนตามเป็นทอด ๆ:
                      เปอร์เซ็นต์ความสำเร็จของสาขา · เป้ารวมทั้งเครือบนหัวตาราง · กราฟเทียบเป้า
                      เดิมรับค่าติดลบตรง ๆ (พิมพ์ -5000000 แล้วบันทึกลงระบบได้จริง · พบ 6 ส.ค. 69) */}
                  {/* ช่องเงินใช้ text + ใส่ลูกน้ำเอง — type="number" ใส่ลูกน้ำไม่ได้ และหลักล้านอ่านยากมาก (บอสสั่ง 26 ส.ค. 69) */}
                  {/* เป้าเป็นของดีลเลอร์รายนี้ — ตั้งจากเป้าในใบค่าแฟรนไชส์ตอนแปลงเป็นดีลเลอร์ แก้เองได้ทีหลัง
                      แก้เป้าของแพ็กเกจที่ตั้งค่าไม่ทับเป้าของดีลเลอร์ที่มีอยู่ (บอสตัดสิน 15 ต.ค. 69 · ใบ 0206) */}
                  <input type="text" inputMode="numeric" aria-label="เป้ายอดขายทั้งปี"
                    value={form.revenueTarget ? formatMoneyInput(String(form.revenueTarget)) : ""}
                    onChange={e => setForm(f => ({ ...f, revenueTarget: parseMoneyInput(e.target.value) }))}
                    placeholder="0" style={INPUT_STYLE} />
                </InputField>
                <InputField label="สถานะ">
                  {/* ต้องมีค่าเสมอ — ดีลเลอร์ต้องเป็นเปิดหรือปิดใช้งานอย่างใดอย่างหนึ่ง ว่างไม่ได้ */}
                  <select aria-label="สถานะดีลเลอร์" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as DealerStatus }))} style={{ ...INPUT_STYLE, cursor: "pointer" }}>
                    <option value="active">{dealerStatusLabel.active}</option>
                    <option value="inactive">{dealerStatusLabel.inactive}</option>
                  </select>
                </InputField>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
                <button onClick={() => setShowForm(false)} className="btn btn-secondary btn-md">ยกเลิก</button>
                <button onClick={() => void save()} className="btn btn-primary btn-md">บันทึกการแก้ไข</button>
              </div>
            </div>
          </ModalCard>
        </div>
      )}

      {/* ── ย้ายข้อมูลไปสาขาอื่น (ทางออกของสาขาที่ลบไม่ได้เพราะยังมีข้อมูล) ── */}
      {moveFrom && (
        <div onClick={() => !moving && setMoveFrom(null)}
          style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(45,45,45,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <ModalCard onClose={() => !moving && setMoveFrom(null)} label="ย้ายข้อมูลดีลเลอร์"
            style={{ width: "100%", maxWidth: 520, background: "#fff", borderRadius: 18, overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,.28)" }}>
            <div style={{ background: "#003366", color: "#fff", padding: "16px 22px", fontWeight: 800 }}>
              ลบ &quot;{moveFrom.name}&quot; ไม่ได้ — ยังมีข้อมูลอยู่
            </div>
            <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ fontSize: "0.84rem", color: "#2D2D2D", lineHeight: 1.7 }}>
                สาขานี้ยังมีลูกค้า/ลูกค้าเป้าหมาย/ใบเสนอราคาอยู่ ระบบจึงไม่ยอมให้ลบ (กันข้อมูลการขายหายถาวร)
                <br />ยกงานทั้งหมดให้สาขาที่รับช่วงต่อก่อน แล้วค่อยลบสาขานี้ได้
              </div>
              <div>
                <label className="form-label">ย้ายไปที่สาขา</label>
                <select className="form-input" value={moveTo} onChange={e => { setMoveTo(e.target.value); setMoveErr(""); }} disabled={moving}>
                  <option value="">— เลือกสาขาปลายทาง —</option>
                  {dealers.filter(x => x.code !== moveFrom.code).map(x => (
                    <option key={x.code} value={x.code}>{x.code} · {x.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: "10px 14px", fontSize: "0.76rem", color: "#9a3412", lineHeight: 1.6 }}>
                <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>
                  ย้ายได้เฉพาะเข้าสาขาที่ <b>ยังไม่มีข้อมูล</b> — ระบบนับเลขที่รายการแยกรายสาขา
                  ถ้าปลายทางมีข้อมูลอยู่แล้วเลขจะชนกัน ระบบจะปฏิเสธและไม่แก้อะไรเลย
                  <br />ย้ายแล้ว<b>ย้อนกลับอัตโนมัติไม่ได้</b> · ตั้งค่าสาขา (โลโก้/หัวกระดาษ) ไม่ย้ายตามไป
                </span>
              </div>
              {moveErr && <div style={{ fontSize: "0.8rem", color: "#dc2626", fontWeight: 600, lineHeight: 1.6 }}>{moveErr}</div>}
            </div>
            <div style={{ padding: "14px 22px", borderTop: "1px solid #e5e7eb", background: "#fafafa", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn btn-secondary btn-md" disabled={moving} onClick={() => setMoveFrom(null)}>ยกเลิก</button>
              <button className="btn btn-primary btn-md" disabled={!moveTo || moving}
                style={!moveTo || moving ? { opacity: .5, cursor: "not-allowed" } : undefined}
                onClick={async () => {
                  if (!moveTo) return;
                  setMoving(true); setMoveErr("");
                  const res = await moveDealerData(moveFrom.code, moveTo);
                  setMoving(false);
                  if (!res.ok) { setMoveErr(res.error); return; }
                  setMoveFrom(null); setMoveTo("");
                  แจ้งสำเร็จ(`ย้ายข้อมูล ${res.total} รายการจาก "${moveFrom.code}" ไป "${moveTo}" เรียบร้อย — ลบสาขา "${moveFrom.code}" ได้แล้ว`);
                }}>
                {moving ? "กำลังย้าย…" : "ย้ายข้อมูล"}
              </button>
            </div>
          </ModalCard>
        </div>
      )}

      {/* ── Dealer Detail Drawer ──
          ออกแบบใหม่ 22 ก.ย. 69 (บอสสั่ง "ให้เข้ากับการทำงานและการแสดงค่าปัจจุบัน"):
          • แสดงค่าที่ระบบใช้จริงตอนนี้: แพ็กเกจ · ที่มาของเป้า (ตามแพ็กเกจ/กำหนดเอง/กรอกเอง) · จังหวัด+ภาค · วันเข้าระบบ
          • ตัดข้อความคาดเดา ("คาดว่าปิดได้ครบก่อนสิ้นไตรมาส" — เป้าเป็นรายปี ระบบไม่ได้พยากรณ์) เหลือเฉพาะข้อเท็จจริง
          • หัว/ท้ายแผงไม่หดตาม เนื้อหาเลื่อนอยู่ระหว่างกลาง (เดิมหัวแผงบังการ์ดยอดขาย) */}
      {selectedDealer && (() => {
        const d = selectedDealer;
        const dPerf = perfOf(d.code);
        const มีเป้า = d.revenueTarget > 0;
        const revPct = มีเป้า ? Math.round(dPerf.revenue / d.revenueTarget * 100) : 0;
        const revColor = !มีเป้า ? "#6b7280" : revPct >= 100 ? "#059669" : revPct >= 75 ? "#003366" : revPct >= 50 ? "#f59e0b" : "#dc2626";
        // ระดับผลงานตัดสินจาก % เป้า + อัตราปิดการขาย (ข้อมูลที่ระบบมีจริง) · ไม่มีเป้า = ไม่ติดป้าย
        const wr = dPerf.winRate ?? 0;
        const tier = !มีเป้า ? null : revPct >= 90 && wr >= 50
          ? { label: "ดีลเลอร์ดีเด่น", color: "#059669", bg: "#e5faf0" }
          : revPct >= 70 && wr >= 35
          ? { label: "ผลงานดี", color: "#003366", bg: "#dce5f0" }
          : revPct >= 50
          ? { label: "กำลังพัฒนา", color: "#f59e0b", bg: "#fef3cd" }
          : { label: "ต้องปรับปรุง", color: "#dc2626", bg: "#fee2e2" };
        const ที่มาเป้า = มีเป้า ? "" : "ยังไม่ได้ตั้งเป้า";
        const ขาดอีก = Math.max(0, d.revenueTarget - dPerf.revenue);
        const บาท = (n: number) => n >= 1_000_000 ? `฿${(n / 1_000_000).toFixed(1)}M` : `฿${Math.round(n).toLocaleString("th-TH")}`;
        const เข้าระบบเมื่อ = d.createdAt ? fmtISOToThai(d.createdAt.slice(0, 10)) : "—";
        // เรื่องที่ควรดู — ข้อเท็จจริงจากตัวเลขเท่านั้น ไม่พยากรณ์
        const ควรดู: { tone: "bad" | "warn" | "good"; text: string }[] = [];
        if (dealerStatus(d) === "inactive") ควรดู.push({ tone: "warn", text: "ปิดใช้งานอยู่ — ดีลเลอร์เข้าระบบไม่ได้" });
        if (!มีเป้า) ควรดู.push({ tone: "warn", text: d.package ? `แพ็กเกจ ${packageLabel[d.package]} ยังไม่ได้ตั้งเป้า — ตั้งที่ ตั้งค่า › หาดีลเลอร์` : "ยังไม่มีเป้ายอดขาย — กำหนดได้ที่ปุ่มแก้ไข" });
        if (มีเป้า && revPct >= 100) ควรดู.push({ tone: "good", text: `ถึงเป้าทั้งปีแล้ว${revPct > 100 ? ` · เกินเป้า ${revPct - 100}%` : ""}` });
        if (dPerf.winRate !== null && wr < targets.winRateTarget) ควรดู.push({ tone: wr < targets.winRateTarget - 15 ? "bad" : "warn", text: `อัตราปิดการขาย ${wr}% ต่ำกว่าเป้าเครือ ${targets.winRateTarget}%` });
        if (dPerf.onTimePct !== null && dPerf.onTimePct < targets.onTimeTarget) ควรดู.push({ tone: dPerf.onTimePct < targets.onTimeTarget - 15 ? "bad" : "warn", text: `ติดตามตรงเวลา ${dPerf.onTimePct}% ต่ำกว่าเป้าเครือ ${targets.onTimeTarget}%` });
        const สีโทน = { bad: "#dc2626", warn: "#b45309", good: "#059669" } as const;
        const หัวข้อ: React.CSSProperties = { fontSize: "0.65rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 };
        const แถว = (ไอคอน: React.ReactNode, ป้าย: string, ค่า: React.ReactNode) => (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: "1px solid #f1f5f9", fontSize: "0.8rem" }}>
            <span style={{ color: "#9ca3af", display: "flex" }}>{ไอคอน}</span>
            <span style={{ color: "#6b7280", width: 92, flexShrink: 0 }}>{ป้าย}</span>
            <span style={{ color: "#1f2937", fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{ค่า}</span>
          </div>
        );
        const ตัวเลข = [
          { v: dPerf.winRate === null ? "—" : `${wr}%`, l: "อัตราปิดการขาย", c: dPerf.winRate === null ? "#C0C0C0" : wr >= targets.winRateTarget ? "#059669" : wr >= targets.winRateTarget - 15 ? "#f59e0b" : "#dc2626" },
          { v: dPerf.onTimePct === null ? "—" : `${dPerf.onTimePct}%`, l: "ติดตามตรงเวลา", c: dPerf.onTimePct === null ? "#C0C0C0" : dPerf.onTimePct >= targets.onTimeTarget ? "#059669" : dPerf.onTimePct >= targets.onTimeTarget - 15 ? "#f59e0b" : "#dc2626" },
          { v: String(dPerf.openLeads), l: "โอกาสการขาย", c: "#003366" },
        ];
        return (
          <>
            <div onClick={() => setSelectedDealer(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.3)", zIndex: 1040 }} />
            <div className="modal-pop" role="dialog" aria-label={`รายละเอียดดีลเลอร์ ${d.name}`} style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 920, maxWidth: "calc(100vw - 32px)", maxHeight: "calc(100vh - 48px)", background: "#fff", zIndex: 1050, borderRadius: 18, boxShadow: "0 24px 80px rgba(0,0,0,.28)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {/* Header */}
              <div style={{ padding: "18px 20px 16px", borderBottom: "1px solid #e5e7eb", background: "#f8f9fb", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 900, fontSize: "0.8rem", color: "#003366", background: "#dce5f0", padding: "3px 10px", borderRadius: 8, letterSpacing: "0.06em" }}>{d.code}</span>
                    <StatusBadge status={dealerStatus(d)} />
                    {d.package && <ป้ายแพ็กเกจ p={d.package} />}
                    {tier && <span className="badge" style={{ background: tier.bg, color: tier.color }}>{tier.label}</span>}
                  </div>
                  <button onClick={() => setSelectedDealer(null)} aria-label="ปิด" style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", display: "flex" }}><X size={18} /></button>
                </div>
                <div style={{ fontSize: "1.02rem", fontWeight: 800, color: "#2D2D2D", marginBottom: 2 }}>{d.name}</div>
                <div style={{ fontSize: "0.74rem", color: "#6b7280", display: "flex", alignItems: "center", gap: 5 }}>
                  <MapPin size={12} /> {[d.province, d.region && `ภาค${d.region}`].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>

              {/* Scrollable content */}
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 20px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))", gap: 12, alignItems: "start" }}>
                {/* แนวกว้าง (บอสสั่ง 22 ก.ย. 69): ซ้าย = ผลงาน · ขวา = ข้อมูลดีลเลอร์/เข้าระบบ · จอแคบเรียงเป็นคอลัมน์เดียว */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>

                {/* ยอดขายเทียบเป้าทั้งปี + ที่มาของเป้า */}
                <div style={{ background: "#f8f9fb", border: "1px solid #e5e7eb", borderRadius: 12, padding: "14px 16px", flexShrink: 0 }}>
                  <div style={{ ...หัวข้อ, display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span>ยอดขายเทียบเป้าทั้งปี</span>
                    <span style={{ textTransform: "none", letterSpacing: 0, color: "#003366" }}>{ที่มาเป้า}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: "1.5rem", fontWeight: 800, color: revColor, fontVariantNumeric: "tabular-nums" }}>{บาท(dPerf.revenue)}</span>
                    <span style={{ fontSize: "0.74rem", color: "#6b7280" }}>เป้า {มีเป้า ? บาท(d.revenueTarget) : "—"}</span>
                  </div>
                  <div style={{ height: 8, background: "#e5e7eb", borderRadius: 99, overflow: "hidden", marginBottom: 6 }}>
                    <div className="bar-grow" style={{ height: "100%", width: `${Math.min(revPct, 100)}%`, background: revColor, borderRadius: 99 }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: "0.74rem" }}>
                    <span style={{ fontWeight: 700, color: revColor }}>{มีเป้า ? `${revPct}% ของเป้า` : "ยังไม่ได้ตั้งเป้า"}</span>
                    {มีเป้า && <span style={{ color: "#6b7280" }}>{ขาดอีก > 0 ? `ขาดอีก ${บาท(ขาดอีก)}` : "ถึงเป้าแล้ว"}</span>}
                  </div>
                </div>

                {/* 3 ตัวเลขหลัก */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, flexShrink: 0 }}>
                  {ตัวเลข.map(m => (
                    <div key={m.l} style={{ background: "#f8f9fb", border: "1px solid #e5e7eb", borderRadius: 12, padding: "12px 8px", textAlign: "center" }}>
                      <div style={{ fontSize: "1.15rem", fontWeight: 800, color: m.c, fontVariantNumeric: "tabular-nums" }}>{m.v}</div>
                      <div style={{ fontSize: "0.65rem", color: "#6b7280", fontWeight: 600, marginTop: 3 }}>{m.l}</div>
                    </div>
                  ))}
                </div>

                {/* ควรดู */}
                <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: "14px 16px", flexShrink: 0 }}>
                  <div style={หัวข้อ}>ควรดู</div>
                  {ควรดู.length === 0 ? (
                    <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>ไม่มีเรื่องที่ต้องดูตอนนี้</div>
                  ) : ควรดู.map((x, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: i ? 8 : 0, fontSize: "0.8rem", color: สีโทน[x.tone] }}>
                      {x.tone === "good" ? <Trophy size={14} style={{ flexShrink: 0, marginTop: 1 }} /> : <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />}
                      <span>{x.text}</span>
                    </div>
                  ))}
                </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
                {/* ข้อมูลดีลเลอร์ — ค่าปัจจุบันในทะเบียน */}
                <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: "14px 16px 8px", flexShrink: 0 }}>
                  <div style={หัวข้อ}>ข้อมูลดีลเลอร์</div>
                  {แถว(<Package size={14} />, "แพ็กเกจ", d.package ? packageLabel[d.package] : "—")}
                  {แถว(<Target size={14} />, "เป้าทั้งปี", มีเป้า ? `฿${d.revenueTarget.toLocaleString("th-TH")}` : "—")}
                  {แถว(<MapPin size={14} />, "จังหวัด", d.province || "—")}
                  {แถว(<Store size={14} />, "ภาค", d.region || "—")}
                  {แถว(<CalendarDays size={14} />, "เข้าระบบเมื่อ", เข้าระบบเมื่อ)}
                </div>

                {/* Credentials */}
                <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: "14px 16px", flexShrink: 0 }}>
                  <div style={หัวข้อ}>ข้อมูลเข้าสู่ระบบ</div>
                  <CopyField label="อีเมล" value={loginEmailOf(d.code)} />
                  {/* ช่องเดียวกับในหน้าต่าง "รหัสเข้าระบบ" — ต้องใช้ตัวเดียวกันทั้งสองที่ (เดิมค้างเป็น "—" เสมอ) */}
                  <DealerPasswordField code={d.code} fallback={d.credentials?.password} />
                </div>
                </div>
              </div>

              {/* Footer */}
              <div style={{ padding: "14px 20px", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 8, flexShrink: 0 }}>
                {/* แผงแนวกว้าง: ปุ่มชิดขวาขนาดตามข้อความ — เดิม flex:1 ยืดเต็มแถบ 920px ยาวเกินไป (บอสทัก 22 ก.ย. 69) */}
                <button onClick={e => { e.stopPropagation(); router.push(`/hq/dealers/${d.code}`); }}
                  className="btn btn-primary btn-md" style={{ justifyContent: "center", minWidth: 170 }}>
                  <BarChart2 size={14} /> ดูรายละเอียดเต็ม
                </button>
                {canImpersonate && (
                  <button onClick={e => { e.stopPropagation(); enterDealer(d); }} disabled={entering === d.id}
                    className="btn btn-tint btn-md" style={{ cursor: entering === d.id ? "not-allowed" : "pointer", opacity: entering === d.id ? 0.7 : 1 }}>
                    <LogIn size={14} /> {entering === d.id ? "กำลังเข้า..." : "เข้าระบบ"}
                  </button>
                )}
                <button onClick={e => { e.stopPropagation(); setSelectedDealer(null); openEdit(d); }}
                  className="btn btn-tint btn-md">
                  <Pencil size={14} /> แก้ไข
                </button>
              </div>
            </div>
          </>
        );
      })()}

      {/* โมดัล "รหัสเข้าระบบ/รีเซ็ตรหัสผ่าน" ย้ายไปเป็นการ์ดในหน้ารายละเอียดดีลเลอร์แล้ว (13 ส.ค. 69)
          ดู DealerCredentialsCard — ความสามารถเท่าเดิมทุกอย่าง */}
    </div>
  );
}
