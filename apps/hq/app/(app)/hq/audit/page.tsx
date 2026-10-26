"use client";

// ─── HQ · บันทึกการใช้งาน (Audit Log) — ตรวจว่า admin ของ HQ ทำอะไรไปบ้าง ──────
import { useMemo, useState } from "react";
import { TablePagination, pageSlice, pageCountOf } from "@pms/shared/components/ui/TablePagination";
import { ScrollText, Search, X, User, Activity } from "lucide-react";
import { useAuditEntries, AUDIT_READ_CAP } from "@pms/shared/lib/useAudit";
import { hqAuditModule, HQ_AUDIT_MODULE_LABEL } from "@pms/shared/lib/mock";
import { APP_NOW, parseDate } from "@pms/shared/context/FilterContext";
import { ExportMenu } from "@pms/shared/components/ui/ExportMenu";
import { TopbarActions } from "@pms/shared/components/layout/TopbarActions";

const PRIMARY = "#003366";
// ⚠️ ห้ามกลับไปใช้ hqAuditCategory ของกระดิ่งแจ้งเตือน (บั๊กจริง 10 ส.ค. 69)
//    หมวดของกระดิ่งมีแค่ 5 ตาม toggle ในหน้าตั้งค่า อะไรไม่เข้าหมวดจะตกไปกอง
//    ที่ "เป้าหมายและการตั้งค่า" หมด — เข้าสู่ระบบ 2,800+ แถว และแคตตาล็อกที่ตัวดัก
//    ฐานข้อมูลเขียน ก็หายไปจากหมวดของตัวเอง กรองแล้วหาไม่เจอ
const MODULE_LABEL = HQ_AUDIT_MODULE_LABEL;
const ROLE_LABEL: Record<string, { label: string; bg: string; color: string }> = {
  // ⚠️ ต้องครอบทุกบทบาทที่มีจริง ไม่งั้นรหัสระบบดิบหลุดขึ้นจอ (แก้ 10 ส.ค. 69)
  //   เดิมไม่มี SUPER_ADMIN ในรายการ → คอลัมน์บทบาทขึ้นคำว่า "SUPER_ADMIN" ตรง ๆ
  //   ซึ่งเป็นชื่อตัวแปรในโปรแกรม ไม่ใช่คำที่ผู้ใช้ควรเห็นในระบบภาษาไทย
  SUPER_ADMIN: { label: "ผู้ดูแลระบบ", bg: "#dce5f0", color: "#003366" },
  HQ_MANAGEMENT: { label: "ผู้บริหาร HQ", bg: "#dce5f0", color: "#003366" },
  HQ_STAFF: { label: "เจ้าหน้าที่ HQ", bg: "#dce5f0", color: "#003366" },   // เดิมขาด → ขึ้นคำว่า HQ_STAFF ดิบ (ตารางเทียบรอบ 1)
  DEALER_ADMIN: { label: "ดีลเลอร์", bg: "#fff3cd", color: "#92400e" },
  DEALER_SALES: { label: "ฝ่ายขาย", bg: "#eef2f7", color: "#475569" },
};

