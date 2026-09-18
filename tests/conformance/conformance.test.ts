import assert from 'node:assert/strict';
import test from 'node:test';

import { ReferenceConformanceHost } from './reference-host.ts';
import {
  collectConformanceReport,
  expectedConformanceReport,
  runRuntimeConformanceSuite,
} from './suite.ts';

test('G30 reference host passes the shared deterministic semantic suite', async () => {
  const report = await runRuntimeConformanceSuite(new ReferenceConformanceHost());
  assert.deepEqual(report, expectedConformanceReport());
});

test('G30 ignores private row ids, wall-clock values and storage noise', async () => {
  const alpha = await collectConformanceReport(
    new ReferenceConformanceHost({ internalNoiseSeed: 'alpha-private-storage' }),
  );
  const beta = await collectConformanceReport(
    new ReferenceConformanceHost({ internalNoiseSeed: 'beta-private-storage' }),
  );
  assert.deepEqual(alpha, beta);
});

test('G30 fails closed on product-semantic drift', async () => {
  await assert.rejects(
    runRuntimeConformanceSuite(new ReferenceConformanceHost({ semanticFault: 'quote-output' })),
    /semantic mismatch/,
  );
});
