/**
 * A real two-domain selected BUILD: "orders" (existing approval Business)
 * and "inventory" (independent second Business policy) share one KDP/SDK,
 * but have distinct Business package ids, workflows and durable Journal keys.
 */
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildV10App} from '../../tooling/build/dist/index.js';
import {basicComposition} from '../../tests/assembly/helpers-v010.ts';
import {makeManifest} from './bridge.mjs';
export const INVENTORY_PACKAGE='business-inventory@v08.1.0.0';
export const INVENTORY_CAPABILITY='capability-inventory@v08.1.0.0';
const sha=source=>createHash('sha256').update(source).digest('hex');
export async function makeTwoDomainBuilt(){
 const base=await basicComposition({routes:[
  {intentId:'submitQuoteDecisionDynamic',operationId:'reserve',capabilityId:'ledger',handlerId:'reserveLedger'},
  {intentId:'reserveInventory',operationId:'stock.preview',capabilityId:'stock',handlerId:'previewStock'},
 ]});
 const [source,stockSource]=await Promise.all([
  readFile(new URL('./business-inventory-v1.mjs',import.meta.url),'utf8'),
  readFile(new URL('./capability-inventory-v1.mjs',import.meta.url),'utf8')
 ]);
 return buildV10App({
  ...base,appId:'app:dis-v020-orders-and-inventory',buildId:'dis-v020-r6-two-domain',
  modules:[...base.modules,{
    packageId:INVENTORY_PACKAGE,role:'business',abiVersion:'v08-business-abi/1',
    moduleSource:source,moduleSha256:sha(source),endpoint:'business-policy',
    dependencies:[],provides:['business:policy/1','intent:reserveInventory'],requires:[],
  },{
    packageId:INVENTORY_CAPABILITY,role:'capability',abiVersion:'v08-capability-abi/1',
    moduleSource:stockSource,moduleSha256:sha(stockSource),endpoint:'capability-endpoint',
    dependencies:[],provides:['capability:stock/1'],requires:[],capabilityId:'stock',
    handlers:[{operationId:'stock.preview',handler:'previewStock'}],
  }],
 });
}
export async function makeTwoDomainManifest(built){
 const m=await makeManifest(built);
 m.elements.push({id:'inventory.stock',packageId:INVENTORY_PACKAGE,dependencies:[],
   functions:[{id:'reserve',kind:'public',intentId:'reserveInventory',effect:'none'}]});
 m.ingress.push({id:'reserveStock',element:'inventory.stock',function:'reserve',optional:false});
 return m;
}
export const QUOTE_INPUT=Object.freeze({
 messageId:'msg:dis-r6-orders',instanceKey:'same-key-r6',
 input:{amount:30,requestId:'ORDERS-R6'}
});
export const INVENTORY_INPUT=Object.freeze({
 messageId:'msg:dis-r6-inventory',instanceKey:'same-key-r6',
 input:{sku:'SKU-07',quantity:3,approved:true,requestId:'INVENTORY-R6'}
});
