// Issue #328 / DAC v0.0.3 V3-004 focused tests — authority-absorption and
// digest boundaries: the R1 P2 self-reference rule (the compatibility
// validation result is only ever an external association, never manifest
// content covered by the content digest), Runtime binding/activation
// evidence absorption, live instance state, live external
// operation/reconciliation state, digest mismatch and identity/digest
// conflict.
import assert from 'node:assert/strict';
import test from 'node:test';
import { DAC_V003_BASELINE, adoptDacV003RegistryReference } from '../../src/dac-v003/index.js';
import { deriveDacV003CompatibilityResult } from '../../src/dac-v003-compatibility/index.js';
import { adoptDacV003LogicalOperationRef } from '../../src/dac-v003-external/index.js';
import {
  DAC_V003_MANIFEST_ADAPTER_VERSION,
  DacV003ManifestError,
  adoptDacV003ApplicationManifest,
  associateDacV003ManifestCompatibilityValidation,
  computeDacV003ApplicationManifestDigest,
  isDacV003ApplicationManifest,
} from '../../src/dac-v003-manifest/index.js';
import type { DacV003ApplicationManifestAdoptionInput } from '../../src/dac-v003-manifest/index.js';
import {
  buildAdoptedManifest,
  buildExternalAuthority,
  buildManifestInput,
  buildValidationFor,
  withDeclaredDigest,
} from './manifest-fixture.js';
import { createSha256Fake } from '../package/fixture.js';

function adopt(input: unknown): Promise<unknown> {
  return adoptDacV003ApplicationManifest(input as DacV003ApplicationManifestAdoptionInput, {
    sha256: createSha256Fake(),
  });
}

async function expectManifestError(input: unknown, code: string): Promise<void> {
  await assert.rejects(
    adopt(input),
    (error: unknown) => error instanceof DacV003ManifestError && error.code === code,
    `expected DacV003ManifestError ${code}`,
  );
}

test('V3-004/#328 regression: R1 P2 — the manifest has no compatibility-validation content slot and its digest never covers a validation result', async () => {
  const fixture = await buildManifestInput();
  const input = await withDeclaredDigest(fixture.input);
  const baseDigest = input.manifestContentDigest;

  // An extra top-level field carrying the exact validation/result objects
  // is NOT adopted content: it is dropped (never interpreted, never covered
  // by the digest) and the canonical digest is unchanged — the result can
  // only ever associate externally.
  const validation = await buildValidationFor();
  const result = deriveDacV003CompatibilityResult(validation);
  const smuggled = {
    ...input,
    compatibilityValidation: validation,
    compatibilityResult: result,
  } as DacV003ApplicationManifestAdoptionInput;
  const smuggledDigest = await computeDacV003ApplicationManifestDigest(smuggled, {
    sha256: createSha256Fake(),
  });
  assert.equal(smuggledDigest, baseDigest);
  const manifest = await adoptDacV003ApplicationManifest(smuggled, {
    sha256: createSha256Fake(),
  });
  const keys = Object.keys(manifest).sort();
  assert.ok(!keys.includes('compatibilityValidation'));
  assert.ok(!keys.includes('compatibilityResult'));
  // The adopted record's complete field inventory (immutable metadata only):
  assert.deepEqual(keys, [
    'adapter',
    'applicationRevisionIdentity',
    'applicationSemanticIdentity',
    'baseline',
    'compositionProvenance',
    'contractVersion',
    'externalAuthority',
    'manifestContentDigest',
    'manifestIdentity',
    'opaque',
    'primaryRuntime',
    'requirements',
    'satisfactionEvidenceRefs',
    'selectedDomainData',
    'ux',
  ]);
});

test('V3-004/#328: a V3-002 validation act or result presented as definition content fails closed', async () => {
  const fixture = await buildManifestInput();
  const validation = await buildValidationFor();
  const result = deriveDacV003CompatibilityResult(validation);
  await expectManifestError(
    { ...fixture.input, opaque: { compatibilityValidation: validation } },
    'MANIFEST_EVIDENCE_ABSORPTION',
  );
  await expectManifestError(
    { ...fixture.input, compositionProvenance: { compatibilityResult: result } },
    'MANIFEST_EVIDENCE_ABSORPTION',
  );
  await expectManifestError(
    { ...fixture.input, opaque: { validationRef: validation.validationRef } },
    'MANIFEST_EVIDENCE_ABSORPTION',
  );
  await expectManifestError(
    { ...fixture.input, opaque: { resultRef: validation.resultRef } },
    'MANIFEST_EVIDENCE_ABSORPTION',
  );
});

