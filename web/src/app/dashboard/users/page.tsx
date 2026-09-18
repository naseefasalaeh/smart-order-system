import DashboardSidebar from "@/components/dashboard-sidebar";
import { requireDashboardContext } from "@/lib/dashboard-auth";
import UserManagement from "./user-management";

export default async function UsersPage() {
  const { user, role } = await requireDashboardContext(["admin"]);
  return <div className="min-h-screen bg-orange-50 lg:flex">
    <DashboardSidebar role={role} activePath="/dashboard/users" />
    <main className="min-w-0 flex-1 p-6 lg:p-10">
      <h1 className="text-3xl font-bold text-zinc-900">จัดการผู้ใช้งาน</h1>
      <p className="mt-2 text-zinc-600">เพิ่มผู้ใช้งาน กำหนดสิทธิ์และรหัสผ่าน จัดการสถานะบัญชี</p>
      <UserManagement currentUserId={user.id} />
    </main>
  </div>;
}
