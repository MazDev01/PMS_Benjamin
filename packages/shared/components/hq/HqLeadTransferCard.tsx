"use client";

// ── โอนลูกค้าเป้าหมายของ HQ ให้ดีลเลอร์ (ด่าน 1 · ใบ 0197) ─────────────────────────────────────────────
//
// FLOW.html "HQ ไม่คุยกับลูกค้าปลายทางโดยตรง" — ลูกค้าเป้าหมายใต้รหัส HQ ต้องโอนออก (ข้อตัดสินของบอส 14 ต.ค. 69)
//   ดีลเลอร์ดูแลจังหวัดนั้นรายเดียว → โอนอัตโนมัติ (กดยืนยันครั้งเดียวทั้งชุด)
//   จังหวัดทับซ้อน → HQ เลือกดีลเลอร์ต่อจังหวัด
//   ไม่มีจังหวัด / จังหวัดว่าง → คิวรอ (แก้จังหวัดหรือกำหนดพื้นที่ก่อน)
// ไม่มีลูกค้าเป้าหมายใต้รหัส HQ = ไม่แสดงการ์ด
import { useCallback, useEffect, useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { territories as territoriesRepo } from "@pms/shared/lib/data";
import type { HqTransferPlanRow } from "@pms/shared/lib/data/ports";
import { ยืนยัน, แจ้งพลาด, แจ้งสำเร็จ } from "@pms/shared/components/ui/ConfirmToast";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import { logRepoRead } from "@pms/shared/lib/repoLog";

export function HqLeadTransferCard({ dealerName, onTransferred }: { dealerName: (code: string) => string; onTransferred?: () => void }) {
  const [แผน, setแผน] = useState<HqTransferPlanRow[]>([]);
  const [เลือก, setเลือก] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const โหลด = useCallback(() => {
    territoriesRepo.transferPlan().then(setแผน).catch(e => {
      // บัญชีที่ไม่ใช่ผู้ดูแลระดับจัดการ = ไม่มีสิทธิ์ดูแผน (forbidden) → ไม่แสดงการ์ด ไม่ต้องบันทึก
      if (!/forbidden|ไม่มีสิทธิ์/.test(String((e as Error)?.message ?? e))) logRepoRead("territories.transferPlan", e);
    });
  }, []);
  useEffect(โหลด, [โหลด]);

  const อัตโนมัติ = แผน.filter(r => r.mode === "auto");
  const เลือกเอง = แผน.filter(r => r.mode === "choose");
  const คิว = แผน.filter(r => r.mode === "queue");
  const รวม = (rows: HqTransferPlanRow[]) => rows.reduce((s, r) => s + r.leads, 0);
  if (!แผน.length) return null;

  const โอนชุด = async () => {
    if (!(await ยืนยัน({
      หัวข้อ: `โอน ${รวม(อัตโนมัติ)} ราย ใน ${อัตโนมัติ.length} จังหวัด ให้ดีลเลอร์ที่ดูแลจังหวัดนั้น?`,
      รายละเอียด: "ลูกค้าเป้าหมายย้ายพร้อมประวัติ นัดหมาย และโน้ต · สำนักงานใหญ่ไม่ได้เป็นเจ้าของอีกต่อไป · ย้อนกลับไม่ได้",
      ปุ่มตกลง: "โอนทั้งหมด", อันตราย: true,
    }))) return;
    setBusy(true);
    try { const n = await territoriesRepo.transferAuto(); แจ้งสำเร็จ(`โอนแล้ว ${n} ราย`); โหลด(); onTransferred?.(); }
    catch (e) { แจ้งพลาด(friendlyError(e)); }
    finally { setBusy(false); }
  };
  const โอนจังหวัด = async (r: HqTransferPlanRow) => {
    const to = เลือก[r.province];
    if (!to) return;
    if (!(await ยืนยัน({
      หัวข้อ: `โอน ${r.leads} ราย ในจังหวัด${r.province} ให้ ${to} ${dealerName(to)}?`,
      รายละเอียด: "ลูกค้าเป้าหมายย้ายพร้อมประวัติ นัดหมาย และโน้ต · ย้อนกลับไม่ได้", ปุ่มตกลง: "โอน", อันตราย: true,
    }))) return;
    setBusy(true);
    try { const n = await territoriesRepo.transfer(r.province, to); แจ้งสำเร็จ(`โอนแล้ว ${n} ราย`); โหลด(); onTransferred?.(); }
    catch (e) { แจ้งพลาด(friendlyError(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <ArrowRightLeft size={18} color="#003366" />
        <div style={{ flex: "1 1 260px" }}>
          <div style={{ fontWeight: 800, color: "#003366", fontSize: "0.92rem" }}>โอนลูกค้าเป้าหมายของ HQ ให้ดีลเลอร์ ({รวม(แผน)} ราย)</div>
          <div style={{ fontSize: "0.74rem", color: "#6b7280" }}>สำนักงานใหญ่ไม่ขายตรง — ลูกค้าเป้าหมายใต้รหัส HQ โอนให้ดีลเลอร์ที่ดูแลจังหวัดหน้างาน</div>
        </div>
        {อัตโนมัติ.length > 0 && (
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void โอนชุด()}>
            โอนอัตโนมัติทั้งหมด ({รวม(อัตโนมัติ)} ราย)
          </button>
        )}
      </div>
      <div className="table-scroll">
        <table className="table" style={{ width: "100%" }}>
          <thead><tr><th>จังหวัด</th><th style={{ width: 90 }}>ลูกค้าเป้าหมาย</th><th>ดีลเลอร์ที่ดูแล</th><th style={{ width: 300 }}>การโอน</th></tr></thead>
          <tbody>
            {[...อัตโนมัติ, ...เลือกเอง].map(r => (
              <tr key={r.province} aria-label={r.province}>
                <td style={{ fontWeight: 700 }}>{r.province}</td>
                <td>{r.leads.toLocaleString()}</td>
                <td style={{ fontSize: "0.8rem" }}>{r.dealerCodes.map(c => `${c} ${dealerName(c)}`.trim()).join(" · ")}</td>
                <td>
                  {r.mode === "auto" ? <span style={{ fontSize: "0.76rem", color: "#047857" }}>โอนอัตโนมัติได้</span> : (
                    <div style={{ display: "flex", gap: 8 }}>
                      <select aria-label={`โอนจังหวัด${r.province}ให้`} className="form-select" value={เลือก[r.province] ?? ""} disabled={busy}
                        onChange={e => setเลือก(s => ({ ...s, [r.province]: e.target.value }))}>
                        <option value="">ทับซ้อน — เลือกดีลเลอร์</option>
                        {r.dealerCodes.map(c => <option key={c} value={c}>{c} {dealerName(c)}</option>)}
                      </select>
                      <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !เลือก[r.province]} onClick={() => void โอนจังหวัด(r)}>โอน</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {คิว.length > 0 && (
        <div role="note" style={{ marginTop: 10, fontSize: "0.76rem", color: "#6b7280", lineHeight: 1.7 }}>
          <strong>คิวรอ {รวม(คิว)} ราย</strong> — โอนไม่ได้จนกว่าจะแก้จังหวัดหน้างาน หรือกำหนดดีลเลอร์ให้จังหวัดนั้น:{" "}
          {คิว.map(r => `${r.province || "ไม่มีจังหวัด"} ${r.leads} ราย`).join(" · ")}
        </div>
      )}
    </div>
  );
}
