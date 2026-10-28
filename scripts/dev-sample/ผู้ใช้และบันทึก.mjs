// ── ส่วน "ผู้ใช้และบันทึก": ผู้ใช้ HQ หลายบทบาท + บันทึกการใช้งานหลายแบบ (บอสสั่ง 28 ต.ค. 69) ───────────────────────────────
// ผู้ใช้ HQ 4 ราย (อีเมล @example.test · รหัสผ่านในไฟล์นอก repo): ผู้ดูแลระบบ · ผู้บริหาร · เจ้าหน้าที่ 2 คน (คนที่ 2 ถูกปิดใช้งาน)
//   สร้างบัญชี = ขั้นของเส้นทางผู้ดูแล (apps/hq/app/api/admin/users/route.ts · กุญแจ service_role · ตัวรันทำงานก่อนเปิดเว็บ)
// บันทึกการใช้งาน: เกิดจากการกระทำจริงผ่านคำสั่งของแอป ในนามผู้ใช้แต่ละคน — ฐานเป็นคนลงบันทึก (ใบ 0240) ไม่เขียนแถวบันทึกเอง
//   เข้า/ออกระบบ (audit_auth_event) · ส่งออกการตั้งค่า (hq_settings_audit_export) · เปลี่ยนบทบาท/ปิดใช้งาน/แก้ไขผู้ใช้ (profiles)
//   · แก้ไขดีลเลอร์ (dealers) · แก้ไขผู้สนใจเป็นดีลเลอร์ (dealer_prospects)
// ข้อจำกัด: ฝั่งดีลเลอร์ฐานบังคับหนึ่งสาขาหนึ่งบัญชี (profiles_dealer_code_unique) — ทำหลายบทบาทในสาขาเดียวไม่ได้
//   บันทึกการใช้งานเป็นของ HQ เท่านั้น (ดีลเลอร์เข้าระบบ ฐานไม่ลง · งานขายของสาขาลงด้วยตัวดักงานขายเดิม)
import { สาขาใหม่ } from "./สาขา.mjs";

export const ชื่อ = "ผู้ใช้และบันทึก";
const ผู้ใช้ = [
  { key: "super", email: "hq-super-admin@example.test", role: "SUPER_ADMIN", name: "ผู้ดูแลระบบตัวอย่าง", department: "ไอที", เบอร์: 5101 },
  { key: "mgmt", email: "hq-management@example.test", role: "HQ_MANAGEMENT", name: "ผู้บริหารตัวอย่าง", department: "ฝ่ายขาย", เบอร์: 5102 },
  { key: "staff1", email: "hq-staff-1@example.test", role: "HQ_STAFF", name: "เจ้าหน้าที่ตัวอย่าง 1", department: "ฝ่ายประเมินราคา", เบอร์: 5103 },
  { key: "staff2", email: "hq-staff-2@example.test", role: "HQ_STAFF", name: "เจ้าหน้าที่ตัวอย่าง 2", department: "ฝ่ายประเมินราคา", เบอร์: 5104 },
];
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

export async function มีแล้ว(ctx) {
  const { data } = await ctx.svc.auth.admin.listUsers({ perPage: 1000 });
  return ผู้ใช้.every(u => data?.users?.some(x => x.email === u.email));
}

export async function ลบ(ctx) {
  const { data } = await ctx.svc.auth.admin.listUsers({ perPage: 1000 });
  const ids = ผู้ใช้.map(u => data?.users?.find(x => x.email === u.email)?.id).filter(Boolean);
  // โปรไฟล์ แล้วจึงลบบัญชี · บันทึกการใช้งานของผู้ใช้ชุดนี้คงอยู่ (ตารางต่อท้ายอย่างเดียว · ทางลบมีได้แค่ 2 ทาง ใบ 0241)
  if (ids.length) ctx.sql(`begin;
    set local session_replication_role = replica;
    delete from public.hq_login_secrets where user_id in (${ids.map(q).join(",")});
    delete from public.profiles where id in (${ids.map(q).join(",")});
    commit;`);
  for (const id of ids) ctx.ต้อง(await ctx.svc.auth.admin.deleteUser(id), "ลบบัญชีผู้ใช้ HQ");
}

