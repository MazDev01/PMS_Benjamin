import { test, expect, type Page } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { HQ_ORIGIN, loginUI } from "./funcHelpers";
import { settle, แถวคำขอ, ตารางคำขอ } from "./helpers";
import { adminClient } from "./testDealers";
import { เลขลูกค้าเป้าหมายทดสอบ, ล้างใบHQทดสอบ } from "./hqQuoteFixture";

// ── หน้าคำขอใบเสนอราคา (HQ) กลุ่ม "ต้องตีราคา" — ป้ายตาม FLOW (บอสสั่ง 3 พ.ย. 69) ─────────────────────────────────────
//   1 ชื่อสถานะ "ใหม่" · "กำลังตีราคา" — ไม่มีคำเก่า "ร่างค้าง" / "กำลังทำราคา" บนหน้า
//   2 เลยกำหนด = ป้ายแดงป้ายเดียว "เกินกำหนด X วัน" · บรรทัดล่างไม่บอกกำหนดส่งซ้ำ · ไม่มี "เกิน 14 วัน" · ยังไม่เกิน = "กำหนดส่ง เหลือ X วัน"
//   3 กำลังตีราคา: บรรทัดล่าง "ร่างล่าสุด X วันก่อน" จากวันแก้ร่างใบ HQ ในฐาน · ยังไม่มีร่าง = "ร่างล่าสุด —" (ห้ามเดา)
//   ตาราง 6 พ.ย. 69 (บอสสั่ง): เลยกำหนด = คอลัมน์กำหนดส่งแดง "เกิน X วัน" ที่เดียว · ป้ายสถานะ = สถานะจริง · ยังไม่เกิน = "เหลือ X วัน" ใต้วันกำหนดส่ง
//   ตกบนโค้ดก่อน 3 พ.ย. 69: ป้าย "เกิน 14 วัน" + "กำหนดส่ง เกิน X วัน" ซ้ำกัน · ป้าย "ร่างค้าง" · ไม่มีบรรทัดร่างล่าสุด
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(150_000);

const admin = adminClient();
const แท็ก = `ZZTEST-QBL${Date.now() % 100_000}`;
const วัน = 86_400_000;
// P1 กำลังตีราคา เลยกำหนด 3 วัน มีร่างแก้ล่าสุด 2 วันก่อน · P2 กำลังตีราคา ยังไม่เกิน ร่างแก้ 5 วันก่อน
// P3 กำลังตีราคา ยังไม่มีใบ HQ (ร่างล่าสุด —) · N1 ใหม่ ยังไม่เกิน
const ชุด = [
  { k: "P1", st: "pricing", due: -3, ร่าง: 2 }, { k: "P2", st: "pricing", due: 6, ร่าง: 5 },
  { k: "P3", st: "pricing", due: 9, ร่าง: null }, { k: "N1", st: "new", due: 12, ร่าง: null },
].map(x => ({ ...x, id: 0, lead: เลขลูกค้าเป้าหมายทดสอบ(), บริษัท: `${แท็ก} ลูกค้า${x.k}`, no: `RQ-${แท็ก}-${x.k}` }));
const ของ = (k: string) => ชุด.find(x => x.k === k)!;

async function ล้าง() {
  ล้างใบHQทดสอบ("RYG", ชุด.map(x => x.lead));
  const { data: เหลือ } = await admin.from("quote_requests").select("id").like("request_no", `RQ-${แท็ก}-%`);
  expect(เหลือ ?? [], "คำขอทดสอบต้องถูกลบหมด").toEqual([]);
}
test.beforeAll(async () => {
  await ล้าง();
  const now = Date.now();
  for (const x of ชุด) {
    const l = await admin.from("leads").insert({ id: `#L-${x.lead}`, num_id: x.lead, dealer_code: "RYG", company: x.บริษัท, name: x.บริษัท,
      contact: "ผู้ทดสอบ", phone: `08${String(x.lead).slice(-8)}`, province: "ระยอง", status: "WAITING" });
    expect(l.error, `สร้างลูกค้าเป้าหมาย ${x.k}`).toBeNull();
    const r = await admin.from("quote_requests").insert({ request_no: x.no, dealer_code: "RYG", lead_num_id: x.lead, product: "โกดังทดสอบ",
      province: "ระยอง", status: x.st, submitted_at: new Date(now - 4 * วัน).toISOString(), due_at: new Date(now + x.due * วัน).toISOString() }).select("id").single();
    expect(r.error, `สร้างคำขอ ${x.k}`).toBeNull();
    x.id = Number(r.data!.id);
    if (x.ร่าง != null) {
      // เวลาแก้ร่างตั้งตอนสร้าง (ตัวดักเวลาแก้ทำงานตอนแก้เท่านั้น) — เป็นวันแก้ร่างล่าสุดที่ฐานรู้
      const h = await admin.from("hq_quotes").insert({ request_id: x.id, version: 1, quote_no: `HQ-${แท็ก}-${x.k}`, status: "draft", line_items: [],
        total_cost: 0, updated_at: new Date(now - x.ร่าง * วัน).toISOString() });
      expect(h.error, `สร้างร่างใบ HQ ${x.k}`).toBeNull();
    }
  }
});
test.afterAll(ล้าง);

