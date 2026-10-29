import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CNX, skipReason, SUPABASE_URL } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { db, HQ_ORIGIN } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { ถือแถวกลางชดเวลา } from "./sharedRowLock";

// ── คำขอเกิน 14 วัน → อีเมลสรุปจริงหนึ่งฉบับต่อวัน (เงื่อนไขปิดด่าน 1 · รอบ 4 ใบ 0231: สรุปรวมวันละครั้ง ไม่แจ้งทีละคำขอ) ──────
//
// เส้นทางจริงทั้งเส้น: คำขอเลยกำหนด → งานตั้งเวลา /api/cron/send-email → ตรวจคำขอเกินกำหนด → วางจดหมายในกล่องขาออก
//   → ส่งทาง SMTP → ถึงกล่องจดหมายทดสอบของฐานในเครื่อง (Mailpit) · ไม่ใช่แค่แจ้งในระบบ
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.describe.configure({ mode: "serial" });

function ค่าในไฟล์(key: string): string {
  if (process.env[key]) return process.env[key]!;
  try {
    const m = readFileSync(path.join(__dirname, "../../apps/hq/.env.local"), "utf8").match(new RegExp(`^${key}=(.*)$`, "m"));
    return (m?.[1] ?? "").trim();
  } catch { return ""; }
}
const CRON_SECRET = ค่าในไฟล์("CRON_SECRET");
const MAIL = process.env.PMS_MAIL_URL ?? SUPABASE_URL.replace(/:(\d+)\/?$/, (_m, p) => `:${Number(p) + 3}`);
// ผู้รับของรอบนี้เท่านั้น — ไม่ต้องล้างกล่องจดหมายทดสอบทั้งกล่อง (เดิมล้างทั้งกล่อง = อีเมลที่ข้ออื่นกำลังรอหายไป · 29 ต.ค. 69)
const ผู้รับ = `zztest-hq-overdue-${Date.now() % 1_000_000}@example.test`;
const admin = adminClient();
let เดิม: string[] = [];
let คำขอ = 0;
let ลีด = 0;
let ปล่อยแถว = () => {};

test.beforeAll(async () => {
  // ผู้รับอีเมล HQ เป็นแถวเดียวทั้งระบบ — 3 ไฟล์ตั้งค่าแถวนี้ (email-outbox-cron · hq-email-recipients · quote-request-flow) ต่อคิวกัน
  ปล่อยแถว = await ถือแถวกลางชดเวลา(test, "hq_notif_rules")   // + สรุปคำขอค้างรายวัน (requests_overdue) ที่ข้อนี้ล้างแล้วสร้างใหม่;
  const { data } = await admin.from("hq_notif_rules").select("email_recipients").eq("id", 1).single();
  เดิม = (data?.email_recipients as string[]) ?? [];
});
test.afterAll(async () => {
  await admin.from("hq_notif_rules").update({ email_recipients: เดิม }).eq("id", 1);
  // สรุปคำขอค้างรายวัน (ใบ 0231) อ้างคำขอด้วยข้อความ ไม่ใช่ ref_id — ลบตามผู้รับทดสอบ (check-test-leftovers จับได้ 21 ต.ค. 69)
  await admin.from("email_outbox").delete().eq("to_email", ผู้รับ);
  if (คำขอ) {
    await admin.from("email_outbox").delete().eq("ref_table", "quote_requests").eq("ref_id", String(คำขอ));
    await admin.from("notifications").delete().like("dedupe_key", `%:${คำขอ}`);
    await admin.from("quote_requests").delete().eq("id", คำขอ);
  }
  if (ลีด) await admin.from("leads").delete().eq("dealer_code", "CNX").eq("num_id", ลีด);
  ปล่อยแถว();
});

test("[email] งานตั้งเวลาต้องมีกุญแจ — คนนอกสั่งให้ระบบส่งอีเมลไม่ได้", async ({ request }) => {
  expect((await request.get(`${HQ_ORIGIN}/api/cron/send-email`)).status()).toBe(401);
  expect((await request.get(`${HQ_ORIGIN}/api/cron/send-email`, { headers: { authorization: "Bearer wrong-secret" } })).status()).toBe(401);
});

