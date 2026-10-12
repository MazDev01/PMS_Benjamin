"use client";

// แอป HQ ไม่มีหน้า /dashboard ของตัวเอง — แดชบอร์ด HQ อยู่ที่ /hq/dashboard
// (/dashboard = แดชบอร์ด "ดีลเลอร์" ซึ่งอยู่ในแอป dealer คนละพอร์ต)
// เดิม: เข้า /dashboard บนแอป HQ → 404 · และ HQ layout เด้ง non-HQ มา /dashboard ก็เจอ 404
// แก้: ผู้ใช้ HQ → พาไป /hq/dashboard · ไม่ใช่ HQ → หน้า login ของแอป HQ (/hq/login)
//   (ห้าม redirect non-HQ กลับ /hq/dashboard เพราะ HQ layout จะเด้งออก /dashboard อีก = ลูป · /hq/login อยู่ใน (auth) group ไม่ติด HQ layout)
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRole } from "@pms/shared/context/RoleContext";

export default function HQDashboardRedirect() {
  const { isHQ, hydrated } = useRole();
  const router = useRouter();

  useEffect(() => {
    if (!hydrated) return;
    router.replace(isHQ ? "/hq/dashboard" : "/hq/login");
  }, [isHQ, hydrated, router]);

  return null;
}
