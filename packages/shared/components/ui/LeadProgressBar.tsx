"use client";

// ── แถบความคืบหน้าของลีด (ตารางลูกค้าเป้าหมาย ดีลเลอร์ + HQ) — แถบ 5 ช่อง + % · ตัวคิด lib/leadProgress.ts ─────────
import { ความคืบหน้าลีด, เลขขั้นแถวลีด } from "@pms/shared/lib/leadProgress";
import { สีขั้น } from "@pms/shared/lib/leadStage";
import type { LeadRow } from "@pms/shared/lib/mock";

export function LeadProgressBar({ l, มีใบร่าง }: { l: Pick<LeadRow, "status" | "reachedStep" | "stageNo">; มีใบร่าง: boolean }) {
  const ค = ความคืบหน้าลีด(l, มีใบร่าง);
  const สี = สีขั้น(เลขขั้นแถวลีด(l, มีใบร่าง));
  return (
    <div role="img" aria-label={`ความคืบหน้า ${ค.เปอร์เซ็นต์}%${ค.ปิดไม่สำเร็จ ? " · ปิดไม่สำเร็จ" : ""}`} data-progress={ค.เปอร์เซ็นต์}
      title={`${ค.ขั้น} จาก 5 ขั้น${ค.ปิดไม่สำเร็จ ? " · ปิดไม่สำเร็จ" : ""}`} style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 2, flex: 1, maxWidth: 90 }}>
        {[1, 2, 3, 4, 5].map(k => <span key={k} style={{ height: 4, borderRadius: 99, background: k <= ค.ขั้น ? สี.bar : "#e5e7eb" }} />)}
      </span>
      <span style={{ fontSize: "0.66rem", fontWeight: 700, color: ค.ปิดไม่สำเร็จ ? สี.text : "#374151", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{ค.เปอร์เซ็นต์}%</span>
    </div>
  );
}
