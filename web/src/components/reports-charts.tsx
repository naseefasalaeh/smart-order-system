type Day = { date: string; label: string; sales: number; orders: number };
type Menu = { name: string; quantity: number };
type Segment = { label: string; count: number; amount?: number; color: string };

const money = (value: number) => `฿${value.toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;

function DailyBars({ days, metric }: { days: Day[]; metric: "sales" | "orders" }) {
  const maximum = Math.max(0, ...days.map((day) => day[metric]));
  const scale = Math.max(1, maximum);
  const sales = metric === "sales";
  return <div className="overflow-x-auto pb-3">
    <div className="flex min-w-max gap-2">
      <div className="flex w-16 shrink-0 flex-col justify-between pb-6 text-right text-xs text-zinc-500">
        <span>{sales ? money(maximum) : `${maximum} รายการ`}</span><span>0</span>
      </div>
      <div className="flex gap-1 border-b border-zinc-200">
        {days.map((day) => <div key={day.date} className="flex w-8 shrink-0 flex-col items-center gap-2">
          <div className="flex h-40 w-full items-end justify-center">
            <div role="img" aria-label={`${day.date}: ${sales ? money(day.sales) : `${day.orders} ออเดอร์`}`}
              title={`${day.date} · ${sales ? money(day.sales) : `${day.orders} ออเดอร์`}`}
              className={`w-5 rounded-t-sm ${sales ? "bg-orange-500" : "bg-zinc-800"}`}
              style={{ height: `${day[metric] === 0 ? 2 : Math.max(5, day[metric] / scale * 100)}%` }} />
          </div>
          <span className="text-xs text-zinc-500">{day.label}</span>
        </div>)}
      </div>
    </div>
  </div>;
}

function Donut({ segments, total, label }: { segments: Segment[]; total: number; label: string }) {
  if (!total) return <p className="mt-6 rounded-xl border border-dashed border-zinc-300 p-8 text-center text-zinc-500">ยังไม่มีข้อมูล{label}</p>;
  const stops = segments.reduce<{ end: number; values: string[] }>((current, segment) => {
    const end = current.end + segment.count / total * 100;
    return { end, values: [...current.values, `${segment.color} ${current.end}% ${end}%`] };
  }, { end: 0, values: [] }).values;
  return <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row">
    <div role="img" aria-label={`${label}: ${segments.map((item) => `${item.label} ${item.count} รายการ`).join(", ")}`}
      title={segments.map((item) => `${item.label}: ${item.count} รายการ`).join(" · ")}
      className="relative h-40 w-40 shrink-0 rounded-full" style={{ background: `conic-gradient(${stops.join(", ")})` }}>
      <div className="absolute inset-7 flex items-center justify-center rounded-full bg-white text-center font-bold text-zinc-900">{total}<span className="ml-1 text-xs font-normal">รายการ</span></div>
    </div>
    <ul className="w-full min-w-0 space-y-3">
      {segments.map((segment) => <li key={segment.label} title={`${segment.label}: ${segment.count} รายการ${segment.amount === undefined ? "" : ` · ${money(segment.amount)}`}`}
        className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-2 text-sm">
        <span className="flex min-w-0 items-center gap-2"><span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} />{segment.label}</span>
        <span className="font-semibold">{segment.count} · {(segment.count / total * 100).toFixed(0)}%{segment.amount === undefined ? "" : ` · ${money(segment.amount)}`}</span>
      </li>)}
    </ul>
  </div>;
}

export default function ReportsCharts({ days, menus, payments, dining }: {
  days: Day[]; menus: Menu[]; payments: Segment[]; dining: Segment[];
}) {
  const paymentTotal = payments.reduce((sum, item) => sum + item.count, 0);
  const diningTotal = dining.reduce((sum, item) => sum + item.count, 0);
  const best = menus.slice(0, 5);
  const menuMax = Math.max(1, ...best.map((menu) => menu.quantity));
  return <section aria-labelledby="reports-charts-title" className="mt-6 space-y-6">
    <h3 id="reports-charts-title" className="text-xl font-bold text-zinc-900">ภาพรวมแบบกราฟ</h3>
    <article className="min-w-0 rounded-2xl bg-white p-5 shadow-sm sm:p-6">
      <h4 className="font-bold text-zinc-900">ยอดขายรายวัน</h4>
      <p className="mb-5 text-sm text-zinc-500">เฉพาะออเดอร์ที่ชำระเงินสำเร็จ · บาท · เขตเวลาไทย</p>
      <DailyBars days={days} metric="sales" />
    </article>
    <article className="min-w-0 rounded-2xl bg-white p-5 shadow-sm sm:p-6">
      <h4 className="font-bold text-zinc-900">จำนวนออเดอร์ที่ชำระแล้วรายวัน</h4>
      <p className="mb-5 text-sm text-zinc-500">ไม่นับออเดอร์ที่ยกเลิกหรือยังไม่ชำระ</p>
      <DailyBars days={days} metric="orders" />
    </article>
    <div className="grid gap-6 xl:grid-cols-2">
      <article className="min-w-0 rounded-2xl bg-white p-5 shadow-sm sm:p-6">
        <h4 className="font-bold text-zinc-900">เมนูขายดี 5 อันดับ</h4>
        {best.length === 0 ? <p className="mt-6 rounded-xl border border-dashed border-zinc-300 p-8 text-center text-zinc-500">ยังไม่มีข้อมูลเมนูที่ขาย</p>
          : <ol className="mt-6 space-y-4">{best.map((menu, index) => <li key={menu.name} title={`${menu.name}: ${menu.quantity} รายการ`}>
            <div className="mb-1 flex min-w-0 justify-between gap-3 text-sm"><span className="min-w-0 break-words font-medium">{index + 1}. {menu.name}</span><span className="shrink-0 font-bold">{menu.quantity} รายการ</span></div>
            <div className="h-3 overflow-hidden rounded-full bg-orange-100"><div className="h-full rounded-full bg-orange-500" style={{ width: `${menu.quantity / menuMax * 100}%` }} /></div>
          </li>)}</ol>}
      </article>
      <article className="min-w-0 rounded-2xl bg-white p-5 shadow-sm sm:p-6">
        <h4 className="font-bold text-zinc-900">ช่องทางการชำระเงิน</h4>
        <Donut segments={payments} total={paymentTotal} label="การชำระเงิน" />
      </article>
    </div>
    <article className="min-w-0 rounded-2xl bg-white p-5 shadow-sm sm:p-6">
      <h4 className="font-bold text-zinc-900">ประเภทการรับอาหาร</h4>
      <p className="mt-1 text-sm text-zinc-500">จำนวนออเดอร์ทุกสถานะที่สั่งในเดือนที่เลือก</p>
      <Donut segments={dining} total={diningTotal} label="ประเภทการรับอาหาร" />
    </article>
  </section>;
}
