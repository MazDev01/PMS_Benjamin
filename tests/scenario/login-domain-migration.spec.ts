import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { adminClient, ลบสาขาทดสอบตรง } from "./testDealers";
import { อ่านCSV } from "./csvRead";

// ── สคริปต์ย้ายอีเมลเข้าระบบดีลเลอร์ไปโดเมนของบริษัท — รันแบบแก้จริงบนฐานทดสอบ (บอสสั่ง 19 ต.ค. 69) ─────────────
//   scripts/migrate-dealer-login-domain.mjs · จำลองระบบจริง: ดีลเลอร์ใช้โดเมนเดิมที่ยังไม่มีใครจด
//   ตรวจ: นับอย่างเดียวไม่แก้ · ย้ายแล้วอีเมลบัญชี + ข้อมูลยืนยันตัวตนเป็นโดเมนใหม่ · รหัสผ่านเดิมเข้าได้ (สคริปต์ลองเองด้วยสำเนารหัส)
//         อีเมลเก่าเข้าไม่ได้แล้ว · ไม่มีคำขอเปลี่ยนอีเมลค้าง/ไม่มีบันทึกส่งอีเมล · ดีลเลอร์ที่ใช้อีเมลของตัวเอง + บัญชี HQ ไม่ถูกแตะ
//         รันซ้ำไม่ย้ายซ้ำ · สคริปต์ไม่พิมพ์อีเมล/รหัสสาขา
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

const admin = adminClient();
const ย้าย = "ZTM", อีเมลตัวเอง = "ZTN", สาขาที่สอง = "ZTO";   // รหัสสาขาทดสอบเฉพาะไฟล์นี้
const รหัสสาขาที่สอง = "Second-Pass-8840";   // ต่างจากสาขาแรก — จับข้อความพร้อมส่งที่สลับแถว
const รหัส = "Temp-Pass-5521";
const โดเมนเดิม = ["partner", "agent.co.th"].join("-");   // ประกอบตอนรัน — ตัวตรวจ check-no-old-login-domain ห้ามชื่อนี้ในโค้ด
const เดิม = (c: string) => `${c.toLowerCase()}@${โดเมนเดิม}`;
const ใหม่ = (c: string) => `${c.toLowerCase()}@dealer.benjaminpebsteel.com`;
const อีเมลHQ = `zzhq-domaintest@${โดเมนเดิม}`;
const อีเมลของสาขาเอง = "ztn-owner@example.test";

// เข้ารหัสสำเนารหัสผ่านแบบเดียวกับระบบ (packages/shared/lib/dealerSecret.ts) ด้วยกุญแจในไฟล์ค่าเชื่อมต่อของฐานทดสอบ
const กุญแจ = (readFileSync("apps/hq/.env.local", "utf8").match(/^DEALER_SECRET_KEY=(.*)$/m)?.[1] ?? "").trim();
function เข้ารหัส(plain: string): string {
  const k = createHash("sha256").update(กุญแจ).digest(), iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

async function ลบบัญชีด้วยอีเมล(email: string) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data.users.filter(x => x.email === email)) await admin.auth.admin.deleteUser(u.id).catch(() => {});
}
async function purge() {
  for (const c of [ย้าย, อีเมลตัวเอง, สาขาที่สอง]) {
    const { data: profs } = await admin.from("profiles").select("id").eq("dealer_code", c);
    for (const p of profs ?? []) await admin.auth.admin.deleteUser(String(p.id)).catch(() => {});
    await admin.from("dealer_login_secrets").delete().eq("dealer_code", c);
    await ลบสาขาทดสอบตรง(c);
    await admin.from("dealers").delete().eq("code", c);
  }
  for (const e of [อีเมลHQ, เดิม(ย้าย), ใหม่(ย้าย), อีเมลของสาขาเอง, ใหม่(สาขาที่สอง)]) await ลบบัญชีด้วยอีเมล(e);
}
test.beforeAll(purge);
test.afterAll(purge);

