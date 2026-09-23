import { createAdminClient } from "@/lib/supabase/admin";

// Call only after the request's live Admin authorization check.
export async function listAdminUsers() {
  const admin = createAdminClient();
  const usersRequest = async () => {
    const users = [];
    for (let page = 1; page <= 100; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
      if (error) throw new Error("โหลดรายชื่อผู้ใช้ไม่สำเร็จชั่วคราว");
      users.push(...data.users.map(({ id, email, last_sign_in_at }) => ({ id, email, lastSignInAt: last_sign_in_at })));
      if (data.users.length < 100) break;
    }
    return users;
  };
  const [users, { data: profiles, error }] = await Promise.all([
    usersRequest(), admin.from("profiles").select("id,full_name,role,is_active"),
  ]);
  if (error) throw new Error("โหลดสิทธิ์ผู้ใช้ไม่สำเร็จชั่วคราว");
  const byId = new Map(profiles?.map(profile => [profile.id, profile]));
  return users.map(user => ({ ...user, profile: byId.get(user.id) ?? null }));
}
