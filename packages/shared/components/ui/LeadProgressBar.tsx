"use client";

// ── แถบความคืบหน้าของลีด (ตารางลูกค้าเป้าหมาย ดีลเลอร์ + HQ) — แถบ 4 ช่อง + % (ยุบ 4 ขั้น 9 พ.ย. 69) · ตัวคิด lib/leadProgress.ts ─────────
//   วาดด้วยแถบตัวกลาง StepProgressBar (ตัวเดียวกับการ์ดบอร์ดผู้สนใจ · บอสสั่ง 13 พ.ย. 69)
import { ความคืบหน้าลีด, เลขขั้นแถวลีด } from "@pms/shared/lib/leadProgress";
import { สีขั้น, จำนวนขั้น } from "@pms/shared/lib/leadStage";
import type { LeadRow } from "@pms/shared/lib/mock";
import { StepProgressBar } from "@pms/shared/components/ui/BoardCard";

export function LeadProgressBar({ l, มีใบร่าง }: { l: Pick<LeadRow, "status" | "reachedStep" | "stageNo">; มีใบร่าง: boolean }) {
  const ค = ความคืบหน้าลีด(l, มีใบร่าง);
  const สี = สีขั้น(เลขขั้นแถวลีด(l, มีใบร่าง));
  return <StepProgressBar ขั้น={ค.ขั้น} จำนวนขั้น={จำนวนขั้น} เปอร์เซ็นต์={ค.เปอร์เซ็นต์} สีแถบ={สี.bar}
    สีตัวเลข={ค.ปิดไม่สำเร็จ ? สี.text : "#374151"} ป้าย={ค.ปิดไม่สำเร็จ ? "ปิดไม่สำเร็จ" : undefined} />;
}
