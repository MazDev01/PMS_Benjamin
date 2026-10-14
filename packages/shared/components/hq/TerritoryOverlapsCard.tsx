"use client";

// ── พื้นที่ทับซ้อน (กฎหนึ่งจังหวัด หนึ่งดีลเลอร์ · ด่าน 1 · ใบ 0195) ─────────────────────────────────────────
//
// ข้อตัดสินของบอส 14 ต.ค. 69:
//   - จังหวัดที่ดีลเลอร์เดิมทับกันอยู่ (ป้าย legacy) ดีลเลอร์เดิมทุกรายสร้างลูกค้าเป้าหมายได้ตามเดิม
//     HQ เห็นรายการ และเคลียร์ทีละจังหวัด (เลือกดีลเลอร์ที่เก็บไว้) — เคลียร์แล้วกฎใช้เต็ม
//   - ดีลเลอร์ที่จังหวัดในทะเบียนสะกดไม่ตรงรายชื่อมาตรฐาน ระบบไม่เดาจับคู่ — แสดงให้ HQ แก้เอง
// ไม่มีทั้งสองเรื่อง = ไม่แสดงการ์ดนี้เลย
import { useCallback, useEffect, useState } from "react";
import { MapPinned } from "lucide-react";
import { territories as territoriesRepo } from "@pms/shared/lib/data";
import type { TerritoryOverlap, UnmatchedDealer } from "@pms/shared/lib/data/ports";
import { ยืนยัน, แจ้งพลาด, แจ้งสำเร็จ } from "@pms/shared/components/ui/ConfirmToast";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import { logRepoRead } from "@pms/shared/lib/repoLog";

export function TerritoryOverlapsCard({ dealerName, canManage }: { dealerName: (code: string) => string; canManage: boolean }) {
  const [ทับ, setทับ] = useState<TerritoryOverlap[]>([]);
  const [ไม่ตรง, setไม่ตรง] = useState<UnmatchedDealer[]>([]);
  const [เลือก, setเลือก] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");

  const โหลด = useCallback(() => {
    territoriesRepo.overlaps().then(setทับ).catch(e => logRepoRead("territories.overlaps", e));
    territoriesRepo.unmatched().then(setไม่ตรง).catch(e => logRepoRead("territories.unmatched", e));
  }, []);
  useEffect(โหลด, [โหลด]);

  if (!ทับ.length && !ไม่ตรง.length) return null;

  const เคลียร์ = async (o: TerritoryOverlap) => {
    const keep = เลือก[o.province];
    if (!keep) { แจ้งพลาด("เลือกดีลเลอร์ที่จะดูแลจังหวัดนี้ก่อน"); return; }
    const ถอด = o.dealerCodes.filter(c => c !== keep);
    if (!(await ยืนยัน({
      หัวข้อ: `ให้ ${keep} ดูแลจังหวัด${o.province} รายเดียว?`,
      รายละเอียด: `${ถอด.join(", ")} จะสร้างลูกค้าเป้าหมายใหม่ในจังหวัดนี้ไม่ได้อีก (ลูกค้าเป้าหมายเดิมยังอยู่ครบ) · ย้อนกลับไม่ได้`,
      ปุ่มตกลง: "เคลียร์จังหวัดนี้", อันตราย: true,
    }))) return;
    setBusy(o.province);
    try { await territoriesRepo.resolveOverlap(o.province, keep); แจ้งสำเร็จ(`เคลียร์จังหวัด${o.province}แล้ว — ${keep} ดูแลรายเดียว`); โหลด(); }
    catch (e) { แจ้งพลาด(friendlyError(e)); }
    finally { setBusy(""); }
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <MapPinned size={18} color="#b45309" />
        <div>
          <div style={{ fontWeight: 800, color: "#003366", fontSize: "0.92rem" }}>พื้นที่ทับซ้อน {ทับ.length > 0 && `(${ทับ.length} จังหวัด)`}</div>
          <div style={{ fontSize: "0.74rem", color: "#6b7280" }}>
            หนึ่งจังหวัด หนึ่งดีลเลอร์ — จังหวัดที่ดีลเลอร์เดิมทับกันอยู่ ดีลเลอร์เหล่านั้นยังสร้างลูกค้าเป้าหมายได้จนกว่าจะเคลียร์
          </div>
        </div>
      </div>

      {ทับ.length > 0 && (
        <div className="table-scroll">
          <table className="table" style={{ width: "100%" }}>
            <thead><tr><th>จังหวัด</th><th>ภาค</th><th>ดีลเลอร์ที่ทับกัน</th>{canManage && <th style={{ width: 280 }}>เก็บไว้</th>}</tr></thead>
            <tbody>
              {ทับ.map(o => (
                <tr key={o.province} aria-label={o.province}>
                  <td style={{ fontWeight: 700 }}>{o.province}</td>
                  <td>{o.region}</td>
                  <td style={{ fontSize: "0.8rem" }}>{o.dealerCodes.map(c => `${c} ${dealerName(c)}`.trim()).join(" · ")}</td>
                  {canManage && (
                    <td>
                      <div style={{ display: "flex", gap: 8 }}>
                        <select aria-label={`ดีลเลอร์ที่ดูแลจังหวัด${o.province}`} className="form-select" value={เลือก[o.province] ?? ""}
                          onChange={e => setเลือก(s => ({ ...s, [o.province]: e.target.value }))} disabled={busy === o.province}>
                          <option value="">เลือกดีลเลอร์</option>
                          {o.dealerCodes.map(c => <option key={c} value={c}>{c} {dealerName(c)}</option>)}
                        </select>
                        <button type="button" className="btn btn-secondary btn-sm" disabled={busy === o.province || !เลือก[o.province]}
                          onClick={() => void เคลียร์(o)}>เคลียร์</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ไม่ตรง.length > 0 && (
        <div role="note" style={{ marginTop: ทับ.length ? 12 : 0, background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 10, padding: "10px 14px", fontSize: "0.78rem", color: "#78350F", lineHeight: 1.7 }}>
          <strong>ดีลเลอร์ที่ยังไม่มีพื้นที่ {ไม่ตรง.length} ราย</strong> — จังหวัดในทะเบียนสะกดไม่ตรงรายชื่อ 77 จังหวัด ระบบไม่เดาให้ แก้จังหวัดในข้อมูลดีลเลอร์ให้ตรงรายชื่อ:
          <div style={{ marginTop: 4 }}>{ไม่ตรง.map(u => `${u.dealerCode} (${u.province || "ไม่ได้ระบุ"})`).join(" · ")}</div>
        </div>
      )}
    </div>
  );
}
