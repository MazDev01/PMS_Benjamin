"use client";

// ── ช่องหน่วยแบบดรอปดาวน์ (บอสสั่ง 3 พ.ย. 69 "ดรอปดาวน์ใส่เปลี่ยนหน่วยได้") ───────────────────────────────────────────────
// ใช้ทุกตารางรายการที่แก้หน่วยได้: ตาราง BOQ ของใบ HQ · ตั้งค่า › รายการวัสดุ
//   รายการหน่วย = หน่วยมาตรฐานของระบบ (หน่วยBOQ · ที่ใช้อยู่จริงในข้อมูล) + หน่วยจากรายการวัสดุ (ตั้งค่า › รายการวัสดุ) — ไม่เดาเพิ่ม
//   หน่วยเดิมที่ไม่อยู่ในรายการ ยังแสดงเป็นตัวเลือกตามที่บันทึกไว้ (ไม่หาย) · ตัวเลือกแรก "ยังไม่ระบุ" (มาตรฐานช่องเลือกของระบบ)
//   ตัวเลือกท้าย "+ หน่วยอื่น (พิมพ์เอง)" — คงความสามารถพิมพ์หน่วยใหม่เดิม (บอสสั่ง 26 ต.ค. 69) · พิมพ์แล้วกลับไปเลือกจากรายการได้
//   กว้างพอให้เห็นหน่วยเต็ม ไม่ถูกตัด (ข้อทดสอบวัดความกว้าง)
import { useEffect, useMemo, useState } from "react";
import { materialTemplates } from "@pms/shared/lib/data";
import { REAL_BACKEND } from "@pms/shared/lib/data/config";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { หน่วยBOQ } from "@pms/shared/lib/quoteRequests";

const อื่น = "__other__";
let หน่วยจากวัสดุ: Promise<string[]> | null = null;
/** หน่วยจากรายการวัสดุ (โหลดครั้งเดียวต่อหน้า · บันทึกรายการวัสดุแล้วเรียก ล้างหน่วยจากวัสดุ()) */
function โหลดหน่วยวัสดุ(): Promise<string[]> {
  if (!REAL_BACKEND) return Promise.resolve([]);
  หน่วยจากวัสดุ ??= materialTemplates.list().then(ls => ls.map(t => t.unit.trim()).filter(Boolean))
    .catch(e => { logRepoRead("materialTemplates.list(units)", e); หน่วยจากวัสดุ = null; return []; });
  return หน่วยจากวัสดุ;
}
export const ล้างหน่วยจากวัสดุ = () => { หน่วยจากวัสดุ = null; };

/** รายการหน่วย: มาตรฐานก่อน แล้วหน่วยจากรายการวัสดุ (ไม่ซ้ำ · เรียงตามตัวอักษร) + หน่วยเพิ่มเติมที่ผู้เรียกส่งมา */
export function useรายการหน่วย(เพิ่ม: string[] = []): string[] {
  const [วัสดุ, setวัสดุ] = useState<string[]>([]);
  useEffect(() => { let alive = true; void โหลดหน่วยวัสดุ().then(u => { if (alive) setวัสดุ(u); }); return () => { alive = false; }; }, []);
  const คีย์ = เพิ่ม.join("|");
  return useMemo(() => {
    const มาตรฐาน = [...หน่วยBOQ] as string[];
    const อื่นๆ = [...new Set([...วัสดุ, ...เพิ่ม].map(u => u.trim()).filter(u => u && !มาตรฐาน.includes(u)))].sort((a, b) => a.localeCompare(b, "th"));
    return [...มาตรฐาน, ...อื่นๆ];
  }, [วัสดุ, คีย์]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function UnitSelect({ value, onChange, ariaLabel, หน่วย, onKeyDown, style }: {
  value: string; onChange: (v: string) => void; ariaLabel: string;
  /** รายการหน่วย (จาก useรายการหน่วย) */
  หน่วย: string[];
  onKeyDown?: React.KeyboardEventHandler<HTMLElement>;
  style?: React.CSSProperties;
}) {
  const v = value.trim();
  const [พิมพ์เอง, setพิมพ์เอง] = useState(false);
  // ⚠️ 11 พ.ย. 69: เลิกกว้างขั้นต่ำ 96px — ในคอลัมน์ที่แคบกว่า ช่องล้นทับช่องข้าง ๆ (ใบ HQ หน้าต่าง 820) · ความกว้างคุมที่คอลัมน์ของตาราง
  const ช่อง: React.CSSProperties = { width: "100%", minWidth: 0, boxSizing: "border-box", fontSize: "0.84rem", ...style };
  if (พิมพ์เอง) {
    return (
      <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <input aria-label={ariaLabel} value={value} autoFocus maxLength={40} placeholder="พิมพ์หน่วย" onChange={e => onChange(e.target.value)} onKeyDown={onKeyDown}
          style={{ ...ช่อง, border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 8px" }} />
        <button type="button" className="btn btn-secondary btn-sm" title="กลับไปเลือกจากรายการ" aria-label={`เลือก${ariaLabel}จากรายการ`}
          onClick={() => setพิมพ์เอง(false)} style={{ flexShrink: 0, padding: "4px 6px" }}>▾</button>
      </span>
    );
  }
  return (
    <select aria-label={ariaLabel} data-unit-select value={v} onKeyDown={onKeyDown}
      onChange={e => { if (e.target.value === อื่น) { setพิมพ์เอง(true); onChange(""); } else onChange(e.target.value); }}
      className="form-select" style={{ ...ช่อง, padding: "6px 24px 6px 8px" }}>
      <option value="">— ยังไม่ระบุ —</option>
      {หน่วย.map(u => <option key={u} value={u}>{u}</option>)}
      {/* หน่วยเดิมที่ไม่อยู่ในรายการ — แสดงตามที่บันทึกไว้ */}
      {v && !หน่วย.includes(v) && <option value={v}>{v}</option>}
      <option value={อื่น}>+ หน่วยอื่น (พิมพ์เอง)</option>
    </select>
  );
}
