"use client";

import { useState, useEffect, useRef, useCallback, type Dispatch, type SetStateAction } from "react";
import { logRepoRead } from "./repoLog";
import { captureError } from "./observability";
import { friendlyError } from "./friendlyError";
import { useAuthReady } from "./useAuthReady";

// state ที่ผูกกับ repository (data layer) — drop-in แทน usePersistentState สำหรับข้อมูลระดับเครือ (HQ)
//   • โหลดจาก repo ตอน mount (async) · เขียนกลับ "เฉพาะเมื่อผู้ใช้แก้จริง" หลังโหลดสำเร็จแล้ว
//   • โหมด local: repo = LocalAdapter (localStorage) → พฤติกรรมเท่า usePersistentState เดิมเป๊ะ
//   • โหมด supabase: repo = DB (RLS) → อ่าน/เขียนจริงข้ามเครื่อง
// การบันทึกล้มเหลวของข้อมูลระดับเครือ — แจ้งผ่าน event เดียวกันทั้งแอป
// (SalesContext มี syncError ของตัวเองสำหรับงานขายอยู่แล้ว · นี่คือคู่ขนานสำหรับ repo อื่น)
export const REPO_SAVE_ERROR_EVENT = "pms:repo-save-error";
export function reportRepoSaveError(e: unknown): void {
  const msg = friendlyError(e);
  captureError(e, "repo.save"); // เขียนล้มเหลว = สำคัญ → console + ส่งต่อ observability sink
  if (typeof window === "undefined") return;
  try { window.dispatchEvent(new CustomEvent(REPO_SAVE_ERROR_EVENT, { detail: msg })); } catch {}
}

// ── กันข้อมูลหายเมื่อรีเฟรช/ปิดแท็บ "ระหว่างที่คำขอบันทึกยังไม่จบ" ──────────────────
//
// เจอจริง (ตรวจหน้าแม่แบบ 31 ส.ค. 69): กด "บันทึก" แล้วรีเฟรชทันที → คำขอถูกตัดกลางทาง
//   แม่แบบไม่ถูกสร้างเลย และไม่มีข้อความผิดพลาดใด ๆ เพราะหน้าถูกทิ้งไปก่อนที่ error จะกลับมา
//   ผู้ใช้เห็นแถวขึ้นบนจอตอนกด (state เปลี่ยนแล้ว) จึงเชื่อว่าบันทึกแล้ว — ของหายเงียบ
// ที่นี่นับจำนวนคำขอที่ค้างอยู่ทั้งแอป แล้วให้เบราว์เซอร์ถามก่อนออกจากหน้าถ้ายังมีค้าง
let กำลังบันทึก = 0;
const เตือนก่อนออก = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
function เริ่มบันทึก() {
  if (typeof window === "undefined") return;
  if (กำลังบันทึก === 0) window.addEventListener("beforeunload", เตือนก่อนออก);
  กำลังบันทึก += 1;
}
function จบบันทึก() {
  if (typeof window === "undefined") return;
  กำลังบันทึก = Math.max(0, กำลังบันทึก - 1);
  if (กำลังบันทึก === 0) window.removeEventListener("beforeunload", เตือนก่อนออก);
}

