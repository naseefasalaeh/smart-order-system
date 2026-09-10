"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function editUrl(menuId: number, type: "error" | "success", message: string) {
  return `/dashboard/menus/${menuId}/edit?tab=options&${type}=${encodeURIComponent(message)}`;
}

async function requireStaff() {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) redirect("/login");
  return authClient;
}

function positiveId(value: FormDataEntryValue | null) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

export async function saveOptionGroup(formData: FormData) {
  const db = await requireStaff();

  const menuId = positiveId(formData.get("menu_id"));
  const groupId = positiveId(formData.get("group_id"));
  const name = String(formData.get("name") ?? "").trim();
  const selectionType = String(formData.get("selection_type") ?? "");
  const isRequired = formData.get("is_required") === "on";
  const isActive = formData.get("is_active") === "on";
  const displayOrder = Number(formData.get("display_order"));
  let minSelect = Number(formData.get("min_select"));
  let maxSelect = Number(formData.get("max_select"));
  let maxTotalQuantity = Number(formData.get("max_total_quantity"));

  if (!menuId) redirect("/dashboard/menus");

  if (!name) redirect(editUrl(menuId, "error", "กรุณากรอกชื่อกลุ่มตัวเลือก"));
  if (!Number.isInteger(displayOrder) || displayOrder < 0) {
    redirect(editUrl(menuId, "error", "ลำดับกลุ่มต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป"));
  }
  if (selectionType !== "single" && selectionType !== "multiple") {
    redirect(editUrl(menuId, "error", "ประเภทการเลือกไม่ถูกต้อง"));
  }

  if (selectionType === "single") {
    minSelect = isRequired ? 1 : 0;
    maxSelect = 1;
    maxTotalQuantity = 1;
  }

  if (
    !Number.isInteger(minSelect) ||
    !Number.isInteger(maxSelect) ||
    !Number.isInteger(maxTotalQuantity) ||
    minSelect < 0 ||
    maxSelect < 1 ||
    minSelect > maxSelect ||
    maxTotalQuantity < 1 ||
    (isRequired ? minSelect < 1 : minSelect !== 0) ||
    (selectionType === "multiple" && maxTotalQuantity < maxSelect)
  ) {
    redirect(editUrl(menuId, "error", "กฎจำนวนตัวเลือกของกลุ่มไม่ถูกต้อง"));
  }



  if (isActive && isRequired) {
    if (!groupId) {
      redirect(
        editUrl(
          menuId,
          "error",
          "กรุณาสร้างกลุ่มบังคับแบบปิดไว้ก่อน แล้วเพิ่มตัวเลือกอย่างน้อย 1 รายการก่อนเปิดใช้งาน",
        ),
      );
    }

    const { count, error } = await db
      .from("menu_options")
      .select("id", { count: "exact", head: true })
      .eq("menu_id", menuId)
      .eq("group_id", groupId)
      .eq("is_available", true);

    if (error) {
      console.error("ตรวจ active options ของ required group ไม่สำเร็จ", error);
      redirect(editUrl(menuId, "error", "ตรวจสอบตัวเลือกในกลุ่มไม่สำเร็จ กรุณาลองใหม่"));
    }
    if (!count) {
      redirect(editUrl(menuId, "error", "กลุ่มบังคับที่เปิดใช้งานต้องมีตัวเลือกที่เปิดขายอย่างน้อย 1 รายการ"));
    }
  }

  const values = {
    menu_id: menuId,
    name,
    selection_type: selectionType,
    is_required: isRequired,
    min_select: minSelect,
    max_select: maxSelect,
    max_total_quantity: maxTotalQuantity,
    display_order: displayOrder,
    is_active: isActive,
  };
  const result = groupId
    ? await db
        .from("menu_option_groups")
        .update(values)
        .eq("id", groupId)
        .eq("menu_id", menuId)
        .select("id")
        .maybeSingle()
    : await db.from("menu_option_groups").insert(values).select("id").single();

  if (result.error || !result.data) {
    console.error("บันทึก menu option group ไม่สำเร็จ", result.error);
    const duplicate = result.error?.code === "23505";
    redirect(
      editUrl(
        menuId,
        "error",
        duplicate ? "ชื่อกลุ่มนี้มีอยู่แล้วในเมนู" : "บันทึกกลุ่มตัวเลือกไม่สำเร็จ กรุณาลองใหม่",
      ),
    );
  }

  revalidatePath(`/dashboard/menus/${menuId}/edit`);
  redirect(editUrl(menuId, "success", groupId ? "แก้ไขกลุ่มแล้ว" : "เพิ่มกลุ่มแล้ว"));
}

