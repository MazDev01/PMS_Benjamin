// ── แดชบอร์ด HQ (บอสสั่ง 21 ต.ค. 69 · ตัวคำนวณ hq_dashboard ใบ 0235) ──────────────────────────────────────────
//   ตัวเลขทุกตัวคิดที่ฐาน — ไฟล์นี้แค่จัดรูปผลลัพธ์ (ใช้ร่วมกันทั้งฝั่งต่อฐานตรงและ /api/v1/metrics) + ลิงก์ของกิจกรรม
//   อัตราปิดการขายคิดด้วยฟังก์ชันกลาง lib/winRate.ts จาก closedWon/closedLost ที่ฐานนับมา
// ข้อทดสอบ: tests/unit/hqDashboard.test.ts · supabase/tests/hq_dashboard.sql · tests/scenario/hq-dashboard.spec.ts

export type HqDashboardTop = { code: string; name: string; sales: number; target: number | null; closedWon: number; closedLost: number };
export type HqDashboardActivity = { id: number; user: string; action: string; target: string; at: string };
export type HqDashboard = {
  today: { requestsOpen: number; requestsOverdue: number; franchiseOverdue: { count: number; amount: number; ids: number[] } };
  cards: { sales: number; target: number | null; annualTarget: number | null; days: number; leadsNew: number; quotesSent: number; closedWon: number; closedLost: number };
  top: HqDashboardTop[];
  trend: { byMonth: { y: number; m: number; sales: number }[]; byDay: { d: string; sales: number }[]; byHour: { h: number; sales: number }[] };
  /** 12 เดือนย้อนหลังถึงเดือนของวันนี้ (ไม่ขึ้นกับตัวกรองเวลา) · m = 0..11 */
  monthly: { y: number; m: number; leads: number; quotes: number; won: number; sales: number }[];
  monthlyTarget: number | null;
  regions: { region: string; dealers: number; sales: number }[];
  dealerCount: number;
  activity: HqDashboardActivity[];
};

type Row = Record<string, unknown>;
const N = (v: unknown) => Number(v ?? 0);
const Nn = (v: unknown) => (v == null ? null : Number(v));
const S = (v: unknown) => String(v ?? "");
const A = (v: unknown) => (Array.isArray(v) ? (v as Row[]) : []);

export function จัดรูปแดชบอร์ดHQ(d: unknown): HqDashboard {
  const x = (d ?? {}) as Row;
  const t = (x.today ?? {}) as Row, f = (t.franchiseOverdue ?? {}) as Row;
  const c = (x.cards ?? {}) as Row, tr = (x.trend ?? {}) as Row;
  return {
    today: {
      requestsOpen: N(t.requestsOpen), requestsOverdue: N(t.requestsOverdue),
      franchiseOverdue: { count: N(f.count), amount: N(f.amount), ids: (Array.isArray(f.ids) ? f.ids : []).map(Number) },
    },
    cards: {
      sales: N(c.sales), target: Nn(c.target), annualTarget: Nn(c.annualTarget), days: N(c.days),
      leadsNew: N(c.leadsNew), quotesSent: N(c.quotesSent), closedWon: N(c.closedWon), closedLost: N(c.closedLost),
    },
    top: A(x.top).map(r => ({ code: S(r.code), name: S(r.name), sales: N(r.sales), target: Nn(r.target), closedWon: N(r.closedWon), closedLost: N(r.closedLost) })),
    trend: {
      byMonth: A(tr.byMonth).map(r => ({ y: N(r.y), m: N(r.m), sales: N(r.sales) })),
      byDay: A(tr.byDay).map(r => ({ d: S(r.d), sales: N(r.sales) })),
      byHour: A(tr.byHour).map(r => ({ h: N(r.h), sales: N(r.sales) })),
    },
    monthly: A(x.monthly).map(r => ({ y: N(r.y), m: N(r.m), leads: N(r.leads), quotes: N(r.quotes), won: N(r.won), sales: N(r.sales) })),
    monthlyTarget: Nn(x.monthlyTarget),
    regions: A(x.regions).map(r => ({ region: S(r.region), dealers: N(r.dealers), sales: N(r.sales) })),
    dealerCount: N(x.dealerCount),
    activity: A(x.activity).map(r => ({ id: N(r.id), user: S(r.user), action: S(r.action), target: S(r.target), at: S(r.at) })),
  };
}

/** ผลว่าง — โหมดข้อมูลตัวอย่าง (ไม่มีตัวคำนวณที่ฐาน) ห้ามเติมตัวเลขเอง หน้าจอขึ้นกรอบว่างทุกใบ */
export const แดชบอร์ดHQว่าง = (): HqDashboard => จัดรูปแดชบอร์ดHQ({});

// ── กดกิจกรรมแล้วไปที่เรื่องนั้น ─────────────────────────────────────────────────────────────────────────
//   บันทึกการใช้งานไม่มีช่องอ้างถึงเรื่อง (audit_log มีแค่ข้อความ target) — อ่านจากรูปข้อความที่ระบบเขียนเอง:
//   "<รหัสสาขา> · …" (ดีลเลอร์) · "DP-… · …" (ใบค่าแฟรนไชส์ → ค้นเลขที่ใบ) · "#<เลข> → <รหัสสาขา> · …" (ผู้สนใจเป็นดีลเลอร์แล้ว)
//   · "<ชื่อผู้สนใจ> · …" (ผู้สนใจ → ค้นชื่อ) · ตั้งค่า/ผู้ใช้ HQ → หน้าตั้งค่า
//   อ่านไม่ออก = ไปหน้าบันทึกการใช้งาน (เห็นรายการเต็ม) — ไม่เดาปลายทาง
const รหัสสาขา = /^([A-Z][A-Z0-9]{1,5})(?: ·|$)/;
const ส่วนแรก = (t: string) => t.split(" · ")[0].split(" → ")[0].trim();
export function ลิงก์กิจกรรม(e: { action: string; target: string }): string {
  const a = e.action, t = e.target.trim();
  const เป็นดีลเลอร์ = /^#\d+ → ([A-Z][A-Z0-9]{1,5})\b/.exec(t);
  if (เป็นดีลเลอร์) return `/hq/dealers/${เป็นดีลเลอร์[1]}`;
  if (/ค่าแฟรนไชส์/.test(a)) {
    const เลข = /^(DP-[\w-]+)/.exec(t)?.[1];
    return เลข ? `/hq/proposals?q=${encodeURIComponent(เลข)}` : "/hq/proposals";
  }
  if (/ผู้สนใจ|\(HQ\)/.test(a)) return ส่วนแรก(t) ? `/hq/prospects?q=${encodeURIComponent(ส่วนแรก(t))}` : "/hq/prospects";
  if (/ตั้งค่า|ผู้ใช้ HQ/.test(a)) return "/hq/settings";
  if (/ดีลเลอร์|ตัวแทน/.test(a)) {
    const m = รหัสสาขา.exec(t);
    return m && m[1] !== "HQ" ? `/hq/dealers/${m[1]}` : "/hq/dealers";
  }
  return "/hq/audit";
}
