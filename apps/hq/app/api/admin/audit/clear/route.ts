// ── ล้างบันทึกการใช้งาน (audit log) ─────────────────────────────────────────────
//
// ⚠️ อ่านก่อนแก้ไฟล์นี้ — เส้นทางนี้ขัดกับหลักการเดิมของระบบโดยตั้งใจ
//
// เดิม audit_log เป็น "append-only" (เขียนเพิ่มได้อย่างเดียว ลบไม่ได้) ทั้งที่ชั้นฐานข้อมูล
//   (0002/0031: มี policy แค่ select/insert ไม่มี delete) และมีเทสต์เฝ้าไว้
//   ("แก้/ลบบันทึกย้อนหลังไม่ได้ (append-only)" · audit-integrity.spec.ts)
//   เหตุผล: บันทึกนี้มีไว้ตอบว่า "ใครทำอะไรเมื่อไหร่" — ถ้าลบได้ก็ใช้เป็นหลักฐานไม่ได้
//
// บอสสั่งให้มีปุ่มล้างในหน้าเว็บ (14 ส.ค. 69) หลังรับทราบข้อแลกเปลี่ยนแล้ว
//   จึงทำผ่านเซิร์ฟเวอร์ด้วย service_role (ข้าม RLS) — ไม่ได้เปิด policy delete ให้ client
//   แปลว่ากติกาเดิมยังอยู่ครบ: ผู้ใช้ทั่วไป/ดีลเลอร์ ลบบันทึกตรง ๆ ไม่ได้เหมือนเดิม
//   ทางเดียวที่ลบได้คือผ่านเส้นทางนี้ ซึ่งถูกล้อมด้วย 4 ด่านข้างล่าง
//
// ด่านที่ล้อมไว้:
//   1) เฉพาะผู้ดูแลสูงสุด (SUPER_ADMIN) — ผู้บริหาร HQ ก็ล้างไม่ได้ แม้จะมีสิทธิ์ users:manage
//   2) จำกัด 2 ครั้ง/ชั่วโมง — งานนี้ทำปีละครั้ง ไม่ใช่งานประจำ
//   3) นับจำนวนแถวก่อนลบ แล้ว "บันทึกการล้าง" กลับลงไปเป็นรายการแรกทันที
//      → บันทึกไม่มีวันว่างเปล่าแบบไร้ที่มา ต้องมีบรรทัดบอกเสมอว่าใครล้าง เมื่อไหร่ ไปกี่แถว
//   4) ทุกอย่างทำที่เซิร์ฟเวอร์ — หน้าจอสั่งได้อย่างเดียว แก้เงื่อนไขจากฝั่ง client ไม่ได้
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@pms/shared/lib/rateLimit";
import { bad, authorizeAdmin, auditLog, withErrors } from "@pms/shared/lib/adminRoute";

export const runtime = "nodejs";

const DENY = "ล้างบันทึกการใช้งานได้เฉพาะผู้ดูแลสูงสุด";

export const POST = withErrors("clear-audit-log", async (req: NextRequest) => {
  const authz = await authorizeAdmin(req, "users:manage", DENY, "ระบบยังไม่ได้ตั้งค่าสิทธิ์ผู้ดูแล");
  if (!authz.ok) return authz.res;
  const { admin, callerId, prof } = authz.auth;

  // ด่านที่ 1 — users:manage ยังกว้างไป (ผู้บริหาร HQ ก็มี) · งานนี้ต้องผู้ดูแลสูงสุดเท่านั้น
  if (String(prof?.role) !== "SUPER_ADMIN") return bad(403, DENY);

  // ด่านที่ 2
  if (!(await checkRateLimit(admin, `clear-audit:${callerId}`, 2, 3600))) {
    return bad(429, "ล้างบันทึกถี่เกินไป — รอสักครู่แล้วลองใหม่");
  }

  // ด่านที่ 3 — นับก่อนลบ เพื่อบอกได้ว่าหายไปกี่แถวจริง (ไม่ใช่เดา)
  const { count, error: cntErr } = await admin
    .from("audit_log").select("id", { count: "exact", head: true });
  if (cntErr) {
    console.error("[clear-audit-log] นับจำนวนบันทึกไม่สำเร็จ", cntErr);
    return bad(503, "อ่านบันทึกไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง");
  }

  // ลบทั้งตาราง — ต้องมีเงื่อนไขเสมอ (supabase-js ปฏิเสธ delete ที่ไม่มี filter)
  const { error: delErr } = await admin.from("audit_log").delete().gte("at", "1970-01-01");
  if (delErr) {
    console.error("[clear-audit-log] ล้างบันทึกไม่สำเร็จ", delErr);
    return bad(503, "ล้างบันทึกไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง");
  }

  // เขียนร่องรอยกลับทันที — ห้ามปล่อยให้บันทึกว่างเปล่าโดยไม่มีที่มา
  // (ถ้าบรรทัดนี้เขียนไม่ลง auditLog จะ log ที่ console ให้ ไม่กลืนเงียบ)
  await auditLog(admin, prof, "ล้างบันทึกการใช้งาน", `ลบทั้งหมด ${count ?? 0} รายการ`);

  return NextResponse.json({ ok: true, removed: count ?? 0 });
});
