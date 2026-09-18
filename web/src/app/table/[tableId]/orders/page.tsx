import CustomerOrdersClient from "./CustomerOrdersClient";
import { resolveTableReference } from "@/lib/table-reference";

type CustomerOrdersPageProps = {
  params: Promise<{ tableId: string }>;
};

export default async function CustomerOrdersPage({ params }: CustomerOrdersPageProps) {
  const { tableId } = await params;
  const table = await resolveTableReference(tableId);
  if (!table) return <main className="p-8">ไม่พบโต๊ะนี้</main>;
  return <CustomerOrdersClient tableId={table.id} tableNumber={String(table.table_number)} legacyReference={tableId} />;
}
