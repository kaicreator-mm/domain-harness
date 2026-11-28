import { createInterface } from 'node:readline';
import { InteractionElement } from '@kaicreator/domain-harness';
import type { InteractionPrompt, WorkflowObservation } from '@kaicreator/domain-harness';
import { readCatalogStock, runCatalogReasoning } from './catalog-reasoning.js';
import { catalogReservation } from './catalog-reservation.js';
import { demoModel, demoRevision, openCatalogDemo } from './catalog-demo-environment.js';
import type { CatalogProtocol } from './catalog-demo-environment.js';

const [protocol, isbn, rawQuantity, rawBudget, topology='replace'] = process.argv.slice(2);
if(protocol==='stock'){
  if(!isbn||rawQuantity!==undefined)throw Error('USAGE: catalog-cli stock ISBN');
  const env=await openCatalogDemo();
  try{
    const outcome=await readCatalogStock(env.catalog,isbn,demoRevision,r=>env.owner.inspect('shop-a',r));
    console.log(JSON.stringify({outcome,modelAttempts:0}));
  }finally{await env.close();}
}else{
if ((protocol !== 'native' && protocol !== 'openai-chat' && protocol !== 'anthropic-messages') ||
  (topology!=='fixed'&&topology!=='replace'&&topology!=='skip') || !isbn || (rawQuantity!=='?'&&!/^\d+$/u.test(rawQuantity??'')) || !/^\d+$/u.test(rawBudget??''))
  throw Error('USAGE: catalog-cli native|openai-chat|anthropic-messages ISBN quantity|? budgetCents [fixed|replace|skip]');
const env = await openCatalogDemo();
const lines = createInterface({input:process.stdin,crlfDelay:Infinity});
const iterator = lines[Symbol.asyncIterator]();
const model = demoModel(protocol as CatalogProtocol);
const events: WorkflowObservation[] = [];
let inputTask: Promise<void> | undefined;
function interactive() {
  return new InteractionElement({onPrompt:(prompt,interaction)=>{
    inputTask = respond(prompt,interaction);
    void inputTask.catch(()=>interaction.cancel());
  }});
}
async function respond(prompt: InteractionPrompt, interaction: InteractionElement): Promise<void> {
  console.log(JSON.stringify({prompt}));
  while (interaction.current() === prompt) {
    const line = await iterator.next();
    if (line.done) { interaction.cancel(); return; }
    let data: unknown;
    try { data = JSON.parse(line.value); } catch { console.log(JSON.stringify({response:{accepted:false,code:'INVALID_JSON'}})); continue; }
    if (typeof data === 'object' && data !== null && !Array.isArray(data) &&
      !['intentId','revision','decisionKey'].some(key=>Object.hasOwn(data as object,key)))
      data = {...data,intentId:prompt.intentId,revision:prompt.revision,decisionKey:prompt.decisionKey};
    const response = interaction.submit(data);
    console.log(JSON.stringify({response}));
    if (response.accepted) return;
  }
}
const interaction = interactive(), confirmation = interactive(), recognition=interactive();
try {
  const outcome = await runCatalogReasoning(env.catalog,{isbn,...(rawQuantity==='?'?{}:{quantity:Number(rawQuantity)}),budgetCents:Number(rawBudget),revision:demoRevision},{
    interaction, recognition, topology, ...(model?{model}:{}), current:()=>true, observe:e=>{events.push(e);},
    reserve:(root,plan,request,options)=>catalogReservation(env.catalog,env.client,{tenant:'shop-a',principal:'alice',
      inspect:r=>env.owner.inspect('shop-a',r),approve:g=>env.owner.approve(g),readback:env.readback},confirmation,options)(root,plan,request),
  });
  console.log(JSON.stringify({outcome,oneRoot:new Set(events.map(e=>e.runId)).size===1,
    modelAttempts:events.filter(e=>e.kind==='model'&&e.action==='result').length,
    stock:env.owner.inspect('shop-a',isbn==='9780306406157'?'book-a':'book-b')}));
} finally { interaction.cancel(); confirmation.cancel(); recognition.cancel(); lines.close(); await inputTask?.catch(()=>undefined); await env.close(); }
}
