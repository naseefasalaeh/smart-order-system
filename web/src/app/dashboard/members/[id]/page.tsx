import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import DashboardSidebar from "@/components/dashboard-sidebar";
import { requireDashboardContext } from "@/lib/dashboard-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashMemberPassword } from "@/lib/member-auth";
import { formatOrderNumber } from "@/lib/order-number";
import {
  formatThaiPhone,
  memberAgeLabels,
  memberGenderLabels,
  type MemberAge,
  type MemberGender,
} from "@/lib/member-input";

type MemberDetail = {
  id: string;
  member_code: string;
  phone: string;
  gender: string;
  age_range: string;
  promotion_consent: boolean;
  created_at: string;
  order_count: number;
  total_spent: number;
  device_count: number;
  last_order_at: string | null;
};

type OrderItemOption = {
  option_name: string;
  additional_price: number;
  quantity: number;
};

type OrderItem = {
  id: number;
  quantity: number;
  unit_price: number;
  subtotal: number;
  menu_name: string;
  options: OrderItemOption[];
};

type MemberOrder = {
  id: string;
  order_number?: number;
  table_id: number;
  table_number?: string | number;
  dining_type: string;
  status: string;
  note: string | null;
  total_amount: number;
  created_at: string;
  updated_at: string;
  payment_method?: string | null;
  items: OrderItem[];
};

const statusMap: Record<string, { label: string; bg: string; text: string }> = {
  pending: { label: "รอยืนยัน", bg: "bg-amber-100", text: "text-amber-800" },
  confirmed: { label: "รับออเดอร์แล้ว", bg: "bg-blue-100", text: "text-blue-800" },
  cooking: { label: "กำลังปรุง", bg: "bg-orange-100", text: "text-orange-800" },
  preparing: { label: "กำลังปรุง", bg: "bg-orange-100", text: "text-orange-800" },
  ready: { label: "พร้อมเสิร์ฟ", bg: "bg-purple-100", text: "text-purple-800" },
  served: { label: "เสิร์ฟแล้ว", bg: "bg-emerald-100", text: "text-emerald-800" },
  paid: { label: "ชำระเงินแล้ว", bg: "bg-green-100", text: "text-green-800" },
  completed: { label: "สำเร็จ", bg: "bg-green-100", text: "text-green-800" },
  cancelled: { label: "ยกเลิกแล้ว", bg: "bg-red-100", text: "text-red-800" },
};

function formatThaiDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("th-TH", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

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
  let member: MemberDetail | null = null;
  const { data: detailData, error: detailErr } = await db.rpc("admin_get_member_detail", { p_member_id: id });
  if (!detailErr && detailData) {
    member = detailData as MemberDetail;
  } else {
    const { data: adminDetail } = await createAdminClient().rpc("admin_get_member_detail", { p_member_id: id });
    if (adminDetail) member = adminDetail as MemberDetail;
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

  const avgSpend = member.order_count > 0 ? Math.round(Number(member.total_spent) / member.order_count) : 0;

  async function resetPasswordInDetail(form: FormData) {
    "use server";
    const { db } = await requireDashboardContext(["admin"]);
    const newPassword = String(form.get("new_password") ?? "").trim();
    if (!newPassword || newPassword.length < 4) throw new Error("รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร");
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

  return (
    <div className="min-h-screen bg-orange-50 lg:flex">
      <DashboardSidebar role={role} fullName={fullName} activePath="/dashboard/members" />
      <main className="min-w-0 flex-1 p-6 lg:p-10">
        {/* Breadcrumb Header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-semibold text-zinc-500">
              <Link href="/dashboard/members" className="hover:text-orange-600">
                จัดการสมาชิก
              </Link>
              <span>/</span>
              <span className="text-zinc-900">{member.member_code}</span>
            </nav>
            <div className="mt-2 flex items-center gap-3">
              <h1 className="text-3xl font-black text-zinc-900">{member.member_code}</h1>
              <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-800">
                สมาชิก Smart Order
              </span>
            </div>
          </div>

          <Link
            href="/dashboard/members"
            className="flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 shadow-xs transition hover:bg-zinc-50"
          >
            <span>&larr; กลับหน้ารายชื่อสมาชิก</span>
          </Link>
        </div>

        {/* Member Profile & Summary Metrics Grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left: Member Profile Card */}
          <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-xs">
            <h2 className="text-base font-bold text-zinc-900">ข้อมูลส่วนตัวสมาชิก</h2>
            <div className="mt-4 space-y-3 divide-y divide-zinc-100 text-sm">
              <div className="flex items-center justify-between pt-2">
                <span className="text-zinc-500">รหัสสมาชิก</span>
                <span className="font-mono font-bold text-orange-600">{member.member_code}</span>
              </div>

              <div className="flex items-center justify-between pt-3">
                <span className="text-zinc-500">เบอร์โทรศัพท์</span>
                <span className="font-mono font-semibold text-zinc-900">{formatThaiPhone(member.phone)}</span>
              </div>

              <div className="flex items-center justify-between pt-3">
                <span className="text-zinc-500">เพศ</span>
                <span className="font-semibold text-zinc-800">
                  {memberGenderLabels[member.gender as MemberGender] || member.gender || "ไม่ระบุ"}
                </span>
              </div>

              <div className="flex items-center justify-between pt-3">
                <span className="text-zinc-500">ช่วงอายุ</span>
                <span className="font-semibold text-zinc-800">
                  {memberAgeLabels[member.age_range as MemberAge] || member.age_range || "ไม่ระบุ"}
                </span>
              </div>

              <div className="flex items-center justify-between pt-3">
                <span className="text-zinc-500">วันที่สมัครสมาชิก</span>
                <span className="text-zinc-700">{formatThaiDateTime(member.created_at)}</span>
              </div>

              <div className="flex items-center justify-between pt-3">
                <span className="text-zinc-500">การรับโปรโมชัน</span>
                <span className={`font-semibold ${member.promotion_consent ? "text-emerald-700" : "text-zinc-500"}`}>
                  {member.promotion_consent ? "ยินยอมรับข่าวสาร" : "ไม่รับ"}
                </span>
              </div>

              <div className="flex items-center justify-between pt-3">
                <span className="text-zinc-500">อุปกรณ์ที่ผูกในระบบ</span>
                <span className="font-bold text-zinc-700">{member.device_count} อุปกรณ์</span>
              </div>

              {member.last_order_at && (
                <div className="flex items-center justify-between pt-3">
                  <span className="text-zinc-500">สั่งอาหารล่าสุดเมื่อ</span>
                  <span className="text-zinc-700">{formatThaiDateTime(member.last_order_at)}</span>
                </div>
              )}
            </div>

            {/* Reset Password Section for Staff / Admin */}
            <div className="mt-5 border-t border-zinc-100 pt-4">
              <details className="group rounded-xl border border-amber-200 bg-amber-50/50 p-3">
                <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-bold text-amber-800">
                  <span>🔑 รีเซ็ตรหัสผ่านให้สมาชิก (เมื่อลืมรหัส)</span>
                  <span className="transition group-open:rotate-180">▾</span>
                </summary>
                <form action={resetPasswordInDetail} className="mt-3 space-y-2">
                  <div className="flex gap-2">
                    <input
                      name="new_password"
                      type="text"
                      minLength={4}
                      maxLength={30}
                      required
                      placeholder="เช่น PIN 4 หลัก"
                      className="min-h-9 flex-1 rounded-lg border border-zinc-300 bg-white px-2.5 font-mono text-xs font-medium outline-none focus:border-orange-500"
                    />
                    <button
                      type="submit"
                      className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-orange-700"
                    >
                      บันทึกรหัสใหม่
                    </button>
                  </div>
                  <p className="text-[11px] text-zinc-500">เมื่อบันทึกแล้ว แจ้งรหัสผ่านใหม่นี้แก่ลูกค้าเพื่อเข้าสู่ระบบได้เลย</p>
                </form>
              </details>
            </div>
          </div>

          {/* Right: Key Business Metrics */}
          <div className="space-y-4 lg:col-span-2">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs">
                <span className="text-xs font-semibold text-zinc-500">จำนวนครั้งที่สั่งอาหาร</span>
                <p className="mt-2 text-3xl font-black text-zinc-900">{member.order_count}</p>
                <p className="mt-1 text-xs text-zinc-400">ออเดอร์ทั้งหมดของสมาชิก</p>
              </div>

              <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs">
                <span className="text-xs font-semibold text-zinc-500">ยอดซื้อสะสมทั้งหมด</span>
                <p className="mt-2 text-3xl font-black text-emerald-600">
                  ฿{Number(member.total_spent || 0).toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-zinc-400">คำนวณจากออเดอร์ที่ชำระเงินแล้ว</p>
              </div>

              <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs">
                <span className="text-xs font-semibold text-zinc-500">ยอดสั่งซื้อเฉลี่ย / ครั้ง</span>
                <p className="mt-2 text-3xl font-black text-orange-600">฿{avgSpend.toLocaleString()}</p>
                <p className="mt-1 text-xs text-zinc-400">Average Order Value (AOV)</p>
              </div>
            </div>

            {/* Quick overview notice */}
            <div className="rounded-2xl border border-orange-200 bg-white p-6 shadow-xs">
              <h3 className="font-bold text-zinc-900">สรุปพฤติกรรมลูกค้า</h3>
              <p className="mt-1 text-sm text-zinc-600">
                สมาชิก <span className="font-mono font-semibold">{member.member_code}</span> เข้าใช้งานผ่านเบอร์{" "}
                <span className="font-mono font-semibold">{formatThaiPhone(member.phone)}</span>{" "}
                มียอดสั่งซื้อสะสม ฿{Number(member.total_spent || 0).toLocaleString()} จาก {member.order_count} ออเดอร์
                {member.last_order_at ? ` ออเดอร์ล่าสุดเมื่อ ${formatThaiDateTime(member.last_order_at)}` : ""}
              </p>
            </div>
          </div>
        </div>

        {/* Full Order History Section */}
        <section aria-label="ประวัติการสั่งอาหารทั้งหมด" className="mt-8 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-zinc-900">ประวัติการสั่งอาหารทั้งหมด</h2>
              <p className="text-xs text-zinc-500">รายการคำสั่งซื้อทั้งหมดที่ผูกกับรหัสสมาชิกนี้</p>
            </div>
            <span className="rounded-full bg-zinc-200 px-3 py-1 text-xs font-bold text-zinc-700">
              {orders.length} ออเดอร์
            </span>
          </div>

          {orders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center text-zinc-500">
              สมาชิกท่านนี้ยังไม่มีประวัติการสั่งอาหารในระบบ
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((ord) => {
                const st = statusMap[ord.status] || {
                  label: ord.status,
                  bg: "bg-zinc-100",
                  text: "text-zinc-800",
                };
                return (
                  <div
                    key={ord.id}
                    className="overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs transition hover:border-orange-300"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-100 pb-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="font-mono text-sm font-bold text-orange-600">
                          {formatOrderNumber(ord.order_number)}
                        </span>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.bg} ${st.text}`}>
                          {st.label}
                        </span>
                        <span className="rounded-md bg-orange-100 px-2.5 py-0.5 text-xs font-bold text-orange-800">
                          โต๊ะ {ord.table_number || ord.table_id}
                        </span>
                        <span className="text-xs text-zinc-500">
                          รูปแบบ: {ord.dining_type === "takeaway" ? "สั่งกลับบ้าน" : "ทานที่ร้าน"}
                        </span>
                      </div>

                      <div className="flex items-center gap-4">
                        <span className="text-xs text-zinc-400">{formatThaiDateTime(ord.created_at)}</span>
                        <span className="font-mono text-lg font-black text-zinc-900">
                          ฿{Number(ord.total_amount).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Order items detail */}
                    <div className="mt-4">
                      <p className="text-xs font-semibold text-zinc-500">รายการอาหารในออเดอร์:</p>
                      <div className="mt-2 divide-y divide-zinc-100">
                        {ord.items?.map((item) => (
                          <div key={item.id} className="flex items-start justify-between py-2 text-sm">
                            <div>
                              <p className="font-semibold text-zinc-800">
                                {item.menu_name}{" "}
                                <span className="font-normal text-zinc-500">× {item.quantity}</span>
                              </p>
                              {item.options?.length > 0 && (
                                <p className="text-xs text-zinc-400">
                                  {item.options
                                    .map(
                                      (opt) =>
                                        `${opt.option_name}${
                                          opt.additional_price > 0 ? ` (+฿${opt.additional_price})` : ""
                                        }`
                                    )
                                    .join(", ")}
                                </p>
                              )}
                            </div>
                            <span className="font-mono font-bold text-zinc-900">
                              ฿{Number(item.subtotal).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>

                      {ord.note && (
                        <p className="mt-2 text-xs text-zinc-500">
                          <span className="font-semibold">หมายเหตุ:</span> {ord.note}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
