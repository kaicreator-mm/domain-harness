import {establishGenesisHost} from './host/bootstrap.mjs';
const host=await establishGenesisHost();
const run=await host.invoke({packageId:'genesis.business.smoke',componentId:'smoke-run',
  operationId:'run',input:{score:83}});
const low=await host.invoke({packageId:'genesis.business.smoke',componentId:'smoke-run',
  operationId:'run',input:{score:22}});
const decision=await host.invoke({packageId:'genesis.sdk',componentId:'sdk-decision',
  operationId:'select',input:{accepted:true}});
const workflow=await host.invoke({packageId:'genesis.sdk',componentId:'sdk-workflow',
  operationId:'advance',input:{current:'intake'}});
console.log(JSON.stringify({assembly:host.assembly,selected:host.selected,run,low,decision,workflow,
  dispatch:host.stats().dispatchCount},null,2));
