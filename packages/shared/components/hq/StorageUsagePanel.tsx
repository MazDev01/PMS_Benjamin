"use client";

// ── ตั้งค่า › พื้นที่เก็บไฟล์ (HQ · บอสสั่ง 2 พ.ย. 69 · ใบ 0273) ─────────────────────────────────────────────────────────────
// พื้นที่ที่ใช้ไป = ขนาดจริงของไฟล์ทุกถัง (storage_usage อ่านจากถัง ไม่เชื่อค่าที่หน้าเว็บส่ง)
// โควตา = ตัวเลขที่ HQ ใส่เอง (GB) — ระบบไม่รู้แพ็กเกจของที่เก็บไฟล์ จึงไม่เดา · ยังไม่ใส่ = "ยังไม่ได้ตั้งโควตา" ไม่มีหลอดเทียบ
// บันทึกโควตาด้วยปุ่มบันทึกกลางของหน้าตั้งค่า (เหมือนแท็บอื่น) · ตั้งได้เฉพาะผู้ดูแล/ผู้บริหาร HQ (ฐานกัน)
import { useCallback, useEffect, useMemo, useState } from "react";
import { HardDrive, Gauge, Files } from "lucide-react";
import { quoteFiles as repo } from "@pms/shared/lib/data";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import { useReportSection, useSettingsToast } from "@pms/shared/lib/settingsBus";
import { แจ้งพลาด } from "@pms/shared/components/ui/ConfirmToast";
import { KpiRow, KpiCard } from "@pms/shared/components/ui/KpiCard";
import { SectionCard } from "@pms/shared/components/ui/SectionCard";
import { type StorageUsage, ขนาดไฟล์ } from "@pms/shared/lib/quoteFiles";

/** ชื่อถังที่ผู้ใช้อ่านรู้เรื่อง — ถังที่ไม่รู้จักแสดงชื่อจริง */
const ชื่อถัง: Record<string, string> = {
  "quote-files": "ไฟล์แนบคำขอราคา (ดีลเลอร์ ↔ HQ)",
  "dealer-files": "ไฟล์ของดีลเลอร์ (ลูกค้า/ลีด)",
  "avatars": "รูปโปรไฟล์",
  "catalog-images": "รูปแคตตาล็อก (เลิกใช้)",
  "catalog-plans": "แบบแปลนแม่แบบ (เลิกใช้)",
};
const GB = 1024 ** 3;

