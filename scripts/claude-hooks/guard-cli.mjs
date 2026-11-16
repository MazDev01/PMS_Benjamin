// ── hook ของ Claude Code (PreToolUse): กันคำสั่งของ AI ที่แตะบัญชี/โปรเจกต์ Supabase จริง + กันแก้ตัวกันเอง (บอสสั่ง 16 พ.ย. 69 · H1) ──
//
// ต่อใช้จาก .claude/settings.json ของโปรเจกต์ (ทุกโฟลเดอร์เซสชันได้ด้วย เพราะ git เก็บทั้งสองไฟล์)
// อ่าน JSON ของ hook จาก stdin · ออกรหัส 2 + ข้อความทาง stderr = Claude Code ไม่รันคำสั่งนั้น · ออก 0 = ผ่าน
//
// กัน (Bash · PowerShell):
//   1. supabase CLI แบบจัดการโปรเจกต์/บัญชี — อนุญาตเฉพาะคำสั่งในเครื่อง (start · stop · status · init · db reset/diff/lint/start · migration new
//      · gen types · test db · --version/help) และต้องไม่มี --linked / --project-ref · อย่างอื่น (link · db push · projects · branches · secrets
//      · functions deploy · orgs · login · db query --linked ฯลฯ) = กัน — เพราะ CLI อ่านโทเคนบัญชีจริงจาก Windows Credential Manager เองโดยปริยาย
//   2. คำสั่งที่มีรหัสฐานจริง yhhhcrvhkforwsagojho · โทเคนบัญชี (SUPABASE_ACCESS_TOKEN · sbp_…) · Management API (api.supabase.com)
//   3. npm/pnpm run prod:query · db:push:prod (และ node scripts/prod-query.mjs · db-push-prod.mjs) — prod:query ใช้ CLI กุญแจบัญชีจริง (กันจนกว่างาน H2 เสร็จ)
//   4. แก้/ลบตัวกันเอง: .claude/settings.json · .claude/settings.local.json · สคริปต์นี้ — ทั้งเครื่องมือแก้ไฟล์ (Edit/Write/MultiEdit/NotebookEdit)
//      และคำสั่งที่เขียน/ลบ/ย้าย/ถอยไฟล์เหล่านี้ (อ่านได้: cat · type · Get-Content · grep · git diff/log/show/status · git add/commit)
//   แก้ตัวกันทีหลัง = บอสแก้เอง (บอสตัดสิน 16 พ.ย. 69)
// ข้อทดสอบ: tests/unit/guardCli.test.ts (ป้อน JSON ของ hook ทุกรูปแบบ)
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const รหัสฐานจริง = "yhhhcrv" + "hkforwsagojho";

/** ไฟล์ที่ AI ห้ามแก้/ลบ (เทียบท้ายพาธ · ไม่สนตัวพิมพ์ · / หรือ \) */
export const ไฟล์ตัวกัน = [".claude/settings.json", ".claude/settings.local.json", "scripts/claude-hooks/guard-cli.mjs"];

const ปกติ = (s) => String(s ?? "").replace(/\\/g, "/").toLowerCase();
const แตะไฟล์ตัวกัน = (พาธ) => { const p = ปกติ(พาธ); return ไฟล์ตัวกัน.some(f => p === f || p.endsWith(`/${f}`)); };

// คำสั่งย่อยของ supabase CLI ที่ทำในเครื่องเท่านั้น (Docker) — นอกนี้ = จัดการโปรเจกต์/บัญชีบนคลาวด์
const ในเครื่อง = [/^start\b/, /^stop\b/, /^status\b/, /^init\b/, /^db\s+(reset|diff|lint|start)\b/, /^migration\s+new\b/, /^gen\s+types\b/, /^test\s+db\b/, /^(--version|-v|help|--help|-h)\b/, /^$/];

