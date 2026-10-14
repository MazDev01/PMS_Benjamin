"use client";

// ── แผงคำขอใบเสนอราคาในหน้าลูกค้าเป้าหมาย (ฝั่งดีลเลอร์ · FLOW.html ขั้น 3 · ด่าน 1) ────────────────────────────
//
// ขั้น 3: ดีลเลอร์ส่งคำขอ (แม่แบบ + สเปก) → ลูกค้าเป้าหมาย "รอราคา HQ" — ฐานข้อมูลขยับสถานะเอง
// ระหว่างรอ HQ: ยกเลิกได้จนกว่า HQ ส่งใบ ต้องระบุเหตุผล (กลับรวบรวมความต้องการ หรือปิดเป็นไม่สำเร็จ) — แถว 6
// หลัง HQ ส่งใบ: ขอแก้ราคาได้ (ใบเก่าปิด คำขอใหม่เริ่มนับ 14 วัน) — แถว 7
// โหมดข้อมูลตัวอย่าง (ไม่มีฐานข้อมูล) ไม่แสดงแผงนี้
import { useCallback, useEffect, useState } from "react";
import { Send } from "lucide-react";
import { quoteRequests as repo, catalog as catalogRepo } from "@pms/shared/lib/data";
import { REAL_BACKEND } from "@pms/shared/lib/data/config";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import {
  type QuoteRequest, quoteRequestStatusLabel, quoteRequestStatusColor, อยู่กับHQ, คำขอเปิดอยู่, เกินกำหนด, วันไทยสั้น,
} from "@pms/shared/lib/quoteRequests";
import type { LeadRow } from "@pms/shared/lib/mock";

type โหมด = "ดู" | "ขอราคา" | "ยกเลิก" | "แก้ราคา";
const ช่อง: React.CSSProperties = { width: "100%", border: "1px solid #d5dbe4", borderRadius: 9, padding: "9px 11px", fontSize: "0.84rem", fontFamily: "inherit", boxSizing: "border-box" };

