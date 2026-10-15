import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ADMIN, skipReason } from "./supabaseEnv";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { HQ_ORIGIN, loginUI, watchErrors, assertNoErrors, waitRow, specNS, db } from "./funcHelpers";
import { กดตกลงในกล่องยืนยัน } from "./helpers";
import { ลบสาขาทดสอบตรง } from "./testDealers";

// ── ด่าน 4 · "หาดีลเลอร์ใหม่" ทั้งเส้นบนหน้าจอ ตามลำดับกล่องใน FLOW.html ช่วงที่ 1 ──────────────────────────────
//   1) ผู้สนใจ: ข้อมูลติดต่อ · จังหวัด · แหล่งที่มา · ผู้ดูแลฝั่ง HQ
//   2) ติดตาม / นัดคุย: ขยับสถานะใน pipeline (ติดต่อครั้งแรก → ส่งข้อมูลบริษัท → นัดคุย)
//   3) ใบค่าแฟรนไชส์: ออกใบ → ส่ง · ส่งแล้วแก้ไม่ได้ ต้องทำเวอร์ชันใหม่ (ใบเดิม = ถูกแทนด้วยเวอร์ชันใหม่)
//   4) ปฏิเสธ → ปิดพร้อมเหตุผล (กลับไปนัดคุย) · ทำเวอร์ชันใหม่เจรจาต่อ   [หมดอายุ → ปิดพร้อมเหตุผล: ยิงตรงฐานใน franchise_proposal_rules.sql]
//   5) แปลงเป็นดีลเลอร์: สร้างบัญชีอัตโนมัติ · HQ กำหนดจังหวัดที่ดูแล (หนึ่งจังหวัด หนึ่งดีลเลอร์) · เป้าสาขา = เป้าในใบ
// "ตกลง + ชำระ" รอบอสกำหนดว่าการชำระต้องเก็บอะไร (ถาม 15 ต.ค. 69) — ตอนนี้แปลงได้เมื่อมีใบที่ส่งแล้ว (ใบนั้นกลายเป็นตอบรับ)
// อยู่โปรเจกต์ hq-settings (workers: 1): ฟอร์มใบเติมค่าตั้งต้นจากตั้งค่า › หาดีลเลอร์ ซึ่งไฟล์อื่นในกลุ่มแก้อยู่
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(240_000);

const NS = specNS("RECRUIT");
const ชื่อ = `${NS}-ผู้สนใจครบเส้น`;
const CODE = "ZTH";              // รหัสสาขาทดสอบเฉพาะไฟล์นี้
const จังหวัด = "จันทบุรี";        // ภาคตะวันออก · ยังไม่มีดีลเลอร์ดูแลในชุดทดสอบ
const svc = () => createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function purge() {
  if (!ADMIN_SERVICE_ROLE_KEY) return;
  const admin = svc();
  const { data: profs } = await admin.from("profiles").select("id").eq("dealer_code", CODE);
  for (const p of profs ?? []) await admin.auth.admin.deleteUser(String(p.id)).catch(() => {});
  await ลบสาขาทดสอบตรง(CODE);
  await admin.from("dealers").delete().eq("code", CODE);
  // ใบที่ส่งแล้วลบไม่ได้ (ตั้งใจ) — ลบผู้สนใจแล้วใบตามไปเอง (on delete cascade · ตัวดักลบเฉพาะชั้นแรก)
  await admin.from("dealer_prospects").delete().like("name", `${NS}%`);
}
test.beforeAll(purge);
test.afterAll(purge);

