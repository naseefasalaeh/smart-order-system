export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-orange-50 px-6">
      <section className="w-full max-w-4xl rounded-3xl bg-white p-10 text-center shadow-lg">
        <p className="mb-3 font-semibold text-orange-500">
          SMART RESTAURANT SYSTEM
        </p>

        <h1 className="text-4xl font-bold text-zinc-900 sm:text-5xl">
          Smart Order
        </h1>

        <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-zinc-600">
          ระบบสั่งอาหารผ่าน QR Code ช่วยจัดการออเดอร์ คิวครัว
          วัตถุดิบ และติดตามสถานะอาหารแบบ Real-time
        </p>

        <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
          <button className="rounded-xl bg-orange-500 px-7 py-3 font-semibold text-white transition hover:bg-orange-600">
            เริ่มสั่งอาหาร
          </button>

          <button className="rounded-xl border border-orange-500 px-7 py-3 font-semibold text-orange-500 transition hover:bg-orange-50">
            เข้าสู่ระบบพนักงาน
          </button>
        </div>
      </section>
    </main>
  );
}