"use client";
// ── ปุ่มหัวแผงดีลเลอร์ (แก้ไข · ปิด/เปิดใช้งาน · เข้าระบบแทน) + หน้าต่างแก้ไข — ตัวกลางของทุกหน้าที่เปิด DealerPanel ────────────────
//   ย้ายจาก DealersRegistry ทั้งชุดโดยไม่เปลี่ยนพฤติกรรม (18 พ.ย. 69) — /hq/dealers กับ /hq/pipeline (ปุ่มรูปตา) ใช้ตัวเดียวกัน
//   บอสตัดสิน 18 พ.ย. 69: ปุ่มรูปตาทุกหน้า = เปิดหน้าต่างรายละเอียดบนหน้าเดิม ไม่ออกจากหน้า
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ยืนยัน, แจ้งพลาด, แจ้งสำเร็จ } from "@pms/shared/components/ui/ConfirmToast";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import { DealerEditModal, type DealerEdit } from "@pms/shared/components/hq/DealerEditModal";
import { type DealerRow } from "@pms/shared/lib/mock";
import { REAL_BACKEND } from "@pms/shared/lib/data/config";
import { dealers as dealersRepo } from "@pms/shared/lib/data";
import { impersonateDealer } from "@pms/shared/lib/adminApi";
import { useRole } from "@pms/shared/context/RoleContext";

