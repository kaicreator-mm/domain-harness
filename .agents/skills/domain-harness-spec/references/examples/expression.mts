import assert from 'node:assert/strict';
import {BoundedExpressionElement} from '@kaicreator/domain-harness';
const e=new BoundedExpressionElement();
assert.equal(e.evaluate('{"op":"add","args":[{"op":"literal","value":4},{"op":"get","path":["n"]}]}','{"n":6}'),10);
assert.throws(()=>e.evaluate('{"op":"eval","code":"1"}','{}'));
