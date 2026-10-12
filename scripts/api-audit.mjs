// ── ตรวจ API จริงทุกเส้นทาง (ยิงคำขอจริงใส่เซิร์ฟเวอร์ที่รันอยู่) ──────────────
// ใช้: node scripts/api-audit.mjs
// อ่านบัญชีทดสอบจาก tests/.env.test · ต้องมีเซิร์ฟเวอร์โหมด api รันที่ :3001 (ดีลเลอร์) และ :3002 (HQ)
import { readFileSync, writeFileSync } from "node:fs";

const env = (file) => {
  const m = new Map();
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const s = line.trim(); if (!s || s.startsWith("#")) continue;
      const i = s.indexOf("="); if (i > 0) m.set(s.slice(0, i).trim(), s.slice(i + 1).trim());
    }
  } catch { /* ไม่มีไฟล์ */ }
  return m;
};
const T = env("tests/.env.test");
const ACC = {
  RYG:   { email: T.get("TEST_RYG_EMAIL"),   password: T.get("TEST_RYG_PASSWORD") },
  CNX:   { email: T.get("TEST_CNX_EMAIL"),   password: T.get("TEST_CNX_PASSWORD") },
  ADMIN: { email: T.get("TEST_ADMIN_EMAIL"), password: T.get("TEST_ADMIN_PASSWORD") },
};
const DEALER = "http://localhost:3001", HQ = "http://localhost:3002";

const jars = new Map();          // ชื่อบัญชี → cookie string
async function login(who, origin) {
  const r = await fetch(`${origin}/api/v1/auth?op=login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(ACC[who]),
  });
  const set = r.headers.getSetCookie?.() ?? [];
  const jar = set.map(c => c.split(";")[0]).join("; ");
  jars.set(`${who}@${origin}`, jar);
  return { status: r.status, jar, body: await r.text() };
}

const results = [];
let n = 0;
async function call(ชื่อ, { origin = DEALER, as = "RYG", method = "GET", path, body, headers = {}, expect }) {
  n++;
  const jar = as === null ? "" : (jars.get(`${as}@${origin}`) ?? "");
  const h = { ...headers };
  if (jar) h.cookie = jar;
  if (body !== undefined) h["content-type"] = "application/json";
  let status = 0, text = "";
  const t0 = Date.now();
  try {
    const r = await fetch(origin + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    status = r.status; text = (await r.text()).slice(0, 300);
  } catch (e) { status = -1; text = String(e).slice(0, 200); }
  const ms = Date.now() - t0;
  const ok = expect === undefined ? null : (Array.isArray(expect) ? expect.includes(status) : status === expect);
  results.push({ n, ชื่อ, as: as ?? "ไม่มีใบผ่าน", method, path, status, expect, ok, ms, text });
  const mark = ok === null ? "·" : ok ? "ok" : "FAIL";
  console.log(`${String(n).padStart(3)} ${mark.padEnd(4)} ${String(status).padEnd(3)} ${method.padEnd(6)} ${path.slice(0, 62).padEnd(62)} ${as ?? "-"} ${ms}ms`);
  return { status, text };
}
export { call, login, results, ACC, DEALER, HQ, jars };

if (process.argv[1] && process.argv[1].includes("api-audit.mjs")) {
  const { run } = await import("./api-audit-cases.mjs");
  await run({ call, login, results, ACC, DEALER, HQ, jars });
  const bad = results.filter(r => r.ok === false);
  console.log(`\nรวม ${results.length} คำขอ · ไม่ตรงที่คาด ${bad.length}`);
  for (const b of bad) console.log(`  FAIL #${b.n} ${b.ชื่อ} — คาด ${b.expect} ได้ ${b.status} · ${b.text.slice(0, 160)}`);
  writeFileSync("node_modules/.cache/api-audit.json", JSON.stringify(results, null, 1));
  process.exit(bad.length ? 1 : 0);
}
