// ── /api/v1/auth — เข้าระบบ/ออกจากระบบ/ถามว่าเป็นใคร โดยไม่ให้ใบผ่านตกถึงมือ JavaScript ──
//
// ระยะ 4 · ปิดประตูฐานข้อมูล
//
// เดิม: หน้าเว็บล็อกอินกับ Supabase เอง แล้วเก็บใบผ่านไว้ใน localStorage
//       → JavaScript อ่านได้ → หยิบไปยิงเข้าฐานข้อมูลตรง ๆ ข้าม backend ได้
// ตอนนี้: หน้าเว็บส่งอีเมล/รหัสผ่านมาที่นี่ · เซิร์ฟเวอร์คุยกับ Supabase แทน
//       แล้วเก็บใบผ่านลง cookie แบบ httpOnly → หน้าเว็บใช้งานได้แต่ "จับต้องใบผ่านไม่ได้"
//
// ⚠️ ห้ามส่ง access_token / refresh_token กลับไปใน body เด็ดขาด — จะเสียจุดประสงค์ทั้งหมด
//    หน้าเว็บได้แค่ "ข้อมูลว่าเป็นใคร" ที่จำเป็นต่อการแสดงผล (บทบาท/สาขา/ชื่อ)
//
// ⚠️ ใช้เฉพาะโหมด api — โหมด supabase หน้าเว็บต้องถือใบผ่านเองเพื่อคุยกับฐานข้อมูลตรง
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ACCESS_COOKIE, REFRESH_COOKIE, LEGACY_COOKIES, accessCookie, refreshCookie, clearCookie, callerToken } from "./_cookie";

export const runtime = "nodejs";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

const anonClient = () => createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

/** ข้อมูล "เป็นใคร" ที่หน้าเว็บจำเป็นต้องรู้ — อ่านจากใบผ่าน ไม่ใช่รับมาจากผู้เรียก */
type Claims = { sub?: string; email?: string; user_role?: string; dealer_code?: string; exp?: number };
function claimsOf(token: string): Claims {
  try {
    const part = token.split(".")[1];
    if (!part) return {};
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json) as Claims;
  } catch { return {}; }
}

/** สิ่งที่หน้าเว็บได้รับ — ไม่มีใบผ่านติดไปด้วย
 *
 *  ⚠️ ต้องแนบ "ชื่อคน" และ "ชื่อสาขา" มาด้วย — โหมด api หน้าเว็บอ่านตารางเองไม่ได้แล้ว
 *     ถ้าไม่ส่งมา หน้าจอจะโชว์อีเมลแทนชื่อคน และรหัสสาขาแทนชื่อบริษัท (ต่างจากโหมดเดิม)
 *     อ่านด้วยใบผ่านของผู้ใช้เอง → RLS ยังบังคับ · อ่านไม่ได้ก็ปล่อยว่าง ไม่ให้ล็อกอินพังเพราะเรื่องชื่อ */
