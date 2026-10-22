// ── เปิด next dev / next start ด้วยพอร์ตของโฟลเดอร์นี้ (ทำงานหลายเซสชันพร้อมกัน · 22 ต.ค. 69) ───────────────────────────────
//   apps/*/package.json เรียกตัวนี้แทนการเขียนเลขพอร์ตเอง · โฟลเดอร์หลัก = scripts/lib/ports.json · เซสชันลูก = .pms-session.json
//   ใช้: node ../../scripts/next-port.mjs dev|start dealer|hq   (รันจากโฟลเดอร์แอป)
import { spawn } from "node:child_process";
import { พอร์ต } from "./lib/session.mjs";

const [คำสั่ง, แอป] = process.argv.slice(2);
if (!["dev", "start"].includes(คำสั่ง) || !["dealer", "hq"].includes(แอป)) {
  console.error("ใช้: node ../../scripts/next-port.mjs dev|start dealer|hq");
  process.exit(2);
}
const p = พอร์ต("dev")[แอป];
const ลูก = spawn("next", [คำสั่ง, "-p", String(p)], { stdio: "inherit", shell: true });
ลูก.on("exit", (code) => process.exit(code ?? 1));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => ลูก.kill(sig));
