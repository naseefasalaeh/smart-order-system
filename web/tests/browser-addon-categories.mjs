import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const require=createRequire(import.meta.url);
const modules=new Map();
function add(file){
 if(modules.has(file)) return file;
 modules.set(file,'');
 let source=readFileSync(file,'utf8');
 if(/\.tsx?$/.test(file)) source=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
 source=source.replace(/require\(["']([^"']+)["']\)/g,(_,name)=>{
  if(name==='next/navigation')return '({useRouter:()=>({refresh(){},push(){}})})';
  if(name==='@/app/dashboard/addons/actions')return '({saveAddon:async()=>({error:"test"})})';
  let resolved; try { resolved=name.startsWith('@/')?require.resolve('../src/'+name.slice(2)+'.ts'):createRequire(file).resolve(name); } catch { resolved=createRequire(file).resolve(name+'.tsx'); }
  return `require(${JSON.stringify(add(resolved))})`;
 });
 modules.set(file,source);return file;
}

const react=add(require.resolve('react'));
const dom=add(require.resolve('react-dom/client'));
const picker=add(require.resolve('../src/components/menu-addon-picker.tsx'));
const customer=add(require.resolve('../src/app/table/[tableId]/MenuClient.tsx'));
const editor=add(require.resolve('../src/components/addon-editor.tsx'));
const bundle=`const process={env:{NODE_ENV:'development'}};const modules={${[...modules].map(([id,code])=>JSON.stringify(id)+':function(module,exports,require){'+code+'}').join(',')}};const cache={};function require(id){if(cache[id])return cache[id].exports;const m=cache[id]={exports:{}};modules[id](m,m.exports,require);return m.exports;}window.React=require(${JSON.stringify(react)});window.root=require(${JSON.stringify(dom)}).createRoot(document.getElementById('root'));window.Picker=require(${JSON.stringify(picker)}).default;window.Customer=require(${JSON.stringify(customer)}).default;window.Editor=require(${JSON.stringify(editor)}).default;`;
const browser=await chromium.launch({headless:true,channel:"msedge"});
try {
 const page=await browser.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<div id="root"></div>');await page.addScriptTag({content:bundle});
 const addons=[{id:1,name:'ไก่',category:'meat',is_available:true},{id:2,name:'ทะเล',category:'meat',is_available:false},{id:3,name:'ไข่ดาว',category:'topping',is_available:true},{id:4,name:'เพิ่มข้าว',category:'portion',is_available:true}].map(a=>({...a,additional_price:10,max_quantity:3}));
 await page.evaluate(addons=>root.render(React.createElement(Picker,{addons,selectedIds:[2],ingredients:[]})),addons);
 for(const name of ['ตัวเลือกเนื้อสัตว์','ไข่และท็อปปิ้ง','เพิ่มปริมาณ'])assert.equal(await page.getByRole('heading',{name,exact:true}).count(),1);
 const seafood=page.locator('input[name="addon_ids"][value="2"]');assert.ok(await seafood.isChecked());await seafood.uncheck();assert.ok(await seafood.isDisabled());
 await page.locator('input[name="addon_ids"][value="1"]').check();
 console.log('PASS Admin: three sections, menu checkboxes, retained disabled link and blocked new selection');
 await page.evaluate(()=>root.render(React.createElement(Editor,{ingredients:[]})));
 await page.locator('select[name="category"]').waitFor();
 assert.equal(await page.locator('select[name="category"] option').count(),4);assert.ok(await page.locator('select[name="category"]').evaluate(e=>e.required));
 console.log('PASS Add-on editor: category selection required');
 await page.evaluate(addons=>root.render(React.createElement(Customer,{tableId:'1',tableNumber:1,menus:[{id:1,name:'Test menu',price:50,can_order:true,category_name:'Test',description:null,image_url:null,option_groups:['meat','topping','portion'].map((c,i)=>({key:String(i+1),id:i+1,name:['ตัวเลือกเนื้อสัตว์','ไข่และท็อปปิ้ง','เพิ่มปริมาณ'][i],selection_type:i===0?'single':'multiple',is_required:i===0,min_select:i===0?1:0,max_select:i===0?1:3,max_total_quantity:i===0?1:9,options:addons.filter(a=>a.category===c).map(a=>({...a,max_available_quantity:3}))}))}]})),addons);
 await page.getByRole('button',{name:'เพิ่ม',exact:true}).click();
 assert.equal(await page.getByRole('radio').count(),2);
 await page.getByRole('radio',{name:/ไก่/}).check();
 await page.getByRole('checkbox',{name:/ไข่ดาว/}).check();await page.getByRole('checkbox',{name:/เพิ่มข้าว/}).check();
 assert.ok(await page.getByRole('radio',{name:/ทะเล/}).isDisabled());
 console.log('PASS Customer: meat radio, topping/portion checkboxes, unavailable option disabled');
 assert.deepEqual(errors,[]);
} finally { await browser.close(); }