async function publicSession(token: string) {
  const c = claimsOf(token);
  const base = {
    userId: c.sub ?? "",
    email: c.email ?? "",
    role: c.user_role ?? "",
    dealerCode: c.dealer_code ?? "",
    expiresAt: c.exp ?? 0,
    name: "",
    dealerName: "",
  };
  // ── บัญชี/สาขายังใช้งานได้อยู่จริงไหม ─────────────────────────────────────────
  //
  // ⚠️ ต้องตรวจที่นี่ ไม่ใช่แค่ดูว่าใบผ่านหมดอายุหรือยัง (บั๊กจริง ผู้ใช้แจ้ง 14 ส.ค. 69)
  //    สำนักงานใหญ่ลบ/ปิดสาขาไปแล้ว แต่เบราว์เซอร์ที่ถือใบผ่านใบเดิมยังเปิดหน้าได้ต่อถึง 1 ชม.
  //    ทุกคำขอถูกฐานข้อมูลปฏิเสธ หน้าจอเลยว่างเปล่า ผู้ใช้เห็นเป็น "ระบบพัง" ไม่ใช่ "ถูกลบสิทธิ์"
  //    โหมด supabase ปิดช่องนี้ไว้แล้วที่ supabaseAuth.stillValid — โหมด api ต้องใช้กติกาเดียวกันเป๊ะ
  //
  // กติกา: อ่านสำเร็จแต่ไม่มีแถว = ถูกลบ · มีแถวแต่ status ไม่ใช่ active = ถูกปิดใช้งาน
  // ⚠️ "อ่านไม่ได้" (เน็ต/ฐานข้อมูลล่ม) ห้ามถือว่าถูกลบ ไม่งั้นสะดุดทีเดียวเด้งผู้ใช้ออกทั้งระบบ
  // ⚠️ status ว่าง/อ่านไม่ออก ให้ถือว่าใช้ได้ — ข้อมูลเก่าบางแถวไม่มีค่านี้
  let alive = true;
  const disabled = (v: unknown) => typeof v === "string" && v.trim() !== "" && v !== "active";
  try {
    const sb = createClient(URL_, ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    if (base.userId) {
      const { data, error } = await sb.from("profiles").select("name,status").eq("id", base.userId).maybeSingle();
      const row = data as { name?: string; status?: string } | null;
      base.name = (row?.name ?? "").trim();
      if (!error && (!row || disabled(row.status))) alive = false;
    }
    if (base.dealerCode) {
      // ⚠️ ต้องอ่านผ่าน view dealers_directory เท่านั้น — ตาราง dealers ถูกถอนสิทธิ์อ่านไปแล้ว (0090)
      //    ยิงตรงที่ตารางจะถูกปฏิเสธทุกครั้ง แล้วการตรวจนี้กลายเป็นโค้ดตายที่ไม่เคยจับอะไรได้เลย
      const { data, error } = await sb.from("dealers_directory").select("name,status").eq("code", base.dealerCode).maybeSingle();
      const row = data as { name?: string; status?: string } | null;
      base.dealerName = (row?.name ?? "").trim();
      if (!error && (!row || disabled(row.status))) alive = false;
    }
  } catch { /* อ่านไม่ได้ = ใช้ค่าว่าง และถือว่ายังใช้งานได้ ฝั่งแอปมีค่าสำรองอยู่แล้ว */ }
  return { ...base, alive };
}

/** ตัดใบผ่านทิ้งพร้อมล้าง cookie — ใช้เมื่อบัญชี/สาขาถูกลบหรือปิดใช้งานระหว่างเปิดหน้าค้างไว้ */
function evict(error: string, req?: NextRequest) {
  const res = NextResponse.json({ error }, { status: 401, headers: { "cache-control": "no-store" } });
  res.cookies.set(clearCookie(ACCESS_COOKIE, req));
  res.cookies.set(clearCookie(REFRESH_COOKIE, req));
  // ลบชื่อเดิมก่อนแยกรายแอปด้วย — ไม่งั้นของเก่าค้างในเครื่องผู้ใช้แล้วสับสนภายหลัง
  for (const เดิม of LEGACY_COOKIES) res.cookies.set(clearCookie(เดิม, req));
  return res;
}

const GONE = "บัญชีหรือสาขานี้ถูกลบหรือปิดใช้งานแล้ว — กรุณาติดต่อสำนักงานใหญ่";

const fail = (status: number, error: string) =>
  NextResponse.json({ error }, { status, headers: { "cache-control": "no-store" } });

// ── เข้าสู่ระบบ ──
export const POST = async (req: NextRequest): Promise<Response> => {
  const op = new URL(req.url).searchParams.get("op") ?? "login";

  if (op === "logout") {
    // ปิด session ฝั่ง Supabase ด้วย (ไม่ใช่แค่ลบ cookie) — ไม่งั้นใบผ่านยังใช้ได้จนหมดอายุ
    const token = callerToken(req);
    if (token) {
      const sb = createClient(URL_, ANON, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      await sb.auth.signOut({ scope: "local" }).catch(() => { /* ออกไม่ได้ก็ยังต้องลบ cookie */ });
    }
    const res = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
    res.cookies.set(clearCookie(ACCESS_COOKIE, req));
    res.cookies.set(clearCookie(REFRESH_COOKIE, req));
    return res;
  }

  if (op === "refresh") {
    const rt = req.cookies.get(REFRESH_COOKIE)?.value;
    if (!rt) return fail(401, "ยังไม่ได้เข้าสู่ระบบ");
    const { data, error } = await anonClient().auth.refreshSession({ refresh_token: rt });
    const s = data?.session;
    if (error || !s?.access_token) {
      // ต่ออายุไม่ได้ = ใบผ่านใช้ไม่ได้แล้ว → ล้างทิ้ง ไม่ปล่อยให้ค้างแล้วพังซ้ำ ๆ
      const res = fail(401, "เซสชันหมดอายุ — กรุณาเข้าสู่ระบบใหม่");
      res.cookies.set(clearCookie(ACCESS_COOKIE, req));
      res.cookies.set(clearCookie(REFRESH_COOKIE, req));
      return res;
    }
    const { alive, ...me } = await publicSession(s.access_token);
    if (!alive) return evict(GONE, req);
    const res = NextResponse.json(me, { headers: { "cache-control": "no-store" } });
    res.cookies.set(accessCookie(s.access_token, s.expires_in ?? 3600, req));
    if (s.refresh_token) res.cookies.set(refreshCookie(s.refresh_token, req));
    return res;
  }

  // ── op = adopt: รับใบผ่านที่มากับลิงก์ "เข้าระบบแทนดีลเลอร์" แล้วเก็บลง cookie ──────
  //
  // ลิงก์เข้าระบบครั้งเดียว (magic link) ของ Supabase ส่งใบผ่านกลับมาทาง URL เสมอ
  //   โหมด supabase: supabase-js เก็บเข้า localStorage ให้เอง
  //   โหมด api: ไม่มีใครรับ → HQ กด "เข้าระบบแทน" แล้วได้หน้าเข้าสู่ระบบเปล่า ๆ (เจอจริง 18 ส.ค. 69)
  // ที่นี่จึงรับใบผ่านมาแลกเป็น cookie httpOnly ทันที แล้วหน้าเว็บล้าง URL ทิ้ง
  // ⚠️ ต้องยืนยันกับ Supabase ว่าใบผ่านใบนี้ของจริง — ห้ามเชื่อสิ่งที่ส่งมาจากเบราว์เซอร์ตรง ๆ
  if (op === "adopt") {
    const b = (await req.json().catch(() => null)) as { access_token?: string; refresh_token?: string } | null;
    const at = (b?.access_token ?? "").trim();
    if (!at) return fail(400, "ลิงก์เข้าระบบไม่สมบูรณ์");
    if (!URL_ || !ANON) return fail(503, "ระบบยังไม่ได้ตั้งค่าเชื่อมต่อฐานข้อมูล");
    // ⚠️ ค่านี้มาจากเบราว์เซอร์ ใครส่งอะไรมาก็ได้ — ต้องกันของที่ "ไม่ใช่ใบผ่านด้วยซ้ำ" ก่อน
    //    JWT ต้องเป็นอักขระ ASCII สามท่อนคั่นด้วยจุด · ถ้ามีอักขระอื่นปน (เช่นภาษาไทย)
    //    การเอาไปใส่ header จะโยน error ทะลุออกมาเป็น 500 แทนที่จะปฏิเสธสุภาพ ๆ
    //    (เจอจริง 18 ส.ค. 69 จาก api-mode-session.spec.ts — ส่งขยะเข้าไปแล้วเซิร์ฟเวอร์พังภายใน)
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(at)) {
      return fail(401, "ลิงก์เข้าระบบไม่ถูกต้อง");
    }
    let userOk = false;
    try {
      const check = createClient(URL_, ANON, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${at}` } },
      });
      const { data: u, error: uErr } = await check.auth.getUser(at);
      userOk = !uErr && !!u?.user;
    } catch (e) {
      console.error("[api/v1/auth?op=adopt] ตรวจใบผ่านไม่สำเร็จ", e);
    }
    if (!userOk) return fail(401, "ลิงก์เข้าระบบหมดอายุหรือถูกใช้ไปแล้ว");

    const { alive, ...me } = await publicSession(at);
    if (!alive) return evict(GONE, req);
    const claims = claimsOf(at);
    const ttl = claims.exp ? Math.max(60, claims.exp - Math.floor(Date.now() / 1000)) : 3600;
    const res = NextResponse.json(me, { headers: { "cache-control": "no-store" } });
    res.cookies.set(accessCookie(at, ttl, req));
    if (b?.refresh_token) res.cookies.set(refreshCookie(b.refresh_token, req));
    return res;
  }

  // op = login
  const body = (await req.json().catch(() => null)) as { email?: unknown; password?: unknown } | null;
  // ⚠️ ต้องเช็กชนิดก่อนเรียก .trim() (ตรวจพบ 27 ส.ค. 69) — ส่ง email เป็นตัวเลขหรือ password เป็นอาร์เรย์
  //    ทำให้โยน TypeError ออกมาแล้วกลายเป็น 500 "ระบบขัดข้อง" ทั้งที่เป็นข้อมูลขาเข้าผิดรูป (ต้องเป็น 400)
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) return fail(400, "กรุณากรอกอีเมลและรหัสผ่าน");
  if (!URL_ || !ANON) return fail(503, "ระบบยังไม่ได้ตั้งค่าเชื่อมต่อฐานข้อมูล");

  const { data, error } = await anonClient().auth.signInWithPassword({ email, password });
  const s = data?.session;
  if (error || !s?.access_token) {
    // ⚠️ ห้ามบอกว่า "ไม่มีอีเมลนี้" หรือ "รหัสผ่านผิด" แยกกัน — เท่ากับบอกคนเดาว่าอีเมลไหนมีอยู่จริง
    return fail(401, "อีเมลหรือรหัสผ่านไม่ถูกต้อง");
  }

  const { alive, ...me } = await publicSession(s.access_token);
  if (!alive) return evict(GONE, req);
  const res = NextResponse.json(me, { headers: { "cache-control": "no-store" } });
  res.cookies.set(accessCookie(s.access_token, s.expires_in ?? 3600, req));
  if (s.refresh_token) res.cookies.set(refreshCookie(s.refresh_token, req));
  return res;
};

// ── ถามว่าตอนนี้เป็นใคร (ใช้ตอนเปิดหน้าใหม่/รีเฟรช) ──
export const GET = async (req: NextRequest): Promise<Response> => {
  const token = callerToken(req);
  // ⚠️ "ไม่มีใบผ่าน" มีสองความหมาย แยกให้ออก ไม่งั้นเด้งผู้ใช้ออกทั้งที่ยังมีสิทธิ์อยู่
  //
  //    (ก) ไม่มีทั้งใบผ่านและใบต่ออายุ = ยังไม่เคยล็อกอิน — เป็นเรื่องปกติของหน้าเข้าสู่ระบบ
  //        ตอบ 401 จะกลายเป็น error สีแดงใน console ทุกครั้งที่มีคนเปิดหน้านั้น
  //        204 = "ตอบแล้ว แต่ไม่มีเนื้อหา" ซึ่งแปลว่า "ยังไม่ได้ล็อกอิน" ได้ตรงตัว
  //
  //    (ข) ไม่มีใบผ่าน แต่ยังมีใบต่ออายุ = ใบผ่านหมดอายุแล้ว (cookie ถูกลบตามอายุที่ตั้งไว้)
  //        ⚠️ กรณีนี้ต้องตอบ 401 เพื่อให้หน้าเว็บไปต่ออายุ — ถ้าตอบ 204 เหมือนกรณี (ก)
  //           หน้าเว็บจะเข้าใจว่า "ไม่เคยล็อกอิน" แล้วเลิกทันทีโดยไม่ลองต่ออายุ
  //           = ผู้ใช้ถูกเด้งออกทุก 1 ชั่วโมงตามอายุใบผ่าน ทั้งที่ใบต่ออายุมีอายุ 30 วัน
  //           (เจอจริง 18 ส.ค. 69 จาก api-mode-session.spec.ts — ตาเปล่ามองไม่เห็นเพราะ
  //            ต้องรอครบชั่วโมงถึงจะเกิด และ "เด้งออก" ดูเหมือนพฤติกรรมปกติของระบบ)
  if (!token) {
    if (req.cookies.get(REFRESH_COOKIE)?.value) return fail(401, "เซสชันหมดอายุ");
    return new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });
  }
  const c = claimsOf(token);
  // ใบผ่านหมดอายุแล้ว → บอกให้ไปต่ออายุ ไม่ใช่ตอบว่ายังล็อกอินอยู่
  if (c.exp && c.exp * 1000 <= Date.now()) return fail(401, "เซสชันหมดอายุ");
  const { alive, ...me } = await publicSession(token);
  if (!alive) return evict(GONE, req);
  return NextResponse.json(me, { headers: { "cache-control": "no-store" } });
};
