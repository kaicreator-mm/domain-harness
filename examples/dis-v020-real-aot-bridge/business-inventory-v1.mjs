/**
 * DIS v0.2.0 R6 demo — actual second Business Domain Package, "inventory".
 * Its authorization, workflow and journal behavior run in the REAL selected
 * Kernel, not in the DIS bridge. No external inventory mutation is claimed:
 * this is a domain-owned, governed reservation decision.
 */
export const MODULE_ID='business-inventory@v08.1.0.0';
export const PACKAGE_KIND='business';
export const ABI_VERSION='v08-business-abi/1';
export const ENDPOINTS=[{endpointId:'business:inventory-reservation',kind:'business-policy'}];
export const INTENT_TYPES=['reserveInventory'];
export const EFFECT_TYPES=[];
const event=k=>({source:'event',path:['payload',k]});
const eq=(a,b)=>({op:'eq',left:a,right:b});
const decisionSchema={isValid:v=>
  v!==null&&typeof v==='object'&&!Array.isArray(v)&&
  typeof v.decision?.outcome==='string'&&typeof v.event?.type==='string'};
export function getPolicy(){
 return {
  packageId:MODULE_ID,policyId:'inventory-reservation',domainId:'inventory',
  workflowDefinition:{
   workflowKey:'inventory-reservation',initialState:'available',initialContext:{},
   guards:[{guardId:'inventory-approved',predicate:{op:'all',predicates:[
      eq(event('approved'),{source:'literal',value:true}),
      {op:'exists',operand:event('sku')},
      {op:'exists',operand:event('quantity')},
   ]}}],
   states:[
    {stateKey:'available',transitions:[{
      transitionKey:'reserve',trigger:{kind:'event',eventType:'STOCK_RESERVATION_REQUESTED'},
      targetState:'reserved',guardId:'inventory-approved',effectIntents:[],
    }]},
    {stateKey:'reserved',kind:'final'},
   ],
  },
  decisionSchema,governanceSemantics:{hardInvariants:[]},
  initialStateKey:'available',initialContext:{},
  rules:{'rule:inventory-reserve':{
   ruleId:'rule:inventory-reserve',eventType:'STOCK_RESERVATION_REQUESTED',
   payloadFromInput:{sku:'sku',quantity:'quantity',approved:'approved',requestId:'requestId'},
  }},
  intentBindings:{reserveInventory:{
   trigger:{kind:'event',eventType:'STOCK_RESERVATION_REQUESTED'},
   ruleId:'rule:inventory-reserve',roles:['requester'],
  }},
  effectBindings:{},
 };
}