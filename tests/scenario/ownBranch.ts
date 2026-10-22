// ── สาขาทดสอบของชุดเอง (บอสสั่ง 22 ต.ค. 69: ชุดที่รันพร้อมกันใช้คนละบัญชี · ห้ามเพิ่มเพดานคำขอ) ─────────────────────
//
// ทำไม: เพดานคำขอของเว็บ (server/v1/_ctx.ts) นับ "ต่อบัญชี" — เขียน 300 ครั้ง/นาที เหมือนเว็บจริง
//   ทั้งรอบตรวจเต็มเข้าระบบด้วยบัญชีดีลเลอร์ RYG บัญชีเดียว (3 ชุดพร้อมกัน) → ช่วงที่หลายชุดเขียนพร้อมกันชนเพดาน
//   ชุดที่เขียนตรงจังหวะนั้นได้ 429 แล้วตก (quote-version-vat ตกแบบนี้ในรอบตรวจรอบ 4 · ดู BACKLOG)
// ทำไมไม่แจกบัญชี RYG ให้ทุกชุด: ฐานบังคับหนึ่งสาขามีบัญชีเดียว (profiles_dealer_code_unique · ใบ 0105 · กติกาธุรกิจ)
//   บัญชีใหม่ = สาขาใหม่ — ชุดที่ใช้ตัวช่วยนี้จึงมีสาขาชั่วคราวของตัวเอง ถังโควตาแยกจาก RYG (ไม่โดนชุดอื่นเบียด และไม่เบียดชุดอื่น)
// สร้างผ่านคำสั่งสร้างดีลเลอร์ของ HQ (ทางเดียวกับของจริง · ชุดทดสอบโหลด multi-dealer-stress ใช้ทางนี้) + จังหวัดที่ดูแล
// เก็บกวาด: ลบใบ HQ/ใบลูกค้าของลีดที่ชุดสร้าง แล้วลบสาขาทั้งสาขา · ค้างจากรอบที่ล้ม → ลบก่อนสร้างใหม่ + global-teardown กวาดซ้ำ
import { ADMIN, type Account } from "./supabaseEnv";
import { HQ_ORIGIN, db, ลูกค้าเป้าหมายรองรับสาขา } from "./funcHelpers";
import { adminClient, เป็นรหัสสาขาทดสอบ, ลบสาขาทดสอบตรง } from "./testDealers";
import { ล้างใบHQทดสอบ } from "./legacyQuotes";

export type บัญชีสาขาของชุด = Account & { code: string };

/** สร้างสาขาทดสอบ + บัญชีดีลเลอร์ของชุด (ดูแลจังหวัด province) — รหัสต้องเป็นรหัสสาขาทดสอบ (ZZ…) */
export async function สร้างสาขาของชุด(code: string, province = "ระยอง"): Promise<บัญชีสาขาของชุด> {
  if (!เป็นรหัสสาขาทดสอบ(code)) throw new Error(`รหัส ${code} ไม่ใช่รหัสสาขาทดสอบ (ต้องขึ้นต้น ZZ/ZT)`);
  const ค้าง = await ลบสาขาทดสอบตรง(code);
  if (ค้าง.length) throw new Error(`ลบสาขาทดสอบ ${code} ที่ค้างจากรอบก่อนไม่หมด: ${ค้าง.join(" · ")}`);
  const token = (await (await db(ADMIN)).auth.getSession()).data.session?.access_token ?? "";
  if (!token) throw new Error("ไม่มีใบผ่านของ HQ — สร้างสาขาไม่ได้");
  const res = await fetch(`${HQ_ORIGIN}/api/admin/dealers`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ code, name: `ZZTEST-สาขาของชุด-${code}`, province, region: "ตะวันออก", revenueTarget: 0, status: "active",
      prospectId: await ลูกค้าเป้าหมายรองรับสาขา(code) }),
  });
  const json = await res.json().catch(() => ({})) as { email?: string; password?: string; error?: string };
  if (!res.ok || !json.email || !json.password) throw new Error(`สร้างสาขาทดสอบ ${code} ไม่สำเร็จ (${res.status}): ${json.error ?? JSON.stringify(json)}`);
  await (await import("./firstLogin")).ข้ามตั้งรหัสครั้งแรก(json.email);
  // จังหวัดที่ดูแล — ดีลเลอร์เพิ่มลีดได้เฉพาะจังหวัดของตัวเอง (หลายสาขาดูแลจังหวัดเดียวกันได้ · ใบ 0214)
  const admin = adminClient();
  const มี = await admin.from("dealer_territories").select("province").eq("dealer_code", code).eq("province", province);
  if (!มี.data?.length) {
    const t = await admin.from("dealer_territories").insert({ dealer_code: code, province });
    if (t.error) throw new Error(`ตั้งจังหวัดที่ดูแลของ ${code} ไม่สำเร็จ: ${t.error.message}`);
  }
  return { code, email: json.email, password: json.password };
}

/** ลบทุกอย่างของสาขาทดสอบของชุด (ใบ HQ/ใบลูกค้าของลีดที่ระบุ แล้วลบสาขา) — คืนรายการที่ลบไม่ได้ (ว่าง = สะอาด) */
export async function ลบสาขาของชุด(code: string, leadNums: number[] = []): Promise<string[]> {
  if (!เป็นรหัสสาขาทดสอบ(code)) throw new Error(`รหัส ${code} ไม่ใช่รหัสสาขาทดสอบ`);
  if (leadNums.length) ล้างใบHQทดสอบ(code, leadNums);
  return ลบสาขาทดสอบตรง(code);
}
