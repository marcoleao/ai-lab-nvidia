import {createRequire} from 'node:module';
import {mkdirSync, writeFileSync} from 'node:fs';
const require=createRequire('/app/package.json');
const {chromium}=require('@playwright/test');
const output='/evidence/v3';
mkdirSync(output,{recursive:true});
const browser=await chromium.launch({args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const mutations=[];
await page.route('**/api/**',route=>{
  if(!['GET','HEAD'].includes(route.request().method())){
    mutations.push(route.request().method()+' '+route.request().url());return route.abort();
  }
  return route.continue();
});
try{
  await page.goto('http://127.0.0.1:3310/systems',{waitUntil:'networkidle'});
  await page.screenshot({path:output+'/portal-reference-desktop.png',fullPage:true});
  const shell=await page.evaluate(()=>({
    brand:document.querySelector('.sidebar .brand')?.innerText,
    navigation:[...document.querySelectorAll('.sidebar nav a')].map(a=>a.innerText),
    sidebarWidth:document.querySelector('.sidebar')?.getBoundingClientRect().width,
    topbar:document.querySelector('.topbar')?.innerText,
    title:document.querySelector('h1')?.innerText,
  }));
  writeFileSync(output+'/portal-reference.json',JSON.stringify({shell,mutations},null,2));
  console.log(JSON.stringify({shell,mutations}));
}finally{await browser.close();}
