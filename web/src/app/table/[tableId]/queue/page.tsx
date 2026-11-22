import CustomerQueueClient from "./CustomerQueueClient";
import { resolveTableReference } from "@/lib/table-reference";

type CustomerQueuePageProps = {
  params: Promise<{ tableId: string }>;
};

export default async function CustomerQueuePage({
  params,
}: CustomerQueuePageProps) {
  const { tableId } = await params;
  const table = await resolveTableReference(tableId);
  if (!table) return <main className="p-8">ไม่พบโต๊ะนี้</main>;
  return <CustomerQueueClient tableId={table.id} tableNumber={String(table.table_number)} legacyReference={tableId} />;
}
