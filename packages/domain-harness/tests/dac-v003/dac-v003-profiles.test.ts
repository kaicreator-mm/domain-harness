// Issue #323 / DAC v0.0.3 V3-001 — composable exactness profiles P0–P7:
// the frozen requirement table (CROSS_LAYER_REFERENCES §4), slot-presence
// validation per profile (a reference cannot claim a stronger exactness
// class than it carries), the P3 selected-Domain-Data lifecycle-authority
// rule, and the C40 same-revision/different-digest contradiction guard.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DAC_V003_BASELINE,
  DAC_V003_EXACTNESS_PROFILES,
  DAC_V003_PROFILE_REQUIREMENTS,
  DacV003ReferenceError,
  adoptDacV003RegistryReference,
  assertDacV003ExactnessProfile,
  assertDacV003RevisionDigestConsistency,
} from '../../src/dac-v003/index.js';
import type { DacV003Reference } from '../../src/dac-v003/index.js';

function ref(overrides: Record<string, unknown> = {}): DacV003Reference {
  return adoptDacV003RegistryReference('evidence', {
    baseline: { ...DAC_V003_BASELINE },
    authorityScope: 'shared/example',
    primaryIdentity: 'evd-0001',
    ...overrides,
  } as never);
}

function assertProfileError(
  target: DacV003Reference,
  profile: 'P0' | 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7',
  label: string,
): void {
  let caught: unknown;
  try {
    assertDacV003ExactnessProfile(target, profile);
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof DacV003ReferenceError, `${label}: expected error`);
  assert.equal(
    (caught as DacV003ReferenceError).code,
    'PROFILE_REQUIREMENT_UNMET',
    `${label}: code`,
  );
}

test('v3-001 profile vocabulary is exactly P0..P7 with the frozen requirement table', () => {
  assert.deepEqual([...DAC_V003_EXACTNESS_PROFILES], [
    'P0',
    'P1',
    'P2',
    'P3',
    'P4',
    'P5',
    'P6',
    'P7',
  ]);
  // §4 frozen semantics, spot-pinned as data:
  assert.deepEqual([...DAC_V003_PROFILE_REQUIREMENTS.P0.requiredSlots], ['semanticIdentity']);
  assert.deepEqual([...DAC_V003_PROFILE_REQUIREMENTS.P1.requiredSlots], ['revisionIdentity']);
  assert.deepEqual([...DAC_V003_PROFILE_REQUIREMENTS.P1.requires], ['P0']);
  assert.deepEqual([...DAC_V003_PROFILE_REQUIREMENTS.P2.requiredSlots], ['contentDigest']);
  assert.deepEqual([...DAC_V003_PROFILE_REQUIREMENTS.P3.requires], ['P0', 'P1', 'P2']);
  assert.deepEqual([...DAC_V003_PROFILE_REQUIREMENTS.P3.requiredSlots], ['lifecycleAuthorityRefs']);
  assert.equal(DAC_V003_PROFILE_REQUIREMENTS.P3.selectedDomainDataLifecycleAuthorities, true);
  assert.deepEqual([...DAC_V003_PROFILE_REQUIREMENTS.P4.requiredSlots], [
    'parentRefs',
    'provenanceRefs',
  ]);
  assert.deepEqual([...DAC_V003_PROFILE_REQUIREMENTS.P5.requiredSlots], [
    'contractProfileIdentity',
    'revisionIdentity',
  ]);
  assert.deepEqual([...DAC_V003_PROFILE_REQUIREMENTS.P6.requiredSlots], [
    'materialInputRefs',
    'provenanceRefs',
  ]);
  assert.deepEqual([...DAC_V003_PROFILE_REQUIREMENTS.P7.requiredSlots], [
    'logicalOperationIdentity',
  ]);
});

test('v3-001 P0/P1/P2: semantic, revision-bound and content-bound slots fail closed when absent', () => {
  const bare = ref();
  assertProfileError(bare, 'P0', 'P0 without semanticIdentity');
  const p0 = ref({ semanticIdentity: 'sem/example' });
  assertDacV003ExactnessProfile(p0, 'P0');
  assertProfileError(p0, 'P1', 'P1 without revisionIdentity');
  assertProfileError(p0, 'P2', 'P2 without contentDigest');
  const p1p2 = ref({
    semanticIdentity: 'sem/example',
    revisionIdentity: 'rev-0007',
    contentDigest: 'sha256:aaaa',
  });
  assertDacV003ExactnessProfile(p1p2, 'P0');
  assertDacV003ExactnessProfile(p1p2, 'P1');
  assertDacV003ExactnessProfile(p1p2, 'P2');
});

