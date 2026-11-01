import {test,expect,type Page} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {fixture,storyId,appUrl} from './story-dev-summary-fixtures';

const summary=(page:Page)=>page.getByTestId('story-dev-summary');
const liveLink=(page:Page)=>summary(page).getByRole('link',{name:'Abrir aplicação em DEV ↗',exact:true});

function clean(state:Awaited<ReturnType<typeof fixture>>){expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);}
async function open(page:Page,width=1440,query=''){await page.setViewportSize({width,height:width===390?844:1000});await page.goto(`/stories/${storyId}${query}`);await expect(summary(page)).toBeVisible();}
async function capture(page:Page,name:string){if(!process.env.SCREENSHOT_DIR)return;mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await summary(page).scrollIntoViewIfNeeded();await page.screenshot({path:`${process.env.SCREENSHOT_DIR}/${name}.png`,fullPage:false});}

for(const width of [1440,390])test(`Story exposes current DEV result and opens the application without a writing persona at ${width}px`,async({page})=>{
  const state=await fixture(page);await open(page,width);
  await expect(page.getByRole('combobox',{name:/Persona/})).toHaveValue('');
  await expect(summary(page)).toHaveAccessibleName('Situação da entrega em DEV');
  await expect(summary(page).getByRole('heading',{name:'Versão disponível em DEV',exact:true})).toBeVisible();
  await expect(summary(page)).toContainText(state.progress.message);
  await expect(liveLink(page)).toHaveAttribute('href',appUrl+'/');
  await expect(liveLink(page)).toHaveAttribute('target','_blank');
  await expect(summary(page)).toContainText(appUrl);
  const card=(await summary(page).boundingBox())!,tabs=(await page.getByRole('navigation',{name:'Seções de História'}).boundingBox())!;
  expect(card.y+card.height).toBeLessThanOrEqual(tabs.y);
  expect(card.x).toBeGreaterThanOrEqual(0);expect(card.x+card.width).toBeLessThanOrEqual(width);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.getByRole('button',{name:'Preparar versão DEV',exact:true})).toHaveCount(0);
  await liveLink(page).focus();await expect(liveLink(page)).toBeFocused();
  const popup=page.waitForEvent('popup');await page.keyboard.press('Enter');const app=await popup;
  await expect(app.getByRole('heading',{name:'Hello World',exact:true})).toBeVisible();await app.close();
  await capture(page,`story-dev-summary-${width}`);clean(state);
});

test('Story DEV guidance preserves the query and focuses its owning evidence page after navigation and reload',async({page})=>{
  const state=await fixture(page);await open(page,390,'?tasks.q=preservar&attempt=historical-merge');
  await page.getByRole('navigation',{name:'Seções de História',exact:true}).getByRole('link',{name:'Execução',exact:true}).click();
  await expect(page).toHaveURL(new RegExp(`/stories/${storyId}/execution\\?`));
  const hub=page.getByTestId('story-execution-hub');await expect(hub).toBeVisible();await expect(summary(page)).toHaveCount(0);await expect(hub.getByRole('link',{name:'Abrir aplicação em DEV ↗',exact:true})).toHaveAttribute('href',appUrl+'/');
  await page.goBack();await expect(summary(page)).toBeVisible();
  const next=summary(page).getByRole('link',{name:'Ver pendências de aceitação',exact:true});
  await next.click();await expect(page).toHaveURL(new RegExp(`/stories/${storyId}/execution/dev/approval\\?`));await expect(page).toHaveURL(/tasks.q=preservar/);await expect(page).toHaveURL(/attempt=historical-merge/);
  const heading=page.getByRole('heading',{name:'Revisar aprovação de desenvolvimento',level:1,exact:true});
  await expect(heading).toBeFocused();await expect(page.getByTestId('development-approval-confirmation')).toHaveCount(0);
  await expect(page.getByTestId('development-approval-pendencies')).toContainText('Confira a situação da aprovação da História.');
  await expect(page.getByTestId('development-approval-pendencies')).toContainText('Os testes técnicos não comprovam os critérios da interface.');
  await expect(summary(page)).toHaveCount(0);for(const step of ['build','deployment','test'])await expect(page.getByTestId(`development-${step}`)).toBeHidden();
  const titleBox=(await heading.boundingBox())!;
  expect(titleBox.y).toBeGreaterThanOrEqual(0);
  expect(titleBox.y+titleBox.height).toBeLessThanOrEqual(844);
  const destination=page.url();await page.goBack();await expect(summary(page)).toBeVisible();await next.click();await expect(page).toHaveURL(destination);await expect(heading).toBeFocused();
  const readsBeforePolling=state.journeyReads;
  await expect.poll(()=>state.journeyReads).toBeGreaterThan(readsBeforePolling);
  await expect(heading).toBeFocused();
  await page.reload();await expect(heading).toBeFocused();await expect(summary(page)).toHaveCount(0);
  await page.getByRole('navigation',{name:'Seções de História'}).getByRole('link',{name:'Auditoria',exact:true}).click();
  await expect(summary(page)).toBeVisible();await expect(liveLink(page)).toHaveAttribute('href',appUrl+'/');
  clean(state);
});