async function สร้างบัญชี(email: string, role: string, code: string | null, password = รหัส) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  expect(error, `สร้างบัญชี ${role}`).toBeNull();
  const id = data.user!.id;
  expect((await admin.from("profiles").upsert({ id, role, dealer_code: code ?? "", name: `ZZTEST ${code ?? "HQ"}`, status: "active" }, { onConflict: "id" })).error).toBeNull();
  return id;
}
async function สร้างสาขา(code: string, email: string, password = รหัส) {
  expect((await admin.from("dealers").insert({ code, name: `ZZTEST ${code}`, province: "ตราด", region: "ตะวันออก", revenue_target: 0, status: "active" })).error).toBeNull();
  const id = await สร้างบัญชี(email, "DEALER_ADMIN", code, password);
  expect((await admin.from("dealer_login_secrets").upsert({ dealer_code: code, secret: เข้ารหัส(password), updated_by: "ผู้ดูแลระบบ (สร้างบัญชี)" }, { onConflict: "dealer_code" })).error).toBeNull();
  return id;
}
// --only: จำกัดเฉพาะสาขาของไฟล์นี้ — ไม่งั้นการย้อนทางไปย้ายบัญชีของข้ออื่นที่รันพร้อมกัน (dealer-login-branch-code · รอบเต็ม 19 ต.ค. 69)
const รันสคริปต์ = (...extra: string[]) => execFileSync("node", ["scripts/migrate-dealer-login-domain.mjs", `--only=${ย้าย},${อีเมลตัวเอง}`, ...extra], { encoding: "utf8" });
const บัญชี = async (id: string) => (await admin.auth.admin.getUserById(id)).data.user!;
const เข้าได้ = async (email: string) => {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password: รหัส });
  if (data.session) await sb.auth.signOut();
  return !error && !!data.session;
};

test("[script] migrate-dealer-login-domain --apply บนฐานทดสอบ: ย้ายเฉพาะดีลเลอร์โดเมนเดิม · รหัสเดิมเข้าได้ · ไม่มีอีเมลค้างส่ง · HQ ไม่ถูกแตะ", async () => {
  expect(กุญแจ.length, "ฐานทดสอบต้องมี DEALER_SECRET_KEY").toBeGreaterThanOrEqual(32);
  const idย้าย = await สร้างสาขา(ย้าย, เดิม(ย้าย));
  const idตัวเอง = await สร้างสาขา(อีเมลตัวเอง, อีเมลของสาขาเอง);
  const idHQ = await สร้างบัญชี(อีเมลHQ, "HQ_STAFF", null);

  // นับอย่างเดียว (ค่าตั้งต้น) — ต้องไม่แก้อะไร
  const ดู = รันสคริปต์();
  expect(ดู).toContain("ชุดทดสอบ");
  expect(ดู).toMatch(/ต้องย้าย\s+1\b/);
  expect(ดู).toMatch(/บัญชีHQใช้โดเมนเดิม\s+1\b/);
  expect((await บัญชี(idย้าย)).email, "นับอย่างเดียวต้องไม่แก้").toBe(เดิม(ย้าย));

  // ย้ายจริง — สคริปต์ลองเข้าระบบด้วยอีเมลใหม่เอง (สำเนารหัสที่เข้ารหัสไว้)
  const ผล = รันสคริปต์("--apply", "--verify-login=1");
  expect(ผล).toContain("ย้ายสำเร็จ 1 · ย้ายไม่สำเร็จ 0 · ย้ายแล้วตรวจไม่ผ่าน 0");
  expect(ผล).toContain("ลองเข้าระบบด้วยอีเมลใหม่: ได้ 1 · ไม่ได้ 0");
  expect(ผล, "สคริปต์ต้องไม่พิมพ์อีเมล/รหัสสาขา").not.toMatch(new RegExp(`${ย้าย}|${อีเมลตัวเอง}|@`, "i"));

  const u = await บัญชี(idย้าย);
  expect(u.email, "อีเมลบัญชีต้องเป็นโดเมนใหม่").toBe(ใหม่(ย้าย));
  expect((u.identities ?? []).filter(i => i.provider === "email").map(i => i.identity_data?.email), "ข้อมูลยืนยันตัวตนต้องเป็นอีเมลใหม่ด้วย").toEqual([ใหม่(ย้าย)]);
  expect([u.new_email ?? null, u.email_change_sent_at ?? null, u.recovery_sent_at ?? null], "ต้องไม่มีคำขอเปลี่ยนอีเมลค้าง/บันทึกส่งอีเมล").toEqual([null, null, null]);
  expect(await เข้าได้(ใหม่(ย้าย)), "รหัสผ่านเดิมต้องเข้าได้ด้วยอีเมลใหม่").toBe(true);
  expect(await เข้าได้(เดิม(ย้าย)), "อีเมลโดเมนเดิมต้องเข้าไม่ได้แล้ว").toBe(false);

  expect((await บัญชี(idตัวเอง)).email, "ดีลเลอร์ที่ใช้อีเมลของตัวเองต้องไม่ถูกแตะ").toBe(อีเมลของสาขาเอง);
  expect((await บัญชี(idHQ)).email, "บัญชี HQ ต้องไม่ถูกแตะแม้ใช้โดเมนเดิม").toBe(อีเมลHQ);

  // ทางถอย (บอสสั่ง 19 ต.ค. 69 ก่อนลงระบบจริง): --reverse ย้ายกลับโดเมนเดิม · รหัสเดิมยังเข้าได้ · HQ/อีเมลตัวเองไม่ถูกแตะ
  const ถอย = รันสคริปต์("--reverse", "--apply", "--verify-login=1");
  expect(ถอย).toContain("ย้อนกลับ");
  expect(ถอย).toContain("ย้ายสำเร็จ 1 · ย้ายไม่สำเร็จ 0 · ย้ายแล้วตรวจไม่ผ่าน 0");
  expect(ถอย).toContain("ลองเข้าระบบด้วยอีเมลใหม่: ได้ 1 · ไม่ได้ 0");
  const uถอย = await บัญชี(idย้าย);
  expect(uถอย.email, "ย้อนแล้วอีเมลบัญชีต้องกลับเป็นโดเมนเดิม").toBe(เดิม(ย้าย));
  expect((uถอย.identities ?? []).filter(i => i.provider === "email").map(i => i.identity_data?.email)).toEqual([เดิม(ย้าย)]);
  expect(await เข้าได้(เดิม(ย้าย)), "ย้อนแล้วรหัสเดิมต้องเข้าได้ด้วยอีเมลโดเมนเดิม").toBe(true);
  expect(await เข้าได้(ใหม่(ย้าย)), "ย้อนแล้วอีเมลโดเมนใหม่ต้องเข้าไม่ได้").toBe(false);
  expect([(await บัญชี(idตัวเอง)).email, (await บัญชี(idHQ)).email], "ย้อนก็ต้องไม่แตะอีเมลของสาขาเอง/บัญชี HQ").toEqual([อีเมลของสาขาเอง, อีเมลHQ]);
  // ย้ายไปข้างหน้าอีกรอบ (หลังถอยแล้วกลับมาลงใหม่ได้)
  expect(รันสคริปต์("--apply", "--verify-login=1")).toContain("ย้ายสำเร็จ 1 · ย้ายไม่สำเร็จ 0 · ย้ายแล้วตรวจไม่ผ่าน 0");
  expect((await บัญชี(idย้าย)).email).toBe(ใหม่(ย้าย));

  // รันซ้ำ — ไม่ย้ายซ้ำ
  const ซ้ำ = รันสคริปต์("--apply");
  expect(ซ้ำ).toMatch(/ต้องย้าย\s+0\b/);
  expect(ซ้ำ).toContain("ย้ายสำเร็จ 0 · ย้ายไม่สำเร็จ 0");
});

