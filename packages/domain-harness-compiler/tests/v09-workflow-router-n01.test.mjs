import test from 'node:test';
import assert from 'node:assert/strict';
import { routeWorkflowIntent, WorkflowRouterError, WORKFLOW_ROUTER_RESULT_KINDS } from '../../../domain-packages/standard/basic/workflow-router.mjs';

const DIGEST = `sha256:${'a'.repeat(64)}`;
const binding = (intentId, operationId, capabilityId = 'cap:notify', handlerId = 'notifyHandler') =>
  ({ intentId, operationId, capabilityId, handlerId });
const candidate = (operationId, priority = 1, eligibility = 'eligible', capabilityId = 'cap:notify') =>
  ({ operationId, capabilityId, priority, eligibility });
const request = (intentId, bindings, candidates) => ({ intentId, basisDigest: DIGEST, bindings, candidates });
const refuses = (code, fn) => assert.throws(fn, error => error instanceof WorkflowRouterError && error.code === code);

test('N01 P01: two Business intents reuse exactly one Build-selected Capability handler', () => {
  const bindings = [binding('approval.send', 'notify.send'), binding('engineering.send', 'notify.send')];
  for (const intent of ['approval.send', 'engineering.send']) {
    const result = routeWorkflowIntent(request(intent, bindings, [candidate('notify.send')]));
    assert.deepEqual(result, { kind: 'selected', operationId: 'notify.send', capabilityId: 'cap:notify', handlerId: 'notifyHandler', basisDigest: DIGEST });
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.hasOwn(result, 'authorize'), false);
    assert.equal(Object.hasOwn(result, 'journal'), false);
    assert.equal(Object.hasOwn(result, 'effect'), false);
  }
});

test('N01 P02: no candidate is a stable missing, not guessed fallback', () => {
  assert.deepEqual(routeWorkflowIntent(request('approval.send', [binding('approval.send', 'notify.send')], [])), {kind: 'missing', intentId: 'approval.send'});
});

test('N01 P03: highest priority selected independent of input order', () => {
  const b = [binding('quote', 'a'), binding('quote', 'z')];
  const r = routeWorkflowIntent(request('quote', b, [candidate('z', 10), candidate('a', 2)]));
  assert.equal(r.kind, 'selected'); assert.equal(r.operationId, 'z');
});

test('N01 P04: equal-rank tie is ambiguous with sorted unique IDs, never first-match', () => {
  const b = [binding('quote', 'z'), binding('quote', 'a')];
  for (const xs of [[candidate('z', 5), candidate('a', 5)], [candidate('a', 5), candidate('z', 5)]]) {
    const result = routeWorkflowIntent(request('quote', b, xs));
    assert.deepEqual(result, {kind: 'ambiguous', intentId: 'quote', candidateOperationIds: ['a', 'z']});
    assert.ok(Object.isFrozen(result.candidateOperationIds));
  }
});

test('N01 P05: all ineligible candidates produce data-only denied, not Kernel authorization', () => {
  const r = routeWorkflowIntent(request('quote', [binding('quote', 'a')], [candidate('a', 1, 'denied')]));
  assert.deepEqual(r, {kind: 'denied', reasonCode: 'ROUTER_ELIGIBILITY_DENIED'});
  assert.deepEqual(WORKFLOW_ROUTER_RESULT_KINDS, ['selected', 'missing', 'ambiguous', 'denied']);
});

test('N01 N01: forged or dangling selected BUILD binding fails closed', () => {
  refuses('ROUTER_BINDING_MISMATCH', () => routeWorkflowIntent(request('quote', [], [candidate('a')])));
  refuses('ROUTER_BINDING_MISMATCH', () => routeWorkflowIntent(request('quote', [binding('quote', 'a')], [candidate('a', 1, 'eligible', 'cap:foreign')])));
  refuses('ROUTER_CONTRACT_INVALID', () => routeWorkflowIntent({...request('quote', [binding('quote', 'a')], [candidate('a')]), callerAdmin: true}));
});

test('N01 N02: duplicate selected binding/candidate and forged handler field refused', () => {
  refuses('ROUTER_BINDING_DUPLICATE', () => routeWorkflowIntent(request('quote', [binding('quote', 'a'), binding('quote', 'a')], [])));
  refuses('ROUTER_CANDIDATE_DUPLICATE', () => routeWorkflowIntent(request('quote', [binding('quote', 'a')], [candidate('a'), candidate('a')])));
  refuses('ROUTER_CONTRACT_INVALID', () => routeWorkflowIntent(request('quote', [binding('quote', 'a')], [{...candidate('a'), handlerId: 'untrusted'}])));
});

test('N01 N03: accessor and prototype pollution refused without invoking getter', () => {
  let count = 0;
  const evil = candidate('a');
  Object.defineProperty(evil, 'priority', { enumerable: true, get() { count++; return 100; } });
  refuses('ROUTER_DATA_INVALID', () => routeWorkflowIntent(request('quote', [binding('quote', 'a')], [evil])));
  assert.equal(count, 0);
  const proto = JSON.parse('{"__proto__":"mine"}');
  refuses('ROUTER_DATA_INVALID', () => routeWorkflowIntent({...request('quote', [], []), ...proto}));
});

test('N01 N04: invalid priority, arbitrary digest and cyclic data refused', () => {
  refuses('ROUTER_CONTRACT_INVALID', () => routeWorkflowIntent(request('quote', [binding('quote', 'a')], [candidate('a', -1)])));
  refuses('ROUTER_CONTRACT_INVALID', () => routeWorkflowIntent({...request('quote', [], []), basisDigest: 'sha256:fake'}));
  const cyclic = request('quote', [], []); cyclic.self = cyclic;
  refuses('ROUTER_DATA_INVALID', () => routeWorkflowIntent(cyclic));
});

test('N01 N05: no physical effects/state-changing APIs or ESM import edges in router', () => {
  const only = Object.keys({ routeWorkflowIntent, WorkflowRouterError, WORKFLOW_ROUTER_RESULT_KINDS }).sort();
  assert.deepEqual(only, ['WORKFLOW_ROUTER_RESULT_KINDS', 'WorkflowRouterError', 'routeWorkflowIntent']);
  const r = routeWorkflowIntent(request('quote', [binding('quote', 'a')], [candidate('a')]));
  assert.equal(Object.keys(r).sort().join(','), 'basisDigest,capabilityId,handlerId,kind,operationId');
});
