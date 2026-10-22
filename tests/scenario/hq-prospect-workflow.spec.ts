import { test, expect } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, loginUI, watchErrors, assertNoErrors, db, waitRow, specNS } from "./funcHelpers";

// ── เส้นทางการทำงานของผู้สนใจเป็นดีลเลอร์ — migration 0174 ──
//   บอสสั่ง 14 ก.ย. 69: "ทำให้ ลูกค้าเป้าหมาย ออกแบบการทำออกมาใช้งานให้เสร็จ" · "ให้มันทำงานแบบเดียวกับดีลเลอร์"
//
// สิ่งที่ต้องพิสูจน์ที่ฐานข้อมูล (ด่านจริง — ใครยิงตรงก็โดน):
//   1) เลื่อนขั้นทีละขั้น ห้ามข้าม · รอตัดสินใจต้องมีใบที่ส่งแล้ว · เป็นดีลเลอร์แล้วเปลี่ยนไม่ได้
//   2) บันทึกการติดต่อ → ติดต่อล่าสุด/นัดติดตาม/รอติดต่อ→ติดต่อแล้ว ตั้งให้เอง · แอปทับติดต่อล่าสุดไม่ได้
//   3) ประวัติ: ระบบเขียนเอง ผู้ใช้เพิ่มได้แค่บันทึกการติดต่อ · แก้/ลบ/ปลอมผู้ทำไม่ได้ · ดีลเลอร์ไม่เห็น
//   4) ส่งใบเสนอแล้ว นัดคุยแล้ว → รอตัดสินใจ ให้เอง
//   5) หน้าจอ: ตัวกรองไม่ได้ติดต่อ 7/14/30 วัน
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);
test.describe.configure({ mode: "serial" });

const NS = specNS("PROSPECTFLOW");

async function cleanup() {
  const { error } = await (await db(ADMIN)).from("dealer_prospects").delete().like("name", `${NS}%`);
  if (error) console.warn("[hq-prospect-workflow] ล้างข้อมูลทดสอบไม่สำเร็จ", error.message);
}
test.beforeAll(cleanup);
test.afterAll(cleanup);

