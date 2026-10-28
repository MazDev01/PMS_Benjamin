import { test, expect } from "@playwright/test";
import { open } from "./helpers";
import { ADMIN, skipReason } from "./supabaseEnv";
import { db } from "./funcHelpers";
import { ช่อง } from "../../packages/shared/lib/fieldLabels";

// ─── HQ · ลูกค้าทั้งเครือ — ยอดซื้อรวมใช้กติกาเดียว + แผงมีชุดช่องข้อมูลลูกค้า (ตรวจเทียบ FLOW รอบ 5 · 28 ต.ค. 69) ───
//
// แถว 28: ลูกค้าคนเดียวกัน หัวแผง "ยอดซื้อรวม ฿5.0M" แต่แท็บประวัติการซื้อ "รวมจากใบที่ปิดการขาย ฿10.6M"
//   ต้นเหตุ: hq_customers_page อ่านช่องเก็บยอด customers.total_value (trigger จดให้ — ข้อมูลที่ลงไม่ผ่าน trigger จึงค้างค่าเก่า)
//            ส่วนแท็บประวัติรวมใบ won ตรง ๆ → สองที่สองกติกา
//   FLOW: ยอดขาย = ใบที่ลูกค้าตอบรับ (ฉบับล่าสุด ก่อน VAT) — ใบ 0254 ให้ฐานคิดจากใบ won ทุกครั้ง
//   ข้อมูลตั้งต้นฐานทดสอบโหลดแบบปิด trigger (session_replication_role = replica) ยอดเก็บจึงไม่ตรงกับใบอยู่แล้ว
//   = ข้อทดสอบนี้ตกบนโค้ดเดิมเสมอ (ลูกค้าทดสอบ 050: ยอดเก็บ 5,000,000 · ใบ won H-UBN-5-0 = 10,600,000)
// แถว 29: หมวด "ข้อมูลลูกค้า" ต้องมี ผู้ติดต่อ / โทรศัพท์ / อีเมล / ที่อยู่ (ชุดช่องมาตรฐาน · fieldLabels.ts)
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");

type แถว = { id: number; dealer_code: string; name: string; total_value: number };

test("[D8·H12] ยอดซื้อรวมของทุกลูกค้าในหน้า HQ = ผลรวมใบที่ลูกค้าตอบรับ (กติกาเดียวกับแท็บประวัติ)", async () => {
  const sb = await db(ADMIN);
  const { data, error } = await sb.rpc("hq_customers_page", { p_limit: 5000, p_offset: 0 });
  expect(error, "เรียก hq_customers_page ต้องไม่ error").toBeNull();
  const แถวลูกค้า = ((data as { rows: แถว[] }).rows ?? []);
  expect(แถวลูกค้า.length, "ฐานทดสอบต้องมีลูกค้า").toBeGreaterThan(0);

  // ใบที่ลูกค้าตอบรับ (won) ทั้งเครือ — อ่านอย่างเดียว · คีย์ลูกค้า = สาขา + เลขลูกค้า (เลขชนข้ามสาขาได้)
  const ยอดจากใบ = new Map<string, number>();
  for (let from = 0; ; from += 1000) {
    const { data: ใบ, error: e } = await sb.from("quotations").select("dealer_code,customer_id,total_value")
      .eq("status", "won").not("customer_id", "is", null).order("dealer_code").order("id").range(from, from + 999);
    expect(e).toBeNull();
    for (const q of ใบ ?? []) {
      const k = `${q.dealer_code}|${q.customer_id}`;
      ยอดจากใบ.set(k, (ยอดจากใบ.get(k) ?? 0) + Number(q.total_value ?? 0));
    }
    if ((ใบ ?? []).length < 1000) break;
  }

  const ไม่ตรง = แถวลูกค้า
    .map(r => ({ ...r, จากใบ: ยอดจากใบ.get(`${r.dealer_code}|${r.id}`) ?? 0 }))
    .filter(r => Number(r.total_value) !== r.จากใบ)
    .map(r => `${r.dealer_code} ${r.name}: หน้า HQ ${r.total_value} · ใบตอบรับ ${r.จากใบ}`);
  expect(ไม่ตรง, "ยอดซื้อรวมต้องเท่ากับผลรวมใบที่ลูกค้าตอบรับทุกราย").toEqual([]);
});

test("[D8·H12] แผงลูกค้า HQ: หัวแผงกับแท็บประวัติการซื้อเป็นตัวเลขเดียวกัน + หมวดข้อมูลลูกค้าครบชุดช่องมาตรฐาน", async ({ page }) => {
  await open(page, "hq", "/hq/customers");
  await page.getByPlaceholder("ค้นหาชื่อลูกค้า หรือจังหวัด...").fill("ลูกค้าทดสอบ 050");
  const row = page.locator("tbody tr").filter({ hasText: "ลูกค้าทดสอบ 050" }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.getByTitle("ดูรายละเอียด").click();

  const แผง = page.getByRole("dialog", { name: "รายละเอียดลูกค้า" });
  await expect(แผง).toBeVisible({ timeout: 15_000 });

  // หมวด "ข้อมูลลูกค้า" — ป้ายจาก fieldLabels.ts + ค่าจริงจากระเบียนลูกค้า (ข้อมูลตั้งต้น C050)
  for (const ป้าย of [ช่อง.ผู้ติดต่อ, ช่อง.โทรศัพท์, ช่อง.อีเมล, ช่อง.ที่อยู่]) {
    await expect(แผง.getByText(ป้าย, { exact: true }).first(), `แผงต้องมีช่อง "${ป้าย}"`).toBeVisible();
  }
  for (const ค่า of ["ผู้ติดต่อทดสอบ C050", "000-000-0144", "cust-050@example.test", "ที่อยู่ทดสอบ C050"]) {
    await expect(แผง.getByText(ค่า, { exact: true }).first(), `แผงต้องแสดง "${ค่า}"`).toBeVisible();
  }

  const ยอดหัวแผง = async () => /ยอดซื้อรวม\s*(฿[\d.,]+[MK]?)/.exec(await แผง.innerText())?.[1] ?? "";
  await expect.poll(ยอดหัวแผง, { timeout: 15_000 }).toMatch(/^฿/);
  const หัว = await ยอดหัวแผง();

  await แผง.getByRole("tab", { name: "ประวัติการซื้อ" }).click();
  const รวมประวัติ = async () => /รวมจากใบที่ปิดการขาย\s*(฿[\d.,]+[MK]?)/.exec(await แผง.innerText())?.[1] ?? "";
  await expect.poll(รวมประวัติ, { timeout: 15_000 }).toMatch(/^฿/);
  expect(await รวมประวัติ(), "ยอดหัวแผงต้องเท่ากับรวมจากใบที่ปิดการขาย (ตัวเลขเดียว)").toBe(หัว);
});
