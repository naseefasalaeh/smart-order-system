import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  type MenuOptionGroupRule,
  type MenuOptionRule,
  validateMenuOptionSelections,
} from "@/lib/menu-option-groups";

type OrderItemInput = {
  menuId: number;
  quantity: number;
  note?: string | null;
  optionSelections?: Array<{
    optionId: number;
    quantity: number;
  }>;
};

type EditOrderBody = {
  tableId: number;
  sessionToken: string;
  items: OrderItemInput[];
  note?: string | null;
};

type RouteContext = {
  params: Promise<{ orderId: string }>;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request, context: RouteContext) {
  try {
    const { orderId } = await context.params;

    if (!uuidPattern.test(orderId)) {
      return NextResponse.json({ error: "ไม่พบรหัสออเดอร์" }, { status: 400 });
    }

    let body: EditOrderBody;
    try {
      body = (await request.json()) as EditOrderBody;
    } catch {
      return NextResponse.json(
        { error: "ข้อมูลการแก้ไขออเดอร์ไม่ถูกต้อง" },
        { status: 400 },
      );
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "ข้อมูลการแก้ไขออเดอร์ไม่ถูกต้อง" },
        { status: 400 },
      );
    }

    const { tableId, sessionToken, items, note } = body;
    const numericTableId = Number(tableId);

    if (!Number.isSafeInteger(numericTableId) || numericTableId <= 0) {
      return NextResponse.json({ error: "ข้อมูลโต๊ะไม่ถูกต้อง" }, { status: 400 });
    }

    if (typeof sessionToken !== "string" || !uuidPattern.test(sessionToken)) {
      return NextResponse.json(
        { error: "ข้อมูลรอบโต๊ะไม่ถูกต้อง กรุณาสแกน QR ใหม่" },
        { status: 400 },
      );
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        {
          error:
            "กรุณาเลือกอาหารอย่างน้อย 1 รายการ หากต้องการยกเลิกทั้งออเดอร์ กรุณาใช้ปุ่มยกเลิกออเดอร์",
        },
        { status: 400 },
      );
    }

    // Validate incoming items format
    const validatedItems: Array<{
      menuId: number;
      quantity: number;
      note: string | null;
      optionSelections: Array<{ optionId: number; quantity: number }>;
    }> = [];

    for (const item of items) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return NextResponse.json(
          { error: "ข้อมูลรายการอาหารไม่ถูกต้อง" },
          { status: 400 },
        );
      }

      const menuId = Number(item.menuId);
      const quantity = Number(item.quantity);

      if (
        !Number.isInteger(menuId) ||
        menuId <= 0 ||
        !Number.isInteger(quantity) ||
        quantity <= 0
      ) {
        return NextResponse.json(
          { error: "ข้อมูลรายการอาหารไม่ถูกต้อง" },
          { status: 400 },
        );
      }

      const rawOptionSelections = Array.isArray(item.optionSelections)
        ? item.optionSelections
        : [];

      const optionSelections = rawOptionSelections.map((selection) => ({
        optionId: Number(selection.optionId),
        quantity: Number(selection.quantity),
      }));

      const hasInvalidOption = optionSelections.some(
        (selection) =>
          !Number.isInteger(selection.optionId) ||
          selection.optionId <= 0 ||
          !Number.isInteger(selection.quantity) ||
          selection.quantity <= 0 ||
          selection.quantity > 3,
      );

      if (hasInvalidOption) {
        return NextResponse.json(
          { error: "ข้อมูลตัวเลือกเสริมไม่ถูกต้อง" },
          { status: 400 },
        );
      }

      const hasDuplicateOption =
        new Set(optionSelections.map((selection) => selection.optionId)).size !==
        optionSelections.length;

      if (hasDuplicateOption) {
        return NextResponse.json(
          { error: "ไม่สามารถส่งตัวเลือกเดิมซ้ำกันได้" },
          { status: 400 },
        );
      }

      const itemNote =
        typeof item.note === "string" ? item.note.trim().slice(0, 500) : "";

      validatedItems.push({
        menuId,
        quantity,
        note: itemNote || null,
        optionSelections,
      });
    }

    const supabase = createAdminClient();

    // 1. Check active dining session for this table
    const { data: session, error: sessionError } = await supabase
      .from("dining_sessions")
      .select("id, table_id, status")
      .eq("access_token", sessionToken)
      .eq("table_id", numericTableId)
      .eq("status", "active")
      .maybeSingle();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: "รอบโต๊ะนี้หมดอายุแล้วหรือข้อมูลไม่ถูกต้อง" },
        { status: 403 },
      );
    }

    // 2. Fetch existing order and check status
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(`
        id,
        order_number,
        table_id,
        session_id,
        status,
        total_amount,
        stock_deducted,
        order_items (
          id,
          quantity,
          completed_plates,
          served_plates
        )
      `)
      .eq("id", orderId)
      .eq("session_id", session.id)
      .eq("table_id", numericTableId)
      .maybeSingle();

    if (orderError) {
      console.error("ตรวจสอบข้อมูลออเดอร์ไม่สำเร็จ", orderError);
      return NextResponse.json(
        { error: "ตรวจสอบข้อมูลออเดอร์ไม่สำเร็จ กรุณาลองใหม่" },
        { status: 500 },
      );
    }

    if (!order) {
      return NextResponse.json(
        { error: "ไม่พบออเดอร์นี้ในรอบโต๊ะปัจจุบัน" },
        { status: 404 },
      );
    }

    // Business check: Only allow editing if status is 'confirmed'
    if (order.status !== "confirmed") {
      return NextResponse.json(
        { error: "ร้านเริ่มทำอาหารแล้ว ไม่สามารถแก้ไขออเดอร์ได้" },
        { status: 409 },
      );
    }

    // Business check: Ensure kitchen has not started cooking ANY plate
    const existingOrderItems = order.order_items ?? [];
    const hasStartedCooking = existingOrderItems.some((item) => {
      const completed = Array.isArray(item.completed_plates)
        ? item.completed_plates
        : [];
      const served = Array.isArray(item.served_plates) ? item.served_plates : [];
      return completed.length > 0 || served.length > 0;
    });

    if (hasStartedCooking) {
      return NextResponse.json(
        { error: "ร้านเริ่มทำอาหารแล้ว ไม่สามารถแก้ไขออเดอร์ได้" },
        { status: 409 },
      );
    }

    // 3. Load menu data and check availability
    const menuIds = Array.from(new Set(validatedItems.map((item) => item.menuId)));
    const { data: menus, error: menusError } = await supabase
      .from("menus")
      .select("id, name, price, is_available")
      .in("id", menuIds);

    if (menusError || !menus || menus.length !== menuIds.length) {
      return NextResponse.json(
        { error: "มีบางเมนูที่ไม่มีอยู่ในระบบ" },
        { status: 400 },
      );
    }

    const unavailableMenus = menus.filter((menu) => !menu.is_available);
    if (unavailableMenus.length > 0) {
      return NextResponse.json(
        {
          error: "มีเมนูที่ปิดขายแล้ว",
          details: unavailableMenus.map((m) => m.name).join(", "),
        },
        { status: 409 },
      );
    }

    // 4. Validate option groups & options from database
    const allOptionIds = Array.from(
      new Set(
        validatedItems.flatMap((item) =>
          item.optionSelections.map((sel) => sel.optionId),
        ),
      ),
    );

    const [groupsResult, optionsResult] = await Promise.all([
      supabase
        .from("menu_option_groups")
        .select(
          "id, menu_id, name, selection_type, is_required, min_select, max_select, max_total_quantity, is_active",
        )
        .in("menu_id", menuIds),
      supabase
        .from("effective_menu_options")
        .select(
          "id, menu_id, group_id, name, additional_price, is_available, max_quantity",
        )
        .in("menu_id", menuIds),
    ]);

    if (groupsResult.error || optionsResult.error) {
      console.error("ตรวจสอบตัวเลือกเมนูไม่สำเร็จ", {
        groupsError: groupsResult.error,
        optionsError: optionsResult.error,
      });
      return NextResponse.json(
        { error: "ตรวจสอบตัวเลือกของเมนูไม่สำเร็จ กรุณาลองใหม่" },
        { status: 500 },
      );
    }

    const menuOptionGroups: MenuOptionGroupRule[] = (groupsResult.data ?? []).map(
      (group) => ({
        id: Number(group.id),
        menuId: Number(group.menu_id),
        name: String(group.name),
        selectionType: group.selection_type === "single" ? "single" : "multiple",
        isRequired: Boolean(group.is_required),
        minSelect: Number(group.min_select),
        maxSelect: Number(group.max_select),
        maxTotalQuantity: Number(group.max_total_quantity),
        isActive: Boolean(group.is_active),
      }),
    );

    const menuOptions: MenuOptionRule[] = (optionsResult.data ?? []).map(
      (option) => ({
        id: Number(option.id),
        menuId: Number(option.menu_id),
        groupId: option.group_id === null ? null : Number(option.group_id),
        name: String(option.name),
        additionalPrice: Number(option.additional_price),
        isAvailable: Boolean(option.is_available),
        maxQuantity: Number(option.max_quantity ?? 3),
      }),
    );

    for (const item of validatedItems) {
      const validation = validateMenuOptionSelections({
        menuId: item.menuId,
        selections: item.optionSelections,
        groups: menuOptionGroups,
        options: menuOptions,
      });

      if (!validation.ok) {
        return NextResponse.json({ error: validation.message }, { status: 400 });
      }
    }

    // 5. Calculate required ingredients and verify stock availability
    const menuQuantityMap = new Map<number, number>();
    for (const item of validatedItems) {
      menuQuantityMap.set(
        item.menuId,
        (menuQuantityMap.get(item.menuId) ?? 0) + item.quantity,
      );
    }

    const { data: menuIngredients, error: recipeError } = await supabase
      .from("menu_ingredients")
      .select("menu_id, ingredient_id, quantity_required")
      .in("menu_id", menuIds);

    if (recipeError) {
      console.error("ตรวจสอบสูตรวัตถุดิบไม่สำเร็จ", recipeError);
      return NextResponse.json(
        { error: "ตรวจสอบสูตรวัตถุดิบไม่สำเร็จ กรุณาลองใหม่" },
        { status: 500 },
      );
    }

    if (
      menuIds.some(
        (id) => !(menuIngredients ?? []).some((r) => Number(r.menu_id) === id),
      )
    ) {
      return NextResponse.json(
        { error: "สูตรพื้นฐานไม่ครบ กรุณาแจ้งพนักงาน" },
        { status: 409 },
      );
    }

    const requiredIngredientMap = new Map<number, number>();
    for (const recipe of menuIngredients ?? []) {
      const menuId = Number(recipe.menu_id);
      const orderedQuantity = menuQuantityMap.get(menuId) ?? 0;
      if (orderedQuantity <= 0) continue;

      const ingredientId = Number(recipe.ingredient_id);
      const requiredAmount = Number(recipe.quantity_required) * orderedQuantity;
      requiredIngredientMap.set(
        ingredientId,
        (requiredIngredientMap.get(ingredientId) ?? 0) + requiredAmount,
      );
    }

    if (allOptionIds.length > 0) {
      const { data: optionIngredients, error: optionIngredientsError } =
        await supabase
          .from("effective_menu_option_ingredients")
          .select("menu_option_id, ingredient_id, quantity_required")
          .in("menu_option_id", allOptionIds);

      if (optionIngredientsError) {
        console.error(
          "ตรวจสอบสูตรวัตถุดิบของตัวเลือกไม่สำเร็จ",
          optionIngredientsError,
        );
        return NextResponse.json(
          { error: "ตรวจสอบสูตรวัตถุดิบของตัวเลือกไม่สำเร็จ กรุณาลองใหม่" },
          { status: 500 },
        );
      }

      const optionIngredientRows = optionIngredients ?? [];
      if (
        allOptionIds.some(
          (id) => !optionIngredientRows.some((r) => Number(r.menu_option_id) === id),
        )
      ) {
        return NextResponse.json(
          { error: "สูตรตัวเลือกไม่ครบ กรุณาแจ้งพนักงาน" },
          { status: 409 },
        );
      }

      for (const item of validatedItems) {
        for (const selection of item.optionSelections) {
          const recipesForOption = optionIngredientRows.filter(
            (recipe) => Number(recipe.menu_option_id) === selection.optionId,
          );

          for (const recipe of recipesForOption) {
            const ingredientId = Number(recipe.ingredient_id);
            const requiredAmount =
              Number(recipe.quantity_required) *
              item.quantity *
              selection.quantity;
            requiredIngredientMap.set(
              ingredientId,
              (requiredIngredientMap.get(ingredientId) ?? 0) + requiredAmount,
            );
          }
        }
      }
    }

    // Load existing ingredient usages for this order to credit them back
    const { data: existingUsages, error: existingUsagesError } = await supabase
      .from("order_ingredient_usages")
      .select("ingredient_id, quantity_used")
      .eq("order_id", orderId);

    if (existingUsagesError) {
      console.error("โหลดรายการใช้วัตถุดิบเดิมไม่สำเร็จ", existingUsagesError);
      return NextResponse.json(
        { error: "ตรวจสอบข้อมูลวัตถุดิบไม่สำเร็จ กรุณาลองใหม่" },
        { status: 500 },
      );
    }

    const previousUsageMap = new Map<number, number>();
    for (const usage of existingUsages ?? []) {
      const id = Number(usage.ingredient_id);
      previousUsageMap.set(
        id,
        (previousUsageMap.get(id) ?? 0) + Number(usage.quantity_used),
      );
    }

    // Check all touched ingredients
    const allTouchedIngredientIds = Array.from(
      new Set([
        ...requiredIngredientMap.keys(),
        ...previousUsageMap.keys(),
      ]),
    );

    if (allTouchedIngredientIds.length > 0) {
      const { data: ingredients, error: ingredientsError } = await supabase
        .from("ingredients")
        .select("id, name, stock_quantity")
        .in("id", allTouchedIngredientIds);

      if (ingredientsError || !ingredients) {
        return NextResponse.json(
          { error: "ตรวจสอบสต็อกวัตถุดิบไม่สำเร็จ กรุณาลองใหม่" },
          { status: 500 },
        );
      }

      const insufficientIngredients: Array<{ name: string; required: number; available: number }> = [];

      for (const [ingredientId, requiredQty] of requiredIngredientMap.entries()) {
        const ingredient = ingredients.find((i) => Number(i.id) === ingredientId);
        if (!ingredient) {
          return NextResponse.json(
            { error: "ไม่พบข้อมูลวัตถุดิบบางรายการ กรุณาแจ้งพนักงาน" },
            { status: 409 },
          );
        }

        const currentlyAvailable = Number(ingredient.stock_quantity);
        const previouslyDeducted = previousUsageMap.get(ingredientId) ?? 0;
        const totalAvailableForOrder = currentlyAvailable + previouslyDeducted;

        if (totalAvailableForOrder < requiredQty) {
          insufficientIngredients.push({
            name: ingredient.name,
            required: requiredQty,
            available: totalAvailableForOrder,
          });
        }
      }

      if (insufficientIngredients.length > 0) {
        const affectedNames = insufficientIngredients.map((i) => i.name).join(", ");
        return NextResponse.json(
          {
            error: "วัตถุดิบไม่เพียงพอ",
            details: `วัตถุดิบไม่เพียงพอ: ${affectedNames}`,
          },
          { status: 409 },
        );
      }

      // Update ingredient stocks: stock_quantity += previouslyDeducted - requiredQty
      for (const ingredient of ingredients) {
        const ingId = Number(ingredient.id);
        const prevUsed = previousUsageMap.get(ingId) ?? 0;
        const newRequired = requiredIngredientMap.get(ingId) ?? 0;
        const delta = prevUsed - newRequired; // if positive, we return stock; if negative, we deduct

        if (delta !== 0) {
          const newStock = Number(ingredient.stock_quantity) + delta;
          const { error: stockUpdateError } = await supabase
            .from("ingredients")
            .update({
              stock_quantity: newStock,
              updated_at: new Date().toISOString(),
            })
            .eq("id", ingId);

          if (stockUpdateError) {
            console.error("อัปเดตสต็อกวัตถุดิบไม่สำเร็จ", stockUpdateError);
            return NextResponse.json(
              { error: "ปรับปรุงสต็อกไม่สำเร็จ กรุณาลองใหม่" },
              { status: 500 },
            );
          }
        }
      }
    }

    // 6. Calculate real prices from database snapshots
    const calculatedItems = validatedItems.map((item) => {
      const menu = menus.find((m) => Number(m.id) === item.menuId)!;
      const selectedOptions = item.optionSelections.map((selection) => {
        const option = menuOptions.find(
          (opt) => opt.id === selection.optionId && opt.menuId === item.menuId,
        )!;
        return {
          ...option,
          quantity: selection.quantity,
        };
      });

      const basePrice = Number(menu.price);
      const additionalPrice = selectedOptions.reduce(
        (total, opt) =>
          total + Math.round(opt.additionalPrice * 100) * opt.quantity,
        0,
      );

      const unitCents = Math.round(basePrice * 100) + additionalPrice;
      const unitPrice = unitCents / 100;
      const subtotal = (unitCents * item.quantity) / 100;

      return {
        menu_id: Number(menu.id),
        quantity: item.quantity,
        unit_price: unitPrice,
        subtotal,
        note: item.note,
        selectedOptions,
      };
    });

    const newTotalAmount =
      calculatedItems.reduce(
        (total, item) => total + Math.round(item.subtotal * 100),
        0,
      ) / 100;

    const orderNote = typeof note === "string" ? note.trim().slice(0, 500) : "";

    // 7. Verify atomic condition again: Order must still be confirmed
    const { data: currentLock, error: lockError } = await supabase
      .from("orders")
      .select("id, status")
      .eq("id", orderId)
      .eq("status", "confirmed")
      .maybeSingle();

    if (lockError || !currentLock) {
      return NextResponse.json(
        { error: "ร้านเริ่มทำอาหารแล้ว ไม่สามารถแก้ไขออเดอร์ได้" },
        { status: 409 },
      );
    }

    // 8. Delete old order item options and order items
    const oldItemIds = existingOrderItems.map((item) => item.id);
    if (oldItemIds.length > 0) {
      await supabase
        .from("order_item_options")
        .delete()
        .in("order_item_id", oldItemIds);

      await supabase.from("order_items").delete().in("id", oldItemIds);
    }

    // 9. Insert new order items and options
    for (const item of calculatedItems) {
      const { data: insertedItem, error: insertItemError } = await supabase
        .from("order_items")
        .insert({
          order_id: orderId,
          menu_id: item.menu_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          subtotal: item.subtotal,
          note: item.note,
          completed_plates: [],
          served_plates: [],
        })
        .select("id")
        .single();

      if (insertItemError || !insertedItem) {
        console.error("บันทึก order_item ใหม่ไม่สำเร็จ", insertItemError);
        return NextResponse.json(
          { error: "บันทึกรายการอาหารไม่สำเร็จ กรุณาลองใหม่" },
          { status: 500 },
        );
      }

      if (item.selectedOptions.length > 0) {
        const optionRows = item.selectedOptions.map((opt) => ({
          order_item_id: insertedItem.id,
          menu_option_id: opt.id,
          option_name: opt.name,
          additional_price: opt.additionalPrice,
          quantity: opt.quantity,
        }));

        const { error: insertOptionsError } = await supabase
          .from("order_item_options")
          .insert(optionRows);

        if (insertOptionsError) {
          console.error("บันทึก option ใหม่ไม่สำเร็จ", insertOptionsError);
          return NextResponse.json(
            { error: "บันทึกตัวเลือกอาหารไม่สำเร็จ กรุณาลองใหม่" },
            { status: 500 },
          );
        }
      }
    }

    // 10. Update order_ingredient_usages
    await supabase
      .from("order_ingredient_usages")
      .delete()
      .eq("order_id", orderId);

    if (requiredIngredientMap.size > 0) {
      const usageRows = Array.from(requiredIngredientMap.entries()).map(
        ([ingredientId, quantity]) => ({
          order_id: orderId,
          ingredient_id: ingredientId,
          quantity_used: quantity,
        }),
      );

      const { error: usageInsertError } = await supabase
        .from("order_ingredient_usages")
        .insert(usageRows);

      if (usageInsertError) {
        console.error("บันทึกการใช้วัตถุดิบไม่สำเร็จ", usageInsertError);
      }
    }

    // 11. Update orders table (total_amount, note, updated_at)
    // Note: status check ensures atomic protection against race conditions
    const { data: updatedOrder, error: updateOrderError } = await supabase
      .from("orders")
      .update({
        total_amount: newTotalAmount,
        note: orderNote || null,
        stock_deducted: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .eq("status", "confirmed")
      .select(`
        id,
        order_number,
        dining_type,
        status,
        total_amount,
        note,
        created_at
      `)
      .maybeSingle();

    if (updateOrderError || !updatedOrder) {
      return NextResponse.json(
        { error: "ร้านเริ่มทำอาหารแล้ว ไม่สามารถแก้ไขออเดอร์ได้" },
        { status: 409 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "แก้ไขออเดอร์สำเร็จ",
      order: updatedOrder,
    });
  } catch (error) {
    console.error("Edit order API unexpected error", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่" },
      { status: 500 },
    );
  }
}