test("[db] กติกาเลื่อนขั้น + บันทึกการติดต่อ + ส่งใบแล้วเลื่อนเอง", async () => {
  const sb = await db(ADMIN);
  const { data: pr, error } = await sb.from("dealer_prospects").insert({ name: `${NS}-กติกาขั้น` }).select("id, status").single();
  expect(error).toBeNull();
  const id = (pr as { id: number }).id;
  const ขั้น = async () => ((await sb.from("dealer_prospects").select("status, last_contact_at, follow_up, first_contact").eq("id", id).single()).data as
    { status: string; last_contact_at: string | null; follow_up: string | null; first_contact: string | null });

  const ข้าม = await sb.from("dealer_prospects").update({ status: "meeting" }).eq("id", id).select();
  expect(ข้าม.error?.message ?? "", "รอติดต่อ → นัดคุยแล้ว ข้ามขั้นไม่ได้").toMatch(/ห้ามข้ามขั้น/);

  // บันทึกการติดต่อ → รอติดต่อ → ติดต่อแล้ว + ติดต่อล่าสุด + นัดติดตาม ตั้งให้เอง
  const ติดต่อ = await sb.from("dealer_prospect_activities")
    .insert({ prospect_id: id, kind: "contact", channel: "LINE", body: "สนใจ", next_follow_up: "2026-12-01", actor: "ปลอม", created_at: "2020-01-01T00:00:00Z" })
    .select("id, actor, created_at").single();
  expect(ติดต่อ.error).toBeNull();
  const แถวติดต่อ = ติดต่อ.data as { id: number; actor: string; created_at: string };
  expect(แถวติดต่อ.actor, "ผู้ทำต้องมาจากบัญชีที่ล็อกอิน ปลอมไม่ได้").not.toBe("ปลอม");
  expect(แถวติดต่อ.actor).toContain("@");
  expect(แถวติดต่อ.created_at.startsWith("2020"), "เวลาต้องเป็นเวลาจริง ปลอมย้อนหลังไม่ได้").toBe(false);
  let ตอนนี้ = await ขั้น();
  expect(ตอนนี้.status).toBe("contacted");
  expect(ตอนนี้.last_contact_at).not.toBeNull();
  expect(ตอนนี้.follow_up).toBe("2026-12-01");
  expect(ตอนนี้.first_contact, "วันเริ่มติดต่อเติมให้เมื่อยังว่าง").not.toBeNull();

  // แอปส่งทั้งแถวกลับมา (ติดต่อล่าสุดเป็นค่าว่าง) ต้องทับค่าที่ตัวดักตั้งไว้ไม่ได้
  expect((await sb.from("dealer_prospects").update({ last_contact_at: null, note: "แก้หมายเหตุ" }).eq("id", id)).error).toBeNull();
  expect((await ขั้น()).last_contact_at, "ติดต่อล่าสุดตั้งได้จากบันทึกการติดต่อทางเดียว").not.toBeNull();

  expect((await sb.from("dealer_prospects").update({ status: "profile_sent" }).eq("id", id)).error).toBeNull();
  expect((await sb.from("dealer_prospects").update({ status: "meeting" }).eq("id", id)).error).toBeNull();
  const ไม่มีใบ = await sb.from("dealer_prospects").update({ status: "considering" }).eq("id", id).select();
  expect(ไม่มีใบ.error?.message ?? "", "ยังไม่มีใบที่ส่งแล้ว เป็นรอตัดสินใจไม่ได้").toMatch(/ใบค่าแฟรนไชส์/);

  // ส่งใบแล้ว → นัดคุยแล้ว → รอตัดสินใจ ให้เอง
  const { data: ใบ } = await sb.from("dealer_package_proposals").insert({ prospect_id: id, package: "standard", proposed_date: "2026-09-14" }).select("id").single();
  expect((await sb.from("dealer_package_proposals").update({ status: "sent" }).eq("id", (ใบ as { id: number }).id)).error).toBeNull();
  expect((await ขั้น()).status, "ส่งใบแล้วต้องเลื่อนเป็นรอตัดสินใจเอง").toBe("considering");

  // ปิดไม่สำเร็จ → เปิดใหม่กลับขั้นเดิมได้ · เป็นดีลเลอร์ต้องผูกรหัส · เป็นดีลเลอร์แล้วเปลี่ยนไม่ได้
  expect((await sb.from("dealer_prospects").update({ status: "lost", lost_reason: "ไม่มีทุน" }).eq("id", id)).error).toBeNull();
  expect((await sb.from("dealer_prospects").update({ status: "considering", lost_reason: null }).eq("id", id)).error).toBeNull();
  const ไม่มีรหัส = await sb.from("dealer_prospects").update({ status: "won" }).eq("id", id).select();
  expect(ไม่มีรหัส.error?.message ?? "").toMatch(/ผูกกับดีลเลอร์/);
  expect((await sb.from("dealer_prospects").update({ status: "won", dealer_code: "RYG" }).eq("id", id)).error).toBeNull();
  const ถอยจากดีลเลอร์ = await sb.from("dealer_prospects").update({ status: "meeting" }).eq("id", id).select();
  expect(ถอยจากดีลเลอร์.error?.message ?? "").toMatch(/เป็นดีลเลอร์แล้ว/);

  // ประวัติครบทุกชนิด เรียงใหม่ก่อน
  const { data: ประวัติ } = await sb.from("dealer_prospect_activities").select("kind, body, from_status, to_status")
    .eq("prospect_id", id).order("created_at", { ascending: false }).order("id", { ascending: false });
  const ชนิด = new Set((ประวัติ ?? []).map(a => (a as { kind: string }).kind));
  expect([...ชนิด].sort()).toEqual(["contact", "created", "proposal", "status"]);
  const ข้อความ = (ประวัติ ?? []).map(a => (a as { body: string }).body);
  expect(ข้อความ).toContain("รอติดต่อ → ติดต่อแล้ว");
  expect(ข้อความ).toContain("ปิดว่าไม่สำเร็จ · เหตุผล: ไม่มีทุน");
  expect(ข้อความ).toContain("เป็นดีลเลอร์แล้ว · รหัส RYG");
  expect(ข้อความ.some(t => /^ใบค่าแฟรนไชส์ DP-\d{4}-\d{4} · ส่งแล้ว$/.test(t))).toBe(true);
});

