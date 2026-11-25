import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const driver=process.env.DH_BROWSER_DRIVER;
if(!driver)throw Error('DH_BROWSER_DRIVER_REQUIRED');
const {chromium}=await import(pathToFileURL(driver).href);
import {serveOrderInteraction} from '../examples/native-domain-app/packages/interaction-client.mjs';
const browser=await chromium.launch({headless:true});
const cases=[
  ['current',async page=>{await page.locator('select[name=goal]').selectOption('current');await page.getByRole('button',{name:'Submit',exact:true}).click();},'COMPLETE','order-policy-allow'],
  ['compare',async page=>{await page.locator('select[name=goal]').selectOption('compare');await page.getByRole('button',{name:'Submit',exact:true}).click();await page.locator('select[name=scenario]').selectOption('strict');await page.getByRole('button',{name:'Submit',exact:true}).click();},'REJECT','ORDER_POLICY_THRESHOLD'],
  ['revision',async page=>{await page.locator('select[name=goal]').selectOption('compare');await page.getByRole('button',{name:'Submit',exact:true}).click();await page.locator('select[name=scenario]').waitFor();await page.locator('#free-text').fill('order current');await page.getByRole('button',{name:'revise',exact:true}).click();},'COMPLETE','order-policy-allow'],
  ['text',async page=>{await page.locator('#free-text').fill('order current');await page.getByRole('button',{name:'text',exact:true}).click();},'COMPLETE','order-policy-allow'],
  ['no-fit',async page=>{await page.getByRole('button',{name:'no-fit',exact:true}).click();},'ASK','NO_MATCHING_POLICY'],
  ['cancel',async page=>{await page.getByRole('button',{name:'cancel',exact:true}).click();},'REJECT','CANCELLED'],
];
try{
 for(const [name,act,status,expected] of cases){
  const service=await serveOrderInteraction('order');const page=await browser.newPage();
  try{
   await page.goto(service.url);await page.locator('select[name=goal]').waitFor();
   assert.equal(await page.locator('select[name=goal]').inputValue(),'');
   assert.match(await page.locator('main').innerText(),/recommended/);
   assert.match(await page.locator('main').innerText(),/Suggested: "current"/);
   assert.equal(await page.locator('table').count(),1);
   await act(page);
   await page.locator('#outcome').waitFor();const shown=JSON.parse(await page.locator('#outcome').innerText());
   const result=await service.result;assert.deepEqual(shown,result);assert.equal(result.status,status);
   assert.equal(result.status==='COMPLETE'?result.value.policyId:result.reason.code,expected);
   console.log('BROWSER_PASS',name,result.status,expected);
  }finally{await page.close();await service.close();}
 }
}finally{await browser.close();}
