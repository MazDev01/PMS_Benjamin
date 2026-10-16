"use client";

// ─── HQ · ตั้งค่า (Enterprise Administration) ──────────────────────────────────
// แท็บแนวนอน 6 หัวข้อ (เลย์เอาต์เดียวกับหน้าตั้งค่าดีลเลอร์ /settings):
//   บริษัท · ผู้ใช้งานและสิทธิ์ · เส้นทางการขาย · ดีลเลอร์ · เป้าหมายยอดขาย · การแจ้งเตือน
// แท็บ "กฎธุรกิจ" ถูกยุบเข้า "เส้นทางการขาย" (เหลือ: เหตุผลปิดไม่สำเร็จ) — คีย์ localStorage เดิมทุกตัว ค่าที่ตั้งไว้ไม่หาย
// การ์ดที่เป็นข้อความนโยบายล้วน ๆ (นโยบายราคา · ประเภทสินค้าและแม่แบบ) บอสสั่งลบ 17 ก.ค. 69 — ไม่มีช่องตั้งค่า ไม่ต้องมีในหน้าตั้งค่า
// การ์ด "กฎใบเสนอราคา" (VAT · อายุใบ · เลขที่) บอสสั่งลบ 17 ก.ค. 69 — ค่ายังทำงานอยู่แต่ตรึงที่ค่าตั้งต้น แก้ผ่านหน้าจอไม่ได้แล้ว
// ดีลเลอร์ไม่มีสิทธิ์เข้าหน้านี้ · ทุกอย่างชิดซ้าย · ปุ่มบันทึก/รีเซ็ตอยู่บนแถบบน
//
// ไม่มีในหน้านี้ (ตัดตามสเปก): สินทรัพย์แบรนด์ · โลโก้/ธีม/สี/ฟอนต์ · ความปลอดภัย · SLA · LSA · AI · ส่วนลด
//
// กติกาของหน้านี้: ทุกช่องตั้งค่าต้องมีโค้ดอ่านไปใช้จริง — ห้ามมีช่องที่กดแล้วไม่เกิดอะไร
//   (เกณฑ์ 48 ชม. / 7 วัน ย้ายไปหน้าตั้งค่าของดีลเลอร์แล้ว — ดีลเลอร์ตั้งเอง แยกรายสาขา)
//   กฎแจ้งเตือนงาน HQ    → กระดิ่ง HQ (ผ่าน @pms/shared/lib/hqAlerts)
//   เหตุผลปิดไม่สำเร็จ     → ตัวเลือกตอนปิดดีลของดีลเลอร์ (loadLostReasons)
//   เป้าทั้งปี            → แดชบอร์ด HQ + แดชบอร์ดดีลเลอร์
import {
  useState, useEffect, useRef, useCallback, useMemo, useContext,
  type ReactNode, type Dispatch, type SetStateAction,
} from "react";
import { useRouter } from "next/navigation";
import { NumberInput } from "@pms/shared/components/ui/NumberInput";
import { ยืนยัน } from "@pms/shared/components/ui/ConfirmToast";
import { useRepoState } from "@pms/shared/lib/useRepoState";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import { useDealerPerformance, EMPTY_PERF } from "@pms/shared/lib/useDealerPerformance";
import { regionDisplay } from "@pms/shared/lib/hqQuotations";
import { TablePagination, pageSlice, pageCountOf } from "@pms/shared/components/ui/TablePagination";
import { fmtBahtM as fmtB, formatMoneyInput, parseMoneyInput } from "@pms/shared/lib/format";
import {
  DEFAULT_RECRUIT_SETTINGS, จำนวนรายการสูงสุด, ความยาวรายการสูงสุด,
  type HQRecruitSettings, type คีย์งานหาดีลเลอร์, type ค่าตั้งแพ็กเกจ,
} from "@pms/shared/lib/recruitSettings";
import { งานมาตรฐาน } from "@pms/shared/lib/prospectJourney";
import { prospectStatusLabel, prospectStatusColor } from "@pms/shared/lib/dealerProspects";
import { PACKAGE_ORDER, packageLabel } from "@pms/shared/lib/dealerProposals";
import { REGIONS, type Region } from "@pms/shared/lib/provinces";
import { settings as settingsRepo, dealers as dealersRepo, hqCompany as hqCompanyRepo } from "@pms/shared/lib/data";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { สร้างไฟล์Xlsx, ดาวน์โหลดไฟล์ } from "@pms/shared/lib/exportWorkbook";
import { สร้างแผ่นงานสำรอง, อ่านแผ่นงานสำรอง, type ชุดการตั้งค่า } from "@pms/shared/lib/settingsBackup";
import { อ่านสมุดงานจากไฟล์ } from "@pms/shared/lib/importSheet";
import { APP_NOW_ISO } from "@pms/shared/context/FilterContext";
import type { HQCompany, DealerPackage } from "@pms/shared/lib/data/types";
import { AdminGate } from "@pms/shared/components/layout/AdminGate";
import {
  DEFAULT_HQ_POLICY,
  DEFAULT_HQ_TARGETS,
  HQ_NOTIF_EVENTS, DEFAULT_HQ_NOTIFS, HQ_NOTIF_UPDATED_EVENT,
  DEFAULT_HQ_NOTIF_RULES,
  HQ_ALERT_META, เกณฑ์วันแจ้งเตือน, leadStatusLabel, leadStatusColor, LEAD_TASK_TEMPLATE, LEAD_STATUS_ORDER,
  LOST_REASONS,
  type HQPolicy, type HQTargets, type HQNotifChannels, type HQNotifRules,
  type HQAlertKey, type DealerRow, type LeadStatus, type LeadTaskDef,
  OTHER_REASON_OPTION,
} from "@pms/shared/lib/mock";
// แท็บ "บริษัท" / "ผู้ใช้งาน" ฝังหน้าจัดการจริงเต็ม
import { CompanyPanel } from "@pms/shared/components/hq/CompanyPanel";
import { UsersPanel } from "@pms/shared/components/hq/UsersPanel";
import { TopbarActions } from "@pms/shared/components/layout/TopbarActions";
import { useAuditLogger } from "@pms/shared/lib/useAudit";
import { useUnsavedGuard } from "@pms/shared/lib/useUnsavedGuard";
import { SettingsBusCtx as BusCtx, type SectionApi } from "@pms/shared/lib/settingsBus";
import {
  Building2, Users, GitMerge, Target, Bell, UserPlus, FileText, MessageSquare, ArrowUp, ArrowDown,
  Save, RotateCcw, Plus, Trash2, Check, X,
  Download, Upload, RefreshCw, AlertCircle,
  ShieldCheck,
  Mail,
} from "lucide-react";

// ── tokens (Benjamin CI) ────────────────────────────────────────────────────
const NAVY = "#003366";   // Dark Blue — สีหลัก
const STEEL = "#2D2D2D";  // Steel Gray — ตัวอักษรเข้ม
const SILVER = "#C0C0C0"; // Silver — เส้นแบ่ง / ค่าว่าง

// ── shared bus (report dirty/save/reset ของแท็บที่ active + toast) — ดู @pms/shared/lib/settingsBus
function useReport(api: SectionApi) {
  const { report } = useContext(BusCtx);
  useEffect(() => { report(api); return () => report(null); }, [api, report]);
}
function useToast() { return useContext(BusCtx).toast; }

// draft = state ที่แก้ไขได้ + เทียบกับค่าที่บันทึกไว้ (dirty) → ใช้กับ Save/Reset กลาง
function useDraft<T>(saved: T, setSaved: Dispatch<SetStateAction<T>>) {
  const [draft, setDraft] = useState<T>(saved);
  const editedRef = useRef(false);
  const draftRef = useRef(draft); draftRef.current = draft;
  const savedRef = useRef(saved); savedRef.current = saved;
  // ระหว่าง hydration (โหลดค่าเก่า) sync draft ← saved จนกว่าผู้ใช้จะแก้เอง
  useEffect(() => { if (!editedRef.current) setDraft(saved); }, [saved]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const set = useCallback((updater: (prev: T) => T) => { editedRef.current = true; setDraft(updater); }, []);
  const save = useCallback(() => setSaved(draftRef.current), [setSaved]);
  const reset = useCallback(() => { editedRef.current = false; setDraft(savedRef.current); }, []);
  return { draft, set, dirty, save, reset };
}
// draft ที่ persist ผ่าน repository (local: localStorage · supabase: DB · RLS is_hq) — นโยบาย/เป้า/กฎแจ้งเตือน
function useRepoDraft<T>(load: () => Promise<T>, save: (v: T) => void, initial: T) {
  const [saved, setSaved] = useRepoState<T>(load, save, initial);
  return useDraft(saved, setSaved);
}

// ── reusable UI ───────────────────────────────────────────────────────────────
function SectionCard({ icon, title, desc, children, action, fill }: {
  icon?: ReactNode; title: string; desc?: string; children: ReactNode; action?: ReactNode;
  /** การ์ดที่วางคู่กันในแถวเดียว — ยืดสูงเท่ากัน และให้เนื้อหาข้างในดันส่วนท้ายลงล่างได้ (แถวตรงกัน) */
  fill?: boolean;
}) {
  return (
    <div className="card" style={fill ? { display: "flex", flexDirection: "column" } : undefined}>
      <div className="card-header">
        <div>
          <div className="card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {icon && <span style={{ color: "var(--primary)", display: "flex" }}>{icon}</span>}{title}
          </div>
          {/* คำอธิบายกำกับใต้หัวข้อถูกเอาออกทั้งระบบ (บอสสั่ง 27 ส.ค. 69) */}
        </div>
        {action}
      </div>
      <div className="card-body" style={fill ? { flex: 1, display: "flex", flexDirection: "column" } : undefined}>{children}</div>
    </div>
  );
}
function Row({ label, desc, children, error }: { label: string; desc?: string; children: ReactNode; error?: string }) {
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", padding: "13px 0", borderTop: "1px solid var(--border,#f1f5f9)" }}>
      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
        <div style={{ fontSize: "0.84rem", fontWeight: 700, color: `var(--foreground,${STEEL})` }}>{label}</div>
        {desc && <div style={{ fontSize: "0.72rem", color: "var(--muted-foreground,#6b7280)", marginTop: 2 }}>{desc}</div>}
      </div>
      <div style={{ flex: "0 0 340px", maxWidth: "100%" }}>
        {children}
        {error && <div style={{ fontSize: "0.68rem", color: "#dc2626", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}><AlertCircle size={11} /> {error}</div>}
      </div>
    </div>
  );
}
function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button role="switch" aria-checked={on} onClick={onChange}
      style={{ width: 42, height: 24, borderRadius: 99, border: "none", cursor: "pointer", flexShrink: 0, background: on ? NAVY : "#d1d5db", position: "relative", transition: "background .15s" }}>
      <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.25)", transition: "left .15s" }} />
    </button>
  );
}
const numInput = (value: number, onChange: (n: number) => void, unit: string, step?: number) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    {/* ลบทั้งช่องระหว่างพิมพ์ได้ (ไม่เด้งเป็น 0 แล้วพิมพ์ต่อได้ "09") — ดู NumberInput */}
    <NumberInput step={step} ariaLabel={unit} min={0} style={{ textAlign: "right", fontWeight: 700 }} value={value} onChange={onChange} />
    <span style={{ fontSize: "0.72rem", color: "#6b7280", whiteSpace: "nowrap" }}>{unit}</span>
  </div>
);
// regionDisplay = ใช้ของกลาง (hqQuotations.ts) แหล่งเดียว — เดิม copy ในไฟล์นี้ไม่มี guard "ไม่ระบุ" (1.4)

