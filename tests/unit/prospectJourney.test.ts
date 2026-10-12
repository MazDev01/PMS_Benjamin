import { describe, it, expect } from "vitest";
import {
  งานมาตรฐาน, งานเสร็จแล้ว, ความคืบหน้า, ติ๊กงาน, ยกเลิกงาน, ตรวจเปลี่ยนขั้น, ขั้นก่อนไม่สำเร็จ,
  ข้อความเปลี่ยนขั้น, ข้อความเพิ่มราย, ข้อความใบเสนอ, ข้อความถอยเพราะใบถูกปฏิเสธ, วันที่ไม่ได้ติดต่อ, ไม่ได้ติดต่อเกิน, ติดต่อล่าสุดอ่านง่าย,
  เตรียมบันทึกการติดต่อ, ตรวจบันทึกการติดต่อ, มีบันทึกการติดต่อ, วันไทยของเวลา,
} from "../../packages/shared/lib/prospectJourney";
import type { ProspectActivity } from "../../packages/shared/lib/data/types";

// เส้นทางการทำงานของลูกค้าเป้าหมาย (HQ) — บอสสั่ง 14 ก.ย. 69 "ออกแบบการทำออกมาใช้งานให้เสร็จ"
const มีครบ = { มีบันทึกการติดต่อ: true, มีใบส่งแล้ว: true };
const ประวัติ = (x: Partial<ProspectActivity>): ProspectActivity =>
  ({ id: 1, prospectId: 1, kind: "status", body: "-", actor: "a", createdAt: "2026-09-14T03:00:00Z", ...x });

describe("ใบถูกปฏิเสธแล้วถอยขั้น (0177)", () => {
  it("ข้อความประวัติตรงกับตัวดักของฐานข้อมูล", () => {
    expect(ข้อความถอยเพราะใบถูกปฏิเสธ("DP-2026-0007")).toBe("ใบค่าแฟรนไชส์ DP-2026-0007 ถูกปฏิเสธ → กลับไปนัดคุยแล้ว");
  });
});

describe("งานตามขั้น", () => {
  it("มี 4 งาน เรียงตามขั้นจริงของทีม · งานติดต่อ/ใบเสนอ ต้องมีของจริง", () => {
    expect(งานมาตรฐาน.map(g => g.ไปขั้น)).toEqual(["contacted", "profile_sent", "meeting", "considering"]);
    expect(งานมาตรฐาน[0].หลักฐาน).toBe("contact");
    expect(งานมาตรฐาน[3].หลักฐาน).toBe("proposal");
  });

  it("ความคืบหน้าคิดจากขั้น ช่วงละ 20% · จบแล้ว 100%", () => {
    expect(ความคืบหน้า("new")).toBe(0);
    expect(ความคืบหน้า("meeting")).toBe(60);
    expect(ความคืบหน้า("considering")).toBe(80);
    expect(ความคืบหน้า("won")).toBe(100);
    expect(ความคืบหน้า("lost")).toBe(100);
  });

  it("งานเสร็จแล้ว ตามขั้น · เป็นดีลเลอร์แล้ว = ครบทุกงาน", () => {
    expect(งานเสร็จแล้ว("profile_sent", 1)).toBe(true);
    expect(งานเสร็จแล้ว("profile_sent", 2)).toBe(false);
    expect(งานเสร็จแล้ว("won", 3)).toBe(true);
  });

  it("ติ๊กได้เฉพาะงานถัดไป — ห้ามข้ามขั้น", () => {
    expect(ติ๊กงาน("contacted", 1, มีครบ)).toEqual({ ขั้นใหม่: "profile_sent" });
    expect(ติ๊กงาน("contacted", 2, มีครบ)).toHaveProperty("ผิด");
    expect(ติ๊กงาน("meeting", 0, มีครบ)).toEqual({ ผิด: "งานนี้ทำแล้ว" });
  });

  it("งานที่ต้องมีของจริง: ยังไม่มี = พาไปทำของจริง ไม่ติ๊กให้", () => {
    expect(ติ๊กงาน("new", 0, { มีบันทึกการติดต่อ: false, มีใบส่งแล้ว: false })).toEqual({ ต้องทำก่อน: "contact" });
    expect(ติ๊กงาน("meeting", 3, { มีบันทึกการติดต่อ: true, มีใบส่งแล้ว: false })).toEqual({ ต้องทำก่อน: "proposal" });
    expect(ติ๊กงาน("meeting", 3, มีครบ)).toEqual({ ขั้นใหม่: "considering" });
  });

  it("รายที่ปิดแล้ว ติ๊ก/ยกเลิกไม่ได้", () => {
    expect(ติ๊กงาน("lost", 0, มีครบ)).toHaveProperty("ผิด");
    expect(ยกเลิกงาน("won", 3)).toHaveProperty("ผิด");
  });

  it("ยกเลิกได้เฉพาะงานล่าสุด ถอยทีละขั้น", () => {
    expect(ยกเลิกงาน("meeting", 2)).toEqual({ ขั้นใหม่: "profile_sent" });
    expect(ยกเลิกงาน("meeting", 1)).toHaveProperty("ผิด");
  });
});