export function StorageUsagePanel() {
  const [ข้อมูล, setข้อมูล] = useState<StorageUsage | null | undefined>(undefined);
  const [โควตา, setโควตา] = useState("");   // ช่องพิมพ์ (GB) — ว่าง = ยังไม่ตั้ง
  const toast = useSettingsToast();

  const โหลด = useCallback(() => {
    repo.usage().then(u => { setข้อมูล(u); setโควตา(u.quotaGb == null ? "" : String(Number(u.quotaGb))); })
      .catch(e => { logRepoRead("quoteFiles.usage", e); setข้อมูล(null); });
  }, []);
  useEffect(โหลด, [โหลด]);

  const บันทึกไว้ = ข้อมูล?.quotaGb == null ? "" : String(Number(ข้อมูล.quotaGb));
  const dirty = !!ข้อมูล && โควตา.trim() !== บันทึกไว้;
  const save = useCallback(() => {
    const t = โควตา.trim();
    const gb = t === "" ? null : Number(t);
    if (gb != null && !(gb > 0)) { แจ้งพลาด("โควตาต้องเป็นตัวเลขมากกว่า 0 GB (เว้นว่าง = ยังไม่ตั้ง)"); return; }
    repo.setQuota(gb).then(() => { toast("บันทึกโควตาพื้นที่เก็บไฟล์แล้ว"); โหลด(); })
      .catch(e => แจ้งพลาด("บันทึกโควตาไม่สำเร็จ: " + friendlyError(e)));
  }, [โควตา, toast, โหลด]);
  const reset = useCallback(() => setโควตา(บันทึกไว้), [บันทึกไว้]);
  useReportSection(useMemo(() => ({ dirty, save, reset }), [dirty, save, reset]));

  const ใช้ไป = ข้อมูล ? ข้อมูล.buckets.reduce((s, b) => s + Number(b.bytes), 0) : null;
  const ไฟล์ = ข้อมูล ? ข้อมูล.buckets.reduce((s, b) => s + Number(b.files), 0) : null;
  const โควตาไบต์ = ข้อมูล?.quotaGb != null ? Number(ข้อมูล.quotaGb) * GB : null;
  const ร้อยละ = ใช้ไป != null && โควตาไบต์ ? Math.min(100, (ใช้ไป / โควตาไบต์) * 100) : null;
  const ว่าง = ข้อมูล === null ? "โหลดข้อมูลไม่สำเร็จ" : "กำลังโหลด…";

  return (
    <div data-panel="storage-usage">
      <KpiRow label="สรุปพื้นที่เก็บไฟล์">
        <KpiCard kpi="storage-used" icon={HardDrive} label="พื้นที่ที่ใช้ไป" value={ใช้ไป == null ? null : ขนาดไฟล์(ใช้ไป)} rawValue={ใช้ไป} empty={ว่าง} testId="storage-used" />
        <KpiCard kpi="storage-quota" icon={Gauge} color="#7C3AED" bg="#F3E8FF" label="โควตา" testId="storage-quota"
          value={ข้อมูล === undefined || ข้อมูล === null ? null : ข้อมูล.quotaGb == null ? "ยังไม่ได้ตั้งโควตา" : `${Number(ข้อมูล.quotaGb).toLocaleString()} GB`}
          rawValue={ข้อมูล?.quotaGb ?? null} empty={ว่าง}
          sub={ร้อยละ != null ? `ใช้ไป ${ร้อยละ.toFixed(1)}%` : undefined} />
        <KpiCard kpi="storage-files" icon={Files} color="#0891B2" bg="#E6F4F9" label="จำนวนไฟล์" value={ไฟล์ == null ? null : ไฟล์.toLocaleString()} rawValue={ไฟล์} unit="ไฟล์" empty={ว่าง} />
      </KpiRow>

      <SectionCard icon={<HardDrive size={19} />} title="พื้นที่เก็บไฟล์">
        <div style={{ display: "grid", gap: 14 }}>
          {ร้อยละ != null && (
            <div data-testid="storage-bar" data-pct={ร้อยละ.toFixed(1)} style={{ display: "grid", gap: 6 }}>
              <div style={{ height: 10, borderRadius: 999, background: "#eef1f5", overflow: "hidden" }}>
                <div className="bar-grow" style={{ height: "100%", width: `${ร้อยละ}%`, borderRadius: 999, background: ร้อยละ >= 90 ? "#dc2626" : ร้อยละ >= 70 ? "#f59e0b" : "#003366" }} />
              </div>
              <div style={{ fontSize: "0.78rem", color: "#374151" }}>ใช้ไป {ขนาดไฟล์(ใช้ไป!)} จาก {Number(ข้อมูล!.quotaGb).toLocaleString()} GB</div>
            </div>
          )}
          <label style={{ display: "grid", gap: 4, fontSize: "0.82rem", fontWeight: 700, color: "#374151", maxWidth: 340 }}>
            โควตาพื้นที่เก็บไฟล์ (GB)
            <input aria-label="โควตาพื้นที่เก็บไฟล์ (GB)" inputMode="decimal" value={โควตา} disabled={!ข้อมูล}
              onChange={e => setโควตา(e.target.value.replace(/[^\d.]/g, ""))} placeholder="เว้นว่าง = ยังไม่ได้ตั้งโควตา"
              style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "7px 10px", fontSize: "0.84rem", fontWeight: 400 }} />
          </label>
          <div className="table-wrap">
            <table aria-label="พื้นที่เก็บไฟล์แยกตามที่เก็บ" style={{ tableLayout: "fixed", width: "100%" }}>
              <colgroup><col style={{ width: "56%" }} /><col style={{ width: "22%" }} /><col style={{ width: "22%" }} /></colgroup>
              <thead><tr><th>ที่เก็บ</th><th className="num">จำนวนไฟล์</th><th className="num">ขนาด</th></tr></thead>
              <tbody>
                {!ข้อมูล ? <tr><td colSpan={3} style={{ textAlign: "center", color: "#9ca3af" }}>{ว่าง}</td></tr>
                  : ข้อมูล.buckets.map(b => (
                    <tr key={b.bucket} data-bucket={b.bucket} data-bytes={b.bytes}>
                      <td>{ชื่อถัง[b.bucket] ?? b.bucket}</td>
                      <td className="num">{Number(b.files).toLocaleString()}</td>
                      <td className="num">{ขนาดไฟล์(Number(b.bytes))}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
