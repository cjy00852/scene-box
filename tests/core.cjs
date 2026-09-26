/* npm install; npx playwright install chromium; npm test
 * Windows system Edge: SCENE_TEST_BROWSER=msedge npm test. No Google account used. */
const {chromium}=require('playwright');
const fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 if(req.url==='/seed'){res.setHeader('Content-Type','text/html');res.end('<title>Test database setup</title>');return}
 const file=path.resolve(root,'.'+decodeURIComponent(req.url==='/'?'/index.html':req.url.split('?')[0]));
 if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403).end();return}
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream');res.end(data)});
});
async function waitUntil(check){const end=Date.now()+25000;while(Date.now()<end){if(await check())return;await new Promise(r=>setTimeout(r,100))}throw Error("Async condition timed out")}
async function main(){
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,...(process.env.SCENE_TEST_BROWSER?{channel:process.env.SCENE_TEST_BROWSER}:{})});
 try{
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}}),page=await context.newPage(),base='http://127.0.0.1:'+server.address().port,errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/google-config.js',r=>r.fulfill({contentType:'text/javascript',body:'window.SCENE_GOOGLE_CLIENT_ID="";'}));
 let promptValue='';page.on('dialog',d=>d.accept(d.type()==='prompt'?promptValue:undefined));
 await page.goto(base+'/seed');
 await page.evaluate(async()=>{
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('scene-box-db',2);r.onupgradeneeded=()=>{r.result.createObjectStore('photos',{keyPath:'id'});r.result.createObjectStore('settings',{keyPath:'key'})};r.onsuccess=()=>resolve(r.result);r.onerror=reject});
  const t=db.transaction(['photos','settings'],'readwrite');
  t.objectStore('photos').put({id:'legacy',name:'옛날 사진',originalName:'original.jpg',blob:new Blob(['1234567'],{type:'image/jpeg'}),members:['원이'],bubble:true,membership:true,addedAt:new Date(2026,8,20).getTime(),tags:[]});
  t.objectStore('photos').put({id:'other',name:'다른 사진',originalName:'other.jpg',blob:new Blob(['123'],{type:'image/jpeg'}),members:[],tags:[],addedAt:1});
  t.objectStore('settings').put({key:'scene-box-hero-bg-v2',value:{dim:30}});
  await new Promise((resolve,reject)=>{t.oncomplete=resolve;t.onerror=reject});db.close();
 });
 await page.goto(base);await page.waitForFunction(()=>typeof items!=='undefined'&&items.length===2&&document.getElementById('driveStatus').textContent);
 assert.deepEqual(await page.evaluate(()=>SceneData.refreshUsage()),{bytes:10,count:2});
 assert.deepEqual(await page.evaluate(()=>SceneCategories.ids(items.find(x=>x.id==='legacy'))),['legacy-bubble','legacy-membership']);
 assert.equal(await page.evaluate(()=>getBgSettings().dim),30);
 assert.equal(await page.evaluate(()=>SceneData.formatBytes(842*1024**2)),'842MB');
 assert.equal(await page.evaluate(()=>SceneData.formatBytes(3.47*1024**3)),'3.47GB');
 await page.evaluate(async()=>{const x=await SceneData.photo('other');x.blob=new Blob(['12345678']);await put(x)});
 assert.equal((await page.evaluate(()=>SceneData.refreshUsage())).bytes,15);
 await page.evaluate(async()=>{await del('other');await load()});assert.equal((await page.evaluate(()=>SceneData.refreshUsage())).bytes,7);
 await page.reload();await page.waitForFunction(()=>typeof items!=='undefined'&&items.length===1);assert.equal((await page.evaluate(()=>SceneData.refreshUsage())).bytes,7);
 console.log('PASS v2 migration, original bytes, replacement/deletion, reload, MB/GB');
 await page.locator('.header-menu summary').nth(1).click();await page.click('#categoryManagerBtn');
 await page.fill('#categoryName','공식 트위터');await page.click('#addCategory');await page.waitForFunction(()=>SceneCategories.all().some(c=>c.name==='공식 트위터'));
 const categoryId=await page.evaluate(()=>SceneCategories.all().find(c=>c.name==='공식 트위터').id);
 assert.equal(await page.evaluate(()=>{try{SceneCategories.validName(' 공식 트위터 ');return false}catch{return true}}),true);
 await page.evaluate(async id=>{const x=items[0];x.categoryIds=[id];await put(x);await load()},categoryId);
 promptValue='팬사인회';await page.locator(`[data-category-id="${categoryId}"] [data-action="rename"]`).click();await page.waitForFunction(()=>SceneCategories.all().some(c=>c.name==='팬사인회'));
 await page.locator(`[data-category-id="${categoryId}"] [data-action="delete"]`).click();await page.waitForFunction(()=>items[0].categoryIds[0]==='category-other');assert.equal((await page.evaluate(()=>SceneData.refreshUsage())).bytes,7);
 await page.click('#closeCategories');await page.click('#homeBtn');assert.deepEqual(errors,[]);
 console.log('PASS custom category add/duplicate/rename/delete preserving originals');
 const rules=await page.evaluate(()=>{
  const r=SceneDriveRules,c=[{id:'bubble',name:'버블'}];return {
   combo:r.route({members:['제나','원이']},[]).map(x=>x.name),order:r.memberName({members:['미나미','리브']}),group:r.route({members:r.order},[])[0].name,
   custom:r.route({members:['원이'],categoryIds:['bubble']},c)[0].name,
   actual:r.nameParts({members:['원이'],date:'2026-09-20',originalName:'a.JPG'},[],null,Date.now()),
   fallback:r.nameParts({members:['원이'],addedAt:new Date(2026,8,20).getTime(),originalName:'a.mp4'},[],null,Date.now())
  };
 });
 assert.deepEqual(rules.combo,['2인 이상','원이+제나']);assert.equal(rules.order,'리브+미나미');assert.equal(rules.group,'단체');assert.equal(rules.custom,'버블');assert.equal(rules.actual.prefix,'260920_일반_원이_');assert.equal(rules.actual.ext,'JPG');assert.equal(rules.fallback.prefix,'등록일260920_일반_원이_');
 await page.locator('.header-menu summary').nth(1).click();await page.click('#driveSyncBtn');assert.equal(await page.locator('#driveConnect').isDisabled(),true);await page.click('#closeDrive');
 console.log('PASS deterministic folder/name rules and missing OAuth configuration');
 const metadataDates=await page.evaluate(async()=>{
  const tiff=new Uint8Array(46),v=new DataView(tiff.buffer);tiff.set([73,73]);v.setUint16(2,42,true);v.setUint32(4,8,true);v.setUint16(8,1,true);v.setUint16(10,0x9003,true);v.setUint16(12,2,true);v.setUint32(14,20,true);v.setUint32(18,26,true);tiff.set(new TextEncoder().encode('2026:09:19 12:00:00\0'),26);
  const jpeg=new Blob([new Uint8Array([255,216,255,225,0,54,69,120,105,102,0,0]),tiff,new Uint8Array([255,217])],{type:'image/jpeg'});
  const mov=new Uint8Array(36),m=new DataView(mov.buffer);m.setUint32(0,36);mov.set(new TextEncoder().encode('moov'),4);m.setUint32(8,28);mov.set(new TextEncoder().encode('mvhd'),12);m.setUint32(20,Date.UTC(2026,8,18)/1000+2082844800);
  const dates=await Promise.all([SceneDriveRules.captureDate(jpeg),SceneDriveRules.captureDate(new Blob([mov],{type:'video/quicktime'})),SceneDriveRules.captureDate(new Blob(['broken']))]);
  const priority=SceneDriveRules.nameParts({date:'2026-09-20',members:['원이']},[],dates[0],Date.now()).prefix;
  return {dates,priority};
 });
 assert.deepEqual(metadataDates.dates,['2026:09:19 12:00:00','2026-09-18',null]);assert.equal(metadataDates.priority,'260919_일반_원이_');
 await page.evaluate(async()=>{await put({id:'orphan-category',blob:new Blob(['x']),categoryIds:['deleted-category']})});
 assert.deepEqual(await page.evaluate(async()=>(await SceneData.photo('orphan-category')).categoryIds),['category-other']);await page.evaluate(()=>del('orphan-category'));
 console.log('PASS EXIF/video dates, metadata priority, unknown category recovery');
 // Fake API: no real credentials, uploads, or Google requests leave this test context.
 const files=new Map(),sessions=new Map();let ids=0,oauthCalls=0,uploadCalls=0,failUpload=false,unauthorized=false,failRoot=false,alwaysFail=false,activeUploads=0,peakUploads=0;
 await context.route('**/google-config.js',r=>r.fulfill({contentType:'text/javascript',body:'window.SCENE_GOOGLE_CLIENT_ID="test-client";'}));
 await context.route('https://accounts.google.com/gsi/client',r=>r.fulfill({contentType:'text/javascript',body:'window.google={accounts:{oauth2:{initTokenClient:o=>({requestAccessToken:()=>{window.testOAuthCalls=(window.testOAuthCalls||0)+1;Object.defineProperty(document,"hidden",{configurable:true,value:true});o.callback({access_token:"TEST_ONLY",expires_in:3600});setTimeout(()=>{Object.defineProperty(document,"hidden",{configurable:true,value:false});document.dispatchEvent(new Event("visibilitychange"))},100)}})}}};'}));
 await context.addInitScript(()=>{Object.defineProperty(navigator,'wakeLock',{value:{request:async()=>{window.wakeRequests=(window.wakeRequests||0)+1;return {release:async()=>{window.wakeReleases=(window.wakeReleases||0)+1}}}}})});
 await context.route('https://www.googleapis.com/**',async route=>{
  const req=route.request(),u=new URL(req.url()),method=req.method(),body=()=>JSON.parse(req.postData()||'{}');
  const send=(data,status=200,headers={})=>route.fulfill({status,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*','Access-Control-Expose-Headers':'Location,Range',...headers},body:JSON.stringify(data)});
  if(method==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PATCH,PUT,OPTIONS','Access-Control-Allow-Headers':'*'}});
  if(unauthorized){unauthorized=false;return send({error:{message:'expired'}},401)}
  if(u.pathname.endsWith('/about')){oauthCalls++;return send({user:{permissionId:'test-account',emailAddress:'test@example.invalid'}})}
  if(u.pathname.endsWith('/generateIds'))return send({ids:['g'+(++ids)]});
  if(u.pathname.startsWith('/upload/')){
   const uploadId=u.searchParams.get('upload_id');
   if(method==='POST'||method==='PATCH'){
    const meta=body(),id=meta.id||u.pathname.split('/').pop(),key='session-'+id;sessions.set(key,{id,meta});
    return send({},200,{Location:'https://www.googleapis.com/upload/drive/v3/files?upload_id='+key});
   }
   const session=sessions.get(uploadId);if(!session)return send({},404);
   if(req.headers()['content-range']?.startsWith('bytes */'))return files.has(session.id)?send({id:session.id}):send({},308);
   if(session.meta.appProperties?.sceneBoxId?.startsWith('parallel-')){activeUploads++;peakUploads=Math.max(peakUploads,activeUploads);await new Promise(r=>setTimeout(r,1000));activeUploads--;}
   uploadCalls++;if(failUpload||alwaysFail){failUpload=false;return send({error:{message:'temporary upload failure'}},503)}
   files.set(session.id,{...files.get(session.id),...session.meta,id:session.id,parents:session.meta.parents||files.get(session.id)?.parents||[],trashed:false});return send({id:session.id});
  }
  const id=u.pathname.match(/\/files\/([^/]+)$/)?.[1];
  if(id){if(failRoot&&files.get(id)?.appProperties?.sceneBoxFolder==='root'){failRoot=false;return send({error:{message:'temporary folder check failure'}},503)}const file=files.get(id);if(!file)return send({},404);if(method==='PATCH'){Object.assign(file,body());if(u.searchParams.has('addParents'))file.parents=[u.searchParams.get('addParents')]}return send(file)}
  if(method==='POST'){const meta=body();if(files.has(meta.id))return send({},409);files.set(meta.id,{...meta,trashed:false});return send(files.get(meta.id))}
  const q=u.searchParams.get('q')||'',parent=q.match(/'([^']+)' in parents/)?.[1],prop=q.match(/key='([^']+)' and value='([^']+)'/);
  const found=[...files.values()].filter(f=>!f.trashed&&(!parent||f.parents?.includes(parent))&&(!prop||f.appProperties?.[prop[1]]===prop[2]));return send({files:found});
 });
 await page.reload();await page.waitForFunction(()=>typeof items!=='undefined'&&items.length===1);await page.locator('.header-menu summary').nth(1).click();await page.click('#driveSyncBtn');await page.waitForFunction(()=>!driveConnect.disabled);await page.click('#driveConnect');
 await waitUntil(()=>page.evaluate(async()=>{const j=await SceneData.jobs();return j.length&&j.every(x=>x.state==='success')})).catch(async e=>{console.log('SYNC DEBUG',await page.locator('#driveStatus').innerText(),await page.evaluate(()=>SceneData.jobs()));throw e});
 const remote=[...files.values()].find(f=>f.appProperties?.sceneBoxId==='legacy');if(!remote)console.log('DEBUG',JSON.stringify([...files.values()]),await page.evaluate(()=>SceneData.jobs()));assert.ok(remote);assert.equal(uploadCalls,1);assert.match(remote.name,/^등록일260920_기타_원이_001\.jpg$/);
 const originalId=remote.id;
 await page.evaluate(async()=>{const x=items[0];x.categoryIds=[];x.members=['제나','원이'];await put(x);await load()});
 await waitUntil(()=>page.evaluate(async()=>(await SceneData.jobs()).find(j=>j.id==='legacy').state==='success'));assert.equal(uploadCalls,1);assert.equal([...files.values()].filter(f=>f.appProperties?.sceneBoxId==='legacy').length,1);assert.equal(files.get(originalId).parents[0],[...files.values()].find(f=>f.name==='원이+제나').id);
 console.log('PASS queued original upload, stable Drive ID, metadata-only folder move');
 await page.evaluate(async()=>{const x=await SceneData.photo('legacy');x.driveName='260920_TMA_원이+제나_001.jpg';x.name='260920_TMA_원이+제나_001';x.originalName=x.driveName;await put(x);await load()});
 await waitUntil(()=>page.evaluate(async()=>(await SceneData.jobs()).find(j=>j.id==='legacy').state==='success'));
 assert.equal(files.get(originalId).name,'260920_TMA_원이+제나_001.jpg');assert.equal(uploadCalls,1);assert.match(await page.locator('#driveUploadList').innerText(),/TMA/);
 const rootFile=[...files.values()].find(f=>f.appProperties?.sceneBoxFolder==='root');rootFile.trashed=true;
 await page.evaluate(()=>SceneDrive.run());assert.equal(rootFile.trashed,false);assert.equal(files.get(originalId).id,originalId);
 files.delete(rootFile.id);await page.evaluate(()=>SceneDrive.run());
 const newRoot=[...files.values()].find(f=>f.appProperties?.sceneBoxFolder==='root');assert.ok(newRoot);assert.notEqual(newRoot.id,rootFile.id);assert.equal(files.get(originalId).id,originalId);assert.equal(uploadCalls,1);
 console.log('PASS same Drive filename without reupload, upload list, trashed-root recovery and deleted-root recreation');

 await page.click('#closeDrive');await page.locator('.header-menu summary').nth(1).click();await page.click('#categoryManagerBtn');
 await page.fill('#categoryName','Drive 폴더 테스트');await page.click('#addCategory');
 await waitUntil(()=>Promise.resolve([...files.values()].some(f=>f.name==='Drive 폴더 테스트')));
 const folderBefore=[...files.values()].find(f=>f.name==='Drive 폴더 테스트');
 const driveCategoryId=await page.evaluate(()=>SceneCategories.all().find(c=>c.name==='Drive 폴더 테스트').id);
 promptValue='Drive 이름 변경';await page.locator(`[data-category-id="${driveCategoryId}"] [data-action="rename"]`).click();
 await waitUntil(()=>Promise.resolve(files.get(folderBefore.id)?.name==='Drive 이름 변경'));
 await page.click('#closeCategories');
 files.set('occupied-test',{id:'occupied-test',name:'등록일260920_일반_원이+제나_001.jpg',parents:[files.get(originalId).parents[0]],trashed:false});
 await page.evaluate(async()=>{const x=await SceneData.photo('legacy');await put({...x,id:'collision',driveName:undefined,contentVersion:undefined});await load()});
 await waitUntil(()=>page.evaluate(async()=>(await SceneData.jobs()).find(j=>j.id==='collision')?.state==='success'));
 assert.match([...files.values()].find(f=>f.appProperties?.sceneBoxId==='collision').name,/_002\.jpg$/);
 console.log('PASS empty category folder creation, same-ID rename, filename collision');
 await page.evaluate(async()=>{for(let i=0;i<40;i++)await put({id:'parallel-'+i,name:'parallel',originalName:'p.jpg',blob:new Blob(['p'+i],{type:'image/jpeg'}),members:['미나미','메이'],date:'2026-09-20',tags:[],addedAt:Date.now()});await load()});
 await waitUntil(()=>page.evaluate(async()=>(await SceneData.jobs()).filter(j=>j.id.startsWith('parallel-')).every(j=>j.state==='success')));
 const parallelFiles=[...files.values()].filter(f=>f.appProperties?.sceneBoxId?.startsWith('parallel-'));
 assert.equal(peakUploads,20);assert.equal(parallelFiles.length,40);assert.equal(new Set(parallelFiles.map(f=>f.name)).size,40);assert.equal(new Set(parallelFiles.map(f=>f.parents[0])).size,1);
 assert.equal([...files.values()].filter(f=>f.appProperties?.sceneBoxFolder==='combo:미나미+메이').length,1);
 await page.evaluate(()=>SceneDrive.renderStatus());assert.equal(await page.locator('#driveQuickBtn').getAttribute('data-state'),'complete');
 failRoot=true;await page.evaluate(()=>SceneDrive.run());assert.equal(await page.locator('#driveQuickBtn').getAttribute('data-state'),'complete');assert.match(await page.locator('#driveStatus').textContent(),/폴더 확인 실패/);await page.evaluate(()=>SceneDrive.run());assert.doesNotMatch(await page.locator('#driveStatus').textContent(),/폴더 확인 실패/);
 console.log('PASS twenty concurrent uploads, forty unique names and one shared combination folder');
 failUpload=true;
 await page.evaluate(async()=>{await put({id:'retry',name:'retry',originalName:'retry.png',blob:new Blob(['abc'],{type:'image/png'}),members:['메이'],date:'2026-09-20',tags:[],addedAt:Date.now()});await load()});
 await waitUntil(()=>page.evaluate(async()=>(await SceneData.jobs()).find(j=>j.id==='retry')?.attempts===1));
 await page.reload();await page.waitForFunction(()=>typeof SceneDrive!=='undefined'&&typeof db!=='undefined'&&db);await page.evaluate(async()=>{await SceneData.patchJob('retry',j=>({...j,nextAt:0}))});
 await waitUntil(()=>page.evaluate(async()=>(await SceneData.jobs()).find(j=>j.id==='retry').state==='success'));assert.equal([...files.values()].filter(f=>f.appProperties?.sceneBoxId==='retry').length,1);assert.equal(oauthCalls,1);
 console.log('PASS upload retry/resumable session after reload without repeat OAuth');
 unauthorized=true;await page.evaluate(async()=>{const x=await SceneData.photo('retry');x.members=['리브'];await put(x)});
 await page.waitForFunction(()=>driveStatus.textContent.includes('만료'));assert.equal(oauthCalls,1);assert.equal(await page.evaluate(async()=>(await SceneData.jobs()).find(j=>j.id==='retry').state),'pending');
 await page.locator('.header-menu summary').nth(1).click();await page.click('#driveSyncBtn');await page.click('#driveConnect');await waitUntil(()=>page.evaluate(async()=>(await SceneData.jobs()).every(j=>j.state==='success')));assert.equal(oauthCalls,2);
 alwaysFail=true;
 await page.evaluate(async()=>{await put({id:'bounded',name:'bounded',originalName:'bounded.jpg',blob:new Blob(['test'],{type:'image/jpeg'}),members:[],tags:[],addedAt:Date.now()});await load()});
 for(let attempt=1;attempt<=5;attempt++){
  await waitUntil(()=>page.evaluate(async n=>(await SceneData.jobs()).find(j=>j.id==='bounded')?.attempts===n,attempt));
  if(attempt<5)await page.evaluate(()=>SceneData.patchJob('bounded',j=>({...j,nextAt:0})));
 }
 assert.equal(await page.evaluate(async()=>(await SceneData.jobs()).find(j=>j.id==='bounded').state),'failed');
 await page.evaluate(()=>SceneDrive.renderStatus());assert.equal(await page.locator('#driveQuickBtn').getAttribute('data-state'),'error');
 const failedUploadCalls=uploadCalls;await page.evaluate(()=>SceneDrive.run());assert.equal(uploadCalls,failedUploadCalls);
 alwaysFail=false;await page.click('#driveRetry');await waitUntil(()=>page.evaluate(async()=>(await SceneData.jobs()).find(j=>j.id==='bounded').state==='success'));
 console.log('PASS bounded automatic retry and explicit failed-job retry');
 const before=files.size;await page.evaluate(async()=>{await del('retry');await load()});assert.equal(files.size,before);
 files.clear();await page.evaluate(()=>SceneDrive.run());
 assert.equal([...files.values()].filter(f=>f.appProperties?.sceneBoxId).length,await page.evaluate(()=>items.length));
 assert.ok([...files.values()].some(f=>f.appProperties?.sceneBoxFolder==='root'));
 console.log('PASS permanently deleted entire Drive tree rebuilt from local originals');
 await page.waitForFunction(()=>window.wakeReleases>=window.wakeRequests);
 await page.click('#driveDisconnect');await page.waitForFunction(()=>document.getElementById('driveQuickBtn').dataset.state==='disconnected');await page.click('#closeDrive');await page.click('#driveQuickBtn');assert.equal(await page.locator('#driveDialog').evaluate(x=>x.open),true);await page.click('#closeDrive');await page.setViewportSize({width:320,height:800});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);console.log('PASS auth expiry pause/manual reconnect, Wake Lock release, local-only delete, mobile layout');
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());
