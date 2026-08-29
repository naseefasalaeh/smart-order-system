import { NextResponse } from "next/server";
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

type MenuOptionData = {
  id: number;
  menu_id: number;
  name: string;
  additional_price: number;
  is_available: boolean;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateOrderBody;
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
      const totalOptionQuantity = optionSelections.reduce(
        (total, selection) => total + selection.quantity,
        0,
      );

      if (hasDuplicateOption || totalOptionQuantity > 3) {
        return NextResponse.json(
          {
            error:
              "ตัวเลือกเสริมซ้ำกันหรือมีจำนวนรวมเกิน 3 รายการต่อจาน",
          },
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
      return NextResponse.json(
        {
          error: "ตรวจสอบข้อมูลโต๊ะไม่สำเร็จ",
          details: tableError.message,
        },
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
      return NextResponse.json(
        { error: "ตรวจสอบรอบโต๊ะไม่สำเร็จ", details: sessionReadError.message },
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

    let sessionId = existingSession?.id;

    if (!sessionId) {
      const { data: createdSession, error: sessionCreateError } = await supabase
        .from("dining_sessions")
        .insert({
          table_id: numericTableId,
          access_token: sessionToken,
          status: "active",
        })
        .select("id")
        .single();

      if (sessionCreateError || !createdSession) {
        return NextResponse.json(
          {
            error: "เริ่มรอบโต๊ะไม่สำเร็จ",
            details: sessionCreateError?.message,
          },
          { status: 500 },
        );
      }

      sessionId = createdSession.id;
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
      return NextResponse.json(
        {
          error: "ตรวจสอบข้อมูลเมนูไม่สำเร็จ",
          details: menusError.message,
        },
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

    /*
     * โหลดตัวเลือกทั้งหมดที่ลูกค้าส่งมา
     */
    const allOptionIds = Array.from(
      new Set(
        validatedItems.flatMap((item) =>
          item.optionSelections.map((selection) => selection.optionId),
        ),
      ),
    );

    let menuOptions: MenuOptionData[] = [];

    if (allOptionIds.length > 0) {
      const { data: optionRows, error: optionsError } = await supabase
        .from("menu_options")
        .select("id, menu_id, name, additional_price, is_available")
        .in("id", allOptionIds);

      if (optionsError) {
        return NextResponse.json(
          {
            error: "ตรวจสอบตัวเลือกเสริมไม่สำเร็จ",
            details: optionsError.message,
          },
          { status: 500 },
        );
      }

      if (!optionRows || optionRows.length !== allOptionIds.length) {
        return NextResponse.json(
          {
            error: "มีตัวเลือกเสริมบางรายการที่ไม่มีอยู่ในระบบ",
          },
          { status: 400 },
        );
      }

      menuOptions = optionRows.map((option) => ({
        id: Number(option.id),
        menu_id: Number(option.menu_id),
        name: String(option.name),
        additional_price: Number(option.additional_price),
        is_available: Boolean(option.is_available),
      }));

      const unavailableOptions = menuOptions.filter(
        (option) => !option.is_available,
      );

      if (unavailableOptions.length > 0) {
        return NextResponse.json(
          {
            error: "มีตัวเลือกเสริมที่ปิดขายแล้ว",
            details: unavailableOptions.map((option) => option.name).join(", "),
          },
          { status: 409 },
        );
      }

      /*
       * ตรวจสอบว่าตัวเลือกเป็นของเมนูที่ลูกค้าสั่งจริง
       * เช่น ไม่อนุญาตให้นำ option ของข้าวกะเพราไปใส่น้ำเปล่า
       */
      for (const item of validatedItems) {
        const invalidOptionForMenu = item.optionSelections
          .map((selection) =>
            menuOptions.find((option) => option.id === selection.optionId),
          )
          .find((option) => !option || option.menu_id !== item.menuId);

        if (invalidOptionForMenu !== undefined) {
          return NextResponse.json(
            {
              error: "ตัวเลือกเสริมไม่ตรงกับเมนูที่เลือก",
            },
            { status: 400 },
          );
        }
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
      return NextResponse.json(
        {
          error: "ตรวจสอบสูตรวัตถุดิบไม่สำเร็จ",
          details: recipeError.message,
        },
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
        return NextResponse.json(
          {
            error: "ตรวจสอบสูตรวัตถุดิบของตัวเลือกเสริมไม่สำเร็จ",
            details: optionIngredientsError.message,
          },
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
        return NextResponse.json(
          {
            error: "ตรวจสอบสต็อกวัตถุดิบไม่สำเร็จ",
            details: ingredientsError.message,
          },
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
            currentOption.menu_id === item.menuId,
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
          total + option.additional_price * option.quantity,
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

    /*
     * สร้างออเดอร์
     */
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        table_id: numericTableId,
        session_id: sessionId,
        status: "confirmed",
        total_amount: totalAmount,
        note: orderNote || null,
        stock_deducted: false,
      })
      .select(
        "id, order_number, table_id, session_id, status, total_amount, stock_deducted",
      )
      .single();

    if (orderError) {
      return NextResponse.json(
        {
          error: "สร้างออเดอร์ไม่สำเร็จ",
          details: orderError.message,
        },
        { status: 500 },
      );
    }

    /*
     * ฟังก์ชันล้างออเดอร์เมื่อบันทึกส่วนใดส่วนหนึ่งไม่สำเร็จ
     * order_items และ order_item_options จะถูกลบตาม
     * foreign key on delete cascade
     */
    const cleanupOrder = async () => {
      return supabase.from("orders").delete().eq("id", order.id);
    };

    /*
     * บันทึกรายการอาหารทีละรายการ
     * เพื่อให้ได้ order_item.id สำหรับผูกตัวเลือก
     */
    for (const item of orderItems) {
      const { data: createdOrderItem, error: orderItemError } = await supabase
        .from("order_items")
        .insert({
          order_id: order.id,
          menu_id: item.menu_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          subtotal: item.subtotal,
          note: item.note,
        })
        .select("id")
        .single();

      if (orderItemError || !createdOrderItem) {
        const { error: cleanupError } = await cleanupOrder();

        return NextResponse.json(
          {
            error: "บันทึกรายการอาหารไม่สำเร็จ",
            details: orderItemError?.message ?? "ไม่พบ ID ของรายการอาหาร",
            cleanupError: cleanupError?.message,
          },
          { status: 500 },
        );
      }

      /*
       * บันทึกสำเนาชื่อและราคาตัวเลือก ณ เวลาสั่ง
       */
      if (item.selectedOptions.length > 0) {
        const optionsForInsert = item.selectedOptions.map((option) => ({
          order_item_id: createdOrderItem.id,
          menu_option_id: option.id,
          option_name: option.name,
          additional_price: option.additional_price,
          quantity: option.quantity,
        }));

        const { error: itemOptionsError } = await supabase
          .from("order_item_options")
          .insert(optionsForInsert);

        if (itemOptionsError) {
          const { error: cleanupError } = await cleanupOrder();

          return NextResponse.json(
            {
              error: "บันทึกตัวเลือกเสริมไม่สำเร็จ",
              details: itemOptionsError.message,
              cleanupError: cleanupError?.message,
            },
            { status: 500 },
          );
        }
      }
    }

    /*
     * บันทึกออเดอร์และตัวเลือกครบแล้ว จึงส่งรายการวัตถุดิบให้ RPC
     * ฟังก์ชันจะหักสต็อก บันทึกประวัติการใช้ และตั้ง stock_deducted=true
     * ภายใน transaction เดียว เพื่อให้ทุกขั้นสำเร็จหรือย้อนกลับพร้อมกัน
     */
    const requiredItems = Array.from(requiredIngredientMap.entries()).map(
      ([ingredientId, quantity]) => ({
        ingredient_id: ingredientId,
        quantity,
      }),
    );

    if (requiredItems.length > 0) {
      const { error: processStockError } = await supabase.rpc(
        "process_order_stock",
        {
          p_order_id: order.id,
          required_items: requiredItems,
        },
      );

      if (processStockError) {
        const { error: cleanupError } = await cleanupOrder();

        const isInsufficientStock =
          processStockError.message.includes("ไม่เพียงพอ");

        return NextResponse.json(
          {
            error: isInsufficientStock
              ? "วัตถุดิบไม่เพียงพอ"
              : "หักสต็อกวัตถุดิบไม่สำเร็จ",
            details: processStockError.message,
            cleanupError: cleanupError?.message,
          },
          { status: isInsufficientStock ? 409 : 500 },
        );
      }
    } else {
      const { error: updateWithoutStockError } = await supabase
        .from("orders")
        .update({ stock_deducted: true })
        .eq("id", order.id);

      if (updateWithoutStockError) {
        const { error: cleanupError } = await cleanupOrder();

        return NextResponse.json(
          {
            error: "บันทึกสถานะออเดอร์ไม่สำเร็จ",
            details: updateWithoutStockError.message,
            cleanupError: cleanupError?.message,
          },
          { status: 500 },
        );
      }
    }

    const { data: updatedOrder, error: readOrderError } = await supabase
      .from("orders")
      .select(
        "id, order_number, table_id, session_id, status, total_amount, stock_deducted",
      )
      .eq("id", order.id)
      .single();

    if (readOrderError || !updatedOrder) {
      return NextResponse.json(
        {
          error:
            "สร้างออเดอร์แล้ว แต่โหลดข้อมูลออเดอร์ไม่สำเร็จ กรุณาแจ้งพนักงาน",
          details: readOrderError?.message ?? "ไม่พบข้อมูลออเดอร์หลังอัปเดต",
          orderId: order.id,
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        message: "สั่งอาหารสำเร็จ",
        order: updatedOrder,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "เกิดข้อผิดพลาดในระบบ",
        details:
          error instanceof Error ? error.message : "Unknown server error",
      },
      { status: 500 },
    );
  }
}
