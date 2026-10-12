"use client";

// ── คำขอเปลี่ยนบัญชีเข้าระบบจากดีลเลอร์ (สำนักงานใหญ่อนุมัติ/ปฏิเสธ) ────────────────
//
// ที่มา (บอสสั่ง 28 ส.ค. 69): ดีลเลอร์แก้อีเมล/รหัสผ่านเองได้ 2 ครั้งตลอดอายุบัญชี
//   ครั้งที่ 3 เป็นต้นไปต้องผ่านหน้านี้ก่อน — อนุมัติแล้วระบบเปลี่ยนให้ทันที
//   ปฏิเสธแล้วบัญชีไม่ถูกแตะ แต่มีร่องรอยว่าใครปฏิเสธเพราะอะไร
//
// การ์ดนี้ซ่อนตัวเองเมื่อไม่มีคำขอเลย — หน้าดีลเลอร์จะได้ไม่มีกล่องว่างค้างอยู่ตลอด

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, Check, X, Clock } from "lucide-react";
import { account } from "@pms/shared/lib/data";
import type { AccountRequest } from "@pms/shared/lib/data/ports";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import { fmtISOToThai } from "@pms/shared/lib/mock";
import { ยืนยัน } from "@pms/shared/components/ui/ConfirmToast";

const ชนิด: Record<AccountRequest["kind"], string> = {
  email: "ขอเปลี่ยนอีเมลเข้าระบบ",
  password: "ขอเปลี่ยนรหัสผ่าน",
  both: "ขอเปลี่ยนอีเมลและรหัสผ่าน",
};

export function AccountRequestsCard({ onChanged }: { onChanged?: () => void }) {
  const [rows, setRows] = useState<AccountRequest[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const โหลด = useCallback(() => {
    account.listRequests()
      .then(r => { setRows(r); setErr(""); })
      // อ่านไม่ได้ต้องบอก — ไม่ใช่แสดงว่า "ไม่มีคำขอ" ทั้งที่อาจมีค้างอยู่
      .catch(e => setErr(friendlyError(e)));
  }, []);
  useEffect(โหลด, [โหลด]);

  const ค้าง = rows.filter(r => r.status === "pending");
  const ตัดสินแล้ว = rows.filter(r => r.status !== "pending").slice(0, 5);
  // ยังไม่ได้ติดตั้งตารางของฟีเจอร์นี้ = ยังไม่เปิดใช้ ไม่ใช่ความผิดพลาดที่ต้องขึ้นแถบแดงทุกครั้งที่เปิดหน้า
  if (err.includes("ยังไม่ได้ติดตั้ง")) return null;
  if (!err && rows.length === 0) return null;

  async function ตัดสิน(r: AccountRequest, action: "approve" | "reject") {
    const ตกลง = await ยืนยัน({
      หัวข้อ: action === "approve" ? `อนุมัติคำขอของ ${r.dealerCode}?` : `ปฏิเสธคำขอของ ${r.dealerCode}?`,
      รายละเอียด: action === "approve"
        ? `${ชนิด[r.kind]}${r.newEmail ? ` เป็น ${r.newEmail}` : ""} — อนุมัติแล้วมีผลทันที ดีลเลอร์ต้องใช้ค่าใหม่เข้าระบบ`
        : "บัญชีของดีลเลอร์จะไม่ถูกเปลี่ยน และดีลเลอร์จะเห็นว่าคำขอถูกปฏิเสธ",
      ปุ่มตกลง: action === "approve" ? "อนุมัติ" : "ปฏิเสธคำขอ",
      อันตราย: action === "reject",
    });
    if (!ตกลง) return;
    setBusy(r.id);
    try {
      await account.decide(r.id, action);
      โหลด();
      onChanged?.();
      // เปลี่ยนบัญชีของดีลเลอร์แล้ว = ข้อมูลบนหน้านี้ (ทะเบียนสาขา/อีเมล) เก่าไปทันที
      // บอสสั่ง 1 ก.ย. 69: ให้รีหน้าตัวเองอัตโนมัติ "หนึ่งครั้ง" หลังเปลี่ยนอะไรก็ตาม
      // หน่วงสั้น ๆ ให้ผู้ใช้เห็นว่ากดสำเร็จก่อน แล้วค่อยโหลดใหม่ (ครั้งเดียว ไม่วนซ้ำ)
      setTimeout(() => { try { window.location.reload(); } catch { /* SSR */ } }, 900);
    } catch (e) {
      setErr(friendlyError(e));
    } finally { setBusy(null); }
  }

  return (
    <div className="card" style={{ padding: 0, marginBottom: 16, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "13px 16px", borderBottom: "1px solid #E7EDF4" }}>
        <ShieldCheck size={15} color="#003366" />
        <span style={{ fontSize: "0.86rem", fontWeight: 800, color: "#1F2937" }}>คำขอเปลี่ยนบัญชีเข้าระบบจากดีลเลอร์</span>
        {ค้าง.length > 0 && (
          <span className="badge" style={{ background: "#FEF3C7", color: "#92400E" }}>รออนุมัติ {ค้าง.length}</span>
        )}
      </div>

      {err && <div style={{ padding: "12px 16px", fontSize: "0.74rem", color: "#dc2626" }}>{err}</div>}

      {ค้าง.map(r => (
        <div key={`${r.dealerCode}-${r.id}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid #F1F5F9", flexWrap: "wrap" }}>
          <div style={{ minWidth: 0, flex: "1 1 260px" }}>
            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#1F2937" }}>
              {r.dealerCode}{r.dealerName ? ` · ${r.dealerName}` : ""}
            </div>
            <div style={{ fontSize: "0.7rem", color: "#64748B", marginTop: 2 }}>
              {ชนิด[r.kind]}{r.newEmail ? ` → ${r.newEmail}` : ""} · ส่งคำขอ {fmtISOToThai(String(r.requestedAt).slice(0, 10))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button className="btn btn-secondary btn-sm" disabled={busy === r.id} onClick={() => ตัดสิน(r, "reject")}>
              <X size={13} /> ปฏิเสธ
            </button>
            <button className="btn btn-primary btn-sm" disabled={busy === r.id} onClick={() => ตัดสิน(r, "approve")}>
              <Check size={13} /> อนุมัติ
            </button>
          </div>
        </div>
      ))}

      {ตัดสินแล้ว.length > 0 && (
        <div style={{ padding: "10px 16px", background: "#F8FAFC" }}>
          <div style={{ fontSize: "0.62rem", fontWeight: 800, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
            ตัดสินไปแล้วล่าสุด
          </div>
          {ตัดสินแล้ว.map(r => (
            <div key={`${r.dealerCode}-${r.id}`} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.7rem", color: "#64748B", padding: "3px 0" }}>
              <Clock size={11} />
              <span style={{ fontWeight: 700, color: "#1F2937" }}>{r.dealerCode}</span>
              <span>{ชนิด[r.kind]}</span>
              <span style={{ color: r.status === "approved" ? "#059669" : "#dc2626", fontWeight: 700 }}>
                {r.status === "approved" ? "อนุมัติแล้ว" : "ปฏิเสธ"}
              </span>
              <span>{r.decidedAt ? fmtISOToThai(String(r.decidedAt).slice(0, 10)) : ""}{r.decidedBy ? ` · ${r.decidedBy}` : ""}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
