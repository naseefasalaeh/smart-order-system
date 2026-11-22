import { revalidatePath } from "next/cache";
import DashboardSidebar from "@/components/dashboard-sidebar";
import { requireDashboardContext } from "@/lib/dashboard-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone, validateMemberPassword } from "@/lib/member-input";
import { hashMemberPassword } from "@/lib/member-auth";
import MembersClient, {
  type AdminMemberRow,
  type MemberAnalyticsData,
  type MemberOrderSummary,
} from "./MembersClient";

async function addMember(form: FormData) {
  "use server";
  const { db } = await requireDashboardContext(["admin"]);
  const rawPhone = form.get("phone");
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new Error("เบอร์โทรศัพท์ไม่ถูกต้อง กรุณาใช้เบอร์มือถือไทย 10 หลัก");

  const rawPassword = String(form.get("password") ?? "").trim();
  const passwordCheck = validateMemberPassword(rawPassword);
  if (!passwordCheck.valid) throw new Error(passwordCheck.error || "รหัสผ่านไม่ถูกต้อง");

  const gender = String(form.get("gender") ?? "unspecified");
  const age = String(form.get("age") ?? "unspecified");
  const promotions = form.get("promotions") === "on";

  let createdId: string | null = null;

  const { data: addData, error } = await db.rpc("admin_add_member", {
    p_phone: phone,
    p_gender: gender,
    p_age: age,
    p_promotions: promotions,
  });

  if (error) {
    if (error.message?.includes("PHONE_ALREADY_EXISTS")) {
      throw new Error("เบอร์โทรศัพท์นี้มีอยู่ในระบบแล้ว ไม่สามารถเพิ่มซ้ำได้");
    }
    const { data: adminAddData, error: adminErr } = await createAdminClient().rpc("admin_add_member", {
      p_phone: phone,
      p_gender: gender,
      p_age: age,
      p_promotions: promotions,
    });
    if (adminErr) {
      if (adminErr.message?.includes("PHONE_ALREADY_EXISTS")) {
        throw new Error("เบอร์โทรศัพท์นี้มีอยู่ในระบบแล้ว ไม่สามารถเพิ่มซ้ำได้");
      }
      throw new Error("เพิ่มสมาชิกไม่สำเร็จ กรุณาลองใหม่");
    }
    if (adminAddData && typeof adminAddData === "object" && "id" in adminAddData) {
      createdId = (adminAddData as { id: string }).id;
    }
  } else if (addData && typeof addData === "object" && "id" in addData) {
    createdId = (addData as { id: string }).id;
  }

  // Set password_hash for the newly created member
  const passwordHash = hashMemberPassword(rawPassword);
  const adminClient = createAdminClient();
  if (createdId) {
    await adminClient.from("members").update({ password_hash: passwordHash }).eq("id", createdId);
  } else {
    await adminClient.from("members").update({ password_hash: passwordHash }).eq("phone", phone);
  }

  revalidatePath("/dashboard/members");
}

