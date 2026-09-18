"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { ShopRole } from "@/lib/dashboard-auth";

type UserRow = {
  id: string;
  email: string | undefined;
  lastSignInAt: string | undefined;
  profile: { full_name: string; role: ShopRole; is_active: boolean } | null;
};
type ApiResult = { id?: string; email?: string; error?: string };
const roles: ShopRole[] = ["admin", "staff", "kitchen_staff"];

export default function UserManagement({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<ShopRole>("staff");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/users", { cache: "no-store" });
    if (!res.ok) throw new Error("โหลดรายชื่อผู้ใช้ไม่สำเร็จ");
    const body = await res.json() as { users: UserRow[] };
    setUsers(body.users);
  }, []);
  useEffect(() => {
    void fetch("/api/admin/users", { cache: "no-store" }).then(async (res) => {
      if (!res.ok) throw new Error("โหลดรายชื่อผู้ใช้ไม่สำเร็จ");
      const body = await res.json() as { users: UserRow[] };
      setUsers(body.users);
    }).catch((error: Error) => setMessage(error.message));
  }, []);

  async function send(method: "POST" | "PATCH" | "DELETE", payload: object): Promise<ApiResult | null> {
    if (busy) return null;
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/users", {
        method, headers: { "Content-Type": "application/json" },
        cache: "no-store", body: JSON.stringify(payload),
      });
      const result = await res.json() as ApiResult;
      if (!res.ok) throw new Error(result.error ?? "ดำเนินการไม่สำเร็จ");
      return result;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ดำเนินการไม่สำเร็จ");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    try { await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "โหลดรายชื่อผู้ใช้ไม่สำเร็จ"); }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatedCredentials(null);
    if (password !== confirmPassword) { setMessage("รหัสผ่านไม่ตรงกัน"); return; }
    const newPassword = password;
    const result = await send("POST", { email, fullName, role, password, confirmPassword });
    if (!result) return;
    setCreatedCredentials({ email: result.email ?? email, password: newPassword });
    setEmail(""); setFullName(""); setRole("staff"); setPassword(""); setConfirmPassword("");
    setMessage("สร้างผู้ใช้งานแล้ว พนักงานเข้าสู่ระบบได้ทันที");
    await refresh();
  }

  async function submit(method: "PATCH" | "DELETE", payload: object, successMessage: string) {
    const result = await send(method, payload);
    if (!result) return false;
    setMessage(successMessage);
    await refresh();
    return true;
  }

  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setMessage("คัดลอกแล้ว"); }
    catch { setMessage("คัดลอกไม่สำเร็จ กรุณาเลือกข้อความแล้วคัดลอก"); }
  }

  const activeAdminCount = users.filter(user => user.profile?.role === "admin" && user.profile.is_active).length;
  return <div className="mt-8 space-y-8">
    <form className="rounded-2xl bg-white p-6 shadow-sm" autoComplete="off" onSubmit={(event) => void create(event)}>
      <h2 className="text-xl font-semibold">เพิ่มผู้ใช้งาน</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="text-sm">Email<input className="mt-1 w-full rounded-lg border p-2" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label className="text-sm">ชื่อ<input className="mt-1 w-full rounded-lg border p-2" required maxLength={120} value={fullName} onChange={(event) => setFullName(event.target.value)} /></label>
        <label className="text-sm">Role<select className="mt-1 w-full rounded-lg border p-2" value={role} onChange={(event) => setRole(event.target.value as ShopRole)}>
          {roles.map((value) => <option key={value} value={value}>{value}</option>)}
        </select></label>
        <label className="text-sm">รหัสผ่าน<input className="mt-1 w-full rounded-lg border p-2" type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <label className="text-sm">ยืนยันรหัสผ่าน<input className="mt-1 w-full rounded-lg border p-2" type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
      </div>
      <button disabled={busy} className="mt-4 rounded-lg bg-orange-500 px-4 py-2 font-semibold text-white disabled:opacity-50">เพิ่มผู้ใช้งาน</button>
    </form>

    {createdCredentials && <section className="rounded-2xl border border-green-300 bg-green-50 p-5" aria-label="ข้อมูลเข้าสู่ระบบครั้งเดียว">
      <h2 className="font-semibold text-green-900">ข้อมูลเข้าสู่ระบบ — แสดงครั้งเดียว</h2>
      <p className="mt-1 text-sm text-green-800">คัดลอกให้พนักงานก่อนปิดกล่องนี้ เมื่อออกจากหน้านี้จะเรียกดูรหัสผ่านไม่ได้</p>
      <div className="mt-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2"><span className="font-medium">Email:</span><code className="break-all">{createdCredentials.email}</code>
          <button type="button" className="rounded-lg border bg-white px-3 py-1" onClick={() => void copy(createdCredentials.email)}>คัดลอก Email</button></div>
        <div className="flex flex-wrap items-center gap-2"><span className="font-medium">รหัสผ่าน:</span><code className="break-all">{createdCredentials.password}</code>
          <button type="button" className="rounded-lg border bg-white px-3 py-1" onClick={() => void copy(createdCredentials.password)}>คัดลอกรหัสผ่าน</button></div>
      </div>
      <button type="button" className="mt-4 rounded-lg bg-green-700 px-4 py-2 text-white" onClick={() => setCreatedCredentials(null)}>ปิดข้อมูลนี้</button>
    </section>}

    {message && <p role="status" className="rounded-lg bg-white p-3 text-sm">{message}</p>}
    <section className="space-y-3" aria-label="รายชื่อผู้ใช้งาน">
      {users.map((user) => <UserEditor key={`${user.id}:${user.profile?.full_name}:${user.profile?.role}:${user.profile?.is_active}`} user={user} busy={busy} submit={submit}
        canDelete={user.id !== currentUserId && !!user.profile &&
          !(user.profile.role === "admin" && user.profile.is_active && activeAdminCount <= 1)} />)}
    </section>
  </div>;
}

