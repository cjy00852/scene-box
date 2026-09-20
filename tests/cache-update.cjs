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
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{const context=await browser.newContext(),page=await context.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>navigator.serviceWorker.controller);
 assert.equal(await page.evaluate(()=>document.querySelector('script[src="scene-categories.js?v=28"]')!==null),true);
 await context.setOffline(true);await page.reload();await page.waitForFunction(()=>typeof SceneCategories!=='undefined'&&SceneCategories.all().length);
 assert.equal(await page.locator('#bulkCategories option[value="category-other"]').count(),0);
 console.log('PASS versioned category script precached and available offline without fallback category');
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());
