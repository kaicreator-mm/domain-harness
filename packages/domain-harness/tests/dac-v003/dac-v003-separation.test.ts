// Issue #323 / DAC v0.0.3 V3-001 — version separation: the historical v0.0.2
// adapter (src/dac/**, baseline 9c3ef91b…) and the new v0.0.3 foundation
// (src/dac-v003/**, baseline 3322b21…/163d2a4…) are distinct nominal
// universes. v0.0.2 references never pass v0.0.3 guards and vice versa —
// including for IDENTICAL role names — and neither adapter accepts the
// other's baseline. v0.0.2 adapter semantics/tests stay byte-separate and
// separately testable; nothing here edits or relabels them.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as dacV002 from '../../src/dac/index.js';
import {
  DAC_V003_BASELINE,
  DacV003ReferenceError,
  adoptDacV003RegistryReference,
  adoptRuntimeHostBindingRef,
  getDacV003ReferenceRole,
  isDacV003Reference,
} from '../../src/dac-v003/index.js';

function v003Input(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    baseline: { ...DAC_V003_BASELINE },
    authorityScope: 'composition/example-app',
    primaryIdentity: 'sep-0001',
    ...overrides,
  };
}

test('v3-001 separation: baselines are distinct and never interchangeable', () => {
  assert.equal(dacV002.DAC_REFERENCE_BASELINE.version, 'v0.0.2');
  assert.equal(dacV002.DAC_REFERENCE_BASELINE.baselineCommit, '9c3ef91b8b40d893e4fe2b0370200e765816ec2b');
  assert.equal(DAC_V003_BASELINE.version, 'v0.0.3');
  assert.equal(DAC_V003_BASELINE.semanticFreezeCommit, '3322b2152253b3c60f254c23a4f9ab1a14e063d1');
  assert.equal(DAC_V003_BASELINE.semanticFreezeTree, '163d2a4d9eb5b1659f35df1a0bb73bcaef96cd06');
  // Adapter identities are distinct surfaces.
  assert.notEqual(dacV002.DAC_REFERENCE_ADAPTER_VERSION, 'dac-v003-reference-adapter/1');
});

test('v3-001 separation: a v0.0.2-adopted reference is never a v0.0.3 reference (identical role names included)', () => {
  // Same role name, same identity fields — only the baseline universe differs.
  const v002Binding = dacV002.adoptRuntimeBindingRef({
    baseline: { ...dacV002.DAC_REFERENCE_BASELINE },
    semanticIdentity: 'sem/binding-x',
    authorityScope: 'runtime/example',
    revisionIdentity: 'rb-0001',
  });
  assert.ok(dacV002.isRuntimeBindingRef(v002Binding));
  assert.equal(isDacV003Reference(v002Binding), false);
  assert.equal(getDacV003ReferenceRole(v002Binding), undefined);

  const v003Binding = adoptDacV003RegistryReference('runtime-binding', v003Input({
    primaryIdentity: 'rb-0001',
    semanticIdentity: 'sem/binding-x',
    revisionIdentity: 'rb-0001',
  }) as never);
  assert.ok(isDacV003Reference(v003Binding));
  assert.equal(dacV002.isDacReference(v003Binding), false);
  assert.equal(dacV002.getDacReferenceRole(v003Binding), undefined);
});

test('v3-001 separation: v0.0.3 adoption rejects the v0.0.2 baseline shape and v0.0.2 references as nested refs', () => {
  // v0.0.2 baseline lacks the v0.0.3 freeze tree and uses a different
  // commit — it fails closed as UNSUPPORTED_DAC_BASELINE.
  let caught: unknown;
  try {
    adoptDacV003RegistryReference('evidence', v003Input({
      baseline: {
        contract: 'domain-application-contract',
        version: 'v0.0.3',
        semanticFreezeCommit: dacV002.DAC_REFERENCE_BASELINE.baselineCommit,
        semanticFreezeTree: DAC_V003_BASELINE.semanticFreezeTree,
      },
    }) as never);
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof DacV003ReferenceError);
  assert.equal((caught as DacV003ReferenceError).code, 'UNSUPPORTED_DAC_BASELINE');

  // A v0.0.2 reference cannot ride along as a v0.0.3 nested provenance ref.
  const v002Decision = dacV002.adoptPromotionDecisionRef({
    baseline: { ...dacV002.DAC_REFERENCE_BASELINE },
    semanticIdentity: 'sem/rules',
    authorityScope: 'governance/example',
  });
  let nested: unknown;
  try {
    adoptDacV003RegistryReference('evidence', v003Input({
      provenanceRefs: [v002Decision as never],
    }) as never);
  } catch (error) {
    nested = error;
  }
  assert.ok(nested instanceof DacV003ReferenceError);
  assert.equal((nested as DacV003ReferenceError).code, 'INVALID_REFERENCE');
});

test('v3-001 separation: v0.0.3 surface owns only v0.0.3 names (no shadowing of the v0.0.2 adapter API)', () => {
  // The v0.0.2 adapter keeps its own constructor/guard names; the v0.0.3
  // foundation uses DAC_V003_*/DacV003*/*V003* names plus the three new
  // canonical refs that did not exist on the v0.0.2 surface.
  assert.equal('adoptRuntimeHostBindingRef' in dacV002, false);
  assert.equal('adoptRuntimeHostBindingRequirementRef' in dacV002, false);
  assert.equal('adoptRuntimeInteractionContractRef' in dacV002, false);
  assert.equal('isRuntimeHostBindingRequirementRef' in dacV002, false);
  // The three canonical names are NEW v0.0.3 vocabulary adopted here.
  const requirement = adoptRuntimeHostBindingRef(v003Input({
    primaryIdentity: 'sep-hb',
    semanticIdentity: 'host-binding/sqlite-durable-store',
  }) as never);
  assert.equal(requirement.role, 'runtime-host-binding');
});

test('v3-001 separation: both adapter suites stay separately runnable (v0.0.2 guards still hold on their own refs)', () => {
  // The v0.0.2 adapter semantics are untouched and still enforce their own
  // invariants on their own references — separately testable means exactly
  // this: exercising one universe never weakens the other.
  const v002 = dacV002.adoptSelectedDomainDataRef({
    baseline: { ...dacV002.DAC_REFERENCE_BASELINE },
    semanticIdentity: 'sem/invoice-rules',
    authorityScope: 'shared/example',
    revisionIdentity: 'rev-0007',
    contentDigest: 'sha256:aaaa',
  });
  dacV002.verifyDacReferenceIdentity(v002, { revisionIdentity: 'rev-0007' });
  assert.throws(
    () => dacV002.verifyDacReferenceIdentity(v002, { revisionIdentity: 'rev-0008' }),
    dacV002.DacReferenceError,
  );
  // The v0.0.3 mirror of the same identity is a distinct object.
  const v003 = adoptDacV003RegistryReference('selected-domain-data', v003Input({
    primaryIdentity: 'selected-invoice-rules',
    semanticIdentity: 'sem/invoice-rules',
    revisionIdentity: 'rev-0007',
    contentDigest: 'sha256:aaaa',
  }) as never);
  assert.notEqual(isDacV003Reference(v002), true);
  assert.notEqual(dacV002.isDacReference(v003), true);
});