async function updateMember(form: FormData) {
  "use server";
  const { db } = await requireDashboardContext(["admin"]);
  const memberId = String(form.get("member_id") ?? "");
  const rawPhone = form.get("phone");
  const phone = normalizePhone(rawPhone);
  if (!memberId || !phone) throw new Error("ข้อมูลสมาชิกไม่ถูกต้อง");

  const gender = String(form.get("gender") ?? "unspecified");
  const age = String(form.get("age") ?? "unspecified");
  const promotions = form.get("promotions") === "on";

  const { error } = await db.rpc("admin_update_member", {
    p_member_id: memberId,
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
      p_member_id: memberId,
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
  revalidatePath("/dashboard/members");
}

async function deleteMember(form: FormData) {
  "use server";
  const { db } = await requireDashboardContext(["admin"]);
  const memberId = String(form.get("member_id") ?? "");
  if (!memberId) throw new Error("รหัสสมาชิกไม่ถูกต้อง");

  const { error } = await db.rpc("admin_delete_member", { p_member_id: memberId });
  if (error) {
    const { error: adminErr } = await createAdminClient().rpc("admin_delete_member", { p_member_id: memberId });
    if (adminErr) throw new Error("ลบสมาชิกไม่สำเร็จ กรุณาลองใหม่");
  }
  revalidatePath("/dashboard/members");
}

async function resetPassword(form: FormData) {
  "use server";
  const { db } = await requireDashboardContext(["admin"]);
  const memberId = String(form.get("member_id") ?? "");
  const newPassword = String(form.get("new_password") ?? "").trim();
  if (!memberId) throw new Error("รหัสสมาชิกไม่ถูกต้อง");
  const passwordCheck = validateMemberPassword(newPassword);
  if (!passwordCheck.valid) throw new Error(passwordCheck.error || "รหัสผ่านไม่ถูกต้อง");

  const passwordHash = hashMemberPassword(newPassword);

  const { error } = await db.rpc("admin_reset_member_password", {
    p_member_id: memberId,
    p_new_password_hash: passwordHash,
  });

  if (error) {
    const { error: adminErr } = await createAdminClient().rpc("admin_reset_member_password", {
      p_member_id: memberId,
      p_new_password_hash: passwordHash,
    });
    if (adminErr) throw new Error("รีเซ็ตรหัสผ่านไม่สำเร็จ กรุณาลองใหม่");
  }
  revalidatePath("/dashboard/members");
}

export default async function MembersPage() {
  const { role, fullName, db } = await requireDashboardContext(["admin"]);

  // Fetch member list
  let members: AdminMemberRow[] = [];
  const { data: memberRows, error: memberErr } = await db.rpc("admin_list_members");
  if (!memberErr && memberRows) {
    members = memberRows as AdminMemberRow[];
  } else {
    const { data: adminRows } = await createAdminClient().rpc("admin_list_members");
    if (adminRows) members = adminRows as AdminMemberRow[];
  }

  // Fetch analytics for marketing insights
  let analytics: MemberAnalyticsData = {
    total_members: 0,
    total_orders: 0,
    total_spent: 0,
    monthly_signups: [],
    gender_distribution: [],
    age_distribution: [],
  };
  const { data: analyticsRow, error: analyticsErr } = await db.rpc("admin_member_analytics");
  if (!analyticsErr && analyticsRow) {
    analytics = analyticsRow as MemberAnalyticsData;
  } else {
    const { data: adminAnalytics } = await createAdminClient().rpc("admin_member_analytics");
    if (adminAnalytics) analytics = adminAnalytics as MemberAnalyticsData;
  }

  // Fetch all orders associated with members (both completed and cancelled)
  const { data: rawOrders } = await createAdminClient()
    .from("orders")
    .select("id, member_id, total_amount, status, created_at");

  const memberOrders: MemberOrderSummary[] = (rawOrders || [])
    .filter((o) => Boolean(o.member_id))
    .map((o) => ({
      id: String(o.id),
      member_id: String(o.member_id),
      total_amount: Number(o.total_amount || 0),
      status: String(o.status || ""),
      created_at: String(o.created_at || ""),
    }));

  if (memberOrders.length > 0) {
    const statsByMember = new Map<
      string,
      { completedCount: number; cancelledCount: number; totalCount: number; spent: number }
    >();
    let memberCompletedCount = 0;
    let memberCompletedSpent = 0;

    for (const order of memberOrders) {
      const current = statsByMember.get(order.member_id) || {
        completedCount: 0,
        cancelledCount: 0,
        totalCount: 0,
        spent: 0,
      };
      current.totalCount += 1;

      if (order.status === "completed") {
        current.completedCount += 1;
        current.spent += order.total_amount;
        memberCompletedCount += 1;
        memberCompletedSpent += order.total_amount;
      } else if (order.status === "cancelled") {
        current.cancelledCount += 1;
      }
      statsByMember.set(order.member_id, current);
    }

    members = members.map((m) => {
      const stats = statsByMember.get(m.id);
      return {
        ...m,
        order_count: stats ? stats.completedCount : 0,
        completed_orders_count: stats ? stats.completedCount : 0,
        cancelled_orders_count: stats ? stats.cancelledCount : 0,
        total_orders_count: stats ? stats.totalCount : 0,
        total_spent: stats ? stats.spent : 0,
      };
    });

    analytics = {
      ...analytics,
      total_orders: memberCompletedCount,
      total_spent: memberCompletedSpent,
    };
  } else {
    members = members.map((m) => ({
      ...m,
      completed_orders_count: m.order_count,
      cancelled_orders_count: 0,
      total_orders_count: m.order_count,
    }));
  }

  return (
    <div className="min-h-screen bg-orange-50 lg:flex">
      <DashboardSidebar role={role} fullName={fullName} activePath="/dashboard/members" />
      <main className="min-w-0 flex-1 p-6 lg:p-10">
        <div className="mb-6">
          <p className="text-sm font-semibold text-orange-600">SMART ORDER MEMBER</p>
          <h1 className="text-3xl font-black text-zinc-900">จัดการสมาชิก</h1>
          <p className="mt-1 text-sm text-zinc-600">
            ระบบบริหารจัดการสมาชิก เพิ่ม/แก้ไข/ลบ และวิเคราะห์สถิติเพื่อการตลาด
          </p>
        </div>

        <MembersClient
          members={members}
          analytics={analytics}
          memberOrders={memberOrders}
          addAction={addMember}
          updateAction={updateMember}
          deleteAction={deleteMember}
          resetPasswordAction={resetPassword}
        />
      </main>
    </div>
  );
}
