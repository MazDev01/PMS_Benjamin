// ดึงผู้สนใจจาก Google Sheets อัตโนมัติ (ใบ 0295 · บอสสั่ง 23 พ.ย. 69) — ตรรกะล้วน + ตัวดึงหนึ่งรอบด้วยชีตจำลอง/ฐานจำลอง
//   ตกบนโค้ดก่อนแก้: ไม่มี lib/prospectSheetSync · server/prospectSheetSync
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { สร้างไฟล์Xlsx } from "../../packages/shared/lib/exportWorkbook";
import { หัวไฟล์เฟซบุ๊ก } from "../../packages/shared/lib/facebookLeadImport";
import { เตือนตัวตั้งเวลา, วันเวลาไทย, ข้อมูลไม่ครบของราย, แผนที่เบอร์ซ้ำ, type สถานะดึงชีต } from "../../packages/shared/lib/prospectSheetSync";
import { ดึงชีตรอบเดียว } from "../../packages/shared/server/prospectSheetSync";

const ฐาน: สถานะดึงชีต = { url: "https://docs.google.com/spreadsheets/d/ZZTESTzzzzzzzzzzzzzzzzzzzzzz/edit", enabled: true, updatedBy: "ZZ", updatedAt: "2026-11-23T01:00:00Z",
  lastRunAt: null, lastOk: null, lastResult: "", lastBatch: null, lastTickAt: null, lastTickNote: "", running: false, now: "2026-11-23T05:00:00Z" };

describe("สถานะตัวตั้งเวลา (คนรวมงาน 23 พ.ย. 69: ไม่ทำงานต้องเห็นบนจอ)", () => {
  it("ปิดอยู่ = ไม่เตือน", () => expect(เตือนตัวตั้งเวลา({ ...ฐาน, enabled: false })).toBeNull());
  it("เปิดแต่ตัวตั้งเวลาไม่เคยทำงาน = เตือน", () => expect(เตือนตัวตั้งเวลา(ฐาน)).toContain("ยังไม่เคยทำงาน"));
  it("ค่าระบบไม่ครบ = เตือน", () => expect(เตือนตัวตั้งเวลา({ ...ฐาน, lastTickAt: "2026-11-23T04:07:00Z", lastTickNote: "ตั้งค่าระบบไม่ครบ" })).toContain("ตั้งค่าระบบไม่ครบ"));
  it("ตัวตั้งเวลาเงียบเกิน 2 ชั่วโมง = เตือน", () =>
    expect(เตือนตัวตั้งเวลา({ ...ฐาน, lastTickAt: "2026-11-23T02:07:00Z", lastTickNote: "ส่งคำขอแล้ว", lastRunAt: "2026-11-23T02:07:30Z" })).toContain("หยุดทำงาน"));
  it("ตัวตั้งเวลาเรียกแล้วแต่เว็บไม่จดผลภายใน 15 นาที = เตือนรหัสลับ", () =>
    expect(เตือนตัวตั้งเวลา({ ...ฐาน, lastTickAt: "2026-11-23T04:07:00Z", lastTickNote: "ส่งคำขอแล้ว", lastRunAt: null })).toContain("CRON_SECRET"));
  it("ทำงานปกติ = ไม่เตือน", () =>
    expect(เตือนตัวตั้งเวลา({ ...ฐาน, lastTickAt: "2026-11-23T04:07:00Z", lastTickNote: "ส่งคำขอแล้ว", lastRunAt: "2026-11-23T04:07:20Z", lastOk: true })).toBeNull());
  it("วันเวลาไทย", () => expect(วันเวลาไทย("2026-11-23T07:05:00Z")).toBe("23 พ.ย. 2569 14:05"));
});

