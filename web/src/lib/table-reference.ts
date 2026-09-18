import { createClient } from "@/lib/supabase/server";

export async function resolveTableReference(reference: string) {
  const db = await createClient();
  let tableId: number | null = null;
  if (/^id-[1-9]\d*$/.test(reference)) tableId = Number(reference.slice(3));
  else if (/^[1-9]\d*$/.test(reference)) {
    const { data, error } = await db.from("restaurant_table_aliases")
      .select("table_id").eq("table_number", reference).maybeSingle();
    if (error) throw error;
    tableId = data?.table_id ?? null;
  }
  if (!Number.isSafeInteger(tableId) || !tableId) return null;
  const { data, error } = await db.from("restaurant_tables")
    .select("id,table_number,status").eq("id", tableId).maybeSingle();
  if (error) throw error;
  return data;
}