const แถวของ = (page: Page, k: string) => แถวคำขอ(page, ของ(k).บริษัท);

test("[H7] [ui·hq] ต้องตีราคา: ชื่อสถานะตาม FLOW · ป้ายเกินกำหนดป้ายเดียว · ร่างล่าสุดจากฐาน", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/quote-requests`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByLabel("ค้นหาคำขอ").fill(แท็ก);
  await expect(แถวคำขอ(page, แท็ก), "ต้องตีราคา 4 แถวของข้อ").toHaveCount(4, { timeout: 25_000 });

  // 2 · เลยกำหนด: แดงที่คอลัมน์กำหนดส่งที่เดียว "เกิน 3 วัน" · ป้ายสถานะ = สถานะจริง (ไม่บอกเกินซ้ำ) · ยังมีร่างล่าสุด (สถานะกำลังตีราคา)
  const p1 = แถวของ(page, "P1");
  await expect(p1.getByTestId("row-countdown")).toHaveText("เกิน 3 วัน");
  await expect(p1.getByTestId("row-countdown")).toHaveCSS("color", "rgb(185, 28, 28)");
  await expect(p1.getByTestId("row-tag"), "ป้ายสถานะไม่บอกเกินกำหนดซ้ำ").toHaveText("กำลังตีราคา");
  await expect(p1, "ไม่มี \"เกิน 14 วัน\"").not.toContainText("เกิน 14 วัน");
  await expect(p1, "บอกเกินที่เดียว").not.toContainText("เกินกำหนด");
  await expect(p1.getByTestId("row-draft-age")).toHaveText("ร่างล่าสุด 2 วันก่อน");

  // 1 + 3 · กำลังตีราคา ยังไม่เกิน
  const p2 = แถวของ(page, "P2");
  await expect(p2.getByTestId("row-tag")).toHaveText("กำลังตีราคา");
  await expect(p2.getByTestId("row-countdown")).toHaveText("เหลือ 6 วัน");
  await expect(p2.getByTestId("row-countdown"), "ยังไม่เกิน = ไม่แดง").not.toHaveCSS("color", "rgb(185, 28, 28)");
  await expect(p2.getByTestId("row-draft-age")).toHaveText("ร่างล่าสุด 5 วันก่อน");
  // ยังไม่มีใบ HQ = ไม่รู้วันแก้ร่าง → "—" ไม่เดา
  await expect(แถวของ(page, "P3").getByTestId("row-tag")).toHaveText("กำลังตีราคา");
  await expect(แถวของ(page, "P3").getByTestId("row-draft-age")).toHaveText("ร่างล่าสุด —");
  // ใหม่: ไม่มีบรรทัดร่าง
  const n1 = แถวของ(page, "N1");
  await expect(n1.getByTestId("row-tag")).toHaveText("ใหม่");
  await expect(n1.getByTestId("row-countdown")).toHaveText("เหลือ 12 วัน");
  await expect(n1.getByTestId("row-draft-age")).toHaveCount(0);

  // 1 · คำเก่าไม่กลับมา (ทั้งรายการ)
  const ข้อความ = await ตารางคำขอ(page).innerText();
  for (const คำเก่า of ["ร่างค้าง", "กำลังทำราคา", "เกิน 14 วัน"]) expect(ข้อความ, `ไม่มีคำเก่า "${คำเก่า}"`).not.toContain(คำเก่า);
});
