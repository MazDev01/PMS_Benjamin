"use client";
import { ไม่ใช่แถวHQ } from "@pms/shared/lib/hqDealerRow";

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
//   อีเมลผู้รับแจ้งเตือน  → ตัววางจดหมายของฐาน (_email_enqueue_hq · ใบ 0231)
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
import { TablePagination, pageSlice, pageCountOf } from "@pms/shared/components/ui/TablePagination";
import { fmtBahtM as fmtB, formatMoneyInput, parseMoneyInput } from "@pms/shared/lib/format";
import {
  DEFAULT_RECRUIT_SETTINGS, จำนวนรายการสูงสุด, ความยาวรายการสูงสุด,
  type HQRecruitSettings,
} from "@pms/shared/lib/recruitSettings";
import { settings as settingsRepo, dealers as dealersRepo, hqCompany as hqCompanyRepo, audit as auditRepo } from "@pms/shared/lib/data";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { สร้างไฟล์Xlsx, ดาวน์โหลดไฟล์ } from "@pms/shared/lib/exportWorkbook";
import { สร้างแผ่นงานสำรอง, อ่านแผ่นงานสำรอง, type ชุดการตั้งค่า } from "@pms/shared/lib/settingsBackup";
import { อ่านสมุดงานจากไฟล์ } from "@pms/shared/lib/importSheet";
import { APP_NOW_ISO } from "@pms/shared/context/FilterContext";
import type { HQCompany } from "@pms/shared/lib/data/types";
import { AdminGate } from "@pms/shared/components/layout/AdminGate";
import {
  DEFAULT_HQ_POLICY,
  DEFAULT_HQ_TARGETS,
  DEFAULT_HQ_NOTIF_RULES,
  LEAD_TASK_TEMPLATE, ระบบติ๊กเมื่อ,
  LOST_REASONS,
  type HQPolicy, type HQTargets, type HQNotifRules,
  type DealerRow, type LeadTaskDef, type ขั้นรายการ,
  OTHER_REASON_OPTION,
} from "@pms/shared/lib/mock";
// แท็บ "บริษัท" / "ผู้ใช้งาน" ฝังหน้าจัดการจริงเต็ม
import { CompanyPanel } from "@pms/shared/components/hq/CompanyPanel";
import { UsersPanel } from "@pms/shared/components/hq/UsersPanel";
import { MaterialTemplatesPanel } from "@pms/shared/components/hq/MaterialTemplatesPanel";
import { StorageUsagePanel } from "@pms/shared/components/hq/StorageUsagePanel";
import { SectionCard } from "@pms/shared/components/ui/SectionCard";
import { EmailListEditor, NotifyPrefsTable, NotifyTestButton } from "@pms/shared/components/ui/NotificationSettings";
import { ชื่อขั้น, สีขั้น } from "@pms/shared/lib/leadStage";
import { TopbarActions } from "@pms/shared/components/layout/TopbarActions";
import { useUnsavedGuard } from "@pms/shared/lib/useUnsavedGuard";
import { SettingsBusCtx as BusCtx, type SectionApi } from "@pms/shared/lib/settingsBus";
import {
  Building2, Users, GitMerge, Target, Bell, UserPlus, FileText, ArrowUp, ArrowDown,
  Save, RotateCcw, Plus, Trash2, Check, X,
  Download, Upload, RefreshCw, AlertCircle,
  Mail, Boxes, HardDrive,
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
const numInput = (value: number, onChange: (n: number) => void, unit: string, step?: number) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    {/* ลบทั้งช่องระหว่างพิมพ์ได้ (ไม่เด้งเป็น 0 แล้วพิมพ์ต่อได้ "09") — ดู NumberInput */}
    <NumberInput step={step} ariaLabel={unit} min={0} style={{ textAlign: "right", fontWeight: 700 }} value={value} onChange={onChange} />
    <span style={{ fontSize: "0.72rem", color: "#6b7280", whiteSpace: "nowrap" }}>{unit}</span>
  </div>
);
// regionDisplay = ใช้ของกลาง (hqQuotations.ts) แหล่งเดียว — เดิม copy ในไฟล์นี้ไม่มี guard "ไม่ระบุ" (1.4)

