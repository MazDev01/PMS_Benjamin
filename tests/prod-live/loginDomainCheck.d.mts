// ชนิดข้อมูลของ loginDomainCheck.mjs (ใช้ใน live-flow.spec.ts · tests/unit/loginDomainCheck.test.ts)
export declare const LOGIN_DOMAIN: string;
export declare function ตรวจโดเมนบัญชีดีลเลอร์(
  users: { id: string; email?: string | null }[],
  profiles: { id: string; role: string; dealer_code?: string | null }[],
  รหัสสาขาทดสอบ?: string,
): { ดีลเลอร์: number; ผิดโดเมน: number; โดเมนที่เจอ: Record<string, number> };