test('v3-001 P3: composes P1+P2 and requires lifecycle authority refs (promotion + selection for selected Domain Data)', () => {
  const promotion = adoptDacV003RegistryReference('promotion-decision', {
    baseline: { ...DAC_V003_BASELINE },
    authorityScope: 'governance/example',
    primaryIdentity: 'promo-dec-0009',
    semanticIdentity: 'sem/invoice-rules',
    revisionIdentity: 'rev-0007',
    contentDigest: 'sha256:aaaa',
  } as never);
  const selection = adoptDacV003RegistryReference('application-selection', {
    baseline: { ...DAC_V003_BASELINE },
    authorityScope: 'composition/example-app',
    primaryIdentity: 'app-sel-0042',
    semanticIdentity: 'sem/invoice-rules',
    revisionIdentity: 'rev-0007',
    contentDigest: 'sha256:aaaa',
  } as never);
  const selected = adoptDacV003RegistryReference('selected-domain-data', {
    baseline: { ...DAC_V003_BASELINE },
    authorityScope: 'shared/example',
    primaryIdentity: 'selected-invoice-rules-rev-0007',
    semanticIdentity: 'sem/invoice-rules',
    revisionIdentity: 'rev-0007',
    contentDigest: 'sha256:aaaa',
  } as never);
  assertProfileError(selected, 'P3', 'P3 without lifecycle authorities');
  // Only promotion coverage is still not selection coverage.
  const promotionOnly = adoptDacV003RegistryReference('selected-domain-data', {
    baseline: { ...DAC_V003_BASELINE },
    authorityScope: 'shared/example',
    primaryIdentity: 'selected-invoice-rules-rev-0007-b',
    semanticIdentity: 'sem/invoice-rules',
    revisionIdentity: 'rev-0007',
    contentDigest: 'sha256:aaaa',
    lifecycleAuthorityRefs: [promotion],
  } as never);
  let caught: unknown;
  try {
    assertDacV003ExactnessProfile(promotionOnly, 'P3');
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof DacV003ReferenceError);
  assert.match((caught as Error).message, /application-selection/);
  const complete = adoptDacV003RegistryReference('selected-domain-data', {
    baseline: { ...DAC_V003_BASELINE },
    authorityScope: 'shared/example',
    primaryIdentity: 'selected-invoice-rules-rev-0007-c',
    semanticIdentity: 'sem/invoice-rules',
    revisionIdentity: 'rev-0007',
    contentDigest: 'sha256:aaaa',
    lifecycleAuthorityRefs: [promotion, selection],
  } as never);
  assertDacV003ExactnessProfile(complete, 'P3');
  // A non-selected role carrying the same slots also satisfies P3 slot shape
  // (P3's promotion/selection rule is role-scoped to selected-domain-data).
  const genericP3 = adoptDacV003RegistryReference('evidence', {
    baseline: { ...DAC_V003_BASELINE },
    authorityScope: 'shared/example',
    primaryIdentity: 'evd-p3-0001',
    semanticIdentity: 'sem/example',
    revisionIdentity: 'rev-0007',
    contentDigest: 'sha256:aaaa',
    lifecycleAuthorityRefs: [selection],
  } as never);
  assertDacV003ExactnessProfile(genericP3, 'P3');
});

test('v3-001 P4/P5/P6/P7: lineage, target, evidence and correlation slots fail closed when absent', () => {
  const parent = ref({ semanticIdentity: 'sem/root', primaryIdentity: 'root-0001' });
  const provenance = adoptDacV003RegistryReference('provenance', {
    baseline: { ...DAC_V003_BASELINE },
    authorityScope: 'authoring/example',
    primaryIdentity: 'prov-0001',
  } as never);
  const inputRef = ref({ semanticIdentity: 'sem/input', primaryIdentity: 'input-0001' });

  const bare = ref();
  assertProfileError(bare, 'P4', 'P4 without parents/provenance');
  assertDacV003ExactnessProfile(
    ref({ parentRefs: [parent], provenanceRefs: [provenance] }),
    'P4',
  );
  assertProfileError(ref({ parentRefs: [], provenanceRefs: [provenance] }), 'P4', 'P4 empty parents');

  assertProfileError(bare, 'P5', 'P5 without contract profile + revision');
  assertDacV003ExactnessProfile(
    ref({ contractProfileIdentity: 'runtime-contract/example@1', revisionIdentity: 'rc-1.2.0' }),
    'P5',
  );
  // A floating "current" revision can never satisfy P5 — rejected at adoption.
  let caught: unknown;
  try {
    ref({ contractProfileIdentity: 'runtime-contract/example@1', revisionIdentity: 'current' });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof DacV003ReferenceError);
  assert.equal((caught as DacV003ReferenceError).code, 'MUTABLE_ALIAS_REJECTED');

  assertProfileError(bare, 'P6', 'P6 without inputs/provenance');
  assertDacV003ExactnessProfile(
    ref({ materialInputRefs: [inputRef], provenanceRefs: [provenance] }),
    'P6',
  );

  assertProfileError(bare, 'P7', 'P7 without logical operation identity');
  assertDacV003ExactnessProfile(ref({ logicalOperationIdentity: 'lop-0093' }), 'P7');
});

test('v3-001 C40: same revision identity + different authoritative digest fails closed; cross-scope equality does not merge', () => {
  const a = ref({
    authorityScope: 'shared/example',
    primaryIdentity: 'x-a',
    revisionIdentity: 'rev-0007',
    contentDigest: 'sha256:aaaa',
  });
  const b = ref({
    authorityScope: 'shared/example',
    primaryIdentity: 'x-b',
    revisionIdentity: 'rev-0007',
    contentDigest: 'sha256:aaaa',
  });
  assertDacV003RevisionDigestConsistency([a, b]);
  const c = ref({
    authorityScope: 'shared/example',
    primaryIdentity: 'x-c',
    revisionIdentity: 'rev-0007',
    contentDigest: 'sha256:bbbb',
  });
  let caught: unknown;
  try {
    assertDacV003RevisionDigestConsistency([a, c]);
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof DacV003ReferenceError);
  assert.equal((caught as DacV003ReferenceError).code, 'REVISION_DIGEST_CONTRADICTION');
  // Same revision identity in a DIFFERENT authority scope is a different
  // object (C41: digest equality never merges authority) — no contradiction.
  const otherScope = ref({
    authorityScope: 'shared/other',
    primaryIdentity: 'x-d',
    revisionIdentity: 'rev-0007',
    contentDigest: 'sha256:bbbb',
  });
  assertDacV003RevisionDigestConsistency([a, otherScope]);
  // References without both revision+digest never trip the guard.
  assertDacV003RevisionDigestConsistency([ref(), ref({ revisionIdentity: 'rev-0008' })]);
});
