"use client";

// การรายงานความล้มเหลวของ "การอ่าน" ข้อมูลผ่าน repository
//
// ปัญหา: เบราว์เซอร์ยกเลิกคำขอที่ยังค้างอยู่เมื่อผู้ใช้เปลี่ยนหน้า แล้ว fetch จะ reject
//        ด้วย TypeError: Failed to fetch — เหมือนกับตอนเน็ตหลุดทุกประการ
//        คอมโพเนนต์ที่อยู่ยาว (Topbar/Sidebar/AppShell) ไม่ถูก unmount ตอนเปลี่ยนหน้า
//        ตัวกัน `alive` ในเอฟเฟกต์จึงไม่ช่วย → console เต็มไปด้วย error ที่ไม่ใช่ error
//
// ทำไมต้องแยก: ถ้าปล่อยให้ทุกอย่างเป็น console.error คนจะชินแล้วเลิกอ่าน
//              พอมี error จริงก็จะมองข้าม (และชุดเทสต์ที่ห้ามมี error จะแกว่งจนเชื่อไม่ได้)
//
// ขอบเขต: ใช้กับ "การอ่าน" เท่านั้น — การเขียนล้มเหลวต้องดังเสมอ
//         (ดู syncError ใน SalesContext และ REPO_SAVE_ERROR_EVENT ใน useRepoState)
//         การอ่านที่พลาดจริง ๆ จะถูกลองใหม่รอบถัดไปอยู่แล้ว (เปลี่ยนหน้า/มี event/รีเฟรช)

/** คำขอถูกยกเลิกกลางคัน (เปลี่ยนหน้า/ปิดแท็บ/AbortController) ไม่ใช่ความผิดพลาดของระบบ */
export function isAbortedRequest(e: unknown): boolean {
  if (typeof DOMException !== "undefined" && e instanceof DOMException && e.name === "AbortError") return true;
  const msg = e instanceof Error ? e.message : String(e);
  // เบราว์เซอร์แต่ละตัวใช้ข้อความต่างกัน แต่ทั้งหมดหมายถึง "คำขอไม่ถึงปลายทาง"
  //   "โหลดข้อมูลไม่เสร็จ" = ข้อความของ HttpAdapter เมื่อถูกตัดกลางทาง (เดิมมีคำ aborted บนจอ · ตรวจคำขั้น 4 กลุ่ม ข 16 พ.ย. 69)
  return /Failed to fetch|NetworkError when attempting|Load failed|aborted|โหลดข้อมูลไม่เสร็จ/i.test(msg);
}

// แจ้งการอ่านที่ล้มเหลวจริง (ไม่ใช่ถูกยกเลิกเพราะเปลี่ยนหน้า) ผ่าน event เดียวกันทั้งแอป —
// คู่ขนานกับ REPO_SAVE_ERROR_EVENT (useRepoState.ts) แต่ฝั่งอ่าน · จุดที่แก้จริงคือ AppShell
// (แถบเตือนเดียวกับ "บันทึกไม่สำเร็จ") ไม่ต้องแก้ทีละ hook ที่เรียก logRepoRead อยู่แล้วนับสิบจุด
//
// ทำไมต้องมี: hook พวกนี้ (useNetworkCustomersForDealer ฯลฯ) เดิม catch แล้วแค่ log ขึ้น console — ถ้าโหลด
// พังจริง (RLS/เน็ตหลุด/query error) หน้าจอจะโชว์ "0 รายการ" เหมือนข้อมูลว่างจริงเป๊ะ ผู้ใช้แยกไม่ออก
// ว่า "ยังไม่มีข้อมูล" กับ "โหลดไม่สำเร็จ" — พบจริงจากผลตรวจสอบระบบ 30 ก.ค. 69 (severity: Critical)
export const REPO_READ_ERROR_EVENT = "pms:repo-read-error";
function reportRepoReadError(tag: string, e: unknown): void {
  if (typeof window === "undefined") return;
  const msg = e instanceof Error ? e.message : String(e);
  try { window.dispatchEvent(new CustomEvent(REPO_READ_ERROR_EVENT, { detail: `${tag}: ${msg}` })); } catch { /* ignore */ }
}

/** คำขอถูกหยุดเพราะยังไม่ได้ล็อกอิน (ชั้นข้อมูลไม่ยิงออกไปเลย) — ไม่ใช่ความผิดพลาดของระบบ
 *  เทียบ code ตรง ๆ แทนการ import จากชั้น adapter เพื่อไม่ให้สองไฟล์ import วนกัน */
function isNoSession(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "no-session";
}

/** บันทึกความล้มเหลวของการอ่าน — ข้ามกรณีที่คำขอถูกยกเลิกเพราะเปลี่ยนหน้า/ยังไม่ล็อกอิน */
/** เวลาของเครื่องกับเซิร์ฟเวอร์ไม่ตรงกัน (ใบผ่าน "ออกในอนาคต") — หายเองในไม่กี่วินาที
 *  ชั้นข้อมูลลองส่งใหม่ให้แล้ว (ดู client.ts) ถ้ายังไม่ผ่านให้เตือนแบบ "คำเตือน" ไม่ใช่ "ข้อผิดพลาด"
 *  และบอกต้นเหตุตรง ๆ ไม่งั้นผู้ใช้เห็นข้อความอังกฤษดิบแล้วนึกว่าระบบพัง */
function isClockSkew(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /issued at future/i.test(msg);
}

export function logRepoRead(tag: string, e: unknown): void {
  if (isAbortedRequest(e) || isNoSession(e)) return;
  if (isClockSkew(e)) {
    console.warn(`[${tag}] เวลาของเครื่องนี้ไม่ตรงกับเซิร์ฟเวอร์ — ระบบลองใหม่ให้แล้ว ถ้ายังเจอซ้ำให้ตั้งเวลาเครื่องเป็นอัตโนมัติ`);
    return;
  }
  console.error(`[${tag}]`, e);
  reportRepoReadError(tag, e);
}

/** แจ้งผู้ใช้ว่า "ข้อมูลที่เห็นไม่ครบ" — คนละเรื่องกับโหลดไม่สำเร็จ แต่ต้องเห็นเหมือนกัน
 *
 *  ทำไมต้องมี (ผลตรวจสอบระบบ 7 ส.ค. 69 · L-1):
 *    ชั้นข้อมูลมีเพดานกันเบราว์เซอร์ค้าง — โหลดเกิน 50,000 แถวแล้วหยุด แล้ว "เตือนแค่ใน console"
 *    ซึ่งผู้ใช้ไม่มีวันเห็น · หน้าจอจะแสดงข้อมูลที่ไม่ครบเหมือนเป็นข้อมูลทั้งหมด
 *    ผู้ใช้จึงอาจสรุปยอด/ตัดสินใจจากตัวเลขที่ขาดไปโดยไม่รู้ตัว ซึ่งอันตรายกว่าโหลดพังไปเลย
 *    (โหลดพังยังเห็นว่าพัง · แต่ข้อมูลขาดแบบเงียบ ๆ ดูเหมือนปกติทุกอย่าง)
 *  ใช้แถบเตือนใบเดียวกับ "โหลดข้อมูลบางส่วนไม่สำเร็จ" — ผู้ใช้ต้องรู้ทั้งสองกรณีเหมือนกัน
 */
export function reportPartialData(message: string): void {
  console.warn(`[partial-data] ${message}`);
  if (typeof window === "undefined") return;
  try { window.dispatchEvent(new CustomEvent(REPO_READ_ERROR_EVENT, { detail: message })); } catch { /* ignore */ }
}
