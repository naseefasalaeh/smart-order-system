import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type CustomerMenuOption = {
  id: number;
  name: string;
  additional_price: number;
  max_quantity: number;
  max_available_quantity: number;
  is_available: boolean;
};

export type CustomerMenuOptionGroup = {
  key: string;
  id: number | null;
  name: string;
  selection_type: "single" | "multiple";
  is_required: boolean;
  min_select: number;
  max_select: number;
  max_total_quantity: number;
  options: CustomerMenuOption[];
};

export type CustomerMenu = {
  id: number;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  can_order: boolean;
  option_groups: CustomerMenuOptionGroup[];
};

export async function loadCustomerMenuCatalog(): Promise<CustomerMenu[]> {
  const db = createAdminClient();
  const [menusResult, availabilityResult] = await Promise.all([
    db
      .from("menus")
      .select("id, name, description, price, image_url, created_at")
      .eq("is_available", true)
      .order("created_at", { ascending: false }),
    db.from("menu_stock_availability").select("menu_id, can_order"),
  ]);

  if (menusResult.error) throw menusResult.error;
  if (availabilityResult.error) throw availabilityResult.error;

  const menus = menusResult.data ?? [];
  const menuIds = menus.map((menu) => Number(menu.id));

  if (menuIds.length === 0) return [];

  const [groupsResult, optionsResult] = await Promise.all([
    db
      .from("menu_option_groups")
      .select(
        "id, menu_id, name, selection_type, is_required, min_select, max_select, max_total_quantity, display_order, is_active",
      )
      .in("menu_id", menuIds)
      .order("display_order", { ascending: true })
      .order("id", { ascending: true }),
    db
      .from("menu_options")
      .select(
        "id, menu_id, group_id, name, additional_price, is_available, sort_order, max_quantity",
      )
      .in("menu_id", menuIds)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
  ]);

  if (groupsResult.error) throw groupsResult.error;
  if (optionsResult.error) throw optionsResult.error;

  const optionRows = optionsResult.data ?? [];
  const activeOptionIds = optionRows
    .filter((option) => Boolean(option.is_available))
    .map((option) => Number(option.id));
  const maxAvailableByOption = new Map<number, number>();
  const baseRecipesResult = await db
    .from("menu_ingredients")
    .select("menu_id, ingredient_id, quantity_required")
    .in("menu_id", menuIds);

  if (baseRecipesResult.error) throw baseRecipesResult.error;

  if (activeOptionIds.length > 0) {
    const recipesResult = await db
      .from("menu_option_ingredients")
      .select("menu_option_id, ingredient_id, quantity_required")
      .in("menu_option_id", activeOptionIds);

    if (recipesResult.error) throw recipesResult.error;

    const recipes = recipesResult.data ?? [];
    const ingredientIds = Array.from(
      new Set(recipes.map((recipe) => Number(recipe.ingredient_id))),
    );
    const stockByIngredient = new Map<number, number>();

    if (ingredientIds.length > 0) {
      const ingredientsResult = await db
        .from("ingredients")
        .select("id, stock_quantity")
        .in("id", ingredientIds);

      if (ingredientsResult.error) throw ingredientsResult.error;

      for (const ingredient of ingredientsResult.data ?? []) {
        stockByIngredient.set(
          Number(ingredient.id),
          Number(ingredient.stock_quantity),
        );
      }
    }

    for (const optionId of activeOptionIds) {
      const option = optionRows.find((row) => Number(row.id) === optionId);
      const maxQuantity = Number(option?.max_quantity ?? 3);
      const optionRecipes = recipes.filter(
        (recipe) => Number(recipe.menu_option_id) === optionId,
      );
      const menuId = Number(option?.menu_id);
      const availableFromStock = optionRecipes.reduce((current, recipe) => {
        const required = Number(recipe.quantity_required);
        const stock = stockByIngredient.get(Number(recipe.ingredient_id)) ?? 0;
        const baseRequired = (baseRecipesResult.data ?? [])
          .filter(
            (baseRecipe) =>
              Number(baseRecipe.menu_id) === menuId &&
              Number(baseRecipe.ingredient_id) === Number(recipe.ingredient_id),
          )
          .reduce(
            (total, baseRecipe) => total + Number(baseRecipe.quantity_required),
            0,
          );
        const possible =
          required > 0 ? Math.floor(Math.max(0, stock - baseRequired) / required) : 0;
        return Math.min(current, possible);
      }, maxQuantity);

      maxAvailableByOption.set(
        optionId,
        Math.max(0, Math.min(maxQuantity, availableFromStock)),
      );
    }
  }

  const availabilityMap = new Map(
    (availabilityResult.data ?? []).map((row) => [
      Number(row.menu_id),
      Boolean(row.can_order),
    ]),
  );

  return menus.map((menu) => {
    const menuId = Number(menu.id);
    const menuOptions = optionRows.filter(
      (option) => Number(option.menu_id) === menuId,
    );
    const groups: CustomerMenuOptionGroup[] = (groupsResult.data ?? [])
      .filter(
        (group) => Number(group.menu_id) === menuId && Boolean(group.is_active),
      )
      .map((group) => ({
        key: String(group.id),
        id: Number(group.id),
        name: String(group.name),
        selection_type:
          group.selection_type === "single" ? "single" : "multiple",
        is_required: Boolean(group.is_required),
        min_select: Number(group.min_select),
        max_select: Number(group.max_select),
        max_total_quantity: Number(group.max_total_quantity),
        options: menuOptions
          .filter((option) => Number(option.group_id) === Number(group.id))
          .map((option) => {
            const maxAvailable = maxAvailableByOption.get(Number(option.id)) ?? 0;
            return {
              id: Number(option.id),
              name: String(option.name),
              additional_price: Number(option.additional_price),
              max_quantity: Number(option.max_quantity ?? 3),
              max_available_quantity: maxAvailable,
              is_available: Boolean(option.is_available) && maxAvailable > 0,
            };
          }),
      }));
    const legacyOptions = menuOptions.filter((option) => option.group_id === null);

    if (legacyOptions.length > 0) {
      groups.push({
        key: `legacy:${menuId}`,
        id: null,
        name: "ตัวเลือกเพิ่มเติม",
        selection_type: "multiple",
        is_required: false,
        min_select: 0,
        max_select: 3,
        max_total_quantity: 3,
        options: legacyOptions.map((option) => {
          const maxAvailable = maxAvailableByOption.get(Number(option.id)) ?? 0;
          return {
            id: Number(option.id),
            name: String(option.name),
            additional_price: Number(option.additional_price),
            max_quantity: Number(option.max_quantity ?? 3),
            max_available_quantity: maxAvailable,
            is_available: Boolean(option.is_available) && maxAvailable > 0,
          };
        }),
      });
    }

    const requiredGroupsAvailable = groups.every(
      (group) =>
        !group.is_required ||
        group.options.filter((option) => option.is_available).length >=
          group.min_select,
    );

    return {
      id: menuId,
      name: String(menu.name),
      description: menu.description ? String(menu.description) : null,
      price: Number(menu.price),
      image_url: menu.image_url ? String(menu.image_url) : null,
      can_order: (availabilityMap.get(menuId) ?? false) && requiredGroupsAvailable,
      option_groups: groups,
    };
  });
}