describe("ตรวจเปลี่ยนขั้น (ชุดเดียวกับตัวดักฐานข้อมูล 0174)", () => {
  const ไม่มีใบ = { มีใบส่งแล้ว: false };
  it("ทีละขั้น เดินหน้า/ถอยหลังได้ · ข้ามขั้นไม่ได้", () => {
    expect(ตรวจเปลี่ยนขั้น("new", "contacted", ไม่มีใบ)).toBeNull();
    expect(ตรวจเปลี่ยนขั้น("meeting", "profile_sent", ไม่มีใบ)).toBeNull();
    expect(ตรวจเปลี่ยนขั้น("new", "meeting", ไม่มีใบ)).toMatch(/ห้ามข้ามขั้น/);
  });
  it("รอตัดสินใจ ต้องมีใบเสนอที่ส่งแล้ว", () => {
    expect(ตรวจเปลี่ยนขั้น("meeting", "considering", ไม่มีใบ)).toMatch(/ใบค่าแฟรนไชส์/);
    expect(ตรวจเปลี่ยนขั้น("meeting", "considering", { มีใบส่งแล้ว: true })).toBeNull();
  });
  it("ปิดไม่สำเร็จได้ทุกขั้น · เปิดใหม่ไปขั้นเดิมได้ · เป็นดีลเลอร์แล้วเปลี่ยนไม่ได้ · เป็นดีลเลอร์ต้องมีรหัส", () => {
    expect(ตรวจเปลี่ยนขั้น("new", "lost", ไม่มีใบ)).toBeNull();
    expect(ตรวจเปลี่ยนขั้น("lost", "meeting", ไม่มีใบ)).toBeNull();
    expect(ตรวจเปลี่ยนขั้น("won", "meeting", ไม่มีใบ)).toMatch(/เป็นดีลเลอร์แล้ว/);
    expect(ตรวจเปลี่ยนขั้น("considering", "won", ไม่มีใบ)).toMatch(/ต้องผูก/);
    expect(ตรวจเปลี่ยนขั้น("considering", "won", { มีใบส่งแล้ว: true, dealerCode: "RYG" })).toBeNull();
  });
});

describe("เปิดติดตามใหม่", () => {
  it("กลับไปขั้นก่อนปิด จากประวัติล่าสุด", () => {
    const list = [
      ประวัติ({ id: 1, fromStatus: "contacted", toStatus: "lost", createdAt: "2026-09-01T00:00:00Z" }),
      ประวัติ({ id: 2, fromStatus: "lost", toStatus: "contacted", createdAt: "2026-09-02T00:00:00Z" }),
      ประวัติ({ id: 3, fromStatus: "profile_sent", toStatus: "lost", createdAt: "2026-09-03T00:00:00Z" }),
    ];
    expect(ขั้นก่อนไม่สำเร็จ(list, false)).toBe("profile_sent");
  });
  it("ไม่รู้ขั้นเดิม = รอติดต่อ · รอตัดสินใจแต่ไม่มีใบส่งแล้ว = นัดคุยแล้ว", () => {
    expect(ขั้นก่อนไม่สำเร็จ([], false)).toBe("new");
    expect(ขั้นก่อนไม่สำเร็จ([ประวัติ({ fromStatus: "considering", toStatus: "lost" })], false)).toBe("meeting");
    expect(ขั้นก่อนไม่สำเร็จ([ประวัติ({ fromStatus: "considering", toStatus: "lost" })], true)).toBe("considering");
  });
});

describe("ข้อความในประวัติ (ตรงกับตัวดักฐานข้อมูล)", () => {
  it("แต่ละแบบ", () => {
    expect(ข้อความเพิ่มราย("new")).toBe("เพิ่มลูกค้าเป้าหมาย");
    expect(ข้อความเพิ่มราย("meeting")).toBe("เพิ่มลูกค้าเป้าหมาย · ขั้น นัดคุยแล้ว");
    expect(ข้อความเปลี่ยนขั้น("new", "contacted", {})).toBe("รอติดต่อ → ติดต่อแล้ว");
    expect(ข้อความเปลี่ยนขั้น("meeting", "lost", { lostReason: " ไม่มีทุน " })).toBe("ปิดว่าไม่สำเร็จ · เหตุผล: ไม่มีทุน");
    expect(ข้อความเปลี่ยนขั้น("lost", "meeting", {})).toBe("เปิดติดตามใหม่ · นัดคุยแล้ว");
    expect(ข้อความเปลี่ยนขั้น("considering", "won", { dealerCode: "RYG" })).toBe("เป็นดีลเลอร์แล้ว · รหัส RYG");
    expect(ข้อความใบเสนอ("DP-2026-0001", "draft", true)).toBe("ออกใบค่าแฟรนไชส์ DP-2026-0001 · ร่าง");
    expect(ข้อความใบเสนอ("DP-2026-0001", "sent", false)).toBe("ใบค่าแฟรนไชส์ DP-2026-0001 · ส่งแล้ว");
  });
});

