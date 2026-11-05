"use client";
// ── สถานะย่อยหลังส่งใบของผู้สนใจหลายราย (บอสสั่ง 5 พ.ย. 69 · ตัวกลาง prospectJourney.ขั้นย่อยหลังส่งใบ) ─────────────────────
//   ใช้ร่วม: ตาราง · ตัวกรอง · การ์ดสรุป · แผงผู้สนใจ · หน้าภาพรวม — ทุกที่คิดจากชุดเดียวกัน
//   โหลดใบทั้งหมด 1 ครั้ง + การชำระเฉพาะใบที่ตอบรับของรายที่อยู่ขั้นหลังส่งใบ · ยอดชำระ = ไม่นับรายการที่ยกเลิก (ตรงกับ dealer_proposal_paid_total)
//   โหลดไม่สำเร็จ = ไม่มีสถานะย่อย (ป้ายใช้ชื่อขั้นหลัก) + บันทึกข้อผิดพลาด — ไม่เดาว่าจ่ายครบ
import { useEffect, useState } from "react";
import { proposals as proposalsRepo } from "@pms/shared/lib/data";
import type { DealerPackageProposal, DealerProspect } from "@pms/shared/lib/data/types";
import { ขั้นย่อยหลังส่งใบ, type ขั้นย่อยใบ } from "@pms/shared/lib/prospectJourney";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { ยังติดตามอยู่ } from "@pms/shared/lib/dealerProspects";

export async function โหลดสถานะย่อย(ราย: readonly Pick<DealerProspect, "id" | "status">[]): Promise<Map<number, ขั้นย่อยใบ>> {
  const หลังส่ง = ราย.filter(r => ยังติดตามอยู่(r.status));   // ความพร้อมคิดจากใบ ไม่ขึ้นกับขั้น (แบบ dealer_conversion_ready)
  const ผล = new Map<number, ขั้นย่อยใบ>();
  if (!หลังส่ง.length) return ผล;
  const ทุกใบ = await proposalsRepo.list();
  const ของราย = new Map<number, DealerPackageProposal[]>();
  for (const p of ทุกใบ) ของราย.set(p.prospectId, [...(ของราย.get(p.prospectId) ?? []), p]);
  const ตอบรับ = หลังส่ง.flatMap(r => (ของราย.get(r.id) ?? []).filter(p => p.status === "accepted"));
  const ชำระ = new Map<number, number>(await Promise.all(ตอบรับ.map(async p =>
    [p.id, (await proposalsRepo.payments(p.id)).filter(x => !x.cancelledAt).reduce((s, x) => s + Number(x.amount), 0)] as [number, number])));
  for (const r of หลังส่ง) {
    const ย่อย = ขั้นย่อยหลังส่งใบ(r.status, ของราย.get(r.id) ?? [], ชำระ);
    if (ย่อย) ผล.set(r.id, ย่อย);
  }
  return ผล;
}

/** สถานะย่อยของรายที่ส่งมา — คำนวณใหม่เมื่อรายการ/รุ่นเปลี่ยน (ส่ง รุ่น = ตัวนับที่เพิ่มเมื่อมีการชำระ/เปลี่ยนสถานะใบ) */
export function useProspectSubStages(ราย: readonly Pick<DealerProspect, "id" | "status">[], รุ่น = 0) {
  const [ย่อย, setย่อย] = useState<Map<number, ขั้นย่อยใบ>>(new Map());
  const [โหลดแล้ว, setโหลดแล้ว] = useState(false);   // ยังไม่โหลด = ไม่บอกว่าพร้อม/ไม่พร้อม (ปุ่มรอผล ไม่เดา)
  const กุญแจ = ราย.filter(r => ยังติดตามอยู่(r.status)).map(r => `${r.id}:${r.status}`).join(",");
  useEffect(() => {
    let ยังอยู่ = true;
    โหลดสถานะย่อย(ราย).then(m => { if (ยังอยู่) { setย่อย(m); setโหลดแล้ว(true); } })
      .catch(e => { logRepoRead("prospects.subStages", e); if (ยังอยู่) { setย่อย(new Map()); setโหลดแล้ว(false); } });
    return () => { ยังอยู่ = false; };
  }, [กุญแจ, รุ่น]);   // eslint-disable-line react-hooks/exhaustive-deps
  return { ย่อย, โหลดแล้ว };
}