/** ช่วงคำสั่งที่เรียก supabase CLI: คืนข้อความหลังชื่อโปรแกรม (คำสั่งย่อย + ตัวเลือก) ทุกจุด */
function เรียกsupabase(คำสั่ง) {
  const ผล = [];
  const re = /(?:^|[\s"'`&;|(){}]|\bdlx\s+|\bexec\s+)(?:[\w.:~/\\-]*[\\/])?supabase(?:\.exe|\.cmd|\.ps1)?["']?(?=\s|$|["';|&)])([^;&|\n\r]*)/gi;
  for (const m of คำสั่ง.matchAll(re)) ผล.push(m[1].trim().replace(/^["']+|["']+$/g, "").trim());
  return ผล;
}

// ── คำสั่ง git ที่เขียนทับไฟล์ตัวกันโดยไม่เอ่ยชื่อไฟล์ (บอสสั่งเพิ่ม 16 พ.ย. 69): reset --hard · stash · checkout/switch/merge/rebase/cherry-pick/pull
//   ถาม git จริงว่าคำสั่งนั้นจะเปลี่ยนไฟล์ตัวกันไหม (diff --name-only) — เปลี่ยน = กัน · ไม่เปลี่ยน = ผ่าน · ถามไม่ได้ = กันไว้ก่อน
//   checkout/restore ทั้งโฟลเดอร์ (pathspec . :/ *) = กัน · ยกเว้นตอนรวมงาน H1 ครั้งแรก (โฟลเดอร์หลักยังไม่มี hook) · หลังจากนั้นบอสแก้เอง
const ถามgitจริง = (args, cwd) => {
  const r = spawnSync("git", args, { cwd: cwd || undefined, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return { ok: r.status === 0, out: (r.stdout ?? "").trim() };
};
const ไฟล์ตัวกันใน = (รายการ) => รายการ.split(/\r?\n/).map(ปกติ).filter(f => ไฟล์ตัวกัน.some(x => f === x || f.endsWith(`/${x}`)));
const เป็นพาธเต็ม = (p) => p.replace(/^["']|["']$/g, "").replace(/^\/([a-z])\//i, (_, d) => `${d.toUpperCase()}:/`);

/** ตรวจคำสั่ง git ช่วงเดียว — ผ่าน = "" · กัน = เหตุผล */
function ตรวจgit(ช่วง, cwd, ถามgit) {
  const โทเคน = ช่วง.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  const i = โทเคน.findIndex(t => /^git(\.exe)?$/i.test(t));
  if (i < 0) return "";
  let ที่ = cwd, k = i + 1;
  while (k < โทเคน.length && โทเคน[k].startsWith("-")) { if (โทเคน[k] === "-C" && โทเคน[k + 1]) { ที่ = เป็นพาธเต็ม(โทเคน[k + 1]); k++; } k++; }
  const ย่อย = (โทเคน[k] ?? "").toLowerCase(), ส่วนที่เหลือ = โทเคน.slice(k + 1).map(t => t.replace(/^["']|["']$/g, ""));
  const ไม่ใช่ตัวเลือก = ส่วนที่เหลือ.filter(t => !t.startsWith("-"));
  const เหตุ = (ไฟล์) => `git ${ย่อย} จะเขียนทับไฟล์ตัวกัน (${ไฟล์.join(" · ")}) — บอสแก้เอง (บอสตัดสิน 16 พ.ย. 69)`;
  const ตรวจdiff = (args) => { const r = ถามgit(["diff", "--name-only", ...args], ที่); if (!r.ok) return `git ${ย่อย}: ตรวจไม่ได้ว่าจะเขียนทับไฟล์ตัวกันไหม — กันไว้ก่อน`; const f = ไฟล์ตัวกันใน(r.out); return f.length ? เหตุ(f) : ""; };
  const ทั้งโฟลเดอร์ = ส่วนที่เหลือ.some(t => [".", ":/", "*", "./"].includes(t));
  if ((ย่อย === "checkout" || ย่อย === "restore") && ทั้งโฟลเดอร์) return `git ${ย่อย} ทั้งโฟลเดอร์ จะเขียนทับไฟล์ตัวกันด้วย — ระบุไฟล์ที่ต้องการแทน (บอสตัดสิน 16 พ.ย. 69)`;
  if (ย่อย === "reset" && ส่วนที่เหลือ.some(t => /^--(hard|merge|keep)$/.test(t))) return ตรวจdiff([ไม่ใช่ตัวเลือก[0] ?? "HEAD"]);
  if (ย่อย === "stash") {
    const ทำ = (ไม่ใช่ตัวเลือก[0] ?? "push").toLowerCase();
    if (["list", "show", "drop", "clear", "create", "store"].includes(ทำ)) return "";
    if (["pop", "apply", "branch"].includes(ทำ)) { const ref = ไม่ใช่ตัวเลือก[ทำ === "branch" ? 2 : 1] ?? "stash@{0}"; return ตรวจdiff([`${ref}^1`, ref]); }
    return ตรวจdiff(["HEAD"]);   // push/save: ไฟล์ตัวกันที่ถูกแก้ค้างอยู่จะถูกถอยกลับ
  }
  if ((ย่อย === "checkout" || ย่อย === "switch") && !ส่วนที่เหลือ.includes("--")) {
    // สร้าง branch ใหม่ (-b/-B/-c/-C/--orphan ชื่อ [จุดเริ่ม]) = ตรวจจากจุดเริ่ม (ไม่ระบุ = HEAD = ไม่เปลี่ยนไฟล์)
    const ใหม่ = ส่วนที่เหลือ.findIndex(t => /^(-[bBcC]|--orphan|--create|--force-create)$/.test(t));
    if (ใหม่ >= 0) { const จุดเริ่ม = ส่วนที่เหลือ.slice(ใหม่ + 2).find(t => !t.startsWith("-")); return จุดเริ่ม ? ตรวจdiff(["HEAD", จุดเริ่ม]) : ""; }
    if (ไม่ใช่ตัวเลือก[0]) return ตรวจdiff(["HEAD", ไม่ใช่ตัวเลือก[0]]);
  }
  if (["merge", "rebase", "cherry-pick"].includes(ย่อย) && ไม่ใช่ตัวเลือก[0]) return ตรวจdiff([`HEAD...${ไม่ใช่ตัวเลือก[ไม่ใช่ตัวเลือก.length - 1]}`]);
  if (ย่อย === "pull") return ตรวจdiff(["HEAD...@{u}"]);
  return "";
}

/** ตรวจคำสั่งเชลล์ — ผ่าน = "" · กัน = เหตุผล · opt.cwd = โฟลเดอร์ที่คำสั่งเริ่ม (จาก JSON ของ hook) · opt.ถามgit = ตัวถาม git (ข้อทดสอบใส่ตัวจำลอง) */
export function ตรวจคำสั่ง(คำสั่ง, { cwd = "", ถามgit = ถามgitจริง } = {}) {
  const c = String(คำสั่ง ?? "");
  if (c.toLowerCase().includes(รหัสฐานจริง)) return `คำสั่งมีรหัสฐานจริง (${รหัสฐานจริง}) — AI ห้ามแตะฐานจริง`;
  if (/SUPABASE_ACCESS_TOKEN|\bsbp_[a-z0-9]{8,}|api\.supabase\.com/i.test(c)) return "คำสั่งใช้โทเคนบัญชี Supabase / Management API — AI ห้ามใช้กุญแจระดับบัญชี";
  if (/(?:^|[\s"'&;|(])(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:prod:query|db:push:prod)\b|node\s+["']?(?:[\w./\\:-]*[\\/])?(?:prod-query|db-push-prod)\.mjs)/i.test(c))
    return "prod:query / db:push:prod ใช้กุญแจบัญชีจริง — บอสรันเอง (prod:query กันจนกว่างาน H2 role อ่านอย่างเดียวเสร็จ)";
  for (const ย่อย of เรียกsupabase(c)) {
    const s = ย่อย.toLowerCase().replace(/\s+/g, " ");
    if (/(^|\s)--(linked|project-ref)\b/.test(s)) return `supabase ${ย่อย} — --linked/--project-ref ต่อโปรเจกต์บนคลาวด์ด้วยโทเคนบัญชีจริง`;
    if (!ในเครื่อง.some(r => r.test(s))) return `supabase ${ย่อย.split(/\s+/).slice(0, 3).join(" ")} — คำสั่งจัดการโปรเจกต์/บัญชีบนคลาวด์ (CLI อ่านโทเคนบัญชีจริงเองโดยปริยาย) · ใช้ได้เฉพาะคำสั่งในเครื่อง`;
  }
  // แก้/ลบตัวกันเองด้วยคำสั่งเชลล์ — อ่าน/บันทึกลง git ได้
  //   ตรวจทีละช่วงคำสั่ง (; && || | ขึ้นบรรทัด): ช่วงที่เอ่ยไฟล์ตัวกันต้องขึ้นต้นด้วยคำสั่งอ่าน/บันทึกลง git และไม่มีการเขียนทับด้วย >
  const ไฟล์ = /\.claude[\\/]+settings(?:\.local)?\.json|guard-cli\.mjs/i;
  const อ่านอย่างเดียว = /^(?:cat|type|head|tail|less|more|grep|rg|findstr|select-string|get-content|gc|ls|dir|wc|git\s+(?:diff|log|show|status|blame|add|commit|ls-files|check-ignore))\b/i;
  let ที่ = cwd;
  for (const ช่วง of c.split(/&&|\|\||;|\||\r?\n/)) {
    const x = ช่วง.trim();
    if (ไฟล์.test(x) && (!อ่านอย่างเดียว.test(x) || />/.test(x))) return "คำสั่งแก้/ลบ/ย้าย/ถอยไฟล์ตัวกัน (.claude/settings*.json · guard-cli.mjs) — บอสแก้เอง (บอสตัดสิน 16 พ.ย. 69)";
    const ย้าย = x.match(/^(?:cd|pushd|set-location|sl)\s+(?:-path\s+)?(\S+|"[^"]*"|'[^']*')/i);   // ติดตามโฟลเดอร์ (cd x && git …)
    if (ย้าย) { ที่ = เป็นพาธเต็ม(ย้าย[1]); continue; }
    const เหตุ = ตรวจgit(x, ที่, ถามgit);
    if (เหตุ) return เหตุ;
  }
  return "";
}

/** ตรวจ JSON ของ hook ทั้งก้อน — ผ่าน = "" · กัน = เหตุผล */
export function ตรวจhook(ข้อมูล) {
  const ชื่อ = String(ข้อมูล?.tool_name ?? "");
  const ใส่ = ข้อมูล?.tool_input ?? {};
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(ชื่อ)) {
    const พาธ = ใส่.file_path ?? ใส่.notebook_path ?? "";
    return แตะไฟล์ตัวกัน(พาธ) ? `แก้ไฟล์ตัวกัน ${พาธ} — บอสแก้เอง (บอสตัดสิน 16 พ.ย. 69)` : "";
  }
  if (/^(Bash|PowerShell)$/.test(ชื่อ)) return ตรวจคำสั่ง(ใส่.command, { cwd: ข้อมูล?.cwd ?? process.cwd() });
  return "";
}

if (/guard-cli\.mjs$/i.test(process.argv[1] ?? "")) {
  let ข้อมูล = null;
  try { ข้อมูล = JSON.parse(readFileSync(0, "utf8")); } catch { process.exit(0); }
  const เหตุ = ตรวจhook(ข้อมูล);
  if (เหตุ) { console.error(`⛔ บล็อก (ตัวกัน H1 · บอสสั่ง 16 พ.ย. 69): ${เหตุ}`); process.exit(2); }
  process.exit(0);
}