test('V3-004/#328: #306 verdicts and runtime binding/activation identity fail closed as definition content', async () => {
  const fixture = await buildManifestInput();
  await expectManifestError(
    { ...fixture.input, compositionProvenance: { verdict: fixture.verdict } },
    'MANIFEST_EVIDENCE_ABSORPTION',
  );
  const bindingRef = adoptDacV003RegistryReference('runtime-binding', {
    baseline: { ...DAC_V003_BASELINE },
    authorityScope: 'domain-harness://runtime-binding',
    primaryIdentity: 'binding/instance-1',
  });
  await expectManifestError(
    { ...fixture.input, opaque: { binding: bindingRef } },
    'MANIFEST_EVIDENCE_ABSORPTION',
  );
  const activationRef = adoptDacV003RegistryReference('runtime-activation', {
    baseline: { ...DAC_V003_BASELINE },
    authorityScope: 'domain-harness://runtime-activation',
    primaryIdentity: 'activation/instance-1',
  });
  await expectManifestError(
    { ...fixture.input, opaque: { activation: activationRef } },
    'MANIFEST_EVIDENCE_ABSORPTION',
  );
});

test('V3-004/#328: live external operation/reconciliation state fails closed as definition content', async () => {
  const fixture = await buildManifestInput();
  const authority = buildExternalAuthority();
  const logicalOperation = adoptDacV003LogicalOperationRef({
    baseline: { ...DAC_V003_BASELINE },
    runtimeAuthorityScope: 'domain-harness://runtime',
    logicalOperationIdentity: 'op://tally/commit-1',
    externalAuthority: authority,
    operationSemanticIdentity: 'tally/commit',
  });
  await expectManifestError(
    { ...fixture.input, opaque: { pendingOperation: logicalOperation } },
    'LIVE_EXTERNAL_STATE_ABSORPTION',
  );
  const bareObservation = adoptDacV003RegistryReference('external-observation', {
    baseline: { ...DAC_V003_BASELINE },
    authorityScope: 'ext://billing/acme',
    primaryIdentity: 'observation/1',
    logicalOperationIdentity: 'op://tally/commit-1',
  });
  await expectManifestError(
    { ...fixture.input, opaque: { observation: bareObservation } },
    'LIVE_EXTERNAL_STATE_ABSORPTION',
  );
  const bareReconciliation = adoptDacV003RegistryReference('reconciliation', {
    baseline: { ...DAC_V003_BASELINE },
    authorityScope: 'ext://billing/acme',
    primaryIdentity: 'reconciliation/1',
  });
  await expectManifestError(
    { ...fixture.input, opaque: { reconciliation: bareReconciliation } },
    'LIVE_EXTERNAL_STATE_ABSORPTION',
  );
  // But the same opaque key holding a genuine static authority declaration
  // identity is preserved fine (identity declaration, not live state).
  const manifest = await adoptDacV003ApplicationManifest(
    await withDeclaredDigest({
      ...fixture.input,
      manifestIdentity: 'manifest://acme/tally-ledger/7-static-authority',
      opaque: { declaredAuthority: authority },
    }),
    { sha256: createSha256Fake() },
  );
  assert.ok(isDacV003ApplicationManifest(manifest));
});

test('V3-004/#328: recognized live instance-state fields fail closed', async () => {
  const fixture = await buildManifestInput();
  await expectManifestError(
    { ...fixture.input, opaque: { currentWorkflowStep: 'step-3' } },
    'INSTANCE_STATE_LEAKAGE',
  );
  await expectManifestError(
    { ...fixture.input, compositionProvenance: { uxState: 'rendering' } },
    'INSTANCE_STATE_LEAKAGE',
  );
});

