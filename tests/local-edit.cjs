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
 const browser=await chromium.launch({headless:true,channel:process.env.SCENE_TEST_BROWSER||'msedge'});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'}),errors=[],messages=[];
 page.on('pageerror',e=>errors.push(e.message));let promptValue='',acceptConfirm=true;
 page.on('dialog',d=>{messages.push(d.message());return d.type()==='confirm'&&!acceptConfirm?d.dismiss():d.accept(d.type()==='prompt'?promptValue:undefined)});
 await page.route('https://accounts.google.com/**',r=>r.abort());await page.route('https://www.googleapis.com/**',r=>r.abort());
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>typeof SceneCategories!=='undefined'&&SceneCategories.all().length);
 assert.equal(await page.locator('#memberChips .filter-group').count(),2);assert.equal(await page.locator('#categoryChips [data-m="category:category-other"]').count(),0);assert.equal(await page.locator('#categoryChips > :last-child').getAttribute('aria-label'),'사용자 분류 추가');
 promptValue='팬사인회';await page.click('.category-add');await page.waitForFunction(()=>SceneCategories.all().some(c=>c.name==='팬사인회'));
 for(const id of ['importCategories','editCategories','bulkCategories'])assert.equal(await page.locator('#'+id+' option[value="category-other"]').count(),0);
 assert.equal(await page.locator('#bulkMemberButtons [data-bulk-member="기타"]').count(),1);
 const cat=await page.evaluate(()=>SceneCategories.all().find(c=>c.name==='팬사인회').id);
 assert.equal(await page.locator('[data-m="category:'+cat+'"]').count(),1);
 await page.click('[data-m="category:'+cat+'"]');assert.equal(await page.evaluate(id=>memberFilters.has('category:'+id),cat),true);await page.click('#homeBtn');
 const size=await page.evaluate(()=>SceneCategories.all().length);
 promptValue=' 팬사인회 ';await page.click('.category-add');promptValue='   ';await page.click('.category-add');assert.equal(await page.evaluate(()=>SceneCategories.all().length),size);
 await page.evaluate(async cat=>{for(let i=0;i<3;i++)await put({id:'local-'+i,name:'media '+i,blob:new Blob(['original-'+i],{type:i===1?'video/mp4':'image/jpeg'}),originalName:i===1?'original.mp4':'original.jpg',members:['원이'],categoryIds:[cat],date:'2026-01-0'+(i+1),activity:'행사 '+i,tags:['보존'],note:'메모',fav:true,addedAt:1});await load()},cat);
 const snapshot=()=>page.evaluate(async()=>{const all=await Promise.all(items.map(async x=>({...x,blob:await x.blob.text()})));return all.sort((a,b)=>a.id.localeCompare(b.id))});
 const before=await snapshot();
 await page.click('#selectionModeBtn');assert.equal(await page.locator('#selectionStatus').innerText(),'0개 선택');
 await page.locator('.card[data-id="local-0"] .photo-open').click();assert.equal(await page.locator('#selectionStatus').innerText(),'1개 선택');
 await page.click('#selectAllMedia');assert.equal(await page.locator('#bulkBar .bulk-row').count(),3);
 assert.equal(await page.locator('#bulkBar').evaluate(e=>e.getBoundingClientRect().height<160),true);
 assert.equal(await page.locator('#bulkShare').innerText(),'선택 공유');
 assert.equal(await page.locator('#bulkDownload').innerText(),'선택 다운');
 assert.equal(await page.locator('#selectionStatus').innerText(),'3개 선택');
 await page.click('#deselectMedia');assert.equal(await page.locator('#selectionStatus').innerText(),'0개 선택');assert.equal(await page.locator('#openBulkEdit').isDisabled(),true);
 await page.click('#selectAllMedia');await page.click('#openBulkEdit');await page.click('#saveBulkEdit');assert.match(messages.at(-1),/입력/);
 await page.fill('#bulkEditDate','2026-09-20');acceptConfirm=false;await page.click('#saveBulkEdit');assert.deepEqual(await snapshot(),before);
 acceptConfirm=true;await page.click('#saveBulkEdit');await page.waitForFunction(()=>items.every(x=>x.date==='2026-09-20'));
 let after=await snapshot();assert.deepEqual(after.map(x=>x.activity),before.map(x=>x.activity));
 await page.click('#openBulkEdit');await page.fill('#bulkEditActivity','새 행사');await page.click('#saveBulkEdit');await page.waitForFunction(()=>items.every(x=>x.activity==='새 행사'));
 assert.ok((await snapshot()).every(x=>x.date==='2026-09-20'));
 await page.click('#openBulkEdit');await page.fill('#bulkEditDate','2026-09-21');await page.fill('#bulkEditActivity','최종 행사');await page.click('#saveBulkEdit');await page.waitForFunction(()=>items.every(x=>x.date==='2026-09-21'&&x.activity==='최종 행사'));
 after=await snapshot();const preserve=x=>{const copy={...x};for(const key of ['date','activity','syncRevision'])delete copy[key];return copy};assert.deepEqual(after.map(preserve),before.map(preserve));
 assert.ok(messages.includes('선택한 3개의 날짜/행사를 변경하시겠습니까?'));assert.ok(messages.includes('3개의 날짜/행사를 변경했습니다.'));
 await page.click('#cancelSelection');assert.equal(await page.locator('#selectionActions').isVisible(),false);
 await page.reload();await page.waitForFunction(()=>typeof items!=='undefined'&&items.length===3);assert.deepEqual(await snapshot(),after);
 await page.locator('.card[data-id="local-0"] .photo-open').click();assert.equal(await page.locator('#lightboxDialog').isVisible(),true);await page.keyboard.press('Escape');
 await page.locator('.header-menu summary').nth(1).click();await page.click('#categoryManagerBtn');
 await page.locator('[data-category-id="'+cat+'"] [data-action="up"]').click();
 await page.waitForFunction(id=>SceneCategories.all().findIndex(c=>c.id===id)<SceneCategories.all().findIndex(c=>c.id==='legacy-membership'),cat);
 await page.click('#closeCategories');await page.reload();await page.waitForFunction(()=>typeof items!=='undefined'&&items.length===3);
 assert.equal(await page.locator('#categoryChips .chip').nth(1).getAttribute('data-m'),'category:'+cat);
 await page.locator('.header-menu summary').nth(1).click();await page.click('#categoryManagerBtn');promptValue='변경한 분류';await page.locator('[data-category-id="'+cat+'"] [data-action="rename"]').click();await page.waitForFunction(()=>SceneCategories.all().some(c=>c.name==='변경한 분류'));
 await page.locator('[data-category-id="'+cat+'"] [data-action="delete"]').click();await page.waitForFunction(()=>items.every(x=>x.categoryIds.includes('category-other')));assert.equal(await page.evaluate(()=>items.length),3);
 await page.click('#closeCategories');
 await page.evaluate(()=>openEdit('local-0'));assert.equal(await page.locator('#editCategories option[value="category-other"]').count(),0);
 await page.click('#saveEdit');await page.waitForFunction(()=>!editDialog.open);assert.equal(await page.evaluate(()=>items.find(x=>x.id==='local-0').categoryIds.includes('category-other')),true);
 await page.setViewportSize({width:320,height:800});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
 console.log('PASS category + placement/add/validation/select/rename/delete; selection controls; blank/cancel/date-only/activity-only/both edits; original and metadata preservation; reload; viewer; mobile width');
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());
