import { pendingPlates, type PlateProgress as Progress } from "@/lib/plate-progress";

export default function PlateProgress({ item, status = "preparing" }: { item: Progress; status?: string }) {
  return <p className="mt-2 text-sm text-zinc-600">
    ทำเสร็จ {item.completed_plates?.length ?? 0}/{item.quantity} จาน · เสิร์ฟแล้ว {item.served_plates?.length ?? 0}/{item.quantity} จาน
    {pendingPlates(item).length > 0 && <span className="ml-2 font-medium text-green-700">รอเสิร์ฟ {pendingPlates(item).length} จาน</span>}
    {(item.completed_plates?.length ?? 0) < item.quantity && <span className="ml-2 text-orange-700">{status === "confirmed" ? "รอเริ่มทำ" : "กำลังทำ"} {item.quantity - (item.completed_plates?.length ?? 0)} จาน</span>}
  </p>;
}
