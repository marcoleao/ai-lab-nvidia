// Opt-in business UI checks. No API calls, storage injection or application edits.
import {chromium,expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';

const [devUrl,sourceSha,imageId]=process.argv.slice(2);
if(!/^http:\/\/(?:localhost|127\.0\.0\.1):\d+\/?$/.test(devUrl??'')||!/^[a-f0-9]{40}$/.test(sourceSha??'')||!/^sha256:[a-f0-9]{64}$/.test(imageId??''))throw Error('Supply the DEV URL, source SHA and image observed in the Portal.');
const photos={http:'http://127.0.0.1:8049/jewel.svg',https:'https://127.0.0.1:8449/jewel.svg',query:'https://127.0.0.1:8449/jewel.svg?size=2'};
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},ignoreHTTPSErrors:true,recordVideo:{dir:'/reports/video'}});
const page=await context.newPage();page.setDefaultTimeout(8000);
const cases=[],dialogs=[],created=new Map();let setupError=null;
page.on('dialog',async dialog=>{dialogs.push({type:dialog.type(),message:dialog.message()});await dialog.accept();});
async function record(id,name,run,dependencies=[]){
 const row={id,name,at:new Date().toISOString()};
 if(setupError||dependencies.some(id=>!cases.some(row=>row.id===id&&row.status==='PASSED'))){row.status='BLOCKED';row.reason=setupError??'Required photo registration was not confirmed.';cases.push(row);return;}
 try{await run();row.status='PASSED';}
 catch(error){row.status='FAILED';row.error=String(error.message).slice(0,1800);row.visible=await page.locator('body').ariaSnapshot().catch(()=>null);}
 row.screenshot=id+'.png';await page.screenshot({path:'/reports/'+row.screenshot,fullPage:true});cases.push(row);
}
async function fill(sku,photo,price='199.90'){
 await page.getByRole('textbox',{name:'SKU:',exact:true}).fill(sku);
 await page.getByRole('textbox',{name:'Nome:',exact:true}).fill('Joia de teste '+sku);
 await page.getByRole('textbox',{name:'Material:',exact:true}).fill('Prata');
 await page.getByRole('spinbutton',{name:'Preço (BRL):',exact:true}).fill(price);
 await page.getByRole('combobox',{name:'Categoria:',exact:true}).first().selectOption({label:'Anéis de teste'});
 await page.getByRole('combobox',{name:'Coleção:',exact:true}).selectOption({label:'Coleção de teste'});
 await page.getByRole('textbox',{name:'Fotos (URL):',exact:true}).fill(photo);
}
const row=sku=>page.getByRole('listitem').filter({hasText:new RegExp('\\b'+sku+'\\b')});
async function image(sku,url){
 const item=row(sku);await expect(item).toBeVisible();
 const img=item.getByRole('img').first();await expect(img).toHaveAttribute('src',url);
 await expect.poll(()=>img.evaluate(node=>node.complete&&node.naturalWidth>0),{timeout:8000}).toBe(true);
}
try{
 try{
  // Fixture readiness is observed by opening its image in the browser.
  for(const url of [photos.http,photos.https]){const fixture=await context.newPage();await fixture.goto(url);await expect(fixture.getByRole('img')).toBeVisible();await fixture.close();}
  await page.goto(devUrl);await expect(page.getByRole('heading',{name:'Catálogo de Joias',exact:true})).toBeVisible();
  await expect(page.getByRole('listitem').filter({hasText:'PHOTO-UI-'})).toHaveCount(0);
  await page.getByRole('textbox',{name:'',exact:true}).nth(0).fill('Anéis de teste');await page.getByRole('button',{name:'Adicionar Categoria',exact:true}).click();
  await page.getByRole('textbox',{name:'',exact:true}).nth(1).fill('Coleção de teste');await page.getByRole('button',{name:'Adicionar Coleção',exact:true}).click();
 }catch(error){setupError=String(error.message).slice(0,1800);}
 for(const [index,key]of ['http','https','query'].entries())await record('PHOTO-UI-0'+(index+1),'Cadastrar e carregar foto '+key,async()=>{
  const sku='PHOTO-UI-'+key.toUpperCase();await fill(sku,photos[key]);await page.getByRole('button',{name:'Cadastrar',exact:true}).click();
  await image(sku,photos[key]);await expect(row(sku)).toContainText('R$ 199,90');created.set(sku,photos[key]);
 });
 await record('PHOTO-UI-04','Recusar protocolo javascript sem cadastrar',async()=>{
  const count=dialogs.length;await fill('PHOTO-UI-UNSAFE','javascript:alert(1)');await page.getByRole('button',{name:'Cadastrar',exact:true}).click();
  await expect(row('PHOTO-UI-UNSAFE')).toHaveCount(0);expect(dialogs.length).toBeGreaterThan(count);expect(dialogs.at(-1).message).toMatch(/URL.*inválida/i);
 });
 await record('PHOTO-UI-05','Persistir joias e fotos após recarregar',async()=>{
  await page.reload();for(const [sku,url]of created)await image(sku,url);
  await expect(page.getByRole('combobox',{name:'Categoria:',exact:true}).nth(1).locator('option:checked')).toHaveText('Todas');
 },['PHOTO-UI-01','PHOTO-UI-02','PHOTO-UI-03']);
 await record('PHOTO-UI-06','Preservar cadastro sem foto e preço zero BRL',async()=>{
  await fill('PHOTO-UI-ZERO','','0');await page.getByRole('button',{name:'Cadastrar',exact:true}).click();await expect(row('PHOTO-UI-ZERO')).toContainText('R$ 0,00');
  await page.reload();await expect(row('PHOTO-UI-ZERO')).toContainText('R$ 0,00');await expect(page.getByText('Dados salvos somente neste navegador',{exact:true})).toBeVisible();
 });
}finally{await context.close();await browser.close();}
const report={version:1,scope:'Independent photo-URL UI checks only; not complete Story acceptance or the 28-case pilot protocol',sourceIdentity:'Supplied from the confirmed Portal publication; this harness does not inspect the backend',devUrl,sourceSha,imageId,method:'Fresh browser context; all synthetic records created through UI; no backend requests, storage/DOM injection or manual application edits',tls:'Self-signed local fixture trusted only in this isolated context; no TLS trust acceptance',setupError,cases,passed:cases.filter(row=>row.status==='PASSED').length,failed:cases.filter(row=>row.status==='FAILED').length,blocked:cases.filter(row=>row.status==='BLOCKED').length};
report.ok=!setupError&&report.failed===0&&report.blocked===0&&report.passed===6;
writeFileSync('/reports/results.json',JSON.stringify(report,null,2));console.log(JSON.stringify({ok:report.ok,passed:report.passed,failed:report.failed,blocked:report.blocked}));
if(!report.ok)process.exitCode=1;