test('V3-004/#328 review repair P1-1 regression: forbidden records nested at any depth of digest-covered opaque content fail closed', async () => {
  const fixture = await buildManifestInput();
  const validation = await buildValidationFor();
  const result = deriveDacV003CompatibilityResult(validation);
  // Extra object nesting buries the minted validation act two levels deep —
  // the digest would still cover it, so the screen must reject at that depth.
  await expectManifestError(
    { ...fixture.input, opaque: { nested: { compatibilityValidation: validation } } },
    'MANIFEST_EVIDENCE_ABSORPTION',
  );
  // Deep nesting through objects AND arrays (a #306 verdict at depth 4).
  await expectManifestError(
    {
      ...fixture.input,
      compositionProvenance: { chain: { steps: [{ verdict: fixture.verdict }] } },
    },
    'MANIFEST_EVIDENCE_ABSORPTION',
  );
  // The separately-encoded result view, nested inside an array element.
  await expectManifestError(
    { ...fixture.input, opaque: { history: [{ compatibilityResult: result }] } },
    'MANIFEST_EVIDENCE_ABSORPTION',
  );
  // Binding/activation identity nested at depth.
  const bindingRef = adoptDacV003RegistryReference('runtime-binding', {
    baseline: { ...DAC_V003_BASELINE },
    authorityScope: 'domain-harness://runtime-binding',
    primaryIdentity: 'binding/instance-9',
  });
  await expectManifestError(
    { ...fixture.input, opaque: { lifecycle: { binding: bindingRef } } },
    'MANIFEST_EVIDENCE_ABSORPTION',
  );
  // The minted validation act presented AS the opaque area root itself.
  await expectManifestError({ ...fixture.input, opaque: validation }, 'MANIFEST_EVIDENCE_ABSORPTION');
});

test('V3-004/#328 review repair P1-1 regression: nested live external state and instance-state fields fail closed at every depth', async () => {
  const fixture = await buildManifestInput();
  const authority = buildExternalAuthority();
  const logicalOperation = adoptDacV003LogicalOperationRef({
    baseline: { ...DAC_V003_BASELINE },
    runtimeAuthorityScope: 'domain-harness://runtime',
    logicalOperationIdentity: 'op://tally/commit-2',
    externalAuthority: authority,
    operationSemanticIdentity: 'tally/commit',
  });
  await expectManifestError(
    { ...fixture.input, opaque: { inbox: [{ pendingOperation: logicalOperation }] } },
    'LIVE_EXTERNAL_STATE_ABSORPTION',
  );
  const bareReconciliation = adoptDacV003RegistryReference('reconciliation', {
    baseline: { ...DAC_V003_BASELINE },
    authorityScope: 'ext://billing/acme',
    primaryIdentity: 'reconciliation/2',
  });
  await expectManifestError(
    { ...fixture.input, compositionProvenance: { open: { world: { reconciliation: bareReconciliation } } } },
    'LIVE_EXTERNAL_STATE_ABSORPTION',
  );
  // Recognized instance-state vocabulary at nested object depth.
  await expectManifestError(
    { ...fixture.input, opaque: { ui: { session: { uxState: 'rendering' } } } },
    'INSTANCE_STATE_LEAKAGE',
  );
  await expectManifestError(
    { ...fixture.input, compositionProvenance: { steps: [{ currentWorkflowStep: 'step-3' }] } },
    'INSTANCE_STATE_LEAKAGE',
  );
  // The same classes inside an external-authority declaration's opaque record.
  const validation = await buildValidationFor();
  await expectManifestError(
    {
      ...fixture.input,
      externalAuthority: {
        applicability: 'APPLICABLE',
        declarations: [
          {
            authority: buildExternalAuthority(),
            opaque: { nested: { compatibilityValidation: validation } },
          },
        ],
      },
    },
    'MANIFEST_EVIDENCE_ABSORPTION',
  );
  await expectManifestError(
    {
      ...fixture.input,
      externalAuthority: {
        applicability: 'APPLICABLE',
        declarations: [
          {
            authority: buildExternalAuthority(),
            capabilityRequirements: { live: { mailboxState: 'pending' } },
          },
        ],
      },
    },
    'INSTANCE_STATE_LEAKAGE',
  );
});

