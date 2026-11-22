import DashboardSidebar from "@/components/dashboard-sidebar";
import IngredientsClient from "./IngredientsClient";
import OrderRealtimeRefresh from "@/components/order-realtime-refresh";
import { requireDashboardContext } from "@/lib/dashboard-auth";

export default async function IngredientsPage({ searchParams }: {
  searchParams: Promise<{ success?: string }>;
}) {
  const { db: supabase, role, fullName } = await requireDashboardContext(["admin"]);
  const { success } = await searchParams;

  const [ingredientsResult, categoriesResult] = await Promise.all([
    supabase
      .from("ingredients")
      .select(`
        id,
        name,
        unit,
        stock_quantity,
        minimum_stock,
        updated_at,
        reset_every_days,
        reset_time,
        reset_next_at,
        ingredient_categories (
          id,
          name,
          is_active
        )
      `)
      .order("name", { ascending: true }),
    supabase
      .from("ingredient_categories")
      .select("id, name, is_active")
      .order("display_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  const error = ingredientsResult.error ?? categoriesResult.error;
  const normalizedIngredients = (ingredientsResult.data ?? []).map(
    (ingredient) => ({
      ...ingredient,
      ingredient_categories: Array.isArray(ingredient.ingredient_categories)
        ? (ingredient.ingredient_categories[0] ?? null)
        : ingredient.ingredient_categories,
    }),
  );

  return (
    <main className="min-h-screen bg-orange-50 lg:flex">
      <OrderRealtimeRefresh channelName="ingredients-order-stock" fallbackIntervalMs={5_000} pollWhenSubscribed />
      <DashboardSidebar role={role} fullName={fullName} activePath="/dashboard/ingredients" />

      <section className="flex-1 p-6 sm:p-8">
        <div className="mx-auto max-w-7xl">
          {error ? (
            <div className="mt-8 rounded-2xl bg-red-50 p-6 text-red-700">
              ไม่สามารถโหลดข้อมูลวัตถุดิบได้ กรุณาลองใหม่
            </div>
          ) : (
            <IngredientsClient
              canDelete
              ingredients={normalizedIngredients}
              activeCategories={categoriesResult.data ?? []}
              initialSuccess={success}
            />
          )}
        </div>
      </section>
    </main>
  );
}