test('A failed current reading preserves dated DEV facts without advertising the last URL as current',async({page})=>{
  const state=await fixture(page);await open(page);await expect(liveLink(page)).toBeVisible();
  state.disconnected=true;await page.getByRole('combobox',{name:/Persona/}).selectOption('ana');
  await expect(summary(page).getByRole('heading',{name:'Situação DEV não confirmada',exact:true})).toBeVisible();
  await expect(summary(page)).toContainText(/Última leitura/i);await expect(summary(page)).toContainText(/31\/10\/2026/);
  await expect(liveLink(page)).toHaveCount(0);
  state.disconnected=false;await summary(page).getByRole('button',{name:'Atualizar situação',exact:true}).click();
  await expect(liveLink(page)).toBeVisible();clean(state);
});

test('A different version in shared DEV never receives this Story application link',async({page})=>{
  const state=await fixture(page);Object.assign(state.progress,{state:'changed',title:'DEV está atendendo outra versão',message:'A publicação desta História permanece no histórico. O destino atual mudou.',liveUrl:null,nextAction:{label:'Consultar publicação DEV',step:'deployment'}});
  await open(page);await expect(summary(page)).toContainText('DEV está atendendo outra versão');await expect(liveLink(page)).toHaveCount(0);
  const destination=summary(page).getByRole('link',{name:'Consultar publicação DEV',exact:true});await expect(destination).toHaveAttribute('href',`/stories/${storyId}/execution/dev/deployment`);await destination.click();await expect(page.getByTestId('development-deployment')).toBeVisible();await expect(page.getByTestId('development-deployment')).toContainText('O destino está em outra versão');await expect(page.getByTestId('development-deployment').getByRole('link',{name:'Abrir aplicação em DEV ↗',exact:true})).toHaveCount(0);
  clean(state);
});

test('Initial DEV loading is explicit and does not claim that no version was published',async({page})=>{
  const state=await fixture(page);let release!:()=>void;state.holdJourney=new Promise<void>(resolve=>{release=resolve;});
  await page.goto(`/stories/${storyId}`);await expect(summary(page)).toContainText(/Consultando/i);await expect(liveLink(page)).toHaveCount(0);await expect(summary(page)).not.toContainText('Nenhuma publicação');
  state.holdJourney=null;release();await expect(liveLink(page)).toBeVisible();clean(state);
});

test('An invalid legacy DEV step normalizes safely and an unknown canonical stage never opens a decision',async({page})=>{
  const state=await fixture(page);await page.setViewportSize({width:390,height:844});await page.goto(`/stories/${storyId}?tab=planning&process=environment&environment=DEV&devStep=untrusted&tasks.q=preservar`);
  await expect(page).toHaveURL(new RegExp(`/stories/${storyId}/execution/dev/approval\\?tasks.q=preservar$`));await expect(page.getByTestId('story-environment-detail')).toBeVisible();await expect(summary(page)).toHaveCount(0);
  await expect(page.getByTestId('development-approval')).toBeVisible();for(const step of ['build','deployment','test'])await expect(page.getByTestId(`development-${step}`)).toBeHidden();await expect(page.getByTestId('development-approval-confirmation')).toHaveCount(0);await expect(page.getByRole('heading',{level:1,name:'Revisar aprovação de desenvolvimento',exact:true})).toBeFocused();
  const response=await page.goto(`/stories/${storyId}/execution/dev/untrusted?tasks.q=preservar`);expect(response?.status()).toBe(404);await expect(page.getByTestId('development-approval-confirmation')).toHaveCount(0);await expect(page).toHaveURL(/tasks.q=preservar/);clean(state);
});