export function useDealerPanelActions() {
  const { login } = useRole();
  const router = useRouter();
  const [entering, setEntering] = useState<string | null>(null);
  // แก้ไข / ปิด-เปิดใช้งาน (ย้ายจากหน้ารายละเอียดเดิม · บอสตัดสิน 19 ต.ค. 69) — ใช้ทั้งปุ่มท้ายแถวและหัวแผง
  const [แก้, setแก้] = useState<DealerRow | null>(null);
  const [ทับ, setทับ] = useState<Record<string, DealerRow>>({});   // ค่าที่เพิ่งบันทึก (ทับแถวที่โหลดมา)
  const แถวจริง = (d: DealerRow) => ทับ[d.code] ?? d;
  async function บันทึก(next: DealerRow) {
    await dealersRepo.save([next]);
    setทับ(m => ({ ...m, [next.code]: next }));
  }
  async function สลับสถานะ(d: DealerRow) {
    const ปิด = d.status === "active";
    if (!(await ยืนยัน({ หัวข้อ: ปิด ? `ปิดใช้งาน "${d.name}" ?` : `เปิดใช้งาน "${d.name}" ?`,
      รายละเอียด: ปิด ? "ดีลเลอร์รายนี้จะเข้าระบบไม่ได้จนกว่าจะเปิดใช้งานอีกครั้ง · ข้อมูลงานขายยังอยู่ครบ" : "ดีลเลอร์รายนี้จะเข้าระบบได้ตามปกติ",
      ปุ่มตกลง: ปิด ? "ปิดใช้งาน" : "เปิดใช้งาน", อันตราย: ปิด }))) return;
    try {
      await บันทึก({ ...d, status: ปิด ? "inactive" : "active" });
      แจ้งสำเร็จ(ปิด ? "ปิดใช้งานดีลเลอร์แล้ว" : "เปิดใช้งานดีลเลอร์แล้ว");
    } catch (e) { แจ้งพลาด(friendlyError(e)); }
  }

  // "เข้าระบบแทนดีลเลอร์" — HQ มีสิทธิ์เข้าบัญชีดีลเลอร์ไหนก็ได้ (บอสยืนยัน)
  //
  // โหมดเดโม (local): เดิมปุ่มนี้เรียก login("dealer") ซึ่งเข้าด้วยบัญชีเดโมตัวเดียวเสมอ (CNX)
  // ไม่ว่าจะกดจากแถวไหน → คงพฤติกรรมเดิมไว้ (ไม่มีระบบยืนยันตัวตนจริงให้ผูกต่อสาขา)
  //
  // โหมดจริง (supabase): เดิมเข้าใจผิดว่าทำไม่ได้เพราะรหัสผ่านดีลเลอร์ถูก hash ไว้ — แต่ service_role
  // ไม่จำเป็นต้อง "รู้" รหัสผ่านเพื่อสร้าง session แทนผู้ใช้อื่น: ใช้ Supabase magic-link
  // (generateLink ฝั่งเซิร์ฟเวอร์ — ดู /api/admin/dealers/impersonate) ออกลิงก์เข้าระบบครั้งเดียว
  // เปิดในแท็บใหม่ไปยังแอปดีลเลอร์ (คนละ origin กับ HQ · session แยกต่อแท็บอยู่แล้ว — ดู client.ts)
  // จึงไม่กระทบ session ของ HQ เองในแท็บปัจจุบันเลย
  async function enterDealer(d: DealerRow) {
    if (!REAL_BACKEND) {
      setEntering(d.id);
      login("dealer");
      router.push("/dashboard");
      return;
    }
    // ── เปิดแท็บ "ตอนคลิก" เท่านั้น (แก้ 20 ส.ค. 69: กดแล้วไม่มีอะไรเกิดขึ้น) ──
    //
    // เดิมขอลิงก์จากเซิร์ฟเวอร์ก่อน แล้วค่อย window.open หลัง await
    //   เบราว์เซอร์ถือว่า "ไม่ได้เกิดจากการคลิกของผู้ใช้" แล้วบล็อกป๊อปอัพเงียบ ๆ
    //   ผู้ใช้เห็นเป็น "กดปุ่มแล้วไม่มีอะไรเกิดขึ้น" โดยไม่มีข้อความอะไรบอกเลย
    // แก้: จองแท็บไว้ตั้งแต่จังหวะคลิก แล้วค่อยพาไปที่ลิงก์เมื่อได้มา
    //   ถ้าจองไม่ได้ (ตัวกันป๊อปอัพเข้มมาก) → ไปในแท็บเดิมแทน ดีกว่าเงียบหาย
    //   (แอปดีลเลอร์คนละ origin กับ HQ · session ของ HQ ไม่หายไปด้วย)
    const แท็บ = window.open("", "_blank");
    setEntering(d.id);
    const res = await impersonateDealer(d.code);
    setEntering(null);
    if (!res.ok) { แท็บ?.close(); แจ้งพลาด(`เข้าระบบแทน "${d.name}" ไม่สำเร็จ: ${res.error}`); return; }
    if (แท็บ) แท็บ.location.href = res.link;
    else window.location.href = res.link;
    // ⚠️ ห้ามบันทึกซ้ำจากตรงนี้ (แก้ 10 ส.ค. 69) — ฝั่งเซิร์ฟเวอร์บันทึกให้แล้วตอนออกลิงก์
    //   กดครั้งเดียวเคยได้บันทึก 2 แถว ("ZZP" กับ "ZZP · ชื่อสาขา") ทำให้นับจำนวนครั้งผิด
    //   และของฝั่งเซิร์ฟเวอร์เชื่อถือได้กว่า เพราะข้ามไม่ได้แม้ผู้ใช้ปิดหน้าจอทันทีหลังกด
    //   (ดู apps/hq/app/api/admin/dealers/impersonate/route.ts)
  }

  const หน้าต่างแก้ = แก้ ? (
    <DealerEditModal dealer={แก้} onClose={() => setแก้(null)}
      onSave={async (e: DealerEdit) => {
        try { await บันทึก({ ...แก้, ...e }); แจ้งสำเร็จ("บันทึกข้อมูลดีลเลอร์แล้ว"); }
        catch (err) { throw new Error(friendlyError(err)); }
      }} />
  ) : null;

  /** props ปุ่มหัวแผงของ DealerPanel สำหรับดีลเลอร์ d */
  const ปุ่มแผง = (d: DealerRow) => ({
    onEdit: () => setแก้(d), onToggle: () => void สลับสถานะ(d), onEnter: () => void enterDealer(d), entering: entering === d.id,
  });

  return { entering, setแก้, แถวจริง, สลับสถานะ, enterDealer, หน้าต่างแก้, ปุ่มแผง };
}