test("[flow·hq] หาดีลเลอร์ใหม่ครบเส้น: ผู้สนใจ → นัดคุย → ใบค่าแฟรนไชส์ (เวอร์ชันใหม่ · ปฏิเสธพร้อมเหตุผล) → แปลงเป็นดีลเลอร์ + จังหวัดที่ดูแล", async ({ page }) => {
  test.skip(!ADMIN_SERVICE_ROLE_KEY, "เครื่องนี้ยังไม่ได้ตั้ง service_role");
  const errs = watchErrors(page);
  const sb = await db(ADMIN);

  // ── 1) ผู้สนใจ ───────────────────────────────────────────────────────────────────────────────
  await loginUI(page, HQ_ORIGIN, "/hq/prospects", ADMIN);
  await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
  const แผง = page.getByRole("dialog", { name: "ข้อมูลลูกค้าเป้าหมาย" });
  await แผง.locator("#pr-name").fill(ชื่อ);
  await แผง.locator("#pr-phone").fill("089 111 2233");
  await แผง.locator("#pr-region").selectOption("ตะวันออก");
  await แผง.locator("#pr-province").selectOption(จังหวัด);
  await แผง.locator("#pr-channel").selectOption({ index: 1 });
  await แผง.locator("#pr-assigned").selectOption({ index: 1 });
  await แผง.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).click();
  const ราย = await waitRow<{ id: number; status: string; province: string; channel: string | null; assigned: string | null }>(sb, "dealer_prospects", { name: ชื่อ });
  expect(ราย.status).toBe("new");
  expect(ราย.province).toBe(จังหวัด);
  expect(ราย.channel, "แหล่งที่มาต้องบันทึก").toBeTruthy();
  expect(ราย.assigned, "ผู้ดูแลฝั่ง HQ ต้องบันทึก").toBeTruthy();

  // ── 2) ติดตาม / นัดคุย ─────────────────────────────────────────────────────────────────────────
  await expect(แผง.getByRole("tab", { name: "งาน/ความคืบหน้า" })).toHaveAttribute("aria-selected", "true", { timeout: 15_000 });
  await แผง.getByRole("checkbox", { name: "ติดต่อครั้งแรก" }).click();
  await แผง.locator("#pc-channel").selectOption("โทรศัพท์");
  await แผง.locator("#pc-body").fill("สนใจเป็นดีลเลอร์ภาคตะวันออก");
  await แผง.getByRole("button", { name: "บันทึกการติดต่อ" }).last().click();
  await waitRow(sb, "dealer_prospects", { id: ราย.id, status: "contacted" });
  await แผง.getByRole("tab", { name: "งาน/ความคืบหน้า" }).click();
  await แผง.getByRole("checkbox", { name: "ส่งข้อมูลบริษัท" }).click();
  await waitRow(sb, "dealer_prospects", { id: ราย.id, status: "profile_sent" });
  await แผง.getByRole("checkbox", { name: "นัดคุยรายละเอียด" }).click();
  await waitRow(sb, "dealer_prospects", { id: ราย.id, status: "meeting" });

  // ── 3) ใบค่าแฟรนไชส์ V1 → ส่ง ──────────────────────────────────────────────────────────────────
  await แผง.getByRole("tab", { name: /ใบค่าแฟรนไชส์/ }).click();
  await แผง.getByRole("button", { name: "ออกใบค่าแฟรนไชส์" }).click();
  let ฟอร์ม = แผง.getByRole("region", { name: "ใบค่าแฟรนไชส์" });
  await ฟอร์ม.locator("#pp-package").selectOption("standard");
  await ฟอร์ม.locator("#pp-amount").fill("300000");
  await ฟอร์ม.locator("#pp-months").fill("12");
  await ฟอร์ม.locator("#pp-target").fill("6000000");
  await ฟอร์ม.getByRole("button", { name: "บันทึกใบ" }).click();
  const v1 = await waitRow<{ id: number; proposal_no: string }>(sb, "dealer_package_proposals", { prospect_id: ราย.id, status: "draft" });
  await แผง.getByLabel(`สถานะใบ ${v1.proposal_no}`).selectOption("sent");
  await กดตกลงในกล่องยืนยัน(page);
  await waitRow(sb, "dealer_package_proposals", { id: v1.id, status: "sent" });
  await waitRow(sb, "dealer_prospects", { id: ราย.id, status: "considering" });
  await expect(แผง.getByLabel(`แก้ไขใบ ${v1.proposal_no}`), "ส่งแล้วแก้ไม่ได้ — ไม่มีปุ่มแก้").toHaveCount(0);

  // ── ส่งแล้วแก้ไม่ได้ → ทำเวอร์ชันใหม่ (V2) ลดค่าแรกเข้า แล้วส่ง → V1 ถูกแทน ──────────────────────────────────
  await แผง.getByRole("button", { name: `ทำเวอร์ชันใหม่จากใบ ${v1.proposal_no}` }).click();
  await กดตกลงในกล่องยืนยัน(page);
  ฟอร์ม = แผง.getByRole("region", { name: "ใบค่าแฟรนไชส์" });
  await expect(ฟอร์ม, "ทำเวอร์ชันใหม่แล้วเปิดร่างให้แก้ทันที").toBeVisible({ timeout: 15_000 });
  await expect(ฟอร์ม.locator("#pp-amount"), "เวอร์ชันใหม่คัดลอกเนื้อหาเดิม").toHaveValue("300,000");
  await ฟอร์ม.locator("#pp-amount").fill("250000");
  await ฟอร์ม.getByRole("button", { name: "บันทึกใบ" }).click();
  const v2no = `${v1.proposal_no}-V2`;
  // รอจนยอดใหม่ลงฐาน (ร่างเกิดทันทีตอนกดทำเวอร์ชันใหม่ — รอแค่ "มีร่าง" แล้วกดส่งต่อ = ส่งระหว่างที่บันทึกยังไม่เสร็จ)
  const v2 = await waitRow<{ id: number; version: number; supersedes_id: number }>(sb, "dealer_package_proposals", { proposal_no: v2no, status: "draft", amount: 250000 });
  expect(v2.version).toBe(2);
  expect(v2.supersedes_id).toBe(v1.id);
  await แผง.getByLabel(`สถานะใบ ${v2no}`).selectOption("sent");
  await กดตกลงในกล่องยืนยัน(page);
  await waitRow(sb, "dealer_package_proposals", { id: v2.id, status: "sent" });
  await waitRow(sb, "dealer_package_proposals", { id: v1.id, status: "superseded" });

  // ── 4) ปฏิเสธ → ปิดพร้อมเหตุผล ─────────────────────────────────────────────────────────────────
  await แผง.getByLabel(`สถานะใบ ${v2no}`).selectOption("rejected");
  const ถาม = page.getByRole("alertdialog", { name: `ปฏิเสธใบ ${v2no} ?` });
  await expect(ถาม).toBeVisible();
  await expect(ถาม.getByRole("button", { name: "ปฏิเสธใบนี้" }), "ยังไม่กรอกเหตุผล กดปฏิเสธไม่ได้").toBeDisabled();
  await ถาม.getByLabel("เหตุผลที่ปฏิเสธ").fill("ค่าแรกเข้ายังสูงเกินงบ");
  await ถาม.getByRole("button", { name: "ปฏิเสธใบนี้" }).click();
  await waitRow(sb, "dealer_package_proposals", { id: v2.id, status: "rejected", close_reason: "ค่าแรกเข้ายังสูงเกินงบ" });
  await expect(แผง.getByTestId(`เหตุผลปิด-${v2no}`)).toHaveText("เหตุผล: ค่าแรกเข้ายังสูงเกินงบ");
  await waitRow(sb, "dealer_prospects", { id: ราย.id, status: "meeting" });

  // เจรจาต่อ: เวอร์ชัน 3 จากใบที่ปฏิเสธ → ส่ง
  await แผง.getByRole("button", { name: `ทำเวอร์ชันใหม่จากใบ ${v2no}` }).click();
  await กดตกลงในกล่องยืนยัน(page);
  ฟอร์ม = แผง.getByRole("region", { name: "ใบค่าแฟรนไชส์" });
  await ฟอร์ม.locator("#pp-amount").fill("200000");
  await ฟอร์ม.getByRole("button", { name: "บันทึกใบ" }).click();
  const v3no = `${v1.proposal_no}-V3`;
  const v3 = await waitRow<{ id: number }>(sb, "dealer_package_proposals", { proposal_no: v3no, status: "draft", amount: 200000 });
  await แผง.getByLabel(`สถานะใบ ${v3no}`).selectOption("sent");
  await กดตกลงในกล่องยืนยัน(page);
  await waitRow(sb, "dealer_package_proposals", { id: v3.id, status: "sent" });
  expect((await svc().from("dealer_package_proposals").select("status").eq("id", v2.id).single()).data?.status,
    "ส่งเวอร์ชันใหม่ ใบที่ปฏิเสธแล้วคงเป็นปฏิเสธ").toBe("rejected");

  // ── 5) แปลงเป็นดีลเลอร์ + จังหวัดที่ดูแล ───────────────────────────────────────────────────────────
  await แผง.getByRole("button", { name: "ตั้งเป็นดีลเลอร์" }).first().click();
  const ตั้ง = page.getByRole("dialog", { name: "ตั้งเป็นดีลเลอร์" });
  const กลุ่มพื้นที่ = ตั้ง.getByRole("group", { name: /จังหวัดที่ดูแล/ });
  await expect(กลุ่มพื้นที่.getByLabel(`ดูแลจังหวัด ${จังหวัด}`), "จังหวัดของผู้สนใจที่ยังว่าง ถูกเลือกไว้ให้").toBeChecked({ timeout: 15_000 });
  await expect(ตั้ง.getByText(/เป้ายอดขายรายปีของสาขาจะตั้งตามใบเสนอ .*฿6,000,000/)).toBeVisible();
  await ตั้ง.locator("#cv-code").fill(CODE);
  await ตั้ง.getByRole("button", { name: "สร้างดีลเลอร์" }).click();
  await expect(page.getByText("สร้างดีลเลอร์สำเร็จ")).toBeVisible({ timeout: 30_000 });

  await waitRow(sb, "dealer_prospects", { id: ราย.id, status: "won", dealer_code: CODE });
  await waitRow(sb, "dealer_package_proposals", { id: v3.id, status: "accepted" });
  const admin = svc();
  const { data: สาขา } = await admin.from("dealers").select("revenue_target, package, status").eq("code", CODE).single();
  expect(สาขา, "สาขาใหม่: เป้า = เป้าในใบ · แพ็กเกจตามใบ").toEqual({ revenue_target: 6_000_000, package: "standard", status: "active" });
  const { data: พื้นที่ } = await admin.from("dealer_territories").select("province").eq("dealer_code", CODE);
  expect(พื้นที่, "HQ กำหนดจังหวัดที่ดูแลตอนแปลง").toEqual([{ province: จังหวัด }]);
  const { data: บัญชี } = await admin.from("profiles").select("role, status").eq("dealer_code", CODE);
  expect(บัญชี, "สร้างบัญชี DEALER_ADMIN อัตโนมัติ").toEqual([{ role: "DEALER_ADMIN", status: "active" }]);
  await page.getByRole("button", { name: "เสร็จแล้ว" }).click();

  assertNoErrors(errs, "หาดีลเลอร์ใหม่ครบเส้น");
});
