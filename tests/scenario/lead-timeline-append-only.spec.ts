import { test, expect } from "@playwright/test";
import { RYG, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { db } from "./funcHelpers";
import { adminClient } from "./testDealers";

// ── ไทม์ไลน์ของลูกค้าเป้าหมายต้องไม่ถูกเขียนทับ (ใบ 0192) ──────────────────────────────────
//
// บั๊กจริง (พบ 13–14 ต.ค. 69 จากข้อทดสอบ quote-versions-timeline ที่ตกเป็นครั้งคราว):
//   หน้าจอโหลด "รายการ" ลูกค้าเป้าหมายโดยไม่ดึงไทม์ไลน์มาด้วย (ประหยัดขนส่ง) แต่ตอนจดกิจกรรมใหม่
//   กลับเขียนไทม์ไลน์ทั้งก้อนจากสำเนาในหน้าจอ = [บรรทัดใหม่บรรทัดเดียว] ทับของเดิมในฐานทั้งหมด
//   ผู้ใช้เห็นประวัติของลูกค้าเป้าหมายหายเงียบ ๆ (ออกใบ → ส่งใบ → บรรทัด "ออกใบ" หาย)
// แก้ที่ฐาน: ไทม์ไลน์เป็นแบบ "ต่อท้ายอย่างเดียว" สำหรับผู้ใช้ — เขียนอะไรมาก็ลบบรรทัดเดิมไม่ได้
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");

const ID = "ZZTEST-TIMELINE-1";
const admin = adminClient();
const ล้าง = async () => { await admin.from("leads").delete().eq("dealer_code", "RYG").eq("id", ID); };
test.beforeAll(ล้าง);
test.afterAll(ล้าง);

type บรรทัด = { id: number; date: string; text: string; type: string; icon: string };
const บ = (id: number, text: string, date = "14 ต.ค. 2569 · 09:00"): บรรทัด => ({ id, date, text, type: "doc", icon: "doc" });
const อ่าน = async () => {
  const { data, error } = await admin.from("leads").select("activities").eq("dealer_code", "RYG").eq("id", ID).single();
  if (error) throw new Error(error.message);
  return (data.activities ?? []) as บรรทัด[];
};

test("[db] ดีลเลอร์เขียนไทม์ไลน์จากสำเนาที่ไม่ครบ — บรรทัดเดิมต้องอยู่ครบ บรรทัดใหม่ต่อท้าย เลขไม่ซ้ำ", async () => {
  const ins = await admin.from("leads").insert({
    id: ID, num_id: 990_000_101, dealer_code: "RYG", company: "ZZTEST-ไทม์ไลน์ต่อท้าย", name: "ZZTEST-ไทม์ไลน์ต่อท้าย",
    phone: "081-999-0111", province: "ระยอง", status: "WAITING",
    activities: [บ(1, "ออกใบเสนอราคา Q-1 (V1)"), บ(2, "ส่งใบเสนอราคา Q-1 (V1) ให้ลูกค้า")],
  });
  expect(ins.error, `เตรียมลูกค้าเป้าหมายต้องผ่าน (${ins.error?.message})`).toBeNull();
  const ryg = await db(RYG);

  // 1) สำเนาจาก "รายการ" ไม่มีไทม์ไลน์ → หน้าจอส่งมาแค่บรรทัดใหม่ และให้เลข 1 ซ้ำกับของเดิม
  const w1 = await ryg.from("leads").update({ activities: [บ(1, "แก้ไขใบเสนอราคา Q-1 เป็นฉบับ V2", "14 ต.ค. 2569 · 09:05")] }).eq("id", ID).select("id");
  expect(w1.error, `ดีลเลอร์ต้องบันทึกได้ (${w1.error?.message})`).toBeNull();
  let a = await อ่าน();
  expect(a.map(x => x.text), "บรรทัดเดิม 2 บรรทัดต้องอยู่ครบ และบรรทัดใหม่ต่อท้าย").toEqual([
    "ออกใบเสนอราคา Q-1 (V1)", "ส่งใบเสนอราคา Q-1 (V1) ให้ลูกค้า", "แก้ไขใบเสนอราคา Q-1 เป็นฉบับ V2"]);
  expect(new Set(a.map(x => x.id)).size, "เลขของบรรทัดต้องไม่ซ้ำกัน").toBe(3);

  // 2) สำเนาครบ (เปิดแผงรายละเอียดแล้ว) → ส่งของเดิมทั้งหมด + บรรทัดใหม่ · ต้องไม่งอกซ้ำ
  const w2 = await ryg.from("leads").update({ activities: [...a, บ(4, "นัดหมาย 20 ต.ค. 2569", "14 ต.ค. 2569 · 09:10")] }).eq("id", ID).select("id");
  expect(w2.error).toBeNull();
  a = await อ่าน();
  expect(a.length, "ส่งของเดิมมาด้วยต้องไม่ทำให้บรรทัดซ้ำ").toBe(4);

  // 3) ส่งคำสั่งเดิมซ้ำ (เน็ตสะดุดแล้วลองใหม่) → ไม่งอก
  await ryg.from("leads").update({ activities: [บ(1, "นัดหมาย 20 ต.ค. 2569", "14 ต.ค. 2569 · 09:10")] }).eq("id", ID);
  expect((await อ่าน()).length, "คำสั่งเดิมถูกส่งซ้ำต้องไม่เพิ่มบรรทัด").toBe(4);

  // 4) ส่งไทม์ไลน์ว่างหรือสั้นกว่าเดิม → ลบของเดิมไม่ได้
  await ryg.from("leads").update({ activities: [] }).eq("id", ID);
  expect((await อ่าน()).length, "ดีลเลอร์ล้างไทม์ไลน์ไม่ได้").toBe(4);

  // 5) การแก้ช่องอื่นไม่กระทบไทม์ไลน์ และไทม์ไลน์ยังเรียงเก่าไปใหม่
  await ryg.from("leads").update({ note: "ZZTEST แก้โน้ต" }).eq("id", ID);
  a = await อ่าน();
  expect(a.map(x => x.id), "ไทม์ไลน์เรียงเก่าไปใหม่ตามเลข").toEqual([...a.map(x => x.id)].sort((x, y) => x - y));
  expect(a.length).toBe(4);
});