export function useRepoState<T>(
  load: () => Promise<T>,
  save: (value: T) => void,
  initial: T,
  // ตัวที่ 3 = โหลดเสร็จหรือยัง · เพิ่มท้ายทูเพิลจึงไม่กระทบที่เรียกใช้แบบเดิม [a, b]
  //
  // ⚠️ ต้องมี เพราะ "ยังโหลดไม่เสร็จ" กับ "ไม่มีข้อมูล" หน้าตาเหมือนกันหมด (ทั้งคู่เป็นอาร์เรย์ว่าง)
  //   ถ้าแยกไม่ออก หน้าจะประกาศว่า "ดีลเลอร์ทั้งหมด 0 · ไม่พบข้อมูล" ระหว่างรอโหลด
  //   ซึ่งเป็นข้อมูลผิด ไม่ใช่แค่ว่างเปล่า — ผู้ใช้เน็ตช้าจะเชื่อว่าระบบไม่มีข้อมูลจริง ๆ (พบ 10 ส.ค. 69)
  // ตัวที่ 4 = "กำลังบันทึกอยู่ไหม" — หน้าที่มีฟอร์มใช้ปิดกล่องหลังบันทึกจริงเสร็จ ไม่ใช่ปิดทันทีที่กด
): [T, Dispatch<SetStateAction<T>>, boolean, boolean] {
  const [state, setState] = useState<T>(initial);
  // "โหลดสำเร็จแล้ว" เท่านั้นจึงจะเขียนกลับได้ — โหลดล้มเหลวไม่นับ
  // เดิมใช้ hydrated ตัวเดียวและตั้งเป็น true ใน .catch ด้วย → query ล้ม (เน็ตหลุด/RLS ปฏิเสธ)
  // แล้ว effect ข้างล่างยิง save(state) ทันทีโดยที่ state ยังเป็นค่า initial
  // = เอาค่าตั้งต้น (ซึ่งบางหน้าเป็นชุด mock) upsert ทับของจริงใน DB
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  // กันเขียนซ้ำโดยไม่มีใครสั่ง: หลังโหลดเสร็จ state เปลี่ยนค่าเพราะ "ผลลัพธ์การโหลด" ไม่ใช่การแก้ของผู้ใช้
  // ถ้า save ทุกครั้งที่ state เปลี่ยน จะ upsert ทั้งตารางกลับไปทุกครั้งที่เปิดหน้า
  const dirtyRef = useRef(false);
  // ⚠️ ยังไม่รู้ว่าใครล็อกอินอยู่ = ห้ามอ่าน (ดูเหตุผลเต็มใน useAuthReady.ts)
  //    ที่นี่เป็นทางผ่านของหน้าระดับเครือเกือบทั้งหมด — คุมจุดเดียวได้ทีเดียวหลายสิบจุด
  const ready = useAuthReady();

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    load()
      // ผู้ใช้แก้ไปแล้วระหว่างที่ยังโหลดไม่เสร็จ → ผลการโหลดต้องไม่ทับของที่เขาเพิ่งทำ
      // (เช่น กด "เพิ่มดีลเลอร์" เร็วกว่าทะเบียนโหลดจบ — เดิมสาขาใหม่หายเงียบ ๆ)
      //
      // ปลอดภัยแล้วเพราะ save() เป็น upsert อย่างเดียว ไม่ลบแถวที่ไม่ได้ส่งไป
      // (ตอนที่ save ยังเป็น "แทนที่ทั้งชุด" การเก็บของผู้ใช้ไว้แบบนี้เคยกลายเป็น
      //  คำสั่งลบสาขาจริงทั้งหมด เพราะ state มีแค่แถวใหม่แถวเดียว)
      .then((v) => {
        if (!alive) return;
        if (!dirtyRef.current) setState(v);
        setLoaded(true);
      })
      .catch((e) => { if (alive) logRepoRead("useRepoState.load", e); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // ห่อ setState เพื่อรู้ว่าการเปลี่ยนครั้งนี้มาจากผู้ใช้ (ไม่ใช่จากการโหลด)
  const setAndMark = useCallback<Dispatch<SetStateAction<T>>>((v) => {
    dirtyRef.current = true;
    setState(v);
  }, []);

  useEffect(() => {
    if (!loaded || !dirtyRef.current) return;
    // การบันทึกล้มเหลวต้องดัง — เดิมเป็น fire-and-forget: RLS ปฏิเสธ/เน็ตหลุดแล้วเงียบสนิท
    // ผู้ใช้เห็นของหายจากจอ (state เปลี่ยนแล้ว) แล้วเข้าใจว่าลบสำเร็จ ทั้งที่ DB ไม่ได้ถูกแตะ
    try {
      const r = save(state) as unknown;
      if (r && typeof (r as Promise<void>).then === "function") {
        setSaving(true);
        เริ่มบันทึก();
        void (r as Promise<void>)
          .catch(e => reportRepoSaveError(e))
          .finally(() => { จบบันทึก(); setSaving(false); });
      }
    } catch (e) { reportRepoSaveError(e); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, loaded]);

  return [state, setAndMark, loaded, saving];
}

// อ่านอย่างเดียว (ไม่เขียนกลับ) — สำหรับหน้าที่แค่แสดงผลข้อมูลระดับเครือ
export function useRepoValue<T>(load: () => Promise<T>, initial: T): T {
  const [state] = useRepoState<T>(load, () => {}, initial);
  return state;
}

// เหมือน useRepoValue แต่บอกด้วยว่าโหลดเสร็จหรือยัง
// จำเป็นเมื่อ "ไม่เจอข้อมูล" กับ "ยังโหลดไม่เสร็จ" ต้องแยกกัน — เช่นหน้าที่ตัดสินใจ 404
// (ถ้าไม่แยก หน้าจะเด้ง 404 ตั้งแต่เรนเดอร์แรกที่ค่ายังว่างอยู่เสมอ)
export function useRepoValueLoaded<T>(load: () => Promise<T>, initial: T): { value: T; loaded: boolean } {
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  const ready = useAuthReady();
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    load()
      .then((v) => { if (alive) { setValue(v); setLoaded(true); } })
      .catch((e) => { if (alive) { logRepoRead("useRepoValueLoaded.load", e); setLoaded(true); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  return { value, loaded };
}