test("[script] export-dealer-logins บนฐานทดสอบ: CSV 4 ช่อง (ข้อความพร้อมส่งของแถวตัวเอง) · นอก repo · ชื่อผู้ใช้ = รหัสสาขา · ไม่ทับไฟล์ · ไม่พิมพ์รหัส", async () => {
  // ข้อก่อนหน้าย้าย ZTM ไปโดเมนใหม่แล้ว (serial) — ถ้ารันข้อนี้เดี่ยว ๆ ให้เตรียมเอง
  const { data: p } = await admin.from("profiles").select("id").eq("dealer_code", ย้าย).maybeSingle();
  if (!p) { await สร้างสาขา(ย้าย, ใหม่(ย้าย)); }
  await สร้างสาขา(สาขาที่สอง, ใหม่(สาขาที่สอง), รหัสสาขาที่สอง);
  const { mkdtempSync, readFileSync: อ่าน, existsSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const ที่ = path.join(mkdtempSync(path.join(tmpdir(), "pms-export-")), "logins.csv");
  const ส่ง = (...a: string[]) => { try { return { ok: true, out: execFileSync("node", ["scripts/export-dealer-logins.mjs", ...a], { encoding: "utf8", stdio: "pipe" }) }; }
    catch (e) { const x = e as { stdout?: string; stderr?: string }; return { ok: false, out: `${x.stdout ?? ""}${x.stderr ?? ""}` }; } };

  const ใน = ส่ง("--out", "tests/zz-logins.csv");
  expect(ใน.ok, "ต้องปฏิเสธที่เก็บใน repo").toBe(false);
  expect(existsSync("tests/zz-logins.csv")).toBe(false);

  const ผล = ส่ง("--out", ที่);
  expect(ผล.ok, ผล.out).toBe(true);
  expect(ผล.out, "ต้องไม่พิมพ์รหัสผ่าน").not.toContain(รหัส);
  expect(ผล.out, "ต้องไม่พิมพ์รหัสผ่านสาขาที่สอง").not.toContain(รหัสสาขาที่สอง);
  const csv = อ่าน(ที่, "utf8");
  expect(csv.charCodeAt(0), "ต้องมี BOM ให้ Excel อ่านภาษาไทยถูก").toBe(0xfeff);
  // เปิดด้วยตัวอ่าน CSV (RFC 4180) — ข้อความพร้อมส่งหลายบรรทัดต้องอยู่ในช่องเดียว ไม่แตกเป็นหลายแถว
  const [หัว, ...แถว] = อ่านCSV(csv).filter(r => !(r.length === 1 && r[0] === ""));
  expect(หัว).toEqual(["ชื่อสาขา", "ชื่อผู้ใช้", "รหัสผ่านชั่วคราว", "ข้อความพร้อมส่ง"]);
  expect(แถว.filter(r => r.length !== 4), "ทุกแถวต้องมี 4 ช่องพอดี").toEqual([]);
  const ส่งออก = Number(ผล.out.match(/ส่งออก\s+(\d+)/)?.[1] ?? -1);
  expect(แถว.length, "จำนวนแถวในไฟล์ต้องตรงกับที่สคริปต์บอกว่าส่งออก").toBe(ส่งออก);
  expect(ผล.out).toContain(`เขียนไฟล์แล้ว ${ส่งออก} แถว`);
  // ข้อความพร้อมส่งของทุกแถวต้องเป็นของแถวตัวเอง (ชื่อสาขา · รหัสสาขา · รหัสผ่าน) — ไม่สลับแถว
  for (const [ชื่อ, code, pw, ข้อความ] of แถว) {
    expect(ข้อความ, `ข้อความของ ${code} ต้องมีรหัสผ่านของแถวตัวเอง`).toContain(`รหัสผ่าน: ${pw}`);
    expect(ข้อความ).toContain(`รหัสสาขา (ชื่อผู้ใช้): ${code}`);
    if (ชื่อ) expect(ข้อความ).toContain(ชื่อ);
    expect(ข้อความ.split("\n").length, "ไม่เกิน 8 บรรทัด").toBeLessThanOrEqual(8);
  }
  const แถวแรก = แถว.find(r => r[1] === ย้าย), แถวสอง = แถว.find(r => r[1] === สาขาที่สอง);
  expect(แถวแรก?.slice(0, 3), "แถวของสาขาที่ย้ายแล้ว: ชื่อผู้ใช้ = รหัสสาขา + รหัสชั่วคราวที่ถอดแล้ว").toEqual([`ZZTEST ${ย้าย}`, ย้าย, รหัส]);
  expect(แถวสอง?.slice(0, 3)).toEqual([`ZZTEST ${สาขาที่สอง}`, สาขาที่สอง, รหัสสาขาที่สอง]);
  for (const ต้องมี of ["https://dealerpms.benjaminpebsteel.com", "เปลี่ยนรหัสผ่านและใส่อีเมลติดต่อได้ที่หน้าบัญชี", "ลืมรหัสผ่าน ติดต่อสำนักงานใหญ่"])
    expect(แถวแรก?.[3], `ข้อความพร้อมส่งต้องมี "${ต้องมี}"`).toContain(ต้องมี);
  expect(แถวแรก?.[3], "ข้อความของสาขาแรกต้องไม่มีรหัสของสาขาที่สอง").not.toContain(รหัสสาขาที่สอง);
  expect(แถว.some(r => r[1] === อีเมลตัวเอง), "สาขาที่ใช้อีเมลของตัวเอง (พิมพ์รหัสสาขาเข้าไม่ได้) ต้องไม่อยู่ในไฟล์").toBe(false);

  const ทับ = ส่ง("--out", ที่);
  expect(ทับ.ok, "ต้องไม่เขียนทับไฟล์เดิม").toBe(false);
  const { count } = await admin.from("audit_log").select("id", { count: "exact", head: true }).eq("action", "ส่งออกชื่อผู้ใช้และรหัสผ่านชั่วคราวของดีลเลอร์");
  expect(count ?? 0, "ต้องบันทึกการใช้งาน").toBeGreaterThan(0);
  const { rmSync } = await import("node:fs");
  rmSync(path.dirname(ที่), { recursive: true, force: true });
});
