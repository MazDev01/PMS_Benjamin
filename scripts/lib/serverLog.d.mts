// ชนิดข้อมูลของ serverLog.mjs (ตัวรายงาน TypeScript tests/reporters/failure-evidence.ts)
export function serverLogDir(runId: string, ราก?: string): string;
export function attachServerLog(child: { stdout: NodeJS.ReadableStream | null; stderr: NodeJS.ReadableStream | null }, ไฟล์: string, ชื่อ: string): void;
export function serverLinesBetween(โฟลเดอร์: string, ตั้งแต่: number, ถึง: number): string[];