export async function saveMenuOption(formData: FormData) {
  const db = await requireStaff();

  const menuId = positiveId(formData.get("menu_id"));
  const groupId = positiveId(formData.get("group_id"));
  const optionId = positiveId(formData.get("option_id"));
  const name = String(formData.get("name") ?? "").trim();
  const additionalPrice = Number(formData.get("additional_price"));
  const sortOrder = Number(formData.get("sort_order"));
  const requestedMaxQuantity = Number(formData.get("max_quantity"));
  const isAvailable = formData.get("is_available") === "on";

  if (!menuId) redirect("/dashboard/menus");
  if (!groupId || !name) {
    redirect(editUrl(menuId, "error", "กรุณาเลือกกลุ่มและกรอกชื่อตัวเลือก"));
  }
  if (!Number.isFinite(additionalPrice) || additionalPrice < 0) {
    redirect(editUrl(menuId, "error", "ราคาเพิ่มต้องเป็น 0 หรือมากกว่า"));
  }
  if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    redirect(editUrl(menuId, "error", "ลำดับตัวเลือกต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป"));
  }


  const { data: group, error: groupError } = await db
    .from("menu_option_groups")
    .select("id, menu_id, selection_type, is_required, is_active")
    .eq("id", groupId)
    .eq("menu_id", menuId)
    .maybeSingle();

  if (groupError) console.error("โหลดกลุ่มก่อนบันทึก option ไม่สำเร็จ", groupError);
  if (!group) redirect(editUrl(menuId, "error", "ไม่พบกลุ่มตัวเลือกของเมนูนี้"));

  const { data: existingOption, error: existingOptionError } = optionId
    ? await db
        .from("menu_options")
        .select("id, group_id, is_available")
        .eq("id", optionId)
        .eq("menu_id", menuId)
        .maybeSingle()
    : { data: null, error: null };

  if (existingOptionError) {
    console.error("โหลด option เดิมก่อนแก้ไขไม่สำเร็จ", existingOptionError);
    redirect(editUrl(menuId, "error", "ตรวจสอบตัวเลือกเดิมไม่สำเร็จ กรุณาลองใหม่"));
  }
  if (optionId && !existingOption) {
    redirect(editUrl(menuId, "error", "ไม่พบตัวเลือกของเมนูนี้"));
  }

  if (isAvailable) {
    if (!optionId) {
      redirect(
        editUrl(
          menuId,
          "error",
          "กรุณาสร้างตัวเลือกแบบปิดขายก่อน เพิ่มสูตรวัตถุดิบ แล้วจึงเปิดขาย",
        ),
      );
    }
    const { count, error } = await db
      .from("menu_option_ingredients")
      .select("ingredient_id", { count: "exact", head: true })
      .eq("menu_option_id", optionId);
    if (error) {
      console.error("ตรวจสูตรก่อนเปิดขาย option ไม่สำเร็จ", error);
      redirect(editUrl(menuId, "error", "ตรวจสอบสูตรตัวเลือกไม่สำเร็จ กรุณาลองใหม่"));
    }
    if (!count) {
      redirect(editUrl(menuId, "error", "ตัวเลือกที่เปิดขายต้องมีสูตรวัตถุดิบอย่างน้อย 1 รายการ"));
    }
  }

  const maxQuantity = group.selection_type === "single" ? 1 : requestedMaxQuantity;
  if (!Number.isInteger(maxQuantity) || maxQuantity < 1 || maxQuantity > 3) {
    redirect(editUrl(menuId, "error", "จำนวนสูงสุดต่อตัวเลือกต้องอยู่ระหว่าง 1-3"));
  }

  if (!isAvailable && optionId && group.is_required && group.is_active) {
    const { count, error } = await db
      .from("menu_options")
      .select("id", { count: "exact", head: true })
      .eq("menu_id", menuId)
      .eq("group_id", groupId)
      .eq("is_available", true)
      .neq("id", optionId);
    if (error) {
      console.error("ตรวจตัวเลือกสุดท้ายของ required group ไม่สำเร็จ", error);
      redirect(editUrl(menuId, "error", "ตรวจสอบสถานะตัวเลือกไม่สำเร็จ กรุณาลองใหม่"));
    }
    if (!count) {
      redirect(editUrl(menuId, "error", "ปิดตัวเลือกสุดท้ายของกลุ่มบังคับไม่ได้ กรุณาปิดกลุ่มก่อน"));
    }
  }

  const oldGroupId = existingOption?.group_id ? Number(existingOption.group_id) : null;
  if (
    existingOption?.is_available &&
    oldGroupId &&
    oldGroupId !== groupId
  ) {
    const [{ data: oldGroup, error: oldGroupError }, { count, error: countError }] =
      await Promise.all([
        db
          .from("menu_option_groups")
          .select("is_required, is_active")
          .eq("id", oldGroupId)
          .eq("menu_id", menuId)
          .maybeSingle(),
        db
          .from("menu_options")
          .select("id", { count: "exact", head: true })
          .eq("menu_id", menuId)
          .eq("group_id", oldGroupId)
          .eq("is_available", true)
          .neq("id", optionId),
      ]);
    if (oldGroupError || countError) {
      console.error("ตรวจ required group เดิมก่อนย้าย option ไม่สำเร็จ", {
        oldGroupError,
        countError,
      });
      redirect(editUrl(menuId, "error", "ตรวจสอบกลุ่มเดิมไม่สำเร็จ กรุณาลองใหม่"));
    }
    if (oldGroup?.is_required && oldGroup.is_active && !count) {
      redirect(editUrl(menuId, "error", "ย้ายตัวเลือกสุดท้ายออกจากกลุ่มบังคับไม่ได้ กรุณาปิดกลุ่มก่อน"));
    }
  }

  const values = {
    menu_id: menuId,
    group_id: groupId,
    name,
    additional_price: additionalPrice,
    sort_order: sortOrder,
    is_available: isAvailable,
    max_quantity: maxQuantity,
  };
  const result = optionId
    ? await db
        .from("menu_options")
        .update(values)
        .eq("id", optionId)
        .eq("menu_id", menuId)
        .select("id")
        .maybeSingle()
    : await db.from("menu_options").insert(values).select("id").single();

  if (result.error || !result.data) {
    console.error("บันทึก menu option ไม่สำเร็จ", result.error);
    redirect(
      editUrl(
        menuId,
        "error",
        result.error?.code === "23505"
          ? "ชื่อตัวเลือกนี้มีอยู่แล้วในกลุ่ม"
          : "บันทึกตัวเลือกไม่สำเร็จ กรุณาลองใหม่",
      ),
    );
  }

  revalidatePath(`/dashboard/menus/${menuId}/edit`);
  redirect(editUrl(menuId, "success", optionId ? "แก้ไขตัวเลือกแล้ว" : "เพิ่มตัวเลือกแล้ว"));
}