function UserEditor({ user, busy, submit, canDelete }: {
  user: UserRow; busy: boolean; canDelete: boolean;
  submit: (method: "PATCH" | "DELETE", payload: object, successMessage: string) => Promise<boolean>;
}) {
  const [fullName, setFullName] = useState(user.profile?.full_name ?? "");
  const [role, setRole] = useState<ShopRole>(user.profile?.role ?? "staff");
  const [isActive, setIsActive] = useState(user.profile?.is_active ?? false);
  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showDelete, setShowDelete] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState("");

  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submit("PATCH", { id: user.id, action: "update", fullName, role, isActive }, "บันทึกเรียบร้อย");
  }
  async function setPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmPassword) return;
    const success = await submit("PATCH", { id: user.id, action: "set_password", password: newPassword, confirmPassword }, "ตั้งรหัสผ่านใหม่แล้ว");
    if (success) { setNewPassword(""); setConfirmPassword(""); setShowPassword(false); }
  }
  async function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user.email || confirmationEmail.trim().toLowerCase() !== user.email.toLowerCase()) return;
    const success = await submit("DELETE", { id: user.id, confirmationEmail }, "ลบผู้ใช้งานแล้ว");
    if (success) { setConfirmationEmail(""); setShowDelete(false); }
  }

  return <article className="rounded-2xl bg-white p-5 shadow-sm">
    <p className="break-all font-medium text-zinc-900">{user.email ?? user.id}</p>
    <p className="mt-1 text-xs text-zinc-500">เข้าสู่ระบบล่าสุด: {user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString("th-TH") : "ยังไม่เคย"}</p>
    <form onSubmit={(event) => void update(event)}>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <label className="text-sm">ชื่อ<input className="mt-1 w-full rounded-lg border p-2" required maxLength={120} value={fullName} onChange={(event) => setFullName(event.target.value)} /></label>
        <label className="text-sm">Role<select className="mt-1 w-full rounded-lg border p-2" value={role} onChange={(event) => setRole(event.target.value as ShopRole)}>
          {roles.map((value) => <option key={value} value={value}>{value}</option>)}
        </select></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />เปิดใช้งาน</label>
      </div>
      <button disabled={busy || !user.profile} className="mt-4 rounded-lg bg-orange-500 px-4 py-2 font-semibold text-white disabled:opacity-50">บันทึก</button>
    </form>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" disabled={busy} onClick={() => { setShowPassword(!showPassword); setShowDelete(false); }}
        className="rounded-lg border px-4 py-2 disabled:opacity-50">ตั้งรหัสผ่านใหม่</button>
      <button type="button" disabled={busy || !canDelete} onClick={() => { setShowDelete(!showDelete); setShowPassword(false); }}
        className="rounded-lg border border-red-300 px-4 py-2 text-red-700 disabled:opacity-50">ลบผู้ใช้</button>
    </div>
    {!canDelete && user.profile?.role === "admin" && <p className="mt-2 text-xs text-zinc-500">ไม่สามารถลบบัญชีตัวเองหรือ Admin คนสุดท้ายได้</p>}
    {showPassword && <form className="mt-4 rounded-lg bg-zinc-50 p-4" autoComplete="off" onSubmit={(event) => void setPassword(event)}>
      <p className="font-medium">ตั้งรหัสผ่านใหม่ให้ {user.email}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">รหัสผ่านใหม่<input className="mt-1 w-full rounded-lg border p-2" type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
        <label className="text-sm">ยืนยันรหัสผ่านใหม่<input className="mt-1 w-full rounded-lg border p-2" type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
      </div>
      <button disabled={busy || newPassword !== confirmPassword} className="mt-3 rounded-lg bg-orange-500 px-4 py-2 font-semibold text-white disabled:opacity-50">บันทึกรหัสผ่านใหม่</button>
    </form>}
    {showDelete && <form className="mt-4 rounded-lg bg-red-50 p-4" onSubmit={(event) => void remove(event)}>
      <p className="font-medium text-red-800">พิมพ์ Email ของผู้ใช้เพื่อยืนยันการลบ</p>
      <label className="mt-3 block text-sm">Email ยืนยัน<input className="mt-1 w-full rounded-lg border p-2" type="email" autoComplete="off" required value={confirmationEmail} onChange={(event) => setConfirmationEmail(event.target.value)} /></label>
      <button disabled={busy || !user.email || confirmationEmail.trim().toLowerCase() !== user.email.toLowerCase()}
        className="mt-3 rounded-lg bg-red-700 px-4 py-2 font-semibold text-white disabled:opacity-50">ยืนยันลบผู้ใช้</button>
    </form>}
  </article>;
}
