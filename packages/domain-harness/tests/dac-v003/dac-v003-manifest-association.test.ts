// Issue #328 / DAC v0.0.3 V3-004 focused tests — the external association of
// the exact subject/target-bound compatibility validation result (R1 P2):
// association of genuine V3-002 mints over this manifest's exact declared
// closure, disposition pass-through (COMPATIBLE / INCOMPATIBLE associate;
// a target-less FAIL_CLOSED validation is not bound to this manifest's
// target and cannot associate), forged-input rejection, foreign-closure
// rejection, and the structural separation between the association record
// and the immutable manifest content. Review-repair coverage: the exact
// multi-entry association semantics — authoritative validation coverage
// must bind EVERY selected Domain Data entry by complete
// role/scope/semantic/revision/digest identity, never `some` one entry, and
// a provenance authority sharing only semantic/revision never passes.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DAC_V003_COMPATIBILITY_AUTHORITY_SCOPE,
  adoptDomainUXDefinitionRef,
  deriveDacV003CompatibilityResult,
  validateDacV003Compatibility,
} from '../../src/dac-v003-compatibility/index.js';
import { DAC_V003_BASELINE, adoptDacV003RegistryReference } from '../../src/dac-v003/index.js';
import {
  DacV003ManifestError,
  adoptDacV003ApplicationManifest,
  associateDacV003ManifestCompatibilityValidation,
  computeDacV003ApplicationManifestDigest,
  isDacV003ManifestCompatibilityAssociation,
} from '../../src/dac-v003-manifest/index.js';
import type {
  DacV003ApplicationManifest,
  DacV003ApplicationManifestAdoptionInput,
  DacV003ManifestSelectedDomainDataEntryInput,
} from '../../src/dac-v003-manifest/index.js';
import {
  buildAdoptedManifest,
  buildAdoptedSingleEntryManifest,
  buildIntakeVerdictFor,
  buildManifestInput,
  buildValidationFor,
  entryTuplesFor,
  withDeclaredDigest,
} from './manifest-fixture.js';
import type { V003ManifestFixture } from './manifest-fixture.js';
import { buildCompatibleRequest, buildV003Refs } from './compatibility-fixture.js';
import { createSha256Fake } from '../package/fixture.js';

/** Adopts the fixture with exactly the given (single) selected entry. */
async function adoptWithEntry(
  fixture: V003ManifestFixture,
  entry: DacV003ManifestSelectedDomainDataEntryInput,
  manifestIdentity: string,
): Promise<DacV003ApplicationManifest> {
  const input: DacV003ApplicationManifestAdoptionInput = {
    ...fixture.input,
    manifestIdentity,
    selectedDomainData: [entry],
  };
  return adoptDacV003ApplicationManifest(await withDeclaredDigest(input), {
    sha256: createSha256Fake(),
  });
}

test('V3-004/#328: associating the exact COMPATIBLE validation result produces the external record', async () => {
  const manifest = await buildAdoptedSingleEntryManifest();
  const validation = await buildValidationFor();
  const association = associateDacV003ManifestCompatibilityValidation(manifest, validation);
  assert.ok(isDacV003ManifestCompatibilityAssociation(association));
  assert.equal(
    association.manifestValidationAssociation,
    'dac-v003-manifest-validation-association/1',
  );
  assert.deepEqual(association.manifestIdentity, {
    applicationSemanticIdentity: manifest.applicationSemanticIdentity,
    applicationRevisionIdentity: manifest.applicationRevisionIdentity,
    manifestIdentity: manifest.manifestIdentity,
    manifestContentDigest: manifest.manifestContentDigest,
  });
  assert.equal(association.validationRef, validation.validationRef);
  assert.equal(association.resultRef, validation.resultRef);
  assert.equal(association.authority.authorityScope, DAC_V003_COMPATIBILITY_AUTHORITY_SCOPE);
  assert.equal(association.authority.validationIdentity, validation.subject.validationIdentity);
  assert.equal(association.disposition.value, 'COMPATIBLE');
  assert.equal(association.disposition.namespace, 'dac-v003/reference-compatibility-disposition');
  assert.equal(association.targetProfile, 'domain-harness@v0.0.3-profile/node-1');
  assert.ok(Object.isFrozen(association));
  // The association is external: minting it leaves the manifest unchanged.
  assert.equal(manifest.adapter, 'dac-v003-manifest-adapter/1');
  assert.ok(!Object.keys(manifest).includes('manifestValidationAssociation'));
  assert.ok(!isDacV003ManifestCompatibilityAssociation({ ...association }));
});

