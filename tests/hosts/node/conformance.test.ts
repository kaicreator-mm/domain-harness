import assert from 'node:assert/strict';
import test from 'node:test';

import { expectedConformanceReport, runRuntimeConformanceSuite } from '../../conformance/suite.ts';
import { NodeRuntimeConformanceHost } from './node-conformance-host.ts';

test('T-018 G30: integrated Node host passes the shared deterministic Runtime conformance suite', async () => {
  const report = await runRuntimeConformanceSuite(new NodeRuntimeConformanceHost());
  assert.equal(report.suite, 'domain-harness-v0.2-g30');
  assert.deepEqual(report, expectedConformanceReport());
});
