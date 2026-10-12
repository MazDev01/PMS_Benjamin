// ── สัญญาโครงสร้างข้อมูลขาเข้าของ /api/v1 (P2 · S-3 จากผลตรวจระบบ 19 ส.ค. 69) ──────
//
// ปัญหาเดิม: แต่ละเส้นทางอ่านค่าจาก body/query แล้วส่งต่อให้ฐานข้อมูลตรง ๆ
//   ค่าที่ผิดชนิด (ข้อความในช่องตัวเลข · อ็อบเจกต์ในช่องข้อความ · limit ติดลบ/ล้นโลก)
//   จะเดินทะลุไปถึง RPC แล้วระเบิดที่ฐานข้อมูล → ผู้ใช้เห็นแค่ "ระบบขัดข้อง"
//   และคนดูแลต้องไปไล่หาใน log ว่าพังเพราะอะไร
//
// วิธีแก้: ประกาศรูปร่างที่ยอมรับได้ไว้ข้างเส้นทางนั้น แล้วตรวจที่ชั้นเดียวก่อนแตะฐานข้อมูล
//   ผิด = ตอบ 400 พร้อมบอกชื่อช่องที่ผิด · ไม่ผิด = ได้ค่าที่ชนิดถูกแล้วไปใช้ต่อ
//
// ⚠️ ไม่ใช่ดีลเลอร์ของ RLS — สิทธิ์การเข้าถึงข้อมูลยังเป็นหน้าที่ของฐานข้อมูลเหมือนเดิมทุกประการ
//    ชั้นนี้กันแค่ "รูปร่างข้อมูลผิด" ไม่ได้กัน "คนผิดสิทธิ์" (ดู _ctx.ts — ทำงานในนามผู้เรียก)
//
// ไม่ใช้ไลบรารีภายนอก: ทั้งโปรเจกต์ไม่มี dependency ประเภทนี้อยู่แล้ว และที่ต้องการมีแค่
//   ชนิดพื้นฐาน 5-6 แบบ — เพิ่มไลบรารีเพื่อเท่านี้ไม่คุ้มกับที่ต้องดูแลต่อ

/** ข้อมูลขาเข้าผิดรูป — ผู้เรียกแก้เองได้ จึงเป็น 400 ไม่ใช่ 503 */
export class BadInput extends Error {
  constructor(message: string) { super(message); this.name = "BadInput"; }
}

export type Check<T> = (v: unknown, field: string) => T;

const ว่าง = (v: unknown) => v === undefined || v === null || v === "";

/** ข้อความ — ยาวเกินเพดานถือว่าผิด (กันคนยัดข้อความเป็นเมกะไบต์เข้ามาทำให้ฐานอืด) */
export function str(o: { max?: number; optional?: boolean; trim?: boolean } = {}): Check<string> {
  const max = o.max ?? 2000;
  return (v, f) => {
    if (ว่าง(v)) {
      if (o.optional) return "";
      throw new BadInput(`ต้องระบุ ${f}`);
    }
    if (typeof v !== "string") throw new BadInput(`${f} ต้องเป็นข้อความ`);
    const s = o.trim === false ? v : v.trim();
    if (s.length > max) throw new BadInput(`${f} ยาวเกิน ${max} ตัวอักษร`);
    if (!s && !o.optional) throw new BadInput(`ต้องระบุ ${f}`);
    return s;
  };
}

/** ตัวเลข — รับทั้ง number และข้อความที่เป็นตัวเลข (query string ส่งมาเป็นข้อความเสมอ) */
export function num(o: { min?: number; max?: number; int?: boolean; optional?: boolean; def?: number } = {}): Check<number> {
  return (v, f) => {
    if (ว่าง(v)) {
      if (o.def !== undefined) return o.def;
      if (o.optional) return NaN;
      throw new BadInput(`ต้องระบุ ${f}`);
    }
    const n = typeof v === "number" ? v : Number(v);
    if (typeof v !== "number" && typeof v !== "string") throw new BadInput(`${f} ต้องเป็นตัวเลข`);
    if (!Number.isFinite(n)) throw new BadInput(`${f} ต้องเป็นตัวเลข`);
    if (o.int && !Number.isInteger(n)) throw new BadInput(`${f} ต้องเป็นจำนวนเต็ม`);
    if (o.min !== undefined && n < o.min) throw new BadInput(`${f} ต้องไม่น้อยกว่า ${o.min}`);
    if (o.max !== undefined && n > o.max) throw new BadInput(`${f} ต้องไม่เกิน ${o.max}`);
    return n;
  };
}

