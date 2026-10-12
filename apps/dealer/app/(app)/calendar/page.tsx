"use client";

import { CountUp } from "@pms/shared/components/ui/CountUp";
import { TopbarActions } from "@pms/shared/components/layout/TopbarActions";
import { ModalCard } from "@pms/shared/components/ui/ModalCard";
import { useState, useMemo, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ยืนยัน } from "@pms/shared/components/ui/ConfirmToast";
import { apptTypeLabel, fmtISOToThai, DEFAULT_DEALER_CODE, type AppointmentMock, type ApptType } from "@pms/shared/lib/mock";
import { APP_NOW_ISO } from "@pms/shared/context/FilterContext";
import { useCurrentDealer } from "@pms/shared/lib/useCurrentDealer";
import { useMyProvinces } from "@pms/shared/lib/useMyProvinces";
import { useRole } from "@pms/shared/context/RoleContext";
import { useSales } from "@pms/shared/context/SalesContext";
import { ChevronLeft, ChevronRight, Clock, MapPin, CalendarDays, CalendarCheck, Plus, X, User, Phone, Building2, GitBranch, Users, Edit2, Trash2 } from "lucide-react";

// ── Tokens (CI) ───────────────────────────────────────────────
const PRIMARY = "#003366";
const BORDER  = "#e5e7eb";
const MUTED   = "#6b7280";

const THAI_DAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
// "วันนี้ของระบบ" (APP_NOW) — แหล่งเดียวของ "วันนี้" (ไฮไลต์/นำทาง/จัดกลุ่ม) · supabase=จริง / local=ตรึง
const TODAY = APP_NOW_ISO;
const GROUP_TODAY = TODAY;

// ── Activity-type color buckets ───────────────────────────────
// Consistent color-by-type used across Month / Week / Day (dot, left-bar, badge).
type ActivityBucket = "meeting" | "call" | "followup" | "quotation";

const BUCKET_META: Record<ActivityBucket, { label: string; labelTh: string; color: string; bg: string }> = {
  meeting:   { label: "Meeting",       labelTh: "ประชุม",              color: "#003366", bg: "#eef3f8" },
  call:      { label: "Call",          labelTh: "โทร",                 color: "#0284c7", bg: "#e6f4fb" },
  followup:  { label: "Follow-up",     labelTh: "ติดตาม",              color: "#d97706", bg: "#fef6e7" },
  quotation: { label: "Quotation Due", labelTh: "ใบเสนอราคาครบกำหนด", color: "#dc2626", bg: "#fdecec" },
};

// Map the mock ApptType values to activity buckets.
// visit / design_meet / presentation / contract_sign / close → Meeting
// follow_up → Follow-up
const APPT_BUCKET: Record<ApptType, ActivityBucket> = {
  visit:         "meeting",
  design_meet:   "meeting",
  presentation:  "meeting",
  contract_sign: "meeting",
  close:         "meeting",
  follow_up:     "followup",
};

// a.type ที่ไม่ตรงกับ 6 ค่าที่รู้จัก (ข้อมูลเก่า/ผิดปกติจาก DB ที่ไม่มี CHECK constraint คุม) → fallback เป็น meeting
// แทนที่จะคืน undefined แล้วพังตอนอ่าน .color (พบจาก QA sweep 30 ก.ค. 69 — หน้าปฏิทินเปิดไม่ได้)
function bucketOf(a: AppointmentMock): ActivityBucket { return APPT_BUCKET[a.type] ?? "meeting"; }
function bucketMeta(a: AppointmentMock) { return BUCKET_META[bucketOf(a)]; }

// CI colors for the quick-filter groups
const GROUP_COLORS = {
  today:    { key: PRIMARY,   bg: "#eef3f8" },
  upcoming: { key: "#f59e0b", bg: "#fef6e7" },
  overdue:  { key: "#dc2626", bg: "#fdecec" },
} as const;

type GroupFilter = "all" | "today" | "upcoming" | "overdue";
type ViewMode = "month" | "week" | "day";

function apptGroup(a: AppointmentMock): Exclude<GroupFilter, "all"> | null {
  if (a.date === GROUP_TODAY) return "today";
  if (a.date > GROUP_TODAY && a.status !== "cancelled") return "upcoming";
  if (a.date < GROUP_TODAY && a.status !== "done" && a.status !== "cancelled") return "overdue";
  return null;
}

