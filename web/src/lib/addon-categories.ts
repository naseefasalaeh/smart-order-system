export const addonCategories = [
  { value: "meat", label: "ตัวเลือกเนื้อสัตว์" },
  { value: "topping", label: "ไข่และท็อปปิ้ง" },
  { value: "portion", label: "เพิ่มปริมาณ" },
] as const;
export type AddonCategory = typeof addonCategories[number]["value"];
export const isAddonCategory = (value: string): value is AddonCategory => addonCategories.some((c) => c.value === value);
