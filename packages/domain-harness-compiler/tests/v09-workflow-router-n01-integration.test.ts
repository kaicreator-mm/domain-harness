/**
 * v0.9 N01 — workspace-discovered, source-only integration proof.
 *
 * Reuses the actual selected v0.8 Standard interpreter and two independent
 * Business Package intent declarations. The v0.9 Router is still a pure
 * proposal (not a qualified Standard/Kernel/Host route); protected activation
 * and effect-permit checks belong to later N01/N06/N08/N09 integration.
 *
 * The compiler workspace's npm test glob discovers *.test.ts, not *.test.mjs.
 * Preserve the 10 independently reviewed P/N cases by running them as a
 * bounded child test from this one discovered file.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { interpret } from '../src/qualified-package/payload/standard-sdk-v1.mjs';
import { routeWorkflowIntent } from '../src/qualified-package/v09/workflow-router.mjs';
import * as approval from '../../../examples/v08-domain-apps/business-approval.mjs';
import * as engineering from '../../../examples/v08-domain-apps/business-engineering.mjs';

test('V09-N01-PN: workspace test command actually runs the ten Router refusal/selection cases', () => {
  const testFile = fileURLToPath(new URL('./v09-workflow-router-n01.test.mjs', import.meta.url));
  // The runner executes this file with NODE_TEST_CONTEXT set; an inherited
  // value makes the child runner skip all files ("run() is being called
  // recursively") and exit 0 with empty output, so it must not leak in.
  const childEnv = { ...process.env };
  delete childEnv.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', testFile], {
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 1_048_576,
    env: childEnv,
  });
  assert.equal(result.error, undefined, String(result.error ?? ''));
  assert.equal(result.signal, null, 'Router test subprocess must not be killed');
  assert.equal(result.status, 0, 'Router P/N failed\n' + result.stdout + '\n' + result.stderr);
  // A zero-status runner without the expected count is not sufficient evidence.
  assert.match(result.stdout, /# tests 10\b/);
  assert.match(result.stdout, /# pass 10\b/);
  assert.match(result.stdout, /# fail 0\b/);
});

test('V09-N01-C01: two actual Business intent sets compose with same selected Standard workflow interpreter and pure Router', () => {
  const basisDigest = 'sha256:' + 'a'.repeat(64);
  const selectedCapability = 'cap:notification';
  const sharedOperation = 'notify.send';
  const packages = [
    { business: approval, stage: 'approval', expectedIntent: 'submitQuoteDecision' },
    { business: engineering, stage: 'engineering', expectedIntent: 'reviewChange' },
  ] as const;
  for (const { business, stage, expectedIntent } of packages) {
    assert.ok(business.INTENT_TYPES.includes(expectedIntent), stage + ' intent is physically declared');
    const proposal = interpret(
      { id: 'v09:n01:workflow', kind: 'workflow', from: 'review', trigger: 'APPROVE', to: 'approved' },
      { state: 'review', trigger: 'APPROVE' },
    );
    assert.equal(proposal.kind, 'workflow');
    assert.equal(proposal.matched, true);
    assert.deepEqual({ ...proposal.candidate }, { from: 'review', trigger: 'APPROVE', to: 'approved' });
    assert.equal(Object.hasOwn(proposal, 'effectExecuted'), false);
    assert.equal(Object.hasOwn(proposal, 'journal'), false);

    // Proposed selected-C mapping is deliberate N01 test input, not an actual
    // BUILD-signed Handler binding or H caller authorization.
    const routed = routeWorkflowIntent({
      intentId: expectedIntent,
      basisDigest,
      bindings: [{
        intentId: expectedIntent, operationId: sharedOperation,
        capabilityId: selectedCapability, handlerId: 'handler:notify',
      }],
      candidates: [{
        operationId: sharedOperation, capabilityId: selectedCapability,
        priority: 1, eligibility: 'eligible',
      }],
    });
    assert.deepEqual(routed, {
      kind: 'selected', operationId: sharedOperation, capabilityId: selectedCapability,
      handlerId: 'handler:notify', basisDigest,
    });
    assert.equal(Object.hasOwn(routed, 'effectExecuted'), false);
    assert.equal(Object.hasOwn(routed, 'authorize'), false);
  }
});