test("[email] คำขอเกิน 14 วัน → อีเมลสรุปถึงผู้รับของ HQ หนึ่งฉบับจริง และไม่ส่งซ้ำ", async ({ request }) => {
  test.skip(!CRON_SECRET, "ยังไม่ได้ตั้ง CRON_SECRET ใน apps/hq/.env.local");
  // สรุปรายวันเริ่มแจ้ง 07:00 น. เวลาไทย (ไม่ปลุกตอนดึก · notifications_scan) — ก่อนนั้นไม่มีอะไรให้ตรวจ
  test.skip(new Date(Date.now() + 7 * 3_600_000).getUTCHours() < 7, "ก่อน 07:00 น. เวลาไทย งานตั้งเวลายังไม่สรุปคำขอค้าง");
  test.skip(!(await fetch(`${MAIL}/api/v1/messages?limit=1`).then(r => r.ok, () => false)), `ไม่พบกล่องจดหมายทดสอบที่ ${MAIL}`);
  expect((await admin.from("hq_notif_rules").update({ email_recipients: [ผู้รับ] }).eq("id", 1)).error).toBeNull();

  // ดีลเลอร์ส่งคำขอจริง (ผ่านคำสั่งของระบบ ด้วยใบผ่านของดีลเลอร์)
  //   ใช้ลีดของข้อนี้เอง (เดิมหยิบลีด CNX ตัวแรกของข้อมูลตั้งต้น — ข้ออื่นที่ใช้ลีดนั้นเห็นสถานะเปลี่ยนกลางทาง · 29 ต.ค. 69)
  const cnx = await db(CNX);
  ลีด = 978_500_000 + (Date.now() % 99_999);
  const ใส่ = await cnx.from("leads").insert({ id: `#L-${ลีด}`, num_id: ลีด, dealer_code: "CNX", company: `ZZTEST-สรุปค้าง-${ลีด}`,
    name: `ZZTEST-สรุปค้าง-${ลีด}`, contact: "ผู้ทดสอบ", phone: "000-000-0014", province: "เชียงใหม่", product: "โกดังสำเร็จรูป", status: "BULLET" });
  expect(ใส่.error, `เตรียมลีดของข้อนี้ (${ใส่.error?.message ?? ""})`).toBeNull();
  const ส่ง = await cnx.rpc("quote_request_submit", { p_lead_num_id: ลีด, p_product: "โกดังและคลังสินค้า" });
  expect(ส่ง.error, `ดีลเลอร์ส่งคำขอต้องผ่าน (${ส่ง.error?.message})`).toBeNull();
  const r = ส่ง.data as { id: number; request_no: string };
  คำขอ = r.id;

  // เลื่อนกำหนดส่งให้เลยมาแล้ว (จำลองเวลาผ่านไป 14 วัน)
  await admin.from("quote_requests").update({ due_at: new Date(Date.now() - 3_600_000).toISOString() }).eq("id", r.id);
  // สรุปวันนี้อาจถูกสร้างไปแล้วจากรอบทดสอบก่อนหน้า (กันซ้ำวันละครั้ง) — ล้างของวันนี้ก่อน ให้รอบนี้ได้สรุปใหม่ที่มีคำขอนี้
  await admin.from("notifications").delete().eq("kind", "requests_overdue");
  await admin.from("email_outbox").delete().eq("kind", "requests_overdue");

  const รอบ1 = await request.get(`${HQ_ORIGIN}/api/cron/send-email`, { headers: { authorization: `Bearer ${CRON_SECRET}` }, timeout: 60_000 });
  expect(รอบ1.status(), await รอบ1.text()).toBe(200);
  expect((await รอบ1.json()).ข้าม, "ต้องตั้งค่า SMTP ในเครื่องแล้ว").toBe("");

  const ในกล่อง = async () => {
    const j = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:${ผู้รับ}`)}`)).json() as { messages?: { Subject: string }[] };
    return (j.messages ?? []).map(m => m.Subject);
  };
  const สรุป = async () => (await ในกล่อง()).filter(s => s.startsWith("คำขอค้างเกิน 14 วัน"));
  await expect.poll(async () => (await สรุป()).length, { timeout: 20_000, message: "อีเมลสรุปคำขอค้างต้องถึงกล่องจดหมาย" }).toBe(1);

  const { data: แถว } = await admin.from("email_outbox").select("kind, status, body").eq("kind", "requests_overdue").eq("to_email", ผู้รับ);
  expect(แถว?.map(x => x.status), "กล่องขาออกบันทึกว่าส่งแล้ว").toEqual(["sent"]);
  expect(แถว?.[0]?.body ?? "", "สรุปมีเลขคำขอที่ค้าง").toContain(r.request_no);

  // รอบถัดไปวันเดียวกัน: ไม่มีสรุปซ้ำ
  await request.get(`${HQ_ORIGIN}/api/cron/send-email`, { headers: { authorization: `Bearer ${CRON_SECRET}` } });
  expect((await สรุป()).length, "สรุปคำขอค้างแจ้งวันละครั้ง").toBe(1);
  expect((await ในกล่อง()).some(s => s.startsWith("คำขอราคาใหม่") && s.includes(r.request_no)), "คำขอใหม่ก็ถูกส่งถึง HQ ด้วย (H1)").toBe(true);
});