test('V3-004/#328 review repair P1-1 regression: cyclic opaque content fails closed through the declared taxonomy', async () => {
  const fixture = await buildManifestInput();
  const cyclicObject: Record<string, unknown> = { note: 'self-referencing' };
  cyclicObject.self = cyclicObject;
  await expectManifestError(
    { ...fixture.input, opaque: cyclicObject },
    'INVALID_MANIFEST_INPUT',
  );
  const cyclicArray: unknown[] = ['element'];
  cyclicArray.push(cyclicArray);
  await expectManifestError(
    { ...fixture.input, compositionProvenance: { chain: cyclicArray } },
    'INVALID_MANIFEST_INPUT',
  );
});

test('V3-004/#328 review repair P1-1 regression: the digest entry point rejects nested forbidden content and benign nested content stays digest-covered', async () => {
  const fixture = await buildManifestInput();
  const validation = await buildValidationFor();
  // The digest computation path screens the same full depth as adoption, so
  // a forbidden record can never become canonical digest material at all.
  await assert.rejects(
    computeDacV003ApplicationManifestDigest(
      { ...fixture.input, opaque: { nested: { validation } } },
      { sha256: createSha256Fake() },
    ),
    (error: unknown) =>
      error instanceof DacV003ManifestError && error.code === 'MANIFEST_EVIDENCE_ABSORPTION',
  );
  // Benign nested unknown content is legitimate opaque material: preserved
  // verbatim AND covered by the digest (a nested change moves the digest).
  const baseInput = {
    ...fixture.input,
    manifestIdentity: 'manifest://acme/tally-ledger/7-nested-opaque',
  };
  const baseDigest = await computeDacV003ApplicationManifestDigest(baseInput, {
    sha256: createSha256Fake(),
  });
  const nestedInput = {
    ...baseInput,
    opaque: { sourceMeta: { provenanceLayer: { tool: { name: 'composer', options: ['a', 'b'] } } } },
  };
  const nestedDigest = await computeDacV003ApplicationManifestDigest(nestedInput, {
    sha256: createSha256Fake(),
  });
  assert.notEqual(nestedDigest, baseDigest);
  const manifest = await adoptDacV003ApplicationManifest(
    { ...nestedInput, manifestContentDigest: nestedDigest },
    { sha256: createSha256Fake() },
  );
  assert.deepEqual(
    (manifest.opaque as Record<string, unknown>).sourceMeta,
    nestedInput.opaque.sourceMeta,
  );
});

test('V3-004/#328: declared digest mismatch and identity/digest conflict fail closed', async () => {
  const fixture = await buildManifestInput();
  const input = await withDeclaredDigest(fixture.input);
  const tampered = {
    ...input,
    applicationRevisionIdentity: 'app-rev-8',
  };
  await expectManifestError(tampered, 'MANIFEST_DIGEST_MISMATCH');
  // Same immutable manifest identity resolving to a different authoritative
  // digest: adopt the original once, then the content-mutated variant under
  // the same manifestIdentity with a correctly recomputed digest.
  const adopted = await adoptDacV003ApplicationManifest(input, { sha256: createSha256Fake() });
  assert.ok(adopted);
  const conflictingDigest = await computeDacV003ApplicationManifestDigest(tampered, {
    sha256: createSha256Fake(),
  });
  await expectManifestError(
    { ...tampered, manifestContentDigest: conflictingDigest },
    'MANIFEST_IDENTITY_DIGEST_CONFLICT',
  );
});

test('V3-004/#328: a structurally identical forged manifest fails closed', async () => {
  const manifest = await buildAdoptedManifest();
  const forged = { ...manifest, adapter: DAC_V003_MANIFEST_ADAPTER_VERSION };
  assert.ok(!isDacV003ApplicationManifest(forged));
  const validation = await buildValidationFor();
  assert.throws(
    () => associateDacV003ManifestCompatibilityValidation(forged, validation),
    (error: unknown) =>
      error instanceof DacV003ManifestError && error.code === 'NOT_AN_ADOPTED_V003_MANIFEST',
  );
});
