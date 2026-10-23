/**
 * T05 generic v0.10 BUILD composition conformance smoke.
 *
 * Four *existing* synthetic Standard Feature fixtures prove 16 static BUILD
 * selection subsets. The separately installed actual v0.10.1 C01–C04
 * producer tarballs require the post-merge physical smoke documented in
 * examples/v0101-agent-improvement/integration/selected-subsets-build.mjs;
 * neither check is a T06 clean-installed App/SQLite/Effect qualification.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildV10App } from '../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';
import { basicComposition, featureEntry } from '../assembly/helpers-v010.js';

const SPECS = [
  { fixture: 'sfeature-validation-v1.mjs', packageId: 't05-test-diagnostics@v0101.0.0', featureKey: 'standard:t05-diagnostics/1' },
  { fixture: 'sfeature-aggregation-v1.mjs', packageId: 't05-test-evaluation@v0101.0.0', featureKey: 'standard:t05-evaluation/1' },
  { fixture: 'sfeature-formatting-v1.mjs', packageId: 't05-test-experience@v0101.0.0', featureKey: 'standard:t05-experience/1' },
  { fixture: 'sfeature-validation-v1.mjs', packageId: 't05-test-experiment@v0101.0.0', featureKey: 'standard:t05-experiment/1' },
] as const;

test('v0.10.1 T05 — BUILD accepts all 16 independently selected Standard Feature subsets', async () => {
  const features = await Promise.all(SPECS.map(spec => featureEntry(spec)));
  const allIds = features.map(feature => feature.packageId);
  const digests = new Set<string>();
  for (let mask = 0; mask < 16; mask++) {
    const selected = features.filter((_, i) => (mask & (1 << i)) !== 0);
    const result = buildV10App(await basicComposition({ features: selected }));
    const expected = selected.map(item => item.packageId).sort();
    const actual = result.modules
      .filter(item => allIds.includes(item.packageId)).map(item => item.packageId).sort();
    assert.deepEqual(actual, expected, 'exact selected Provider set for mask ' + mask);
    for (const feature of features) {
      assert.equal(result.loadOrder.includes(feature.packageId),
        expected.includes(feature.packageId), 'no imports for missing mask Feature');
    }
    assert.equal(result.skippedOptional.length, 0);
    assert.equal(digests.has(result.subjectDigest), false, 'different subset must have distinct BUILD digest');
    digests.add(result.subjectDigest);
  }
  assert.equal(digests.size, 16);
});

test('v0.10.1 T05 — genuinely selected Feature-key collision stays fail-closed', async () => {
  const [first, second] = await Promise.all([
    featureEntry(SPECS[0]),
    featureEntry({
      fixture: 'sfeature-aggregation-v1.mjs',
      packageId: 't05-test-duplicate@v0101.0.0',
      featureKey: SPECS[0].featureKey,
    }),
  ]);
  const composition = await basicComposition({ features: [first, second] });
  assert.throws(() => buildV10App(composition), { code: 'V10_FEATURE_COLLISION' });
});
