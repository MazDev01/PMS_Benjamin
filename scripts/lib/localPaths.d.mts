// ชนิดข้อมูลของ localPaths.mjs (ข้อทดสอบ TypeScript)
export const ตารางย้าย: Readonly<Record<string, string>>;
export const ห้ามเปิด: readonly string[];
export const ชื่อส่วนตัว: readonly string[];
export function รากส่วนตัว(): string;
export function ที่อยู่ส่วนตัว(ชื่อ: string): string;
export function ที่ส่วนตัว(ชื่อ: string, opt?: { cwd?: string; มีอยู่?: (p: string) => boolean }): string;
export function โฟลเดอร์หลัก(cwd?: string): string;
export function รากLocal(cwd?: string): string;
export function รากเดิม(): string;
export function ที่เดิม(ชื่อ: string): string;
export function ที่ใน(ชื่อ: string, opt?: { cwd?: string; มีอยู่?: (p: string) => boolean }): string;
