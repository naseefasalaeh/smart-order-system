import { revalidatePath } from "next/cache";
import DashboardSidebar from "@/components/dashboard-sidebar";
import { requireDashboardContext } from "@/lib/dashboard-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/member-input";
import { hashMemberPassword } from "@/lib/member-auth";
import MembersClient, {
  type AdminMemberRow,
  type MemberAnalyticsData,
  type PendingMemberRow,
} from "./MembersClient";

async function approveMember(form: FormData) {
  "use server";
  const { db } = await requireDashboardContext(["admin"]);
  const hash = String(form.get("hash") ?? "");
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error("คำขอไม่ถูกต้อง");

  const { error } = await db.rpc("admin_approve_member", { p_token_hash: hash });
  if (error) {
    const { error: adminErr } = await createAdminClient().rpc("admin_approve_member", { p_token_hash: hash });
    if (adminErr) throw new Error("อนุมัติไม่สำเร็จ กรุณาลองใหม่");
  }
  revalidatePath("/dashboard/members");
}

async function rejectMember(form: FormData) {
  "use server";
  const { db } = await requireDashboardContext(["admin"]);
  const hash = String(form.get("hash") ?? "");
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error("คำขอไม่ถูกต้อง");

  const { error } = await db.rpc("admin_reject_member", { p_token_hash: hash });
  if (error) {
    const { error: adminErr } = await createAdminClient().rpc("admin_reject_member", { p_token_hash: hash });
    if (adminErr) throw new Error("ปฏิเสธคำขอไม่สำเร็จ กรุณาลองใหม่");
  }
  revalidatePath("/dashboard/members");
}

async function addMember(form: FormData) {
  "use server";
  const { db } = await requireDashboardContext(["admin"]);
  const rawPhone = form.get("phone");
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new Error("เบอร์โทรศัพท์ไม่ถูกต้อง กรุณาใช้เบอร์มือถือไทย 10 หลัก");

  const gender = String(form.get("gender") ?? "unspecified");
  const age = String(form.get("age") ?? "unspecified");
  const promotions = form.get("promotions") === "on";

  const { error } = await db.rpc("admin_add_member", {
    p_phone: phone,
    p_gender: gender,
    p_age: age,
    p_promotions: promotions,
  });

  if (error) {
    if (error.message?.includes("PHONE_ALREADY_EXISTS")) {
      throw new Error("เบอร์โทรศัพท์นี้มีอยู่ในระบบแล้ว ไม่สามารถเพิ่มซ้ำได้");
    }
    const { error: adminErr } = await createAdminClient().rpc("admin_add_member", {
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
  if (!newPassword || newPassword.length < 4) throw new Error("รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร");

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

  // Fetch pending member requests
  let pendingMembers: PendingMemberRow[] = [];
  const { data: pendingRows } = await db.rpc("admin_list_pending_members");
  if (pendingRows) {
    pendingMembers = pendingRows as PendingMemberRow[];
  } else {
    const { data: adminPending } = await createAdminClient().rpc("admin_list_pending_members");
    if (adminPending) pendingMembers = adminPending as PendingMemberRow[];
  }

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

  return (
    <div className="min-h-screen bg-orange-50 lg:flex">
      <DashboardSidebar role={role} fullName={fullName} activePath="/dashboard/members" />
      <main className="min-w-0 flex-1 p-6 lg:p-10">
        <div className="mb-6">
          <p className="text-sm font-semibold text-orange-600">SMART ORDER MEMBER</p>
          <h1 className="text-3xl font-black text-zinc-900">จัดการสมาชิก</h1>
          <p className="mt-1 text-sm text-zinc-600">
            ระบบบริหารจัดการสมาชิก เพิ่ม/แก้ไข/ลบ อนุมัติสมาชิกใหม่ และวิเคราะห์สถิติเพื่อการตลาด
          </p>
        </div>

        <MembersClient
          members={members}
          analytics={analytics}
          pendingMembers={pendingMembers}
          approveAction={approveMember}
          rejectAction={rejectMember}
          addAction={addMember}
          updateAction={updateMember}
          deleteAction={deleteMember}
          resetPasswordAction={resetPassword}
        />
      </main>
    </div>
  );
}