test("V3-004/#328: an INCOMPATIBLE validation of this manifest's exact target still associates (disposition pass-through)", async () => {
  const manifest = await buildAdoptedSingleEntryManifest();
  const validation = await buildValidationFor({ supportedTargetProfiles: [] });
  assert.equal(validation.disposition.value, 'INCOMPATIBLE');
  const association = associateDacV003ManifestCompatibilityValidation(manifest, validation);
  assert.equal(association.disposition.value, 'INCOMPATIBLE');
  assert.equal(association.targetProfile, 'domain-harness@v0.0.3-profile/node-1');
});

test("V3-004/#328: a FAIL_CLOSED validation without an explicit target is not bound to this manifest and cannot associate", async () => {
  const manifest = await buildAdoptedSingleEntryManifest();
  const validation = await buildValidationFor({ compatibilityTarget: undefined });
  assert.equal(validation.disposition.value, 'FAIL_CLOSED');
  assert.equal(validation.subject.targetProfile, undefined);
  assert.throws(
    () => associateDacV003ManifestCompatibilityValidation(manifest, validation),
    (error: unknown) =>
      error instanceof DacV003ManifestError && error.code === 'ASSOCIATION_SUBJECT_MISMATCH',
  );
});

test('V3-004/#328: forged association inputs fail closed', async () => {
  const manifest = await buildAdoptedSingleEntryManifest();
  const validation = await buildValidationFor();
  assert.throws(
    () => associateDacV003ManifestCompatibilityValidation(manifest, { ...validation }),
    (error: unknown) =>
      error instanceof DacV003ManifestError && error.code === 'INVALID_ASSOCIATION_INPUT',
  );
  assert.throws(
    () => associateDacV003ManifestCompatibilityValidation(manifest, validation.validationRef as never),
    (error: unknown) =>
      error instanceof DacV003ManifestError && error.code === 'INVALID_ASSOCIATION_INPUT',
  );
});

test('V3-004/#328: a validation over a different UX definition cannot associate', async () => {
  const manifest = await buildAdoptedSingleEntryManifest();
  const otherUx = adoptDomainUXDefinitionRef({
    baseline: { ...DAC_V003_BASELINE },
    authorityScope: 'dac://domain-ux/acme',
    primaryIdentity: 'ux-def/tally-ledger-2',
    semanticIdentity: 'tally-ledger-ux-other',
    revisionIdentity: 'ux-rev-4',
  });
  const request = await buildCompatibleRequest({ domainUxDefinition: otherUx });
  const validation = await validateDacV003Compatibility(request);
  assert.equal(validation.disposition.value, 'COMPATIBLE');
  assert.throws(
    () => associateDacV003ManifestCompatibilityValidation(manifest, validation),
    (error: unknown) =>
      error instanceof DacV003ManifestError && error.code === 'ASSOCIATION_SUBJECT_MISMATCH',
  );
});

test('V3-004/#328: a validation over a different requirement closure cannot associate', async () => {
  const manifest = await buildAdoptedSingleEntryManifest();
  const refs = buildV003Refs();
  const request = await buildCompatibleRequest({
    hostBindingRequirements: [],
    satisfactionEvidence: [refs.capabilityEvidence, refs.portEvidence],
  });
  const validation = await validateDacV003Compatibility(request);
  assert.equal(validation.disposition.value, 'COMPATIBLE');
  assert.throws(
    () => associateDacV003ManifestCompatibilityValidation(manifest, validation),
    (error: unknown) =>
      error instanceof DacV003ManifestError && error.code === 'ASSOCIATION_SUBJECT_MISMATCH',
  );
});

test('V3-004/#328: a validation over a different upstream selected entry cannot associate', async () => {
  const manifest = await buildAdoptedSingleEntryManifest();
  const otherVerdict = await buildIntakeVerdictFor('rev-000077');
  const request = await buildCompatibleRequest({ selectionValidation: otherVerdict });
  const validation = await validateDacV003Compatibility(request);
  assert.equal(validation.disposition.value, 'COMPATIBLE');
  assert.throws(
    () => associateDacV003ManifestCompatibilityValidation(manifest, validation),
    (error: unknown) =>
      error instanceof DacV003ManifestError && error.code === 'ASSOCIATION_SUBJECT_MISMATCH',
  );
});

