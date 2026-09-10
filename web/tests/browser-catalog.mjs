// Explicit remote integration test. Only this run's recorded IDs may be mutated.
// Credentials/browser state stay in ignored .test-artifacts; never log them.
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

assert.ok(process.argv.includes("--remote-test"), "Requires explicit --remote-test");
process.loadEnvFile(".env.local");
const runName = process.env.CATALOG_TEST_RUN;
assert.ok(!runName || /^[a-zA-Z0-9_-]+$/.test(runName), "Invalid artifact run name");
const root = runName ? `.test-artifacts/${runName}` : ".test-artifacts";
mkdirSync(root, { recursive: true });
const file = `${root}/catalog-run.json`;
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const mode = process.argv[2];
const state = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {
  prefix: `TEST_DELETE_${Date.now()}_${randomBytes(3).toString("hex")}`,
  created: {}, checks: [], orders: [], errors: [],
};
const save = () => writeFileSync(file, JSON.stringify(state, null, 2));
const check = (name, detail = true) => { state.checks.push({ name, detail }); save(); console.log(`PASS ${name}`, JSON.stringify(detail)); };
const value = async (query) => { const r = await query; if (r.error) throw new Error(`${r.error.code}: ${r.error.message}`); return r.data; };
async function insert(table, fields, key) {
  const row = await value(db.from(table).insert(fields).select().single());
  (state.created[table] ??= []).push(row); if (key) state[key] = row; save(); return row;
}
async function fingerprint() {
  const result = {};
  for (const table of ["menus","ingredients","menu_ingredients","menu_options","menu_option_groups","menu_option_ingredients","orders","order_items","order_item_options","order_ingredient_usages","restaurant_tables","dining_sessions","profiles","categories","ingredient_categories","payments","reviews"]) {
    const rows = [];
    for (let start = 0; ; start += 1000) {
      let query = db.from(table).select("*").order(table === "menu_ingredients" ? "menu_id" : "id");
      if (table === "menu_ingredients") query = query.order("ingredient_id");
      const batch = await value(query.range(start, start + 999));
      rows.push(...batch); if (batch.length < 1000) break;
    }
    result[table] = { count: rows.length, hash: createHash("sha256").update(JSON.stringify(rows)).digest("hex") };
  }
  return result;
}
async function setup() {
  assert.ok(!state.before, "Existing run: use run/cleanup, never overwrite its registry");
  state.before = await fingerprint(); save();
  state.email = `${state.prefix.toLowerCase()}@example.invalid`;
  state.password = randomBytes(24).toString("base64url"); save();
  const { data, error } = await db.auth.admin.createUser({ email: state.email, password: state.password, email_confirm: true, user_metadata: { full_name: state.prefix } });
  assert.ifError(error); state.userId = data.user.id; save();
  for (const key of ["unusedIng", "baseIng", "optionIng", "usedIng"]) {
    await insert("ingredients", { name: `${state.prefix}_${key}`, unit: "unit", stock_quantity: 100, minimum_stock: 0 }, key);
  }
  for (const key of ["unusedMenu", "plain", "single", "multiple", "staleMenu"]) {
    await insert("menus", { name: `${state.prefix}_${key}`, price: 50, is_available: true }, key);
    if (key !== "staleMenu") await insert("menu_ingredients", { menu_id: state[key].id, ingredient_id: state[key === "plain" ? "usedIng" : "baseIng"].id, quantity_required: 2 });
  }
  for (const key of ["unusedMenu", "single", "multiple"]) {
    const single = key === "single";
    const group = await insert("menu_option_groups", { menu_id: state[key].id, name: `${state.prefix}_${key}_group`, selection_type: single ? "single" : "multiple", is_required: single, min_select: single ? 1 : 0, max_select: single ? 1 : 2, max_total_quantity: single ? 1 : 3, is_active: true, display_order: 0 });
    for (let i = 0; i < (single ? 1 : 2); i++) {
      const option = await insert("menu_options", { menu_id: state[key].id, group_id: group.id, name: `${state.prefix}_${key}_option${i}`, additional_price: 10 + i, max_quantity: single ? 1 : 3, is_available: true, sort_order: i });
      await insert("menu_option_ingredients", { menu_option_id: option.id, ingredient_id: state.optionIng.id, quantity_required: 0.5 });
    }
  }
  await insert("restaurant_tables", { table_number: 900000 + Math.floor(Math.random() * 90000), qr_code: state.prefix, status: "available" }, "table");
  check("fixtures created", { prefix: state.prefix, counts: Object.fromEntries(Object.entries(state.created).map(([k,v]) => [k,v.length])) });
}
async function run() {
  assert.ok(state.table && !state.cleaned);
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", error => { state.errors.push(error.message); save(); });
  const base = "http://localhost:3000";
  const login = async () => {
    await page.goto(`${base}/login`);
    await page.getByLabel("อีเมล", { exact: true }).fill(state.email);
    await page.getByLabel("รหัสผ่าน", { exact: true }).fill(state.password);
    await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
    await page.waitForURL("**/dashboard");
  };
  const noOverlay = async () => {
    assert.equal(await page.locator("nextjs-portal").locator("[data-nextjs-dialog-overlay]").count(), 0);
    assert.deepEqual(state.errors, []);
  };
  async function openDelete(kind, row) {
    await page.goto(`${base}/dashboard/${kind === "menu" ? "menus" : "ingredients"}`);
    const tr = page.getByRole("row").filter({ has: page.getByText(row.name, { exact: true }) });
    await tr.getByRole("button", { name: kind === "menu" ? "ลบเมนู" : "ลบวัตถุดิบ", exact: true }).click();
    return page.getByRole("dialog");
  }
  async function blockedIngredient(row, expected) {
    const dialog = await openDelete("ingredient", row);
    await dialog.getByRole("textbox").fill(row.name);
    await dialog.getByRole("button", { name: "ยืนยันลบถาวร", exact: true }).click();
    await dialog.getByRole("alert").filter({ hasText: expected }).waitFor();
    await noOverlay(); check(`ingredient blocked: ${row.name}`, await dialog.getByRole("alert").innerText());
    await dialog.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  }
  try {
    await login(); check("authenticated browser login");
    if (!process.argv.includes("--resume-after-orders")) {
    await blockedIngredient(state.baseIng, state.unusedMenu.name);
    await blockedIngredient(state.optionIng, "ตัวเลือก");
    let dialog = await openDelete("menu", state.unusedMenu);
    const confirm = dialog.getByRole("button", { name: "ยืนยันลบถาวร", exact: true });
    assert.equal(await confirm.isDisabled(), true);
    await dialog.getByRole("textbox").fill("WRONG");
    assert.equal(await confirm.isDisabled(), true); check("wrong/empty name disables confirmation");
    await dialog.getByRole("textbox").fill(state.unusedMenu.name);
    await confirm.click();
    await page.waitForURL("**/dashboard/menus?success=**");
    assert.equal((await value(db.from("menus").select("id").eq("id",state.unusedMenu.id))).length,0);
    for (const table of ["menu_ingredients","menu_options","menu_option_groups"]) assert.equal((await value(db.from(table).select("*").eq("menu_id",state.unusedMenu.id))).length,0);
    const childIds = state.created.menu_options.filter(o=>o.menu_id===state.unusedMenu.id).map(o=>o.id);
    assert.equal((await value(db.from("menu_option_ingredients").select("*").in("menu_option_id",childIds))).length,0);
    check("browser menu delete cascades all children");
    dialog = await openDelete("ingredient",state.unusedIng);
    await dialog.getByRole("textbox").fill(state.unusedIng.name);
    let submissions=0;
    const onRequest=r=>{if(r.method()==="POST" && r.headers()["next-action"]) submissions++;};
    page.on("request",onRequest);
    await dialog.getByRole("button",{name:"ยืนยันลบถาวร",exact:true}).evaluate(el=>{el.click();el.click();});
    await page.waitForURL("**/dashboard/ingredients?success=**");
    page.off("request",onRequest); assert.equal(submissions,1);
    check("unused ingredient browser deletion and rapid double click",{submissions});

    for (const key of ["plain","single","multiple"]) {
      await page.goto(`${base}/table/${state.table.table_number}`);
      await page.locator("article").filter({has:page.getByRole("heading",{name:state[key].name,exact:true})}).getByRole("button",{name:"เพิ่ม",exact:true}).click();
      if(key==="single") await page.getByRole("radio").check();
      if(key==="multiple") {const boxes=page.getByRole("checkbox");await boxes.nth(0).check();await boxes.nth(1).check();}
      await page.getByRole("button",{name:/^เพิ่มลงตะกร้า/}).click();
      await page.getByRole("button",{name:"ดูตะกร้า",exact:true}).click();
      const textarea=page.locator("textarea");if(await textarea.count()) await textarea.fill(state.prefix);
      const responsePromise=page.waitForResponse(r=>r.url().endsWith("/api/orders")&&r.request().method()==="POST");
      await page.getByRole("button",{name:"ยืนยันการสั่งอาหาร",exact:true}).click();
      const response=await responsePromise;const body=await response.json();
      state.lastOrderResponse={key,status:response.status(),body};save();
      assert.equal(response.status(),201,JSON.stringify(body));
      state.orders.push(body.order.id);save();
      const usages=await value(db.from("order_ingredient_usages").select("ingredient_id,quantity_used").eq("order_id",body.order.id));
      const items=await value(db.from("order_items").select("id,menu_id").eq("order_id",body.order.id));
      const options=await value(db.from("order_item_options").select("menu_option_id,option_name,quantity,additional_price").in("order_item_id",items.map(i=>i.id)));
      assert.equal(options.length,key==="plain"?0:key==="single"?1:2);
      assert.equal(usages.find(u=>u.ingredient_id===state[key==="plain"?"usedIng":"baseIng"].id).quantity_used,2);
      if(key!=="plain")assert.equal(usages.find(u=>u.ingredient_id===state.optionIng.id).quantity_used,key==="single"?0.5:1);
      for(const usage of usages){ const stock=await value(db.from("ingredients").select("stock_quantity").eq("id",usage.ingredient_id).single());assert.equal(stock.stock_quantity,100-usage.quantity_used); }
      check(`browser order ${key}`,{id:body.order.id,usages,options});
      const cancelled=await context.request.post(`${base}/api/orders/${body.order.id}/cancel`,{data:{currentStatus:"confirmed"}});
      assert.equal(cancelled.status(),200,await cancelled.text());
      const repeated=await context.request.post(`${base}/api/orders/${body.order.id}/cancel`,{data:{currentStatus:"confirmed"}});
      assert.ok([200,409].includes(repeated.status()),await repeated.text());
      for(const usage of usages){ const stock=await value(db.from("ingredients").select("stock_quantity").eq("id",usage.ingredient_id).single());assert.equal(stock.stock_quantity,100); }
      check(`cancel ${key} restores full stock once`);
    }
    }
    const beforeRejected = await fingerprint();
    const singleOption = state.created.menu_options.find(o => o.menu_id === state.single.id);
    const multiOptions = state.created.menu_options.filter(o => o.menu_id === state.multiple.id);
    const valid = { tableId: String(state.table.id), sessionToken: randomUUID(), items: [{ menuId: state.plain.id, quantity: 1 }] };
    const cases = [
      ["missing required option", { ...valid, items: [{ menuId: state.single.id, quantity: 1 }] }, 400],
      ["foreign option", { ...valid, items: [{ menuId: state.plain.id, quantity: 1, optionSelections: [{ optionId: singleOption.id, quantity: 1 }] }] }, 400],
      ["duplicate option", { ...valid, items: [{ menuId: state.single.id, quantity: 1, optionSelections: [1,1].map(quantity => ({ optionId: singleOption.id, quantity })) }] }, 400],
      ["group quantity exceeded", { ...valid, items: [{ menuId: state.multiple.id, quantity: 1, optionSelections: multiOptions.map(o => ({ optionId: o.id, quantity: 2 })) }] }, 400],
      ["insufficient stock", { ...valid, items: [{ menuId: state.multiple.id, quantity: 100 }] }, 409],
      ["null body", null, 400],
      ["null item", { ...valid, items: [null] }, 400],
      ["null option", { ...valid, items: [{ menuId: state.plain.id, quantity: 1, optionSelections: [null] }] }, 400],
      ["non-array options", { ...valid, items: [{ menuId: state.plain.id, quantity: 1, optionSelections: {} }] }, 400],
    ];
    for (const [name, data, status] of cases) {
      const response = await context.request.post(`${base}/api/orders`, { data: JSON.stringify(data), headers: { "content-type": "application/json" } });
      assert.equal(response.status(), status, `${name}: ${await response.text()}`);
      check(`order rejects ${name}`);
    }
    const malformed = await context.request.post(`${base}/api/orders`, { data: "{", headers: { "content-type": "application/json" } });
    assert.equal(malformed.status(), 400);
    check("order rejects malformed JSON");
    assert.deepEqual(await fingerprint(), beforeRejected);
    check("rejected orders leave database unchanged");
    let dialog=await openDelete("menu",state.plain);
    await dialog.getByRole("textbox").fill(state.plain.name);
    await dialog.getByRole("button",{name:"ยืนยันลบถาวร",exact:true}).click();
    await dialog.getByRole("alert").filter({hasText:"ลบไม่ได้ แต่ปิดขายได้"}).waitFor();await noOverlay();
    await dialog.getByRole("button",{name:"ยืนยันปิดขายแทน",exact:true}).click();
    await page.waitForURL("**/dashboard/menus?success=**");
    assert.equal((await value(db.from("menus").select("is_available").eq("id",state.plain.id).single())).is_available,false);
    await value(db.from("menus").update({is_available:state.plain.is_available,updated_at:state.plain.updated_at}).eq("id",state.plain.id).eq("name",state.plain.name));
    check("used TEST menu refuses delete; archive works; original TEST status restored");
    await value(db.from("menu_ingredients").delete().eq("menu_id",state.plain.id).eq("ingredient_id",state.usedIng.id));
    await blockedIngredient(state.usedIng,"ประวัติการหัก/คืน stock");
    dialog=await openDelete("menu",state.staleMenu);
    await dialog.getByRole("textbox").fill(state.staleMenu.name);
    await context.clearCookies();
    await dialog.getByRole("button",{name:"ยืนยันลบถาวร",exact:true}).click();
    await dialog.getByRole("alert").filter({hasText:"เข้าสู่ระบบ"}).waitFor();await noOverlay();
    check("expired browser session returns inline login error without overlay");
    await page.screenshot({path:`${root}/expired-session.png`});
  } catch (error) {
    state.browserFailure = { url: page.url(), message: error.message, alerts: await page.getByRole("alert").allTextContents(), dialogs: await page.getByRole("dialog").allTextContents() }; save();
    await page.screenshot({ path: `${root}/failure.png` }); throw error;
  } finally { await browser.close(); }
}
async function replaceMenuFixture() {
  assert.equal((await value(db.from("menus").select("id").eq("id",state.unusedMenu.id))).length,0);
  await insert("menus",{name:state.unusedMenu.name,price:50,is_available:true},"unusedMenu");
  await insert("menu_ingredients",{menu_id:state.unusedMenu.id,ingredient_id:state.baseIng.id,quantity_required:2});
  const group=await insert("menu_option_groups",{menu_id:state.unusedMenu.id,name:state.prefix+"_retry_group",selection_type:"multiple",is_required:false,min_select:0,max_select:1,max_total_quantity:1,is_active:true});
  const option=await insert("menu_options",{menu_id:state.unusedMenu.id,group_id:group.id,name:state.prefix+"_retry_option",additional_price:10,is_available:true,max_quantity:1});
  await insert("menu_option_ingredients",{menu_option_id:option.id,ingredient_id:state.optionIng.id,quantity_required:0.5});
  check("replacement unused TEST fixture registered",state.unusedMenu.id);
}
async function cleanup() {
  assert.ok(state.before && state.prefix.startsWith("TEST_DELETE_") && !state.cleaned);
  // Discover only orders/sessions on this run's uniquely recorded test table.
  if(state.table){
    const table=await value(db.from("restaurant_tables").select().eq("id",state.table.id).single());
    assert.equal(table.qr_code,state.prefix);
    const orders=await value(db.from("orders").select("id,stock_deducted,status").eq("table_id",state.table.id));
    for(const order of orders){
      const items=await value(db.from("order_items").select("menu_id").eq("order_id",order.id));
      assert.ok(items.every(i=>state.created.menus.some(m=>m.id===i.menu_id)));
      if(order.stock_deducted){ await value(db.rpc("cancel_order_and_restore_stock",{p_order_id:order.id,p_current_status:order.status})); }
      await value(db.from("orders").delete().eq("id",order.id).eq("table_id",state.table.id));
    }
    await value(db.from("dining_sessions").delete().eq("table_id",state.table.id));
    await value(db.from("restaurant_tables").delete().eq("id",state.table.id).eq("qr_code",state.prefix));
  }
  for(const row of state.created.menus??[])await value(db.from("menus").delete().eq("id",row.id).eq("name",row.name));
  for(const row of state.created.ingredients??[])await value(db.from("ingredients").delete().eq("id",row.id).eq("name",row.name));
  if(state.userId){const r=await db.auth.admin.getUserById(state.userId);assert.equal(r.data.user.email,state.email);const d=await db.auth.admin.deleteUser(state.userId);assert.ifError(d.error);}
  state.after=await fingerprint();state.cleaned=true;delete state.password;save();
  assert.deepEqual(state.after,state.before,"REAL DATA FINGERPRINT CHANGED");
  check("cleanup complete; all 17 real-data fingerprints unchanged");
}
try { if(mode==="setup")await setup();else if(mode==="run")await run();else if(mode==="cleanup")await cleanup();else if(mode==="replace-menu")await replaceMenuFixture();else if(mode==="status")console.log(JSON.stringify({menus:await value(db.from("menus").select("id,name,is_available").in("id",state.created.menus.map(m=>m.id))),last:state.lastOrderResponse,failure:state.browserFailure},null,2));else throw new Error("Use setup/run/cleanup --remote-test"); }
catch(error){save();console.error(error);process.exitCode=1;}
