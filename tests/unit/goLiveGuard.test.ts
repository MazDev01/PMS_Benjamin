import { describe, it, expect } from "vitest";
// @ts-expect-error — ไฟล์ .mjs ของสคริปต์ไม่มีชนิดข้อมูล
import { ตรวจระบบเปิดใช้จริง } from "../../scripts/lib/goLiveGuard.mjs";

// ── ตัวกันของ go-live-reset (บอสสั่ง 19 ต.ค. 69) ─────────────────────────────────────────────────────────────
//   go-live-reset อ่านค่าเชื่อมต่อฐานจริงอย่างเดียว (ไม่มีทางชี้ฐานในเครื่อง — จงใจ เพราะเป็นเครื่องมือลบข้อมูล)
//   จึงแยกเงื่อนไขเป็นฟังก์ชันแล้วทดสอบที่นี่ · ตัวจำลองบันทึกคำสั่งที่ถูกเรียกไว้ ตรวจว่าตัวกันอ่านอย่างเดียว
type ผลนับ = { count: number | null; error: { message: string } | null };
function ฐานจำลอง(ผล: ผลนับ) {
  const เรียก: string[] = [];
  const q = {
    select: (cols: string, opt: { count: string; head: boolean }) => { เรียก.push(`select ${cols} ${opt.count} head=${opt.head}`); return q; },
    not: (col: string, op: string, v: string) => { เรียก.push(`not ${col} ${op} ${v}`); return Promise.resolve(ผล); },
    delete: () => { เรียก.push("delete"); return q; }, update: () => { เรียก.push("update"); return q; },
    insert: () => { เรียก.push("insert"); return q; }, upsert: () => { เรียก.push("upsert"); return q; },
  };
  return { svc: { from: (t: string) => { เรียก.push(`from ${t}`); return q; } }, เรียก };
}

describe("ตรวจระบบเปิดใช้จริง (go-live-reset)", () => {
  it("มีคำขอราคาของดีลเลอร์จริง 1 แถว → หยุด · อ่านอย่างเดียว (นับแถว ไม่ลบ/แก้)", async () => {
    const { svc, เรียก } = ฐานจำลอง({ count: 1, error: null });
    const ผล = await ตรวจระบบเปิดใช้จริง(svc);
    expect(ผล.หยุด).toBe(true);
    expect(ผล.จำนวน).toBe(1);
    expect(เรียก).toEqual(["from quote_requests", "select id exact head=true", "not dealer_code like ZZ%"]);
  });
  it("ไม่มีคำขอของดีลเลอร์จริง (มีแต่สาขาทดสอบ ZZ) → ไม่หยุด", async () => {
    const { svc } = ฐานจำลอง({ count: 0, error: null });
    expect(await ตรวจระบบเปิดใช้จริง(svc)).toMatchObject({ หยุด: false, จำนวน: 0 });
  });
  it("ตรวจไม่ได้ (ฐานตอบผิดพลาด) → หยุดไว้ก่อน", async () => {
    const { svc } = ฐานจำลอง({ count: null, error: { message: "timeout" } });
    expect(await ตรวจระบบเปิดใช้จริง(svc)).toMatchObject({ หยุด: true, จำนวน: null });
  });
});
