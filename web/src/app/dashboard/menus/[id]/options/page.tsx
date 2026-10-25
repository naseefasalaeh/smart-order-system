import { requireDashboardRole } from "@/lib/dashboard-auth";
import { redirect } from "next/navigation";

type PageProps = { params: Promise<{ id: string }> };

export default async function MenuOptionsPage({ params }: PageProps) {
  await requireDashboardRole(["admin"]);
  const { id } = await params;
  redirect(`/dashboard/menus/${id}/edit?tab=info`);
}