export async function สร้าง(ctx) {
  const { svc, ต้อง, เบอร์ } = ctx;
  const เริ่ม = new Date(Date.now() - 5_000).toISOString();   // นับเฉพาะบันทึกของรอบนี้ (ของรอบก่อนคงอยู่ · ตารางต่อท้ายอย่างเดียว)
  const บัญชี = {};
  for (const u of ผู้ใช้) {
    บัญชี[u.key] = await ctx.บัญชีผู้ใช้({ email: u.email, role: u.role, dealer_code: "", name: u.name });
    ต้อง(await svc.from("profiles").update({ department: u.department, phone: เบอร์(u.เบอร์), contact_email: u.email }).eq("id", บัญชี[u.key].id), `โปรไฟล์ ${u.name}`);
  }
  const เข้า = async (k) => {
    const sb = await ctx.เข้า(บัญชี[k].email, บัญชี[k].password);
    ต้อง(await sb.rpc("audit_auth_event", { p_action: "เข้าสู่ระบบ" }), `เข้าสู่ระบบ ${k}`);
    return sb;
  };
  const เรื่อง = [];

  // เจ้าหน้าที่ 2 เข้าระบบ แล้วออก (ก่อนถูกปิดใช้งาน)
  { const sb = await เข้า("staff2"); ต้อง(await sb.rpc("audit_auth_event", { p_action: "ออกจากระบบ" }), "ออกจากระบบ"); เรื่อง.push("เข้า/ออกระบบ"); }

  // ผู้ดูแลระบบ: เปลี่ยนบทบาท (แล้วเปลี่ยนกลับ) · ปิดใช้งานผู้ใช้ · ส่งออกการตั้งค่า
  { const sb = await เข้า("super");
    ต้อง(await sb.from("profiles").update({ role: "HQ_MANAGEMENT" }).eq("id", บัญชี.staff1.id), "เปลี่ยนบทบาท");
    ต้อง(await sb.from("profiles").update({ role: "HQ_STAFF" }).eq("id", บัญชี.staff1.id), "เปลี่ยนบทบาทกลับ");
    ต้อง(await sb.from("profiles").update({ status: "inactive" }).eq("id", บัญชี.staff2.id), "ปิดใช้งานผู้ใช้");
    ต้อง(await sb.rpc("hq_settings_audit_export", { p_file: "ตั้งค่า-HQ-ตัวอย่าง.json" }), "ส่งออกการตั้งค่า");
    เรื่อง.push("เปลี่ยนบทบาทผู้ใช้ ×2", "ปิดใช้งานผู้ใช้", "ส่งออกการตั้งค่า"); }

  // ผู้บริหาร: แก้เป้าดีลเลอร์ (สาขาตัวอย่าง) · แก้ไขผู้สนใจเป็นดีลเลอร์
  { const sb = await เข้า("mgmt");
    const code = สาขาใหม่[0].code;
    // เป้ารายปีของสาขาตัวอย่าง: จากใบค่าแฟรนไชส์ 18 ล้าน → ผู้บริหารปรับเป็น 20 ล้าน (ค่าคงที่ · รันซ้ำไม่บวกเพิ่ม)
    const { data: d } = await svc.from("dealers").select("revenue_target").eq("code", code).maybeSingle();
    if (d) {
      ต้อง(await sb.from("dealers").update({ revenue_target: Number(d.revenue_target) === 20_000_000 ? 19_000_000 : 20_000_000 }).eq("code", code), "แก้ไขดีลเลอร์");
      เรื่อง.push(`แก้ไขดีลเลอร์ (${code})`);
    }
    // ผู้สนใจต้นทางของสาขาตัวอย่าง (ของส่วน "สาขา") — สลับระหว่าง 2 ค่า (ค่าเดิมซ้ำ = ฐานไม่ลงบันทึก · รันซ้ำไม่ต่อท้ายเรื่อย ๆ)
    const { data: ราย } = await svc.from("dealer_prospects").select("id, business_type").eq("name", `ว่าที่ดีลเลอร์ตัวอย่าง ${code}`).limit(1);
    if (ราย?.[0]) {
      const ประเภท = ราย[0].business_type === "ผู้รับเหมาก่อสร้าง" ? "ร้านวัสดุก่อสร้าง" : "ผู้รับเหมาก่อสร้าง";
      ต้อง(await sb.from("dealer_prospects").update({ business_type: ประเภท }).eq("id", ราย[0].id), "แก้ไขผู้สนใจ");
      เรื่อง.push("แก้ไขผู้สนใจเป็นดีลเลอร์");
    } }

  // เจ้าหน้าที่ 1: แก้โปรไฟล์ตัวเอง แล้วออกจากระบบ
  { const sb = await เข้า("staff1");
    ต้อง(await sb.from("profiles").update({ phone: เบอร์(5199) }).eq("id", บัญชี.staff1.id), "แก้ไขผู้ใช้");
    ต้อง(await sb.rpc("audit_auth_event", { p_action: "ออกจากระบบ" }), "ออกจากระบบ");
    เรื่อง.push("แก้ไขผู้ใช้"); }

  const { data: แถว } = await svc.from("audit_log").select("action").in("user", ผู้ใช้.map(u => u.name)).gte("at", เริ่ม);
  const ชนิด = [...new Set((แถว ?? []).map(r => r.action))];
  console.log(`✓ ผู้ใช้ HQ ${ผู้ใช้.length} ราย (ผู้ดูแลระบบ · ผู้บริหาร · เจ้าหน้าที่ 2 · คนที่ 2 ปิดใช้งาน) · บันทึกการใช้งาน ${แถว?.length ?? 0} แถว ${ชนิด.length} แบบ: ${ชนิด.join(" · ")}`);
}
