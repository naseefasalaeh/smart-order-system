import assert from 'node:assert/strict';

export async function checkPendingPayments({ page, context, mock, emit, dir }) {
  mock.state.role = 'staff';
  const makeOrder = (number, session) => ({
    id: `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`,
    session_id: session, order_number: number, status: 'served', dining_type: 'dine_in', total_amount: 121,
    created_at: '2026-10-05T01:00:00Z', served_at: '2026-10-05T01:10:00Z', restaurant_tables: { table_number: '7' },
    order_items: [{ id: number, quantity: 2, unit_price: 60.5, completed_plates: [1,2], served_plates: [1,2], menu_name_snapshot: 'อาหารทดสอบ', order_item_options: [{ id: number, option_name: 'ไข่ดาว', quantity: 1 }], payment_allocations: [] }],
  });
  for (const width of [1440,375]) {
    const first=makeOrder(11,'current-session'),second=makeOrder(12,'current-session'),previous=makeOrder(13,'previous-session');
    mock.state.catalog.orders=[first,second,first,previous];
    await page.setViewportSize({width,height:900});
    await page.goto('http://localhost:4400/dashboard/payments');
    const groups=page.locator('section.rounded-2xl').filter({has:page.locator('input[type=number]')});
    await groups.first().waitFor();
    assert.equal(await groups.count(),2,'same table, different sessions stay separate');
    const current=groups.first();
    assert.equal(await current.locator('input[type=number]').count(),2,'duplicate order removed');
    await current.locator('input[type=number]').first().fill('1');
    assert.match(await current.innerText(),/60\.50/);
    assert.match(await current.innerText(),/181\.50/);
    mock.state.failWrite=true;
    await current.getByRole('button',{name:'รับเงินสดแล้ว',exact:true}).click();
    await current.getByRole('button',{name:'ลองรายการเดิม / ยืนยันผล',exact:true}).waitFor();
    const failedRequest=JSON.parse(await page.evaluate(()=>sessionStorage.getItem('smart-order-payment:current-session')));
    await page.reload();
    await current.getByRole('button',{name:'ลองรายการเดิม / ยืนยันผล',exact:true}).waitFor();
    mock.state.failWrite=false;
    await current.getByRole('button',{name:'ลองรายการเดิม / ยืนยันผล',exact:true}).click({trial:true});
    const before=mock.state.rpcCalls.length;
    await current.getByRole('button',{name:'ลองรายการเดิม / ยืนยันผล',exact:true}).evaluate(el=>{el.click();el.click();});
    await current.getByText(/รับชำระแล้ว/).waitFor();
    assert.equal(mock.state.rpcCalls.length-before,1);
    assert.equal(mock.state.rpcCalls.at(-1).body.p_request_id,failedRequest.id,'reload retains the same idempotency key');
    assert.equal(first.status,'served');
    assert.equal(first.order_items[0].payment_allocations[0].quantity,1);
    assert.equal(previous.status,'served');
    const other=await context.newPage();
    await other.goto('http://localhost:4400/dashboard/payments');
    await other.locator('input[type=number]').first().waitFor();
    await current.getByRole('button',{name:'เลือกทั้งหมดที่ค้างในรอบนี้',exact:true}).click();
    await current.getByRole('button',{name:'ตรวจรับ QR แล้ว',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('input[type=number]').length===1);
    assert.equal(first.status,'completed');assert.equal(second.status,'completed');assert.equal(previous.status,'served');
    emit();
    await other.waitForFunction(()=>document.querySelectorAll('input[type=number]').length===1);
    await other.close();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:`${dir}/pending-payments-${width}.png`,fullPage:true});
    mock.state.queryError='orders';
    await page.reload();
    await page.getByRole('alert').filter({hasText:'โหลดออเดอร์ไม่สำเร็จ'}).waitFor();
    assert.equal(await page.locator('input[type=number]').count(),0);
    mock.state.queryError='';
  }
  delete mock.state.catalog.orders;
  console.log('PASS: partial quantities, session grouping, cash/QR, retry/double click, realtime, mobile and read errors');
}
