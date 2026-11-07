type Day = { date: string; label: string; sales: number; orders: number };
type Menu = { name: string; quantity: number };
type Segment = { label: string; count: number; amount?: number; color: string };

const money = (value: number) => `฿${value.toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;

function DailyBars({ days, metric }: { days: Day[]; metric: "sales" | "orders" }) {
  if (days.length === 0) return <p className="mt-4 rounded-xl border border-dashed border-zinc-300 p-8 text-center text-zinc-500">ยังไม่มีข้อมูล</p>;
  const sales = metric === "sales";
  const maximum = Math.max(0, ...days.map((day) => day[metric]));
  const scale = Math.max(1, maximum);
  const left = 60, right = 784, top = 18, bottom = 222;
  const x = (index: number) => days.length < 2 ? (left + right) / 2 : left + index * (right - left) / (days.length - 1);
  const y = (value: number) => bottom - value / scale * (bottom - top);
  const line = days.map((day, index) => `${x(index)},${y(day[metric])}`).join(" ");
  const area = `${left},${bottom} ${line} ${right},${bottom}`;
  const labelStep = Math.max(1, Math.ceil(days.length / 10));
  const description = days.map(day => `${day.date}: ${sales ? money(day.sales) : `${day.orders} ออเดอร์`}`).join("; ");
  return <div className="mt-4 overflow-x-auto rounded-xl bg-zinc-50 p-2 sm:p-4">
    <svg viewBox="0 0 800 270" role="img" aria-label={`${sales ? "ยอดขายรายวัน" : "จำนวนออเดอร์รายวัน"}. ${description}`} className="h-auto min-w-[620px] w-full">
      <defs>
        <linearGradient id={sales ? "sales-area" : "orders-area"} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={sales ? "#f97316" : "#52525b"} stopOpacity=".24" /><stop offset="100%" stopColor={sales ? "#f97316" : "#52525b"} stopOpacity=".02" /></linearGradient>
        <linearGradient id={sales ? "sales-stroke" : "orders-stroke"}><stop stopColor={sales ? "#fb923c" : "#71717a"} /><stop offset="1" stopColor={sales ? "#c2410c" : "#27272a"} /></linearGradient>
      </defs>
      {[1, .75, .5, .25, 0].map(fraction => {
        const yy = bottom - fraction * (bottom - top);
        const value = maximum * fraction;
        const tick = maximum === 0 ? (fraction === 0 ? "0" : "") : (sales && value >= 1000 ? `${(value / 1000).toLocaleString("th-TH", { maximumFractionDigits: 1 })}k` : Math.round(value).toLocaleString("th-TH"));
        return <g key={fraction}><line x1={left} x2={right} y1={yy} y2={yy} stroke="#e4e4e7" strokeDasharray={fraction ? "3 5" : undefined} />{tick && <text x={left - 10} y={yy + 4} textAnchor="end" fill="#71717a" fontSize="11">{tick}</text>}</g>;
      })}
      {sales ? <>
        <polygon points={area} fill="url(#sales-area)" />
        <polyline points={line} fill="none" stroke="url(#sales-stroke)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {days.map((day, index) => <circle key={day.date} cx={x(index)} cy={y(day.sales)} r="4" fill="white" stroke="#c2410c" strokeWidth="2" />)}
      </> : days.map((day, index) => {
        const width = Math.max(4, Math.min(14, (right - left) / days.length * .56));
        const yy = y(day.orders);
        const height = Math.max(2, bottom - yy);
        return <rect key={day.date} x={x(index) - width / 2} y={bottom - height} width={width} height={height} rx={Math.min(width / 2, height / 2)} fill="url(#orders-stroke)" />;
      })}
      {days.map((day, index) => {
        const isLast = index === days.length - 1;
        const tooCloseToLast = (days.length - 1 - index) < Math.ceil(labelStep / 2);
        const shouldShow = (index % labelStep === 0 && !tooCloseToLast) || isLast;
        return shouldShow ? <text key={day.date} x={x(index)} y="250" textAnchor="middle" fill="#71717a" fontSize="11">{day.label}</text> : null;
      })}
    </svg>
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
      className="relative h-44 w-44 shrink-0 rounded-full p-3 shadow-inner" style={{ background: `conic-gradient(${stops.join(", ")})` }}>
      <div className="flex h-full w-full flex-col items-center justify-center rounded-full border border-zinc-100 bg-white text-center shadow-sm"><span className="text-3xl font-bold tracking-tight text-zinc-900">{total.toLocaleString("th-TH")}</span><span className="mt-0.5 text-xs text-zinc-500">{label}</span></div>
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
    <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-700">Performance</p><h3 id="reports-charts-title" className="mt-1 text-xl font-bold text-zinc-900">ภาพรวมแบบกราฟ</h3></div>
    <article className="min-w-0 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm sm:p-6">
      <h4 className="font-bold text-zinc-900">ยอดขายรายวัน</h4>
      <p className="mt-1 text-sm text-zinc-500">เฉพาะออเดอร์ที่ชำระเงินสำเร็จ · บาท · เขตเวลาไทย</p>
      <DailyBars days={days} metric="sales" />
    </article>
    <article className="min-w-0 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm sm:p-6">
      <h4 className="font-bold text-zinc-900">จำนวนออเดอร์ที่ชำระแล้วรายวัน</h4>
      <p className="mt-1 text-sm text-zinc-500">ไม่นับออเดอร์ที่ยกเลิกหรือยังไม่ชำระ</p>
      <DailyBars days={days} metric="orders" />
    </article>
    <div className="grid gap-6 xl:grid-cols-2">
      <article className="min-w-0 rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm sm:p-6">
        <h4 className="font-bold text-zinc-900">เมนูขายดี 5 อันดับ</h4>
        {best.length === 0 ? <p className="mt-6 rounded-xl border border-dashed border-zinc-300 p-8 text-center text-zinc-500">ยังไม่มีข้อมูลเมนูที่ขาย</p>
          : <ol className="mt-6 space-y-4">{best.map((menu, index) => <li key={menu.name} title={`${menu.name}: ${menu.quantity} รายการ`}>
            <div className="mb-1 flex min-w-0 justify-between gap-3 text-sm"><span className="min-w-0 break-words font-medium">{index + 1}. {menu.name}</span><span className="shrink-0 font-bold">{menu.quantity} รายการ</span></div>
            <div className="h-3 overflow-hidden rounded-full bg-orange-100"><div className="h-full rounded-full bg-orange-500" style={{ width: `${menu.quantity / menuMax * 100}%` }} /></div>
          </li>)}</ol>}
      </article>
      <article className="min-w-0 rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm sm:p-6">
        <h4 className="font-bold text-zinc-900">ช่องทางการชำระเงิน</h4>
        <Donut segments={payments} total={paymentTotal} label="การชำระเงิน" />
      </article>
    </div>
    <article className="min-w-0 rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm sm:p-6">
      <h4 className="font-bold text-zinc-900">ประเภทการรับอาหาร</h4>
      <p className="mt-1 text-sm text-zinc-500">จำนวนออเดอร์ทุกสถานะที่สั่งในเดือนที่เลือก</p>
      <Donut segments={dining} total={diningTotal} label="ประเภทการรับอาหาร" />
    </article>
  </section>;
}