export function bool(o: { def?: boolean } = {}): Check<boolean> {
  return (v, f) => {
    if (ว่าง(v)) return o.def ?? false;
    if (typeof v === "boolean") return v;
    if (v === "1" || v === "true") return true;
    if (v === "0" || v === "false") return false;
    throw new BadInput(`${f} ต้องเป็นใช่/ไม่ใช่`);
  };
}

/** ค่าที่ต้องอยู่ในชุดที่กำหนด (สถานะ ฯลฯ) — กันค่าแปลกปลอมไปถึง enum ของฐานข้อมูล */
export function oneOf<T extends string>(values: readonly T[], o: { optional?: boolean } = {}): Check<T | ""> {
  return (v, f) => {
    if (ว่าง(v)) {
      if (o.optional) return "";
      throw new BadInput(`ต้องระบุ ${f}`);
    }
    if (typeof v !== "string" || !values.includes(v as T)) {
      throw new BadInput(`${f} ต้องเป็นหนึ่งใน: ${values.join(", ")}`);
    }
    return v as T;
  };
}

/** รายการของชนิดเดียวกัน (เช่น รหัสสาขาหลายตัว) — จำกัดจำนวนกันคนยัดหมื่นรายการ */
export function arrOf<T>(item: Check<T>, o: { max?: number; optional?: boolean } = {}): Check<T[] | null> {
  const max = o.max ?? 200;
  return (v, f) => {
    if (ว่าง(v)) {
      if (o.optional) return null;
      throw new BadInput(`ต้องระบุ ${f}`);
    }
    if (!Array.isArray(v)) throw new BadInput(`${f} ต้องเป็นรายการ`);
    if (v.length > max) throw new BadInput(`${f} มีได้ไม่เกิน ${max} รายการ`);
    return v.map((x, i) => item(x, `${f}[${i}]`));
  };
}

/** อ็อบเจกต์ที่ค่าเป็นตัวเลข (เช่น เกณฑ์วันของแต่ละสาขา { CNX: 7, RYG: 14 }) */
export function mapOfNum(o: { max?: number; optional?: boolean } = {}): Check<Record<string, number> | null> {
  const max = o.max ?? 200;
  return (v, f) => {
    if (ว่าง(v)) {
      if (o.optional) return null;
      throw new BadInput(`ต้องระบุ ${f}`);
    }
    if (typeof v !== "object" || Array.isArray(v)) throw new BadInput(`${f} ต้องเป็นชุดค่า`);
    const e = Object.entries(v as Record<string, unknown>);
    if (e.length > max) throw new BadInput(`${f} มีได้ไม่เกิน ${max} รายการ`);
    const out: Record<string, number> = {};
    for (const [k, val] of e) out[k] = num({ int: true })(val, `${f}.${k}`);
    return out;
  };
}

/** วันที่แบบ ISO ("2026-08-19") — รูปแบบเดียวที่ฐานข้อมูลรับ */
export function isoDate(o: { optional?: boolean } = {}): Check<string | null> {
  return (v, f) => {
    if (ว่าง(v)) {
      if (o.optional) return null;
      throw new BadInput(`ต้องระบุ ${f}`);
    }
    const s = String(v);
    if (!/^\d{4}-\d{2}-\d{2}([T ].*)?$/.test(s)) throw new BadInput(`${f} ต้องเป็นวันที่รูปแบบ ปี-เดือน-วัน`);
    return s;
  };
}

type Shape = Record<string, Check<unknown>>;
type Out<S extends Shape> = { [K in keyof S]: S[K] extends Check<infer T> ? T : never };

/** ตรวจทั้งชุดตามรูปร่างที่ประกาศไว้ — คืนค่าที่ชนิดถูกแล้ว
 *  ช่องที่ไม่ได้ประกาศจะถูกตัดทิ้ง ไม่ส่งต่อ (เส้นทางรับเฉพาะสิ่งที่ตั้งใจรับ) */
export function parse<S extends Shape>(shape: S, input: unknown): Out<S> {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, check] of Object.entries(shape)) out[k] = check(src[k], k);
  return out as Out<S>;
}
