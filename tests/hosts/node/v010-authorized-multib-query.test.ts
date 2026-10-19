/** T10 isolated P/N: visible-only Multi-B query, not physical selected-K integration. */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createV10AuthorizedMultiBQuery,
} from '../../../packages/domain-harness/src/host-v8/v010-authorized-multib-query.js';
import type {
  V10MultiBQueryTarget,
  V10SelectedBusinessQueryRoute,
} from '../../../packages/domain-harness/src/host-v8/v010-authorized-multib-query.js';

const deployment = {
  deployedAppId: 'deployed:stable-1',
  tenantId: 'tenant:a',
  appId: 'app:a',
};
const selected = [
  { businessPackageId: 'B:A', workflowId: 'shared-workflow' },
  { businessPackageId: 'B:B', workflowId: 'shared-workflow' },
];
const selector = { workflowId: 'shared-workflow', instanceKey: 'instance:same' };
const hasCode = (code: string) => (e: unknown): boolean =>
  e !== null && typeof e === 'object' && (e as { code?: string }).code === code;

function fixture(options: {
  routes?: V10SelectedBusinessQueryRoute[];
  visible?: string[];
  allow?: (target: V10MultiBQueryTarget) => boolean | Promise<boolean>;
  reader?: (target: V10MultiBQueryTarget) => unknown;
} = {}) {
  const reads: V10MultiBQueryTarget[] = [];
  const checks: V10MultiBQueryTarget[] = [];
  const visible = new Set(options.visible ?? ['B:A', 'B:B']);
  const query = createV10AuthorizedMultiBQuery({
    deployment,
    verifiedPrincipal: { source: 'host-authenticated', subject: 'user:123' },
    selectedRoutes: options.routes ?? selected,
    authorize: async (_verified, target) => {
      checks.push(target);
      return options.allow ? options.allow(target) : visible.has(target.businessPackageId);
    },
    readSnapshot: async (target) => {
      reads.push(target);
      return options.reader ? options.reader(target) : {
        observedBusiness: target.businessPackageId,
        workflowId: target.workflowId,
        instanceKey: target.instanceKey,
      };
    },
  });
  return { query, checks, reads };
}

test('T10-P1: explicit B is the only physical target, even with identical workflow/instance', async () => {
  const h = fixture();
  const result = await h.query.query({ ...selector, businessPackageId: 'B:B' });
  assert.equal(result.target.businessPackageId, 'B:B');
  assert.equal(result.target.deployedAppId, deployment.deployedAppId);
  assert.deepEqual(result.snapshot, {
    observedBusiness: 'B:B', workflowId: selector.workflowId, instanceKey: selector.instanceKey,
  });
  assert.deepEqual(h.reads.map(x => x.businessPackageId), ['B:B']);
  assert.ok(h.checks.length >= 2, 'Host authorization is rechecked before the read');
});

test('T10-N1: multiple visible B are typed ambiguous without any snapshot read', async () => {
  const h = fixture();
  await assert.rejects(h.query.query(selector), hasCode('QUERY_AMBIGUOUS'));
  assert.equal(h.reads.length, 0);
  assert.deepEqual(h.checks.map(x => x.businessPackageId), ['B:A', 'B:B']);
});

test('T10-P2/N2: hidden B never changes one-visible result or underlying physical read set', async () => {
  const only = fixture({ routes: [selected[0]!], visible: ['B:A'] });
  const hidden = fixture({ visible: ['B:A'] });
  const left = await only.query.query(selector);
  const right = await hidden.query.query(selector);
  assert.deepEqual(left, right);
  assert.deepEqual(only.reads.map(x => x.businessPackageId), ['B:A']);
  assert.deepEqual(hidden.reads.map(x => x.businessPackageId), ['B:A']);
});

test('T10-N3: no visible B, hidden B, and unselected explicit B use the same denial', async () => {
  const h = fixture({ visible: [] });
  await assert.rejects(h.query.query(selector), hasCode('QUERY_NOT_FOUND'));
  await assert.rejects(h.query.query({ ...selector, businessPackageId: 'B:A' }), hasCode('QUERY_NOT_FOUND'));
  await assert.rejects(h.query.query({ ...selector, businessPackageId: 'B:unselected' }), hasCode('QUERY_NOT_FOUND'));
  assert.equal(h.reads.length, 0, 'all denial paths were before physical K read');
});

test('T10-N4: host authorization revoked between visibility and physical read stays fail-closed', async () => {
  let grants = 0;
  const h = fixture({ routes: [selected[0]!], allow: () => ++grants === 1 });
  await assert.rejects(h.query.query(selector), hasCode('QUERY_NOT_FOUND'));
  assert.equal(h.reads.length, 0);
  assert.equal(grants, 2);
});

test('T10-N5: malformed identity and missing trusted Host authority never probe K', async () => {
  const h = fixture();
  await assert.rejects(h.query.query({ ...selector, instanceKey: '' }), hasCode('QUERY_SELECTOR_INVALID'));
  await assert.rejects(h.query.query({ ...selector, businessPackageId: '' }), hasCode('QUERY_SELECTOR_INVALID'));
  assert.equal(h.reads.length, 0);
  assert.equal(h.checks.length, 0);
  assert.throws(() => createV10AuthorizedMultiBQuery({
    deployment, verifiedPrincipal: null, selectedRoutes: selected,
    authorize: () => true, readSnapshot: () => null,
  }), hasCode('QUERY_HOST_INVALID'));
  assert.throws(() => createV10AuthorizedMultiBQuery({
    deployment, verifiedPrincipal: { host: true },
    selectedRoutes: [selected[0]!, selected[0]!],
    authorize: () => true, readSnapshot: () => null,
  }), hasCode('QUERY_SELECTED_ROUTES_INVALID'));
});

test('T10-N6: authorization failure is not reported as a B existence oracle', async () => {
  const h = fixture({ allow: () => { throw new Error('sensitive internal auth details'); } });
  await assert.rejects(h.query.query(selector), e =>
    hasCode('QUERY_AUTHORIZATION_UNAVAILABLE')(e) && !String((e as Error).message).includes('sensitive'));
  assert.equal(h.reads.length, 0);
});

test('T10-N7: missing or failing exact snapshot reads return typed refusal, not fallback to other B', async () => {
  const absent = fixture({ visible: ['B:A'], reader: () => null });
  await assert.rejects(absent.query.query(selector), hasCode('QUERY_NOT_FOUND'));
  assert.deepEqual(absent.reads.map(x => x.businessPackageId), ['B:A']);
  const bad = fixture({ visible: ['B:A'], reader: () => { throw new Error('database path'); } });
  await assert.rejects(bad.query.query(selector), hasCode('QUERY_READ_FAILED'));
  assert.equal(bad.reads.length, 1);
});
