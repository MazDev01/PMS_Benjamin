"use client";

// ── กล่องไฟล์แนบของคำขอราคา 2 ทาง ดีลเลอร์ ↔ HQ (บอสสั่ง 2 พ.ย. 69 · ใบ 0273) ─────────────────────────────────────────────
//
// ใช้ที่เดียวกันทั้ง 2 ฝั่ง: แผงลีดของดีลเลอร์ (ราคาจากสำนักงานใหญ่) · ใบ HQ ในหน้าคำขอใบเสนอราคาของ HQ
//   แสดงไฟล์ทั้งสายของคำขอ (คำขอแรก + ขอแก้ราคาทุกครั้ง) แยก 2 กลุ่มชัด: "ไฟล์จากดีลเลอร์" · "ไฟล์จาก HQ" (บอกเลขใบ HQ + เวอร์ชัน)
//   แนบได้เฉพาะฝั่งของผู้ใช้ และเฉพาะตอนที่ยังไม่ล็อก (ผู้เรียกบอก แนบได้/เหตุที่แนบไม่ได้) — ฐาน/ถังตรวจจริงซ้ำทุกครั้ง
//   ลบได้เฉพาะไฟล์ที่ฐานบอกว่าลบได้ (canDelete) · ดาวน์โหลดผ่านลิงก์มีอายุ 5 นาที
import { useCallback, useEffect, useRef, useState } from "react";
import { Paperclip, Download, Trash2, Upload } from "lucide-react";
import { quoteFiles as repo } from "@pms/shared/lib/data";
import { REAL_BACKEND } from "@pms/shared/lib/data/config";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { วันไทยสั้น } from "@pms/shared/lib/quoteRequests";
import {
  type QuoteFile, type ฝั่งไฟล์, acceptไฟล์แนบ, ป้ายชนิดที่รับ, ตรวจไฟล์แนบ, ขนาดไฟล์, ไฟล์มากสุดต่อฝั่ง,
} from "@pms/shared/lib/quoteFiles";
import { ยืนยัน, แจ้งพลาด, แจ้งสำเร็จ } from "@pms/shared/components/ui/ConfirmToast";

const หัวกลุ่ม: Record<ฝั่งไฟล์, string> = { dealer: "ไฟล์จากดีลเลอร์", hq: "ไฟล์จาก HQ" };

export function QuoteFilesBox({ requestId, uploadSide, canUpload, lockedReason, onChanged }: {
  /** คำขอปัจจุบัน — รายการไฟล์คืนทั้งสาย · ไฟล์ใหม่ผูกคำขอนี้ */
  requestId: number;
  /** ฝั่งที่ผู้ใช้แนบได้ (ดีลเลอร์ = dealer · HQ = hq) */
  uploadSide: ฝั่งไฟล์;
  /** ตอนนี้แนบได้ไหม (ยังไม่ล็อก) */
  canUpload: boolean;
  /** แนบไม่ได้เพราะอะไร — แสดงแทนปุ่ม */
  lockedReason?: string;
  /** แนบ/ลบแล้ว (ให้หน้าแม่โหลดป้ายจำนวนใหม่) */
  onChanged?: () => void;
}) {
  const [ไฟล์, setไฟล์] = useState<QuoteFile[] | null>(null);
  const [กำลัง, setกำลัง] = useState("");
  const [err, setErr] = useState("");
  const ช่องเลือก = useRef<HTMLInputElement>(null);

  const โหลด = useCallback(async () => {
    if (!REAL_BACKEND) return;
    await repo.list(requestId).then(setไฟล์).catch(e => {
      // คำขอถูกลบไปแล้วระหว่างเปิดดู (ล้างข้อมูลทดสอบ · คำขอถูกลบทางหลังบ้าน) = ไม่มีไฟล์ให้แสดง ไม่ใช่ข้อผิดพลาดของหน้า
      if (!/request_not_found/.test(String((e as Error)?.message ?? e))) logRepoRead("quoteFiles.list", e);
      setไฟล์([]);
    });
  }, [requestId]);
  useEffect(() => { setไฟล์(null); void โหลด(); }, [โหลด]);

  if (!REAL_BACKEND) return null;
  const ของฝั่งนี้ในคำขอนี้ = (ไฟล์ ?? []).filter(f => f.side === uploadSide && f.requestId === requestId).length;

  const แนบ = async (list: FileList | null) => {
    if (!list?.length || กำลัง) return;
    setErr("");
    const เลือก = Array.from(list);
    let มี = ของฝั่งนี้ในคำขอนี้, สำเร็จ = 0;
    const ผิด: string[] = [];
    for (let i = 0; i < เลือก.length; i++) {
      const f = เลือก[i];
      const ปัญหา = ตรวจไฟล์แนบ(f, มี);
      if (ปัญหา) { ผิด.push(`${f.name}: ${ปัญหา}`); continue; }
      setกำลัง(`กำลังอัปโหลด ${i + 1}/${เลือก.length}…`);
      try { await repo.upload(requestId, uploadSide, f); มี++; สำเร็จ++; }
      catch (e) { ผิด.push(`${f.name}: ${friendlyError(e)}`); }
    }
    setกำลัง("");
    if (ช่องเลือก.current) ช่องเลือก.current.value = "";
    if (ผิด.length) setErr(ผิด.join(" · "));
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
    return (
      <div data-files-side={side} style={{ display: "grid", gap: 4 }}>
        <div style={{ fontSize: "0.74rem", fontWeight: 800, color: side === "hq" ? "#003366" : "#6b21a8" }}>
          {หัวกลุ่ม[side]} <span style={{ fontWeight: 600, color: "#6b7280" }}>({รายการ.length})</span>
        </div>
        {ไฟล์ === null ? <div style={{ fontSize: "0.76rem", color: "#9ca3af" }}>กำลังโหลด…</div>
          : รายการ.length === 0 ? <div style={{ fontSize: "0.76rem", color: "#9ca3af" }}>—</div>
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
      </div>
    );
  };

  return (
    <div data-panel="quote-files" style={{ display: "grid", gap: 10, background: "#f8fafc", border: "1px solid #eef1f5", borderRadius: 12, padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Paperclip size={14} color="#374151" />
        <strong style={{ fontSize: "0.82rem", color: "#1f2937", flex: 1 }}>ไฟล์แนบ</strong>
        {canUpload ? (
          <>
            <input ref={ช่องเลือก} type="file" multiple accept={acceptไฟล์แนบ} aria-label="เลือกไฟล์แนบ" style={{ display: "none" }}
              onChange={e => void แนบ(e.target.files)} />
            <button type="button" className="btn btn-secondary btn-sm" disabled={!!กำลัง || ของฝั่งนี้ในคำขอนี้ >= ไฟล์มากสุดต่อฝั่ง}
              aria-busy={!!กำลัง || undefined} onClick={() => ช่องเลือก.current?.click()}>
              <Upload size={13} /> {กำลัง || "แนบไฟล์"}
            </button>
          </>
        ) : lockedReason ? <span data-testid="files-locked" style={{ fontSize: "0.72rem", color: "#6b7280" }}>{lockedReason}</span> : null}
      </div>
      {canUpload && <div style={{ fontSize: "0.7rem", color: "#6b7280" }}>{ป้ายชนิดที่รับ} (แนบแล้ว {ของฝั่งนี้ในคำขอนี้}/{ไฟล์มากสุดต่อฝั่ง})</div>}
      {กลุ่ม("dealer")}
      {กลุ่ม("hq")}
      {err && <div role="alert" style={{ fontSize: "0.74rem", color: "#dc2626", fontWeight: 600 }}>{err}</div>}
    </div>
  );
}