// ═══════════════════════ 3 · เส้นทางการขาย ════════════════════════════════════
// ขั้นการขาย = สถานะลูกค้าเป้าหมายจริงของระบบ (LeadStatus 7 ขั้น) — ชื่อ/สี/ลำดับของ "ขั้น" แก้ที่นี่ไม่ได้
// เพราะคัมบัง/ตาราง/แดชบอร์ด และชนิดข้อมูลใน DB (enum lead_status) ผูกกับ 7 ขั้นนี้
//
// สิ่งที่ HQ แก้ได้จริงคือ "งานมาตรฐาน" ในแต่ละขั้น (13 ส.ค. 69) — เก็บที่ hq_sales_journey.tasks
// งานพวกนี้คือของจริงที่ดีลเลอร์เช็ก และเป็นตัวเลื่อนขั้นให้ลูกค้าเป้าหมาย ไม่ใช่ข้อความประดับ
// ไม่รวม "รอราคา HQ": ขั้นนี้ไม่มีงานให้ดีลเลอร์ติ๊ก ฐานข้อมูลขยับให้เองตามคำขอราคา (Flow ใหม่)
const STAGE_ORDER: LeadStatus[] = LEAD_STATUS_ORDER.filter(s => s !== "HQ_PRICING");
// เหตุผลปิดการขายไม่สำเร็จ — ขั้น "ปิดไม่สำเร็จ" เป็นปลายทางหนึ่งของเส้นทางการขาย จึงอยู่แท็บนี้
// (เดิมอยู่แท็บ "กฎธุรกิจ" ซึ่งยุบไปแล้ว — คีย์ hq_sales_journey เหมือนเดิม ค่าที่ตั้งไว้ไม่หาย)
// เก็บผ่าน repository — เดิมเขียนลง localStorage ของ origin ฝั่ง HQ ซึ่งดีลเลอร์ (คนละ origin)
// อ่านไม่เห็นเลย รายการที่ตั้งไว้จึงไม่เคยมีผลกับใคร (ค่าเริ่มต้นใช้ LOST_REASONS แหล่งเดียวกับดีลเลอร์)
type Journey = { lost: string[] };
const DEFAULT_JOURNEY: Journey = { lost: [...LOST_REASONS] };

// ── ตัวช่วยของการ์ด "ขั้นตอนการขายมาตรฐาน" ────────────────────────────────────
// รหัสงาน (key) ผูกกับ checklist ที่บันทึกไว้ในลูกค้าเป้าหมายทุกใบ — งานใหม่ต้องได้ key ที่ไม่ซ้ำของเดิม
// และห้ามเปลี่ยน key ของงานที่มีอยู่ (ลูกค้าเป้าหมายเก่าจะหาไม่เจอ = ประวัติการเช็กงานหาย) จึงแก้ได้แค่ "ชื่อ"
function newTaskKey(existing: LeadTaskDef[], stage: LeadStatus): string {
  const base = `task_${stage.toLowerCase()}`;
  const used = new Set(existing.map(t => t.key));
  for (let i = 1; ; i++) if (!used.has(`${base}_${i}`)) return `${base}_${i}`;
}

function JourneyTab() {
  // ทุกกฎของเส้นทางการขายรวมที่แท็บนี้: นโยบาย (VAT/อายุใบ) · เหตุผลปิดไม่สำเร็จ
  // (เดิมมี sys=เลขรันใบเสนอราคาใน localStorage แต่การ์ดที่แก้ค่านั้นถูกลบไปแล้ว → เป็น plumbing ตาย ตัดออก · L6)
  // บันทึกไม่ผ่านต้องบอกผู้ใช้เสมอ — ไม่งั้นหน้าจอโชว์ค่าใหม่ทั้งที่ DB ยังเป็นค่าเก่า (พังเงียบ)
  const toast = useToast();
  const pol = useRepoDraft<HQPolicy>(() => settingsRepo.getPolicy(), (v) => settingsRepo.savePolicy(v), DEFAULT_HQ_POLICY);
  const jn = useRepoDraft<Journey>(
    async () => ({ lost: await settingsRepo.getLostReasons() }),
    // เดิม void ทิ้ง error ทั้งดุ้น บันทึกไม่ผ่านก็ไม่มีใครรู้
    (v) => { settingsRepo.saveLostReasons(v.lost).catch(e => toast("บันทึกรายการเหตุผลไม่สำเร็จ: " + friendlyError(e))); },
    DEFAULT_JOURNEY,
  );
  // งานมาตรฐานรายขั้น — ของจริงที่ดีลเลอร์เช็ก (บันทึกผ่านปุ่มบันทึกกลางเหมือนการ์ดอื่นในหน้านี้)
  const tk = useRepoDraft<LeadTaskDef[]>(
    () => settingsRepo.getLeadTasks(),
    (v) => { settingsRepo.saveLeadTasks(v).catch(e => toast("บันทึกงานมาตรฐานไม่สำเร็จ: " + friendlyError(e))); },
    [...LEAD_TASK_TEMPLATE],
  );
  const [newLost, setNewLost] = useState("");
  const saveAll = useCallback(() => { pol.save(); jn.save(); tk.save(); }, [pol.save, jn.save, tk.save]);
  useReport(useMemo(() => ({
    dirty: pol.dirty || jn.dirty || tk.dirty,
    save: saveAll,
    reset: () => { pol.reset(); jn.reset(); tk.reset(); },
  }), [pol.dirty, jn.dirty, tk.dirty, saveAll, pol.reset, jn.reset, tk.reset]));

  const addLost = () => { if (newLost.trim()) { jn.set(p => ({ ...p, lost: [...p.lost, newLost.trim()] })); setNewLost(""); } };
  const active = STAGE_ORDER.filter(s => s !== "PAID" && s !== "CANCELLED");
  const tasksOf = (s: LeadStatus) => tk.draft.filter(t => t.stage === s);
  // แก้ได้แค่ชื่อ — key คงเดิมเสมอ (ผูกกับ checklist ของลูกค้าเป้าหมายที่บันทึกไว้แล้ว)
  const renameTask = (key: string, label: string) => tk.set(p => p.map(t => t.key === key ? { ...t, label } : t));
  const removeTask = (key: string) => tk.set(p => p.filter(t => t.key !== key));
  const addTask = (stage: LeadStatus) => tk.set(p => {
    const def: LeadTaskDef = { key: newTaskKey(p, stage), label: "", stage };
    // แทรกต่อท้ายงานของขั้นเดียวกัน — ลำดับงานคือลำดับที่ดีลเลอร์ต้องเช็ก ห้ามไปโผล่ท้ายสุดข้ามขั้น
    const last = p.map(t => t.stage).lastIndexOf(stage);
    if (last < 0) return [...p, def];
    return [...p.slice(0, last + 1), def, ...p.slice(last + 1)];
  });

  return (
    <>
      <SectionCard icon={<GitMerge size={19} />} title="ขั้นตอนการขายมาตรฐาน"
        desc="เส้นทางเดียวกันทุกดีลเลอร์ — สำนักงานใหญ่กำหนดงานของแต่ละขั้น ดีลเลอร์แก้ไขไม่ได้">
        <div style={{ border: "1px solid var(--border,#e5e7eb)", borderRadius: 12, overflow: "hidden", marginTop: 6 }}>
          {active.map((s, idx) => (
            <div key={s} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "11px 14px", borderBottom: idx < active.length - 1 ? "1px solid #f1f5f9" : "none", flexWrap: "wrap" }}>
              <span style={{ width: 24, height: 24, borderRadius: "50%", background: leadStatusColor[s].bg, color: leadStatusColor[s].text, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", fontWeight: 800, flexShrink: 0, marginTop: 4 }}>{idx + 1}</span>
              <span style={{ flex: "1 1 140px", fontSize: "0.84rem", fontWeight: 700, color: STEEL, marginTop: 5 }}>{leadStatusLabel[s]}</span>
              {/* งานมาตรฐานของขั้นนี้ = ตัวขับความคืบหน้าจริง (เช็กงาน → เลื่อนขั้นเอง) · แก้ชื่อ/เพิ่ม/ลบได้ */}
              <span style={{ flex: "2 1 300px", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {tasksOf(s).map(t => (
                  <span key={t.key} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#f1f5f9", borderRadius: 8, padding: "3px 4px 3px 9px" }}>
                    <input
                      aria-label={`ชื่องานของขั้น ${leadStatusLabel[s]}`}
                      value={t.label} placeholder="ชื่องาน…" autoFocus={!t.label}
                      onChange={e => renameTask(t.key, e.target.value)}
                      style={{ border: "none", background: "transparent", outline: "none", fontFamily: "inherit", fontSize: "0.74rem", fontWeight: 600, color: "#374151", width: `${Math.max(7, (t.label.length || 7) + 1)}ch` }}
                    />
                    <button onClick={() => removeTask(t.key)} title={`ลบงาน ${t.label || "ที่ยังไม่ตั้งชื่อ"}`}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", display: "flex", padding: 2 }}><X size={12} /></button>
                  </span>
                ))}
                <button onClick={() => addTask(s)} className="btn btn-secondary btn-sm"
                  title={`เพิ่มงานในขั้น ${leadStatusLabel[s]}`}
                  style={{ padding: "2px 9px", fontSize: "0.7rem", color: NAVY }}><Plus size={12} /> เพิ่มงาน</button>
                {!tasksOf(s).length && (
                  <span style={{ fontSize: "0.7rem", color: "#b45309" }}>ยังไม่มีงาน — ลูกค้าเป้าหมายจะข้ามขั้นนี้ไปเลย</span>
                )}
              </span>
            </div>
          ))}
        </div>
        {tk.draft.some(t => !t.label.trim()) && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: "0.76rem", color: "#b45309", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, padding: "8px 12px" }}>
            <AlertCircle size={14} style={{ flexShrink: 0 }} /> มีงานที่ยังไม่ได้ตั้งชื่อ — งานที่ไม่มีชื่อจะไม่ถูกบันทึก
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {(["PAID", "CANCELLED"] as LeadStatus[]).map(s => (
            <div key={s} style={{ flex: "1 1 220px", display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 10, background: s === "PAID" ? "#f0fdf4" : "#fff5f5", border: `1px solid ${s === "PAID" ? "#bbf7d0" : "#fecaca"}` }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: leadStatusColor[s].text }} />
              <span style={{ flex: 1, fontSize: "0.8rem", fontWeight: 700, color: leadStatusColor[s].text }}>{leadStatusLabel[s]}</span>
              <span className="badge" style={{ background: leadStatusColor[s].bg, color: leadStatusColor[s].text, border: "none" }}>ขั้นปิด</span>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* การ์ด "กฎการดูแลลูกค้าเป้าหมาย" (48 ชม. / 7 วัน) ถูกย้ายไปหน้าตั้งค่าของดีลเลอร์ตามคำสั่ง
          เจ้าของกฎเปลี่ยนจาก HQ → ดีลเลอร์ และแยกเป็นรายสาขา (ตั้งที่ /settings → การแจ้งเตือน)
          HQ ตั้งเกณฑ์นี้ให้ดีลเลอร์ไม่ได้แล้ว · หน้า HQ อ่านเกณฑ์ของแต่ละสาขามาแสดงแทน (ผ่าน useLeadRulesOf)
          ⚠️ อย่าใส่กลับมาที่นี่ — จะกลายเป็นสองแหล่งที่ขัดกันเอง */}

      {/* การ์ด "กฎใบเสนอราคา (Quotation Rules)" ถูกลบตามคำสั่ง (17 ก.ค. 69)
          ค่าที่การ์ดนี้เคยแก้ได้ยังทำงานอยู่ แต่ตอนนี้ตรึงที่ค่าตั้งต้น แก้ผ่านหน้าจอไม่ได้แล้ว:
          · VAT 7%              (DEFAULT_HQ_POLICY.vat) — ใช้คิดภาษีในใบเสนอราคาทุกใบ
          · อายุใบเสนอราคา 30 วัน (DEFAULT_HQ_POLICY.quoteValidityDays) — ใช้คิดวันหมดอายุ
          · เลขที่ Q-2026- / 1101 (DEFAULT_QUOTE_NUMBERING) — ใช้ออกเลขใบเสนอราคาใหม่
          pol/sys ยังคงอยู่ เพราะกลไกบันทึกรวมของหน้านี้ (saveAll/dirty/reset) ใช้ร่วมกับการ์ดอื่น */}

      {/* เหตุผลปิดการขายไม่สำเร็จ — ปลายทาง "ปิดไม่สำเร็จ" ของเส้นทางการขาย (ย้ายมาจากแท็บ "กฎธุรกิจ") */}
      <SectionCard icon={<X size={19} />} title="เหตุผลปิดการขายไม่สำเร็จ" desc="ตัวเลือกมาตรฐานที่ดีลเลอร์ต้องเลือกตอนปิดดีลไม่สำเร็จ">
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
          {jn.draft.lost.map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff5f5", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px" }}>
              <span style={{ flex: 1, fontSize: "0.8rem", color: STEEL }}>{r}</span>
              <button onClick={() => jn.set(p => ({ ...p, lost: p.lost.filter((_, x) => x !== i) }))}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", display: "flex", padding: 2 }}><Trash2 size={13} /></button>
            </div>
          ))}
          {!jn.draft.lost.length && (
            <div style={{ fontSize: "0.78rem", color: "#b45309", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, padding: "9px 12px" }}>
              ต้องมีอย่างน้อย 1 เหตุผล — ไม่งั้นดีลเลอร์จะไม่มีตัวเลือกตอนปิดดีลไม่สำเร็จ
            </div>
          )}

          {/* ── "อื่นๆ (ระบุเอง)" อยู่ในรายการจริงแล้ว (บอสสั่ง 21 ส.ค. 69) ────────────────
              เพิ่ม/ลบ/แก้ได้เหมือนเหตุผลอื่นทุกประการ — ดีลเลอร์เห็นตรงกับที่ตั้งไว้ที่นี่เป๊ะ
              ⚠️ ตัวเลือกนี้พิเศษตรงที่ "กดแล้วให้พิมพ์เอง": ระบบเก็บข้อความที่ดีลเลอร์พิมพ์
                 ไม่ได้เก็บคำว่า "อื่นๆ" — รายงานจึงยังเห็นเหตุผลจริงรายใบ ไม่ใช่กองรวมกัน */}
          <div style={{ fontSize: "0.7rem", color: "#8a929c", marginTop: 2 }}>
            ตัวเลือก “{OTHER_REASON_OPTION}” ในรายการนี้ = ดีลเลอร์กดแล้วพิมพ์เหตุผลเองได้ · ระบบเก็บข้อความที่พิมพ์จริง
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 10, maxWidth: 420 }}>
          <input className="form-input" value={newLost} placeholder="เพิ่มเหตุผล…" onChange={e => setNewLost(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") addLost(); }} />
          <button className="btn btn-primary btn-sm" style={{ flexShrink: 0 }} onClick={addLost}><Plus size={14} /></button>
        </div>
      </SectionCard>


    </>
  );
}