test("[db] ใบถูกปฏิเสธ → รอตัดสินใจถอยกลับนัดคุยแล้ว เฉพาะเมื่อไม่มีใบที่ส่งแล้วเหลือ (0177)", async () => {
  const sb = await db(ADMIN);
  const { data: pr, error } = await sb.from("dealer_prospects").insert({ name: `${NS}-ใบถูกปฏิเสธ`, status: "meeting" }).select("id").single();
  expect(error).toBeNull();
  const id = (pr as { id: number }).id;
  const ขั้น = async () => ((await sb.from("dealer_prospects").select("status").eq("id", id).single()).data as { status: string }).status;
  const ออกใบ = async () => ((await sb.from("dealer_package_proposals")
    .insert({ prospect_id: id, package: "standard", proposed_date: "2026-09-15" }).select("id, proposal_no").single()).data as { id: number; proposal_no: string });
  // ปฏิเสธต้องมีเหตุผล (ด่าน 4 · 0207)
  const ตั้ง = async (ใบId: number, status: string) =>
    expect((await sb.from("dealer_package_proposals")
      .update(status === "rejected" ? { status, close_reason: "ผู้สนใจไม่รับเงื่อนไข" } : { status }).eq("id", ใบId)).error).toBeNull();

  const ใบ1 = await ออกใบ();
  const ใบ2 = await ออกใบ();
  await ตั้ง(ใบ1.id, "sent");
  await ตั้ง(ใบ2.id, "sent");
  expect(await ขั้น()).toBe("considering");

  // ยังมีใบที่ส่งแล้วค้างอยู่อีกใบ → ไม่ถอย
  await ตั้ง(ใบ1.id, "rejected");
  expect(await ขั้น(), "ยังมีใบอื่นที่ส่งแล้ว ต้องยังรอตัดสินใจ").toBe("considering");

  // ใบสุดท้ายถูกปฏิเสธ → ถอยกลับนัดคุยแล้ว พร้อมประวัติที่บอกเหตุผล
  await ตั้ง(ใบ2.id, "rejected");
  expect(await ขั้น(), "ไม่มีใบที่ส่งแล้วเหลือ ต้องถอยกลับนัดคุยแล้ว").toBe("meeting");
  const { data: ประวัติ } = await sb.from("dealer_prospect_activities").select("kind, body, from_status, to_status")
    .eq("prospect_id", id).eq("kind", "status");
  const ถอย = (ประวัติ ?? []).find(a => (a as { to_status: string }).to_status === "meeting" && (a as { from_status: string }).from_status === "considering") as
    { body: string } | undefined;
  expect(ถอย?.body).toBe(`ใบค่าแฟรนไชส์ ${ใบ2.proposal_no} ถูกปฏิเสธ → กลับไปนัดคุยแล้ว`);

  // ข้อความเหตุผลต้องไม่ติดไปกับการเปลี่ยนขั้นครั้งถัดไป
  const ใบ3 = await ออกใบ();
  await ตั้ง(ใบ3.id, "sent");
  const { data: ล่าสุด } = await sb.from("dealer_prospect_activities").select("body")
    .eq("prospect_id", id).eq("kind", "status").order("id", { ascending: false }).limit(1).single();
  expect((ล่าสุด as { body: string }).body).toBe("นัดคุยแล้ว → รอตัดสินใจ");
});

