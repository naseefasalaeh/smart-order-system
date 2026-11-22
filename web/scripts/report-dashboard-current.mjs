import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const root='.test-artifacts/dashboard-performance';
const current=read(`${root}/current-after-production/results.json`);
const before=read(`${root}/final-before-production/results.json`);
const dev=read(`${root}/current-after-dev/results.json`);
const devLive=read(`${root}/current-final-after-dev-live-only/results.json`);
const prodLive=read(`${root}/current-final-after-production-live-only/results.json`);
const hostedRoot='.test-artifacts/hosted-performance';
const latest=readdirSync(hostedRoot).filter(n=>n.startsWith('current-after-production-')).sort().at(-1);
const hosted=read(`${hostedRoot}/${latest}/results.json`);
const served=read('.test-artifacts/served-orders/live/test-results.json');
const registry=read('.test-artifacts/served-orders/live/test-registry.json');
const checks=read(`${root}/final-checks.json`);
const samples=(r,n,k)=>r.actions.filter(a=>a.name===n).map(a=>a[k]).filter(Number.isFinite);
const median=a=>{a=[...a].sort((a,b)=>a-b);return a.length?a[Math.floor(a.length/2)]:null;};
const stat=a=>a.length?`${Math.round(median(a))} [${Math.round(Math.min(...a))}–${Math.round(Math.max(...a))}], n=${a.length}`:'ไม่ได้วัด';
const classify=(a,b)=>{const d=(median(b)/median(a)-1)*100;return `${Math.abs(d)<=10?'ใกล้เคียงเดิม':d<0?'เร็วขึ้น':'ช้าลง'} ${d.toFixed(1)}%`;};
const lines=['# Final Report — ยืนยัน workspace ปัจจุบัน', '', `สร้าง ${new Date().toISOString()}`, '',
'รายงานนี้ต่อจาก [ผล performance เดิม](dashboard-performance-final.md) ซึ่งเก็บ paired A/B/C แล้ว ไม่รันก่อนงานซ้ำ และไม่ใช้ผลเดิมรับรองงานเสิร์ฟที่เพิ่มภายหลังโดยอัตโนมัติ', '',
'## สาเหตุและสิ่งที่แก้', '',
'Kitchen 404 เดิมเกิดจาก guard ใช้ notFound() กับ profile failure/ไม่มีสิทธิ์; fixture 503 ทำซ้ำได้ แก้แยก login, access-denied และ retryable error พร้อมรักษา session รายละเอียด Auth, form pending และการลด refresh อยู่ในรายงานเดิม ไม่มี log เพียงพอระบุ upstream failure ของเหตุการณ์เดิมรายครั้ง', '',
'รอบนี้พบ hosted Orders subscribed แต่ไม่มี event ของ TEST order ขณะที่ Kitchen/Ready รับ event; ข้อมูล served commit แล้วแต่ UI ค้าง การเปลี่ยนชื่อ channel ไม่ช่วย จึงไม่เก็บการเปลี่ยนชื่อนั้นไว้ แก้หน้า Orders ให้ใช้ lightweight change polling ทุก 5 วินาทีแม้ subscribed เช่นเดียวกับ Ready ไม่ refresh ถ้าข้อมูลไม่เปลี่ยน ยังไม่สามารถระบุสาเหตุภายในบริการ Realtime ที่ส่ง event ไม่ถึง tab นี้ได้', '',
'แก้ตัวทดสอบให้ทำ ready → served → payment และใช้ข้อความปัจจุบัน; ตั้ง fixture ready ก่อนทดสอบ disconnect; เพิ่มกรณี subscribed แต่ไม่มี event; เพิ่ม production mode และ mobile viewport ใน hosted workflow ไม่มี feature ใหม่หรือ refactor เพิ่ม', '',
'## ผลทดสอบ', '', '| ชุด | ผล | หลักฐาน |','|---|---|---|',
`| Production fixture desktop/mobile, 5 รอบต่อ desktop action | ${current.error?'FAIL':'PASS'} | ${root}/current-after-production/results.json |`,
`| Dev fixture desktop/mobile measurements | ${dev.error?'PARTIAL: test setup เก่าของ disconnect; samples ก่อนหน้านั้นครบ':'PASS'} | ${root}/current-after-dev/results.json |`,
`| Final dev roles/retry/realtime/permissions | ${devLive.error?'FAIL':'PASS'} | ${root}/current-final-after-dev-live-only/results.json |`,
`| Final production roles/retry/realtime/permissions | ${prodLive.error?'FAIL':'PASS'} | ${root}/current-final-after-production-live-only/results.json |`,
`| Hosted production 7 รอบ × 5 actions | ${hosted.errors.length?'FAIL':'PASS'} | ${hostedRoot}/${latest}/results.json |`,
`| Hosted ${served.mode} serve/payment desktop + mobile | ${served.errors.length?'FAIL':'PASS'} | .test-artifacts/served-orders/live/test-results.json |`,
...checks.map(c=>`| ${c.name} | ${c.exitCode===0?'PASS':'FAIL'} | ${c.log} |`), '',
'lint: 0 errors, 4 warnings (img 2 จุด และ unused destructured test fields 2 จุด) SQL workflow test เพิ่มเติมผ่าน 1/1 โดยใช้ PGlite ชั่วคราว ไม่เรียก hosted migration', '',
'ครอบคลุม Login, Orders, Kitchen, Ready, Menu, Ingredients, Tables, Add-on และ Users; Admin/kitchen_staff/staff/inactive; kitchen URL ตรง/refresh; missing/expired/revoked session; temporary Auth/Profile failure; retry, double submit, realtime burst/race/disconnect และ subscribed missed-event recovery', '',
'## เวลา production ก่อนงาน → ปัจจุบัน (fixture)', '',
'หน่วย ms: median [min–max], n. Fixture หน่วง HTTP 100 ms ไม่ใช่ความเร็ว hosted database. ±10% เป็นเกณฑ์บรรยาย ไม่ใช่ statistical significance. Payment ปัจจุบันเริ่มหลัง served; ไม่รวมการเสิร์ฟไว้ใน payment และไม่อ้างว่า workflow ทั้งหมดเร็วขึ้น', '',
'| Action | ก่อน DOM | ปัจจุบัน DOM | ปัจจุบัน Playwright | ผล DOM |','|---|---:|---:|---:|---|'];
for(const n of ['login','kitchen.start','kitchen.ready','orders.payment','ingredient.save','menu.save','table.toggle','user.save']){
 const a=samples(before,n,'uiMutationMs'),b=samples(current,n,'uiMutationMs');
 lines.push(`| ${n} | ${stat(a)} | ${stat(b)} | ${stat(samples(current,n,'ms'))} | ${classify(a,b)} |`);
}
lines.push('', 'Add-on desktop/mobile ก่อน→หลัง n=5 และ dev timing อยู่ในรายงานเดิม; โค้ด Add-on ไม่ได้เปลี่ยนในรอบนี้ ส่วน mobile action อื่นมี behavioral samples ไม่เพียงพอสรุป speedup แยกทุกปุ่ม', '',
'## Hosted production: network / API / DOM / Playwright', '',
'ค่าเหล่านี้เป็นช่วงเวลาซ้อนกัน ห้ามบวกกัน: Supabase fetch วัดถึง headers รวม network/service; Next headers ไม่ใช่ Server Action จบ; users handler มี timer จริง; Click→DOM เป็น MutationObserver ไม่ใช่ paint/CPU. ไม่ประมาณ SQL หรือ pure rendering ด้วยการลบเวลา', '',
'| Action | Supabase fetch union ถึง DOM | Next request→headers | users API handler | Click→DOM | Playwright detection หลัง DOM |','|---|---:|---:|---:|---:|---:|');
const union=spans=>{spans.sort((a,b)=>a[0]-b[0]);let end=-Infinity,total=0;for(const [s,e] of spans){total+=Math.max(0,e-Math.max(s,end));end=Math.max(end,e);}return total;};
for(const n of ['login','user.save','ingredient.save','menu.save','table.toggle']){
 const actions=hosted.actions.filter(a=>a.name===n);
 const net=actions.map(a=>{const cutoff=a.start+a.uiMutationMs;return union(a.backend.filter(b=>b.startedEpochMs&&b.path!=='admin.users.api').map(b=>[Math.max(a.start,b.startedEpochMs),Math.min(cutoff,b.startedEpochMs+b.ms)]).filter(([s,e])=>e>=s));});
 const http=actions.map(a=>{const r=a.requests.find(r=>!r.backend&&(n==='login'?r.path==='/dashboard':r.method==='PATCH'||r.method==='POST'));return r?.headersAt?r.headersAt-r.start:null;}).filter(Number.isFinite);
 lines.push(`| ${n} | ${stat(net)} | ${stat(http)} | ${stat(actions.map(a=>a.backend.find(b=>b.path==='admin.users.api')?.ms).filter(Number.isFinite))} | ${stat(samples(hosted,n,'uiMutationMs'))} | ${stat(actions.map(a=>a.ms-a.uiMutationMs))} |`);
}
lines.push('', 'Order actions ปัจจุบัน (production fixture): RPC จาก browser ไม่มี Next API/Server Action ใน critical path ค่านี้ไม่ใช่ hosted network', '', '| Action | RPC→headers | Read headers→DOM โดยประมาณ | Click→DOM | DOM→Playwright |', '|---|---:|---:|---:|---:|');
for(const n of ['kitchen.start','kitchen.ready','orders.payment']){
 const actions=current.actions.filter(a=>a.name===n);
 const spans=a=>a.requests.map(r=>({r,response:a.responses.find(s=>s.path===r.path)})).filter(x=>x.response).map(({r,response})=>({method:r.method,path:r.path,s:r.startedMs-a.setupMs,e:response.completedMs-a.setupMs}));
 lines.push(`| ${n} | ${stat(actions.map(a=>{const r=spans(a).find(r=>r.path.includes('/rpc/'));return r?r.e-r.s:null;}).filter(Number.isFinite))} | ${stat(actions.map(a=>a.uiMutationMs-Math.max(...spans(a).filter(r=>r.method==='GET'&&r.path.startsWith('/rest/')).map(r=>r.e))).filter(Number.isFinite))} | ${stat(samples(current,n,'uiMutationMs'))} | ${stat(actions.map(a=>a.ms-a.uiMutationMs))} |`);
}
lines.push('', 'Login browser→Supabase แยกจาก server fetch:', '');
for(const p of ['/auth/v1/token','/rest/v1/profiles'])lines.push(`- ${p}: ${stat(hosted.actions.filter(a=>a.name==='login').flatMap(a=>a.requests.filter(r=>r.backend&&r.path===p&&r.end).map(r=>r.end-r.start)))}`);
lines.push('', 'paired A/B/C เดิม 9 รอบต่อเวอร์ชัน: Login DOM 1365 → 1343 → 1073 ms; users DOM 663 → 728 → 504 ms. Users Playwright 846 → 851 → 858 ms ใกล้เดิม แม้ DOM/handler เร็วขึ้น เพราะเวลาตรวจพบของ Playwright. ตาราง Auth variance และ network ของ paired อยู่ในรายงานเดิม ไม่ใช้รอบปัจจุบันคนละช่วงเวลาแทน paired', '',
'## ข้อจำกัดและการจัดประเภท failure', '',
'- hosted timeout งานเสิร์ฟ: ข้อมูล commit แต่ Orders tab พลาด event และไม่มี backstop เป็นช่องโหว่การฟื้นตัวของระบบ; การแก้ backstop ไม่ใช่หลักฐานว่า event ถูกส่งถึง tab แล้ว',
'- dev disconnect fixture timeout: bug ตัวทดสอบที่ยังตั้ง status=served แต่ไปหา ready card; แก้ setup และยืนยัน live suite ใหม่ เก็บผลล้มเหลวไว้',
'- sandbox network failure เกิดก่อน provisioning; รันด้วย network permission ไม่ใช่ system bug',
'- signOut TEST global เดิมแก้ scope local แล้ว; revoked-session case ยังใช้ global เฉพาะ TEST ที่ตั้งใจ revoke',
'- Production คือ local next build/start ต่อ hosted Supabase ไม่ได้ deploy; mobile เป็น viewport emulation ไม่ใช่เครื่องจริง',
'- ช่วงวัดใหม่มี browser/build tests ทำงานพร้อมกันบางช่วง จึงมี CPU/load confounding; dev มี HMR ระหว่างรอบ ห้ามใช้เป็น controlled benchmark หรือแทน paired เดิม',
'- DOM timestamp เป็น semantic mutation; streaming headers, cross-clock rounding และ wait polling ทำให้ไม่สามารถแยก pure DOM rendering / network transport / SQL execution ทั้งหมดได้', '',
'## TEST cleanup และ migration', '',
`Hosted performance fingerprintChanges=${JSON.stringify(hosted.fingerprintChanges)}; hosted workflow cleaned=${registry.cleaned}; errors=${served.errors.length}. Workflow ตรวจ original 23 tables/views + Auth ทุกช่วงและหลัง cleanup. ลบเฉพาะ registered TEST IDs ไม่มีการซ่อมหรือเขียนทับข้อมูลจริง`, '',
'ไม่มี migration ถูกเรียกในรอบนี้ ไม่มี reset/Undo/checkout ทับ และยังไม่ commit/push. แต่ไม่สามารถยืนยันว่าไม่เคยมี migration ก่อนรอบนี้: artifact apply.txt และ schema-after-verified.json บันทึก migration 20260923100000 ถูกใช้ก่อนเริ่มรอบนี้แล้ว เก็บไฟล์และงานเดิมไว้ทั้งหมด', '',
'Fingerprint ยืนยันเฉพาะข้อมูล/คอลัมน์ที่ inventory อ่านได้และ Auth users ไม่ครอบคลุม sequences, Auth internal sessions/audit logs หรือ Storage blobs; จึงยืนยันไม่มีข้อมูลจริงเปลี่ยนในขอบเขต fingerprint ไม่อ้างเกินหลักฐาน', '',
'## git diff --stat', '', '```text',execFileSync('git',['-c','core.safecrlf=false','diff','--stat'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim(),'```', '',
'## ไฟล์ที่แก้/เพิ่มทั้งหมด รวมงานค้างเดิม', '', '```text',execFileSync('git',['status','--short','--untracked-files=all'],{encoding:'utf8'}).trim(),'```', '',
'## Final live assertions', '', ...prodLive.checks.map(c=>`- ${c}`),'',...served.checks.map(c=>`- ${c}`),'');
writeFileSync('docs/dashboard-performance-current.md',lines.join('\n'));
