import assert from 'node:assert/strict';

export async function checkMembership({page,context,mock}) {
  mock.state.role='admin';
  await page.goto('http://localhost:4400/login');
  await page.locator('input[type=email]').fill('admin@example.invalid');
  await page.locator('input[type=password]').fill('local-test-password');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('**/dashboard');
  for (const existing of [false,true]) {
    await context.clearCookies({name:'smart-order-member'});
    delete mock.state.catalog.member_devices;
    mock.state.memberExists=existing;
    await page.goto('http://localhost:4400/table/id-1');
    await page.locator('summary').filter({hasText:'สมาชิกสมัครใจ'}).click();
    await page.locator('input[name=phone]').fill('081-234-5678');
    assert.equal(await page.locator('input[name=promotions]').isChecked(),false);
    await page.locator('input[name=accept]').check();
    await page.getByRole('button',{name:'สมัครสมาชิกโดยสมัครใจ',exact:true}).click();
    await page.getByRole('status').filter({hasText:'บันทึกคำขอแล้ว'}).waitFor();
    const cookie=(await context.cookies()).find(c=>c.name==='smart-order-member');
    assert.ok(cookie.httpOnly);assert.equal(cookie.sameSite,'Strict');assert.equal(cookie.value.length,64);
    assert.equal(await page.evaluate(()=>document.cookie.includes('smart-order-member')),false);
    const enrollment=mock.state.rpcCalls.filter(c=>c.path.endsWith('/enroll_member')).at(-1).body;
    assert.equal(enrollment.p_phone,'+66812345678');
    assert.equal(enrollment.p_promotions,false);assert.notEqual(enrollment.p_hash,cookie.value);
    const state=await page.evaluate(async()=>await(await fetch('/api/membership')).json());
    assert.equal(state.state,existing?'pending':'member');
    assert.equal(state.phoneVerified,false);
    assert.ok(!JSON.stringify(state).includes('812345678'));
    if(existing) {
      mock.state.role='kitchen_staff';
      const privateReads=mock.state.requests.filter(r=>r.path.endsWith('/member_devices')).length;
      await page.goto('http://localhost:4400/dashboard/members');
      await page.getByRole('heading',{name:/403/}).waitFor();
      assert.equal(mock.state.requests.filter(r=>r.path.endsWith('/member_devices')).length,privateReads,'denied role cannot trigger a private server read');
      mock.state.role='staff';
      await page.goto('http://localhost:4400/dashboard/members');
      await page.getByText(/เบอร์ \*\*\*\*5678/).waitFor();
      assert.ok(!(await page.locator('main').innerText()).includes('+66812345678'));
      await page.locator('textarea[name=note]').fill('Reviewed prior use and customer evidence in person');
      await page.locator('input[name=verified]').check();
      await page.getByRole('button',{name:'อนุมัติผูกอุปกรณ์นี้',exact:true}).click();
      await page.waitForFunction(async()=> (await(await fetch('/api/membership')).json()).state==='member');
    }
  }
  await context.clearCookies({name:'smart-order-member'});
  delete mock.state.catalog.member_devices;
  console.log('PASS: voluntary enrollment, no preset promotion consent, HttpOnly token, masked staff review and role denial');
}
