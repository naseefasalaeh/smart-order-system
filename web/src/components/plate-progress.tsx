import { pendingPlates, type PlateProgress as Progress } from "@/lib/plate-progress";

export default function PlateProgress({ item, status = "preparing" }: { item: Progress; status?: string; }) {
  const completedCount = item.completed_plates?.length ?? 0;
  const servedCount = item.served_plates?.length ?? 0;
  const pendingCount = pendingPlates(item).length;
  const remainingCount = item.quantity - completedCount;

  return <p className="mt-2 text-sm text-zinc-600">
    ทำเสร็จ {completedCount}/{item.quantity} จาน · เสิร์ฟแล้ว {servedCount}/{item.quantity} จาน
    {pendingCount > 0 && <span className="ml-2 font-medium text-green-700">รอเสิร์ฟ {pendingCount} จาน</span>}
    {remainingCount > 0 && <span className="ml-2 text-orange-700">{status === "confirmed" ? "รอเริ่มทำ" : "กำลังทำ"} {remainingCount} จาน</span>}
  </p>;
}
