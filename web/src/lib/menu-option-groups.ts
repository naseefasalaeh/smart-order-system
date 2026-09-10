export type MenuOptionSelection = {
  optionId: number;
  quantity: number;
};

export type MenuOptionGroupRule = {
  id: number;
  menuId: number;
  name: string;
  selectionType: "single" | "multiple";
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  maxTotalQuantity: number;
  isActive: boolean;
};

export type MenuOptionRule = {
  id: number;
  menuId: number;
  groupId: number | null;
  name: string;
  additionalPrice: number;
  isAvailable: boolean;
  maxQuantity: number;
};

export type OptionValidationResult =
  | { ok: true; selectedOptions: Array<MenuOptionRule & { quantity: number }> }
  | { ok: false; message: string };

const legacyGroupId = (menuId: number) => `legacy:${menuId}`;

export function validateMenuOptionSelections({
  menuId,
  selections,
  groups,
  options,
}: {
  menuId: number;
  selections: MenuOptionSelection[];
  groups: MenuOptionGroupRule[];
  options: MenuOptionRule[];
}): OptionValidationResult {
  const optionIds = selections.map((selection) => selection.optionId);

  if (new Set(optionIds).size !== optionIds.length) {
    return { ok: false, message: "ไม่สามารถเลือกตัวเลือกเดิมซ้ำกันได้" };
  }

  const menuGroups = groups.filter((group) => group.menuId === menuId);
  const groupById = new Map(menuGroups.map((group) => [group.id, group]));
  const menuOptions = options.filter((option) => option.menuId === menuId);
  const optionById = new Map(menuOptions.map((option) => [option.id, option]));
  const selectedOptions: Array<MenuOptionRule & { quantity: number }> = [];

  for (const selection of selections) {
    if (
      !Number.isInteger(selection.optionId) ||
      selection.optionId <= 0 ||
      !Number.isInteger(selection.quantity) ||
      selection.quantity < 1 ||
      selection.quantity > 3
    ) {
      return { ok: false, message: "จำนวนตัวเลือกไม่ถูกต้อง" };
    }

    const option = optionById.get(selection.optionId);

    if (!option) {
      return { ok: false, message: "ตัวเลือกไม่ตรงกับเมนูที่เลือก" };
    }

    if (!option.isAvailable) {
      return { ok: false, message: `ตัวเลือก “${option.name}” ปิดขายแล้ว` };
    }

    if (selection.quantity > option.maxQuantity) {
      return {
        ok: false,
        message: `เลือก “${option.name}” ได้ไม่เกิน ${option.maxQuantity} รายการต่อจาน`,
      };
    }

    if (option.groupId !== null) {
      const group = groupById.get(option.groupId);

      if (!group || !group.isActive) {
        return { ok: false, message: `กลุ่มของ “${option.name}” ปิดใช้งานแล้ว` };
      }

      if (group.selectionType === "single" && selection.quantity !== 1) {
        return { ok: false, message: `กลุ่ม “${group.name}” เลือกจำนวนได้เพียง 1` };
      }
    }

    selectedOptions.push({ ...option, quantity: selection.quantity });
  }

  const activeGroups: Array<
    MenuOptionGroupRule & { key: string; optionGroupId: number | null }
  > = menuGroups
    .filter((group) => group.isActive)
    .map((group) => ({ ...group, key: String(group.id), optionGroupId: group.id }));

  if (menuOptions.some((option) => option.groupId === null)) {
    activeGroups.push({
      id: -menuId,
      key: legacyGroupId(menuId),
      optionGroupId: null,
      menuId,
      name: "ตัวเลือกเพิ่มเติม",
      selectionType: "multiple",
      isRequired: false,
      minSelect: 0,
      maxSelect: 3,
      maxTotalQuantity: 3,
      isActive: true,
    });
  }

  for (const group of activeGroups) {
    const groupSelections = selectedOptions.filter(
      (option) => option.groupId === group.optionGroupId,
    );
    const distinctCount = groupSelections.length;
    const totalQuantity = groupSelections.reduce(
      (total, option) => total + option.quantity,
      0,
    );

    if (distinctCount < group.minSelect) {
      return {
        ok: false,
        message: `กรุณาเลือก “${group.name}” อย่างน้อย ${group.minSelect} รายการ`,
      };
    }

    if (distinctCount > group.maxSelect) {
      return {
        ok: false,
        message: `กลุ่ม “${group.name}” เลือกได้ไม่เกิน ${group.maxSelect} รายการ`,
      };
    }

    if (totalQuantity > group.maxTotalQuantity) {
      return {
        ok: false,
        message: `กลุ่ม “${group.name}” เลือกจำนวนรวมได้ไม่เกิน ${group.maxTotalQuantity}`,
      };
    }

    if (group.selectionType === "single" && distinctCount > 1) {
      return { ok: false, message: `กลุ่ม “${group.name}” เลือกได้เพียง 1 รายการ` };
    }
  }

  return { ok: true, selectedOptions };
}
