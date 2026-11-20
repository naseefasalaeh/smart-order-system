import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const ARTIFACT_DIR = 'C:/Users/ASUS/.gemini/antigravity/brain/5c9dc7c9-2885-43a3-88fb-ecaf322aeb6d';

// Read env for Supabase admin client
const envFile = readFileSync('.env.local', 'utf8');
const supabaseUrl = envFile.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceRoleKey = envFile.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const db = createClient(supabaseUrl, serviceRoleKey);

console.log('--- 1. Setting up Database Fixtures ---');

// 0. Get an existing table
const { data: tables, error: tableErr } = await db
  .from('restaurant_tables')
  .select('id, table_number')
  .neq('status', 'inactive')
  .limit(1);

if (tableErr || !tables || tables.length === 0) {
  throw new Error('No active tables found in DB');
}

const tableId = tables[0].id;
const tableNumber = tables[0].table_number;
console.log('Selected test table:', tableId, 'number:', tableNumber);

// 1. Get an available menu
const { data: availableMenus, error: menuErr } = await db
  .from('menus')
  .select('id, name, price')
  .eq('is_available', true)
  .limit(2);

if (menuErr || !availableMenus || availableMenus.length === 0) {
  throw new Error('No available menus found in DB');
}

const menu1 = availableMenus[0];
const menu2 = availableMenus.length > 1 ? availableMenus[1] : availableMenus[0];
console.log('Selected test menus:', menu1.name, 'and', menu2.name);

// 2. Create active dining session for this table
const testSessionToken = crypto.randomUUID();

const { data: session, error: sessionErr } = await db
  .from('dining_sessions')
  .insert({
    table_id: tableId,
    access_token: testSessionToken,
    status: 'active',
  })
  .select()
  .single();

if (sessionErr || !session) {
  throw new Error('Failed to create dining session: ' + JSON.stringify(sessionErr));
}
console.log('Created test session:', session.id);

// 3. Create test order
const initialUnitPrice = Number(menu1.price);
const { data: testOrder, error: orderErr } = await db
  .from('orders')
  .insert({
    table_id: tableId,
    session_id: session.id,
    dining_type: 'dine_in',
    status: 'confirmed',
    total_amount: initialUnitPrice,
    note: 'เผ็ดน้อย',
    stock_deducted: false,
  })
  .select()
  .single();

if (orderErr || !testOrder) {
  throw new Error('Failed to create test order: ' + JSON.stringify(orderErr));
}

const { data: orderItem, error: itemErr } = await db
  .from('order_items')
  .insert({
    order_id: testOrder.id,
    menu_id: menu1.id,
    quantity: 1,
    unit_price: initialUnitPrice,
    subtotal: initialUnitPrice,
    note: 'ไม่ใส่พริก',
    completed_plates: [],
    served_plates: [],
  })
  .select()
  .single();

if (itemErr || !orderItem) {
  throw new Error('Failed to create test order item: ' + JSON.stringify(itemErr));
}

// Check and insert required options for menu 1
const { data: menu1Options } = await db
  .from('effective_menu_options')
  .select('id, name, additional_price, menu_option_groups(is_required)')
  .eq('menu_id', menu1.id)
  .eq('is_available', true);

const requiredOpt = menu1Options?.find(o => o.menu_option_groups?.is_required) ?? menu1Options?.[0];
if (requiredOpt) {
  await db.from('order_item_options').insert({
    order_item_id: orderItem.id,
    menu_option_id: requiredOpt.id,
    option_name: requiredOpt.name,
    additional_price: Number(requiredOpt.additional_price || 0),
    quantity: 1,
  });
}

console.log('Created test order:', testOrder.id, 'number:', testOrder.order_number);

