"use client";

// ── ป้ายบอกเหตุผลที่ส่ง/พิมพ์ใบให้ลูกค้าไม่ได้ (ข้อมูลบริษัทยังไม่ครบ · บอสสั่ง · ใบ 0247) ───────────────────────
//   วางคู่กับปุ่มที่ถูกปิด · บอกช่องที่ขาด + ลิงก์ไปกรอกที่หน้าตั้งค่า · data-issuer-guard ให้ข้อทดสอบหาเจอ
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { ลิงก์ข้อมูลบริษัท } from "@pms/shared/lib/issuerComplete";

export function IssuerGuardNote({ ขาด, การกระทำ, หมายเหตุ, style }: { ขาด: string[]; การกระทำ: string; หมายเหตุ?: string; style?: React.CSSProperties }) {
  if (ขาด.length === 0) return null;
  return (
    <div role="note" data-issuer-guard style={{ display: "flex", alignItems: "flex-start", gap: 9, background: "#fff8e6", border: "1px solid #f5d78e",
      borderRadius: 10, padding: "10px 12px", fontSize: "0.76rem", color: "#7a5b12", lineHeight: 1.55, ...style }}>
      <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden />
      <div>
        <b>{การกระทำ}ไม่ได้ — กรอกข้อมูลบริษัทให้ครบก่อน</b> (ยังขาด: {ขาด.join(" · ")}){หมายเหตุ ? ` · ${หมายเหตุ}` : ""}
        {" "}<Link href={ลิงก์ข้อมูลบริษัท} style={{ color: "#003366", fontWeight: 700, textDecoration: "underline" }}>ไปกรอกข้อมูลบริษัท</Link>
      </div>
    </div>
  );
}
