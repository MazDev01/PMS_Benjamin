// ── ถอดสำเนารหัสผ่านดีลเลอร์ (dealer_login_secrets) สำหรับสคริปต์ฝั่งเครื่อง ──────────────────────────
//   รูปแบบเดียวกับ packages/shared/lib/dealerSecret.ts ("v1:<iv>:<tag>:<ciphertext>" · aes-256-gcm · กุญแจ = sha256(DEALER_SECRET_KEY))
//   แยกมาเพราะสคริปต์ .mjs นำเข้าไฟล์ TypeScript ไม่ได้ — แก้รูปแบบที่หนึ่งต้องแก้อีกที่ด้วย
import { createDecipheriv, createHash } from "node:crypto";

/** คืนตัวถอดรหัส หรือ null ถ้ากุญแจสั้นเกิน (= ยังไม่ได้ตั้ง) */
export function ตัวถอดรหัส(rawKey) {
  if (!rawKey || rawKey.length < 32) return null;
  const k = createHash("sha256").update(rawKey).digest();
  return stored => {
    const parts = String(stored ?? "").split(":");
    if (parts.length !== 4 || parts[0] !== "v1") return null;
    try {
      const d = createDecipheriv("aes-256-gcm", k, Buffer.from(parts[1], "base64"));
      d.setAuthTag(Buffer.from(parts[2], "base64"));
      return Buffer.concat([d.update(Buffer.from(parts[3], "base64")), d.final()]).toString("utf8");
    } catch { return null; }
  };
}
