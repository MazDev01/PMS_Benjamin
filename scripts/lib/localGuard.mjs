// ── ตัวกันไฟล์ใน .local หลุดขึ้น GitHub (26 พ.ย. 69 · งานย้ายโฟลเดอร์ pms-* เข้า .local · repo เป็น public) ─────────────
//   .local/ = โฟลเดอร์ในเครื่องทั้งหมด (โฟลเดอร์เซสชัน · ไฟล์สำรองข้อมูลจริง · กุญแจฐานจริง · ข้อมูลส่วนตัว) — .gitignore กันแล้ว
//   แต่ git add -f / .gitignore ถูกแก้ ยังเพิ่มไฟล์เข้าได้ → ตัวกันอีก 2 ชั้น:
//   · pre-commit: ไฟล์ใต้ .local/ ใน index (ที่จะ commit หรือค้างอยู่แล้ว) = ปฏิเสธ
//   · pre-push: commit ที่จะส่งมีไฟล์ใต้ .local/ (ในต้นไม้ของ commit ปลายทาง หรือ commit ใดในช่วงที่ส่ง) = ปฏิเสธ — ทุก branch
//   ข้อทดสอบ: tests/tools/local-folder.test.mjs (repo จำลอง · ลอง add -f แล้ว commit / push)
import { execFileSync } from "node:child_process";

export const ใต้local = (p) => /^\.local(\/|$)/i.test(String(p).replace(/\\/g, "/"));
const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 << 20 });
const แยก = (s) => s.split("\0").map(x => x.trim()).filter(Boolean);
const ไม่ซ้ำ = (a) => [...new Set(a)];

/** ไฟล์ใต้ .local/ ใน index (ที่จะ commit + ที่ git เก็บอยู่แล้ว) */
export function localในindex(cwd = process.cwd()) {
  return ไม่ซ้ำ([...แยก(git(cwd, "diff", "--cached", "--name-only", "-z")), ...แยก(git(cwd, "ls-files", "-z"))].filter(ใต้local));
}

const ศูนย์ = /^0+$/;
const มีcommit = (cwd, sha) => { try { git(cwd, "cat-file", "-e", `${sha}^{commit}`); return true; } catch { return false; } };

/** ไฟล์ใต้ .local/ ในสิ่งที่จะ push (localSha ไป remoteSha ของ remoteName) — ต้นไม้ของ localSha + ทุก commit ในช่วงที่ยังไม่อยู่ปลายทาง */
export function localในการส่ง(cwd, { localSha, remoteSha = "", remoteName = "" }) {
  if (!localSha || ศูนย์.test(localSha)) return [];   // ลบ branch ปลายทาง ไม่ได้ส่งไฟล์
  const ในต้นไม้ = แยก(git(cwd, "ls-tree", "-r", "--name-only", "-z", localSha)).filter(ใต้local);
  const ช่วง = remoteSha && !ศูนย์.test(remoteSha) && มีcommit(cwd, remoteSha)
    ? [`${remoteSha}..${localSha}`]
    : [localSha, "--not", remoteName ? `--remotes=${remoteName}` : "--remotes"];
  const ในประวัติ = แยก(git(cwd, "log", "--format=", "--name-only", "-z", "--no-renames", ...ช่วง)).filter(ใต้local);
  return ไม่ซ้ำ([...ในต้นไม้, ...ในประวัติ]);
}

export const ข้อความปฏิเสธ = (ทำ, ไฟล์) => [
  `\n⛔ ${ทำ}ไม่ผ่าน: มีไฟล์ใต้ .local/ ${ไฟล์.length} ไฟล์ — .local = โฟลเดอร์ในเครื่อง (ข้อมูลจริง · กุญแจ · โฟลเดอร์เซสชัน) ห้ามขึ้น GitHub (repo เป็น public)`,
  ...ไฟล์.slice(0, 10).map(f => `   ✗ ${f}`),
  ...(ไฟล์.length > 10 ? [`   … อีก ${ไฟล์.length - 10} ไฟล์`] : []),
  "   เอาออกจาก index: git rm -r --cached .local · commit ที่มีไฟล์แล้ว = แก้ประวัติก่อน push · ห้ามข้ามด้วย --no-verify\n",
].join("\n");
