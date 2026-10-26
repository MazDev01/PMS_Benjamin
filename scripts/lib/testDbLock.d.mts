// ชนิดข้อมูลของ testDbLock.mjs สำหรับไฟล์ TypeScript ที่เรียกใช้ (tests/scenario/testDbLockSetup.ts)
export function ไฟล์ล็อกฐานทดสอบ(): string;
export function ขอล็อกฐานทดสอบ(งาน: string, opt?: { รอนาที?: number; เจ้าของ?: number }): { token: string; release: () => void };
export function ปล่อยล็อกฐานทดสอบ(token: string, key: string): void;
export function ประวัติผู้ถือล็อก(): { เซสชัน: string; งาน: string; เริ่ม: string; จบ?: string }[];
export function ใครถือล็อกตอน(เวลา: string | Date): { เซสชัน: string; งาน: string; เริ่ม: string; จบ?: string } | null;