export function QuoteRequestPanel({ lead, onChanged }: { lead: LeadRow; onChanged?: () => void }) {
  const [รายการ, setรายการ] = useState<QuoteRequest[] | null>(null);
  const [แม่แบบ, setแม่แบบ] = useState<string[]>([]);
  const [โหมด, setโหมด] = useState<โหมด>("ดู");
  const [product, setProduct] = useState("");
  const [spec, setSpec] = useState("");
  const [area, setArea] = useState("");
  const [เหตุผล, setเหตุผล] = useState("");
  const [ปิดงาน, setปิดงาน] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const dealerCode = lead.dealerCode ?? "";
  const โหลด = useCallback(() => {
    if (!REAL_BACKEND || !dealerCode || lead.numId == null) return;
    repo.listForLead(dealerCode, lead.numId).then(setรายการ).catch(e => logRepoRead("quoteRequests.listForLead", e));
  }, [dealerCode, lead.numId]);
  useEffect(โหลด, [โหลด]);
  useEffect(() => {
    if (โหมด !== "ขอราคา" || แม่แบบ.length) return;
    catalogRepo.list().then(l => setแม่แบบ([...new Set(l.map(p => p.name).filter(Boolean))])).catch(e => logRepoRead("catalog.list(quote-request)", e));
  }, [โหมด, แม่แบบ.length]);

  if (!REAL_BACKEND) return null;
  const ล่าสุด = รายการ?.[0];
  const เปิด = ล่าสุด && คำขอเปิดอยู่(ล่าสุด.status) ? ล่าสุด : null;
  const ขอได้ = !เปิด && (lead.status === "WAITING" || lead.status === "BULLET");

  const ทำ = async (fn: () => Promise<unknown>) => {
    setErr(""); setBusy(true);
    try { await fn(); setโหมด("ดู"); setเหตุผล(""); setSpec(""); setArea(""); โหลด(); onChanged?.(); }
    catch (e) { setErr(friendlyError(e)); }
    finally { setBusy(false); }
  };
  const ส่งคำขอ = () => {
    if (!product) { setErr("เลือกแม่แบบก่อน"); return; }
    void ทำ(() => repo.submit({ leadNumId: lead.numId!, product, spec, area: area ? Number(area) : null, province: lead.province ?? "" }));
  };
  const ยกเลิก = () => {
    if (!เหตุผล.trim()) { setErr("ต้องระบุเหตุผล"); return; }
    void ทำ(() => repo.cancel(เปิด!.id, เหตุผล.trim(), ปิดงาน));
  };
  const แก้ราคา = () => {
    if (!เหตุผล.trim()) { setErr("ต้องระบุเหตุผล"); return; }
    void ทำ(() => repo.reprice(เปิด!.id, เหตุผล.trim(), spec.trim() || undefined));
  };

  return (
    <div data-panel="quote-request" style={{ border: "1px solid #e9d5ff", background: "#faf5ff", borderRadius: 12, padding: 14, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Send size={15} color="#6b21a8" />
        <strong style={{ fontSize: "0.86rem", color: "#3b0764" }}>ราคาจากสำนักงานใหญ่</strong>
      </div>

      {เปิด ? (
        <div style={{ fontSize: "0.8rem", color: "#374151", lineHeight: 1.8 }}>
          <div>
            คำขอ <b>{เปิด.requestNo}</b> ·{" "}
            <span className="badge" style={{ background: quoteRequestStatusColor[เปิด.status].bg, color: quoteRequestStatusColor[เปิด.status].text }}>
              {quoteRequestStatusLabel[เปิด.status]}
            </span>
            {เกินกำหนด(เปิด) && <span className="badge" style={{ marginLeft: 6, background: "#fee2e2", color: "#b91c1c" }}>เกินกำหนด</span>}
          </div>
          <div>แม่แบบ: {เปิด.product}{เปิด.subtype ? ` · ${เปิด.subtype}` : ""}{เปิด.spec ? ` · ${เปิด.spec}` : ""}</div>
          {อยู่กับHQ(เปิด.status) && <div>กำหนดส่งใบ HQ: {วันไทยสั้น(เปิด.dueAt)}{เปิด.assigneeName ? ` · ผู้รับผิดชอบ ${เปิด.assigneeName}` : ""}</div>}
          {โหมด === "ดู" && (
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              {อยู่กับHQ(เปิด.status) && <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setErr(""); setโหมด("ยกเลิก"); }}>ยกเลิกคำขอ</button>}
              {เปิด.status === "quoted" && <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setErr(""); setโหมด("แก้ราคา"); }}>ขอแก้ราคา</button>}
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: "0.8rem", color: "#4b5563" }}>
          {ขอได้ ? "ยังไม่ได้ขอราคา — ส่งคำขอพร้อมแม่แบบและสเปก สำนักงานใหญ่ทำ BOQ และส่งใบ HQ ภายใน 14 วัน"
                 : lead.status === "HQ_PRICING" ? "กำลังโหลดคำขอ…" : "ขอราคาจาก HQ ได้ในขั้นติดต่อแล้ว หรือรวบรวมความต้องการ"}
          {ขอได้ && โหมด === "ดู" && (
            <div style={{ marginTop: 8 }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => { setErr(""); setโหมด("ขอราคา"); }}>ขอราคาจาก HQ</button>
            </div>
          )}
        </div>
      )}

      {โหมด === "ขอราคา" && (
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          <label className="form-label" htmlFor="qr-product">แม่แบบ</label>
          <select id="qr-product" aria-label="แม่แบบ" style={ช่อง} value={product} onChange={e => setProduct(e.target.value)} disabled={busy}>
            <option value="">เลือกแม่แบบ</option>
            {แม่แบบ.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <label className="form-label" htmlFor="qr-area">พื้นที่ (ตร.ม.)</label>
          <input id="qr-area" inputMode="decimal" style={ช่อง} value={area} onChange={e => setArea(e.target.value.replace(/[^\d.]/g, ""))} disabled={busy} />
          <label className="form-label" htmlFor="qr-spec">สเปก / รายละเอียด</label>
          <textarea id="qr-spec" aria-label="สเปก / รายละเอียด" rows={3} style={ช่อง} value={spec} onChange={e => setSpec(e.target.value)} disabled={busy} />
          <div style={{ fontSize: "0.74rem", color: "#6b7280" }}>จังหวัดหน้างาน: {lead.province || "—"}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={ส่งคำขอ}>{busy ? "กำลังส่ง…" : "ส่งคำขอ"}</button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setโหมด("ดู")}>ยกเลิก</button>
          </div>
        </div>
      )}

      {โหมด === "ยกเลิก" && เปิด && (
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          <label className="form-label" htmlFor="qr-cancel-reason">เหตุผลที่ยกเลิก</label>
          <textarea id="qr-cancel-reason" aria-label="เหตุผลที่ยกเลิก" rows={2} style={ช่อง} value={เหตุผล} onChange={e => setเหตุผล(e.target.value)} disabled={busy} />
          <label style={{ fontSize: "0.78rem", display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={ปิดงาน} onChange={e => setปิดงาน(e.target.checked)} disabled={busy} />
            ปิดลูกค้าเป้าหมายรายนี้เป็น "ปิดการขายไม่สำเร็จ" ด้วย (ไม่ติ๊ก = กลับไปรวบรวมความต้องการ)
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={ยกเลิก}>ยืนยันยกเลิก</button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setโหมด("ดู")}>ไม่ยกเลิก</button>
          </div>
        </div>
      )}

      {โหมด === "แก้ราคา" && เปิด && (
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          <label className="form-label" htmlFor="qr-reprice-reason">เหตุผลที่ขอแก้ราคา</label>
          <textarea id="qr-reprice-reason" aria-label="เหตุผลที่ขอแก้ราคา" rows={2} style={ช่อง} value={เหตุผล} onChange={e => setเหตุผล(e.target.value)} disabled={busy} />
          <label className="form-label" htmlFor="qr-reprice-spec">สเปกใหม่ (ถ้าเปลี่ยน)</label>
          <textarea id="qr-reprice-spec" rows={2} style={ช่อง} value={spec} onChange={e => setSpec(e.target.value)} disabled={busy} />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={แก้ราคา}>ส่งขอแก้ราคา</button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setโหมด("ดู")}>ยกเลิก</button>
          </div>
        </div>
      )}

      {err && <div role="alert" style={{ marginTop: 8, fontSize: "0.76rem", color: "#dc2626", fontWeight: 600 }}>{err}</div>}
    </div>
  );
}
