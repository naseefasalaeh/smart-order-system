"use client";

import { useMemo, useState } from "react";

type MenuOption = {
  id: number;
  name: string;
  additional_price: number;
};

type Menu = {
  id: number;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  can_order: boolean;
  options: MenuOption[];
};

type MenuClientProps = {
  menus: Menu[];
  tableId: string;
  tableNumber: number;
};

type CartItem = {
  cartId: string;
  menuId: number;
  menuName: string;
  basePrice: number;
  quantity: number;
  note: string | null;
  optionIds: number[];
  selectedOptions: MenuOption[];
  unitPrice: number;
};

const spiceLevels = [
  "ไม่เผ็ด",
  "เผ็ดน้อย",
  "เผ็ดปกติ",
  "เผ็ดมาก",
];

function formatPrice(price: number) {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(price);
}

function createCartId() {
  return `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export default function MenuClient({
  menus,
  tableId,
  tableNumber,
}: MenuClientProps) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedMenu, setSelectedMenu] =
    useState<Menu | null>(null);

  const [selectedSpice, setSelectedSpice] =
    useState("เผ็ดปกติ");

  const [selectedOptionId, setSelectedOptionId] =
    useState<number | null>(null);

  const [quantity, setQuantity] = useState(1);
  const [orderNote, setOrderNote] = useState("");
  const [showCart, setShowCart] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const cartQuantity = useMemo(
    () =>
      cart.reduce(
        (total, item) => total + item.quantity,
        0
      ),
    [cart]
  );

  const totalAmount = useMemo(
    () =>
      cart.reduce(
        (total, item) =>
          total + item.unitPrice * item.quantity,
        0
      ),
    [cart]
  );

  const selectedOption = useMemo(() => {
    if (!selectedMenu || selectedOptionId === null) {
      return null;
    }

    return (
      selectedMenu.options.find(
        (option) => option.id === selectedOptionId
      ) ?? null
    );
  }, [selectedMenu, selectedOptionId]);

  const selectedUnitPrice =
    (selectedMenu?.price ?? 0) +
    (selectedOption?.additional_price ?? 0);

  function openMenuOptions(menu: Menu) {
    if (!menu.can_order) {
      return;
    }

    setSelectedMenu(menu);
    setSelectedSpice("เผ็ดปกติ");
    setSelectedOptionId(null);
    setQuantity(1);
    setErrorMessage("");
    setSuccessMessage("");
  }

  function closeMenuOptions() {
    setSelectedMenu(null);
    setSelectedOptionId(null);
    setQuantity(1);
  }

  function addToCart() {
    if (!selectedMenu) {
      return;
    }

    const options = selectedOption
      ? [selectedOption]
      : [];

    const newItem: CartItem = {
      cartId: createCartId(),
      menuId: selectedMenu.id,
      menuName: selectedMenu.name,
      basePrice: selectedMenu.price,
      quantity,
      note: selectedSpice,
      optionIds: options.map((option) => option.id),
      selectedOptions: options,
      unitPrice: selectedUnitPrice,
    };

    setCart((currentCart) => [
      ...currentCart,
      newItem,
    ]);

    closeMenuOptions();
    setSuccessMessage("เพิ่มเมนูลงตะกร้าแล้ว");
    setErrorMessage("");

    window.setTimeout(() => {
      setSuccessMessage("");
    }, 2500);
  }

  function increaseCartQuantity(cartId: string) {
    setCart((currentCart) =>
      currentCart.map((item) =>
        item.cartId === cartId
          ? {
              ...item,
              quantity: item.quantity + 1,
            }
          : item
      )
    );
  }

  function decreaseCartQuantity(cartId: string) {
    setCart((currentCart) =>
      currentCart.flatMap((item) => {
        if (item.cartId !== cartId) {
          return [item];
        }

        if (item.quantity <= 1) {
          return [];
        }

        return [
          {
            ...item,
            quantity: item.quantity - 1,
          },
        ];
      })
    );
  }

  function removeCartItem(cartId: string) {
    setCart((currentCart) =>
      currentCart.filter(
        (item) => item.cartId !== cartId
      )
    );
  }

  async function submitOrder() {
    if (cart.length === 0 || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tableId,
          note: orderNote.trim() || undefined,
          items: cart.map((item) => ({
            menuId: item.menuId,
            quantity: item.quantity,
            note: item.note ?? undefined,
            optionIds: item.optionIds,
          })),
        }),
      });

      const result = (await response.json()) as {
        message?: string;
        error?: string;
        details?: string;
        order?: {
          id: number;
          order_number?: string | null;
        };
      };

      if (!response.ok) {
        const message = [
          result.error,
          result.details,
        ]
          .filter(Boolean)
          .join(": ");

        throw new Error(
          message || "ไม่สามารถส่งออเดอร์ได้"
        );
      }

      const orderNumber =
        result.order?.order_number ??
        result.order?.id ??
        "";

      setCart([]);
      setOrderNote("");
      setShowCart(false);

      setSuccessMessage(
        orderNumber
          ? `สั่งอาหารสำเร็จ เลขที่ออเดอร์ ${orderNumber}`
          : "สั่งอาหารสำเร็จ"
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "เกิดข้อผิดพลาดในการส่งออเดอร์"
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      {successMessage && (
        <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-700">
          {successMessage}
        </div>
      )}

      {errorMessage && (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {errorMessage}
        </div>
      )}

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {menus.map((menu) => (
          <article
            key={menu.id}
            className="overflow-hidden rounded-2xl bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-md"
          >
            <div className="relative h-48 bg-zinc-200">
              {menu.image_url ? (
                <img
                  src={menu.image_url}
                  alt={menu.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-zinc-400">
                  ไม่มีรูปภาพ
                </div>
              )}

              {!menu.can_order && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                  <span className="rounded-full bg-red-500 px-4 py-2 text-sm font-bold text-white">
                    วัตถุดิบไม่เพียงพอ
                  </span>
                </div>
              )}
            </div>

            <div className="p-5">
              <h3 className="text-xl font-bold text-zinc-900">
                {menu.name}
              </h3>

              <p className="mt-2 min-h-10 text-sm text-zinc-500">
                {menu.description ||
                  "ไม่มีรายละเอียดเพิ่มเติม"}
              </p>

              {menu.options.length > 0 && (
                <p className="mt-2 text-xs text-orange-600">
                  สามารถเลือกเพิ่มไข่ได้
                </p>
              )}

              <div className="mt-5 flex items-center justify-between gap-3">
                <p className="text-xl font-bold text-orange-500">
                  {formatPrice(menu.price)} บาท
                </p>

                <button
                  type="button"
                  disabled={!menu.can_order}
                  onClick={() => openMenuOptions(menu)}
                  className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-500 disabled:cursor-not-allowed disabled:bg-zinc-300"
                >
                  {menu.can_order
                    ? "เพิ่ม"
                    : "สั่งไม่ได้"}
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white/95 px-5 py-4 shadow-[0_-5px_20px_rgba(0,0,0,0.08)] backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
            <div>
              <p className="text-sm text-zinc-500">
                {cartQuantity} รายการ
              </p>

              <p className="text-xl font-bold text-zinc-900">
                รวม {formatPrice(totalAmount)} บาท
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setShowCart(true);
                setErrorMessage("");
              }}
              className="rounded-xl bg-orange-500 px-6 py-3 font-bold text-white transition hover:bg-orange-600"
            >
              ดูตะกร้า
            </button>
          </div>
        </div>
      )}

      {selectedMenu && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-5">
          <button
            type="button"
            aria-label="ปิดหน้าต่าง"
            onClick={closeMenuOptions}
            className="absolute inset-0"
          />

          <div className="relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-white p-6 shadow-xl sm:max-w-lg sm:rounded-3xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-orange-500">
                  เลือกรายละเอียด
                </p>

                <h2 className="mt-1 text-2xl font-bold text-zinc-900">
                  {selectedMenu.name}
                </h2>

                <p className="mt-1 text-sm text-zinc-500">
                  ราคาเริ่มต้น{" "}
                  {formatPrice(selectedMenu.price)} บาท
                </p>
              </div>

              <button
                type="button"
                onClick={closeMenuOptions}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-xl text-zinc-600"
              >
                ×
              </button>
            </div>

            <div className="mt-7">
              <p className="font-bold text-zinc-900">
                ระดับความเผ็ด
              </p>

              <div className="mt-3 grid grid-cols-2 gap-3">
                {spiceLevels.map((spice) => (
                  <button
                    key={spice}
                    type="button"
                    onClick={() =>
                      setSelectedSpice(spice)
                    }
                    className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                      selectedSpice === spice
                        ? "border-orange-500 bg-orange-50 text-orange-600"
                        : "border-zinc-200 text-zinc-700 hover:border-orange-300"
                    }`}
                  >
                    {spice}
                  </button>
                ))}
              </div>
            </div>

            {selectedMenu.options.length > 0 && (
              <div className="mt-7">
                <p className="font-bold text-zinc-900">
                  ตัวเลือกเพิ่มเติม
                </p>

                <p className="mt-1 text-xs text-zinc-500">
                  เลือกได้ 1 รายการ
                </p>

                <div className="mt-3 space-y-3">
                  <label className="flex cursor-pointer items-center justify-between rounded-xl border border-zinc-200 p-4">
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="menu-option"
                        checked={
                          selectedOptionId === null
                        }
                        onChange={() =>
                          setSelectedOptionId(null)
                        }
                        className="h-4 w-4 accent-orange-500"
                      />

                      <span className="font-medium text-zinc-700">
                        ไม่เพิ่ม
                      </span>
                    </div>

                    <span className="text-sm text-zinc-500">
                      0 บาท
                    </span>
                  </label>

                  {selectedMenu.options.map((option) => (
                    <label
                      key={option.id}
                      className="flex cursor-pointer items-center justify-between rounded-xl border border-zinc-200 p-4"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="menu-option"
                          checked={
                            selectedOptionId ===
                            option.id
                          }
                          onChange={() =>
                            setSelectedOptionId(
                              option.id
                            )
                          }
                          className="h-4 w-4 accent-orange-500"
                        />

                        <span className="font-medium text-zinc-700">
                          {option.name}
                        </span>
                      </div>

                      <span className="text-sm font-semibold text-orange-500">
                        +
                        {formatPrice(
                          option.additional_price
                        )}{" "}
                        บาท
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-7">
              <p className="font-bold text-zinc-900">
                จำนวน
              </p>

              <div className="mt-3 flex w-fit items-center overflow-hidden rounded-xl border border-zinc-200">
                <button
                  type="button"
                  onClick={() =>
                    setQuantity((current) =>
                      Math.max(1, current - 1)
                    )
                  }
                  className="h-11 w-12 text-xl font-bold text-zinc-600 hover:bg-zinc-100"
                >
                  −
                </button>

                <span className="flex h-11 min-w-12 items-center justify-center border-x border-zinc-200 font-bold">
                  {quantity}
                </span>

                <button
                  type="button"
                  onClick={() =>
                    setQuantity((current) =>
                      Math.min(99, current + 1)
                    )
                  }
                  className="h-11 w-12 text-xl font-bold text-zinc-600 hover:bg-zinc-100"
                >
                  +
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={addToCart}
              className="mt-8 w-full rounded-xl bg-orange-500 px-5 py-4 font-bold text-white transition hover:bg-orange-600"
            >
              เพิ่มลงตะกร้า ·{" "}
              {formatPrice(
                selectedUnitPrice * quantity
              )}{" "}
              บาท
            </button>
          </div>
        </div>
      )}

      {showCart && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-5">
          <button
            type="button"
            aria-label="ปิดตะกร้า"
            onClick={() => setShowCart(false)}
            className="absolute inset-0"
          />

          <div className="relative z-10 flex max-h-[90vh] w-full flex-col rounded-t-3xl bg-white shadow-xl sm:max-w-2xl sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-zinc-200 p-6">
              <div>
                <h2 className="text-2xl font-bold text-zinc-900">
                  ตะกร้าอาหาร
                </h2>

                <p className="mt-1 text-sm text-zinc-500">
                  โต๊ะหมายเลข {tableNumber}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowCart(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-xl text-zinc-600"
              >
                ×
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-6">
              {cart.length === 0 ? (
                <div className="py-12 text-center text-zinc-500">
                  ยังไม่มีรายการในตะกร้า
                </div>
              ) : (
                cart.map((item) => (
                  <div
                    key={item.cartId}
                    className="rounded-2xl border border-zinc-200 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-bold text-zinc-900">
                          {item.menuName}
                        </h3>

                        {item.selectedOptions.length >
                          0 && (
                          <p className="mt-1 text-sm text-orange-600">
                            {item.selectedOptions
                              .map(
                                (option) =>
                                  `${option.name} +${formatPrice(
                                    option.additional_price
                                  )} บาท`
                              )
                              .join(", ")}
                          </p>
                        )}

                        {item.note && (
                          <p className="mt-1 text-sm text-zinc-500">
                            ระดับความเผ็ด: {item.note}
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          removeCartItem(item.cartId)
                        }
                        className="text-sm font-semibold text-red-500"
                      >
                        ลบ
                      </button>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-4">
                      <div className="flex items-center overflow-hidden rounded-lg border border-zinc-200">
                        <button
                          type="button"
                          onClick={() =>
                            decreaseCartQuantity(
                              item.cartId
                            )
                          }
                          className="h-9 w-10 text-lg hover:bg-zinc-100"
                        >
                          −
                        </button>

                        <span className="flex h-9 min-w-10 items-center justify-center border-x border-zinc-200 text-sm font-bold">
                          {item.quantity}
                        </span>

                        <button
                          type="button"
                          onClick={() =>
                            increaseCartQuantity(
                              item.cartId
                            )
                          }
                          className="h-9 w-10 text-lg hover:bg-zinc-100"
                        >
                          +
                        </button>
                      </div>

                      <p className="font-bold text-orange-500">
                        {formatPrice(
                          item.unitPrice *
                            item.quantity
                        )}{" "}
                        บาท
                      </p>
                    </div>
                  </div>
                ))
              )}

              {cart.length > 0 && (
                <div>
                  <label
                    htmlFor="order-note"
                    className="font-bold text-zinc-900"
                  >
                    หมายเหตุเพิ่มเติมทั้งออเดอร์
                  </label>

                  <textarea
                    id="order-note"
                    value={orderNote}
                    onChange={(event) =>
                      setOrderNote(
                        event.target.value.slice(0, 500)
                      )
                    }
                    rows={3}
                    placeholder="เช่น ขอช้อนเพิ่ม หรือรายละเอียดอื่น ๆ"
                    className="mt-3 w-full resize-none rounded-xl border border-zinc-200 p-4 text-sm outline-none transition focus:border-orange-500"
                  />
                </div>
              )}

              {errorMessage && (
                <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
                  {errorMessage}
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="border-t border-zinc-200 p-6">
                <div className="mb-4 flex items-center justify-between">
                  <span className="font-semibold text-zinc-600">
                    ยอดรวมทั้งหมด
                  </span>

                  <span className="text-2xl font-bold text-orange-500">
                    {formatPrice(totalAmount)} บาท
                  </span>
                </div>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={submitOrder}
                  className="w-full rounded-xl bg-orange-500 px-5 py-4 font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-zinc-300"
                >
                  {isSubmitting
                    ? "กำลังส่งออเดอร์..."
                    : "ยืนยันการสั่งอาหาร"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}