console.log('--- 2. Checking Existing Next.js Dev Server on Port 3000 ---');
const baseUrl = 'http://localhost:3000';
let serverReady = false;
for (let i = 0; i < 20; i++) {
  try {
    const res = await fetch(`${baseUrl}/api/customer-orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableId, sessionToken: testSessionToken }),
    });
    if (res.ok) {
      serverReady = true;
      break;
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 500));
}

if (!serverReady) {
  throw new Error('Next.js dev server on port 3000 is not reachable');
}
console.log('Next.js dev server on port 3000 is ready!');

let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });

  console.log('--- 3. Testing Desktop View & Flow ---');
  const desktopContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await desktopContext.newPage();
  page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
  page.on('response', async (res) => {
    if (res.url().includes('/edit')) {
      console.log('EDIT API STATUS:', res.status(), await res.text());
    }
  });

  // Set localStorage session
  await page.goto(`${baseUrl}/table/id-${tableId}`);
  await page.evaluate(({ token, id }) => {
    window.localStorage.setItem(`smart-order-session-id-${id}`, token);
  }, { token: testSessionToken, id: tableId });

  // Navigate to orders page
  await page.goto(`${baseUrl}/table/id-${tableId}/orders`);
  await page.waitForSelector(`text=ออเดอร์ของโต๊ะ ${tableNumber}`);
  await page.waitForSelector('text=แก้ไขออเดอร์');

  // Screenshot 1: Orders page with "แก้ไขออเดอร์" button
  await page.screenshot({
    path: `${ARTIFACT_DIR}/customer-orders-desktop-editable.png`,
    fullPage: true,
  });
  console.log('Captured: customer-orders-desktop-editable.png');

  // Click "แก้ไขออเดอร์" to open Edit Order Modal
  await page.click('button:has-text("แก้ไขออเดอร์")');
  await page.waitForSelector('div[role="dialog"]');
  await page.waitForSelector('text=บันทึกการแก้ไข');

  // Screenshot 2: Edit Order Modal (Desktop)
  await page.screenshot({
    path: `${ARTIFACT_DIR}/edit-order-modal-desktop.png`,
  });
  console.log('Captured: edit-order-modal-desktop.png');

  // Increase quantity of the item
  await page.click('button[aria-label="เพิ่มจำนวน"]');
  await page.waitForTimeout(300);

  // Edit order note
  await page.fill('#edit-order-note', 'ขอช้อนส้อมเพิ่ม และเสิร์ฟพร้อมกัน');

  // Click "+ เพิ่มเมนูจากหน้าหลัก" to navigate to main menu page
  await page.locator('[data-testid="add-menu-btn"]').click();
  await page.waitForURL(`**/table/id-${tableId}?editOrder=${testOrder.id}`);
  await page.waitForSelector('[data-testid="edit-order-mode-banner"]');

  // Screenshot 3: Main menu catalog in edit order mode
  await page.screenshot({
    path: `${ARTIFACT_DIR}/menu-catalog-edit-mode-desktop.png`,
  });
  console.log('Captured: menu-catalog-edit-mode-desktop.png');

  // Select an item to add (e.g. click "เพิ่ม" on the first or second menu card)
  const addButtons = page.locator('article button:has-text("เพิ่ม")');
  await addButtons.first().click();
  await page.waitForSelector('[data-testid="add-to-edit-order-btn"]');

  // Check any required radio options if present
  const radios = page.locator('input[type="radio"]');
  const radioCount = await radios.count();
  for (let r = 0; r < radioCount; r++) {
    const radio = radios.nth(r);
    const name = await radio.getAttribute('name');
    if (name) {
      const anyChecked = await page.locator(`input[type="radio"][name="${name}"]:checked`).count();
      if (anyChecked === 0) {
        await radio.check();
      }
    }
  }

  // Screenshot 4: Option modal in edit mode
  await page.screenshot({
    path: `${ARTIFACT_DIR}/menu-option-modal-edit-mode-desktop.png`,
  });
  console.log('Captured: menu-option-modal-edit-mode-desktop.png');

  // Click "เพิ่มในออเดอร์ที่กำลังแก้ไข"
  await page.locator('[data-testid="add-to-edit-order-btn"]').click();

  // Should automatically navigate back to orders page and re-open Edit Order modal
  await page.waitForURL(`**/table/id-${tableId}/orders?editOrder=${testOrder.id}`);
  await page.waitForSelector('div[role="dialog"]');
  await page.waitForSelector('[data-testid="save-order-changes-btn"]');

  // Screenshot 5: Edit order modal with preserved draft + newly added item
  await page.screenshot({
    path: `${ARTIFACT_DIR}/edit-order-modal-with-new-item.png`,
  });
  console.log('Captured: edit-order-modal-with-new-item.png');

  // Verify that the note was preserved in the draft
  const preservedNote = await page.inputValue('#edit-order-note');
  assert.equal(preservedNote, 'ขอช้อนส้อมเพิ่ม และเสิร์ฟพร้อมกัน', 'Order note should be preserved in draft');

  // Click "บันทึกการแก้ไข" (Save Changes)
  await page.locator('[data-testid="save-order-changes-btn"]').click();
  await page.waitForSelector('text=แก้ไขออเดอร์สำเร็จ');
  await page.waitForTimeout(1000);

  // Screenshot 6: Result after saving edit
  await page.screenshot({
    path: `${ARTIFACT_DIR}/customer-orders-desktop-edited-success.png`,
    fullPage: true,
  });
  console.log('Captured: customer-orders-desktop-edited-success.png');

  console.log('--- 4. Testing Mobile Viewport (iPhone 390x844) ---');
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(`${baseUrl}/table/id-${tableId}`);
  await mobilePage.evaluate(({ token, id }) => {
    window.localStorage.setItem(`smart-order-session-id-${id}`, token);
  }, { token: testSessionToken, id: tableId });

  await mobilePage.goto(`${baseUrl}/table/id-${tableId}/orders`);
  await mobilePage.waitForSelector('text=แก้ไขออเดอร์');

  // Mobile Orders Page
  await mobilePage.screenshot({
    path: `${ARTIFACT_DIR}/customer-orders-mobile-editable.png`,
    fullPage: true,
  });
  console.log('Captured: customer-orders-mobile-editable.png');

  // Click "แก้ไขออเดอร์" on mobile
  await mobilePage.click('button:has-text("แก้ไขออเดอร์")');
  await mobilePage.waitForSelector('div[role="dialog"]');

  // Mobile Edit Modal
  await mobilePage.screenshot({
    path: `${ARTIFACT_DIR}/edit-order-modal-mobile.png`,
  });
  console.log('Captured: edit-order-modal-mobile.png');

  // Close modal on mobile
  await mobilePage.click('button[aria-label="ปิดหน้าต่าง"]');
  await mobilePage.waitForTimeout(300);

  console.log('--- 5. Testing Cooking Started Locked Status ---');
  // Kitchen starts cooking -> status becomes 'preparing'
  await db
    .from('orders')
    .update({ status: 'preparing', updated_at: new Date().toISOString() })
    .eq('id', testOrder.id);

  // Reload mobile page
  await mobilePage.reload();
  await mobilePage.waitForSelector('text=ร้านเริ่มทำอาหารแล้ว ไม่สามารถแก้ไขออเดอร์ได้');

  // Ensure "แก้ไขออเดอร์" button is NOT present
  const editBtnCount = await mobilePage.locator('button:has-text("แก้ไขออเดอร์")').count();
  assert.equal(editBtnCount, 0, 'Edit button should not be present when cooking has started');

  await mobilePage.screenshot({
    path: `${ARTIFACT_DIR}/customer-orders-cooking-locked-mobile.png`,
    fullPage: true,
  });
  console.log('Captured: customer-orders-cooking-locked-mobile.png');

  // Desktop check as well
  await page.reload();
  await page.waitForSelector('text=ร้านเริ่มทำอาหารแล้ว ไม่สามารถแก้ไขออเดอร์ได้');
  await page.screenshot({
    path: `${ARTIFACT_DIR}/customer-orders-cooking-locked-desktop.png`,
    fullPage: true,
  });
  console.log('Captured: customer-orders-cooking-locked-desktop.png');

  console.log('--- 6. Testing Server Race-Condition Protection ---');
  // Call API directly to attempt editing an order that is in 'preparing' state
  const editAttempt = await fetch(`${baseUrl}/api/orders/${testOrder.id}/edit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tableId,
      sessionToken: testSessionToken,
      items: [{ menuId: menu1.id, quantity: 1, optionSelections: [] }],
    }),
  });

  assert.equal(editAttempt.status, 409, 'Server must return 409 Conflict when order is already preparing');
  const errorJson = await editAttempt.json();
  assert.equal(errorJson.error, 'ร้านเริ่มทำอาหารแล้ว ไม่สามารถแก้ไขออเดอร์ได้');
  console.log('PASS: Server successfully rejected edit on preparing order with 409 Conflict!');

  console.log('--- ALL AUTOMATED VERIFICATIONS PASSED SUCCESSFULLY! ---');
} finally {
  if (browser) await browser.close();

  // Clean up database fixture
  console.log('--- Cleaning up DB fixtures ---');
  await db.from('order_item_options').delete().eq('order_item_id', orderItem?.id);
  await db.from('order_items').delete().eq('order_id', testOrder.id);
  await db.from('order_ingredient_usages').delete().eq('order_id', testOrder.id);
  await db.from('orders').delete().eq('id', testOrder.id);
  await db.from('dining_sessions').delete().eq('id', session.id);
  console.log('Cleanup complete.');
}