// ═══════════════════════ 3 · เส้นทางการขาย ════════════════════════════════════
// ขั้น = 5 ขั้นของ FLOW ใหม่ (leadStage.ts · บอสสั่ง 27 ต.ค. 69 · FLOW D7) — ชื่อ/สี/ลำดับของขั้นแก้ที่นี่ไม่ได้
// สิ่งที่ HQ แก้ได้คือ "รายการเตือน" ในแต่ละขั้น (hq_sales_journey.tasks) — ติ๊กไว้กันลืม ไม่เลื่อนขั้นของลีด
//   รายการของระบบ (นัดหมาย · ส่งคำขอราคา · ได้ใบ HQ · จัดทำใบ · ส่งใบ) ฐานติ๊กเมื่อทำจริง → แก้/ลบไม่ได้ (ฐานกัน ใบ 0250)
//   รายการติ๊กเอง → แก้ชื่อ/เพิ่ม/ลบได้
// เหตุผลปิดการขายไม่สำเร็จ — ขั้น "ปิดไม่สำเร็จ" เป็นปลายทางหนึ่งของเส้นทางการขาย จึงอยู่แท็บนี้
// (เดิมอยู่แท็บ "กฎธุรกิจ" ซึ่งยุบไปแล้ว — คีย์ hq_sales_journey เหมือนเดิม ค่าที่ตั้งไว้ไม่หาย)
// เก็บผ่าน repository — เดิมเขียนลง localStorage ของ origin ฝั่ง HQ ซึ่งดีลเลอร์ (คนละ origin)
// อ่านไม่เห็นเลย รายการที่ตั้งไว้จึงไม่เคยมีผลกับใคร (ค่าเริ่มต้นใช้ LOST_REASONS แหล่งเดียวกับดีลเลอร์)
type Journey = { lost: string[] };
const DEFAULT_JOURNEY: Journey = { lost: [...LOST_REASONS] };

