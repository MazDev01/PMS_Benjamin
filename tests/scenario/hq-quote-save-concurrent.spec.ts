import { test, expect } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { db } from "./funcHelpers";
import { ข้อมูลงานครบชุด, ล้างใบHQทดสอบ } from "./hqQuoteFixture";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";
import { adminClient, กรอกข้อมูลบริษัททดสอบ } from "./testDealers";

// ── HQ บันทึกใบ HQ หลายคำขอพร้อมกัน ต้องไม่ล็อกตาย (deadlock) — งานคิว rmwbw5dzqpja (เจอ 11 พ.ย. 69) ─────────────────
//   เจอ: 2 ข้อทดสอบเตรียมใบ HQ พร้อมกัน (คนละสาขา) → hq_quote_save ตอบ "deadlock detected" · ใบไม่ถูกบันทึกทั้งใบ
//   ข้อนี้: 2 สาขา × 4 คำขอ · บันทึกครั้งแรกพร้อมกันทั้ง 8 (ทางรับเรื่อง new → pricing) แล้วบันทึกซ้ำพร้อมกัน 3 รอบ (ทางแก้ร่าง)
//     ทุกครั้งต้องไม่มีข้อผิดพลาด · ตก = พิมพ์ข้อความ/รายละเอียดจากฐาน (ใครรอใคร) ไว้หาต้นเหตุ
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(240_000);

const สาขา: สาขาของข้อ[] = [];
const คำขอ: number[] = [];
const เลขลีด: Record<string, number[]> = {};
const ฐานเลข = 1_870_000_000 + Math.floor(Math.random() * 400_000) * 100;

test.beforeAll(async () => {
  for (const [k, จังหวัด] of [[0, "ตราด"], [1, "ระยอง"]] as const) {
    const ส = await สร้างสาขาของข้อ({ จังหวัด });
    สาขา.push(ส);
    const sd = await db(ส.บัญชี);
    เลขลีด[ส.รหัส] = [];
    for (let i = 0; i < 4; i++) {
      const เลข = ฐานเลข + k * 10 + i;
      const ชื่อ = `ZZTEST บันทึกพร้อมกัน ${ส.รหัส} ${i}`;
      expect((await sd.from("leads").insert({ id: `#L-${เลข}`, num_id: เลข, dealer_code: ส.รหัส, company: ชื่อ, name: ชื่อ, contact: "ผู้ทดสอบ",
        phone: `000-000-${String(700 + k * 10 + i).padStart(4, "0")}`, province: จังหวัด, status: "BULLET", ...ข้อมูลงานครบชุด })).error, ชื่อ).toBeNull();
      const r = await sd.rpc("quote_request_submit", { p_lead_num_id: เลข, p_product: "โกดัง" });
      expect(r.error, `ส่งคำขอ ${ชื่อ}`).toBeNull();
      คำขอ.push(Number((r.data as { id: number }).id));
      เลขลีด[ส.รหัส].push(เลข);
    }
  }
});
test.afterAll(async () => {
  for (const ส of สาขา) { ล้างใบHQทดสอบ(ส.รหัส, เลขลีด[ส.รหัส] ?? []); await ส.ลบ(); }
});

test("[db·hq] บันทึกใบ HQ 8 คำขอ (2 สาขา) พร้อมกัน — ครั้งแรก (รับเรื่อง) + แก้ร่างซ้ำ 3 รอบ ไม่ล็อกตาย", async () => {
  const hq = await db(ADMIN);
  const ยืน = new Date(Date.now() + 7 * 3_600_000 + 30 * 86_400_000).toISOString().slice(0, 10);
  const บันทึก = (id: number, รอบ: number) => hq.rpc("hq_quote_save", { p_request_id: id, p_valid_until: ยืน, p_note: "",
    p_lines: [{ name: "โครงสร้างเหล็ก", qty: 10 + รอบ, unit: "ตัน", unitCost: 32_000 }] });
  for (let รอบ = 0; รอบ < 4; รอบ++) {
    const ผล = await Promise.all(คำขอ.map(id => บันทึก(id, รอบ)));
    const พลาด = ผล.map((r, i) => r.error ? `คำขอ ${คำขอ[i]}: ${r.error.message} · ${r.error.details ?? ""} · ${r.error.hint ?? ""}` : "").filter(Boolean);
    expect(พลาด, `รอบ ${รอบ + 1} (${รอบ === 0 ? "ครั้งแรก = รับเรื่อง" : "แก้ร่าง"}): บันทึกพร้อมกันต้องไม่ล็อกตาย`).toEqual([]);
  }
  const { data } = await hq.from("quote_requests").select("id, status").in("id", คำขอ);
  expect((data ?? []).every(r => r.status === "pricing"), "ทุกคำขอรับเรื่องแล้ว (กำลังตีราคา)").toBe(true);
});