test('V3-004/#328 review repair P1-2 regression: a validation covering only one entry of a multi-entry manifest cannot associate', async () => {
  // The two-entry fixture manifest: entry rev-000042 is verdict-covered,
  // entry rev-000043 is not. The standard validation is minted over the
  // rev-000042 #306 verdict only, so entry [1] stays unvalidated and the
  // association must fail closed instead of binding via `some` one entry.
  const manifest = await buildAdoptedManifest();
  assert.equal(manifest.selectedDomainData.length, 2);
  const validation = await buildValidationFor();
  assert.equal(validation.disposition.value, 'COMPATIBLE');
  assert.throws(
    () => associateDacV003ManifestCompatibilityValidation(manifest, validation),
    (error: unknown) => {
      assert.ok(error instanceof DacV003ManifestError);
      assert.equal(error.code, 'ASSOCIATION_SUBJECT_MISMATCH');
      assert.match(error.message, /selected entry \[1\]/);
      return true;
    },
  );
});

test('V3-004/#328 review repair P1-2 regression: promotion provenance from a foreign authority scope sharing semantic/revision cannot associate', async () => {
  const fixture = await buildManifestInput();
  const { domainId, revision, digest } = entryTuplesFor(fixture.verdict);
  // Same semantic/revision/digest as the genuine promotion decision, but a
  // DIFFERENT authority scope: a foreign promotion authority. Adoption
  // accepts it (the manifest-side alignment check is semantic/revision/
  // digest), so only the complete-identity association comparison catches it.
  const roguePromotion = adoptDacV003RegistryReference('promotion-decision', {
    baseline: { ...DAC_V003_BASELINE },
    authorityScope: 'dac://governance/rogue',
    primaryIdentity: `promotion/${domainId}@${revision}-rogue`,
    semanticIdentity: domainId,
    revisionIdentity: revision,
    contentDigest: digest,
  });
  const selected = adoptDacV003RegistryReference('selected-domain-data', {
    baseline: { ...DAC_V003_BASELINE },
    authorityScope: 'dac://app-composition/acme',
    primaryIdentity: `selected/${domainId}@${revision}`,
    semanticIdentity: domainId,
    revisionIdentity: revision,
    contentDigest: digest,
    lifecycleAuthorityRefs: [roguePromotion, fixture.entry.applicationSelection],
  });
  const manifest = await adoptWithEntry(
    fixture,
    {
      selected: selected as DacV003ManifestSelectedDomainDataEntryInput['selected'],
      promotionEvidence: roguePromotion as DacV003ManifestSelectedDomainDataEntryInput['promotionEvidence'],
      applicationSelection: fixture.entry.applicationSelection,
    },
    'manifest://acme/tally-ledger/7-foreign-promotion-scope',
  );
  const validation = await buildValidationFor();
  assert.throws(
    () => associateDacV003ManifestCompatibilityValidation(manifest, validation),
    (error: unknown) => {
      assert.ok(error instanceof DacV003ManifestError);
      assert.equal(error.code, 'ASSOCIATION_SUBJECT_MISMATCH');
      assert.match(error.message, /selected entry \[0\]/);
      return true;
    },
  );
});

test('V3-004/#328 review repair P1-2 regression: application-selection provenance missing its content digest cannot associate', async () => {
  const fixture = await buildManifestInput();
  const { domainId, revision, digest } = entryTuplesFor(fixture.verdict);
  // Same scope/semantic/revision as the genuine application-selection, but
  // no contentDigest: complete-identity comparison (digest included) must
  // reject it where a semantic/revision-only comparison would pass.
  const digestlessSelection = adoptDacV003RegistryReference('application-selection', {
    baseline: { ...DAC_V003_BASELINE },
    authorityScope: 'dac://app-composition/acme',
    primaryIdentity: `selection/${domainId}@${revision}-digestless`,
    semanticIdentity: domainId,
    revisionIdentity: revision,
  });
  const selected = adoptDacV003RegistryReference('selected-domain-data', {
    baseline: { ...DAC_V003_BASELINE },
    authorityScope: 'dac://app-composition/acme',
    primaryIdentity: `selected/${domainId}@${revision}-digestless-selection`,
    semanticIdentity: domainId,
    revisionIdentity: revision,
    contentDigest: digest,
    lifecycleAuthorityRefs: [fixture.entry.promotionEvidence, digestlessSelection],
  });
  const manifest = await adoptWithEntry(
    fixture,
    {
      selected: selected as DacV003ManifestSelectedDomainDataEntryInput['selected'],
      promotionEvidence: fixture.entry.promotionEvidence,
      applicationSelection: digestlessSelection as DacV003ManifestSelectedDomainDataEntryInput['applicationSelection'],
    },
    'manifest://acme/tally-ledger/7-digestless-selection',
  );
  const validation = await buildValidationFor();
  assert.throws(
    () => associateDacV003ManifestCompatibilityValidation(manifest, validation),
    (error: unknown) =>
      error instanceof DacV003ManifestError && error.code === 'ASSOCIATION_SUBJECT_MISMATCH',
  );
});

