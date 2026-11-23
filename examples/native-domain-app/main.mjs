import assert from 'node:assert/strict';
import { KernelLifecycle, StandardWorkflowSession, routeWorkflowOutcome } from '@kaicreator/domain-harness';
import * as kdp from './packages/kdp.mjs';
import * as business from './packages/business.mjs';

const app = new KernelLifecycle([business, kdp]);
const hookEvents = [];
const result = await app.run({appId:'native-domain-app'}, async () => {
  const values = new business.OrderService().readFour();
  const session = new StandardWorkflowSession({maxCalls:4,maxSteps:6,maxDepth:1});
  const outcome = await session.run(async root => {
    const guard = await root.invoke(() => values.length === 4);
    if (guard.status !== 'COMPLETE' || !guard.value) {
      return {status:'UNKNOWN',reason:{code:'NO_DOCUMENTS',message:'Business inputs unavailable'}};
    }
    return root.child(0, child => child.leaf({
      start: async () => { hookEvents.push('start'); },
      run: async () => {
        hookEvents.push('run');
        return {status:'COMPLETE',value:business.sumAmounts(values.map(value => value.amount))};
      },
      end: async () => { await Promise.resolve(); hookEvents.push('end'); },
    }));
  });
  const routes = {
    COMPLETE: value => value.value,
    REJECT: () => { throw new Error('Business rejected'); },
    ASK: () => { throw new Error('Business requested input'); },
    WAIT: () => { throw new Error('Business awaiting condition'); },
    UNKNOWN: () => { throw new Error('Business outcome unknown'); },
    FAILED: () => { throw new Error('Workflow failed'); },
  };
  const total = await routeWorkflowOutcome(outcome, routes);
  return {count:values.length,total,firstId:values[0].id};
});
assert.deepEqual(hookEvents, ['start','run','end']);
assert.deepEqual(result,{count:4,total:10,firstId:'a'});
console.log(JSON.stringify({app:'native-domain-app',status:'PASS',...result}));
