import assert from 'node:assert/strict';

export async function checkSidebarNavigation({ page, context, mock, results, dir }) {
  const target = '/dashboard/orders?status=served';
  const nav = page.getByRole('navigation', { name: 'เมนูแดชบอร์ด' });
  const active = async name => {
    await page.waitForFunction(expected => {
      const links = document.querySelectorAll('nav[aria-label="เมนูแดชบอร์ด"] a[aria-current="page"]');
      return links.length === 1 && links[0].textContent === expected;
    }, name);
    assert.ok((await nav.getByRole('link', { name, exact: true }).getAttribute('class')).includes('bg-orange-500'));
  };
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    for (const role of ['admin', 'staff']) {
      mock.state.role = role;
      mock.state.status = 'served';
      await page.goto('http://localhost:4400/dashboard/orders');
      await active('ออเดอร์');
      const pending = nav.getByRole('link', { name: 'รอชำระเงิน', exact: true });
      assert.equal(await pending.getAttribute('href'), target);
      await pending.click();
      await page.waitForURL(`**${target}`);
      await active('รอชำระเงิน');
      assert.equal(await nav.getByRole('link', { name: 'ออเดอร์', exact: true }).getAttribute('aria-current'), null);
      await page.getByRole('button', { name: 'รับชำระเงิน', exact: true }).waitFor();
      await page.screenshot({ path: `${dir}/served-${role}-${width}.png`, fullPage: true });
      await nav.getByRole('link', { name: 'ออเดอร์', exact: true }).click();
      await page.waitForURL('**/dashboard/orders');
      await active('ออเดอร์');
      await page.goBack();
      await active('รอชำระเงิน');
      await page.goForward();
      await active('ออเดอร์');
      for (const [query, label] of [['status=served&date=2026-09-23', 'รอชำระเงิน'], ['status=ready', 'ออเดอร์'], ['status=history', 'ออเดอร์'], ['status=invalid', 'ออเดอร์']]) {
        await page.goto(`http://localhost:4400/dashboard/orders?${query}`);
        await active(label);
        await page.reload();
        await active(label);
      }
      results.checks.push(`${width}px ${role}: served link, one active item, query/date, reload, back/forward navigation`);
    }
    mock.state.role = 'kitchen_staff';
    await page.goto('http://localhost:4400/dashboard/kitchen');
    assert.equal(await nav.getByRole('link', { name: 'รอชำระเงิน', exact: true }).count(), 0);
    await page.goto(`http://localhost:4400${target}`);
    await page.waitForURL('**/access-denied');
    results.checks.push(`${width}px kitchen_staff: link hidden and direct served URL denied`);
  }
  await context.clearCookies();
  await page.goto(`http://localhost:4400${target}`);
  await page.waitForURL('**/login');
  results.checks.push('unauthenticated served URL redirects to login');
}