describe("ป้ายผู้สนใจ ข้อมูลไม่ครบ / เบอร์ซ้ำ (บอสสั่ง 23 พ.ย. 69)", () => {
  it("ไม่มีชื่อ · ไม่มีเบอร์ · เบอร์ไม่ครบ", () => {
    expect(ข้อมูลไม่ครบของราย({ id: 1, name: "(ไม่มีชื่อ)", phone: "000-000-0001" })).toEqual(["ไม่มีชื่อ"]);
    expect(ข้อมูลไม่ครบของราย({ id: 1, name: "ZZ", phone: null })).toEqual(["ไม่มีเบอร์"]);
    expect(ข้อมูลไม่ครบของราย({ id: 1, name: "ZZ", phone: "0000" })).toEqual(["เบอร์ไม่ครบ"]);
    expect(ข้อมูลไม่ครบของราย({ id: 1, name: "ZZ", phone: "000-000-0001" })).toEqual([]);
  });
  it("เบอร์ซ้ำ = ชื่อรายอื่นที่เบอร์เดียวกัน (เทียบตัวเลขล้วน)", () => {
    const m = แผนที่เบอร์ซ้ำ([{ id: 1, name: "ZZ ก", phone: "000-000-0001" }, { id: 2, name: "ZZ ข", phone: "0000000001" }, { id: 3, name: "ZZ ค", phone: "000-000-0003" }, { id: 4, name: "ZZ ง", phone: null }]);
    expect(m.get(1)).toEqual(["ZZ ข"]);
    expect(m.get(2)).toEqual(["ZZ ก"]);
    expect(m.has(3)).toBe(false);
    expect(m.has(4)).toBe(false);
  });
});

// ── ตัวดึงหนึ่งรอบ: ฐานจำลอง (บันทึกคำสั่งที่เรียก) + ชีตจำลอง (fetcher คืนไฟล์ .xlsx) ──
function ฐานจำลอง(งาน: Record<string, unknown>, กุญแจ: string[] = []) {
  const เรียก: { fn: string; args: Record<string, unknown> }[] = [];
  const admin = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      เรียก.push({ fn, args });
      if (fn === "_prospect_sheet_claim") return { data: งาน, error: null };
      if (fn === "_prospect_sheet_import") return { data: { batch: 77, inserted: (args.p_rows as unknown[]).length, skipped: [], already: 0 }, error: null };
      return { data: null, error: null };
    },
    from: () => ({ select: () => ({ order: () => ({ range: async () => ({ data: กุญแจ.map(key => ({ key })), error: null }) }) }) }),
  } as unknown as SupabaseClient;
  return { admin, เรียก };
}
async function ชีตจำลอง(แถว: string[][]): Promise<typeof fetch> {
  const ไฟล์ = await สร้างไฟล์Xlsx([{ ชื่อ: "11.26", หัวตาราง: [...หัวไฟล์เฟซบุ๊ก], แถว }]).arrayBuffer();
  return (async () => new Response(ไฟล์, { status: 200, headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } })) as unknown as typeof fetch;
}
const ลิงก์ = "https://docs.google.com/spreadsheets/d/ZZTESTzzzzzzzzzzzzzzzzzzzzzz/edit";

