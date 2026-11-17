// Sentry (ฝั่งเซิร์ฟเวอร์) — เปิดอัตโนมัติเมื่อตั้ง NEXT_PUBLIC_SENTRY_DSN เท่านั้น
// เหตุผลและวิธีทำงานเหมือนกับของแอปสำนักงานใหญ่ — ดูคำอธิบายเต็มที่ apps/hq/instrumentation.ts
import { captureError, เตือนถ้าDsnเพี้ยน, dsnใช้ได้ } from "@pms/shared/lib/observability";

export async function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!เตือนถ้าDsnเพี้ยน(dsn, "ฝั่งระบบ")) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.init({ dsn, tracesSampleRate: 0 });
}

export async function onRequestError(err: unknown, request: { path?: string }) {
  captureError(err, `server:${request?.path ?? "unknown"}`);
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsnใช้ได้(dsn) || process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureException(err);
  } catch { /* ระบบแจ้งเตือนพังต้องไม่ทำให้คำขอของผู้ใช้พังตาม */ }
}
