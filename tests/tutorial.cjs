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
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:process.env.SCENE_TEST_BROWSER||'msedge'});
 try{const page=await browser.newPage({viewport:{width:320,height:640},serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/google-config.js',r=>r.fulfill({contentType:'text/javascript',body:'window.SCENE_GOOGLE_CLIENT_ID="";'}));
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>document.querySelector('#tutorialDialog').open);
 assert.equal(await page.locator('#tutorialProgress').innerText(),'1 / 8');assert.equal(await page.locator('#tutorialPrev').isDisabled(),true);
 for(let i=1;i<8;i++){await page.click('#tutorialNext');assert.equal(await page.locator('#tutorialProgress').innerText(),(i+1)+' / 8')}
 assert.match(await page.locator('#tutorialBody').innerText(),/재연결/);await page.click('#tutorialPrev');assert.equal(await page.locator('#tutorialProgress').innerText(),'7 / 8');await page.click('#tutorialNext');await page.click('#tutorialNext');assert.equal(await page.locator('#tutorialDialog').isVisible(),false);
 await page.reload();await page.waitForFunction(()=>typeof items!=='undefined'&&typeof db!=='undefined'&&db);assert.equal(await page.locator('#tutorialDialog').isVisible(),false);
 await page.click('#tutorialBtn');assert.equal(await page.locator('#tutorialProgress').innerText(),'1 / 8');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.keyboard.press('Escape');assert.equal(await page.locator('#tutorialDialog').isVisible(),false);
 assert.equal(await page.evaluate(()=>items.length),0);assert.equal((await page.evaluate(()=>SceneData.refreshUsage())).bytes,0);assert.deepEqual(errors,[]);
 console.log('PASS first-visit guide, eight steps, back/finish/Escape, persisted dismissal, reopen, mobile layout, no data changes');
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());
