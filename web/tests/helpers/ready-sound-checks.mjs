import assert from 'node:assert/strict';

export async function checkReadySound({ page, mock, emit }) {
  mock.state.role='staff';
  const item={id:901,quantity:3,completed_plates:[1],served_plates:[],menu_name_snapshot:'เสียงทดสอบ',order_item_options:[]};
  mock.state.catalog.orders=[{id:'00000000-0000-4000-8000-000000000901',order_number:901,status:'preparing',dining_type:'dine_in',created_at:new Date().toISOString(),restaurant_tables:{table_number:'7'},order_items:[item]}];
  await page.addInitScript(()=>{
    window.testTones=0;
    const original=AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator=function(...args){window.testTones++;return original.apply(this,args);};
  });
  await page.goto('http://localhost:4400/dashboard/ready');
  await page.locator('article').waitFor();
  await page.waitForTimeout(1000);
  assert.equal(await page.evaluate(()=>window.testTones),0,'initial historical plates stay silent');
  await page.getByRole('button',{name:'เปิดเสียงแจ้งเตือน',exact:true}).click();
  await page.waitForFunction(()=>window.testTones===2);
  item.completed_plates=[1,2,3];emit();
  await page.waitForFunction(()=>window.testTones===4);
  await page.getByText('พร้อมเสิร์ฟใหม่',{exact:true}).waitFor();
  emit();emit();
  await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await page.waitForTimeout(1600);
  assert.equal(await page.evaluate(()=>window.testTones),4,'repeated realtime/poll/reconnect snapshots stay silent');
  await page.reload();
  await page.locator('article').waitFor();
  await page.waitForTimeout(1000);
  assert.equal(await page.evaluate(()=>window.testTones),0,'new document requires a user gesture again');
  await page.getByText(/อุปกรณ์นี้เคยเปิดเสียง/).waitFor();
  await page.getByRole('button',{name:'ทดลองเสียง',exact:true}).click();
  await page.waitForFunction(()=>window.testTones===2);
  assert.equal(await page.getByRole('button',{name:'เปิดเสียงแจ้งเตือน',exact:true}).count(),1,'testing does not enable notifications');
  delete mock.state.catalog.orders;
  console.log('PASS: browser Web Audio activation, remembered preference, baseline silence, batching and reconnect deduplication');
}