export async function saveOptionIngredient(formData: FormData) {
  const db = await requireStaff();
  const menuId = positiveId(formData.get("menu_id"));
  const optionId = positiveId(formData.get("option_id"));
  const ingredientId = positiveId(formData.get("ingredient_id"));
  const quantityRequired = Number(formData.get("quantity_required"));

  if (!menuId) redirect("/dashboard/menus");
  if (!optionId || !ingredientId || !Number.isFinite(quantityRequired) || quantityRequired <= 0) {
    redirect(editUrl(menuId, "error", "ข้อมูลวัตถุดิบของตัวเลือกไม่ถูกต้อง"));
  }


  const [{ data: option }, { data: ingredient }] = await Promise.all([
    db.from("menu_options").select("id").eq("id", optionId).eq("menu_id", menuId).maybeSingle(),
    db.from("ingredients").select("id").eq("id", ingredientId).maybeSingle(),
  ]);
  if (!option || !ingredient) {
    redirect(editUrl(menuId, "error", "ไม่พบตัวเลือกหรือวัตถุดิบที่เลือก"));
  }

  const { error } = await db.from("menu_option_ingredients").upsert(
    {
      menu_option_id: optionId,
      ingredient_id: ingredientId,
      quantity_required: quantityRequired,
    },
    { onConflict: "menu_option_id,ingredient_id" },
  );
  if (error) {
    console.error("บันทึกสูตรของ menu option ไม่สำเร็จ", error);
    redirect(editUrl(menuId, "error", "บันทึกสูตรของตัวเลือกไม่สำเร็จ กรุณาลองใหม่"));
  }

  revalidatePath(`/dashboard/menus/${menuId}/edit`);
  redirect(editUrl(menuId, "success", "บันทึกสูตรตัวเลือกแล้ว"));
}

