// ── ตัวกรองสถานะหน้าใบค่าแฟรนไชส์ HQ: ค่าตัวเลือกต้องไม่ซ้ำ (16 พ.ย. 69 · hq-proposals.spec ตกในโหมด dev · ตกบน e4bdb10a ด้วย) ──
//   เดิมตัวเลือกคำนวณ "ส่งแล้ว · เลยวันมีผล" ใช้ค่า "expired" ซ้ำกับสถานะ expired ของฐาน → React เตือน key ซ้ำ
//   และเลือกสถานะ "หมดอายุแล้ว" ได้ผลแบบคำนวณแทนสถานะจริง
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PROPOSAL_STATUS_ORDER } from "@pms/shared/lib/dealerProposals";

describe("ตัวกรองสถานะใบค่าแฟรนไชส์ ค่าไม่ซ้ำ", () => {
  it("ค่าของตัวเลือกคำนวณไม่ชนสถานะของฐาน", () => {
    const s = readFileSync("apps/hq/app/(app)/hq/proposals/page.tsx", "utf8");
    const ค่าคำนวณ = /\{ v: "([a-z_]+)", l: "ส่งแล้ว · เลยวันมีผล" \}/.exec(s)?.[1];
    expect(ค่าคำนวณ, "เจอตัวเลือกคำนวณ").toBeTruthy();
    expect((PROPOSAL_STATUS_ORDER as readonly string[]).includes(ค่าคำนวณ!)).toBe(false);
    expect(s).toContain(`statusFilter === "${ค่าคำนวณ}" ? !หมดอายุแล้ว(p, APP_NOW_ISO)`);
  });
});