function ymd(y: number, m: number, d: number) { return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`; }
function parseYmd(s: string) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function ymdOf(dt: Date) { return ymd(dt.getFullYear(), dt.getMonth(), dt.getDate()); }
function addDays(s: string, n: number) { const dt = parseYmd(s); dt.setDate(dt.getDate() + n); return ymdOf(dt); }
// Sunday-start week containing the given date
function startOfWeek(s: string) { const dt = parseYmd(s); dt.setDate(dt.getDate() - dt.getDay()); return ymdOf(dt); }

export default function CalendarPage() {
  const router = useRouter();
  const TODAY_DT = parseYmd(TODAY);
  const [year, setYear] = useState(TODAY_DT.getFullYear());
  const [month, setMonth] = useState(TODAY_DT.getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(TODAY);
  const [groupFilter, setGroupFilter] = useState<GroupFilter>("all");
  const [view, setView] = useState<ViewMode>("month"); // หน้า "ปฏิทิน" เปิดที่มุมมองเดือนก่อน
  // นัดหมายทั้งหมดมาจาก SalesContext (ใช้ร่วมกับแดชบอร์ด/แจ้งเตือน)
  const { appointments: allAppts, addAppointment: ctxAddAppt, updateAppointment: ctxUpdateAppt, deleteAppointment: ctxDeleteAppt } = useSales();
  const [detail, setDetail] = useState<AppointmentMock | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editAppt, setEditAppt] = useState<AppointmentMock | null>(null);

  // นัดหมายทั้งหมดจาก context (allAppts มาจาก useSales ด้านบน)

  // Today / Upcoming / Overdue grouping (relative to GROUP_TODAY)
  const groups = useMemo(() => {
    const g = { today: [] as AppointmentMock[], upcoming: [] as AppointmentMock[], overdue: [] as AppointmentMock[] };
    allAppts.forEach(a => { const key = apptGroup(a); if (key) g[key].push(a); });
    const sortFn = (a: AppointmentMock, b: AppointmentMock) => (a.date + a.time).localeCompare(b.date + b.time);
    g.today.sort(sortFn); g.upcoming.sort(sortFn); g.overdue.sort(sortFn);
    return g;
  }, [allAppts]);

  const groupedList = useMemo(() => {
    if (groupFilter === "all") return [...groups.today, ...groups.overdue, ...groups.upcoming];
    return groups[groupFilter];
  }, [groups, groupFilter]);

  const byDate = useMemo(() => {
    const map: Record<string, AppointmentMock[]> = {};
    allAppts.forEach(a => { (map[a.date] ??= []).push(a); });
    return map;
  }, [allAppts]);

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  function prevMonth() { let m = month - 1, y = year; if (m < 0) { m = 11; y--; } setMonth(m); setYear(y); }
  function nextMonth() { let m = month + 1, y = year; if (m > 11) { m = 0; y++; } setMonth(m); setYear(y); }

  // Keep month grid in sync when navigating by week/day
  function selectDate(date: string) {
    setSelectedDate(date);
    const dt = parseYmd(date);
    if (dt.getFullYear() !== year) setYear(dt.getFullYear());
    if (dt.getMonth() !== month) setMonth(dt.getMonth());
  }
  function goToday() { setYear(TODAY_DT.getFullYear()); setMonth(TODAY_DT.getMonth()); setSelectedDate(TODAY); }

  // Week nav (7-day step) / Day nav (1-day step)
  const weekStart = useMemo(() => startOfWeek(selectedDate), [selectedDate]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  function prevWeek() { selectDate(addDays(selectedDate, -7)); }
  function nextWeek() { selectDate(addDays(selectedDate, 7)); }
  function prevDay() { selectDate(addDays(selectedDate, -1)); }
  function nextDay() { selectDate(addDays(selectedDate, 1)); }

  const selectedAppts = (byDate[selectedDate] ?? []).sort((a, b) => a.time.localeCompare(b.time));

  const monthAppts = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    return allAppts.filter(a => a.date.startsWith(prefix));
  }, [allAppts, year, month]);

  // เพิ่ม/แก้ไข/ลบ นัดหมาย ผ่าน SalesContext (สะท้อนแดชบอร์ด/แจ้งเตือนทันที)
  function addAppointment(a: AppointmentMock) {
    ctxAddAppt(a);
    selectDate(a.date);
    setAddOpen(false);
  }
  function editAppointment(a: AppointmentMock) {
    ctxUpdateAppt(a);
    setEditAppt(null);
    setDetail(null);
    selectDate(a.date);
  }
  function deleteAppointment(id: number) {
    ctxDeleteAppt(id);
    setDetail(null);
  }
  const monthUpcoming = monthAppts.filter(a => a.status === "upcoming").length;
  const monthDays = new Set(monthAppts.map(a => a.date)).size;

  return (
    <div className="erp">
      {/* Header */}
      {/* หัวหน้า/ปุ่ม → ไปอยู่บนแถบบน (ชื่อหน้ามาจาก Topbar) */}
      <TopbarActions>
        <ViewSwitcher view={view} onChange={setView} />
        {/* ปุ่ม "+ เพิ่มกิจกรรม" บนแถบบน เอาออกตามที่บอสสั่ง
            (ยังเพิ่มกิจกรรมได้ที่ปุ่ม + ในแผงนัดหมายของวันที่เลือก) */}
      </TopbarActions>
      {/* คำโปรยใต้ชื่อหน้าถูกเอาออกทุกหน้า (บอสสั่ง 14 ส.ค. 69) */}

      {/* Summary KPI bar */}
      <div className="kpi-bar">
        <div className="kpi">
          <div className="kpi-icon kpi-navy"><CalendarDays size={18} /></div>
          <div><div className="kpi-val"><CountUp value={`${monthAppts.length}`} /></div><div className="kpi-label">นัดหมายเดือนนี้</div></div>
        </div>
        <div className="kpi">
          <div className="kpi-icon kpi-amber"><CalendarCheck size={18} /></div>
          <div><div className="kpi-val"><CountUp value={`${monthUpcoming}`} /></div><div className="kpi-label">กำลังจะถึง</div></div>
        </div>
        <div className="kpi">
          <div className="kpi-icon kpi-green"><CalendarDays size={18} /></div>
          <div><div className="kpi-val"><CountUp value={`${monthDays}`} /></div><div className="kpi-label">วันที่มีนัด</div></div>
        </div>
        <div className="kpi">
          <div className="kpi-icon kpi-steel"><Clock size={18} /></div>
          <div><div className="kpi-val"><CountUp value={`${selectedAppts.length}`} /></div><div className="kpi-label">นัดวันที่เลือก</div></div>
        </div>
      </div>

      {/* จอแคบ (768px) แผงปฏิทิน+agenda บีบเข้าคอลัมน์เดียวจนช่องวันเหลือ ~36px — เวลานัดหมาย "10:00" (27px)
          ไม่พอที่จะแสดงในกล่องแคบขนาดนั้นเลย ไม่ว่าจะลด padding/font แค่ไหนก็ยังโดนตัด
          ต้นเหตุจริงคือ layout กว้าง 360px ตายตัวของ agenda ไม่ยอมย้ายลงล่างที่จอแคบ (ดู .calendar-layout ใน globals.css) */}
      <div className="calendar-layout">
        {/* Calendar (Month / Week / Day) */}
        <div className="card" style={{ minWidth: 0, alignSelf: "start" }}>
          <div className="card-header" style={{ flexWrap: "wrap", gap: 12 }}>
            <div className="card-title">
              {view === "month" && `${THAI_MONTHS[month]} ${year + 543}`}
              {view === "week" && `สัปดาห์ ${parseInt(weekStart.split("-")[2])} ${THAI_MONTHS[parseYmd(weekStart).getMonth()]} – ${parseInt(weekDays[6].split("-")[2])} ${THAI_MONTHS[parseYmd(weekDays[6]).getMonth()]}`}
              {view === "day" && `${parseInt(selectedDate.split("-")[2])} ${THAI_MONTHS[parseYmd(selectedDate).getMonth()]} ${parseYmd(selectedDate).getFullYear() + 543}`}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginLeft: "auto" }}>
              {/* legend ย้ายมาอยู่ในหัวปฏิทิน (compact) */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {(Object.keys(BUCKET_META) as ActivityBucket[]).map(k => (
                  <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "0.65rem", color: MUTED }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: BUCKET_META[k].color, flexShrink: 0 }} />
                    {BUCKET_META[k].labelTh}
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={view === "month" ? prevMonth : view === "week" ? prevWeek : prevDay} className="btn btn-secondary btn-sm" style={{ padding: "6px 10px" }}><ChevronLeft size={16} /></button>
                <button onClick={goToday} className="btn btn-secondary btn-sm" style={{ color: PRIMARY }}>วันนี้</button>
                <button onClick={view === "month" ? nextMonth : view === "week" ? nextWeek : nextDay} className="btn btn-secondary btn-sm" style={{ padding: "6px 10px" }}><ChevronRight size={16} /></button>
              </div>
            </div>
          </div>
          <div className="card-body">
            {/* ── Month view ─────────────────────────────── */}
            {view === "month" && (
              // แยก header (auto) ออกจากตารางวัน (gridAutoRows คงที่) → ปฏิทินไม่ยืด/หดตามจำนวนนัด
              <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 5, marginBottom: 5 }}>
                {THAI_DAYS.map(d => (
                  <div key={d} style={{ textAlign: "center", fontSize: "0.65rem", fontWeight: 700, color: MUTED, padding: "2px 0" }}>{d}</div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gridAutoRows: 108, gap: 5 }}>
                {cells.map((d, i) => {
                  if (d === null) return <div key={i} />;
                  const date = ymd(year, month, d);
                  const appts = (byDate[date] ?? []).slice().sort((a, b) => a.time.localeCompare(b.time));
                  const isToday = date === TODAY;
                  const isSel = date === selectedDate;
                  return (
                    <button key={i} onClick={() => setSelectedDate(date)}
                      style={{
                        height: 108, borderRadius: 10, border: isSel ? `1.5px solid ${PRIMARY}` : `1px solid ${BORDER}`,
                        background: isSel ? "#f4f8fc" : isToday ? "#eef3f8" : "#fff", cursor: "pointer", padding: "6px 6px 5px",
                        display: "flex", flexDirection: "column", alignItems: "stretch", gap: 4, transition: "background .12s", overflow: "hidden",
                      }}
                      onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = "#f4f6f9"; }}
                      onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = isToday ? "#eef3f8" : "#fff"; }}>
                      <span style={{ fontSize: "0.72rem", fontWeight: isToday ? 800 : 600, color: isToday ? PRIMARY : "#2D2D2D",
                        alignSelf: "flex-start", ...(isToday ? { background: PRIMARY, color: "#fff", borderRadius: 999, minWidth: 20, height: 20, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 5px" } : {}) }}>{d}</span>
                      {/* event chips จริง (สูงสุด 3) แทนจุด */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                        {appts.slice(0, 3).map(a => {
                          const bm = bucketMeta(a);
                          return (
                            <span key={a.id} title={`${a.time} ${a.company}`}
                              style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.65rem", fontWeight: 600, color: "#2D2D2D",
                                background: bm.bg, borderLeft: `2.5px solid ${bm.color}`, borderRadius: 4, padding: "1px 4px",
                                overflow: "hidden", minWidth: 0 }}>
                              {/* เวลา = flexShrink:0 ต้องเต็มเสมอ · ชื่อบริษัท = minWidth:0 ให้ยอมหด/ตัด …
                                  เดิมไม่มี minWidth:0 ที่ชื่อบริษัท → min-width:auto ของ flex item (นับความกว้างข้อความเต็มเพราะ nowrap)
                                  ดันแถวทั้งแถวล้น กลายเป็น "เวลา" เองที่โดน ellipsis ตัดแทน (จอแคบ 768px ตารางเดือนช่องเล็ก) */}
                              <span style={{ color: bm.color, fontWeight: 800, flexShrink: 0 }}>{a.time}</span>
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{a.company}</span>
                            </span>
                          );
                        })}
                        {appts.length > 3 && <span style={{ fontSize: "0.65rem", color: MUTED, fontWeight: 600, paddingLeft: 2 }}>+{appts.length - 3} เพิ่มเติม</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
              </>
            )}

            {/* ── Week view ──────────────────────────────── */}
            {view === "week" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6, alignItems: "start" }}>
                {weekDays.map(date => {
                  const dt = parseYmd(date);
                  const appts = (byDate[date] ?? []).slice().sort((a, b) => a.time.localeCompare(b.time));
                  const isToday = date === TODAY;
                  const isSel = date === selectedDate;
                  return (
                    <div key={date} onClick={() => selectDate(date)}
                      style={{
                        border: isSel ? `1.5px solid ${PRIMARY}` : `1px solid ${BORDER}`,
                        borderRadius: 10, background: isSel ? "#f6f9fc" : isToday ? "#eef3f8" : "#fff",
                        cursor: "pointer", minWidth: 0, minHeight: 150, padding: 6, display: "flex", flexDirection: "column", gap: 6,
                      }}>
                      <div style={{ textAlign: "center", borderBottom: `1px solid ${BORDER}`, paddingBottom: 4 }}>
                        <div style={{ fontSize: "0.65rem", fontWeight: 700, color: MUTED }}>{THAI_DAYS[dt.getDay()]}</div>
                        <div style={{ fontSize: "0.92rem", fontWeight: isToday ? 800 : 700, color: isToday ? PRIMARY : "#2D2D2D" }}>{dt.getDate()}</div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {appts.length === 0 ? (
                          <div style={{ fontSize: "0.65rem", color: "#c0c4cc", textAlign: "center", padding: "6px 0" }}>—</div>
                        ) : appts.map(a => <WeekChip key={a.id} a={a} onOpen={() => setDetail(a)} />)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Day view ───────────────────────────────── */}
            {view === "day" && (
              <div>
                {selectedAppts.length === 0 ? (
                  <div style={{ fontSize: "0.8rem", color: MUTED, textAlign: "center", padding: "28px 0" }}>ไม่มีนัดหมายในวันนี้</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {selectedAppts.map(a => <DayRow key={a.id} a={a} onOpen={() => setDetail(a)} />)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Rail: วันที่เลือก + รายการนัด (กรองด้วยชิป) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* วันที่เลือก */}
          <div className="card">
            <div className="card-header">
              <div className="card-title" style={{ display: "flex", alignItems: "center", gap: 7, fontSize: "0.92rem" }}>
                <CalendarDays size={15} color={PRIMARY} /> {selectedDate === TODAY ? "วันนี้" : `${parseInt(selectedDate.split("-")[2])} ${THAI_MONTHS[parseYmd(selectedDate).getMonth()]}`}
              </div>
              {/* ปุ่มไอคอนล้วนต้องมีชื่อกำกับ — นี่เป็นทางเดียวที่สร้างนัดหมายได้
                  ถ้าไม่มี คนที่ใช้โปรแกรมอ่านหน้าจอจะไม่รู้ว่าปุ่มนี้ทำอะไร */}
              <button onClick={() => setAddOpen(true)} title="เพิ่มกิจกรรม" aria-label="เพิ่มกิจกรรม"
                className="btn btn-secondary btn-sm" style={{ color: PRIMARY, padding: "5px 9px" }}><Plus size={13} /></button>
            </div>
            {selectedAppts.length === 0 ? (
              <div className="card-body" style={{ fontSize: "0.8rem", color: MUTED, textAlign: "center", padding: "18px 0 22px" }}>ไม่มีนัดหมายวันนี้</div>
            ) : (
              <div>
                {selectedAppts.map(a => <ApptRow key={a.id} a={a} onOpen={() => setDetail(a)} />)}
              </div>
            )}
          </div>

          {/* รายการนัด — ชิปกรอง (ทั้งหมด/วันนี้/กำลังจะถึง/เกินกำหนด) + list เดียว */}
          <div className="card">
            <div className="card-header" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
              <div className="card-title" style={{ fontSize: "0.92rem" }}>รายการนัดหมาย</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {([
                  { k: "all" as const,      label: "ทั้งหมด",     n: groups.today.length + groups.upcoming.length + groups.overdue.length, col: PRIMARY },
                  { k: "today" as const,    label: "วันนี้",       n: groups.today.length,    col: GROUP_COLORS.today.key },
                  { k: "upcoming" as const, label: "กำลังจะถึง",   n: groups.upcoming.length, col: GROUP_COLORS.upcoming.key },
                  { k: "overdue" as const,  label: "เกินกำหนด",    n: groups.overdue.length,  col: GROUP_COLORS.overdue.key },
                ]).map(c => {
                  const active = groupFilter === c.k;
                  return (
                    <button key={c.k} onClick={() => setGroupFilter(c.k)}
                      style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", padding: "5px 10px", borderRadius: 99,
                        border: active ? `1.5px solid ${c.col}` : `1px solid ${BORDER}`, background: active ? c.col : "#fff",
                        color: active ? "#fff" : "#2D2D2D", fontSize: "0.72rem", fontWeight: 700 }}>
                      {c.label}
                      <span style={{ fontSize: "0.65rem", fontWeight: 800, background: active ? "rgba(255,255,255,.28)" : "#f0f4f8", color: active ? "#fff" : c.col, borderRadius: 99, padding: "0 6px" }}>{c.n}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            {groupedList.length === 0 ? (
              <div className="card-body" style={{ fontSize: "0.8rem", color: MUTED, textAlign: "center", padding: "18px 0 22px" }}>ไม่มีนัดหมาย</div>
            ) : (
              <div style={{ maxHeight: 520, overflowY: "auto" }}>
                {groupedList.map(a => {
                  const g = apptGroup(a);
                  return <ApptRow key={a.id} a={a} showDate groupColor={g ? GROUP_COLORS[g].key : undefined} onOpen={() => setDetail(a)} />;
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Appointment detail modal */}
      {detail && (
        <ApptDetailModal
          a={detail}
          onClose={() => setDetail(null)}
          onEdit={() => { const a = detail; setDetail(null); setEditAppt(a); }}
          onDelete={async () => {
            if (!(await ยืนยัน({ หัวข้อ: `ลบกิจกรรม "${detail.company}" ?`, ปุ่มตกลง: "ลบกิจกรรม", อันตราย: true }))) return;
            deleteAppointment(detail.id);
          }}
          router={router}
        />
      )}

      {/* Add appointment modal */}
      {addOpen && <AddApptModal defaultDate={selectedDate} onSave={addAppointment} onClose={() => setAddOpen(false)} />}

      {/* Edit appointment modal */}
      {editAppt && <AddApptModal initial={editAppt} defaultDate={editAppt.date} onSave={editAppointment} onClose={() => setEditAppt(null)} />}
    </div>
  );
}

// Appointment detail modal — read-only summary + related-record links
function ApptDetailModal({ a, onClose, onEdit, onDelete, router }: { a: AppointmentMock; onClose: () => void; onEdit: () => void; onDelete: () => void; router: ReturnType<typeof useRouter> }) {
  const m = bucketMeta(a);
  const statusLabel = a.status === "upcoming" ? "กำลังจะถึง" : a.status === "done" ? "เสร็จสิ้น" : "ยกเลิก";
  const rows: [ReactNode, string][] = [
    [<Building2 key="b" size={13} />, a.project],
    // ไม่มีข้อมูล = ขึ้น "—" ตรงนี้ (ชั้นแสดงผล) ไม่ใช่ไปเก็บขีดลงฐาน
    [<User key="u" size={13} />, a.contact || "—"],
    [<Phone key="p" size={13} />, a.phone || "—"],
    [<MapPin key="mp" size={13} />, a.province || "—"],
    [<Clock key="c" size={13} />, `${fmtISOToThai(a.date)} · ${a.time} น.`],
    [<User key="a" size={13} />, `ผู้รับผิดชอบ: ${a.assigned}`],
  ];
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(45,45,45,.45)", zIndex: 200 }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 210, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, pointerEvents: "none" }}>
        <ModalCard onClose={onClose} label="รายละเอียดนัดหมาย" className="card" style={{ width: "100%", maxWidth: 440, pointerEvents: "auto", overflow: "hidden", boxShadow: "0 24px 80px rgba(0,51,102,.24)" }}>
          <div style={{ background: PRIMARY, padding: "16px 20px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "0.92rem", fontWeight: 800, color: "#fff" }}>{a.company}</div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <span style={{ fontSize: "0.65rem", fontWeight: 700, color: m.color, background: "#fff", borderRadius: 999, padding: "2px 10px" }}>{apptTypeLabel[a.type]}</span>
                <span style={{ fontSize: "0.65rem", color: "rgba(255,255,255,.8)" }}>{statusLabel}</span>
              </div>
            </div>
            <button onClick={onClose} style={{ background: "rgba(255,255,255,.15)", border: "none", borderRadius: 7, width: 28, height: 28, cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X size={13} /></button>
          </div>
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
            {rows.map(([icon, val], i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.8rem", color: "#2D2D2D" }}>
                <span style={{ color: MUTED, flexShrink: 0, display: "flex" }}>{icon}</span>
                <span style={{ minWidth: 0 }}>{val}</span>
              </div>
            ))}
            {a.note && (
              <div style={{ fontSize: "0.72rem", color: MUTED, background: "#f4f6f9", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "10px 12px", marginTop: 2 }}>{a.note}</div>
            )}
          </div>
          <div style={{ padding: "13px 20px", borderTop: `1px solid ${BORDER}`, display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", background: "#fafafa", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onEdit} className="btn btn-secondary btn-md" style={{ color: PRIMARY }}>
                <Edit2 size={13} /> แก้ไข
              </button>
              <button onClick={onDelete} className="btn btn-md" style={{ background: "#fff", color: "#dc2626", border: "1px solid #fecaca" }}>
                <Trash2 size={13} /> ลบ
              </button>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { onClose(); router.push("/customers"); }} className="btn btn-secondary btn-md" style={{ color: PRIMARY }}>
                <Users size={13} /> ดูลูกค้า
              </button>
              <button onClick={() => { onClose(); router.push("/leads"); }} className="btn btn-primary btn-md">
                <GitBranch size={13} /> ดูลูกค้าเป้าหมาย
              </button>
            </div>
          </div>
        </ModalCard>
      </div>
    </>
  );
}

// Add / Edit appointment modal — writes to local state only (mock.ts untouched)
function AddApptModal({ initial, defaultDate, onSave, onClose }: { initial?: AppointmentMock; defaultDate: string; onSave: (a: AppointmentMock) => void; onClose: () => void }) {
  const isEdit = !!initial;
  const { session } = useRole(); // ผู้รับผิดชอบเริ่มต้น = ผู้ใช้ที่ล็อกอิน
  const currentDealer = useCurrentDealer(); // สาขาที่ล็อกอิน (multi-tenant)
  const { leads: allLeads, newAppointmentId } = useSales();
  // เลือกได้เฉพาะลูกค้าเป้าหมายของดีลเลอร์ที่ล็อกอิน — ไม่ให้เห็นลูกค้าเป้าหมายของดีลเลอร์รายอื่นทั้งเครือ
  const leads = useMemo(
    () => allLeads.filter(l => (l.dealerCode ?? DEFAULT_DEALER_CODE) === currentDealer.code),
    [allLeads, currentDealer.code],
  );
  const [leadId, setLeadId] = useState<number | undefined>(initial?.leadId);
  const [company, setCompany] = useState(initial?.company ?? "");
  // ⚠️ ว่าง = ยังไม่มีข้อมูล ห้ามตั้งต้นเป็น "—" (แก้ 25 ส.ค. 69)
  //    ขีดเป็นวิธี "แสดงผล" ตอนไม่มีข้อมูล ไม่ใช่ตัวข้อมูล — เดิมนัดที่ไม่กรอกผู้ติดต่อ
  //    ถูกบันทึกลงฐานว่าผู้ติดต่อชื่อ "—" จริง ๆ แล้วค้นหา/รายงานก็เจอขีดเป็นชื่อคน
  const [contact, setContact] = useState(initial?.contact ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [date, setDate] = useState(initial?.date ?? defaultDate);
  const [time, setTime] = useState(initial?.time ?? "09:00");
  const [type, setType] = useState<ApptType | "">(initial?.type ?? "");  // ยังไม่เลือก = ว่าง (ห้ามยัด "นัดพบลูกค้า" ให้เอง)
  const [province, setProvince] = useState(initial?.province ?? "");
  // ส่งค่าปัจจุบันเข้าไปด้วย — นัดหมายเก่าที่จังหวัดอยู่นอกเขต จะได้ไม่ถูกล้างทิ้งตอนเปิดมาแก้
  const จังหวัดของฉัน = useMyProvinces(province);
  const [note, setNote] = useState(initial?.note ?? "");
  const savingRef = useRef(false); // กันกดปุ่มบันทึกซ้ำระหว่างรอเลขนัดจาก DB (H8 · guard แบบ synchronous)
  const [saving, setSaving] = useState(false); // ไว้ disable ปุ่มให้เห็น (visual)
  const [err, setErr] = useState("");           // ช่องบังคับยังไม่ครบ — ต้องฟ้องให้เห็น ห้ามบันทึกเงียบ

  // เลือกลูกค้าเป้าหมาย → ผูก leadId แล้วเติมชื่อบริษัท/ผู้ติดต่อ/เบอร์/จังหวัดอัตโนมัติ
  // เลือกด้วย numId ไม่ใช่ชื่อบริษัท — ชื่อซ้ำกันได้ และแก้ชื่อทีหลังแล้วจะขาดจากกัน
  function pickLead(v: string) {
    if (!v) { setLeadId(undefined); return; }   // "ไม่ผูกลูกค้าเป้าหมาย" — พิมพ์ชื่อเอง
    const L = leads.find(l => l.numId === Number(v));
    if (!L) return;
    setLeadId(L.numId);
    setCompany(L.company);
    setContact(L.contact ?? ""); setPhone(L.phone ?? ""); setProvince(L.province || "");
  }

  async function save() {
    // กันกดซ้ำ (H8): ระหว่างรอเลขนัดจาก DB ปุ่มยังคลิกได้ · กด 2 ครั้ง = 2 นัด/เลขหาย 1
    // ref กันเข้าซ้ำแบบ synchronous ก่อน React re-render ทัน
    if (savingRef.current) return;
    // วันที่/เวลา มีค่าตั้งต้นให้ แต่ผู้ใช้ล้างทิ้งได้ — ปล่อยผ่านแล้วจะได้นัดหมายที่ไม่มีวันเวลา
    // (โผล่ในปฏิทินไม่ได้ ตามงานต่อไม่ได้) ดาว * บนป้ายกำกับต้องตรงกับที่ตรวจตรงนี้เสมอ
    if (!type) { setErr("ต้องเลือกประเภทกิจกรรม"); return; }
    if (!date || !time) { setErr("ต้องระบุวันที่และเวลา"); return; }
    setErr("");
    savingRef.current = true; setSaving(true);
    try {
    const name = company.trim() || initial?.company || "กิจกรรมใหม่";
    // เลขนัดใหม่ออกจาก DB แบบ atomic (เหมือนเลขลูกค้า/เลขที่ใบเสนอราคา)
    // เดิมใช้ Date.now() ซึ่งได้เลข 13 หลักที่ไม่ใช่ "เลขนับของสาขา" และคนละแบบกับหน้าลูกค้าเป้าหมาย
    const freshId = initial ? initial.id : await newAppointmentId();
    onSave({
      // preserve all non-edited fields when editing (assigned/status/etc.)
      ...(initial ?? {
        id: freshId,
        buildingType: "—", area: 0,
        assigned: session.name, status: "upcoming",
      }),
      leadId,
      company: name,
      contact, phone,
      project: initial?.project ?? name,
      province: province.trim() || "—",
      date, time, type,
      note: note.trim(),
    });
    } finally { savingRef.current = false; setSaving(false); } // React 19 ไม่เตือน setState หลัง unmount
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(45,45,45,.45)", zIndex: 200 }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 210, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, pointerEvents: "none" }}>
        <ModalCard onClose={onClose} label="เพิ่ม/แก้ไขนัดหมาย" className="card modal-fit-auto" style={{ width: "100%", maxWidth: 460, pointerEvents: "auto", overflow: "hidden", boxShadow: "0 24px 80px rgba(0,51,102,.24)" }}>
          <div style={{ background: PRIMARY, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 800, color: "#fff", fontSize: "0.92rem" }}>{isEdit ? "แก้ไขกิจกรรม" : "เพิ่มกิจกรรม"}</span>
            <button onClick={onClose} style={{ background: "rgba(255,255,255,.15)", border: "none", borderRadius: 7, width: 28, height: 28, cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={13} /></button>
          </div>
          <div style={{ padding: 20 }}>
            <div className="form-grid">
              <div className="form-section">กิจกรรม</div>
              <div>
                <label className="form-label">ประเภท *</label>
                <select aria-label="ประเภท" value={type} onChange={e => setType(e.target.value as ApptType | "")} className="form-select">
                  <option value="">— ยังไม่ระบุ —</option>
                  {(Object.keys(apptTypeLabel) as ApptType[]).map(t => <option key={t} value={t}>{apptTypeLabel[t]}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">ลูกค้าเป้าหมาย</label>
                <select value={leadId ?? ""} onChange={e => pickLead(e.target.value)} className="form-select">
                  <option value="">— ไม่ผูกลูกค้าเป้าหมาย —</option>
                  {leads.map(l => <option key={l.numId} value={l.numId}>{l.company}{l.contact ? ` · ${l.contact}` : ""}</option>)}
                </select>
              </div>

              <div className="form-section">วันเวลาและสถานที่</div>
              <div>
                <label className="form-label">วันที่ *</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className="form-input" />
              </div>
              <div>
                <label className="form-label">เวลา *</label>
                <input type="time" value={time} onChange={e => setTime(e.target.value)} className="form-input" />
              </div>
              <div className="col-full">
                <label className="form-label">จังหวัด</label>
                {/* เลือกจากจังหวัดในเขตของสาขาเท่านั้น (บอสสั่ง 20 ส.ค. 69) — เดิมเป็นช่องพิมพ์อิสระ
                    พิมพ์จังหวัดนอกเขต/สะกดคนละแบบได้ แล้วตัวกรองจังหวัดก็จับไม่ตรง */}
                <select aria-label="จังหวัด" value={province} onChange={e => setProvince(e.target.value)} className="form-select">
                  <option value="">— ยังไม่ระบุ —</option>
                  {จังหวัดของฉัน.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <div className="form-section">รายละเอียด</div>
              <div className="col-full">
                <label className="form-label">บันทึก</label>
                <input value={note} onChange={e => setNote(e.target.value)} placeholder="รายละเอียดกิจกรรม" className="form-input" />
              </div>
            </div>
          </div>
          <div style={{ padding: "13px 20px", borderTop: `1px solid ${BORDER}`, display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center", background: "#fafafa" }}>
            {err && <div style={{ marginRight: "auto", color: "#dc2626", fontSize: "0.74rem", fontWeight: 600 }}>{err}</div>}
            <button onClick={onClose} className="btn btn-secondary btn-md">ยกเลิก</button>
            <button onClick={save} disabled={saving} className="btn btn-primary btn-md" style={saving ? { opacity: .6, cursor: "not-allowed" } : undefined}>{isEdit ? <><Edit2 size={13} /> บันทึก</> : <><Plus size={13} /> เพิ่มกิจกรรม</>}</button>
          </div>
        </ModalCard>
      </div>
    </>
  );
}

// View switcher: Month / Week / Day (เดือน / สัปดาห์ / วัน)
function ViewSwitcher({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  const items: { v: ViewMode; label: string }[] = [
    { v: "month", label: "เดือน" },
    { v: "week", label: "สัปดาห์" },
    { v: "day", label: "วัน" },
  ];
  return (
    <div style={{ display: "inline-flex", border: `1px solid ${BORDER}`, borderRadius: 10, overflow: "hidden", background: "#fff" }}>
      {items.map((it, i) => {
        const active = view === it.v;
        return (
          <button key={it.v} onClick={() => onChange(it.v)}
            style={{
              padding: "7px 16px", fontSize: "0.8rem", fontWeight: 700, cursor: "pointer", border: "none",
              borderLeft: i === 0 ? "none" : `1px solid ${BORDER}`,
              background: active ? PRIMARY : "#fff", color: active ? "#fff" : "#2D2D2D", transition: "background .12s",
            }}
            onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "#f4f6f9"; }}
            onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "#fff"; }}>
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

// Compact appointment chip for the Week view columns
function WeekChip({ a, onOpen }: { a: AppointmentMock; onOpen?: () => void }) {
  const m = bucketMeta(a);
  return (
    <div onClick={e => { e.stopPropagation(); onOpen?.(); }} style={{
      borderLeft: `3px solid ${m.color}`, background: m.bg, borderRadius: 6,
      padding: "3px 6px", display: "flex", flexDirection: "column", gap: 1, cursor: "pointer",
    }}>
      <span style={{ fontSize: "0.65rem", fontWeight: 800, color: m.color }}>{a.time}</span>
      <span style={{ fontSize: "0.65rem", fontWeight: 600, color: "#2D2D2D", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.company}</span>
    </div>
  );
}

// Time-ordered row for the Day view
function DayRow({ a, onOpen }: { a: AppointmentMock; onOpen?: () => void }) {
  const m = bucketMeta(a);
  return (
    <div onClick={onOpen} style={{ display: "flex", gap: 12, alignItems: "stretch", borderLeft: `3px solid ${m.color}`, padding: "10px 0 10px 12px", borderBottom: `1px solid ${BORDER}`, cursor: onOpen ? "pointer" : undefined }}>
      <div style={{ minWidth: 56, display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
        <span style={{ fontSize: "0.86rem", fontWeight: 800, color: PRIMARY }}>{a.time}</span>
        <span style={{ fontSize: "0.65rem", color: MUTED }}>น.</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "0.86rem", fontWeight: 700, color: "#2D2D2D", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.company}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
          <span style={{ fontSize: "0.65rem", fontWeight: 700, color: m.color, background: m.bg, borderRadius: 999, padding: "1px 9px" }}>{apptTypeLabel[a.type]}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: "0.72rem", color: MUTED }}><MapPin size={11} /> {a.province}</span>
        </div>
        {a.note && <div style={{ fontSize: "0.72rem", color: MUTED, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.note}</div>}
      </div>
    </div>
  );
}

function ApptRow({ a, showDate, groupColor, onOpen }: { a: AppointmentMock; showDate?: boolean; groupColor?: string; onOpen?: () => void }) {
  const m = bucketMeta(a);
  const c = m.color;
  return (
    <div className="activity" onClick={onOpen} style={{ ...(groupColor ? { borderLeft: `3px solid ${groupColor}`, paddingLeft: 9 } : {}), cursor: onOpen ? "pointer" : undefined }}>
      <div className="activity-icon" style={{ background: m.bg, color: c }}>
        <CalendarDays size={15} />
      </div>
      <div className="activity-text">
        <div className="activity-title" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.company}</div>
        <div className="activity-meta" style={{ marginBottom: 3 }}>
          <span style={{ color: c, fontWeight: 700 }}>{apptTypeLabel[a.type]}</span>
        </div>
        <div className="activity-meta" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Clock size={10} /> {showDate ? `${parseInt(a.date.split("-")[2])}/${parseInt(a.date.split("-")[1])} · ` : ""}{a.time} น.</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><MapPin size={10} /> {a.province}</span>
        </div>
      </div>
    </div>
  );
}