export async function removeOptionIngredient(formData: FormData) {
  const db = await requireStaff();
  const menuId = positiveId(formData.get("menu_id"));
  const optionId = positiveId(formData.get("option_id"));
  const ingredientId = positiveId(formData.get("ingredient_id"));

  if (!menuId) redirect("/dashboard/menus");
  if (!optionId || !ingredientId) {
    redirect(editUrl(menuId, "error", "ข้อมูลวัตถุดิบของตัวเลือกไม่ถูกต้อง"));
  }


  const { data: option } = await db
    .from("menu_options")
    .select("id, is_available")
    .eq("id", optionId)
    .eq("menu_id", menuId)
    .maybeSingle();
  if (!option) redirect(editUrl(menuId, "error", "ไม่พบตัวเลือกของเมนูนี้"));

  if (option.is_available) {
    const { count, error: countError } = await db
      .from("menu_option_ingredients")
      .select("ingredient_id", { count: "exact", head: true })
      .eq("menu_option_id", optionId)
      .neq("ingredient_id", ingredientId);
    if (countError) {
      console.error("ตรวจสูตรที่เหลือของ option ไม่สำเร็จ", countError);
      redirect(editUrl(menuId, "error", "ตรวจสอบสูตรตัวเลือกไม่สำเร็จ กรุณาลองใหม่"));
    }
    if (!count) {
      redirect(editUrl(menuId, "error", "นำวัตถุดิบสุดท้ายออกจากตัวเลือกที่เปิดขายไม่ได้ กรุณาปิดขายตัวเลือกก่อน"));
    }
  }

  const { error } = await db
    .from("menu_option_ingredients")
    .delete()
    .eq("menu_option_id", optionId)
    .eq("ingredient_id", ingredientId);
  if (error) {
    console.error("นำวัตถุดิบออกจากสูตร option ไม่สำเร็จ", error);
    redirect(editUrl(menuId, "error", "นำวัตถุดิบออกจากสูตรไม่สำเร็จ กรุณาลองใหม่"));
  }

  revalidatePath(`/dashboard/menus/${menuId}/edit`);
  redirect(editUrl(menuId, "success", "นำวัตถุดิบออกจากสูตรแล้ว"));
}
