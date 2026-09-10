import { NextResponse } from "next/server";
import {
  type MenuOptionGroupRule,
  type MenuOptionRule,
  validateMenuOptionSelections,
} from "@/lib/menu-option-groups";
import { createAdminClient } from "@/lib/supabase/admin";

type OrderItemInput = {
  menuId: number;
  quantity: number;
  note?: string;
  optionSelections?: Array<{
    optionId: number;
    quantity: number;
  }>;
};

type CreateOrderBody = {
  tableId: string;
  sessionToken: string;
  items: OrderItemInput[];
  note?: string;
};

type ValidatedOrderItem = {
  menuId: number;
  quantity: number;
  note: string | null;
  optionSelections: Array<{
    optionId: number;
    quantity: number;
  }>;
};

export async function POST(request: Request) {
  try {
    let body: CreateOrderBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "ข้อมูลคำสั่งซื้อไม่ถูกต้อง" },
        { status: 400 },
      );
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "ข้อมูลคำสั่งซื้อไม่ถูกต้อง" },
        { status: 400 },
      );
    }
    const { tableId, sessionToken, items, note } = body;

    const numericTableId = Number(tableId);

    if (!Number.isInteger(numericTableId) || numericTableId <= 0) {
      return NextResponse.json(
        { error: "ข้อมูลโต๊ะไม่ถูกต้อง" },
        { status: 400 },
      );
    }

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (typeof sessionToken !== "string" || !uuidPattern.test(sessionToken)) {
      return NextResponse.json(
        { error: "ข้อมูลรอบโต๊ะไม่ถูกต้อง กรุณาสแกน QR ใหม่" },
        { status: 400 },
      );
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "กรุณาเลือกอาหารอย่างน้อย 1 รายการ" },
        { status: 400 },
      );
    }

    /*
     * ตรวจสอบและจัดรูปแบบข้อมูลรายการอาหาร
     * ไม่รวมเมนู ID เดียวกัน เพราะตัวเลือกและหมายเหตุอาจต่างกัน
     */
    const validatedItems: ValidatedOrderItem[] = [];

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

      if (item.optionSelections !== undefined && !Array.isArray(item.optionSelections)) {
        return NextResponse.json(
          { error: "ข้อมูลตัวเลือกเสริมไม่ถูกต้อง" },
          { status: 400 },
        );
      }
      const rawOptionSelections = Array.isArray(item.optionSelections)
        ? item.optionSelections
        : [];

      if (rawOptionSelections.some((selection) =>
        !selection || typeof selection !== "object" || Array.isArray(selection)
      )) {
        return NextResponse.json(
          { error: "ข้อมูลตัวเลือกเสริมไม่ถูกต้อง" },
          { status: 400 },
        );
      }

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

    /*
     * Route นี้ทำงานเฉพาะฝั่งเซิร์ฟเวอร์ จึงใช้ Admin Client
     * เพื่อเรียก RPC หักสต็อกที่อนุญาตเฉพาะ service_role
     */
    const supabase = createAdminClient();

    /*
     * ตรวจสอบโต๊ะ
     */
    const { data: table, error: tableError } = await supabase
      .from("restaurant_tables")
      .select("id, table_number, status")
      .eq("id", numericTableId)
      .maybeSingle();

    if (tableError) {
      console.error("ตรวจสอบข้อมูลโต๊ะไม่สำเร็จ", tableError);
      return NextResponse.json(
        { error: "ตรวจสอบข้อมูลโต๊ะไม่สำเร็จ กรุณาลองใหม่" },
        { status: 500 },
      );
    }

    if (!table) {
      return NextResponse.json(
        { error: "ไม่พบข้อมูลโต๊ะนี้" },
        { status: 404 },
      );
    }

    const { data: existingSession, error: sessionReadError } = await supabase
      .from("dining_sessions")
      .select("id, table_id, status")
      .eq("access_token", sessionToken)
      .maybeSingle();

    if (sessionReadError) {
      console.error("ตรวจสอบรอบโต๊ะไม่สำเร็จ", sessionReadError);
      return NextResponse.json(
        { error: "ตรวจสอบรอบโต๊ะไม่สำเร็จ กรุณาลองใหม่" },
        { status: 500 },
      );
    }

    if (
      existingSession &&
      (Number(existingSession.table_id) !== numericTableId ||
        existingSession.status !== "active")
    ) {
      return NextResponse.json(
        { error: "รอบโต๊ะนี้หมดอายุแล้ว กรุณาเริ่มรอบใหม่" },
        { status: 409 },
      );
    }

    /*
     * รวมเฉพาะ Menu ID สำหรับใช้ตรวจฐานข้อมูลและสต็อก
     */
    const menuIds = Array.from(
      new Set(validatedItems.map((item) => item.menuId)),
    );

    /*
     * ตรวจสอบเมนูและโหลดราคาจริงจากฐานข้อมูล
     */
    const { data: menus, error: menusError } = await supabase
      .from("menus")
      .select("id, name, price, is_available")
      .in("id", menuIds);

    if (menusError) {
      console.error("ตรวจสอบข้อมูลเมนูไม่สำเร็จ", menusError);
      return NextResponse.json(
        { error: "ตรวจสอบข้อมูลเมนูไม่สำเร็จ กรุณาลองใหม่" },
        { status: 500 },
      );
    }

    if (!menus || menus.length !== menuIds.length) {
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
          details: unavailableMenus.map((menu) => menu.name).join(", "),
        },
        { status: 409 },
      );
    }

    /* โหลดกฎและตัวเลือกทั้งหมดของเมนูจากฐานข้อมูล ไม่เชื่อ ownership จาก client */
    const allOptionIds = Array.from(
      new Set(
        validatedItems.flatMap((item) =>
          item.optionSelections.map((selection) => selection.optionId),
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
        .from("menu_options")
        .select(
          "id, menu_id, group_id, name, additional_price, is_available, max_quantity",
        )
        .in("menu_id", menuIds),
    ]);

    if (groupsResult.error || optionsResult.error) {
      console.error("ตรวจสอบ menu option groups ไม่สำเร็จ", {
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
        selectionType:
          group.selection_type === "single" ? "single" : "multiple",
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

    /*
     * รวมจำนวนเมนูเพื่อใช้คำนวณวัตถุดิบ
     */
    const menuQuantityMap = new Map<number, number>();

    for (const item of validatedItems) {
      menuQuantityMap.set(
        item.menuId,
        (menuQuantityMap.get(item.menuId) ?? 0) + item.quantity,
      );
    }

    /*
     * โหลดสูตรวัตถุดิบของทุกเมนู
     */
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

    /*
     * คำนวณวัตถุดิบรวมตามจำนวนที่สั่ง
     */
    const requiredIngredientMap = new Map<number, number>();

    for (const recipe of menuIngredients ?? []) {
      const menuId = Number(recipe.menu_id);
      const orderedQuantity = menuQuantityMap.get(menuId) ?? 0;

      if (orderedQuantity <= 0) {
        continue;
      }

      const ingredientId = Number(recipe.ingredient_id);
      const requiredAmount = Number(recipe.quantity_required) * orderedQuantity;

      requiredIngredientMap.set(
        ingredientId,
        (requiredIngredientMap.get(ingredientId) ?? 0) + requiredAmount,
      );
    }

    /*
     * โหลดสูตรวัตถุดิบของตัวเลือกเสริม เช่น ไข่ดาว/ไข่เจียว
     */
    if (allOptionIds.length > 0) {
      const { data: optionIngredients, error: optionIngredientsError } =
        await supabase
          .from("menu_option_ingredients")
          .select("menu_option_id, ingredient_id, quantity_required")
          .in("menu_option_id", allOptionIds);

      if (optionIngredientsError) {
        console.error("ตรวจสอบสูตรวัตถุดิบของตัวเลือกไม่สำเร็จ", optionIngredientsError);
        return NextResponse.json(
          { error: "ตรวจสอบสูตรวัตถุดิบของตัวเลือกไม่สำเร็จ กรุณาลองใหม่" },
          { status: 500 },
        );
      }

      const optionIngredientRows = optionIngredients ?? [];

      /*
       * คิดตามจำนวนจานของแต่ละรายการ
       * เช่น 2 จาน + ไข่ดาว จะใช้ไข่ 2 ฟอง
       */
      for (const item of validatedItems) {
        for (const selection of item.optionSelections) {
          const recipesForOption = optionIngredientRows.filter(
            (recipe) =>
              Number(recipe.menu_option_id) === selection.optionId,
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

    const ingredientIds = Array.from(requiredIngredientMap.keys());

    /*
     * ตรวจสอบสต็อกวัตถุดิบ
     */
    if (ingredientIds.length > 0) {
      const { data: ingredients, error: ingredientsError } = await supabase
        .from("ingredients")
        .select("id, name, stock_quantity")
        .in("id", ingredientIds);

      if (ingredientsError) {
        console.error("ตรวจสอบสต็อกวัตถุดิบไม่สำเร็จ", ingredientsError);
        return NextResponse.json(
          { error: "ตรวจสอบสต็อกวัตถุดิบไม่สำเร็จ กรุณาลองใหม่" },
          { status: 500 },
        );
      }

      if (!ingredients || ingredients.length !== ingredientIds.length) {
        return NextResponse.json(
          {
            error: "ไม่พบข้อมูลวัตถุดิบบางรายการ กรุณาแจ้งพนักงาน",
          },
          { status: 409 },
        );
      }

      const insufficientIngredients = ingredients
        .map((ingredient) => {
          const ingredientId = Number(ingredient.id);
          const required = requiredIngredientMap.get(ingredientId) ?? 0;
          const available = Number(ingredient.stock_quantity);

          return {
            id: ingredientId,
            name: ingredient.name,
            required,
            available,
            insufficient: available < required,
          };
        })
        .filter((ingredient) => ingredient.insufficient);

      if (insufficientIngredients.length > 0) {
        const insufficientIngredientIds = new Set(
          insufficientIngredients.map((ingredient) => ingredient.id),
        );

        const affectedMenuNames = menus
          .filter((menu) =>
            (menuIngredients ?? []).some(
              (recipe) =>
                Number(recipe.menu_id) === Number(menu.id) &&
                insufficientIngredientIds.has(Number(recipe.ingredient_id)),
            ),
          )
          .map((menu) => menu.name);

        const affectedIngredientNames = insufficientIngredients
          .map((ingredient) => ingredient.name)
          .join(", ");

        return NextResponse.json(
          {
            error: "วัตถุดิบไม่เพียงพอ",
            details:
              affectedMenuNames.length > 0
                ? `เมนูที่สั่งไม่ได้: ${affectedMenuNames.join(
                    ", ",
                  )} เนื่องจาก ${affectedIngredientNames} ไม่เพียงพอ`
                : `วัตถุดิบไม่เพียงพอ: ${affectedIngredientNames}`,
          },
          { status: 409 },
        );
      }
    }

    /*
     * คำนวณราคาของแต่ละรายการจากฐานข้อมูล
     */
    const orderItems = validatedItems.map((item) => {
      const menu = menus.find(
        (currentMenu) => Number(currentMenu.id) === item.menuId,
      );

      if (!menu) {
        throw new Error("ไม่พบข้อมูลเมนู");
      }

      const selectedOptions = item.optionSelections.map((selection) => {
        const option = menuOptions.find(
          (currentOption) =>
            currentOption.id === selection.optionId &&
            currentOption.menuId === item.menuId,
        );

        if (!option) {
          throw new Error(`ไม่พบตัวเลือกของเมนู ${menu.name}`);
        }

        return {
          ...option,
          quantity: selection.quantity,
        };
      });

      const basePrice = Number(menu.price);

      const additionalPrice = selectedOptions.reduce(
        (total, option) =>
          total + option.additionalPrice * option.quantity,
        0,
      );

      /*
       * unit_price คือราคาต่อหนึ่งจานรวมตัวเลือกแล้ว
       * เช่น กะเพรา 50 + ไข่ดาว 10 = 60 บาท
       */
      const unitPrice = basePrice + additionalPrice;
      const subtotal = unitPrice * item.quantity;

      return {
        menu_id: Number(menu.id),
        quantity: item.quantity,
        unit_price: unitPrice,
        subtotal,
        note: item.note,
        selectedOptions,
      };
    });

    const totalAmount = orderItems.reduce(
      (total, item) => total + item.subtotal,
      0,
    );

    const orderNote = typeof note === "string" ? note.trim().slice(0, 500) : "";

    const requiredItems = Array.from(requiredIngredientMap.entries()).map(
      ([ingredientId, quantity]) => ({
        ingredient_id: ingredientId,
        quantity,
      }),
    );
    const itemsForTransaction = orderItems.map((item) => ({
      menu_id: item.menu_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      subtotal: item.subtotal,
      note: item.note,
      options: item.selectedOptions.map((option) => ({
        menu_option_id: option.id,
        option_name: option.name,
        additional_price: option.additionalPrice,
        quantity: option.quantity,
      })),
    }));

    const { data: createdOrder, error: createOrderError } = await supabase
      .rpc("create_order_with_stock", {
        p_table_id: numericTableId,
        p_session_token: sessionToken,
        p_order_note: orderNote || null,
        p_total_amount: totalAmount,
        p_items: itemsForTransaction,
        p_required_items: requiredItems,
      })
      .single();

    if (createOrderError || !createdOrder) {
      console.error("create_order_with_stock ไม่สำเร็จ", {
        code: createOrderError?.code,
        message: createOrderError?.message,
        details: createOrderError?.details,
        hint: createOrderError?.hint,
      });

      const isInsufficientStock =
        createOrderError?.code === "P0001" &&
        createOrderError.message.includes("INSUFFICIENT_STOCK");

      return NextResponse.json(
        {
          error: isInsufficientStock
            ? "วัตถุดิบไม่เพียงพอ"
            : "สร้างออเดอร์ไม่สำเร็จ กรุณาลองใหม่",
        },
        { status: isInsufficientStock ? 409 : 500 },
      );
    }

    return NextResponse.json(
      {
        message: "สั่งอาหารสำเร็จ",
        order: createdOrder,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Orders API unexpected error", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่" },
      { status: 500 },
    );
  }
}
