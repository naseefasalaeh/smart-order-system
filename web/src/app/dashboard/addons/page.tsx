import { addonCategories } from "@/lib/addon-categories";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AddonEditor from "@/components/addon-editor";
import { requireDashboardRole } from "@/lib/dashboard-auth";
import AddonControls from "@/components/addon-controls";

export default async function AddonsPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; status?: string }> }) {
  await requireDashboardRole(["admin"]);
  const filters = await searchParams;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  const [addons, ingredients, recipes] = await Promise.all([
    db.from("addons").select("id,name,category,additional_price,is_available,max_quantity,display_order").order("display_order").order("name"),
    db.from("ingredients").select("id,name,unit").order("name"),
    db.from("addon_ingredients").select("addon_id,ingredient_id,quantity_required"),
  ]);
  return <main className="min-h-screen bg-orange-50 px-5 py-10 text-zinc-900"><div className="mx-auto max-w-3xl">
    <Link href="/dashboard/menus" className="text-orange-700">← กลับหน้าเมนู</Link>
    <h1 className="mt-5 text-3xl font-bold">ตัวเลือกเสริมกลาง (Add-ons)</h1>
    <p className="mt-2 text-zinc-600">สร้างครั้งเดียวแล้วเลือกใช้ได้หลายเมนู แบ่งเป็นเนื้อสัตว์ ไข่และท็อปปิ้ง และเพิ่มปริมาณ</p>
    {addons.error || ingredients.error || recipes.error ? <p role="alert" className="mt-5 text-red-700">โหลดข้อมูลไม่สำเร็จ กรุณาตรวจว่าอัปเดตฐานข้อมูลแล้ว</p> : <>
      <details className="mt-6 rounded-2xl bg-white p-6"><summary className="cursor-pointer font-bold text-orange-700">+ เพิ่มตัวเลือกเสริม</summary><div className="mt-5"><AddonEditor ingredients={ingredients.data ?? []} /></div></details>
      <form className="my-5 flex flex-wrap gap-3"><input name="q" aria-label="ค้นหา" placeholder="ค้นหาตัวเลือก" defaultValue={filters.q} className="rounded border p-2" /><select name="category" aria-label="ประเภท" defaultValue={filters.category ?? ""}><option value="">ทุกประเภท</option>{addonCategories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select><select name="status" aria-label="สถานะ" defaultValue={filters.status ?? ""}><option value="">ทุกสถานะ</option><option value="active">เปิดขาย</option><option value="inactive">ปิดขาย</option></select><button>ค้นหา / กรอง</button></form>
      {addonCategories.filter((c) => !filters.category || c.value === filters.category).map((c) => <section key={c.value} className="mt-8"><h2 className="text-xl font-bold">{c.label}</h2>{(addons.data ?? []).filter((a) => a.category === c.value && (!filters.q || a.name.toLowerCase().includes(filters.q.toLowerCase())) && (!filters.status || a.is_available === (filters.status === "active"))).map((a) => <details key={a.id} className="mt-4 rounded-2xl bg-white p-6">
        <summary className="cursor-pointer font-semibold">{a.name} +{a.additional_price} บาท · {a.is_available ? "เปิดขาย" : "ปิดขาย"}</summary>
        <div className="mt-5"><AddonEditor addon={a} ingredients={ingredients.data ?? []} recipe={(recipes.data ?? []).filter((r) => r.addon_id === a.id)} /><AddonControls id={a.id} name={a.name} available={a.is_available} /></div>
      </details>)}</section>)}
    </>}
  </div></main>;
}