describe("ดึงชีตรอบเดียว (ทางเดียวกับนำเข้าเอง)", () => {
  it("ปิดอยู่/กำลังดึง = ไม่ดึง ไม่จดผล", async () => {
    for (const status of ["off", "busy", "no_url"]) {
      const { admin, เรียก } = ฐานจำลอง({ status });
      expect(await ดึงชีตรอบเดียว(admin, { กดเอง: false, ผู้ทำ: "ดึงอัตโนมัติ" })).toEqual({ สถานะ: status });
      expect(เรียก.map(x => x.fn)).toEqual(["_prospect_sheet_claim"]);
    }
  });
  it("แถวใหม่ → นำเข้าผ่านตัวห่อของระบบ (dup_ok) · ข้ามแถวที่เคยนำเข้า · แจ้งกระดิ่งเมื่ออัตโนมัติ · จดผล", async () => {
    const { admin, เรียก } = ฐานจำลอง({ status: "run", url: ลิงก์ }, ["ZZ เก่า|0000000201|2026-11-01T09:00:00"]);
    const fetcher = await ชีตจำลอง([
      ["2026-11-01T09:00:00+07:00", "ZZ", "ตราด", "", "ZZ เก่า", "p:+66000000201"],
      ["2026-11-02T09:00:00+07:00", "ZZ", "ตราด", "", "ZZ ใหม่", "p:+66000000201"],
      ["2026-11-02T10:00:00+07:00", "ZZ", "ตราด", "", "", "p:+66000000202"],
    ]);
    const ผล = await ดึงชีตรอบเดียว(admin, { กดเอง: false, ผู้ทำ: "ดึงอัตโนมัติ", fetcher });
    expect(ผล).toMatchObject({ สถานะ: "done", นำเข้า: 2, เคยนำเข้า: 1, ชุด: 77 });
    const นำเข้า = เรียก.find(x => x.fn === "_prospect_sheet_import")!;
    expect(นำเข้า.args).toMatchObject({ p_actor: "ดึงอัตโนมัติ", p_notify: true });
    expect((นำเข้า.args.p_rows as { name: string; dup_ok: boolean }[]).map(r => [r.name, r.dup_ok])).toEqual([["ZZ ใหม่", true], ["", true]]);
    expect(เรียก.at(-1)).toMatchObject({ fn: "_prospect_sheet_finish", args: { p_ok: true, p_batch: 77, p_manual: false } });
    expect(String(เรียก.at(-1)!.args.p_result)).toContain("นำเข้า 2 ราย");
  });
  it("กดดึงตอนนี้ = ไม่แจ้งกระดิ่ง · ไม่มีแถวใหม่ = ไม่สร้างชุด", async () => {
    const { admin, เรียก } = ฐานจำลอง({ status: "run", url: ลิงก์ }, ["ZZ เก่า|0000000201|2026-11-01T09:00:00"]);
    const fetcher = await ชีตจำลอง([["2026-11-01T09:00:00+07:00", "ZZ", "ตราด", "", "ZZ เก่า", "p:+66000000201"]]);
    const ผล = await ดึงชีตรอบเดียว(admin, { กดเอง: true, ผู้ทำ: "ZZ ผู้ดูแล", fetcher });
    expect(ผล).toMatchObject({ สถานะ: "done", นำเข้า: 0, ชุด: null });
    expect(เรียก.some(x => x.fn === "_prospect_sheet_import")).toBe(false);
    expect(เรียก.at(-1)).toMatchObject({ fn: "_prospect_sheet_finish", args: { p_ok: true, p_manual: true } });
  });
  it("ชีตไม่เปิดแชร์ = ไม่นำเข้า + จดผลไม่สำเร็จ (ฐานเตือนวันละครั้ง)", async () => {
    const { admin, เรียก } = ฐานจำลอง({ status: "run", url: ลิงก์ });
    const fetcher = (async () => new Response(null, { status: 302, headers: { location: "https://accounts.google.com/x" } })) as unknown as typeof fetch;
    const ผล = await ดึงชีตรอบเดียว(admin, { กดเอง: false, ผู้ทำ: "ดึงอัตโนมัติ", fetcher });
    expect(ผล).toMatchObject({ สถานะ: "failed" });
    expect(เรียก.some(x => x.fn === "_prospect_sheet_import")).toBe(false);
    expect(เรียก.at(-1)).toMatchObject({ fn: "_prospect_sheet_finish", args: { p_ok: false, p_manual: false } });
    expect(String(เรียก.at(-1)!.args.p_result)).toContain("ทุกคนที่มีลิงก์ดูได้");
  });
  it("ชีตไม่ใช่หัวตาราง Facebook = ไม่นำเข้า", async () => {
    const { admin, เรียก } = ฐานจำลอง({ status: "run", url: ลิงก์ });
    const ไฟล์ = await สร้างไฟล์Xlsx([{ ชื่อ: "a", หัวตาราง: ["ชื่อ", "เบอร์"], แถว: [["ZZ", "0"]] }]).arrayBuffer();
    const fetcher = (async () => new Response(ไฟล์, { status: 200 })) as unknown as typeof fetch;
    expect(await ดึงชีตรอบเดียว(admin, { กดเอง: false, ผู้ทำ: "x", fetcher })).toMatchObject({ สถานะ: "failed" });
    expect(เรียก.some(x => x.fn === "_prospect_sheet_import")).toBe(false);
  });
});
