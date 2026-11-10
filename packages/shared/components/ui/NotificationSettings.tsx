"use client";

// ── ตั้งค่า › การแจ้งเตือน (ใบ 0274 · บอสสั่ง 3 พ.ย. 69) — ใช้ทั้งหน้าตั้งค่า HQ และหน้าตั้งค่าดีลเลอร์ ─────────────────────────────
//   • ตารางรายเรื่อง (แถวตามตาราง FLOW ของฝั่งนั้น): เรื่อง · กระดิ่ง · อีเมล · กดแล้วไปไหน — ค่าเริ่มต้นเปิดหมด
//     เรื่องจำเป็นมีป้าย "จำเป็น" ปิดไม่ได้ (ฐานกันอีกชั้น) · เรื่องที่ไม่มีช่องทางนั้น = "—"
//     กดสวิตช์ = บันทึกทันทีที่ฐาน (ลงบันทึกการใช้งาน) — ไม่ต้องกดบันทึกกลาง
//   • ผู้รับอีเมลของดีลเลอร์: รายการ + เพิ่ม/ลบ · ต้องยืนยันด้วยโค้ดก่อนรับ · ไม่มีผู้ยืนยัน = กล่องเตือนแดง
//   • ปุ่มส่งอีเมลทดสอบ: ส่งถึงทุกผู้รับ (ดีลเลอร์ = ที่ยืนยันแล้ว) แล้วบอกผลรายอีเมล
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { Bell, Mail, Plus, Trash2, Send, ShieldCheck, Check, X } from "lucide-react";
import { notifications as notificationsRepo, account as accountRepo } from "@pms/shared/lib/data";
import type { NotificationPref, NotifyRecipient, NotifyTestResult } from "@pms/shared/lib/data/types";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { SectionCard } from "./SectionCard";

/** รูปแบบอีเมลเดียวกับตัวตรวจของฐาน (dealer_notify_recipients · hq_notif_rules) */
export const รูปแบบอีเมลผู้รับ = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
const โดเมนเข้าระบบดีลเลอร์ = /@dealer\.benjaminpebsteel\.com$/i;
export const ผู้รับเพิ่มได้สูงสุด = 5;

const กล่องแดง: CSSProperties = { display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10,
  background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", fontSize: "0.8rem", fontWeight: 700 };
const ป้าย = (bg: string, color: string): CSSProperties => ({ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px",
  borderRadius: 999, background: bg, color, fontSize: "0.68rem", fontWeight: 700, whiteSpace: "nowrap" });

function Switch({ on, disabled, label, onChange }: { on: boolean; disabled?: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      style={{ width: 38, height: 22, borderRadius: 999, border: "none", padding: 2, cursor: disabled ? "not-allowed" : "pointer",
        background: on ? (disabled ? "#93c5fd" : "#1d4ed8") : "#cbd5e1", display: "inline-flex", justifyContent: on ? "flex-end" : "flex-start",
        transition: "background .15s", opacity: disabled ? 0.85 : 1 }}>
      <span style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.25)" }} />
    </button>
  );
}

