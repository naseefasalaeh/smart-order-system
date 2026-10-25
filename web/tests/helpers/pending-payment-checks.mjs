import assert from 'node:assert/strict';

export async function checkPendingPayments({ page, context, mock, emit, dir }) {
  mock.state.role = 'staff';
  const makeOrder = (number, status = 'served') => ({
    id: `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`,
    order_number: number, status, dining_type: 'dine_in', total_amount: 72.5 + number,
    created_at: '2026-10-05T01:00:00Z', served_at: '2026-10-05T01:10:00Z',
    restaurant_tables: { table_number: '7' },
    order_items: [{ id: number, quantity: 2, menu_name_snapshot: 'อาหารชื่อยาวสำหรับทดสอบการแสดงผลบนมือถือ', menus: { name: 'changed name' },
      order_item_options: [{ id: number, option_name: 'ไข่ดาว', quantity: 1 }], note: 'ไม่เผ็ด' }],
  });
  for (const width of [1440, 375]) {
    const first = makeOrder(11), second = makeOrder(12), alreadyPaid = makeOrder(13);
    mock.state.catalog.orders = [first, second, first, alreadyPaid, makeOrder(14, 'ready'), makeOrder(15, 'completed')];
    mock.state.catalog.payments = [{ order_id: alreadyPaid.id, status: 'paid' }, { order_id: second.id, status: 'failed' }];
    await page.setViewportSize({ width, height: 900 });
    await page.goto('http://localhost:4400/dashboard/payments');
    await page.getByRole('heading', { name: 'รอชำระเงิน', exact: true }).waitFor();
    assert.equal(await page.locator('nav[aria-label="กรองสถานะออเดอร์"],nav[aria-label="ประเภทออเดอร์"]').count(), 0, 'dedicated payments page has no filters');
    await page.locator('article').first().waitFor();
    assert.equal(await page.locator('article').count(), 2, 'two separate bills at same table; duplicate/paid/non-served excluded');
    const card = page.locator('article').filter({ hasText: 'บิลออเดอร์ #11' });
    assert.match(await card.innerText(), /โต๊ะ 7/);
    assert.match(await card.innerText(), /฿83\.50/);
    assert.match(await card.innerText(), /ไข่ดาว × 1 ต่อจาน/);
    assert.equal(await page.getByRole('button', { name: /^(เริ่มทำอาหาร|อาหารพร้อมเสิร์ฟ|เสิร์ฟแล้ว|ยกเลิกออเดอร์)$/ }).count(), 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
    await page.screenshot({ path: `${dir}/pending-payments-${width}.png`, fullPage: true });
    await card.getByRole('button', { name: 'รับชำระเงิน', exact: true }).click();
    mock.state.failWrite = true;
    await card.getByRole('button', { name: 'เงินสด', exact: true }).click();
    await card.getByText(/ไม่สามารถรับชำระเงินได้/).waitFor();
    assert.equal(await page.locator('article').count(), 2, 'failed payment retains bill');
    mock.state.failWrite = false;
    const before = mock.state.rpcCalls.length;
    await card.getByRole('button', { name: 'เงินสด', exact: true }).evaluate(button => { button.click(); button.click(); });
    await card.waitFor({ state: 'hidden' });
    assert.equal(mock.state.rpcCalls.length - before, 1, 'double click sends one payment');
    assert.equal(mock.state.catalog.payments.find(payment => payment.order_id === first.id).amount, 83.5);
    assert.equal(second.status, 'served', 'another bill on same table stays unpaid');
    const other = await context.newPage();
    await other.goto('http://localhost:4400/dashboard/payments');
    await other.locator('article').waitFor();
    await page.getByRole('button', { name: 'รับชำระเงิน', exact: true }).click();
    await page.getByRole('button', { name: 'QR Code', exact: true }).click();
    await page.getByText('ไม่มีรายการรอชำระเงิน', { exact: true }).waitFor();
    emit();
    await other.getByText('ไม่มีรายการรอชำระเงิน', { exact: true }).waitFor();
    await other.close();
    assert.equal(mock.state.catalog.payments.filter(payment => payment.order_id === second.id && payment.status === 'paid').length, 1);
    mock.state.queryError = 'payments';
    mock.state.catalog.orders = [makeOrder(16)];
    await page.reload();
    await page.getByRole('alert').filter({ hasText: 'โหลดออเดอร์ไม่สำเร็จ' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'รับชำระเงิน', exact: true }).count(), 0, 'payment read error fails closed');
    mock.state.queryError = '';
  }
  delete mock.state.catalog.orders; delete mock.state.catalog.payments;
  console.log('PASS: dedicated pending payment cards at 1440/375px, per-order totals, duplicate/paid exclusion, cash/QR, failure recovery, double click, realtime and empty state');
}
