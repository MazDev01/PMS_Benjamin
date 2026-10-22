// ชนิดข้อมูลของ session.mjs สำหรับไฟล์ TypeScript ที่เรียกใช้
type คู่พอร์ต = { dealer: number; hq: number };
export const รากโฟลเดอร์: string;
export function ไฟล์เซสชัน(root?: string): string;
export const ค่าพอร์ต: { dev: คู่พอร์ต; test: คู่พอร์ต; เซสชันลูก: { ฐาน: number; ช่วงต่อเซสชัน: number; dev: คู่พอร์ต; test: คู่พอร์ต; สูงสุด: number } };
export function อ่านเซสชัน(root?: string): ({ ชื่อ: string; ช่อง: number; dev: คู่พอร์ต; test: คู่พอร์ต } & Record<string, unknown>) | null;
export function เป็นโฟลเดอร์หลัก(root?: string): boolean;
export function ชื่อเซสชัน(root?: string): string;
export function พอร์ตของช่อง(k: number): { dev: คู่พอร์ต; test: คู่พอร์ต };
export function พอร์ต(ชนิด?: "dev" | "test", root?: string): คู่พอร์ต;
export function ต้นทาง(ชนิด?: "dev" | "test", root?: string): { dealer: string; hq: string };
