// โครงโหลดของทุกหน้าดีลเลอร์ (Next แสดงระหว่างนำทางอัตโนมัติ) — สเกเลตัน KPI + ตาราง
import { PageSkeleton } from "@pms/shared/components/ui/PageSkeleton";

export default function DealerLoading() {
  return <PageSkeleton cards={4} rows={7} cols={5} />;
}
