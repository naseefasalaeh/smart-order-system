import CustomerOrdersClient from "./CustomerOrdersClient";

type CustomerOrdersPageProps = {
  params: Promise<{ tableId: string }>;
};

export default async function CustomerOrdersPage({ params }: CustomerOrdersPageProps) {
  const { tableId } = await params;
  const tableNumber = Number(tableId);

  return <CustomerOrdersClient tableNumber={tableNumber} />;
}