export default function HQAuditPage() {
  const entries = useAuditEntries();
  const [q, setQ] = useState("");
  const [userFilter, setUserFilter] = useState("all");
  const [moduleFilter, setModuleFilter] = useState("all");
  // ตารางนี้โตไม่จำกัด (เกือบหมื่นแถวแล้ว) — เดิมเรนเดอร์ทีเดียวทั้งหมด เบราว์เซอร์หน่วงเห็นได้ชัด
  // ⚠️ ทุกตัวกรองต้องพากลับหน้า 1 (แก้ 10 ส.ค. 69 — เป็นบั๊กที่ผมเพิ่มเองตอนใส่ตัวแบ่งหน้า)
  //   กดไปหน้า 9 แล้วเปลี่ยนตัวกรอง เดิมค้างอยู่หน้า 9 กลางลิสต์ทั้งที่ผลลัพธ์เปลี่ยนไปแล้ว
  //   ตารางเดิมของระบบ (ผู้ใช้/ไฟล์) ทำถูกอยู่ก่อนแล้ว — ผมไม่ได้ดูของเดิมก่อนเขียน
  const [page, setPage] = useState(0);

  const users = useMemo(() => [...new Set(entries.map(e => e.user))], [entries]);
  // โมดูลที่มีจริงในบันทึกเท่านั้น — ไม่ขึ้นตัวเลือกที่กรองแล้วไม่เจออะไร
  const modules = useMemo(
    () => [...new Set(entries.map(e => hqAuditModule(e.action)))],
    [entries],
  );

  const filtered = useMemo(() => entries.filter(e => {
    if (userFilter !== "all" && e.user !== userFilter) return false;
    if (moduleFilter !== "all" && hqAuditModule(e.action) !== moduleFilter) return false;
    const s = q.trim().toLowerCase();
    return !s || `${e.user} ${e.action} ${e.target}`.toLowerCase().includes(s);
  }), [entries, userFilter, moduleFilter, q]);

  // "วันนี้" = วันนี้ของระบบ (30 มิ.ย. 2569) ไม่ใช่นาฬิกาเครื่อง
  // ของเดิมเทียบสตริงด้วย new Date().getDate() → เลขเปลี่ยนไปเรื่อยตามวันจริง และ "17 ก.ค." กับ "17 มิ.ย." ก็ชนกัน
  const stats = useMemo(() => {
    const sameDay = (s: string) => {
      const d = parseDate(s);
      return !!d && d.getDate() === APP_NOW.getDate() && d.getMonth() === APP_NOW.getMonth() && d.getFullYear() === APP_NOW.getFullYear();
    };
    // ⚠️ การ์ดตัวเลขต้องคิดจาก "ผลที่กรองอยู่" ไม่ใช่ข้อมูลทั้งกอง (แก้ 10 ส.ค. 69)
    //   เดิมเลือกโมดูลแล้วตารางเหลือ 128 รายการ แต่การ์ดยังค้างที่ 5,000 · 6 ผู้ใช้ · 177 วันนี้
    //   ผู้ใช้จึงอ่านตัวเลขที่ไม่เกี่ยวกับสิ่งที่กำลังดูอยู่ตรงหน้า แล้วสรุปผิด
    return {
      total: filtered.length,
      users: new Set(filtered.map(e => e.user)).size,
      today: filtered.filter(e => sameDay(e.at)).length,
    };
  }, [filtered]);

  return (
    <div className="erp">
      <TopbarActions>
        {/* HQ คือคนที่ต้องเอาบันทึกไปตอบผู้ตรวจ/ผู้บริหาร — ส่งออกได้ตามที่กรองอยู่ */}
        <ExportMenu
          filename="hq-audit-log"
          title="บันทึกการใช้งาน"
          headers={["ผู้ใช้", "บทบาท", "โมดูล", "การกระทำ", "รายละเอียด", "เวลา"]}
          rows={filtered.map(e => [
            e.user,
            ROLE_LABEL[e.role]?.label ?? e.role ?? "",
            MODULE_LABEL[hqAuditModule(e.action)] ?? hqAuditModule(e.action),
            e.action, e.target, e.at,
          ])}
        />
        {/* ⛔ ปุ่ม "ล้างบันทึก" ยกเลิกแล้ว (บอสสั่ง 26 ต.ค. 69 แทนคำสั่ง 14 ส.ค. 69) — บันทึกแก้/ลบไม่ได้ทุกบทบาท กันที่ฐาน (ใบ 0241)
              ห้ามใส่กลับ · ทางลบที่เหลือ: ลบอัตโนมัติเกิน 2 ปี · สคริปต์ล้างข้อมูลทดสอบ (scripts/check-audit-delete-paths.mjs) */}
      </TopbarActions>
      {/* คำโปรยใต้ชื่อหน้าถูกเอาออกทุกหน้า (บอสสั่ง 14 ส.ค. 69) */}
      {/* ⛔ ห้ามใส่ตัวกรองช่วงเวลากลับมา (เอาออก 14 ส.ค. 69)
            บันทึกการใช้งานมีไว้ตอบว่า "ใครทำอะไรเมื่อไหร่" ย้อนหลัง — ตั้งต้นที่ "วันนี้"
            แปลว่าเปิดหน้ามาเห็นแค่วันเดียว ประวัติที่เหลือถูกซ่อนโดยที่ผู้ใช้ไม่รู้ตัว
            หาของเมื่อวานไม่เจอแล้วนึกว่าไม่มี · ค้นหา/ผู้ใช้/โมดูล ยังกรองได้ตามเดิม */}

      {/* สรุป */}
      <div className="kpi-bar">
        <div className="kpi"><div className="kpi-icon kpi-navy"><Activity size={16} /></div><div><div className="kpi-val">{stats.total.toLocaleString()}</div><div className="kpi-label">รายการที่แสดงอยู่</div></div></div>
        <div className="kpi"><div className="kpi-icon kpi-navy"><User size={16} /></div><div><div className="kpi-val">{stats.users}</div><div className="kpi-label">ผู้ใช้ที่มีกิจกรรม</div></div></div>
        <div className="kpi"><div className="kpi-icon kpi-green"><ScrollText size={16} /></div><div><div className="kpi-val">{stats.today}</div><div className="kpi-label">กิจกรรมวันนี้</div></div></div>
      </div>

      {/* Toolbar */}
      <div className="card" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "10px 14px", marginBottom: 16 }}>
        <div className="search-bar">
          <Search size={14} color="#9ca3af" />
          <input value={q} onChange={e => { setQ(e.target.value); setPage(0); }} placeholder="ค้นหาผู้ใช้ / การกระทำ / รายละเอียด..." />
          {q && <button onClick={() => setQ("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", display: "flex", padding: 0 }}><X size={13} /></button>}
        </div>
        <div style={{ flex: 1 }} />
        <select aria-label="กรองตามหมวดงาน" value={moduleFilter} onChange={e => { setModuleFilter(e.target.value); setPage(0); }} className="form-select" style={{ width: "auto", cursor: "pointer" }}>
          <option value="all">ทุกโมดูล</option>
          {modules.map(m => <option key={m} value={m}>{MODULE_LABEL[m] ?? m}</option>)}
        </select>
        <select aria-label="กรองตามผู้ใช้" value={userFilter} onChange={e => { setUserFilter(e.target.value); setPage(0); }} className="form-select" style={{ width: "auto", cursor: "pointer" }}>
          <option value="all">ผู้ใช้ทุกคน</option>
          {users.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>

      {/* ชนเพดานอ่าน (M8) — แจ้งชัด ไม่ตัดเงียบ: กำลังดูเฉพาะล่าสุด N รายการ */}
      {entries.length >= AUDIT_READ_CAP && (
        <div className="card" style={{ padding: "9px 14px", marginBottom: 12, fontSize: "0.76rem", color: "#92400e", background: "#fff8e6", border: "1px solid #fde68a" }}>
          แสดงเฉพาะ {AUDIT_READ_CAP.toLocaleString()} รายการล่าสุด (ตัวกรอง/ค้นหาทำงานบนช่วงนี้) — บันทึกที่เก่ากว่านี้ยังอยู่ในระบบ
        </div>
      )}

      {/* ตาราง */}
      <div className="card">
        <div className="table-wrap" style={{ borderTop: "none" }}>
          <table>
            {/* เพิ่มคอลัมน์ "โมดูล" → ต้องแก้ colgroup ด้วย (ใส่ที่ th ไม่มีผล เพราะ table-layout: fixed) */}
            <colgroup><col style={{ width: "18%" }} /><col style={{ width: "13%" }} /><col style={{ width: "14%" }} /><col style={{ width: "16%" }} /><col style={{ width: "23%" }} /><col style={{ width: "16%" }} /></colgroup>
            <thead>
              <tr><th>ผู้ใช้</th><th>บทบาท</th><th>โมดูล</th><th>การกระทำ</th><th>รายละเอียด</th><th>เวลา</th></tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: "36px 14px", color: "#9ca3af", fontSize: "0.8rem" }}>
                  {entries.length === 0 ? "ยังไม่มีบันทึกกิจกรรม" : "ไม่พบบันทึกตามตัวกรองที่เลือก"}
                </td></tr>
              )}
              {pageSlice(filtered, Math.min(page, pageCountOf(filtered.length) - 1)).map(e => {
                // แถวที่ "ฐานข้อมูลเขียนเอง" (trigger) ไม่มีบทบาทติดมาด้วย — เดิมขึ้นเป็นป้ายเปล่า ๆ
                // อ่านแล้วไม่ได้ความหมายอะไรเลย · บอกไปตรง ๆ ว่าเป็นระบบเขียน ดีกว่าปล่อยว่าง
                const rm = ROLE_LABEL[e.role]
                  ?? (e.role ? { label: e.role, bg: "#f0f0f5", color: "#6b7280" }
                             : { label: e.user === "system" ? "ระบบบันทึกเอง" : "—", bg: "#f3f4f6", color: "#9ca3af" });
                return (
                  <tr key={e.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                        <span style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: "linear-gradient(135deg,#003366,#0a4a86)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.66rem", fontWeight: 800 }}>{e.user.slice(0, 2)}</span>
                        <span style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.user}</span>
                      </div>
                    </td>
                    <td><span className="badge" style={{ background: rm.bg, color: rm.color }}>{rm.label}</span></td>
                    <td style={{ fontSize: "0.76rem", color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {MODULE_LABEL[hqAuditModule(e.action)] ?? "—"}
                    </td>
                    <td><span className="badge" style={{ background: "#eef2f7", color: PRIMARY }}>{e.action}</span></td>
                    <td style={{ fontSize: "0.8rem", color: "#2D2D2D" }}>{e.target}</td>
                    <td style={{ fontSize: "0.72rem", color: "#9ca3af", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{e.at}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <TablePagination page={page} total={filtered.length} onPage={setPage} unit="รายการ" />
      </div>

    </div>
  );
}