/** ตารางรายเรื่องของฝั่งผู้เรียก — ฐานบอกว่าเรื่องไหนของฝั่งไหน (HQ/ดีลเลอร์) */
export function NotifyPrefsTable({ canEdit = true }: { canEdit?: boolean }) {
  const [แถว, setแถว] = useState<NotificationPref[] | null | undefined>(undefined);
  const [กำลัง, setกำลัง] = useState<string>("");
  const [ข้อความ, setข้อความ] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    let ยัง = true;
    notificationsRepo.prefs().then(r => { if (ยัง) setแถว(r); }).catch(e => { logRepoRead("notifications.prefs", e); if (ยัง) setแถว(null); });
    return () => { ยัง = false; };
  }, []);
  const ตั้ง = async (p: NotificationPref, ช่อง: "bell" | "email", ค่า: boolean) => {
    const bell = ช่อง === "bell" ? ค่า : p.bell, email = ช่อง === "email" ? ค่า : p.email;
    setกำลัง(p.kind); setข้อความ(null);
    try {
      setแถว(await notificationsRepo.setPref(p.kind, p.bellAvailable ? bell : false, p.emailAvailable ? email : false));
      setข้อความ({ ok: true, text: `บันทึกแล้ว · ${p.title} — ${ช่อง === "bell" ? "กระดิ่ง" : "อีเมล"}${ค่า ? "เปิด" : "ปิด"}` });
    } catch (e) { setข้อความ({ ok: false, text: `บันทึกไม่สำเร็จ: ${friendlyError(e)}` }); }
    finally { setกำลัง(""); }
  };
  return (
    <SectionCard icon={<Bell size={19} />} title="แจ้งเตือนแต่ละเรื่อง">
      {แถว === undefined && <div style={{ fontSize: "0.8rem", color: "#9ca3af" }}>กำลังโหลด…</div>}
      {แถว === null && <div role="alert" style={กล่องแดง}>โหลดตารางแจ้งเตือนไม่สำเร็จ — รีเฟรชหน้าแล้วลองใหม่</div>}
      {แถว && (
        <div className="table-wrap" style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
          <table aria-label="ตั้งค่าแจ้งเตือนแต่ละเรื่อง" style={{ tableLayout: "fixed", width: "100%" }}>
            <colgroup><col style={{ width: "40%" }} /><col style={{ width: 90 }} /><col style={{ width: 90 }} /><col /></colgroup>
            <thead><tr><th>เรื่อง</th><th style={{ textAlign: "center" }}>กระดิ่ง</th><th style={{ textAlign: "center" }}>อีเมล</th><th>กดแล้วไปไหน</th></tr></thead>
            <tbody>
              {แถว.map(p => (
                <tr key={p.kind} data-notif-kind={p.kind} data-flow-row={p.flowRow} data-locked={p.locked ? "1" : "0"}>
                  <td>
                    <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: "0.68rem", fontWeight: 800, color: "#52606d" }}>{p.flowRow}</span>
                      <span style={{ fontWeight: 700, color: "#1f2933" }}>{p.title}</span>
                      {p.locked && <span data-testid="notif-locked" style={ป้าย("#eef2ff", "#3730a3")}><ShieldCheck size={11} /> จำเป็น</span>}
                    </span>
                  </td>
                  <td style={{ textAlign: "center" }} data-col="bell">
                    {p.bellAvailable
                      ? <Switch on={p.bell} disabled={!canEdit || p.locked || กำลัง === p.kind} label={`${p.title} กระดิ่ง`} onChange={v => void ตั้ง(p, "bell", v)} />
                      : <span aria-label={`${p.title} ไม่มีกระดิ่ง`}>—</span>}
                  </td>
                  <td style={{ textAlign: "center" }} data-col="email">
                    {p.emailAvailable
                      ? <Switch on={p.email} disabled={!canEdit || p.locked || กำลัง === p.kind} label={`${p.title} อีเมล`} onChange={v => void ตั้ง(p, "email", v)} />
                      : <span aria-label={`${p.title} ไม่มีอีเมล`}>—</span>}
                  </td>
                  <td data-col="goes-to" style={{ fontSize: "0.78rem", color: "#52606d" }}>{p.goesTo || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {ข้อความ && <div role={ข้อความ.ok ? "status" : "alert"} style={{ marginTop: 8, fontSize: "0.74rem", fontWeight: 600, color: ข้อความ.ok ? "#166534" : "#b91c1c" }}>{ข้อความ.text}</div>}
      {!canEdit && <div style={{ marginTop: 8, fontSize: "0.72rem", color: "#6b7280" }}>เปลี่ยนค่าได้เฉพาะผู้ดูแลระบบ</div>}
    </SectionCard>
  );
}

/** ปุ่มส่งอีเมลทดสอบ + ผลรายอีเมล */
export function NotifyTestButton({ hq = false, disabledReason }: { hq?: boolean; disabledReason?: string }) {
  const [กำลัง, setกำลัง] = useState(false);
  const [ผล, setผล] = useState<NotifyTestResult[] | null>(null);
  const [พลาด, setพลาด] = useState("");
  const ส่ง = async () => {
    setกำลัง(true); setผล(null); setพลาด("");
    try { setผล(await accountRepo.sendNotifyTest({ hq })); }
    catch (e) { setพลาด(friendlyError(e)); }
    finally { setกำลัง(false); }
  };
  return (
    <div style={{ marginTop: 12 }}>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => void ส่ง()} disabled={กำลัง || !!disabledReason}
        title={disabledReason}><Send size={13} /> {กำลัง ? "กำลังส่ง…" : "ส่งอีเมลทดสอบ"}</button>
      {disabledReason && <span style={{ marginLeft: 8, fontSize: "0.72rem", color: "#b45309" }}>{disabledReason}</span>}
      {พลาด && <div role="alert" style={{ ...กล่องแดง, marginTop: 8 }}>ส่งอีเมลทดสอบไม่สำเร็จ: {พลาด}</div>}
      {ผล && (
        <ul aria-label="ผลส่งอีเมลทดสอบ" style={{ listStyle: "none", margin: "8px 0 0", padding: 0, display: "grid", gap: 4 }}>
          {ผล.length === 0 && <li style={{ fontSize: "0.76rem", color: "#b91c1c", fontWeight: 700 }}>ไม่มีผู้รับให้ส่ง</li>}
          {ผล.map(r => (
            <li key={r.email} data-test-result={r.ok ? "ok" : "fail"} data-email={r.email}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.78rem", color: r.ok ? "#166534" : "#b91c1c" }}>
              {r.ok ? <Check size={13} /> : <X size={13} />} {r.email} — {r.ok ? "ส่งสำเร็จ" : `ส่งไม่สำเร็จ${r.error ? ` (${r.error})` : ""}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** แก้รายชื่ออีเมล (HQ) — เพิ่มทีละอีเมล · ลบรายตัว · ตรวจรูปแบบทันที (ฐานตรวจซ้ำตอนบันทึก) · ไม่มีข้อความจาง ๆ ในช่อง */
export function EmailListEditor({ value, onChange, label = "อีเมลผู้รับแจ้งเตือน" }: { value: string[]; onChange: (list: string[]) => void; label?: string }) {
  const [พิมพ์, setพิมพ์] = useState("");
  const [เตือน, setเตือน] = useState("");
  const เพิ่ม = () => {
    const e = พิมพ์.trim().toLowerCase();
    if (!e) { setเตือน("พิมพ์อีเมลก่อนกดเพิ่ม"); return; }
    if (!รูปแบบอีเมลผู้รับ.test(e)) { setเตือน(`“${e}” ไม่ใช่รูปแบบอีเมล`); return; }
    if (value.includes(e)) { setเตือน(`${e} อยู่ในรายชื่อแล้ว`); return; }
    onChange([...value, e]); setพิมพ์(""); setเตือน("");
  };
  return (
    <div>
      {value.length === 0 && <div role="alert" data-testid="no-recipients" style={กล่องแดง}><Mail size={15} /> ยังไม่มีผู้รับ — อีเมลแจ้งเตือนจะไม่ถึงใครเลย (กระดิ่งยังขึ้นตามปกติ)</div>}
      <ul aria-label={label} style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
        {value.map(e => (
          <li key={e} data-recipient={e} style={{ display: "flex", alignItems: "center", gap: 8, background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 8px 6px 12px" }}>
            <Mail size={13} color="#64748b" /><span style={{ flex: 1, fontSize: "0.82rem" }}>{e}</span>
            <button type="button" aria-label={`ลบ ${e}`} onClick={() => onChange(value.filter(x => x !== e))}
              style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", display: "flex", padding: 3 }}><Trash2 size={13} /></button>
          </li>
        ))}
      </ul>
      <div style={{ display: "flex", gap: 6, marginTop: 10, maxWidth: 460 }}>
        <input className="form-input" type="email" aria-label={`เพิ่ม${label}`} value={พิมพ์} maxLength={120}
          onChange={e => { setพิมพ์(e.target.value); setเตือน(""); }} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); เพิ่ม(); } }} />
        <button type="button" className="btn btn-primary btn-sm" onClick={เพิ่ม} style={{ flexShrink: 0 }}><Plus size={14} /> เพิ่มอีเมล</button>
      </div>
      {เตือน && <div role="alert" style={{ marginTop: 6, fontSize: "0.74rem", color: "#b91c1c", fontWeight: 600 }}>{เตือน}</div>}
    </div>
  );
}

/** ผู้รับอีเมลของสาขา (ดีลเลอร์) — บันทึกที่ฐานทันที · ยืนยันด้วยโค้ด · ยืนยันแล้วเท่านั้นที่ได้รับ */
export function DealerRecipientsCard() {
  const [รายการ, setรายการ] = useState<NotifyRecipient[] | null | undefined>(undefined);
  const [พิมพ์, setพิมพ์] = useState("");
  const [เตือน, setเตือน] = useState("");
  const [กำลัง, setกำลัง] = useState("");
  const [โค้ด, setโค้ด] = useState<Record<number, string>>({});
  const [ส่งแล้ว, setส่งแล้ว] = useState<Record<number, string>>({});
  const โหลด = useCallback(() => notificationsRepo.recipients().then(setรายการ).catch(e => { logRepoRead("notifications.recipients", e); setรายการ(null); }), []);
  useEffect(() => { void โหลด(); }, [โหลด]);
  const ทำ = async (ชื่องาน: string, fn: () => Promise<unknown>, สำเร็จ?: (r: unknown) => void) => {
    setกำลัง(ชื่องาน); setเตือน("");
    try { const r = await fn(); สำเร็จ?.(r); await โหลด(); }
    catch (e) { setเตือน(friendlyError(e)); }
    finally { setกำลัง(""); }
  };
  const เพิ่ม = () => {
    const e = พิมพ์.trim().toLowerCase();
    if (!รูปแบบอีเมลผู้รับ.test(e)) { setเตือน(`“${e || "(ว่าง)"}” ไม่ใช่รูปแบบอีเมล`); return; }
    if (โดเมนเข้าระบบดีลเลอร์.test(e)) { setเตือน("อีเมลเข้าระบบของดีลเลอร์ไม่มีกล่องจดหมายจริง — ใช้อีเมลที่ติดต่อได้จริง"); return; }
    void ทำ("add", () => notificationsRepo.addRecipient(e), () => setพิมพ์(""));
  };
  const เพิ่มเอง = (รายการ ?? []).filter(r => !r.isContact).length;
  const ยืนยันแล้ว = (รายการ ?? []).filter(r => r.verified).length;
  return (
    <SectionCard icon={<Mail size={19} />} title="อีเมลผู้รับแจ้งเตือน">
      {รายการ === undefined && <div style={{ fontSize: "0.8rem", color: "#9ca3af" }}>กำลังโหลด…</div>}
      {รายการ === null && <div role="alert" style={กล่องแดง}>โหลดรายชื่อผู้รับไม่สำเร็จ — รีเฟรชหน้าแล้วลองใหม่</div>}
      {รายการ && ยืนยันแล้ว === 0 && (
        <div role="alert" data-testid="no-recipients" style={กล่องแดง}><Mail size={15} /> ยังไม่มีผู้รับ — อีเมลแจ้งเตือนจะไม่ถึงใครเลยจนกว่าจะยืนยันอีเมลอย่างน้อย 1 รายการ (กระดิ่งยังขึ้นตามปกติ)</div>
      )}
      {รายการ && รายการ.length > 0 && (
        <ul aria-label="อีเมลผู้รับแจ้งเตือน" style={{ listStyle: "none", margin: "10px 0 0", padding: 0, display: "grid", gap: 6 }}>
          {รายการ.map(r => (
            <li key={r.id} data-recipient={r.email} data-verified={r.verified ? "1" : "0"}
              style={{ display: "grid", gap: 6, background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px 8px 12px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Mail size={13} color="#64748b" /><span style={{ flex: 1, minWidth: 0, fontSize: "0.82rem", overflowWrap: "anywhere" }}>{r.email}</span>
                {r.isContact && <span style={ป้าย("#f1f5f9", "#475569")}>อีเมลติดต่อของบัญชี</span>}
                {r.verified
                  ? <span data-testid="recipient-status" style={ป้าย("#dcfce7", "#166534")}><Check size={11} /> ยืนยันแล้ว</span>
                  : <span data-testid="recipient-status" style={ป้าย("#fff7ed", "#b45309")}>รอยืนยัน</span>}
                {!r.verified && (
                  <button type="button" className="btn btn-secondary btn-sm" disabled={!!กำลัง} aria-label={`ส่งเลขยืนยัน ${r.email}`}
                    onClick={() => void ทำ(`send-${r.id}`, () => accountRepo.sendNotifyRecipientCode(r.id), x => setส่งแล้ว(s => ({ ...s, [r.id]: (x as { sentTo: string }).sentTo })))}>
                    <Send size={12} /> {ส่งแล้ว[r.id] ? "ส่งเลขยืนยันใหม่" : "ส่งเลขยืนยัน"}
                  </button>
                )}
                <button type="button" aria-label={`ลบ ${r.email}`} disabled={!!กำลัง} onClick={() => void ทำ(`rm-${r.id}`, () => notificationsRepo.removeRecipient(r.id))}
                  style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", display: "flex", padding: 3 }}><Trash2 size={13} /></button>
              </span>
              {!r.verified && ส่งแล้ว[r.id] && (
                <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: "0.72rem", color: "#52606d" }}>ส่งเลขยืนยันไปที่ {ส่งแล้ว[r.id]} แล้ว</span>
                  <input className="form-input" inputMode="numeric" maxLength={6} aria-label={`เลขยืนยัน ${r.email}`} value={โค้ด[r.id] ?? ""}
                    onChange={e => setโค้ด(s => ({ ...s, [r.id]: e.target.value.replace(/\D/g, "").slice(0, 6) }))} style={{ width: 110 }} />
                  <button type="button" className="btn btn-primary btn-sm" disabled={!!กำลัง || (โค้ด[r.id] ?? "").length !== 6}
                    onClick={() => void ทำ(`verify-${r.id}`, () => accountRepo.verifyNotifyRecipient(r.id, โค้ด[r.id] ?? ""))}>ยืนยัน</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {รายการ && (
        <>
          <div style={{ display: "flex", gap: 6, marginTop: 10, maxWidth: 460 }}>
            <input className="form-input" type="email" aria-label="เพิ่มอีเมลผู้รับแจ้งเตือน" value={พิมพ์} maxLength={120} disabled={เพิ่มเอง >= ผู้รับเพิ่มได้สูงสุด}
              onChange={e => { setพิมพ์(e.target.value); setเตือน(""); }} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); เพิ่ม(); } }} />
            <button type="button" className="btn btn-primary btn-sm" onClick={เพิ่ม} disabled={!!กำลัง || เพิ่มเอง >= ผู้รับเพิ่มได้สูงสุด} style={{ flexShrink: 0 }}>
              <Plus size={14} /> เพิ่มอีเมล</button>
          </div>
          <div style={{ marginTop: 6, fontSize: "0.72rem", color: "#6b7280" }}>
            เพิ่มเองได้ {ผู้รับเพิ่มได้สูงสุด} รายการ (ใช้ไป {เพิ่มเอง}) · อีเมลใหม่ต้องยืนยันด้วยเลขยืนยันก่อนจึงได้รับแจ้งเตือน · ใช้อีเมลเข้าระบบไม่ได้
          </div>
        </>
      )}
      {เตือน && <div role="alert" style={{ marginTop: 6, fontSize: "0.74rem", color: "#b91c1c", fontWeight: 600 }}>{เตือน}</div>}
      <NotifyTestButton disabledReason={รายการ && ยืนยันแล้ว === 0 ? "ยังไม่มีอีเมลที่ยืนยันแล้ว" : undefined} />
    </SectionCard>
  );
}
