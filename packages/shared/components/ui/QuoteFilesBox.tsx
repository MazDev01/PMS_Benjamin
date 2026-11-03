"use client";

// ── กล่องไฟล์แนบของคำขอราคา 2 ทาง ดีลเลอร์ ↔ HQ (บอสสั่ง 2 พ.ย. 69 · ใบ 0273) ─────────────────────────────────────────────
//
// ใช้ที่เดียวกันทั้ง 2 ฝั่ง: แผงลีดของดีลเลอร์ (ราคาจากสำนักงานใหญ่) · ใบ HQ ในหน้าคำขอใบเสนอราคาของ HQ
//   แสดงไฟล์ทั้งสายของคำขอ (คำขอแรก + ขอแก้ราคาทุกครั้ง) แยก 2 กลุ่มชัด: "ไฟล์จากดีลเลอร์" · "ไฟล์จาก HQ" (บอกเลขใบ HQ + เวอร์ชัน)
//   แนบได้เฉพาะฝั่งของผู้ใช้ และเฉพาะตอนที่ยังไม่ล็อก (ผู้เรียกบอก แนบได้/เหตุที่แนบไม่ได้) — ฐาน/ถังตรวจจริงซ้ำทุกครั้ง
//   ลบได้เฉพาะไฟล์ที่ฐานบอกว่าลบได้ (canDelete) · ดาวน์โหลดผ่านลิงก์มีอายุ 5 นาที
// 3 พ.ย. 69 (บอสสั่ง "ทำจุดแนบไฟล์แบบรู้เลย"): ที่แนบ = กล่องแนบไฟล์กลาง (FileDropBox · ลากวางได้) ใต้กลุ่มของฝั่งผู้ใช้
//   ไฟล์ที่ไม่ผ่าน (ชนิด/ขนาด/จำนวน/ฐานปฏิเสธ) ขึ้นเป็นแถวเตือนของไฟล์นั้น · ฝั่ง HQ ใบยังไม่มีร่าง = ผู้เรียกบันทึกร่างให้ก่อน (เตรียมก่อนแนบ)
//   ฝั่งดีลเลอร์ใต้ใบ HQ ที่ส่งแล้ว = เฉพาะไฟล์ของใบฉบับนั้น (กลุ่มที่แสดง + เฉพาะใบHQ) · ไม่มีไฟล์ = ไม่แสดงกล่อง (ซ่อนเมื่อว่าง)
import { useCallback, useEffect, useState } from "react";
import { Paperclip, Download, Trash2, Lock } from "lucide-react";
import { quoteFiles as repo } from "@pms/shared/lib/data";
import { REAL_BACKEND } from "@pms/shared/lib/data/config";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { วันไทยสั้น } from "@pms/shared/lib/quoteRequests";
import { type QuoteFile, type ฝั่งไฟล์, ขนาดไฟล์ } from "@pms/shared/lib/quoteFiles";
import { ยืนยัน, แจ้งพลาด, แจ้งสำเร็จ } from "@pms/shared/components/ui/ConfirmToast";
import { FileDropBox, แถวไฟล์, คัดไฟล์, type ไฟล์ไม่ผ่าน } from "@pms/shared/components/ui/FileDropBox";

const หัวกลุ่ม: Record<ฝั่งไฟล์, string> = { dealer: "ไฟล์จากดีลเลอร์", hq: "ไฟล์จาก HQ" };

