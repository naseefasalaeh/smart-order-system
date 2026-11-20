"use client";

import { useMemo, useState } from "react";
import type { CustomerMenu } from "@/lib/customer-menu-catalog";
import { formatOrderNumber } from "@/lib/order-number";
import type { PaymentAllocation } from "@/lib/payment-progress";

export type OrderOptionData = {
  id: number;
  menu_option_id?: number;
  option_name: string;
  additional_price: number;
  quantity: number;
};

export type OrderItemData = {
  id: number;
  menu_id?: number | null;
  quantity: number;
  completed_plates: number[];
  served_plates: number[];
  unit_price: number;
  subtotal: number;
  note: string | null;
  menu_name_snapshot: string;
  menu_price_snapshot: number;
  menus: { name: string } | null;
  order_item_options: OrderOptionData[];
  payment_allocations?: PaymentAllocation[];
};

export type OrderData = {
  dining_type: "dine_in" | "takeaway";
  id: string;
  order_number: string | null;
  status: string;
  total_amount: number;
  note: string | null;
  created_at: string;
  order_items: OrderItemData[];
};

type EditableItemOption = {
  optionId: number;
  optionName: string;
  additionalPrice: number;
  quantity: number;
  groupName?: string;
};

export type EditableItem = {
  tempId: string;
  menuId: number;
  menuName: string;
  basePrice: number;
  quantity: number;
  note: string;
  options: EditableItemOption[];
  unitPrice: number;
  subtotal: number;
};

function formatPrice(value: number) {
  return new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 }).format(value);
}

function calculateItemUnitPrice(basePrice: number, options: EditableItemOption[]) {
  const optionsSum = options.reduce(
    (sum, opt) => sum + Math.round(opt.additionalPrice * 100) * opt.quantity,
    0,
  );
  return (Math.round(basePrice * 100) + optionsSum) / 100;
}