describe("ไม่ได้ติดต่อกี่วัน", () => {
  it("นับตามวันไทย — 23:30 UTC คือวันถัดไปของไทยแล้ว", () => {
    expect(วันไทยของเวลา("2026-09-13T23:30:00Z")).toBe("2026-09-14");
  });
  it("นับจากติดต่อล่าสุด · ไม่เคยติดต่อ นับจากวันเพิ่มรายชื่อ · ไม่มีข้อมูล = null", () => {
    expect(วันที่ไม่ได้ติดต่อ({ lastContactAt: "2026-09-07T02:00:00Z", createdAt: "2026-01-01T00:00:00Z" }, "2026-09-14")).toBe(7);
    expect(วันที่ไม่ได้ติดต่อ({ lastContactAt: null, createdAt: "2026-08-15T02:00:00Z" }, "2026-09-14")).toBe(30);
    expect(วันที่ไม่ได้ติดต่อ({}, "2026-09-14")).toBeNull();
  });
  it("ตัวกรองนับเฉพาะรายที่ยังติดตาม", () => {
    const เก่า = { lastContactAt: "2026-09-01T02:00:00Z", createdAt: "2026-09-01T02:00:00Z" };
    expect(ไม่ได้ติดต่อเกิน({ ...เก่า, status: "meeting" }, 7, "2026-09-14")).toBe(true);
    expect(ไม่ได้ติดต่อเกิน({ ...เก่า, status: "meeting" }, 14, "2026-09-14")).toBe(false);
    expect(ไม่ได้ติดต่อเกิน({ ...เก่า, status: "won" }, 7, "2026-09-14")).toBe(false);
  });
  it("ข้อความในตาราง", () => {
    expect(ติดต่อล่าสุดอ่านง่าย({ lastContactAt: null, createdAt: "2026-09-01T00:00:00Z" }, "2026-09-14")).toBe("ยังไม่เคยติดต่อ");
    expect(ติดต่อล่าสุดอ่านง่าย({ lastContactAt: "2026-09-14T01:00:00Z" }, "2026-09-14")).toBe("วันนี้");
    expect(ติดต่อล่าสุดอ่านง่าย({ lastContactAt: "2026-09-11T01:00:00Z" }, "2026-09-14")).toBe("3 วันก่อน");
  });
});

describe("บันทึกการติดต่อ", () => {
  it("จัดข้อมูล: ตัดช่องว่าง · วันที่รูปแบบผิด = ว่าง", () => {
    expect(เตรียมบันทึกการติดต่อ({ prospectId: 5, channel: " LINE ", body: "  คุยแล้ว  ", nextFollowUp: "24.8" }))
      .toEqual({ prospectId: 5, channel: "LINE", body: "คุยแล้ว", nextFollowUp: null });
  });
  it("ต้องมีช่องทางและเนื้อหา · นัดติดตามห้ามย้อนหลัง", () => {
    const ok = { prospectId: 1, channel: "โทรศัพท์", body: "สนใจ Exclusive", nextFollowUp: "2026-09-20" };
    expect(ตรวจบันทึกการติดต่อ(ok, "2026-09-14")).toBeNull();
    expect(ตรวจบันทึกการติดต่อ({ ...ok, channel: "" })).toMatch(/ช่องทาง/);
    expect(ตรวจบันทึกการติดต่อ({ ...ok, body: "" })).toMatch(/คุยอะไร/);
    expect(ตรวจบันทึกการติดต่อ({ ...ok, nextFollowUp: "2026-09-01" }, "2026-09-14")).toMatch(/ย้อนหลัง/);
    expect(ตรวจบันทึกการติดต่อ({ ...ok, prospectId: 0 })).toMatch(/ลูกค้าเป้าหมาย/);
  });
  it("มีบันทึกการติดต่อ นับเฉพาะชนิดติดต่อ", () => {
    expect(มีบันทึกการติดต่อ([{ kind: "created" }, { kind: "status" }])).toBe(false);
    expect(มีบันทึกการติดต่อ([{ kind: "contact" }])).toBe(true);
  });
});