export function QuoteFilesBox({ requestId, uploadSide, canUpload, lockedReason, onChanged, กลุ่มที่แสดง = ["dealer", "hq"], เฉพาะใบHQ, ซ่อนเมื่อว่าง, เตรียมก่อนแนบ, onLoaded }: {
  /** คำขอปัจจุบัน — รายการไฟล์คืนทั้งสาย · ไฟล์ใหม่ผูกคำขอนี้ */
  requestId: number;
  /** ฝั่งที่ผู้ใช้แนบได้ (ดีลเลอร์ = dealer · HQ = hq) */
  uploadSide: ฝั่งไฟล์;
  /** ตอนนี้แนบได้ไหม (ยังไม่ล็อก) */
  canUpload: boolean;
  /** แนบไม่ได้เพราะอะไร — ป้ายล็อกบนหัวกล่อง */
  lockedReason?: string;
  /** แนบ/ลบแล้ว (ให้หน้าแม่โหลดป้ายจำนวนใหม่) */
  onChanged?: () => void;
  /** กลุ่มที่แสดง (ค่าตั้งต้น ทั้ง 2 ฝั่ง) */
  กลุ่มที่แสดง?: ฝั่งไฟล์[];
  /** แสดงเฉพาะไฟล์ HQ ของใบ HQ ฉบับนี้ */
  เฉพาะใบHQ?: number;
  /** ไม่มีไฟล์ให้แสดงและแนบไม่ได้ = ไม่แสดงกล่องเลย */
  ซ่อนเมื่อว่าง?: boolean;
  /** ทำก่อนอัปโหลด (เช่น บันทึกร่างใบ HQ ให้ก่อน) — โยนข้อผิดพลาด = ไม่อัปโหลด */
  เตรียมก่อนแนบ?: () => Promise<void>;
  /** ได้รายการไฟล์ (หลังกรองกลุ่ม/ใบ) — หน้าแม่ใช้นับในบรรทัดสรุป */
  onLoaded?: (files: QuoteFile[]) => void;
}) {
  const [ไฟล์ทั้งหมด, setไฟล์] = useState<QuoteFile[] | null>(null);
  const [กำลัง, setกำลัง] = useState("");
  const [ไม่ผ่าน, setไม่ผ่าน] = useState<ไฟล์ไม่ผ่าน[]>([]);

  const โหลด = useCallback(async () => {
    if (!REAL_BACKEND) return;
    await repo.list(requestId).then(setไฟล์).catch(e => {
      // คำขอถูกลบไปแล้วระหว่างเปิดดู (ล้างข้อมูลทดสอบ · คำขอถูกลบทางหลังบ้าน) = ไม่มีไฟล์ให้แสดง ไม่ใช่ข้อผิดพลาดของหน้า
      if (!/request_not_found/.test(String((e as Error)?.message ?? e))) logRepoRead("quoteFiles.list", e);
      setไฟล์([]);
    });
  }, [requestId]);
  useEffect(() => { setไฟล์(null); setไม่ผ่าน([]); void โหลด(); }, [โหลด]);

  const ไฟล์ = ไฟล์ทั้งหมด === null ? null : ไฟล์ทั้งหมด.filter(f => กลุ่มที่แสดง.includes(f.side) && (เฉพาะใบHQ == null || f.side !== "hq" || f.hqQuoteId === เฉพาะใบHQ));
  const คีย์ไฟล์ = ไฟล์ ? ไฟล์.map(f => f.id).join(",") : null;
  useEffect(() => { if (ไฟล์) onLoaded?.(ไฟล์); }, [คีย์ไฟล์]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!REAL_BACKEND) return null;
  if (ซ่อนเมื่อว่าง && !canUpload && ไฟล์ !== null && ไฟล์.length === 0) return null;
  const ของฝั่งนี้ในคำขอนี้ = (ไฟล์ทั้งหมด ?? []).filter(f => f.side === uploadSide && f.requestId === requestId).length;

  const แนบ = async (เลือก: File[]) => {
    if (กำลัง) return;
    const { ผ่าน, ไม่ผ่าน: ผิด } = คัดไฟล์(เลือก, ของฝั่งนี้ในคำขอนี้);
    const ใหม่: ไฟล์ไม่ผ่าน[] = [...ผิด];
    let สำเร็จ = 0;
    if (ผ่าน.length && เตรียมก่อนแนบ) {
      setกำลัง("กำลังบันทึกร่าง…");
      try { await เตรียมก่อนแนบ(); }
      catch (e) {
        setกำลัง("");
        setไม่ผ่าน(x => [...x, ...ใหม่, ...ผ่าน.map(f => ({ key: `${f.name}-${Math.random().toString(36).slice(2, 8)}`, name: f.name, size: f.size, เหตุ: `บันทึกร่างใบ HQ ไม่สำเร็จ: ${friendlyError(e)}` }))]);
        return;
      }
    }
    for (let i = 0; i < ผ่าน.length; i++) {
      const f = ผ่าน[i];
      setกำลัง(`กำลังอัปโหลด ${i + 1}/${ผ่าน.length}…`);
      try { await repo.upload(requestId, uploadSide, f); สำเร็จ++; }
      catch (e) { ใหม่.push({ key: `${f.name}-${Math.random().toString(36).slice(2, 8)}`, name: f.name, size: f.size, เหตุ: friendlyError(e) }); }
    }
    setกำลัง("");
    setไม่ผ่าน(x => [...x, ...ใหม่]);
    if (สำเร็จ) { แจ้งสำเร็จ(`แนบไฟล์แล้ว ${สำเร็จ} ไฟล์`); await โหลด(); onChanged?.(); }
  };

  const ลบ = async (f: QuoteFile) => {
    const ตกลง = await ยืนยัน({ หัวข้อ: `ลบไฟล์ ${f.name} ?`, รายละเอียด: "ลบแล้วกู้คืนไม่ได้ · ระบบบันทึกว่าใครลบ", ปุ่มตกลง: "ลบไฟล์", อันตราย: true });
    if (!ตกลง) return;
    setกำลัง("กำลังลบ…");
    try { await repo.remove(f.path); แจ้งสำเร็จ(`ลบไฟล์ ${f.name} แล้ว`); await โหลด(); onChanged?.(); }
    catch (e) { แจ้งพลาด(friendlyError(e)); }
    finally { setกำลัง(""); }
  };

  const เปิด = async (f: QuoteFile) => {
    try {
      const url = await repo.downloadUrl(f.path);
      if (url) window.open(url, "_blank", "noopener");
      else แจ้งพลาด("เปิดไฟล์ไม่ได้");
    } catch (e) { แจ้งพลาด(friendlyError(e)); }
  };

  const กลุ่ม = (side: ฝั่งไฟล์) => {
    const รายการ = (ไฟล์ ?? []).filter(f => f.side === side);
    const แนบที่นี่ = canUpload && side === uploadSide;
    return (
      <div key={side} data-files-side={side} style={{ display: "grid", gap: 6 }}>
        <div style={{ fontSize: "0.74rem", fontWeight: 800, color: side === "hq" ? "#003366" : "#6b21a8" }}>
          {หัวกลุ่ม[side]} <span style={{ fontWeight: 600, color: "#6b7280" }}>({รายการ.length})</span>
        </div>
        {ไฟล์ === null ? <div style={{ fontSize: "0.76rem", color: "#9ca3af" }}>กำลังโหลด…</div>
          : รายการ.length === 0 && !แนบที่นี่ ? <div style={{ fontSize: "0.76rem", color: "#9ca3af" }}>ยังไม่มีไฟล์</div>
          : รายการ.map(f => (
            <div key={f.id} data-file-row data-file-name={f.name} style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 10px", minWidth: 0 }}>
              <Paperclip size={13} color="#6b7280" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <button type="button" onClick={() => void เปิด(f)} title="ดาวน์โหลด"
                  style={{ background: "none", border: "none", padding: 0, color: "#1d4ed8", fontWeight: 700, fontSize: "0.8rem", cursor: "pointer", fontFamily: "inherit", textAlign: "left", overflowWrap: "anywhere" }}>
                  {f.name}
                </button>
                <div style={{ fontSize: "0.7rem", color: "#6b7280" }}>
                  {ขนาดไฟล์(f.size)} · {วันไทยสั้น(f.createdAt)} · {f.uploadedByName || "—"} · {f.side === "hq" ? `ใบ HQ ${f.quoteNo ?? "—"} เวอร์ชัน ${f.version ?? "—"}` : `คำขอ ${f.requestNo}`}
                </div>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" aria-label={`ดาวน์โหลด ${f.name}`} onClick={() => void เปิด(f)}><Download size={13} /></button>
              {f.canDelete && (
                <button type="button" className="btn btn-secondary btn-sm" aria-label={`ลบ ${f.name}`} disabled={!!กำลัง} onClick={() => void ลบ(f)}><Trash2 size={13} /></button>
              )}
            </div>
          ))}
        {แนบที่นี่ && (
          <>
            {ไม่ผ่าน.map(x => (
              <div key={x.key} data-file-rejected>
                <แถวไฟล์ name={x.name} size={x.size} เตือน={x.เหตุ} ป้ายเอาออก={`ปิดคำเตือน ${x.name}`} เอาออก={() => setไม่ผ่าน(l => l.filter(y => y.key !== x.key))} />
              </div>
            ))}
            <FileDropBox onFiles={fs => void แนบ(fs)} มีอยู่แล้ว={ของฝั่งนี้ในคำขอนี้} กำลัง={กำลัง}
              ป้าย={side === "hq" ? "แนบไฟล์ถึงดีลเลอร์ (เช่น แบบที่ HQ แก้แล้ว)" : "แนบไฟล์ถึง HQ (แบบ/รูป/ใบเสนอเดิม)"} />
          </>
        )}
      </div>
    );
  };

  return (
    <div data-panel="quote-files" style={{ display: "grid", gap: 10, background: "#f8fafc", border: "1px solid #eef1f5", borderRadius: 12, padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Paperclip size={14} color="#374151" />
        <strong style={{ fontSize: "0.82rem", color: "#1f2937", flex: 1 }}>ไฟล์แนบ</strong>
        {!canUpload && lockedReason && (
          <span data-testid="files-locked" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.72rem", color: "#166534", background: "#dcfce7", borderRadius: 999, padding: "2px 8px", fontWeight: 700 }}>
            <Lock size={11} /> {lockedReason}
          </span>
        )}
      </div>
      {กลุ่มที่แสดง.map(กลุ่ม)}
    </div>
  );
}