test("[security] ประวัติ: เพิ่มได้แค่บันทึกการติดต่อ · แก้/ลบไม่ได้ · ดีลเลอร์ไม่เห็น", async () => {
  const sb = await db(ADMIN);
  const { data: pr } = await sb.from("dealer_prospects").insert({ name: `${NS}-ประวัติลับ` }).select("id").single();
  const id = (pr as { id: number }).id;

  const ปลอมขั้น = await sb.from("dealer_prospect_activities").insert({ prospect_id: id, kind: "status", body: "เป็นดีลเลอร์แล้ว (ปลอม)" }).select();
  expect(ปลอมขั้น.error, "ผู้ใช้เขียนประวัติชนิดอื่นเองไม่ได้").not.toBeNull();
  const ไม่มีช่องทาง = await sb.from("dealer_prospect_activities").insert({ prospect_id: id, kind: "contact", body: "คุยแล้ว" }).select();
  expect(ไม่มีช่องทาง.error?.message ?? "").toMatch(/ช่องทาง/);

  const { data: บันทึก } = await sb.from("dealer_prospect_activities").insert({ prospect_id: id, kind: "contact", channel: "โทรศัพท์", body: "ต้นฉบับ" }).select("id").single();
  const รหัส = (บันทึก as { id: number }).id;
  await sb.from("dealer_prospect_activities").update({ body: "แก้แล้ว" }).eq("id", รหัส);
  await sb.from("dealer_prospect_activities").delete().eq("id", รหัส);
  const { data: ยังอยู่ } = await sb.from("dealer_prospect_activities").select("body").eq("id", รหัส).single();
  expect((ยังอยู่ as { body: string } | null)?.body, "บันทึกแล้วต้องแก้/ลบไม่ได้").toBe("ต้นฉบับ");

  const dealer = await db(RYG);
  const { data: เห็น } = await dealer.from("dealer_prospect_activities").select("id").eq("prospect_id", id);
  expect(เห็น ?? [], "ดีลเลอร์ต้องไม่เห็นประวัติของสำนักงานใหญ่").toHaveLength(0);
  const ดีลเลอร์เขียน = await dealer.from("dealer_prospect_activities").insert({ prospect_id: id, kind: "contact", channel: "LINE", body: "ปลอม" }).select();
  expect(ดีลเลอร์เขียน.error, "ดีลเลอร์เพิ่มบันทึกไม่ได้").not.toBeNull();

  // ลบลูกค้าเป้าหมายทั้งราย → ประวัติหายตาม (รายที่ไม่มีโอกาสต้องลบได้)
  expect((await sb.from("dealer_prospects").delete().eq("id", id)).error).toBeNull();
  const { data: เหลือ } = await sb.from("dealer_prospect_activities").select("id").eq("prospect_id", id);
  expect(เหลือ ?? []).toHaveLength(0);
});

// รูป PNG 2×2 จุด — ใช้ทดสอบอัปโหลด (ไม่ต้องมีไฟล์รูปในโปรเจกต์)
const รูปทดสอบ = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DAwMDAxMDAwMAAAA4AAf8Fh1YAAAAASUVORK5CYII=", "base64");

test("[func·hq] รูปประจำตัว: อัปโหลดตั้งแต่หน้าต่างเพิ่มรายใหม่ → ขึ้นหัวแผง · ฐานข้อมูลไม่รับลิงก์ภายนอก (0175)", async ({ page }) => {
  const errs = watchErrors(page);
  const sb = await db(ADMIN);
  const name = `${NS}-มีรูป`;

  await loginUI(page, HQ_ORIGIN, "/hq/prospects", ADMIN);
  await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
  const ฟอร์ม = page.getByRole("dialog", { name: "ข้อมูลลูกค้าเป้าหมาย" });
  await ฟอร์ม.getByLabel("อัปโหลดรูปลูกค้าเป้าหมาย").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: รูปทดสอบ });
  await expect(ฟอร์ม.getByRole("img", { name: "รูปประจำตัว" }), "เลือกรูปแล้วต้องเห็นตัวอย่างในฟอร์ม").toBeVisible({ timeout: 10_000 });
  await ฟอร์ม.locator("#pr-name").fill(name);
  // ผู้ดูแล = ดรอปดาวน์จากผู้ใช้งานสำนักงานใหญ่ (บอสสั่ง 14 ก.ย. 69) — ต้องไม่ใช่ช่องพิมพ์เองแล้ว
  const ผู้ดูแล = ฟอร์ม.locator("select#pr-assigned");
  await expect(ผู้ดูแล, "ผู้ดูแลต้องเป็นดรอปดาวน์").toHaveCount(1);
  const ชื่อผู้ใช้HQ = (await ผู้ดูแล.locator("option").allInnerTexts()).slice(1);
  expect(ชื่อผู้ใช้HQ.length, "ต้องมีรายชื่อผู้ใช้งานสำนักงานใหญ่ให้เลือก").toBeGreaterThan(0);
  const ค่าแรก = await ผู้ดูแล.locator("option").nth(1).getAttribute("value");
  await ผู้ดูแล.selectOption(ค่าแรก ?? "");
  await ฟอร์ม.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).click();

  const แถว = await waitRow<{ id: number; logo: string | null; assigned: string | null }>(sb, "dealer_prospects", { name });
  expect(แถว.assigned, "ผู้ดูแลที่เลือกต้องบันทึกจริง").toBe(ค่าแรก);
  expect(แถว.logo ?? "", "รูปต้องถูกบันทึกเป็นรูปที่ย่อแล้ว").toMatch(/^data:image\//);
  const แผง = page.getByRole("dialog", { name: "ข้อมูลลูกค้าเป้าหมาย" });
  await expect(แผง.getByRole("img", { name: "รูปประจำตัว" }).first(), "หัวแผงต้องขึ้นรูปแทนตัวย่อ").toBeVisible({ timeout: 15_000 });

  const ลิงก์ภายนอก = await sb.from("dealer_prospects").update({ logo: "https://evil.example/x.png" }).eq("id", แถว.id).select();
  expect(ลิงก์ภายนอก.error, "ฐานข้อมูลต้องไม่รับลิงก์รูปภายนอก").not.toBeNull();
  assertNoErrors(errs, "รูปประจำตัวผู้สนใจเป็นดีลเลอร์");
});

