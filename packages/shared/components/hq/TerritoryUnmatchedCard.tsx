"use client";

// ── ดีลเลอร์ที่ยังไม่มีพื้นที่ (จังหวัดในทะเบียนสะกดไม่ตรงรายชื่อมาตรฐาน · ใบ 0195) ─────────────────────
//
// เดิมการ์ดนี้ชื่อ "พื้นที่ทับซ้อน" (กฎหนึ่งจังหวัด หนึ่งดีลเลอร์) — ใบ 0214 ยกเลิกกฎนั้นแล้ว (บอสสั่ง 16 ต.ค. 69)
//   จังหวัดเดียวมีดีลเลอร์ได้ไม่จำกัดสาขา จึงไม่มี "ทับซ้อน" ให้เคลียร์อีก — เหลือเฉพาะเรื่องจังหวัดสะกดไม่ตรง
// ระบบไม่เดาจับคู่ให้ · ไม่มีรายการ = ไม่แสดงการ์ด
import { useEffect, useState } from "react";
import { MapPinned } from "lucide-react";
import { territories as territoriesRepo } from "@pms/shared/lib/data";
import type { UnmatchedDealer } from "@pms/shared/lib/data/ports";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { NoticeBox } from "@pms/shared/components/ui/NoticeBox";

export function TerritoryUnmatchedCard() {
  const [ไม่ตรง, setไม่ตรง] = useState<UnmatchedDealer[]>([]);
  useEffect(() => {
    territoriesRepo.unmatched().then(setไม่ตรง).catch(e => logRepoRead("territories.unmatched", e));
  }, []);
  if (!ไม่ตรง.length) return null;

  return (
    // กล่องแจ้งเตือนกลาง (บอสสั่ง 29 ต.ค. 69) — ไม่เขียนกล่องเตือนเอง
    <NoticeBox icon={MapPinned} data-territory-unmatched="" title={`ดีลเลอร์ที่ยังไม่มีพื้นที่ ${ไม่ตรง.length} ราย`}>
      {" "}— จังหวัดในทะเบียนสะกดไม่ตรงรายชื่อ 77 จังหวัด ระบบไม่เดาให้ แก้จังหวัดในข้อมูลดีลเลอร์ให้ตรงรายชื่อ:
      <div style={{ marginTop: 4 }}>{ไม่ตรง.map(u => `${u.dealerCode} (${u.province || "ไม่ได้ระบุ"})`).join(" · ")}</div>
    </NoticeBox>
  );
}
