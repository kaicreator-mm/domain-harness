import { readFileSync } from 'node:fs';
import { JsonReader, StandardWorkflowSession, routeWorkflowOutcome } from '@kaicreator/domain-harness';
import { OrderPolicyElement, OrderPolicyKnowledgeElement } from './business.mjs';
import { InventoryElement } from './inventory.mjs';

/** 真正的原生 Core：Package.Init 可以选择在初始化期间运行业务 Workflow。 */
export const packageMeta = {id:'reference-workflow-init',role:'core',order:3};

const policyFiles = {
  normal: new URL('../data/order-policy.json',import.meta.url),
  strict: new URL('../data/order-policy-strict.json',import.meta.url),
};
const stockFile = new URL('../data/inventory-policy.yaml',import.meta.url);

/** 结构化领域内容是由业务选取的普通文件，不由 SDK 生成/校验其领域正确性。 */
export async function runOrderPolicy(which, trace = [], policy = new OrderPolicyElement()) {
  const url = policyFiles[which];
  if (url === undefined) {
    return {status:'UNKNOWN',reason:{code:'ORDER_POLICY_NOT_SELECTED',message:'Unknown policy selection'}};
  }
  const reader = new JsonReader();
  const session = new StandardWorkflowSession({maxCalls:5,maxSteps:7,maxDepth:1});
  return session.run(root=>root.child(0,async child=>{
    const selected = await child.invoke(()=>{
      trace.push('policy:read');
      return reader.read(readFileSync(url,'utf8'));
    });
    if(selected.status!=='COMPLETE') return selected;
    if(selected.value.kind!=='SUCCEEDED') {
      return {status:'FAILED',reason:{code:'ORDER_POLICY_UNREADABLE',message:'Policy could not be read'}};
    }
    const knowledge = new OrderPolicyKnowledgeElement(selected.value.value);
    const outcome = await child.leaf({
      start:()=>{trace.push('policy:start');},
      run:()=>{trace.push('policy:evaluate');return policy.evaluate(knowledge.content,[1,2,3,4]);},
      end:async()=>{await Promise.resolve();trace.push('policy:end');},
    });
    // 具名 Switch：只允许 COMPLETE 进入下一个 Node；拒绝时不能执行 finalize。
    return routeWorkflowOutcome(outcome,{
      COMPLETE:decision=>child.leaf({
        run:()=>{trace.push('policy:finalize');return policy.finalize(decision.value);},
      }),
      REJECT:result=>result,
      ASK:result=>result,
      WAIT:result=>result,
      UNKNOWN:result=>result,
      FAILED:result=>result,
    });
  }));
}

export async function runInventoryPolicy() {
  const stock = new InventoryElement();
  const session = new StandardWorkflowSession({maxCalls:2,maxSteps:3,maxDepth:0});
  return session.run(async root=>{
    const parsed=await root.invoke(()=>stock.readPolicy(readFileSync(stockFile,'utf8')));
    if(parsed.status!=='COMPLETE') return parsed;
    if(parsed.value.kind!=='SUCCEEDED') {
      return {status:'FAILED',reason:{code:'INVENTORY_POLICY_UNREADABLE',message:'Invalid inventory data'}};
    }
    return root.leaf({run:()=>stock.evaluate(parsed.value.value,{sku:'SKU-001',available:5})});
  });
}

/** 一轮真实 Package.Init 同时证明多节点、单节点与第二业务领域。 */
export class Init {
  async start(context) {
    if(context.appId!=='native-domain-app') throw new Error('Unexpected app context');
    const sharedPolicy=new OrderPolicyElement();
    const normalTrace=[], strictTrace=[];
    const normal=await runOrderPolicy('normal',normalTrace,sharedPolicy);
    const strict=await runOrderPolicy('strict',strictTrace,sharedPolicy);
    const inventory=await runInventoryPolicy();
    const single=await new StandardWorkflowSession({maxCalls:1,maxSteps:2,maxDepth:0})
      .run(root=>root.invoke(()=>42));
    // 仅将本次激活的结果交给 App 所有者；不把状态藏到共享 ESM 单例中。
    context.onInitResult?.({normal,strict,inventory,single,normalTrace,strictTrace});
  }
}