test("[db·hq] ทางเดินเต็มพร้อมกัน 2 สาขา (เพิ่มลีด → ส่งคำขอ → HQ บันทึก → ส่งใบ) × 4 สาย × 3 รอบ — ไม่ล็อกตาย (แบบที่เจอจริง)", async () => {
  const hq = await db(ADMIN);
  const ยืน = new Date(Date.now() + 7 * 3_600_000 + 30 * 86_400_000).toISOString().slice(0, 10);
  const พลาด: string[] = [];
  const สาย = async (ส: สาขาของข้อ, เลข: number) => {
    const sd = await db(ส.บัญชี);
    const ชื่อ = `ZZTEST สายพร้อมกัน ${ส.รหัส} ${เลข}`;
    const ขั้น = async (ชื่อขั้น: string, p: PromiseLike<{ error: { message: string; details?: string | null; hint?: string | null } | null; data?: unknown }>) => {
      const r = await p;
      if (r.error) throw new Error(`${ชื่อขั้น}: ${r.error.message} · ${r.error.details ?? ""} · ${r.error.hint ?? ""}`);
      return r.data;
    };
    try {
      await ขั้น("เพิ่มลีด", sd.from("leads").insert({ id: `#L-${เลข}`, num_id: เลข, dealer_code: ส.รหัส, company: ชื่อ, name: ชื่อ, contact: "ผู้ทดสอบ",
        phone: `000-000-${String(เลข % 10_000).padStart(4, "0")}`, province: ส === สาขา[0] ? "ตราด" : "ระยอง", status: "BULLET", ...ข้อมูลงานครบชุด }));   // จังหวัดในพื้นที่ของสาขา
      เลขลีด[ส.รหัส].push(เลข);
      const r = await ขั้น("ส่งคำขอ", sd.rpc("quote_request_submit", { p_lead_num_id: เลข, p_product: "โกดัง" })) as { id: number };
      await ขั้น("HQ บันทึก", hq.rpc("hq_quote_save", { p_request_id: r.id, p_valid_until: ยืน, p_note: "", p_lines: [{ name: "โครงสร้างเหล็ก", qty: 10, unit: "ตัน", unitCost: 32_000 }] }));
      await ขั้น("HQ ส่งใบ", hq.rpc("hq_quote_send", { p_request_id: r.id }));
    } catch (e) { พลาด.push(`${ชื่อ} — ${(e as Error).message}`); }
  };
  for (let รอบ = 0; รอบ < 3; รอบ++) {
    await Promise.all([0, 1, 2, 3].map(i => สาย(สาขา[i % 2], ฐานเลข + 50 + รอบ * 10 + i)));
  }
  expect(พลาด, "ทางเดินเต็มพร้อมกันต้องไม่ล็อกตาย").toEqual([]);
});

test("[db·hq] HQ บันทึกใบพร้อมกับอีกงานสร้างสาขา + กรอกข้อมูลบริษัท + เพิ่มรายการวัสดุ — ไม่ล็อกตาย (แบบ beforeAll สองข้อที่เจอจริง)", async () => {
  const hq = await db(ADMIN);
  const svc = adminClient();
  const ยืน = new Date(Date.now() + 7 * 3_600_000 + 30 * 86_400_000).toISOString().slice(0, 10);
  const พลาด: string[] = [];
  const ใหม่: สาขาของข้อ[] = [];
  const แท็ก = Date.now() % 100_000;
  const งานบันทึก = async (รอบ: number) => {
    const ผล = await Promise.all(คำขอ.map(id => hq.rpc("hq_quote_save", { p_request_id: id, p_valid_until: ยืน, p_note: "",
      p_lines: [{ name: "โครงสร้างเหล็ก", qty: 20 + รอบ, unit: "ตัน", unitCost: 32_000 }] })));
    ผล.forEach((r, i) => { if (r.error) พลาด.push(`บันทึกคำขอ ${คำขอ[i]}: ${r.error.message} · ${r.error.details ?? ""} · ${r.error.hint ?? ""}`); });
  };
  const งานตั้งสาขา = async (i: number) => {
    try {
      const ส = await สร้างสาขาของข้อ({ จังหวัด: "ตราด" });
      ใหม่.push(ส);
      await กรอกข้อมูลบริษัททดสอบ(ส.รหัส);
      const t = await svc.from("material_templates").insert([{ category: "ZZTEST", name: `ZZTEST วัสดุพร้อมกัน ${แท็ก}-${i}`, unit: "ตัน", unit_price: 1000 }]).select("id");
      if (t.error) พลาด.push(`เพิ่มรายการวัสดุ: ${t.error.message}`);
    } catch (e) { พลาด.push(`ตั้งสาขา: ${(e as Error).message}`); }
  };
  try {
    for (let รอบ = 0; รอบ < 3; รอบ++) await Promise.all([งานบันทึก(รอบ), งานตั้งสาขา(รอบ * 2), งานตั้งสาขา(รอบ * 2 + 1), งานบันทึก(รอบ + 10)]);
  } finally {
    await svc.from("material_templates").delete().like("name", `ZZTEST วัสดุพร้อมกัน ${แท็ก}-%`);
    for (const ส of ใหม่) await ส.ลบ();
  }
  expect(พลาด, "บันทึกใบ HQ พร้อมงานตั้งสาขาต้องไม่ล็อกตาย").toEqual([]);
});