// ═══════════════════════ 4 · หาดีลเลอร์ ═════════════════════════════════════════
// บอสสั่ง 14 ก.ย. 69 (ข้อ 1 + ข้อ 2 ที่แนะนำ) — เก็บที่ hq_recruit_settings (0176) · กติกาอยู่ lib/recruitSettings.ts
//   ช่องทางที่เข้ามา / ช่องทางในบันทึกการติดต่อ / ประเภทธุรกิจ / เหตุผลที่ไม่สำเร็จ / ชื่องานตามขั้น
//   ค่าตั้งต้นใบค่าแฟรนไชส์ (อายุใบ · เงื่อนไขมาตรฐาน · ผู้ลงนาม · ตัวเลขตั้งต้นของแต่ละแพ็กเกจ)
// ⚠️ งานตามขั้นแก้ได้แค่ชื่อ — เพิ่ม/ลบไม่ได้ เพราะ 4 งานผูกกับขั้นที่ฐานข้อมูลบังคับ (0174)
const ปุ่มไอคอน = (ปิด: boolean) => ({
  background: "none", border: "none", cursor: ปิด ? "default" : "pointer",
  color: ปิด ? "#cbd5e1" : "#64748b", display: "flex", padding: 3,
});

function ListEditor({ label, items, onChange, placeholder, emptyNote, note, noteLines = 1 }: {
  label: string; items: string[]; onChange: (next: string[]) => void; placeholder: string; emptyNote: string;
  /** บรรทัดหมายเหตุใต้ช่องเพิ่ม — ส่ง "" = เว้นบรรทัดไว้เปล่า ๆ ให้การ์ดคู่กันแถวตรงกัน · ไม่ส่ง = ไม่มีบรรทัดนี้ */
  note?: string;
  /** จองความสูงหมายเหตุกี่บรรทัด — การ์ดคู่กันต้องจองเท่ากัน (หมายเหตุยาวตัดขึ้นบรรทัดใหม่แล้วช่องเพิ่มจะเหลื่อม) */
  noteLines?: number;
}) {
  const [text, setText] = useState("");
  const [hint, setHint] = useState("");
  const add = () => {
    const t = text.trim().slice(0, ความยาวรายการสูงสุด);
    if (!t) return;
    if (items.includes(t)) { setHint(`“${t}” มีอยู่แล้ว`); return; }
    if (items.length >= จำนวนรายการสูงสุด) { setHint(`ใส่ได้ไม่เกิน ${จำนวนรายการสูงสุด} รายการ`); return; }
    onChange([...items, t]); setText(""); setHint("");
  };
  // ลำดับในรายการ = ลำดับในดรอปดาวน์
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const n = [...items]; [n[i], n[j]] = [n[j], n[i]]; onChange(n);
  };
  return (
    // รายการยืดเต็มความสูงที่เหลือ → ช่องเพิ่ม + หมายเหตุ ชิดล่างการ์ดเสมอ (การ์ดคู่กันแถวตรงกันแม้จำนวนรายการไม่เท่ากัน)
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
        {items.map((x, i) => (
          <div key={x} style={{ display: "flex", alignItems: "center", gap: 4, background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 8px 6px 12px" }}>
            <span style={{ flex: 1, fontSize: "0.8rem", color: STEEL }}>{x}</span>
            <button type="button" aria-label={`เลื่อน ${x} ขึ้น`} disabled={i === 0} onClick={() => move(i, -1)} style={ปุ่มไอคอน(i === 0)}><ArrowUp size={13} /></button>
            <button type="button" aria-label={`เลื่อน ${x} ลง`} disabled={i === items.length - 1} onClick={() => move(i, 1)} style={ปุ่มไอคอน(i === items.length - 1)}><ArrowDown size={13} /></button>
            <button type="button" aria-label={`ลบ ${x}`} onClick={() => onChange(items.filter((_, k) => k !== i))} style={{ ...ปุ่มไอคอน(false), color: "#dc2626" }}><Trash2 size={13} /></button>
          </div>
        ))}
        {!items.length && (
          <div style={{ fontSize: "0.76rem", color: "#b45309", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, padding: "8px 12px" }}>{emptyNote}</div>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 10, maxWidth: 420 }}>
        <input className="form-input" aria-label={`เพิ่ม${label}`} value={text} maxLength={ความยาวรายการสูงสุด} placeholder={placeholder}
          onChange={e => { setText(e.target.value); setHint(""); }} onKeyDown={e => { if (e.key === "Enter") add(); }} />
        <button type="button" className="btn btn-primary btn-sm" aria-label={`เพิ่ม${label}`} style={{ flexShrink: 0 }} onClick={add}><Plus size={14} /></button>
      </div>
      {hint && <div style={{ fontSize: "0.7rem", color: "#b45309", marginTop: 4 }}>{hint}</div>}
      {note != null && (
        <div style={{ fontSize: "0.7rem", color: "#8a929c", marginTop: 8, lineHeight: 1.5, minHeight: `${noteLines * 1.5}em` }}>{note}</div>
      )}
    </div>
  );
}

const เงินในช่อง = (n: number | null) => (n != null ? formatMoneyInput(String(n)) : "");
const เงินจากช่อง = (s: string) => { const t = formatMoneyInput(s); return t ? parseMoneyInput(t) : null; };

function RecruitTab() {
  const toast = useToast();
  const rc = useRepoDraft<HQRecruitSettings>(
    () => settingsRepo.getRecruitSettings(),
    (v) => { settingsRepo.saveRecruitSettings(v).catch(e => toast("บันทึกค่าตั้งหาดีลเลอร์ไม่สำเร็จ: " + friendlyError(e))); },
    DEFAULT_RECRUIT_SETTINGS,
  );
  useReport(useMemo(() => ({ dirty: rc.dirty, save: rc.save, reset: rc.reset }), [rc.dirty, rc.save, rc.reset]));
  const d = rc.draft;
  const ตั้งรายการ = (k: "channels" | "contactChannels" | "businessTypes" | "lostReasons") =>
    (next: string[]) => rc.set(p => ({ ...p, [k]: next }));
  const ตั้งชื่องาน = (k: คีย์งานหาดีลเลอร์, v: string) => rc.set(p => ({ ...p, taskLabels: { ...p.taskLabels, [k]: v } }));
  const ตั้งใบ = (patch: Partial<HQRecruitSettings["proposal"]>) => rc.set(p => ({ ...p, proposal: { ...p.proposal, ...patch } }));
  const ตั้งแพ็กเกจ = (k: DealerPackage, patch: Partial<ค่าตั้งแพ็กเกจ>) => rc.set(p => ({
    ...p, proposal: { ...p.proposal, packages: { ...p.proposal.packages, [k]: { ...p.proposal.packages[k], ...patch } } },
  }));
  // เป้ายอดซื้อต่อปีแยกตามภาค (บอสสั่ง 15 ก.ย. 69) — เว้นว่าง = ลบคีย์ภาคนั้นทิ้ง (กลับไปใช้ค่ากลาง)
  const ตั้งเป้าภาค = (k: DealerPackage, r: Region, n: number | null) => rc.set(p => {
    const ตามภาค = { ...p.proposal.packages[k].targetsByRegion };
    if (n == null) delete ตามภาค[r]; else ตามภาค[r] = n;
    return { ...p, proposal: { ...p.proposal, packages: { ...p.proposal.packages, [k]: { ...p.proposal.packages[k], targetsByRegion: ตามภาค } } } };
  });
  const หมายเหตุ = { fontSize: "0.7rem", color: "#8a929c", marginTop: 8 } as const;

  return (
    <>
      {/* สองการ์ดช่องทางอยู่แถวเดียวกัน (บอสสั่ง 14 ก.ย. 69) · จอแคบซ้อนลงเป็นคอลัมน์เดียวเอง (.row-2-eq) */}
      <div className="row-2-eq">
        {/* fill + note เว้นบรรทัดเท่ากัน → ช่องเพิ่มของสองการ์ดอยู่ระดับเดียวกัน (บอสสั่ง "ทำให้แถวมันตรงกัน") */}
        <SectionCard fill icon={<UserPlus size={19} />} title="ช่องทางที่เข้ามา">
          <ListEditor label="ช่องทางที่เข้ามา" items={d.channels} onChange={ตั้งรายการ("channels")} placeholder="เช่น TikTok"
            emptyNote="ยังไม่มีช่องทาง — ถ้าบันทึกตอนว่าง ระบบใช้รายการเริ่มต้น"
            note="ในฟอร์มมีตัวเลือก “อื่น ๆ” ต่อท้ายให้เสมอ" />
        </SectionCard>

        <SectionCard fill icon={<MessageSquare size={19} />} title="ช่องทางในบันทึกการติดต่อ">
          <ListEditor label="ช่องทางติดต่อ" items={d.contactChannels} onChange={ตั้งรายการ("contactChannels")} placeholder="เช่น Zoom"
            emptyNote="ยังไม่มีช่องทาง — บันทึกการติดต่อต้องเลือกช่องทาง ถ้าบันทึกตอนว่าง ระบบใช้รายการเริ่มต้น"
            note="" />
        </SectionCard>
      </div>

      {/* ประเภทธุรกิจ + เหตุผลที่ไม่สำเร็จ แถวเดียวกัน (บอสสั่ง 15 ก.ย. 69) · จองหมายเหตุ 2 บรรทัดเท่ากันทั้งคู่
          — หมายเหตุฝั่งเหตุผลตัดขึ้นบรรทัดใหม่ในการ์ดครึ่งจอ ถ้าจองไม่เท่ากันช่องเพิ่มจะเหลื่อม */}
      <div className="row-2-eq">
        <SectionCard fill icon={<Building2 size={19} />} title="ประเภทธุรกิจ">
          <ListEditor label="ประเภทธุรกิจ" items={d.businessTypes} onChange={ตั้งรายการ("businessTypes")} placeholder="เช่น ผู้รับเหมา"
            emptyNote="ยังไม่ได้ตั้ง — ช่องประเภทธุรกิจในฟอร์มยังพิมพ์เองได้"
            note="" noteLines={2} />
        </SectionCard>

        <SectionCard fill icon={<X size={19} />} title="เหตุผลที่ไม่สำเร็จ (ลูกค้าเป้าหมาย HQ)">
          <ListEditor label="เหตุผลที่ไม่สำเร็จ" items={d.lostReasons} onChange={ตั้งรายการ("lostReasons")} placeholder="เช่น เงินทุนไม่พอ"
            emptyNote="ยังไม่ได้ตั้ง — ตอนปิดว่าไม่สำเร็จยังพิมพ์เหตุผลเองได้"
            note="ตั้งรายการแล้ว มีตัวเลือก “อื่น ๆ (ระบุเอง)” ให้ด้วย · แยกจากเหตุผลของดีลเลอร์" noteLines={2} />
        </SectionCard>
      </div>

      <SectionCard icon={<GitMerge size={19} />} title="ชื่องานตามขั้น">
        <div style={{ border: "1px solid var(--border,#e5e7eb)", borderRadius: 12, overflow: "hidden", marginTop: 6 }}>
          {งานมาตรฐาน.map((g, i) => (
            <div key={g.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderTop: i ? "1px solid #f1f5f9" : "none", flexWrap: "wrap" }}>
              <span style={{ width: 24, height: 24, borderRadius: "50%", background: "#eef2f7", color: NAVY, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", fontWeight: 800, flexShrink: 0 }}>{i + 1}</span>
              <input className="form-input" aria-label={`ชื่องาน ${g.label}`} value={d.taskLabels[g.key] ?? ""} placeholder={g.label} maxLength={60}
                onChange={e => ตั้งชื่องาน(g.key, e.target.value)} style={{ flex: "1 1 220px", maxWidth: 360 }} />
              <span className="badge" style={{ background: prospectStatusColor[g.ไปขั้น].bg, color: prospectStatusColor[g.ไปขั้น].text, border: "none" }}>→ {prospectStatusLabel[g.ไปขั้น]}</span>
              {g.หลักฐาน && (
                <span style={{ fontSize: "0.68rem", color: "#6b7280" }}>
                  {g.หลักฐาน === "contact" ? "ระบบติ๊กให้เมื่อบันทึกการติดต่อ" : "ระบบติ๊กให้เมื่อใบเสนอเป็น “ส่งแล้ว”"}
                </span>
              )}
            </div>
          ))}
        </div>
        <div style={หมายเหตุ}>เว้นว่าง = ใช้ชื่อเดิม · เพิ่มหรือลบงานไม่ได้ เพราะแต่ละงานผูกกับขั้นที่ระบบบังคับ</div>
      </SectionCard>

      <SectionCard icon={<FileText size={19} />} title="ค่าตั้งต้นใบค่าแฟรนไชส์">
        <Row label="อายุใบ">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input className="form-input" aria-label="อายุใบค่าแฟรนไชส์ (วัน)" inputMode="numeric" value={d.proposal.validityDays ?? ""} placeholder="เว้นว่าง = ไม่เติม"
              onChange={e => { const t = e.target.value.replace(/\D/g, "").slice(0, 3); ตั้งใบ({ validityDays: t ? Math.min(365, Number(t)) || null : null }); }}
              style={{ textAlign: "right", fontWeight: 700 }} />
            <span style={{ fontSize: "0.72rem", color: "#6b7280", whiteSpace: "nowrap" }}>วัน นับจากวันที่เสนอ</span>
          </div>
        </Row>
        <Row label="ผู้ลงนาม (ช่องผู้เสนอ)">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input className="form-input" aria-label="ชื่อผู้ลงนาม" value={d.proposal.signerName} maxLength={120} placeholder="ชื่อ — เว้นว่าง = ใช้ชื่อบริษัท"
              onChange={e => ตั้งใบ({ signerName: e.target.value })} style={{ flex: "1 1 150px" }} />
            <input className="form-input" aria-label="ตำแหน่งผู้ลงนาม" value={d.proposal.signerTitle} maxLength={120} placeholder="ตำแหน่ง"
              onChange={e => ตั้งใบ({ signerTitle: e.target.value })} style={{ flex: "1 1 120px" }} />
          </div>
        </Row>
        <div style={{ padding: "13px 0", borderTop: "1px solid var(--border,#f1f5f9)" }}>
          <label className="form-label" htmlFor="rc-terms">เงื่อนไขมาตรฐาน</label>
          <textarea id="rc-terms" className="form-input" rows={4} maxLength={4000} value={d.proposal.terms}
            onChange={e => ตั้งใบ({ terms: e.target.value })} placeholder="พิมพ์ทีละบรรทัด — เติมให้ในใบใหม่ แก้ในแต่ละใบได้" style={{ resize: "vertical" }} />
        </div>
        <div style={{ paddingTop: 13, borderTop: "1px solid var(--border,#f1f5f9)" }}>
          <div style={{ fontSize: "0.84rem", fontWeight: 700, color: STEEL, marginBottom: 8 }}>ตัวเลขตั้งต้นของแต่ละแพ็กเกจ</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {PACKAGE_ORDER.map(k => {
              const v = d.proposal.packages[k];
              return (
                <div key={k} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8, alignItems: "end", background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ fontSize: "0.86rem", fontWeight: 800, color: NAVY, alignSelf: "center" }}>{packageLabel[k]}</div>
                  <div>
                    <label className="form-label" htmlFor={`rc-${k}-amount`}>ค่าแรกเข้า (บาท)</label>
                    <input id={`rc-${k}-amount`} className="form-input" inputMode="numeric" value={เงินในช่อง(v.amount)} placeholder="เว้นว่างได้"
                      onChange={e => ตั้งแพ็กเกจ(k, { amount: เงินจากช่อง(e.target.value) })} />
                  </div>
                  <div>
                    <label className="form-label" htmlFor={`rc-${k}-months`}>ระยะสัญญา (เดือน)</label>
                    <input id={`rc-${k}-months`} className="form-input" inputMode="numeric" value={v.contractMonths ?? ""} placeholder="1–120"
                      onChange={e => { const t = e.target.value.replace(/\D/g, "").slice(0, 3); ตั้งแพ็กเกจ(k, { contractMonths: t ? Math.min(120, Number(t)) || null : null }); }} />
                  </div>
                  <div>
                    <label className="form-label" htmlFor={`rc-${k}-target`}>เป้ายอดซื้อต่อปี · ค่ากลาง (บาท)</label>
                    <input id={`rc-${k}-target`} className="form-input" inputMode="numeric" value={เงินในช่อง(v.annualTarget)} placeholder="เว้นว่างได้"
                      onChange={e => ตั้งแพ็กเกจ(k, { annualTarget: เงินจากช่อง(e.target.value) })} />
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#6b7280", margin: "2px 0 6px" }}>เป้ายอดซื้อต่อปีแยกตามภาค (บาท) · เว้นว่าง = ใช้ค่ากลาง</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
                      {REGIONS.map(r => (
                        <div key={r}>
                          <label className="form-label" htmlFor={`rc-${k}-target-${r}`}>{r}</label>
                          <input id={`rc-${k}-target-${r}`} className="form-input" inputMode="numeric"
                            value={เงินในช่อง(v.targetsByRegion[r] ?? null)}
                            placeholder={v.annualTarget != null ? เงินในช่อง(v.annualTarget) : "เว้นว่างได้"}
                            onChange={e => ตั้งเป้าภาค(k, r, เงินจากช่อง(e.target.value))} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={หมายเหตุ}>เลือกแพ็กเกจในใบใหม่แล้วเติมตัวเลขให้ · แก้ในแต่ละใบได้ · ใบที่ออกไปแล้วไม่เปลี่ยนตาม</div>
          <div style={หมายเหตุ}>เป้ายอดซื้อต่อปี = เป้ายอดขายของดีลเลอร์ในแพ็กเกจนั้นด้วย (ภาคที่ตั้งแยกใช้เป้าของภาค ภาคอื่นใช้ค่ากลาง) · แก้แล้วเป้าของดีลเลอร์เปลี่ยนตามทันที · เว้นว่างทั้งหมด = ดีลเลอร์ใช้เป้าที่กรอกเอง</div>
        </div>
      </SectionCard>
    </>
  );
}

// ═══════════════════════ 5 · เป้าหมายยอดขาย ═══════════════════════════════════
// เป้าทั้งปี = แหล่งเดียว (แดชบอร์ด HQ/ดีลเลอร์อ่านค่านี้) · ไตรมาส/เดือน = แบ่งจากเป้าทั้งปี
// เป้ารายดีลเลอร์ = DealerRow.revenueTarget (ตั้งที่หน้า “ดีลเลอร์”) · ความคืบหน้า = ยอดจริงเทียบเป้า
// ไม่มี "คาดการณ์" (Forecast) — ระบบไม่มีข้อมูลคาดการณ์ (ไม่มีวันคาดปิดการขาย / ค่าความน่าจะเป็น)
function RollupTable({ title, hint, rows, countryTarget, ready = true }: {
  title: string; hint?: string;
  rows: { key: string; target: number; actual: number; dealers: number }[];
  countryTarget?: number;
  /** ตัวเลข "ทำได้จริง" มาถึงหรือยัง — ยังไม่มา ต้องขึ้น "—" ไม่ใช่ ฿0
   *  (฿0 อ่านว่า "ยังขายไม่ได้เลย" ซึ่งคนละความหมายกับ "ยังโหลดไม่เสร็จ") */
  ready?: boolean;
}) {
  const sorted = [...rows].sort((a, b) => b.target - a.target);
  const [page, setPage] = useState(0);
  const cur = Math.min(page, pageCountOf(sorted.length) - 1);
  const shown = pageSlice(sorted, cur);
  return (
    <SectionCard icon={<Target size={19} />} title={title}>
      <div className="table-wrap" style={{ marginTop: 6 }}>
        <table>
          <colgroup>
            <col style={{ width: "34%" }} />
            <col style={{ width: "12%", minWidth: 76 }} />
            <col style={{ width: "18%", minWidth: 96 }} />
            <col style={{ width: "18%", minWidth: 96 }} />
            <col style={{ width: "18%", minWidth: 96 }} />
          </colgroup>
          <thead>
            <tr>
              <th>พื้นที่</th>
              <th className="num">ดีลเลอร์</th>
              <th className="num">เป้า</th>
              <th className="num">ทำได้จริง</th>
              <th className="num">ความคืบหน้า</th>
            </tr>
          </thead>
          <tbody>
            {!sorted.length ? (
              <tr><td colSpan={5} style={{ textAlign: "center", padding: "24px", color: "#6b7280", fontSize: "0.8rem" }}>—</td></tr>
            ) : shown.map(r => {
              const pct = r.target > 0 ? Math.round(r.actual / r.target * 100) : 0;
              return (
                <tr key={r.key}>
                  <td style={{ fontWeight: 600, color: STEEL }}>{r.key}</td>
                  <td className="num" style={{ color: "#6b7280" }}>{r.dealers}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{fmtB(r.target)}</td>
                  <td className="num" style={{ fontWeight: 700, color: NAVY }}>{ready ? fmtB(r.actual) : "—"}</td>
                  <td className="num" style={{ fontWeight: 800, color: pct >= 100 ? "#059669" : pct >= 70 ? NAVY : "#b45309" }}>{ready ? `${pct}%` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <TablePagination page={cur} total={sorted.length} onPage={setPage} unit="รายการ" />
      {countryTarget != null && (() => {
        const sum = rows.reduce((s, r) => s + r.target, 0);
        const diff = sum - countryTarget;
        if (diff === 0) return null;
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: diff < 0 ? "#fff7ed" : "#f0f4fa", border: `1px solid ${diff < 0 ? "#fed7aa" : "#dbe4f0"}`, borderRadius: 10, padding: "10px 14px", marginTop: 12, fontSize: "0.78rem", color: diff < 0 ? "#b45309" : NAVY }}>
            <AlertCircle size={14} style={{ flexShrink: 0 }} />
            ผลรวมเป้าดีลเลอร์ {fmtB(sum)} {diff < 0 ? "ต่ำกว่า" : "สูงกว่า"}เป้าทั้งเครือ {fmtB(countryTarget)} อยู่ {fmtB(Math.abs(diff))}
          </div>
        );
      })()}
    </SectionCard>
  );
}

function TargetsTab() {
  const { draft, set, dirty, save, reset } = useRepoDraft<HQTargets>(() => settingsRepo.getTargets(), (v) => settingsRepo.saveTargets(v), DEFAULT_HQ_TARGETS);
  // แท็บนี้ "อ่านอย่างเดียว" — เป้ารายดีลเลอร์แก้ที่แท็บดีลเลอร์/หน้า /hq/dealers
  // ห้ามใช้ usePersistentState: มันเขียนกลับตอน mount → กลายเป็นคนเขียน hq_dealers_v3 คนที่ 3
  // ทั้งที่ไม่เคยแก้ดีลเลอร์เลย (กติกาเดียวกับที่ mock.ts:893 เตือนไว้)
  const [dealers, setDealers] = useState<DealerRow[]>([]); // ของจริงมาจาก repo — ห้ามตั้งต้นด้วย seed
  // "ทำได้จริง" = ยอดจากใบที่ปิดการขายได้ ไม่ใช่คอลัมน์ revenue_actual ที่ seed ไว้
  const perf = useDealerPerformance();
  const actualOf = (code: string) => (perf.get(code) ?? EMPTY_PERF).revenue;
  useEffect(() => { dealersRepo.list().then(setDealers).catch(e => logRepoRead("dealers.list", e)); }, []);
  useReport(useMemo(() => ({ dirty, save, reset }), [dirty, save, reset]));

  // รวมเป้า/ผลจริงตามพื้นที่ — มาจากเป้ารายดีลเลอร์ที่ตั้งไว้จริง ไม่ได้กุตัวเลข
  const byRegion = useMemo(() => {
    const m = new Map<string, { target: number; actual: number; dealers: number }>();
    dealers.forEach(d => {
      const k = regionDisplay(d.region) || "ไม่ระบุ";
      const r = m.get(k) ?? { target: 0, actual: 0, dealers: 0 };
      r.target += d.revenueTarget; r.actual += actualOf(d.code); r.dealers += 1;
      m.set(k, r);
    });
    return [...m.entries()].map(([key, v]) => ({ key, ...v }));
  }, [dealers]);
  const byDealer = useMemo(() => dealers.map(d => ({ key: `${d.code} · ${d.name}`, target: d.revenueTarget, actual: actualOf(d.code), dealers: 1 })), [dealers, perf]);

  const totalActual = dealers.reduce((s, d) => s + actualOf(d.code), 0);
  const achievement = draft.annualTarget > 0 ? Math.round(totalActual / draft.annualTarget * 100) : 0;
  // ── เป้าทั้งเครือ vs ผลรวมเป้าที่แจกให้ดีลเลอร์ (บอสสั่ง 24 ส.ค. 69 · ผลตรวจภายนอก HQ-01) ──
  //   สองค่านี้ตั้งแยกกันโดยตั้งใจ: เป้าทั้งเครือคือเป้าที่ผู้บริหารตั้ง · เป้ารายดีลเลอร์คือที่แจกลงไป
  //   แต่เดิมไม่มีที่ไหนบอกว่ามันต่างกัน → แดชบอร์ดคิด % จากเป้าทั้งเครือ หน้าดีลเลอร์คิดจากผลรวมที่แจก
  //   ผู้บริหารเห็นสองเลขขัดกันโดยไม่รู้ว่าทำไม · ตรงนี้จึงต้องบอกส่วนต่างให้เห็นตอนตั้งค่า
  const แจกไปแล้ว = dealers.reduce((s, d) => s + (d.revenueTarget || 0), 0);
  const ส่วนต่าง = แจกไปแล้ว - draft.annualTarget;

  return (
    <>
      <SectionCard icon={<Target size={19} />} title="เป้าหมายยอดขายทั้งเครือ" desc="ตั้งเป้าทั้งปี — แดชบอร์ดสำนักงานใหญ่และแดชบอร์ดดีลเลอร์ใช้ค่านี้">
        <Row label="เป้ายอดขายทั้งปี" desc="เป้าที่ผู้บริหารตั้งให้ทั้งเครือ — ไม่ใช่ผลรวมเป้าที่แจกให้ดีลเลอร์">
          {numInput(draft.annualTarget, n => set(p => ({ ...p, annualTarget: n })), "บาท", 1_000_000)}
        </Row>
        {/* เทียบกับที่แจกลงดีลเลอร์จริง — ตัวเลขทั้งสองมาจากคนละที่ ถ้าไม่บอกไว้จะอ่านขัดกันบนแดชบอร์ด */}
        <div style={{ margin: "-4px 0 4px", padding: "10px 14px", borderRadius: 12,
          background: ส่วนต่าง === 0 ? "#f0fdf4" : "#fffbeb",
          border: `1px solid ${ส่วนต่าง === 0 ? "#bbf7d0" : "#fde68a"}`, fontSize: "0.74rem", color: "#5b5b5b" }}>
          <b style={{ color: NAVY }}>ผลรวมเป้าที่แจกให้ดีลเลอร์ {dealers.length} สาขา: {fmtB(แจกไปแล้ว)}</b>
          {ส่วนต่าง === 0
            ? " — เท่ากับเป้าทั้งเครือพอดี"
            : ส่วนต่าง > 0
              ? ` — แจกเกินเป้าทั้งเครือ ${fmtB(ส่วนต่าง)} (หน้าดีลเลอร์จะคิด % จากยอดที่แจก จึงได้ % ต่ำกว่าบนแดชบอร์ด)`
              : ` — แจกยังไม่ครบเป้าทั้งเครือ อีก ${fmtB(-ส่วนต่าง)} (หน้าดีลเลอร์จะคิด % จากยอดที่แจก จึงได้ % สูงกว่าบนแดชบอร์ด)`}
        </div>
        <Row label="เป้าอัตราปิดการขายเฉลี่ย" desc="เกณฑ์สีบนหน้าดีลเลอร์ — ต่ำกว่านี้ขึ้นสีเตือน">
          {numInput(draft.winRateTarget, n => set(p => ({ ...p, winRateTarget: n })), "%")}
        </Row>
        <Row label="เป้าติดตามตรงเวลา" desc="เกณฑ์สีบนหน้าดีลเลอร์ — งานติดตามที่ทำทันเวลา">
          {numInput(draft.onTimeTarget, n => set(p => ({ ...p, onTimeTarget: n })), "%")}
        </Row>

        {/* ไตรมาส/เดือน = แบ่งจากเป้าทั้งปี — ไม่ให้ตั้งแยก จะได้ไม่ขัดกับเป้าทั้งปี
            ไม่มีการ์ด "เป้าทั้งปี" ซ้ำตรงนี้ — ค่านั้นคือช่องกรอกด้านบนอยู่แล้ว และมันไม่ใช่ "ส่วนที่แบ่งมา" */}
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "#6b7280", marginBottom: 8 }}>แบ่งจากเป้าทั้งปี</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
            {[
              { label: "เป้าต่อไตรมาส", value: fmtB(Math.round(draft.annualTarget / 4)) },
              { label: "เป้าต่อเดือน", value: fmtB(Math.round(draft.annualTarget / 12)) },
            ].map(s => (
              <div key={s.label} style={{ background: "#f8fafc", border: "1px solid #eef1f5", borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ fontSize: "0.7rem", color: "#6b7280" }}>{s.label}</div>
                <div style={{ fontSize: "1.15rem", fontWeight: 800, color: NAVY, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      {/* ความคืบหน้า: เป้า / ทำได้จริง / % — ไม่มี "คาดการณ์" เพราะระบบไม่มีข้อมูล forecast */}
      <SectionCard icon={<Target size={19} />} title="ความคืบหน้าทั้งเครือ" desc="ยอดสะสมทั้งปีของทุกดีลเลอร์ เทียบเป้าที่ตั้งไว้ด้านบน">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginTop: 6 }}>
          {[
            { label: "เป้าหมาย", value: fmtB(draft.annualTarget), color: STEEL },
            { label: "ทำได้จริง", value: perf.ready ? fmtB(totalActual) : "—", color: NAVY },
            { label: "ความคืบหน้า", value: `${achievement}%`, color: achievement >= 100 ? "#059669" : achievement >= 70 ? NAVY : "#b45309" },
          ].map(s => (
            <div key={s.label} style={{ background: "#f8fafc", border: "1px solid #eef1f5", borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ fontSize: "0.7rem", color: "#6b7280" }}>{s.label}</div>
              <div style={{ fontSize: "1.15rem", fontWeight: 800, color: s.color, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
            </div>
          ))}
        </div>
        <div style={{ height: 10, background: "#eef1f5", borderRadius: 999, overflow: "hidden", marginTop: 14 }}>
          <div className="bar-grow" style={{ height: "100%", width: `${Math.min(100, achievement)}%`, background: achievement >= 100 ? "#059669" : NAVY, borderRadius: 999 }} />
        </div>
      </SectionCard>

      <RollupTable title="เป้าหมายรายภูมิภาค" rows={byRegion} countryTarget={draft.annualTarget} ready={perf.ready} />
      <RollupTable title="เป้าหมายรายดีลเลอร์" rows={byDealer} ready={perf.ready} />
    </>
  );
}

// ═══════════════════════ 7 · การแจ้งเตือน ═════════════════════════════════════
// 2 การ์ด:
//  1) กฎแจ้งเตือนงานของสำนักงานใหญ่เอง (ลูกค้าเป้าหมาย HQ · ใบค่าแฟรนไชส์) — ขึ้นกระดิ่ง HQ (ดู @pms/shared/lib/hqAlerts)
//     งานขายของดีลเลอร์ไม่อยู่ในนี้แล้ว (บอสสั่ง 14 ก.ย. 69 "ตั้งค่าในขอบเขต hq")
//  2) บันทึกการใช้งาน — หมวดจาก Audit Log ที่กรองกระดิ่ง HQ (Topbar อ่าน hqAuditCategory + inapp)
// ช่องทาง = "ในระบบ" (กระดิ่ง) อย่างเดียว
// ⚠️ ช่อง "อีเมล" ถูกเอาออกตามที่บอสสั่ง 3 ก.ย. 69 — ระบบยังไม่มีตัวส่งอีเมลแจ้งเตือนจริง
//    ค่าที่ตั้งไว้ถูกบันทึกเฉย ๆ ไม่มีอะไรอ่านไปใช้ → เปิดไว้แล้วไม่มีเมลออก ซึ่งหลอกผู้ใช้
//    (คนละเรื่องกับอีเมลเลขยืนยันตอนลืมรหัสผ่าน/ดูรหัสผ่าน ซึ่งส่งจริง)
//    ถ้าวันหน้าทำตัวส่งอีเมลแจ้งเตือนจริงแล้ว ค่อยเพิ่มช่องนี้กลับมาพร้อมกัน
type Notifs = Record<string, HQNotifChannels>;
const CHANNELS: { k: keyof HQNotifChannels; label: string }[] = [
  { k: "inapp", label: "ในระบบ" },
];
// เกณฑ์ (จำนวนวัน) ของแต่ละกฎอยู่ใน HQ_ALERT_META[].เกณฑ์ · ค่าที่ตั้งเก็บใน alerts[เรื่อง].days

// ── อีเมลผู้รับแจ้งเตือนของสำนักงานใหญ่ (ด่าน 1 · ใบ 0193) ─────────────────────────────────────
// ผู้รับของอีเมล "คำขอใบเสนอราคาใหม่ · เกิน 14 วัน · ดีลเลอร์ยกเลิก · ขอแก้ราคา" — ทุกฉบับส่งถึงทุกคนในรายชื่อ
// พิมพ์ทีละบรรทัด (หรือคั่นด้วยจุลภาค) · บรรทัดที่ไม่ใช่อีเมลไม่ถูกนำไปบันทึก และบอกชัดว่าบรรทัดไหนผิด
const รูปแบบอีเมล = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
function EmailRecipientsCard({ value, onChange }: { value: string[]; onChange: (list: string[]) => void }) {
  const [text, setText] = useState(value.join("\n"));
  const [ผิด, setผิด] = useState<string[]>([]);
  // ค่าจากฐานมาถึงทีหลัง (โหลดเสร็จ) หรือถูกล้างด้วยปุ่มยกเลิก → ตามค่านั้น เว้นแต่ผู้ใช้กำลังพิมพ์ค่าที่ยังผิดอยู่
  const ค่าปัจจุบัน = value.join("\n");
  useEffect(() => { if (!ผิด.length) setText(ค่าปัจจุบัน); }, [ค่าปัจจุบัน]); // eslint-disable-line react-hooks/exhaustive-deps
  const เปลี่ยน = (s: string) => {
    setText(s);
    const บรรทัด = s.split(/[\n,]+/).map(x => x.trim()).filter(Boolean);
    const ไม่ผ่าน = บรรทัด.filter(x => !รูปแบบอีเมล.test(x));
    setผิด(ไม่ผ่าน);
    if (!ไม่ผ่าน.length) onChange([...new Set(บรรทัด.map(x => x.toLowerCase()))]);
  };
  return (
    <SectionCard icon={<Mail size={19} />} title="อีเมลผู้รับแจ้งเตือน"
      desc="อีเมลของคำขอใบเสนอราคาใหม่ · คำขอเกิน 14 วัน · ดีลเลอร์ยกเลิกคำขอ · ดีลเลอร์ขอแก้ราคา ส่งถึงทุกคนในรายชื่อนี้ · บรรทัดละหนึ่งอีเมล">
      <textarea aria-label="อีเมลผู้รับแจ้งเตือน" value={text} onChange={e => เปลี่ยน(e.target.value)} rows={4}
        placeholder={"เช่น\nsales@benjaminpebsteel.com"}
        style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${ผิด.length ? "#fca5a5" : "var(--border,#e5e7eb)"}`, borderRadius: 10, padding: "10px 12px", fontSize: "0.84rem", fontFamily: "inherit", resize: "vertical" }} />
      {ผิด.length > 0 && (
        <div role="alert" style={{ marginTop: 6, fontSize: "0.74rem", color: "#b91c1c" }}>
          ไม่ใช่รูปแบบอีเมล: {ผิด.join(", ")} — แก้ให้ถูกก่อน ค่าที่ผิดจะไม่ถูกบันทึก
        </div>
      )}
      {!ผิด.length && value.length === 0 && (
        <div style={{ marginTop: 6, fontSize: "0.74rem", color: "#b45309" }}>
          ยังไม่มีผู้รับ — คำขอใหม่และคำขอเกิน 14 วันจะไม่มีอีเมลถึงใครเลย
        </div>
      )}
    </SectionCard>
  );
}

function NotificationsTab() {
  // ช่องทางแจ้งเตือน (อีเมล/ในระบบ) เก็บรวมกับ hq_notif_rules ใน DB แล้ว
  // เดิมอยู่ใน localStorage คีย์ hq_notifications_v2 → ผู้ดูแลคนหนึ่งตั้งไว้ อีกคนไม่เห็น
  const rules = useRepoDraft<HQNotifRules>(() => settingsRepo.getNotifRules(), (v) => settingsRepo.saveNotifRules(v), DEFAULT_HQ_NOTIF_RULES);
  const chDraft: Notifs = { ...DEFAULT_HQ_NOTIFS, ...(rules.draft.channels ?? {}) };
  const setCh = (key: string, patch: Partial<HQNotifChannels>) =>
    rules.set(p => ({ ...p, channels: { ...DEFAULT_HQ_NOTIFS, ...(p.channels ?? {}), [key]: { ...DEFAULT_HQ_NOTIFS[key], ...(p.channels?.[key] ?? {}), ...patch } } }));
  // บันทึกแล้วยิง event → กระดิ่ง HQ อัปเดตทันที (Topbar ฟัง HQ_NOTIF_UPDATED_EVENT)
  // dep ต้องเป็น "ฟังก์ชันข้างใน" ไม่ใช่ตัวกล่องที่ usePersistentDraft คืนมา
  // กล่องเป็น object literal ใหม่ทุกเรนเดอร์ → ถ้า dep เป็น rules/ch ทั้งก้อน saveAndBroadcast
  // จะใหม่ทุกเรนเดอร์ → useMemo ของ api ใหม่ → useReport ยิง setApi → เรนเดอร์ใหม่ = วนไม่จบ
  const saveAndBroadcast = useCallback(() => {
    rules.save();
    window.dispatchEvent(new Event(HQ_NOTIF_UPDATED_EVENT));
  }, [rules.save]);
  useReport(useMemo(() => ({
    dirty: rules.dirty,
    save: saveAndBroadcast,
    reset: () => rules.reset(),
  }), [rules.dirty, saveAndBroadcast, rules.reset]));

  const setAlert = (k: HQAlertKey, patch: Partial<HQNotifRules["alerts"][HQAlertKey]>) =>
    rules.set(p => ({ ...p, alerts: { ...p.alerts, [k]: { ...p.alerts[k], ...patch } } }));

  return (
    <>
      <EmailRecipientsCard value={rules.draft.emailRecipients ?? []} onChange={list => rules.set(p => ({ ...p, emailRecipients: list }))} />
      <SectionCard icon={<Bell size={19} />} title="การแจ้งเตือนของสำนักงานใหญ่"
        desc="งานของสำนักงานใหญ่เอง — ลูกค้าเป้าหมาย (HQ) · ใบค่าแฟรนไชส์ คำนวณจากข้อมูลจริง แล้วขึ้นที่กระดิ่ง">
        {/* สวิตช์เดียว "เปิด" (บอสสั่ง 3 ก.ย. 69) — เดิมมีช่อง "ในระบบ" แยกไว้เลือกช่องทาง
            แต่พอเหลือช่องทางเดียว (กระดิ่ง) สองสวิตช์ให้ผลเหมือนกันทุกกรณี = ซ้ำซ้อนและชวนสับสน */}
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 4px 8px", fontSize: "0.68rem", fontWeight: 700, color: "#9ca3af" }}>
          <span style={{ width: 42, textAlign: "center" }}>เปิด</span>
        </div>
        <div style={{ border: "1px solid var(--border,#e5e7eb)", borderRadius: 12, overflow: "hidden" }}>
          {HQ_ALERT_META.map((a, i) => {
            // กฎที่ยังไม่เคยถูกบันทึกลงฐานข้อมูล (หรือกฎใหม่ที่เพิ่มทีหลัง) จะไม่มีค่าในกล่องนี้
            // ต้องตกไปใช้ค่าเริ่มต้นเสมอ ไม่ใช่ปล่อยให้เป็นของว่างแล้วอ่านค่าจากมันจนหน้าพังทั้งหน้า
            const pref = rules.draft.alerts?.[a.key] ?? DEFAULT_HQ_NOTIF_RULES.alerts[a.key];
            return (
              <div key={a.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderTop: i ? "1px solid #f1f5f9" : "none", flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                  <div style={{ fontSize: "0.84rem", fontWeight: 700, color: STEEL }}>{a.label}</div>
                  <div style={{ fontSize: "0.72rem", color: "#6b7280", marginTop: 2 }}>{a.desc}</div>
                </div>
                {/* ช่องเกณฑ์ — ปิดกฎแล้วจาง สื่อว่าไม่ถูกใช้ · กฎที่ไม่มีเกณฑ์เว้นที่ไว้ให้สวิตช์ตรงแนวกัน */}
                <div style={{ flex: "0 0 176px", display: "flex", flexDirection: "column", gap: 6, opacity: pref.on ? 1 : .4, pointerEvents: pref.on ? "auto" : "none", transition: "opacity .15s" }}>
                  {a.เกณฑ์ && numInput(เกณฑ์วันแจ้งเตือน(rules.draft, a.key), n => setAlert(a.key, { days: n > 0 ? n : a.เกณฑ์!.ค่าเริ่มต้น }), a.เกณฑ์.หน่วย)}
                </div>
                {/* กดทีเดียวตั้งทั้งสองค่า — ตัวคำนวณเตือน (hqAlerts) เช็ก on && inapp
                    ถ้าตั้งแค่ on ค่าเก่าที่เคยปิด inapp ไว้จะทำให้กดเปิดแล้วไม่เตือน โดยไม่มีอะไรบอก */}
                <div style={{ width: 42, display: "flex", justifyContent: "center" }}>
                  <Toggle on={pref.on && pref.inapp !== false}
                    onChange={() => { const เปิดอยู่ = pref.on && pref.inapp !== false; setAlert(a.key, { on: !เปิดอยู่, inapp: !เปิดอยู่ }); }} />
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard icon={<ShieldCheck size={19} />} title="บันทึกการใช้งานที่อยากรู้"
        desc="เรื่องที่สำนักงานใหญ่อยากเห็นจากบันทึกการใช้งาน · ปิด “ในระบบ” เพื่อซ่อนจากกระดิ่ง">
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 4px 8px", fontSize: "0.68rem", fontWeight: 700, color: "#9ca3af" }}>
          {CHANNELS.map(c => <span key={c.k} style={{ width: 42, textAlign: "center" }}>เปิด</span>)}
        </div>
        <div style={{ border: "1px solid var(--border,#e5e7eb)", borderRadius: 12, overflow: "hidden" }}>
          {HQ_NOTIF_EVENTS.map((ev, i) => (
            <div key={ev.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderTop: i ? "1px solid #f1f5f9" : "none" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.84rem", fontWeight: 700, color: STEEL }}>{ev.label}</div>
                <div style={{ fontSize: "0.72rem", color: "#6b7280", marginTop: 1 }}>{ev.desc}</div>
              </div>
              {CHANNELS.map(c => (
                <div key={c.k} style={{ width: 42, display: "flex", justifyContent: "center" }}>
                  <Toggle on={chDraft[ev.key]?.[c.k] ?? false}
                    onChange={() => setCh(ev.key, { [c.k]: !chDraft[ev.key]?.[c.k] })} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </SectionCard>
    </>
  );
}

// ═══════════════════════ 1 · บริษัท (+ สำรอง/กู้คืน) ══════════════════════════
// สำรอง/กู้คืนอ่าน-เขียนผ่าน repo ทั้งหมด (ดู exportAll/importAll) ไม่พึ่งรายชื่อคีย์ localStorage อีกแล้ว
function BackupCard() {
  const toast = useToast();
  // นำเข้า/คืนค่าเริ่มต้น เขียนทับนโยบายทั้งเครือได้ในคลิกเดียว ต้องบันทึกประวัติเหมือนการแก้ค่าตั้งปกติ
  // (พบจากผลตรวจสอบตรรกะระบบ 31 ก.ค. 69 — เดิมสองปุ่มนี้ไม่บันทึกอะไรเลย ต่างจากปุ่มบันทึกค่าตั้งทั่วไป)
  const logAudit = useAuditLogger();

  // สำรอง/กู้คืน "ค่าจริงที่ระบบใช้อยู่" — อ่านผ่าน repo ทั้งหมด
  // เดิมอ่าน/เขียน localStorage ตรง ๆ ซึ่งพังไปแล้วตั้งแต่ค่าพวกนี้ย้ายเข้า DB:
  //   ส่งออกได้ไฟล์ว่าง · นำเข้าไม่มีผล · "คืนค่าเริ่มต้น" ขึ้น confirm แล้วไม่เกิดอะไรขึ้น
  async function exportAll() {
    try {
      const [policy, targets, notifRules, lostReasons, company, dealers] = await Promise.all([
        settingsRepo.getPolicy(), settingsRepo.getTargets(), settingsRepo.getNotifRules(),
        settingsRepo.getLostReasons(), hqCompanyRepo.get(), dealersRepo.list(),
      ]);
      // ไฟล์ Excel เล่มเดียว แยกแท็บตามเรื่อง หัวตารางภาษาไทย — เปิดอ่าน/แก้ แล้วนำเข้ากลับได้เลย
      // (เดิมเป็น .json ซึ่งเปิดแล้วอ่านไม่รู้เรื่อง และเอาไปทำอะไรต่อไม่ได้)
      const แผ่นงาน = สร้างแผ่นงานสำรอง({ policy, targets, notifRules, lostReasons, company, dealers });
      const ชื่อไฟล์ = `การตั้งค่าเบญจมิน-${APP_NOW_ISO.slice(0, 10)}.xlsx`;
      ดาวน์โหลดไฟล์(สร้างไฟล์Xlsx(แผ่นงาน), ชื่อไฟล์);
      logAudit("ส่งออกการตั้งค่า", ชื่อไฟล์);
      toast(`ส่งออกแล้ว — ${แผ่นงาน.length} แท็บ · ดีลเลอร์ ${dealers.length} ราย`);
    } catch (e) {
      toast("ส่งออกไม่สำเร็จ: " + friendlyError(e));
    }
  }

  // รับไฟล์ Excel ที่ส่งออกไป (แก้ใน Excel มาแล้วก็ได้) และไฟล์ .json รุ่นเก่าที่เคยสำรองไว้
  async function importAll(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
    try {
      let ที่จะเขียน: ชุดการตั้งค่า;
      if (/\.json$/i.test(file.name)) {
        const obj = JSON.parse(await file.text()) as Record<string, unknown>;
        ที่จะเขียน = {
          policy: obj.policy as HQPolicy | undefined,
          targets: obj.targets as HQTargets | undefined,
          notifRules: obj.notifRules as HQNotifRules | undefined,
          lostReasons: Array.isArray(obj.lostReasons) ? obj.lostReasons as string[] : undefined,
          company: obj.company as HQCompany | undefined,
          dealers: Array.isArray(obj.dealers) ? obj.dealers as DealerRow[] : undefined,
        };
      } else {
        // ต่อยอดจากค่าที่ใช้อยู่จริง — แท็บไหนไม่มีในไฟล์ = ไม่แตะเรื่องนั้น
        const [policy, targets, notifRules, lostReasons, company, dealers] = await Promise.all([
          settingsRepo.getPolicy(), settingsRepo.getTargets(), settingsRepo.getNotifRules(),
          settingsRepo.getLostReasons(), hqCompanyRepo.get(), dealersRepo.list(),
        ]);
        const เล่ม = await อ่านสมุดงานจากไฟล์(file);
        ที่จะเขียน = อ่านแผ่นงานสำรอง(เล่ม, { policy, targets, notifRules, lostReasons, company, dealers });
        if (!Object.keys(ที่จะเขียน).length) {
          toast("ไฟล์นี้ไม่มีแท็บการตั้งค่าที่ระบบรู้จัก — ใช้ไฟล์ที่ส่งออกจากปุ่ม “ส่งออก (สำรองข้อมูล)”");
          return;
        }
      }
      // ค่าตั้งเครือ 5 กลุ่ม (policy/targets/notifRules/lostReasons/company) เขียนแบบ all-or-nothing
      // ในคำสั่งเดียว (RPC, 0093 — Phase 4 transaction) — เดิมยิงแยกกัน เน็ตหลุดกลางทาง = กู้คืนได้แค่
      // บางส่วน · ทะเบียนดีลเลอร์/แคตตาล็อก เป็นชุดข้อมูลแยก ยังคงเขียนแยกเหมือนเดิม (คนละความเสี่ยง)
      await settingsRepo.restoreSettings({
        policy: ที่จะเขียน.policy, targets: ที่จะเขียน.targets, notifRules: ที่จะเขียน.notifRules,
        lostReasons: ที่จะเขียน.lostReasons, company: ที่จะเขียน.company,
      });
      const jobs: Promise<unknown>[] = [];
      if (ที่จะเขียน.dealers?.length) jobs.push(dealersRepo.save(ที่จะเขียน.dealers));
      await Promise.all(jobs);
      logAudit("นำเข้าการตั้งค่า (กู้คืน)", file.name);
      toast("นำเข้าสำเร็จ — กำลังโหลดใหม่");
      setTimeout(() => location.reload(), 900);
    } catch (err) {
      toast("นำเข้าไม่สำเร็จ: " + friendlyError(err));
    }
  }

  async function restoreDefaults() {
    if (!(await ยืนยัน({
      หัวข้อ: "คืนค่าเริ่มต้นของนโยบาย เป้าหมาย กฎแจ้งเตือน และเหตุผลปิดการขาย ?",
      รายละเอียด: "ทะเบียนดีลเลอร์และแคตตาล็อกจะไม่ถูกแตะ",
      ปุ่มตกลง: "คืนค่าเริ่มต้น", อันตราย: true,
    }))) return;
    try {
      // all-or-nothing (RPC, 0093 — Phase 4 transaction) — เดิมยิงแยก 4 คำขอ
      await settingsRepo.restoreSettings({
        policy: DEFAULT_HQ_POLICY, targets: DEFAULT_HQ_TARGETS,
        notifRules: DEFAULT_HQ_NOTIF_RULES, lostReasons: [...LOST_REASONS],
      });
      logAudit("คืนค่าเริ่มต้น", "นโยบาย/เป้าหมาย/กฎแจ้งเตือน/เหตุผลปิดการขาย");
      toast("คืนค่าเริ่มต้นแล้ว — กำลังโหลดใหม่");
      setTimeout(() => location.reload(), 900);
    } catch (e) {
      toast("คืนค่าไม่สำเร็จ: " + friendlyError(e));
    }
  }

  return (
    <SectionCard icon={<RefreshCw size={19} />} title="สำรองและกู้คืนข้อมูล" desc="ส่งออกเป็นไฟล์ Excel เปิดอ่าน/แก้ไขได้ แล้วนำเข้ากลับเพื่อกู้คืน">
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
        <button className="btn btn-secondary btn-md" onClick={() => void exportAll()}><Download size={14} /> ส่งออก (สำรองข้อมูล)</button>
        <label className="btn btn-secondary btn-md" style={{ cursor: "pointer" }}><Upload size={14} /> นำเข้า (กู้คืน)<input type="file" accept=".xlsx,.csv,.json" style={{ display: "none" }} onChange={e => void importAll(e)} /></label>
        <button className="btn btn-md" style={{ background: "#fff", color: "#dc2626", border: "1px solid #fecaca" }} onClick={() => void restoreDefaults()}><RotateCcw size={14} /> คืนค่าเริ่มต้น (นโยบาย/เป้า/แจ้งเตือน)</button>
      </div>
    </SectionCard>
  );
}
function CompanyTab() {
  return (
    <>
      <CompanyPanel embedded />
      <BackupCard />
    </>
  );
}

// ═══════════════════════ ROOT ═════════════════════════════════════════════════
// ไม่มี ความปลอดภัย / SLA / LSA / แบรนด์ / ธีม / AI / ส่วนลด
// แท็บ "ดีลเลอร์" ถูกยุบตามคำสั่ง — ทั้งใบซ้ำกับหน้า /hq/dealers (ตารางบัญชี · สลับสถานะ · เข้าระบบแทน)
//   "รีเซ็ตรหัสผ่าน" ย้ายไปอยู่ในโมดัล "รหัสเข้าระบบ" ของหน้า /hq/dealers แล้ว (ไม่มีที่อื่นมาก่อน)
//   "ค่ามาตรฐานดีลเลอร์" (defaultQuota) ถูกลบ — ไม่มีใครอ่านค่านั้นเลย ค่าจริงตอนสร้างดีลเลอร์อยู่ที่ /hq/dealers
type TabKey = "company" | "users" | "journey" | "recruit" | "targets" | "notifications";
const TABS: { key: TabKey; label: string; icon: ReactNode; render: () => ReactNode }[] = [
  { key: "company", label: "บริษัท", icon: <Building2 size={15} />, render: () => <CompanyTab /> },
  { key: "users", label: "ผู้ใช้งานและสิทธิ์", icon: <Users size={15} />, render: () => <UsersPanel embedded /> },
  { key: "journey", label: "เส้นทางการขาย", icon: <GitMerge size={15} />, render: () => <JourneyTab /> },
  // งานหาดีลเลอร์ของ HQ เอง (บอสสั่ง 14 ก.ย. 69) — แยกจาก "เส้นทางการขาย" ซึ่งเป็นกติกาของดีลเลอร์
  { key: "recruit", label: "หาดีลเลอร์", icon: <UserPlus size={15} />, render: () => <RecruitTab /> },
  { key: "targets", label: "เป้าหมายยอดขาย", icon: <Target size={15} />, render: () => <TargetsTab /> },
  { key: "notifications", label: "การแจ้งเตือน", icon: <Bell size={15} />, render: () => <NotificationsTab /> },
];

// ตั้งค่าส่วนกลาง (ผู้ใช้/นโยบาย/เป้า/ดีลเลอร์) = ต้องมีสิทธิ์ hq:all_data — HQ_STAFF เข้าไม่ได้
export default function HQSettingsPage() {
  return <AdminGate perm="hq:all_data"><HQSettingsPageInner /></AdminGate>;
}
function HQSettingsPageInner() {
  const [tab, setTab] = useState<TabKey>("company");
  const [api, setApi] = useState<SectionApi | null>(null);
  const [toast, setToastMsg] = useState<string | null>(null);
  const report = useCallback((a: SectionApi | null) => setApi(a), []);
  const showToast = useCallback((m: string) => { setToastMsg(m); setTimeout(() => setToastMsg(null), 2400); }, []);
  const logAudit = useAuditLogger();
  const dirty = !!api?.dirty;
  // เตือนตอนออกจากหน้า/ปิดแท็บด้วย — switchTab ข้างล่างเตือนแค่ตอนสลับแท็บในหน้าเดียวกัน
  useUnsavedGuard(dirty);

  async function switchTab(next: TabKey) {
    if (next === tab) return;
    if (dirty && !(await ยืนยัน({
      หัวข้อ: "ส่วนนี้ยังไม่บันทึก",
      รายละเอียด: "เปลี่ยนหัวข้อแล้วสิ่งที่แก้ไว้จะหาย",
      ปุ่มตกลง: "ทิ้งที่แก้ไว้", ปุ่มยกเลิก: "อยู่หัวข้อเดิม", อันตราย: true,
    }))) return;
    setTab(next);
  }
  const active = TABS.find(t => t.key === tab)!;
  function saveAll() { if (dirty && api) { api.save(); logAudit("บันทึกการตั้งค่า", active.label); showToast("บันทึกการตั้งค่าแล้ว"); } }
  function resetAll() { if (dirty && api) api.reset(); }

  return (
    <BusCtx.Provider value={{ report, toast: showToast }}>
      <div className="erp">
        {/* ปุ่มบันทึก/รีเซ็ต → แถบบน (ชื่อหน้ามาจาก Topbar) — เลย์เอาต์เดียวกับหน้าตั้งค่าดีลเลอร์ */}
        <TopbarActions>
          {dirty && <span style={{ fontSize: "0.72rem", color: "#d97706", fontWeight: 600 }}>ยังไม่บันทึก</span>}
          <button className="btn btn-secondary btn-sm" onClick={resetAll} disabled={!dirty} style={!dirty ? { opacity: .5, cursor: "not-allowed" } : undefined}><RotateCcw size={14} /> รีเซ็ต</button>
          <button className="btn btn-primary btn-sm" onClick={saveAll} disabled={!dirty} style={!dirty ? { opacity: .5, cursor: "not-allowed" } : undefined}><Save size={14} /> บันทึก</button>
        </TopbarActions>
        {/* คำโปรยใต้ชื่อหน้าถูกเอาออกทุกหน้า (บอสสั่ง 14 ส.ค. 69) */}

        {/* แท็บแนวนอน */}
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="tab-bar" style={{ overflowX: "auto" }}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => switchTab(t.key)}
                className={`tab-item${tab === t.key ? " active" : ""}`}
                style={{ display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap" }}>
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Active section — ห่อด้วย section-stack ให้การ์ดทุกใบห่างเท่ากัน */}
        <div className="section-stack" style={{ minWidth: 0 }}>
          {active.render()}
        </div>

        {/* Toast */}
        {toast && (
          <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, background: "#111827", color: "#fff", padding: "12px 18px", borderRadius: 12, fontSize: "0.82rem", fontWeight: 600, boxShadow: "0 12px 32px rgba(0,0,0,.28)", display: "flex", alignItems: "center", gap: 9 }}>
            <Check size={15} color="#7ee2b8" /> {toast}
          </div>
        )}
      </div>
    </BusCtx.Provider>
  );
}
