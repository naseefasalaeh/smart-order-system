import CustomerQueueClient from "./CustomerQueueClient";

type CustomerQueuePageProps = {
  params: Promise<{ tableId: string }>;
};

export default async function CustomerQueuePage({
  params,
}: CustomerQueuePageProps) {
  const { tableId } = await params;
  const tableNumber = Number(tableId);

  return <CustomerQueueClient tableNumber={tableNumber} />;
}
