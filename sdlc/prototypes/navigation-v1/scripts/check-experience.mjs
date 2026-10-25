import {createRequire} from 'node:module';
const require=createRequire('/app/package.json');
const {chromium}=require('@playwright/test');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
const routes=['/overview','/systems','/system/system-atendimento/overview','/system/system-atendimento/activity','/assistant','/releases','/release/release-r2/branches','/integrations','/story/story-consulta/overview'];
for(const route of routes){await page.goto(`http://127.0.0.1:8080/#${route}`);await page.waitForTimeout(300);console.log(JSON.stringify({route,title:await page.locator('h1').allTextContents(),errors:[...errors]}));await page.screenshot({path:`/output/experience-${route.split('/').filter(Boolean).join('-')}.png`,fullPage:true});}
await page.setViewportSize({width:390,height:844});await page.goto('http://127.0.0.1:8080/#/systems');await page.waitForTimeout(200);console.log('mobile overflow',await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth));await page.screenshot({path:'/output/experience-mobile-systems.png',fullPage:true});
await browser.close();if(errors.length)process.exitCode=1;
