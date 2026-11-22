import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Local evidence only. No database access and no inferred CPU/SQL timings.
const fixtureRoot = '.test-artifacts/dashboard-performance';
const hostedRoot = '.test-artifacts/hosted-performance';
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const fixture = name => read(`${fixtureRoot}/${name}/results.json`);
const hosted = name => read(`${hostedRoot}/${name}/results.json`);
const median = values => { const a = values.filter(Number.isFinite).sort((a,b) => a-b); return a.length ? (a[Math.floor((a.length-1)/2)] + a[Math.floor(a.length/2)])/2 : null; };
const stats = values => { const a = values.filter(Number.isFinite); return a.length ? `${Math.round(median(a))} [${Math.round(Math.min(...a))}–${Math.round(Math.max(...a))}], n=${a.length}` : 'ไม่ได้วัด'; };
const pick = (run, name, variant) => run.actions.filter(a => a.name === name && (variant === undefined || a.variant === variant));
const compare = (before, after) => { const a = median(before), b = median(after); if (a === null || b === null) return 'หลักฐานไม่พอ'; const change = (b/a-1)*100; return `${Math.abs(change)<10 ? 'ใกล้เคียงเดิม' : change<0 ? 'เร็วขึ้น' : 'ช้าลง'} (${change>0?'+':''}${change.toFixed(1)}%)`; };
const union = intervals => { let total=0, end=-Infinity; for (const [s,e] of intervals.sort((a,b)=>a[0]-b[0])) { total += Math.max(0,e-Math.max(s,end)); end=Math.max(end,e); } return total; };
const latest = readdirSync(hostedRoot).filter(n => n.startsWith('final-after-production-')).map(n=>[n,hosted(n)]).filter(([,r])=>r.after).sort((a,b)=>a[0].localeCompare(b[0])).at(-1);
const paired = hosted('paired-production-1790084839095');
const dev = fixture('final-after-dev'), prod = fixture('final-after-production');
const oldDev = fixture('final-before-dev'), oldProd = fixture('final-before-production');
const lines = ['# Final Report: Kitchen 404 / Dashboard performance', '', `สร้างจากหลักฐานวันที่ ${new Date().toISOString()} — ยังไม่ commit/push/deploy`, '',
'## ขอบเขตและสาเหตุ', '',
'Kitchen route มีอยู่จริง แต่ guard เดิมใช้ notFound() เมื่ออ่าน profile ล้มเหลว/ไม่มี profile/ไม่มีสิทธิ์ ทำให้แสดง 404 ผิดประเภท การฉีด profile 503 ลง baseline ทำซ้ำปัญหาได้ ส่วนเหตุการณ์ที่ผู้ใช้พบในอดีตไม่มี log response เพียงพอที่จะชี้ว่าเป็น upstream error หรือสิทธิ์ใดแน่นอน', '',
'สิ่งที่แก้สะสม: แยก login/access-denied/retryable error; Proxy บันทึก refresh cookie; รวม Auth ต่อ request และอ่าน Auth/profile พร้อมกันโดยตรวจ profile.id ตรงกับผู้ใช้ที่ Auth ยืนยัน; ไม่เชื่อสิทธิ์จาก cookie; ปุ่ม pending/ป้องกัน submit ซ้ำ/คืนปุ่มเมื่อผิดพลาด; order view โหลดเฉพาะข้อมูลที่เปลี่ยน; realtime รวม burst และ replay event ระหว่างอ่าน; ลด refresh ซ้ำ; อ่าน catalog แบบขนาน; API ผู้ใช้แยก unavailable ออกจาก not-found และอัปเดต UI หลังสำเร็จ', '',
'รอบต่อเนื่องนี้รักษา application changes เดิมไว้ แก้/เพิ่มเฉพาะเครื่องมือวัดและรายงาน ใช้ผลที่ผ่านเดิมร่วมกับการเก็บ production ที่ค้าง และเพิ่มหลายรอบในจุดที่หลักฐานเดิมเป็นรอบเดียว', '',
'## เวอร์ชันที่เปรียบเทียบ', '',
'- A ก่อนงานเดิม: `.test-artifacts/dashboard-performance/baseline` (Login/API users/dashboard-auth ตรง HEAD เมื่อ normalize CRLF)',
'- B งานค้างก่อนปรับ Auth แบบขนาน: `.test-artifacts/hosted-performance/before-production-1790084044036/app`',
'- C หลังแก้: workspace ปัจจุบัน; paired run variant 0=C, 1=B, 2=A',
'- A→C fixture ใช้ 5 รอบ/Action; B→C hosted catalog ใช้ 7 รอบ/Action; Login/users ใช้ paired 9 รอบต่อเวอร์ชัน สลับลำดับในช่วงเวลาเดียวกัน', '',
'## ผลทดสอบ', '',
'| ชุด | ผล | หลักฐาน |','|---|---|---|'];
for (const [name,r,path] of [['Final dev desktop/mobile',dev,'final-after-dev'],['Final production desktop/mobile',prod,'final-after-production'],['Baseline dev measurement',oldDev,'final-before-dev'],['Baseline production measurement',oldProd,'final-before-production']]) lines.push(`| ${name} | ${r.error?'FAIL':'PASS'} | ${fixtureRoot}/${path}/results.json (${r.actions.length} actions) |`);
lines.push(`| Hosted production / TEST only | ${latest[1].errors.length?'FAIL':'PASS'} | ${hostedRoot}/${latest[0]}/results.json |`, `| Paired A/B/C production | ${paired.errors.length?'FAIL':'PASS'} | 54 samples; 9 × 2 actions × 3 versions |`, '',
'Fixture suite ครอบคลุม Login, ออเดอร์, ครัว, พร้อมเสิร์ฟ, เมนู, วัตถุดิบ, โต๊ะ, Add-on, ผู้ใช้; Admin/kitchen_staff/staff/inactive; URL ตรงและ refresh; missing/expired session; temporary Auth/Profile failure; manual retry; API/RPC failure; double submit; realtime burst/race/disconnect/polling; mobile viewport และ dev HMR', '',
'รายละเอียด checks ที่ผ่าน (production):', '', ...prod.checks.map(c=>`- ${c}`), '', 'Hosted Supabase checks:', '', ...latest[1].checks.map(c=>`- ${c}`), '',
'## Login / ผู้ใช้: A → B → C (hosted production, สลับเวอร์ชัน)', '',
'หน่วย ms; median [min–max], n. เกณฑ์ใกล้เคียงเดิม ±10% เป็นเกณฑ์บรรยาย ไม่ใช่การพิสูจน์นัยสำคัญทางสถิติ', '',
'| Action / ตัวชี้วัด | A ก่อนงานเดิม | B งานค้าง | C หลังแก้ | A→C | B→C |','|---|---:|---:|---:|---|---|');
for (const name of ['login','user.save']) for (const [field,label] of [['uiMutationMs','DOM'],['ms','Playwright observed']]) {
  const values=[2,1,0].map(v=>pick(paired,name,v).map(a=>a[field]));
  lines.push(`| ${name} / ${label} | ${values.map(stats).join(' | ')} | ${compare(values[0],values[2])} | ${compare(values[1],values[2])} |`);
}
lines.push('', `users API handler (paired B→C): ${stats(pick(paired,'user.save',1).map(a=>a.backend.find(b=>b.path==='admin.users.api')?.ms))} → ${stats(pick(paired,'user.save',0).map(a=>a.backend.find(b=>b.path==='admin.users.api')?.ms))} ms. A ไม่มี timer นี้ จึงไม่ประมาณย้อนหลัง`);
lines.push('', '## ทุก Action ที่วัดซ้ำ: A → C (fixture)', '', 'Supabase fixture หน่วง HTTP 100 ms ต่อคำขอ ตัวเลขนี้แสดงผลจากจำนวน roundtrip/การ render ไม่ใช่ความเร็ว hosted database', '', '| Mode / Action | A DOM | C DOM | A Playwright | C Playwright | DOM เปลี่ยนแปลง |', '|---|---:|---:|---:|---:|---|');
for (const [mode,before,after] of [['dev',oldDev,dev],['production',oldProd,prod]]) for (const name of ['login','kitchen.start','kitchen.ready','orders.payment','ingredient.save','menu.save','table.toggle','user.save']) {
 const b=pick(before,name),a=pick(after,name);
 lines.push(`| ${mode} / ${name} | ${stats(b.map(x=>x.uiMutationMs))} | ${stats(a.map(x=>x.uiMutationMs))} | ${stats(b.map(x=>x.ms))} | ${stats(a.map(x=>x.ms))} | ${compare(b.map(x=>x.uiMutationMs),a.map(x=>x.uiMutationMs))} |`);
}
lines.push('', 'Add-on วัดแยกเฉพาะส่วนที่เดิมไม่มีค่าหลายรอบ โดยใช้ fixture เดียวกัน:', '', '| Mode / Action | A DOM | C DOM | เปลี่ยนแปลง |', '|---|---:|---:|---|');
for(const mode of ['dev','production']) {
 const before=fixture(`final-addon-before-${mode}`),after=fixture(`final-addon-after-${mode}`);
 if(before.error || after.error) throw new Error(`Add-on ${mode} has failed evidence`);
 for(const name of ['addon.save','mobile.addon.save']) {
  const b=pick(before,name).map(a=>a.uiMutationMs),a=pick(after,name).map(a=>a.uiMutationMs);
  lines.push(`| ${mode} / ${name} | ${stats(b)} | ${stats(a)} | ${compare(b,a)} |`);
 }
}
lines.push('', '## Catalog hosted: B → C', '', 'รอบ hosted catalog เดิมไม่มี MutationObserver จึงเปรียบเทียบได้เฉพาะ Playwright observed time ห้ามนำมาอ้างเป็น DOM speedup ส่วน A→C DOM มีการวัดซ้ำใน fixture ตารางก่อนหน้า', '', '| Mode / Action | B Playwright | C Playwright | C DOM | เปลี่ยนแปลงของ Playwright |', '|---|---:|---:|---:|---|');
for (const [mode,b,a] of [['dev',hosted('before-dev-1790083765092'),hosted('after-dev-1790084320664')],['production',hosted('before-production-1790084044036'),latest[1]]]) for (const name of ['ingredient.save','menu.save','table.toggle']) {
 const bv=pick(b,name).map(x=>x.ms),av=pick(a,name).map(x=>x.ms);
 lines.push(`| ${mode} / ${name} | ${stats(bv)} | ${stats(av)} | ${stats(pick(a,name).map(x=>x.uiMutationMs))} | ${compare(bv,av)} |`);
}
lines.push('', 'ชุด B เดิมมี assertion failure ภายหลังการวัดครบ จึงใช้เฉพาะ action สำเร็จที่บันทึกครบ ไม่อ้างว่าชุด B ทั้งชุดผ่าน เวลา dev ต่างช่วง/compile และ hosted ต่างช่วงมี confounding จาก Auth/network', '',
'## แยก Supabase/network, Server Action/API, DOM และ Playwright', '',
'Supabase server fetch วัดเริ่ม fetch ถึง response headers: รวมเครือข่ายและเวลาบริการ ไม่แยก SQL/CPU; network union คือช่วงเวลาคำขอที่ทับกันนับครั้งเดียว ตัดที่ DOM สำเร็จ ไม่ใช่ผลบวกคำขอขนาน; Browser→Next วัด request→response headers ซึ่งรวมการรอ Supabase ภายในจนถึงจังหวะ headers แล้ว จึงห้ามนำมาบวกซ้ำ; API handler วัด server handler จริงเฉพาะ users; DOM วัด MutationObserver เมื่อเงื่อนไขสำเร็จใน DOM ไม่ใช่เวลาวาด pixel', '',
'Next ส่ง response แบบ stream: headers อาจมาก่อน Server Action/render เสร็จ; requestfinished ไม่ถูกบันทึกครบทุกครั้งก่อน measurement drain จบ จึงไม่ใช้ข้อมูลที่เหลือเพียง 1–5 รอบแทนเวลาจบ Action ตารางใช้ headers ครบ 7 รอบ และไม่อ้างว่าเป็นเวลาทำงาน Server Action ทั้งหมด', '',
'| Hosted production Action | Supabase server fetch union | Browser→Next headers | API handler | Click→DOM | DOM→Playwright detection |', '|---|---:|---:|---:|---:|---:|');
for (const name of ['login','user.save','ingredient.save','menu.save','table.toggle']) {
 const actions=pick(latest[1],name);
 const sup=a=> {const cutoff=a.uiMutationMs==null?a.end:a.start+a.uiMutationMs;const spans=a.backend.filter(b=>b.startedEpochMs&&b.path!=='admin.users.api').map(b=>[Math.max(a.start,b.startedEpochMs),Math.min(cutoff,b.startedEpochMs+b.ms)]).filter(([s,e])=>e>=s);return spans.length?union(spans):null;};
 const http=a=> {const r=a.requests.find(r=>!r.backend && (name==='login'?r.path==='/dashboard':r.method==='PATCH'||r.method==='POST'));return r?.headersAt?r.headersAt-r.start:null;};
 lines.push(`| ${name} | ${stats(actions.map(sup))} | ${stats(actions.map(http))} | ${stats(actions.map(a=>a.backend.find(b=>b.path==='admin.users.api')?.ms))} | ${stats(actions.map(a=>a.uiMutationMs))} | ${stats(actions.map(a=>a.uiMutationMs==null?null:a.ms-a.uiMutationMs))} |`);
}
lines.push('', 'Order actions หลังแก้เรียก Supabase RPC จาก browser โดยตรง ไม่มี Next Server Action/API ใน critical path ตารางนี้เป็น production fixture 100 ms ไม่ใช่ hosted network:', '', '| Action | RPC browser→headers | Reads browser→headers union | Click→DOM | Last read headers→DOM | DOM→Playwright |', '|---|---:|---:|---:|---:|---:|');
for(const name of ['kitchen.start','kitchen.ready','orders.payment']) {
 const actions=pick(prod,name);
 const spans=a=>a.requests.map(r=>({r,response:a.responses.find(s=>s.path===r.path)})).filter(x=>x.response).map(({r,response})=>({method:r.method,path:r.path,s:r.startedMs-a.setupMs,e:response.completedMs-a.setupMs}));
 lines.push(`| ${name} | ${stats(actions.map(a=>{const r=spans(a).find(r=>r.path.includes('/rpc/'));return r?r.e-r.s:null;}))} | ${stats(actions.map(a=>union(spans(a).filter(r=>r.method==='GET'&&r.path.startsWith('/rest/')).map(r=>[r.s,r.e]))))} | ${stats(actions.map(a=>a.uiMutationMs))} | ${stats(actions.map(a=>a.uiMutationMs-Math.max(...spans(a).filter(r=>r.method==='GET'&&r.path.startsWith('/rest/')).map(r=>r.e))))} | ${stats(actions.map(a=>a.ms-a.uiMutationMs))} |`);
}
lines.push('', 'Login มี browser→Supabase token/profile เพิ่มเติม ไม่รวมใน server-fetch union ข้างบน:', '', '| Request | ระยะเวลาจาก browser |', '|---|---:|');
for(const path of ['/auth/v1/token','/rest/v1/profiles']) lines.push(`| ${path} | ${stats(pick(latest[1],'login').flatMap(a=>a.requests.filter(r=>r.backend&&r.path===path&&r.end).map(r=>r.end-r.start)))} |`);
lines.push('', 'Auth variance จาก paired ช่วงเดียวกัน:', '', '| Version / action | Auth getUser server fetch |', '|---|---:|');
for (const [label,v] of [['B',1],['C',0]]) for(const name of ['login','user.save']) lines.push(`| ${label} / ${name} | ${stats(pick(paired,name,v).flatMap(a=>a.backend.filter(b=>b.path==='/auth/v1/user').map(b=>b.ms)))} |`);
lines.push('', 'A ไม่มี per-fetch server instrumentation จึงไม่สร้างตัวเลข Supabase ย้อนหลังจาก total; การเร็วขึ้นของ Login ใน paired ยังมี Auth variance ปะปน ส่วน users มี handler และ DOM สอดคล้องกัน', '',
'## Failure classification / ข้อจำกัด', '',
'- Production เดิมถูกพาไป /login ระหว่าง forged-cookie assertion: bug ตัวทดสอบ signOut แบบ global ไป revoke session ของ TEST account เดียวกัน เปลี่ยนเป็น scope local แล้ว final hosted production ผ่าน โดยยังยืนยัน /access-denied ตามเดิม',
'- Add-on pending เดิม: locator อิงข้อความปุ่มที่เปลี่ยนและ Playwright click รอจน pending จบ แก้ fixture response hold + locator field คงที่; ไม่ใช่หลักฐาน save ระบบเสีย',
'- Hosted dev retry เดิมคาดข้อความ TEST จาก backend แต่ UI sanitize เป็นภาษาไทย; realtime เดิมหา text ไม่รวม prefix ที่ UI แสดง: bug ตัวทดสอบ',
'- ครั้งแรกของ final hosted ถูก sandbox ปิด network ก่อน provisioning; รันใหม่ด้วยสิทธิ์ network แล้วผ่าน ไม่จัดเป็น bug ระบบ',
'- Mobile คือ viewport emulation 375×812 ไม่ใช่อุปกรณ์จริง; production คือ build/start ในเครื่อง ไม่ได้ deploy ไป hosting',
'- Mobile action อื่นนอกจาก Add-on, menu availability, cancel และหน้าพร้อมเสิร์ฟมี behavioral coverage แต่ไม่ครบ repeated before/after timing แยกทุกปุ่ม จึงไม่ตัดสินเร็วขึ้น/ช้าลงในส่วนที่ไม่มี samples',
'- ค่า DOM เป็น semantic state ไม่ใช่ paint; Playwright includes polling/wait scheduling; data drain อาจมี prefetch/polling จึงห้ามถือ request count ทั้งหมดเป็น critical path',
'- ค่า last read headers→DOM บางรอบอยู่ที่ -2 ms จากคนละ clock/event delivery และการปัด setupMs จึงใช้ได้เพียงช่วงโดยประมาณ ไม่ใช่เวลาที่ UI เกิดก่อนข้อมูลจริง',
'- ห้ามตีความ residual HTTP-minus-Supabase เป็น CPU ล้วน; ไม่มี DB query plan/SQL execution trace และไม่มี network-controlled hosted A/B สำหรับ catalog', '',
'## TEST cleanup / ข้อมูลจริง', '',
`Final hosted fingerprint inventory ${Object.keys(latest[1].before).length} รายการ (public tables/views และ Auth users): changes = ${JSON.stringify(latest[1].fingerprintChanges)}; cleanup ตรวจ ownership และลบเฉพาะ ID ที่ลง registry ใน invocation นี้`,
`Paired fingerprint changes = ${JSON.stringify(paired.fingerprintChanges)}. ทุกรอบ hosted ที่ provisioning สำเร็จมี fingerprint หลัง cleanup ตรงก่อนเริ่ม ดู results.json ของแต่ละรอบ`,
'Fingerprint ครอบคลุมข้อมูลที่ REST inventory อ่านได้และ Auth users ไม่ได้พิสูจน์ sequence counters, internal Auth session/audit logs หรือ Storage blobs; บัญชี TEST ถูกสร้าง/ล็อกอิน/revoke/ลบตามการทดสอบ', '',
'ไม่มีการรัน migration กับฐานข้อมูลจริง ไม่มี reset/Undo/checkout ทับ ไม่มี commit/push; unit SQL tests ใช้ PGlite ชั่วคราวเท่านั้น ไม่มีการแก้ application เพิ่มในรอบสุดท้าย', '',
'## Final verification', '', ...read(`${fixtureRoot}/final-checks.json`).map(c=>`- ${c.name}: ${c.exitCode===0?'PASS':'FAIL'} (exit ${c.exitCode}); log: ${c.log}`), 'Lint มี warning เดิม 2 จุดเรื่อง img (MenuClient.tsx และ TableQRCode.tsx), ไม่มี error; unit tests 20/20 ผ่าน', '',
'## git diff --stat (tracked files)', '', '```text',execFileSync('git',['-c','core.safecrlf=false','diff','--stat'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim(),'```', '',
'## รายชื่อไฟล์ที่แก้และไฟล์ใหม่', '', 'รวมงานค้างเดิมทั้งหมด; git diff --stat ไม่รวม untracked', '', '```text',execFileSync('git',['status','--short','--untracked-files=all'],{encoding:'utf8'}).trim(),'```','');
writeFileSync('docs/dashboard-performance-final.md',lines.join('\n'));
console.log('Wrote docs/dashboard-performance-final.md');
