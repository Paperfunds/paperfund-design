/* global document, innerWidth */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const output = process.argv[2] ?? 'preview-verification';
fs.mkdirSync(output,{recursive:true});
const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const context = await browser.newContext();
const external=[], errors=[], results=[];
await context.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(!['127.0.0.1','localhost'].includes(u.hostname) && ['http:','https:'].includes(u.protocol)){external.push(u.origin);return route.abort();}
  return route.continue();
});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
for(const width of [1600,390]) {
  await page.setViewportSize({width,height:1000});
  for(const route of ['/pulse','/trade?mint=AxPzkSJKU3ACqZu7qpq8ov29g4BENZBM4SAZwUUUFo8M','/practice?mint=AxPzkSJKU3ACqZu7qpq8ov29g4BENZBM4SAZwUUUFo8M','/hourly','/daily','/history','/rewards']){
    await page.goto('http://127.0.0.1:5230'+route);
    await page.waitForTimeout(1800);
    const state=await page.evaluate(()=>({banner:document.getElementById('designer-notice')?.textContent,text:document.getElementById('root')?.innerText.slice(0,500),overflow:document.documentElement.scrollWidth>innerWidth+2,rootNodes:document.getElementById('root')?.childElementCount}));
    results.push({width,route,...state});
    if(route.startsWith('/trade')||route==='/pulse')await page.screenshot({path:output+'/'+(route==='/pulse'?'pulse':'trade')+'-'+width+'.png',fullPage:true});
  }
}
const mutation = await page.evaluate(async()=>{const r=await fetch('/api/v1/trades/buy',{method:'POST',body:'{}'});return {status:r.status,body:await r.json()};});
const summary={results,external,errors,mutation};fs.writeFileSync(output+'/browser.json',JSON.stringify(summary,null,2));
await browser.close();
console.log(JSON.stringify({routes:results.length,errors,external,mutation,overflows:results.filter(r=>r.overflow).map(r=>({width:r.width,route:r.route}))}));
if(errors.length||external.length||mutation.status!==403||results.some(r=>!r.banner||!r.rootNodes))process.exitCode=1;
