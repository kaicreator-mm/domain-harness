import assert from 'node:assert/strict';
import { KernelLifecycle } from '@kaicreator/domain-harness';
import * as kdp from './packages/kdp.mjs';
import * as business from './packages/business.mjs';

const app = new KernelLifecycle([business, kdp]);
const result = await app.run({appId:'native-domain-app'}, () => {
  const values = new business.OrderService().readFour();
  return {
    count:values.length,
    total:business.sumAmounts(values.map(value => value.amount)),
    firstId:values[0].id,
  };
});
assert.deepEqual(result,{count:4,total:10,firstId:'a'});
console.log(JSON.stringify({app:'native-domain-app',status:'PASS',...result}));
