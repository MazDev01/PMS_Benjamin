// ─── เข้ารหัส/ถอดรหัสสำเนารหัสผ่านดีลเลอร์ (ใช้ฝั่งเซิร์ฟเวอร์เท่านั้น) ─────────────
//
// ⚠️ ไฟล์นี้ห้าม import จากคอมโพเนนต์ฝั่ง client เด็ดขาด
//    ใช้ node:crypto และอ่านกุญแจจาก env ที่ไม่มี NEXT_PUBLIC_ — ถ้าเผลอ import จาก client
//    Next จะพยายาม bundle เข้าไปแล้วพัง (ซึ่งดีกว่าเงียบ ๆ) แต่อย่าพึ่งพากลไกนั้นเป็นด่านเดียว
//
// ทำไมต้องเข้ารหัส ไม่เก็บเป็นข้อความเปล่า:
//   ธุรกิจต้องการให้ HQ เปิดดูรหัสดีลเลอร์ได้ตลอด (บอสสั่ง) จึงต้องเก็บสำเนาไว้
//   การเข้ารหัสทำให้ "ฐานข้อมูลหลุดอย่างเดียว" ยังไม่พอที่จะได้รหัสไป ต้องได้กุญแจใน env ไปด้วย
//   — ลดความเสียหายจากเหตุการณ์ที่เกิดจริงบ่อยที่สุด (dump ฐานข้อมูล/สำรองข้อมูลรั่ว)
//
// รูปแบบที่เก็บ: "v1:<iv base64>:<authTag base64>:<ciphertext base64>"
//   ขึ้นต้นด้วยเวอร์ชันไว้เผื่อเปลี่ยนวิธีเข้ารหัสในอนาคตโดยไม่ต้องล้างข้อมูลเก่า
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

const VERSION = "v1";

/** กุญแจ 32 ไบต์จาก env — รับได้ทั้ง base64/hex/ข้อความยาว (แฮชให้เป็น 32 ไบต์เสมอ) */
function key(): Buffer | null {
  const raw = process.env.DEALER_SECRET_KEY ?? "";
  if (raw.length < 32) return null;         // สั้นเกินไป = ถือว่ายังไม่ได้ตั้งค่า
  return createHash("sha256").update(raw).digest();
}

/** ตั้งค่ากุญแจแล้วหรือยัง — ให้ route เช็คก่อน เพื่อบอกผู้ใช้ตรง ๆ แทนที่จะพังเงียบ */
export function dealerSecretReady(): boolean {
  return key() !== null;
}

/** เข้ารหัส — คืน null ถ้ายังไม่ได้ตั้งกุญแจ (ผู้เรียกต้องจัดการกรณีนี้ ห้ามเก็บข้อความเปล่าแทน) */
export function encryptSecret(plain: string): string | null {
  const k = key();
  if (!k || !plain) return null;
  const iv = randomBytes(12);                                   // GCM ใช้ 96-bit IV
  const c = createCipheriv("aes-256-gcm", k, iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [VERSION, iv.toString("base64"), c.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

/** ถอดรหัส — คืน null ถ้ากุญแจไม่ตรง/ข้อมูลถูกแก้/รูปแบบไม่รู้จัก (GCM ตรวจความถูกต้องให้เอง) */
export function decryptSecret(stored: string): string | null {
  const k = key();
  if (!k || !stored) return null;
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", k, Buffer.from(parts[1], "base64"));
    d.setAuthTag(Buffer.from(parts[2], "base64"));
    return Buffer.concat([d.update(Buffer.from(parts[3], "base64")), d.final()]).toString("utf8");
  } catch {
    return null;   // กุญแจผิดหรือข้อมูลเสียหาย — อย่าโยน error ออกไปให้เดาได้ว่าผิดตรงไหน
  }
}
