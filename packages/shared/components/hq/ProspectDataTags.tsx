"use client";

// ── ป้าย "ข้อมูลไม่ครบ" / "เบอร์ซ้ำ" ของผู้สนใจเป็นดีลเลอร์ (บอสสั่ง 23 พ.ย. 69 · ใบ 0295) ─────────────────────────────────────
//   นำเข้า Facebook "เบอร์ซ้ำก็เอา ไม่ครบก็เอา" → ตาราง/บอร์ด/แผงต้องเห็นว่ารายไหนไม่ครบหรือเบอร์ซ้ำกับใคร (ไม่ใช่แค่หน้าตัวอย่าง)
//   คำนวณจากข้อมูลจริง (lib/prospectSheetSync) · แก้ชื่อ/เบอร์ให้ครบแล้วป้ายหายเอง
import type { CSSProperties } from "react";

export function ProspectDataTags({ ไม่ครบ, ซ้ำกับ, บนพื้นเข้ม = false, style }: {
  /** เหตุที่ไม่ครบ ("ไม่มีชื่อ" · "ไม่มีเบอร์" · "เบอร์ไม่ครบ") · ครบ = [] */
  ไม่ครบ: string[];
  /** ชื่อรายอื่นที่เบอร์เดียวกัน · ไม่ซ้ำ = undefined/[] */
  ซ้ำกับ?: string[];
  บนพื้นเข้ม?: boolean;
  style?: CSSProperties;
}) {
  if (!ไม่ครบ.length && !ซ้ำกับ?.length) return null;
  const ป้าย = (สี: "amber" | "red"): CSSProperties => ({
    fontSize: "0.64rem", fontWeight: 700, borderRadius: 6, padding: "1px 6px", whiteSpace: "nowrap", lineHeight: 1.5,
    ...(สี === "amber" ? { color: "#b45309", background: "#fff8e6", border: "1px solid #f5d78e" } : { color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca" }),
    ...(บนพื้นเข้ม ? { boxShadow: "0 0 0 1px rgba(255,255,255,.35)" } : {}),
  });
  const ชื่อซ้ำ = (ซ้ำกับ ?? []).slice(0, 3).join(", ") + ((ซ้ำกับ?.length ?? 0) > 3 ? ` และอีก ${(ซ้ำกับ!.length - 3).toLocaleString()} ราย` : "");
  return (
    <span data-prospect-tags style={{ display: "inline-flex", gap: 4, flexWrap: "wrap", alignItems: "center", ...style }}>
      {ไม่ครบ.length > 0 && <span data-tag="incomplete" title={ไม่ครบ.join(" · ")} style={ป้าย("amber")}>ข้อมูลไม่ครบ: {ไม่ครบ.join(" · ")}</span>}
      {!!ซ้ำกับ?.length && <span data-tag="phone-dup" title={`เบอร์เดียวกับ ${ชื่อซ้ำ}`} style={ป้าย("red")}>เบอร์ซ้ำกับ {ชื่อซ้ำ}</span>}
    </span>
  );
}