test("[func·hq] ตัวกรองไม่ได้ติดต่อ 7/14/30 วัน · ติดต่อล่าสุดในตาราง · แท็บประวัติ", async ({ page }) => {
  const errs = watchErrors(page);
  const sb = await db(ADMIN);
  const name = `${NS}-เงียบ20วัน`;
  const ยี่สิบวันก่อน = new Date(Date.now() - 20 * 86_400_000).toISOString();
  const { data: pr, error } = await sb.from("dealer_prospects").insert({ name, status: "contacted", created_at: ยี่สิบวันก่อน, follow_up: "2027-01-15" }).select("id").single();
  expect(error).toBeNull();
  const id = (pr as { id: number }).id;

  await loginUI(page, HQ_ORIGIN, "/hq/prospects", ADMIN);
  await page.getByLabel("ค้นหาลูกค้าเป้าหมาย").fill(name);
  const แถว = page.getByRole("row", { name: new RegExp(name) });
  await expect(แถว).toContainText("ยังไม่เคยติดต่อ", { timeout: 25_000 });

  await page.getByLabel("กรองตามสถานะ").selectOption("idle14");
  await expect(แถว, "เงียบ 20 วัน ต้องติดตัวกรอง 14 วัน").toBeVisible();
  await page.getByLabel("กรองตามสถานะ").selectOption("idle30");
  await expect(แถว, "ยังไม่ถึง 30 วัน").toHaveCount(0);
  await page.getByLabel("กรองตามสถานะ").selectOption("all");

  // บันทึกการติดต่อในแท็บ → ติดต่อล่าสุดเป็น "วันนี้" · ประวัติขึ้นในแท็บ
  //   ปุ่มลัดบนหัวแผงบอสสั่งเอาออก (14 ก.ย. 69) — ต้องไม่มีปุ่มนั้นบนหัวแผงแล้ว
  await แถว.click();
  const แผง = page.getByRole("dialog", { name: "ข้อมูลลูกค้าเป้าหมาย" });
  await expect(แผง.getByRole("button", { name: /บันทึกการติดต่อ|ออกใบค่าแฟรนไชส์/ }), "หัวแผงต้องไม่มีปุ่มลัดสองปุ่มนี้").toHaveCount(0);
  await แผง.getByRole("tab", { name: "บันทึกการติดต่อ" }).click();
  await แผง.getByRole("button", { name: "บันทึกการติดต่อ" }).first().click();
  // วันนัดที่ตั้งไว้ในภาพรวมต้องเติมมาให้ ไม่ต้องกรอกซ้ำ (บอสสั่ง 14 ก.ย. 69)
  await expect(แผง.locator("#pc-next"), "ต้องเติมวันนัดติดตามเดิมให้").toHaveValue("2027-01-15");
  await แผง.locator("#pc-channel").selectOption("Facebook");
  await แผง.locator("#pc-body").fill("ทักกลับมาถามค่าแรกเข้า");
  await แผง.getByRole("button", { name: "บันทึกการติดต่อ" }).last().click();
  await waitRow(sb, "dealer_prospect_activities", { prospect_id: id, kind: "contact" });
  await expect(แผง.getByText("ทักกลับมาถามค่าแรกเข้า")).toBeVisible({ timeout: 15_000 });
  await expect(แผง.getByText("ติดต่อทาง Facebook")).toBeVisible();
  await expect(แผง.getByText("ติดต่อล่าสุด: วันนี้")).toBeVisible({ timeout: 15_000 });
  assertNoErrors(errs, "บันทึกการติดต่อผู้สนใจเป็นดีลเลอร์");
});