// ── ตัวช่วยของการ์ด "ขั้นตอนการขายมาตรฐาน" ────────────────────────────────────
// รหัสงาน (key) ผูกกับ checklist ที่บันทึกไว้ในลูกค้าเป้าหมายทุกใบ — งานใหม่ต้องได้ key ที่ไม่ซ้ำของเดิม
// และห้ามเปลี่ยน key ของงานที่มีอยู่ (ลูกค้าเป้าหมายเก่าจะหาไม่เจอ = ประวัติการเช็กงานหาย) จึงแก้ได้แค่ "ชื่อ"
function newTaskKey(existing: LeadTaskDef[], step: ขั้นรายการ): string {
  const base = `task_step${step}`;
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
  const ขั้นทั้งหมด = [1, 2, 3, 4, 5] as const;
  const tasksOf = (n: ขั้นรายการ) => tk.draft.filter(t => t.step === n);
  // แก้ได้แค่ชื่อ — key คงเดิมเสมอ (ผูกกับ checklist ของลูกค้าเป้าหมายที่บันทึกไว้แล้ว)
  //   รายการของระบบแก้ชื่อ/ลบไม่ได้ (ฐานปฏิเสธ system_task_locked)
  const renameTask = (key: string, label: string) => tk.set(p => p.map(t => t.key === key && !t.auto ? { ...t, label } : t));
  const removeTask = (key: string) => tk.set(p => p.filter(t => t.key !== key || t.auto));
  const addTask = (step: ขั้นรายการ) => tk.set(p => {
    const def: LeadTaskDef = { key: newTaskKey(p, step), label: "", step };
    // แทรกต่อท้ายรายการของขั้นเดียวกัน — ห้ามไปโผล่ท้ายสุดข้ามขั้น
    const last = p.map(t => t.step).lastIndexOf(step);
    if (last < 0) return [...p, def];
    return [...p.slice(0, last + 1), def, ...p.slice(last + 1)];
  });

  return (
    <>
      <SectionCard icon={<GitMerge size={19} />} title="ขั้นตอนการขายมาตรฐาน"
        desc="5 ขั้นเดียวกันทุกดีลเลอร์ — สำนักงานใหญ่กำหนดรายการเตือนของแต่ละขั้น ดีลเลอร์แก้ไขไม่ได้">
        <div style={{ border: "1px solid var(--border,#e5e7eb)", borderRadius: 12, overflow: "hidden", marginTop: 6 }}>
          {ขั้นทั้งหมด.map((n, idx) => (
            <div key={n} data-journey-step={n} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "11px 14px", borderBottom: idx < ขั้นทั้งหมด.length - 1 ? "1px solid #f1f5f9" : "none", flexWrap: "wrap" }}>
              {/* ไม่มีเลขลำดับ (บอสสั่ง 28 ต.ค. 69) — จุดสีของขั้น + ชื่อจาก ชื่อขั้น() ตัวกลาง · ลำดับดูจากแถวบนลงล่าง */}
              <span aria-hidden style={{ width: 10, height: 10, borderRadius: "50%", background: สีขั้น(n).bar, flexShrink: 0, marginTop: 10 }} />
              <span style={{ flex: "1 1 140px", fontSize: "0.84rem", fontWeight: 700, color: STEEL, marginTop: 5 }}>{ชื่อขั้น(n)}</span>
              {/* รายการเตือนของขั้นนี้ — ติ๊กกันลืม ไม่เลื่อนขั้น · รายการของระบบล็อก (ฐานติ๊กเมื่อทำจริง) */}
              <span style={{ flex: "2 1 300px", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {tasksOf(n).map(t => t.auto ? (
                  <span key={t.key} data-system-task={t.key} title={ระบบติ๊กเมื่อ(t.key)}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#eef3f8", border: "1px dashed #b6c4d4", borderRadius: 8, padding: "4px 9px", fontSize: "0.74rem", fontWeight: 600, color: "#334155" }}>
                    {t.label} <span style={{ fontSize: "0.64rem", color: "#64748b", fontWeight: 500 }}>· ระบบติ๊ก</span>
                  </span>
                ) : (
                  <span key={t.key} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#f1f5f9", borderRadius: 8, padding: "3px 4px 3px 9px" }}>
                    <input
                      aria-label={`ชื่องานของขั้น ${ชื่อขั้น(n)}`}
                      value={t.label} placeholder="ชื่องาน…" autoFocus={!t.label}
                      onChange={e => renameTask(t.key, e.target.value)}
                      style={{ border: "none", background: "transparent", outline: "none", fontFamily: "inherit", fontSize: "0.74rem", fontWeight: 600, color: "#374151", width: `${Math.max(7, (t.label.length || 7) + 1)}ch` }}
                    />
                    <button onClick={() => removeTask(t.key)} title={`ลบงาน ${t.label || "ที่ยังไม่ตั้งชื่อ"}`}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", display: "flex", padding: 2 }}><X size={12} /></button>
                  </span>
                ))}
                <button onClick={() => addTask(n)} className="btn btn-secondary btn-sm"
                  title={`เพิ่มงานในขั้น ${ชื่อขั้น(n)}`}
                  style={{ padding: "2px 9px", fontSize: "0.7rem", color: NAVY }}><Plus size={12} /> เพิ่มงาน</button>
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
          {([6, 7] as const).map(n => (
            <div key={n} style={{ flex: "1 1 220px", display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 10, background: สีขั้น(n).bg, border: `1px solid ${สีขั้น(n).bar}` }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: สีขั้น(n).text }} />
              <span style={{ flex: 1, fontSize: "0.8rem", fontWeight: 700, color: สีขั้น(n).text }}>{ชื่อขั้น(n)}</span>
              <span className="badge" style={{ background: "#fff", color: สีขั้น(n).text, border: "none" }}>ขั้นปิด</span>
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
          {/* ช่องตั้งรายการเหตุผลของ HQ — ไม่ใช่กล่องเหตุผล (ตัวตรวจ check-reason-dialogs) */}
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
//   3 พ.ย. 69 (ตาม FLOW H2–H5): เหลือ แหล่งที่มา / เหตุผลที่ไม่สำเร็จ (ตั้งต้น 4 ข้อ ใบ 0274) / ค่าตั้งต้นใบค่าแฟรนไชส์ (อายุใบตั้งต้น 7 วัน · เงื่อนไข · ผู้ลงนาม)
//   ชื่องานตามขั้น · ประเภทธุรกิจ · ช่องทางในบันทึกการติดต่อ เอาออก (ค่าเดิมในฐานคงไว้ ไม่แสดง/ไม่ใช้)
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


function RecruitTab() {
  const toast = useToast();
  const rc = useRepoDraft<HQRecruitSettings>(
    () => settingsRepo.getRecruitSettings(),
    (v) => { settingsRepo.saveRecruitSettings(v).catch(e => toast("บันทึกค่าตั้งหาดีลเลอร์ไม่สำเร็จ: " + friendlyError(e))); },
    DEFAULT_RECRUIT_SETTINGS,
  );
  useReport(useMemo(() => ({ dirty: rc.dirty, save: rc.save, reset: rc.reset }), [rc.dirty, rc.save, rc.reset]));
  const d = rc.draft;
  const ตั้งรายการ = (k: "channels" | "lostReasons") =>
    (next: string[]) => rc.set(p => ({ ...p, [k]: next }));
  const ตั้งใบ = (patch: Partial<HQRecruitSettings["proposal"]>) => rc.set(p => ({ ...p, proposal: { ...p.proposal, ...patch } }));
  const หมายเหตุ = { fontSize: "0.7rem", color: "#8a929c", marginTop: 8 } as const;

  return (
    <>
      {/* บอสสั่ง 3 พ.ย. 69 (ตาม FLOW H2–H5): เหลือ "แหล่งที่มา" + "เหตุผลที่ไม่สำเร็จ" แถวเดียวกัน
          เอาออก: ชื่องานตามขั้น (ใช้ชื่อ 4 งานตาม FLOW ตายตัว · ชื่อเดิมในฐานคงไว้ไม่แสดง) · ประเภทธุรกิจ (ฟอร์มพิมพ์เอง)
                  ช่องทางในบันทึกการติดต่อ (รายการตายตัว โทรศัพท์ · LINE · Facebook · พบตัว · อีเมล · อื่น ๆ — บันทึกเก่าช่องทางอื่นยังแสดงตามเดิม)
          fill + note จองบรรทัดเท่ากัน → ช่องเพิ่มของสองการ์ดอยู่ระดับเดียวกัน */}
      <div className="row-2-eq">
        <SectionCard fill icon={<UserPlus size={19} />} title="แหล่งที่มา">
          <ListEditor label="แหล่งที่มา" items={d.channels} onChange={ตั้งรายการ("channels")} placeholder="เช่น TikTok"
            emptyNote="ยังไม่มีแหล่งที่มา — ถ้าบันทึกตอนว่าง ระบบใช้รายการเริ่มต้น"
            note="ในฟอร์มมีตัวเลือก “อื่น ๆ” ต่อท้ายให้เสมอ" noteLines={2} />
        </SectionCard>

        <SectionCard fill icon={<X size={19} />} title="เหตุผลที่ไม่สำเร็จ (ผู้สนใจเป็นดีลเลอร์)">
          <ListEditor label="เหตุผลที่ไม่สำเร็จ" items={d.lostReasons} onChange={ตั้งรายการ("lostReasons")} placeholder="เช่น เงินทุนไม่พอ"
            emptyNote="ยังไม่ได้ตั้ง — ตอนปิดว่าไม่สำเร็จยังพิมพ์เหตุผลเองได้"
            note="มีตัวเลือก “อื่น ๆ (ระบุเอง)” ให้ด้วยเสมอ · ปฏิเสธ/หมดอายุใบค่าแฟรนไชส์ต้องมีเหตุผล · แยกจากเหตุผลของดีลเลอร์" noteLines={2} />
        </SectionCard>
      </div>

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
        {/* "ตัวเลขตั้งต้นของแต่ละแพ็กเกจ" เอาออก (บอสสั่ง 30 ต.ค. 69 เอาระบบแพ็กเกจออกทั้งหมด) — HQ กรอกยอดในใบค่าแฟรนไชส์เอง */}
      </SectionCard>
    </>
  );
}

// ═══════════════════════ 5 · เป้าหมายยอดขาย ═══════════════════════════════════
// แบบหน้า (บอสสั่ง 2 พ.ย. 69 · ตั้งค่าให้ตรง flow ใหม่): เป้าทั้งเครือทั้งปี + ตารางเป้ารายดีลเลอร์ที่แก้ตัวเลขในตารางได้
//   ผลงาน (ทำได้จริง / ความคืบหน้า) ดูที่ภาพรวมยอดขายที่เดียว — ตัดออกจากหน้านี้ · ไม่มีเป้าติดตามตรงเวลา (คอลัมน์ตรงเวลาเอาออก 30 ต.ค. 69)
//   เป้าอัตราปิดการขายเฉลี่ย: เดิมเป็น "เกณฑ์สีบนหน้าดีลเลอร์" ซึ่งไม่มีตัวเลขยอดขายแล้ว และภาพรวมยอดขาย (ตามแบบ) ไม่มีเกณฑ์สี
//     → ไม่มีที่ใช้ เอาออก (บอสสั่ง "ถ้าไม่มีที่ใช้ เอาออก") · ช่องในฐาน (hq_targets) คงไว้ ไม่แตะ
// เป้าทั้งปี = แหล่งเดียว (แดชบอร์ด HQ/ดีลเลอร์อ่านค่านี้) · เป้ารายดีลเลอร์ = DealerRow.revenueTarget (บันทึกทางเดียวกับหน้าดีลเลอร์)
function TargetsTab() {
  const { draft, set, dirty, save, reset } = useRepoDraft<HQTargets>(() => settingsRepo.getTargets(), (v) => settingsRepo.saveTargets(v), DEFAULT_HQ_TARGETS);
  const toast = useToast();
  const [dealers, setDealers] = useState<DealerRow[]>([]); // ของจริงมาจาก repo — ห้ามตั้งต้นด้วย seed
  // แถว HQ ไม่ใช่ดีลเลอร์ — ไม่นับ/ไม่แสดง (บอสตัดสิน 19 ต.ค. 69 · lib/hqDealerRow.ts)
  const โหลดดีลเลอร์ = () => dealersRepo.list().then(l => setDealers(l.filter(ไม่ใช่แถวHQ).sort((a, b) => a.code.localeCompare(b.code)))).catch(e => logRepoRead("dealers.list", e));
  useEffect(() => { void โหลดดีลเลอร์(); }, []);
  // เป้ารายดีลเลอร์ที่แก้ในตาราง (ยังไม่บันทึก) — บันทึกพร้อมปุ่มบันทึกกลางของหน้าตั้งค่า
  const [แก้เป้า, setแก้เป้า] = useState<Record<string, number>>({});
  const เป้าของ = (d: DealerRow) => แก้เป้า[d.code] ?? d.revenueTarget ?? 0;
  const แก้ค้าง = Object.keys(แก้เป้า).some(c => แก้เป้า[c] !== (dealers.find(d => d.code === c)?.revenueTarget ?? 0));
  const บันทึกทั้งหมด = useCallback(async () => {
    if (dirty) await save();
    const เปลี่ยน = dealers.filter(d => แก้เป้า[d.code] != null && แก้เป้า[d.code] !== d.revenueTarget).map(d => ({ ...d, revenueTarget: แก้เป้า[d.code] }));
    if (!เปลี่ยน.length) return;
    try { await dealersRepo.save(เปลี่ยน); setแก้เป้า({}); await โหลดดีลเลอร์(); }
    catch (e) { toast(`บันทึกเป้ารายดีลเลอร์ไม่สำเร็จ — ${friendlyError(e)}`); }
  }, [dirty, save, dealers, แก้เป้า, toast]); // eslint-disable-line react-hooks/exhaustive-deps
  const ยกเลิกทั้งหมด = useCallback(() => { reset(); setแก้เป้า({}); }, [reset]);
  useReport(useMemo(() => ({ dirty: dirty || แก้ค้าง, save: บันทึกทั้งหมด, reset: ยกเลิกทั้งหมด }), [dirty, แก้ค้าง, บันทึกทั้งหมด, ยกเลิกทั้งหมด]));

  const ผลรวมเป้าดีลเลอร์ = dealers.reduce((s, d) => s + เป้าของ(d), 0);
  const [หน้า, setหน้า] = useState(0);
  const หน้าจริง = Math.min(หน้า, pageCountOf(dealers.length) - 1);

  return (
    <>
      <SectionCard icon={<Target size={19} />} title="เป้าหมายยอดขายทั้งเครือ" desc="ใช้ในการ์ดยอดขายเทียบเป้า (ทั้งเครือ) · เป้าตามช่วง = เป้าทั้งปี × จำนวนวัน ÷ 365">
        <Row label="เป้ายอดขายทั้งปี" desc="บาท ก่อน VAT — แดชบอร์ดสำนักงานใหญ่และแดชบอร์ดดีลเลอร์ใช้ค่านี้">
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {numInput(draft.annualTarget, n => set(p => ({ ...p, annualTarget: n })), "บาท", 1_000_000)}
            {/* ปุ่มลัด (บอสสั่ง 2 พ.ย. 69): ตั้งเป้าทั้งเครือ = ผลรวมเป้าดีลเลอร์ในตารางด้านล่าง (รวมตัวเลขที่เพิ่งแก้ยังไม่บันทึก) */}
            <button type="button" className="btn btn-secondary btn-sm" data-act="target-from-dealers" disabled={!dealers.length || ผลรวมเป้าดีลเลอร์ === draft.annualTarget}
              onClick={() => set(p => ({ ...p, annualTarget: ผลรวมเป้าดีลเลอร์ }))} title={`ตั้งเป็น ${fmtB(ผลรวมเป้าดีลเลอร์)}`}>
              ตั้งเท่าผลรวมเป้าดีลเลอร์
            </button>
          </div>
        </Row>
      </SectionCard>

      <SectionCard icon={<Target size={19} />} title="เป้าหมายรายดีลเลอร์" desc="แก้ตัวเลขในตารางได้เลย แล้วกดบันทึกด้านบน · เป้ารายเดือน = เป้าทั้งปี ÷ 12">
        <div className="table-wrap" style={{ marginTop: 6 }}>
          <table aria-label="เป้าหมายรายดีลเลอร์">
            <colgroup>
              <col style={{ width: "40%" }} />
              <col style={{ width: "20%" }} />
              <col style={{ width: "22%", minWidth: 150 }} />
              <col style={{ width: "18%", minWidth: 110 }} />
            </colgroup>
            <thead>
              <tr><th>ดีลเลอร์</th><th>จังหวัด</th><th className="num">เป้าทั้งปี (บาท)</th><th className="num">เป้ารายเดือน</th></tr>
            </thead>
            <tbody>
              {!dealers.length ? <tr><td colSpan={4} className="empty-row">—</td></tr>
                : pageSlice(dealers, หน้าจริง).map(d => (
                  <tr key={d.code} data-target-row={d.code}>
                    <td style={{ fontWeight: 600, color: STEEL }} title={`${d.code} · ${d.name}`}>
                      <strong style={{ color: NAVY, fontFamily: "monospace", marginRight: 6 }}>{d.code}</strong>{d.name}
                    </td>
                    <td style={{ color: "#6b7280" }}>{d.province || "—"}</td>
                    <td className="num">
                      <input type="text" inputMode="numeric" aria-label={`เป้า ${d.code}`} className="form-input"
                        value={เป้าของ(d) ? formatMoneyInput(String(เป้าของ(d))) : ""} placeholder="0"
                        onChange={e => setแก้เป้า(m => ({ ...m, [d.code]: parseMoneyInput(e.target.value) }))}
                        style={{ textAlign: "right", fontWeight: 700, width: "100%", boxSizing: "border-box" }} />
                    </td>
                    <td className="num" style={{ color: "#6b7280" }}>{fmtB(Math.round(เป้าของ(d) / 12))}</td>
                  </tr>
                ))}
            </tbody>
            <tfoot>
              <tr data-target-total style={{ background: "#f7f9fc", fontWeight: 800 }}>
                <td colSpan={2}>รวมเป้าดีลเลอร์ {dealers.length.toLocaleString()} ราย</td>
                <td className="num" data-sum="annual" data-value={ผลรวมเป้าดีลเลอร์}>{fmtB(ผลรวมเป้าดีลเลอร์)}</td>
                <td className="num">{fmtB(Math.round(ผลรวมเป้าดีลเลอร์ / 12))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <TablePagination page={หน้าจริง} total={dealers.length} onPage={setหน้า} unit="ดีลเลอร์" />
      </SectionCard>
    </>
  );
}

// ═══════════════════════ 7 · การแจ้งเตือน ═════════════════════════════════════
// ใบ 0274 (บอสสั่ง 3 พ.ย. 69 · ทับกติกา "ไม่มีสวิตช์รายหมวด" ของรอบ 4):
//   • อีเมลผู้รับของ HQ เป็นรายการ — "+ เพิ่มอีเมล" · ลบรายตัว · ตรวจรูปแบบทันที (ฐานตรวจซ้ำตอนบันทึก) · ไม่มีผู้รับ = กล่องแดง
//     เก็บใน hq_notif_rules.email_recipients (ตัววางจดหมายของฐานอ่านจากที่นี่) · บันทึกด้วยปุ่มบันทึกกลาง
//   • ส่งอีเมลทดสอบถึงทุกผู้รับที่บันทึกแล้ว บอกผลรายอีเมล (แก้ค้างอยู่ = บันทึกก่อน)
//   • ตารางแจ้งเตือนรายเรื่องของ HQ (กระดิ่ง/อีเมล) — กดสวิตช์ = บันทึกทันที · เรื่องจำเป็นปิดไม่ได้
function NotificationsTab() {
  const rules = useRepoDraft<HQNotifRules>(() => settingsRepo.getNotifRules(), (v) => settingsRepo.saveNotifRules(v), DEFAULT_HQ_NOTIF_RULES);
  const { dirty, save, reset } = rules;
  useReport(useMemo(() => ({ dirty, save, reset }), [dirty, save, reset]));
  const รายชื่อ = rules.draft.emailRecipients ?? [];
  return (
    <>
      <SectionCard icon={<Mail size={19} />} title="อีเมลผู้รับแจ้งเตือน">
        <EmailListEditor value={รายชื่อ} onChange={list => rules.set(p => ({ ...p, emailRecipients: list }))} />
        <NotifyTestButton hq disabledReason={dirty ? "บันทึกรายชื่อก่อน แล้วจึงส่งทดสอบ" : รายชื่อ.length === 0 ? "ยังไม่มีผู้รับ" : undefined} />
      </SectionCard>
      <NotifyPrefsTable />
    </>
  );
}

// ═══════════════════════ 1 · บริษัท (+ สำรอง/กู้คืน) ══════════════════════════
// สำรอง/กู้คืนอ่าน-เขียนผ่าน repo ทั้งหมด (ดู exportAll/importAll) ไม่พึ่งรายชื่อคีย์ localStorage อีกแล้ว
function BackupCard() {
  const toast = useToast();
  // นำเข้า/คืนค่าเริ่มต้น เขียนทับนโยบายทั้งเครือได้ในคลิกเดียว ต้องบันทึกประวัติเหมือนการแก้ค่าตั้งปกติ
  // (พบจากผลตรวจสอบตรรกะระบบ 31 ก.ค. 69 — เดิมสองปุ่มนี้ไม่บันทึกอะไรเลย ต่างจากปุ่มบันทึกค่าตั้งทั่วไป)
  // ใบ 0240: ฐานลงบันทึกเองในคำสั่งกู้คืน (ชนิด + ชื่อไฟล์) · ส่งออกเรียกคำสั่งฐานที่บันทึกเอง — หน้าเว็บไม่เขียนบันทึก

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
      // ลงบันทึกที่ฐานก่อนให้ไฟล์ — ลงไม่สำเร็จ = ไม่ให้ไฟล์ (ส่งออกข้อมูลทั้งเครือต้องมีร่องรอยเสมอ)
      await auditRepo.settingsExported(ชื่อไฟล์);
      ดาวน์โหลดไฟล์(สร้างไฟล์Xlsx(แผ่นงาน), ชื่อไฟล์);
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
      await settingsRepo.restoreSettings("import", file.name, {
        policy: ที่จะเขียน.policy, targets: ที่จะเขียน.targets, notifRules: ที่จะเขียน.notifRules,
        lostReasons: ที่จะเขียน.lostReasons, company: ที่จะเขียน.company,
      });
      const jobs: Promise<unknown>[] = [];
      if (ที่จะเขียน.dealers?.length) jobs.push(dealersRepo.save(ที่จะเขียน.dealers));
      await Promise.all(jobs);
      toast("นำเข้าสำเร็จ — กำลังโหลดใหม่");
      setTimeout(() => location.reload(), 900);
    } catch (err) {
      toast("นำเข้าไม่สำเร็จ: " + friendlyError(err));
    }
  }

  async function restoreDefaults() {
    if (!(await ยืนยัน({
      หัวข้อ: "คืนค่าเริ่มต้นของนโยบาย เป้าหมาย กฎแจ้งเตือน และเหตุผลปิดการขาย ?",
      รายละเอียด: "ทะเบียนดีลเลอร์และงานขายจะไม่ถูกแตะ",
      ปุ่มตกลง: "คืนค่าเริ่มต้น", อันตราย: true,
    }))) return;
    try {
      // all-or-nothing (RPC, 0093 — Phase 4 transaction) — เดิมยิงแยก 4 คำขอ
      await settingsRepo.restoreSettings("reset", null, {
        policy: DEFAULT_HQ_POLICY, targets: DEFAULT_HQ_TARGETS,
        notifRules: DEFAULT_HQ_NOTIF_RULES, lostReasons: [...LOST_REASONS],
      });
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
type TabKey = "company" | "users" | "journey" | "recruit" | "targets" | "materials" | "notifications" | "storage";
const TABS: { key: TabKey; label: string; icon: ReactNode; render: () => ReactNode }[] = [
  { key: "company", label: "บริษัท", icon: <Building2 size={15} />, render: () => <CompanyTab /> },
  { key: "users", label: "ผู้ใช้งานและสิทธิ์", icon: <Users size={15} />, render: () => <UsersPanel embedded /> },
  { key: "journey", label: "ขั้นตอนการขายมาตรฐาน", icon: <GitMerge size={15} />, render: () => <JourneyTab /> },
  // งานหาดีลเลอร์ของ HQ เอง (บอสสั่ง 14 ก.ย. 69) — แยกจาก "เส้นทางการขาย" ซึ่งเป็นกติกาของดีลเลอร์
  { key: "recruit", label: "หาดีลเลอร์", icon: <UserPlus size={15} />, render: () => <RecruitTab /> },
  { key: "targets", label: "เป้าหมายยอดขาย", icon: <Target size={15} />, render: () => <TargetsTab /> },
  // รายการวัสดุ (บอสสั่ง 26 ต.ค. 69 · ใบ 0244) — วัสดุ/ส่วนประกอบ + ราคาต่อหน่วย ดีลเลอร์เลือกตอนขอราคา (ไม่ใช่แม่แบบอาคารแบบเดิม)
  { key: "materials", label: "รายการวัสดุ", icon: <Boxes size={15} />, render: () => <MaterialTemplatesPanel /> },
  { key: "notifications", label: "การแจ้งเตือน", icon: <Bell size={15} />, render: () => <NotificationsTab /> },
  // พื้นที่เก็บไฟล์ (บอสสั่ง 2 พ.ย. 69 · ใบ 0273) — ที่ใช้ไปทุกถัง เทียบโควตาที่ HQ ใส่เอง (ไม่ใส่ = ไม่เดา)
  { key: "storage", label: "พื้นที่เก็บไฟล์", icon: <HardDrive size={15} />, render: () => <StorageUsagePanel /> },
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
  // บันทึกการใช้งาน: ฐานลงเองตอนตารางตั้งค่าเปลี่ยนจริง (ใบ 0240 · ตัวดักต่อตาราง) — ไม่ลงตอนกดแล้วบันทึกไม่สำเร็จเหมือนเดิม
  // save คืน false = ช่องบังคับขาด ไม่ได้บันทึก (แท็บแสดงกรอบแดงเอง) → ไม่ขึ้น "บันทึกแล้ว"
  function saveAll() { if (dirty && api && api.save() !== false) showToast("บันทึกการตั้งค่าแล้ว"); }
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
