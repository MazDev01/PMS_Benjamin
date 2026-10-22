// ชนิดข้อมูลของ testDbLock.mjs สำหรับไฟล์ TypeScript ที่เรียกใช้ (tests/scenario/testDbLockSetup.ts)
export function ไฟล์ล็อกฐานทดสอบ(): string;
export function ขอล็อกฐานทดสอบ(งาน: string, opt?: { รอนาที?: number }): { token: string; release: () => void };
