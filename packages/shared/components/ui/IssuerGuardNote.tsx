"use client";

// ── ป้ายบอกเหตุผลที่ส่ง/พิมพ์ใบให้ลูกค้าไม่ได้ (ข้อมูลบริษัทยังไม่ครบ · บอสสั่ง · ใบ 0247) ───────────────────────
//   วางคู่กับปุ่มที่ถูกปิด · บอกช่องที่ขาด + ลิงก์ไปกรอกที่หน้าตั้งค่า · data-issuer-guard ให้ข้อทดสอบหาเจอ
import Link from "next/link";
import { NoticeBox } from "@pms/shared/components/ui/NoticeBox";
import { ลิงก์ข้อมูลบริษัท } from "@pms/shared/lib/issuerComplete";

export function IssuerGuardNote({ ขาด, การกระทำ, หมายเหตุ, style }: { ขาด: string[]; การกระทำ: string; หมายเหตุ?: string; style?: React.CSSProperties }) {
  if (ขาด.length === 0) return null;
  return (
    <NoticeBox data-issuer-guard="" style={style} title={`${การกระทำ}ไม่ได้ — กรอกข้อมูลบริษัทให้ครบก่อน`}>
      {" "}(ยังขาด: {ขาด.join(" · ")}){หมายเหตุ ? ` · ${หมายเหตุ}` : ""}
      {" "}<Link href={ลิงก์ข้อมูลบริษัท} style={{ color: "#003366", fontWeight: 700, textDecoration: "underline" }}>ไปกรอกข้อมูลบริษัท</Link>
    </NoticeBox>
  );
}