export default function EditOrderModal({
  order,
  menus,
  tableId,
  sessionToken,
  onClose,
  onSuccess,
}: {
  order: OrderData;
  menus: CustomerMenu[];
  tableId: number;
  sessionToken: string;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}) {
  // Convert existing order items into EditableItem format
  const initialItems = useMemo<EditableItem[]>(() => {
    return order.order_items.map((item, index) => {
      const catalogMenu = menus.find((m) => m.id === item.menu_id);
      const basePrice = catalogMenu
        ? catalogMenu.price
        : Number(item.menu_price_snapshot || item.unit_price);
      const menuName =
        item.menu_name_snapshot || item.menus?.name || catalogMenu?.name || "รายการอาหาร";

      const mappedOptions: EditableItemOption[] = (item.order_item_options ?? []).map(
        (opt) => {
          // If menu_option_id is missing, try to find in catalog
          let optId = opt.menu_option_id;
          if (!optId && catalogMenu) {
            for (const grp of catalogMenu.option_groups) {
              const matched = grp.options.find((o) => o.name === opt.option_name);
              if (matched) {
                optId = matched.id;
                break;
              }
            }
          }

          return {
            optionId: optId ?? opt.id,
            optionName: opt.option_name,
            additionalPrice: Number(opt.additional_price || 0),
            quantity: opt.quantity || 1,
          };
        },
      );

      const unitPrice = calculateItemUnitPrice(basePrice, mappedOptions);
      return {
        tempId: `existing-${item.id}-${index}`,
        menuId: item.menu_id || catalogMenu?.id || 0,
        menuName,
        basePrice,
        quantity: item.quantity,
        note: item.note || "",
        options: mappedOptions,
        unitPrice,
        subtotal: (Math.round(unitPrice * 100) * item.quantity) / 100,
      };
    });
  }, [order, menus]);

  const [items, setItems] = useState<EditableItem[]>(initialItems);
  const [orderNote, setOrderNote] = useState(order.note || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Sub-modal states
  const [showMenuPicker, setShowMenuPicker] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ทั้งหมด");

  // Item Option Configurator states
  const [configuringMenu, setConfiguringMenu] = useState<CustomerMenu | null>(null);
  const [configuringTargetItem, setConfiguringTargetItem] = useState<EditableItem | null>(null);
  const [configuringQuantity, setConfiguringQuantity] = useState(1);
  const [configuringNote, setConfiguringNote] = useState("");
  const [selectedOptionQuantities, setSelectedOptionQuantities] = useState<
    Record<number, number>
  >({});
  const [optionConfigError, setOptionConfigError] = useState("");

  // Realtime total calculation
  const newTotalAmount = useMemo(() => {
    return (
      items.reduce(
        (sum, item) => sum + Math.round(item.unitPrice * 100) * item.quantity,
        0,
      ) / 100
    );
  }, [items]);

  const priceDiff = newTotalAmount - Number(order.total_amount);

  // Available categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    menus.forEach((m) => {
      if (m.category_name) set.add(m.category_name);
    });
    return ["ทั้งหมด", ...Array.from(set)];
  }, [menus]);

  // Filtered menus for Menu Picker
  const filteredMenus = useMemo(() => {
    return menus.filter((m) => {
      if (!m.can_order) return false;
      const matchesCategory =
        selectedCategory === "ทั้งหมด" || m.category_name === selectedCategory;
      const matchesSearch =
        !searchFilter.trim() ||
        m.name.toLowerCase().includes(searchFilter.trim().toLowerCase()) ||
        (m.description &&
          m.description.toLowerCase().includes(searchFilter.trim().toLowerCase()));
      return matchesCategory && matchesSearch;
    });
  }, [menus, selectedCategory, searchFilter]);

  // Item quantity steppers
  function updateItemQuantity(tempId: string, delta: number) {
    setItems((prev) =>
      prev
        .map((item) => {
          if (item.tempId !== tempId) return item;
          const nextQty = item.quantity + delta;
          if (nextQty <= 0) return null; // Marked for removal
          return {
            ...item,
            quantity: nextQty,
            subtotal: (Math.round(item.unitPrice * 100) * nextQty) / 100,
          };
        })
        .filter((item): item is EditableItem => item !== null),
    );
  }

  function removeItem(tempId: string) {
    setItems((prev) => prev.filter((item) => item.tempId !== tempId));
  }

  // Open option configurator for an existing item
  function openEditOptions(item: EditableItem) {
    const catalogMenu = menus.find((m) => m.id === item.menuId);
    if (!catalogMenu) {
      setErrorMessage("ไม่พบข้อมูลเมนูนี้ในระบบ อาจถูกปิดขายแล้ว");
      return;
    }

    const initialSelections: Record<number, number> = {};
    item.options.forEach((opt) => {
      initialSelections[opt.optionId] = opt.quantity;
    });

    setConfiguringMenu(catalogMenu);
    setConfiguringTargetItem(item);
    setConfiguringQuantity(item.quantity);
    setConfiguringNote(item.note);
    setSelectedOptionQuantities(initialSelections);
    setOptionConfigError("");
  }

  // Open option configurator for a newly chosen menu
  function openAddNewMenu(menu: CustomerMenu) {
    setConfiguringMenu(menu);
    setConfiguringTargetItem(null);
    setConfiguringQuantity(1);
    setConfiguringNote("");
    setOptionConfigError("");

    // Auto-select required default options if available
    const initialSelections: Record<number, number> = {};
    for (const group of menu.option_groups) {
      if (group.is_required && group.options.length > 0) {
        const available = group.options.filter((o) => o.is_available);
        const countToSelect = Math.max(1, group.min_select || 1);
        for (let i = 0; i < Math.min(countToSelect, available.length); i++) {
          initialSelections[available[i].id] = 1;
        }
      }
    }
    setSelectedOptionQuantities(initialSelections);
    setShowMenuPicker(false);
  }

  // Save configured options (either create new or update target)
  function saveConfiguredItem() {
    if (!configuringMenu) return;

    // Validate option groups
    for (const group of configuringMenu.option_groups) {
      const groupSelections = group.options.filter(
        (opt) => (selectedOptionQuantities[opt.id] ?? 0) > 0,
      );
      const totalQty = groupSelections.reduce(
        (sum, opt) => sum + (selectedOptionQuantities[opt.id] ?? 0),
        0,
      );

      if (groupSelections.length < group.min_select) {
        setOptionConfigError(
          `กรุณาเลือก “${group.name}” อย่างน้อย ${group.min_select} รายการ`,
        );
        return;
      }

      if (group.max_select > 0 && groupSelections.length > group.max_select) {
        setOptionConfigError(
          `เลือก “${group.name}” ได้ไม่เกิน ${group.max_select} รายการ`,
        );
        return;
      }

      if (group.max_total_quantity > 0 && totalQty > group.max_total_quantity) {
        setOptionConfigError(
          `เลือกจำนวนรวมของ “${group.name}” ได้ไม่เกิน ${group.max_total_quantity}`,
        );
        return;
      }
    }

    // Build options summary
    const chosenOptions: EditableItemOption[] = [];
    for (const group of configuringMenu.option_groups) {
      for (const opt of group.options) {
        const qty = selectedOptionQuantities[opt.id] ?? 0;
        if (qty > 0) {
          chosenOptions.push({
            optionId: opt.id,
            optionName: opt.name,
            additionalPrice: Number(opt.additional_price),
            quantity: qty,
            groupName: group.name,
          });
        }
      }
    }

    const unitPrice = calculateItemUnitPrice(configuringMenu.price, chosenOptions);
    const subtotal = (Math.round(unitPrice * 100) * configuringQuantity) / 100;

    if (configuringTargetItem) {
      // Update existing item
      setItems((prev) =>
        prev.map((item) =>
          item.tempId === configuringTargetItem.tempId
            ? {
                ...item,
                quantity: configuringQuantity,
                note: configuringNote.trim(),
                options: chosenOptions,
                unitPrice,
                subtotal,
              }
            : item,
        ),
      );
    } else {
      // Add as new item
      const newItem: EditableItem = {
        tempId: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        menuId: configuringMenu.id,
        menuName: configuringMenu.name,
        basePrice: configuringMenu.price,
        quantity: configuringQuantity,
        note: configuringNote.trim(),
        options: chosenOptions,
        unitPrice,
        subtotal,
      };
      setItems((prev) => [...prev, newItem]);
    }

    // Close configuration dialog
    setConfiguringMenu(null);
    setConfiguringTargetItem(null);
    setOptionConfigError("");
  }

  // Submit edited order to server
  async function handleSaveChanges() {
    if (items.length === 0) {
      setErrorMessage(
        "ต้องมีรายการอาหารอย่างน้อย 1 รายการ หากต้องการยกเลิกทั้งออเดอร์ กรุณาใช้ปุ่มยกเลิกออเดอร์",
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const payload = {
        tableId,
        sessionToken,
        note: orderNote.trim(),
        items: items.map((item) => ({
          menuId: item.menuId,
          quantity: item.quantity,
          note: item.note || null,
          optionSelections: item.options.map((opt) => ({
            optionId: opt.optionId,
            quantity: opt.quantity,
          })),
        })),
      };

      const response = await fetch(`/api/orders/${order.id}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        setErrorMessage(
          result.details ||
            result.error ||
            "แก้ไขออเดอร์ไม่สำเร็จ กรุณาตรวจสอบสถานะแล้วลองใหม่",
        );
        // If status conflict (e.g. kitchen started cooking), refresh orders
        if (response.status === 409) {
          void onSuccess();
        }
        return;
      }

      await onSuccess();
      onClose();
    } catch {
      setErrorMessage("เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-order-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs sm:p-6"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-3xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 bg-zinc-50">
          <div>
            <span className="inline-block rounded-md bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-700">
              แก้ไขออเดอร์
            </span>
            <h2 id="edit-order-title" className="text-xl font-bold text-zinc-900 mt-0.5">
              ออเดอร์ {formatOrderNumber(order.order_number)}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-full p-2 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 transition"
            aria-label="ปิดหน้าต่าง"
          >
            ✕
          </button>
        </header>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Note prompt */}
          <div className="rounded-xl bg-orange-50/70 p-3.5 text-xs text-orange-800 border border-orange-200">
            💡 คุณสามารถเพิ่ม/ลดจำนวน ลบเมนู เพิ่มเมนูใหม่ หรือเปลี่ยนตัวเลือกเสริมได้ก่อนที่ครัวจะเริ่มปรุงอาหาร
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="rounded-xl bg-red-50 p-4 text-sm font-medium text-red-700 border border-red-200"
            >
              {errorMessage}
            </div>
          )}

          {/* Items List */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-zinc-800">
                รายการอาหาร ({items.length} รายการ)
              </h3>
              <button
                type="button"
                data-testid="add-menu-btn"
                onClick={() => {
                  setSearchFilter("");
                  setSelectedCategory("ทั้งหมด");
                  setShowMenuPicker(true);
                }}
                className="flex items-center gap-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white shadow-xs transition"
              >
                <span>＋</span>
                <span>เพิ่มเมนู</span>
              </button>
            </div>

            {items.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-zinc-200 p-8 text-center text-zinc-500">
                <p>ไม่มีรายการอาหารในออเดอร์</p>
                <p className="mt-1 text-xs text-zinc-400">
                  กรุณากดปุ่ม &ldquo;เพิ่มเมนู&rdquo; หรือกดยกเลิกหากต้องการยกเลิกออเดอร์นี้
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item) => (
                  <article
                    key={item.tempId}
                    className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xs hover:border-orange-200 transition"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <h4 className="font-bold text-zinc-900">{item.menuName}</h4>
                          <span className="text-xs text-zinc-500">
                            (จานละ {formatPrice(item.unitPrice)} บาท)
                          </span>
                        </div>

                        {/* Options summary */}
                        {item.options.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {item.options.map((opt, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center rounded-md bg-orange-50 px-2 py-0.5 text-xs text-orange-700 border border-orange-100"
                              >
                                {opt.optionName}
                                {opt.quantity > 1 ? ` × ${opt.quantity}` : ""}
                                {opt.additionalPrice > 0
                                  ? ` (+${formatPrice(opt.additionalPrice * opt.quantity)})`
                                  : ""}
                              </span>
                            ))}
                          </div>
                        )}

                        {item.note && (
                          <p className="mt-1 text-xs text-zinc-500 italic">
                            หมายเหตุ: {item.note}
                          </p>
                        )}

                        {/* Edit options trigger */}
                        <div className="mt-2">
                          <button
                            type="button"
                            data-testid="edit-item-options-btn"
                            onClick={() => openEditOptions(item)}
                            className="text-xs font-semibold text-orange-600 hover:text-orange-700 underline"
                          >
                            แก้ไขตัวเลือก / หมายเหตุ
                          </button>
                        </div>
                      </div>

                      {/* Delete button */}
                      <button
                        type="button"
                        onClick={() => removeItem(item.tempId)}
                        className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 transition"
                        title="ลบรายการนี้"
                        aria-label="ลบรายการ"
                      >
                        🗑️
                      </button>
                    </div>

                    {/* Quantity Stepper & Subtotal */}
                    <div className="mt-3 flex items-center justify-between border-t border-zinc-100 pt-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-500">จำนวน:</span>
                        <div className="flex items-center rounded-xl border border-zinc-300 bg-zinc-50">
                          <button
                            type="button"
                            onClick={() => updateItemQuantity(item.tempId, -1)}
                            className="px-3 py-1 font-bold text-zinc-700 hover:bg-zinc-200 transition rounded-l-xl text-sm"
                            aria-label="ลดจำนวน"
                          >
                            -
                          </button>
                          <span className="w-8 text-center text-sm font-semibold">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateItemQuantity(item.tempId, 1)}
                            className="px-3 py-1 font-bold text-zinc-700 hover:bg-zinc-200 transition rounded-r-xl text-sm"
                            aria-label="เพิ่มจำนวน"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-xs text-zinc-400">รวม </span>
                        <span className="font-bold text-orange-600">
                          {formatPrice(item.subtotal)}
                        </span>
                        <span className="text-xs text-zinc-500"> บาท</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* Order Note */}
          <section className="space-y-1.5">
            <label
              htmlFor="edit-order-note"
              className="block text-sm font-semibold text-zinc-800"
            >
              หมายเหตุสำหรับทั้งออเดอร์ (ถ้ามี)
            </label>
            <textarea
              id="edit-order-note"
              value={orderNote}
              onChange={(e) => setOrderNote(e.target.value)}
              placeholder="เช่น ขอช้อนส้อมเพิ่ม, เสิร์ฟพร้อมกันทุกจาน"
              rows={2}
              maxLength={500}
              className="w-full rounded-xl border border-zinc-300 p-3 text-sm focus:border-orange-500 focus:outline-hidden focus:ring-2 focus:ring-orange-200"
            />
          </section>

          {/* Price Summary Comparison */}
          <section className="rounded-2xl bg-zinc-900 p-4 text-white">
            <div className="flex items-center justify-between text-sm text-zinc-400">
              <span>ยอดรวมเดิม</span>
              <span>{formatPrice(order.total_amount)} บาท</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between border-t border-zinc-800 pt-2">
              <div className="flex items-baseline gap-2">
                <span className="font-bold text-white text-base">ยอดรวมใหม่</span>
                {priceDiff !== 0 && (
                  <span
                    className={`text-xs font-semibold ${
                      priceDiff > 0 ? "text-orange-400" : "text-green-400"
                    }`}
                  >
                    ({priceDiff > 0 ? `+${formatPrice(priceDiff)}` : `${formatPrice(priceDiff)}`} บาท)
                  </span>
                )}
              </div>
              <span className="text-2xl font-bold text-orange-400">
                {formatPrice(newTotalAmount)} บาท
              </span>
            </div>
          </section>
        </div>

        {/* Action Footer */}
        <footer className="flex items-center justify-end gap-3 border-t border-zinc-200 bg-zinc-50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-xl border border-zinc-300 px-5 py-2.5 font-semibold text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 transition"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            data-testid="save-order-changes-btn"
            onClick={() => void handleSaveChanges()}
            disabled={isSubmitting || items.length === 0}
            className="rounded-xl bg-orange-500 hover:bg-orange-600 px-6 py-2.5 font-bold text-white shadow-sm disabled:opacity-50 transition"
          >
            {isSubmitting ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
          </button>
        </footer>
      </div>

      {/* Submodal 1: Menu Picker Modal */}
      {showMenuPicker && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
        >
          <div className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-3xl bg-white shadow-2xl overflow-hidden">
            <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 bg-zinc-50">
              <div>
                <h3 className="text-lg font-bold text-zinc-900">เลือกเมนูอาหารเพื่อเพิ่ม</h3>
                <p className="text-xs text-zinc-500">เลือกอาหารที่ต้องการสั่งเพิ่มในออเดอร์นี้</p>
              </div>
              <button
                type="button"
                onClick={() => setShowMenuPicker(false)}
                className="rounded-full p-2 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 transition"
              >
                ✕
              </button>
            </header>

            {/* Search & Categories */}
            <div className="p-4 border-b border-zinc-100 space-y-3 bg-zinc-50/50">
              <input
                type="text"
                placeholder="ค้นหาชื่อเมนู..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 px-4 py-2 text-sm focus:border-orange-500 focus:outline-hidden"
              />
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`shrink-0 rounded-lg px-3 py-1 text-xs font-semibold transition ${
                      selectedCategory === cat
                        ? "bg-orange-500 text-white"
                        : "bg-zinc-200/80 text-zinc-700 hover:bg-zinc-300"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Menus List */}
            <div className="flex-1 overflow-y-auto p-4 divide-y divide-zinc-100">
              {filteredMenus.length === 0 ? (
                <div className="p-8 text-center text-zinc-500">
                  ไม่พบเมนูที่ตรงกับคำค้นหา
                </div>
              ) : (
                filteredMenus.map((menu) => (
                  <div
                    key={menu.id}
                    className="flex items-center justify-between py-3.5 first:pt-0 gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-zinc-900">{menu.name}</p>
                      {menu.description && (
                        <p className="text-xs text-zinc-500 line-clamp-1 mt-0.5">
                          {menu.description}
                        </p>
                      )}
                      <p className="mt-1 text-sm font-semibold text-orange-600">
                        {formatPrice(menu.price)} บาท
                      </p>
                    </div>
                    <button
                      type="button"
                      data-testid="select-menu-btn"
                      onClick={() => openAddNewMenu(menu)}
                      className="shrink-0 rounded-xl bg-orange-500 hover:bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-xs transition"
                    >
                      เลือก
                    </button>
                  </div>
                ))
              )}
            </div>

            <footer className="border-t border-zinc-200 px-6 py-3 bg-zinc-50 text-right">
              <button
                type="button"
                onClick={() => setShowMenuPicker(false)}
                className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
              >
                ปิด
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Submodal 2: Option Configurator Modal */}
      {configuringMenu && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-70 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
        >
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-3xl bg-white shadow-2xl overflow-hidden">
            <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 bg-zinc-50">
              <div>
                <h3 className="text-lg font-bold text-zinc-900">
                  {configuringTargetItem ? "แก้ไขตัวเลือก" : "เลือกตัวเลือก"} -{" "}
                  {configuringMenu.name}
                </h3>
                <p className="text-xs text-zinc-500">
                  ราคาเริ่มต้น {formatPrice(configuringMenu.price)} บาท
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setConfiguringMenu(null);
                  setConfiguringTargetItem(null);
                }}
                className="rounded-full p-2 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 transition"
              >
                ✕
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {optionConfigError && (
                <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700 border border-red-200">
                  {optionConfigError}
                </div>
              )}

              {/* Option Groups */}
              {configuringMenu.option_groups.length === 0 ? (
                <p className="text-sm text-zinc-500">ไม่มีตัวเลือกเสริมสำหรับเมนูนี้</p>
              ) : (
                configuringMenu.option_groups.map((group) => (
                  <fieldset
                    key={group.key}
                    className="rounded-2xl border border-zinc-200 p-4 space-y-2 bg-zinc-50/50"
                  >
                    <legend className="px-2 text-sm font-bold text-zinc-900">
                      {group.name}
                      {group.is_required && (
                        <span className="ml-1 text-xs font-semibold text-red-600">
                          (จำเป็น)
                        </span>
                      )}
                    </legend>

                    <div className="divide-y divide-zinc-200/60">
                      {group.options.map((option) => {
                        const currentQty = selectedOptionQuantities[option.id] ?? 0;
                        const isSingle = group.selection_type === "single";

                        return (
                          <div
                            key={option.id}
                            className="flex items-center justify-between py-2 first:pt-1 last:pb-1"
                          >
                            <label className="flex items-center gap-3 cursor-pointer flex-1">
                              {isSingle ? (
                                <input
                                  type="radio"
                                  name={`group-${group.key}`}
                                  checked={currentQty === 1}
                                  onChange={() => {
                                    // Reset other options in the single group
                                    const next = { ...selectedOptionQuantities };
                                    group.options.forEach((o) => {
                                      delete next[o.id];
                                    });
                                    next[option.id] = 1;
                                    setSelectedOptionQuantities(next);
                                  }}
                                  className="h-4 w-4 text-orange-500 focus:ring-orange-400"
                                />
                              ) : (
                                <input
                                  type="checkbox"
                                  checked={currentQty > 0}
                                  onChange={(e) => {
                                    setSelectedOptionQuantities((prev) => ({
                                      ...prev,
                                      [option.id]: e.target.checked ? 1 : 0,
                                    }));
                                  }}
                                  className="h-4 w-4 rounded-sm text-orange-500 focus:ring-orange-400"
                                />
                              )}
                              <span className="text-sm font-medium text-zinc-800">
                                {option.name}
                              </span>
                            </label>

                            <div className="flex items-center gap-3">
                              {option.additional_price > 0 && (
                                <span className="text-xs text-orange-600 font-semibold">
                                  +{formatPrice(option.additional_price)} บ.
                                </span>
                              )}

                              {/* Multi-quantity for non-single options */}
                              {!isSingle && option.max_quantity > 1 && currentQty > 0 && (
                                <div className="flex items-center rounded-lg border border-zinc-300 bg-white">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSelectedOptionQuantities((prev) => ({
                                        ...prev,
                                        [option.id]: Math.max(0, currentQty - 1),
                                      }))
                                    }
                                    className="px-2 py-0.5 text-xs font-bold text-zinc-600 hover:bg-zinc-100"
                                  >
                                    -
                                  </button>
                                  <span className="w-5 text-center text-xs font-semibold">
                                    {currentQty}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSelectedOptionQuantities((prev) => ({
                                        ...prev,
                                        [option.id]: Math.min(
                                          option.max_quantity,
                                          currentQty + 1,
                                        ),
                                      }))
                                    }
                                    className="px-2 py-0.5 text-xs font-bold text-zinc-600 hover:bg-zinc-100"
                                  >
                                    +
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </fieldset>
                ))
              )}

              {/* Special item note */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  หมายเหตุสำหรับจานนี้
                </label>
                <input
                  type="text"
                  placeholder="เช่น ไม่ใส่ผัก, เผ็ดน้อยมาก"
                  value={configuringNote}
                  onChange={(e) => setConfiguringNote(e.target.value)}
                  maxLength={200}
                  className="w-full rounded-xl border border-zinc-300 p-2.5 text-sm focus:border-orange-500 focus:outline-hidden"
                />
              </div>

              {/* Quantity Stepper */}
              <div className="flex items-center justify-between border-t border-zinc-200 pt-4">
                <span className="text-sm font-bold text-zinc-800">จำนวนจาน:</span>
                <div className="flex items-center rounded-xl border border-zinc-300 bg-zinc-50">
                  <button
                    type="button"
                    onClick={() => setConfiguringQuantity((q) => Math.max(1, q - 1))}
                    className="px-3 py-1 font-bold text-zinc-700 hover:bg-zinc-200 rounded-l-xl"
                  >
                    -
                  </button>
                  <span className="w-8 text-center text-sm font-semibold">
                    {configuringQuantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setConfiguringQuantity((q) => q + 1)}
                    className="px-3 py-1 font-bold text-zinc-700 hover:bg-zinc-200 rounded-r-xl"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <footer className="flex items-center justify-between border-t border-zinc-200 px-6 py-4 bg-zinc-50">
              <button
                type="button"
                onClick={() => {
                  setConfiguringMenu(null);
                  setConfiguringTargetItem(null);
                }}
                className="rounded-xl border border-zinc-300 px-4 py-2 font-semibold text-zinc-700 hover:bg-zinc-100 text-sm"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                data-testid="confirm-options-btn"
                onClick={saveConfiguredItem}
                className="rounded-xl bg-orange-500 hover:bg-orange-600 px-5 py-2 font-bold text-white shadow-xs text-sm"
              >
                {configuringTargetItem ? "บันทึกตัวเลือก" : "เพิ่มลงในออเดอร์"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
