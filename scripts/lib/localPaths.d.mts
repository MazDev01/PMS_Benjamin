// ชนิดข้อมูลของ localPaths.mjs (ข้อทดสอบ TypeScript)
export const ตารางย้าย: Readonly<Record<string, string>>;
export const ห้ามเปิด: readonly string[];
export function โฟลเดอร์หลัก(cwd?: string): string;
export function รากLocal(cwd?: string): string;
export function รากเดิม(): string;
export function ที่เดิม(ชื่อ: string): string;
export function ที่ใน(ชื่อ: string, opt?: { cwd?: string; มีอยู่?: (p: string) => boolean }): string;