test('V3-004/#328: a validation recording evidence the manifest does not carry cannot associate', async () => {
  const fixture = await buildManifestInput();
  const request = await buildCompatibleRequest();
  const validation = await validateDacV003Compatibility(request);
  assert.equal(validation.disposition.value, 'COMPATIBLE');
  // The single-entry manifest declares the port requirement but carries no
  // port evidence reference; the validation over the full evidence set
  // recorded a satisfying evidence identity this manifest does not carry.
  const [capabilityEvidence, _portEvidence, hostBindingEvidence] =
    fixture.input.satisfactionEvidence ?? [];
  assert.ok(capabilityEvidence && hostBindingEvidence);
  const reduced = [capabilityEvidence, hostBindingEvidence];
  const input: DacV003ApplicationManifestAdoptionInput = {
    ...fixture.input,
    manifestIdentity: 'manifest://acme/tally-ledger/7-reduced-evidence',
    selectedDomainData: [fixture.entry as DacV003ManifestSelectedDomainDataEntryInput],
    satisfactionEvidence: reduced,
  };
  const digest = await computeDacV003ApplicationManifestDigest(input, {
    sha256: createSha256Fake(),
  });
  const manifest = await adoptDacV003ApplicationManifest(
    { ...input, manifestContentDigest: digest },
    { sha256: createSha256Fake() },
  );
  assert.throws(
    () => associateDacV003ManifestCompatibilityValidation(manifest, validation),
    (error: unknown) =>
      error instanceof DacV003ManifestError && error.code === 'ASSOCIATION_SUBJECT_MISMATCH',
  );
});

test('V3-004/#328: the separately-encoded result view and the association agree on the authority tuple', async () => {
  const manifest = await buildAdoptedSingleEntryManifest();
  const validation = await buildValidationFor();
  const result = deriveDacV003CompatibilityResult(validation);
  const association = associateDacV003ManifestCompatibilityValidation(manifest, validation);
  assert.equal(association.resultRef, result.resultRef);
  assert.equal(association.validationRef, result.validationRef);
  assert.equal(association.authority.validationIdentity, result.validationIdentity);
  assert.equal(association.authority.authorityScope, result.authorityScope);
  assert.deepEqual(association.disposition, result.disposition);
});

test('V3-004/#328 regression: identical content re-adopted under one digest keeps association evidence stable', async () => {
  const fixture = await buildManifestInput();
  const input: DacV003ApplicationManifestAdoptionInput = {
    ...fixture.input,
    manifestIdentity: 'manifest://acme/tally-ledger/7-readopt',
    selectedDomainData: [fixture.entry as DacV003ManifestSelectedDomainDataEntryInput],
  };
  const digest = await computeDacV003ApplicationManifestDigest(input, {
    sha256: createSha256Fake(),
  });
  const first = await adoptDacV003ApplicationManifest(
    { ...input, manifestContentDigest: digest },
    { sha256: createSha256Fake() },
  );
  const second = await adoptDacV003ApplicationManifest(
    { ...input, manifestContentDigest: digest },
    { sha256: createSha256Fake() },
  );
  assert.equal(first.manifestContentDigest, second.manifestContentDigest);
  const validation = await buildValidationFor();
  const left = associateDacV003ManifestCompatibilityValidation(first, validation);
  const right = associateDacV003ManifestCompatibilityValidation(second, validation);
  assert.deepEqual(left.manifestIdentity, right.manifestIdentity);
  assert.equal(left.authority.validationIdentity, right.authority.validationIdentity);
});
