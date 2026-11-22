import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import DashboardSidebar from "@/components/dashboard-sidebar";
import { requireDashboardContext } from "@/lib/dashboard-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashMemberPassword } from "@/lib/member-auth";
import { normalizePhone, validateMemberPassword } from "@/lib/member-input";
import MemberDetailClient, {
  type MemberDetailData,
  type MemberOrder,
} from "./MemberDetailClient";

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    notFound();
  }

  const { role, fullName, db } = await requireDashboardContext(["admin"]);

  // Fetch Member Details
  let member: MemberDetailData | null = null;
  const { data: detailData, error: detailErr } = await db.rpc("admin_get_member_detail", { p_member_id: id });
  if (!detailErr && detailData) {
    member = detailData as MemberDetailData;
  } else {
    const { data: adminDetail } = await createAdminClient().rpc("admin_get_member_detail", { p_member_id: id });
    if (adminDetail) member = adminDetail as MemberDetailData;
  }

  if (!member) {
    notFound();
  }

  // Fetch Member Orders
  let orders: MemberOrder[] = [];
  const { data: ordersData, error: ordersErr } = await db.rpc("admin_get_member_orders", {
    p_member_id: id,
    p_limit: 100,
    p_offset: 0,
  });
  if (!ordersErr && ordersData) {
    orders = ordersData as MemberOrder[];
  } else {
    const { data: adminOrders } = await createAdminClient().rpc("admin_get_member_orders", {
      p_member_id: id,
      p_limit: 100,
      p_offset: 0,
    });
    if (adminOrders) orders = adminOrders as MemberOrder[];
  }

  // Ensure order_count and total_spent strictly count completed orders
  const completedOrders = orders.filter((o) => o.status === "completed");
  member = {
    ...member,
    order_count: completedOrders.length,
    total_spent: completedOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0),
  };

  async function resetPasswordInDetail(form: FormData) {
    "use server";
    const { db } = await requireDashboardContext(["admin"]);
    const newPassword = String(form.get("new_password") ?? "").trim();
    const validation = validateMemberPassword(newPassword);
    if (!validation.valid) throw new Error(validation.error || "รหัสผ่านไม่ถูกต้อง");
    const passwordHash = hashMemberPassword(newPassword);

    const { error } = await db.rpc("admin_reset_member_password", {
      p_member_id: id,
      p_new_password_hash: passwordHash,
    });
    if (error) {
      await createAdminClient().rpc("admin_reset_member_password", {
        p_member_id: id,
        p_new_password_hash: passwordHash,
      });
    }
    revalidatePath(`/dashboard/members/${id}`);
  }

  async function updateMemberInDetail(form: FormData) {
    "use server";
    const { db } = await requireDashboardContext(["admin"]);
    const rawPhone = form.get("phone");
    const phone = normalizePhone(rawPhone);
    if (!phone) throw new Error("เบอร์โทรศัพท์ไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง");

    const gender = String(form.get("gender") ?? "unspecified");
    const age = String(form.get("age") ?? "unspecified");
    const promotions = form.get("promotions") === "on";

    const { error } = await db.rpc("admin_update_member", {
      p_member_id: id,
      p_phone: phone,
      p_gender: gender,
      p_age: age,
      p_promotions: promotions,
    });

    if (error) {
      if (error.message?.includes("PHONE_ALREADY_EXISTS")) {
        throw new Error("เบอร์โทรศัพท์นี้ถูกใช้งานโดยสมาชิกท่านอื่นแล้ว");
      }
      const { error: adminErr } = await createAdminClient().rpc("admin_update_member", {
        p_member_id: id,
        p_phone: phone,
        p_gender: gender,
        p_age: age,
        p_promotions: promotions,
      });
      if (adminErr) {
        if (adminErr.message?.includes("PHONE_ALREADY_EXISTS")) {
          throw new Error("เบอร์โทรศัพท์นี้ถูกใช้งานโดยสมาชิกท่านอื่นแล้ว");
        }
        throw new Error("แก้ไขข้อมูลสมาชิกไม่สำเร็จ กรุณาลองใหม่");
      }
    }
    revalidatePath(`/dashboard/members/${id}`);
    revalidatePath("/dashboard/members");
  }

  return (
    <div className="min-h-screen bg-orange-50 lg:flex">
      <DashboardSidebar role={role} fullName={fullName} activePath="/dashboard/members" />
      <main className="min-w-0 flex-1 p-6 lg:p-10">
        <MemberDetailClient
          member={member}
          orders={orders}
          onResetPassword={resetPasswordInDetail}
          onUpdateMember={updateMemberInDetail}
        />
      </main>
    </div>
  );
}
