import { Suspense } from "react";
import CustomerOrdersClient from "./CustomerOrdersClient";
import { resolveTableReference } from "@/lib/table-reference";
import { loadCustomerMenuCatalog } from "@/lib/customer-menu-catalog";

type CustomerOrdersPageProps = {
  params: Promise<{ tableId: string }>;
};

export default async function CustomerOrdersPage({ params }: CustomerOrdersPageProps) {
  const { tableId } = await params;
  const table = await resolveTableReference(tableId);
  if (!table) return <main className="p-8">ไม่พบโต๊ะนี้</main>;

  let menus = [] as Awaited<ReturnType<typeof loadCustomerMenuCatalog>>;
  try {
    menus = await loadCustomerMenuCatalog();
  } catch (error) {
    console.error("โหลด catalog ในหน้า customer orders ไม่สำเร็จ", error);
  }

  return (
    <Suspense fallback={<main className="min-h-screen bg-zinc-100 p-8 text-center">กำลังโหลด...</main>}>
      <CustomerOrdersClient
        tableId={table.id}
        tableNumber={String(table.table_number)}
        legacyReference={tableId}
        menus={menus}
      />
    </Suspense>
  );
}
