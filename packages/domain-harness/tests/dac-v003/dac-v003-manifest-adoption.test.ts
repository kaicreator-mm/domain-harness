// Issue #328 / DAC v0.0.3 V3-004 focused tests — manifest adoption
// (immutable composition metadata): 1..n selected entries with effective
// promotion evidence and total ApplicationSelection coverage, exactly-one
// primary runtime closure, exactly-one UX closure, digest-bound adoption,
// the explicit external-authority applicability decision, immutability and
// identity projection.
import assert from 'node:assert/strict';
import test from 'node:test';
import { DAC_V003_BASELINE } from '../../src/dac-v003/index.js';
import {
  DAC_V003_MANIFEST_ADAPTER_VERSION,
  DAC_V003_MANIFEST_CONTRACT_VERSION,
  DacV003ManifestError,
  adoptDacV003ApplicationManifest,
  computeDacV003ApplicationManifestDigest,
  dacV003ManifestIdentityOf,
  isDacV003ApplicationManifest,
} from '../../src/dac-v003-manifest/index.js';
import {
  buildAdoptedManifest,
  buildExternalAuthority,
  buildManifestInput,
  withDeclaredDigest,
} from './manifest-fixture.js';
import { createSha256Fake } from '../package/fixture.js';

test('V3-004/#328: adoption freezes the four-role identity set with a verified content digest', async () => {
  const fixture = await buildManifestInput();
  const digest = await computeDacV003ApplicationManifestDigest(fixture.input, {
    sha256: createSha256Fake(),
  });
  const manifest = await adoptDacV003ApplicationManifest(
    { ...fixture.input, manifestContentDigest: digest },
    { sha256: createSha256Fake() },
  );
  assert.equal(manifest.adapter, DAC_V003_MANIFEST_ADAPTER_VERSION);
  assert.equal(manifest.contractVersion, DAC_V003_MANIFEST_CONTRACT_VERSION);
  assert.deepEqual(manifest.baseline, DAC_V003_BASELINE);
  assert.equal(manifest.manifestContentDigest, digest);
  assert.equal(manifest.applicationSemanticIdentity, 'app://acme/tally-ledger');
  assert.equal(manifest.applicationRevisionIdentity, 'app-rev-7');
  assert.equal(manifest.manifestIdentity, 'manifest://acme/tally-ledger/7');
  const identity = dacV003ManifestIdentityOf(manifest);
  assert.deepEqual(identity, {
    applicationSemanticIdentity: manifest.applicationSemanticIdentity,
    applicationRevisionIdentity: manifest.applicationRevisionIdentity,
    manifestIdentity: manifest.manifestIdentity,
    manifestContentDigest: manifest.manifestContentDigest,
  });
  assert.ok(isDacV003ApplicationManifest(manifest));
  assert.ok(!isDacV003ApplicationManifest({ ...manifest }));
});

test('V3-004/#328: selected Domain Data carries 1..n entries, each with effective promotion evidence and total ApplicationSelection coverage', async () => {
  const manifest = await buildAdoptedManifest();
  assert.ok(manifest.selectedDomainData.length >= 2, 'fixture carries n>1 entries');
  for (const entry of manifest.selectedDomainData) {
    assert.equal(entry.selected.role, 'selected-domain-data');
    assert.equal(entry.promotionEvidence.role, 'promotion-decision');
    assert.equal(entry.applicationSelection.role, 'application-selection');
    // Effective promotion: covers the exact selected semantic/revision/digest.
    assert.equal(entry.promotionEvidence.semanticIdentity, entry.selected.semanticIdentity);
    assert.equal(entry.promotionEvidence.revisionIdentity, entry.selected.revisionIdentity);
    assert.equal(entry.promotionEvidence.contentDigest, entry.selected.contentDigest);
    // Total selection coverage: same exact identity under selection authority.
    assert.equal(entry.applicationSelection.semanticIdentity, entry.selected.semanticIdentity);
    assert.equal(entry.applicationSelection.revisionIdentity, entry.selected.revisionIdentity);
    assert.equal(entry.applicationSelection.contentDigest, entry.selected.contentDigest);
    // The stated provenance is exactly the adopted P3 lifecycle closure.
    assert.ok(entry.selected.lifecycleAuthorityRefs.includes(entry.promotionEvidence));
    assert.ok(entry.selected.lifecycleAuthorityRefs.includes(entry.applicationSelection));
  }
  // Entries are distinct exact selections (no default/alias collapse).
  const identities = new Set(manifest.selectedDomainData.map((e) => e.selected.primaryIdentity));
  assert.equal(identities.size, manifest.selectedDomainData.length);
});

test('V3-004/#328: a single-entry manifest (n=1) is adoptable', async () => {
  const fixture = await buildManifestInput();
  const input = {
    ...fixture.input,
    manifestIdentity: 'manifest://acme/tally-ledger/7-n1',
    selectedDomainData: [fixture.entry],
  };
  const manifest = await adoptDacV003ApplicationManifest(await withDeclaredDigest(input), {
    sha256: createSha256Fake(),
  });
  assert.equal(manifest.selectedDomainData.length, 1);
});

test('V3-004/#328: exactly one primary runtime contract and one explicit compatibility target', async () => {
  const manifest = await buildAdoptedManifest();
  assert.equal(manifest.primaryRuntime.runtimeContract.role, 'runtime-contract');
  assert.equal(typeof manifest.primaryRuntime.runtimeContract.revisionIdentity, 'string');
  assert.equal(manifest.primaryRuntime.compatibilityTarget.role, 'compatibility-target');
  assert.equal(
    manifest.primaryRuntime.compatibilityTarget.contractProfileIdentity,
    'domain-harness',
  );
});

test('V3-004/#328: exactly one DomainUXDefinitionRef and one RuntimeInteractionContractRef, kept distinct', async () => {
  const manifest = await buildAdoptedManifest();
  assert.equal(manifest.ux.domainUxDefinition.role, 'domain-ux-definition');
  assert.equal(manifest.ux.runtimeInteractionContract.role, 'runtime-interaction-contract');
  assert.notEqual(
    manifest.ux.domainUxDefinition.semanticIdentity,
    manifest.ux.runtimeInteractionContract.semanticIdentity,
  );
});

test('V3-004/#328: requirement declarations carry their V3-002 satisfaction evidence references', async () => {
  const manifest = await buildAdoptedManifest();
  assert.equal(manifest.requirements.capability.length, 1);
  assert.equal(manifest.requirements.port.length, 1);
  assert.equal(manifest.requirements.hostBinding.length, 1);
  assert.equal(manifest.satisfactionEvidenceRefs.length, 3);
  const linked = new Set(manifest.satisfactionEvidenceRefs.map((e) => e.requirement.primaryIdentity));
  for (const requirement of [
    ...manifest.requirements.capability.map((r) => r.reference),
    ...manifest.requirements.port.map((r) => r.reference),
    ...manifest.requirements.hostBinding,
  ]) {
    assert.ok(linked.has(requirement.primaryIdentity));
  }
});

test('V3-004/#328: APPLICABLE external-authority path carries genuine #327 declarations', async () => {
  const manifest = await buildAdoptedManifest();
  assert.equal(manifest.externalAuthority.applicability, 'APPLICABLE');
  if (manifest.externalAuthority.applicability === 'APPLICABLE') {
    const [declaration] = manifest.externalAuthority.declarations;
    assert.ok(declaration);
    assert.equal(declaration.authority.reference.role, 'external-authority');
  }
});

test('V3-004/#328: NOT_APPLICABLE external-authority path records explicit applicability evidence', async () => {
  const fixture = await buildManifestInput();
  const input = {
    ...fixture.input,
    manifestIdentity: 'manifest://acme/tally-ledger/7-not-applicable',
    externalAuthority: {
      applicability: 'NOT_APPLICABLE' as const,
      applicabilityEvidence:
        'composition declares no external Business SoR effect authority; all effects are runtime-local',
    },
  };
  const manifest = await adoptDacV003ApplicationManifest(await withDeclaredDigest(input), {
    sha256: createSha256Fake(),
  });
  assert.equal(manifest.externalAuthority.applicability, 'NOT_APPLICABLE');
  if (manifest.externalAuthority.applicability === 'NOT_APPLICABLE') {
    assert.ok(manifest.externalAuthority.applicabilityEvidence.length > 0);
  }
  // The applicability decision is digest-covered content: switching the
  // decision changes the canonical digest.
  const applicableDigest = await computeDacV003ApplicationManifestDigest(fixture.input, {
    sha256: createSha256Fake(),
  });
  const notApplicableDigest = await computeDacV003ApplicationManifestDigest(input, {
    sha256: createSha256Fake(),
  });
  assert.notEqual(applicableDigest, notApplicableDigest);
});

test('V3-004/#328: adoption is deterministic and content-bound (same content, same digest)', async () => {
  const fixture = await buildManifestInput();
  const first = await computeDacV003ApplicationManifestDigest(fixture.input, {
    sha256: createSha256Fake(),
  });
  const second = await computeDacV003ApplicationManifestDigest(
    { ...fixture.input, opaque: { ...fixture.input.opaque, extra: 'ignored-by-nothing' } },
    { sha256: createSha256Fake() },
  );
  assert.notEqual(first, second, 'opaque content participates in the content digest');
  const third = await computeDacV003ApplicationManifestDigest(
    {
      ...fixture.input,
      externalAuthority: {
        applicability: 'APPLICABLE',
        declarations: [
          {
            authority: buildExternalAuthority('sor://billing/acme-2'),
            capabilityRequirements: { reconciliation: true },
          },
        ],
      },
    },
    { sha256: createSha256Fake() },
  );
  assert.notEqual(first, third, 'a distinct authority declaration identity changes the digest');
});

test('V3-004/#328: adopted records are deeply frozen', async () => {
  const manifest = await buildAdoptedManifest();
  assert.ok(Object.isFrozen(manifest));
  assert.ok(Object.isFrozen(manifest.selectedDomainData));
  assert.ok(Object.isFrozen(manifest.requirements));
  assert.ok(Object.isFrozen(manifest.primaryRuntime));
  assert.ok(Object.isFrozen(manifest.ux));
  assert.throws(() => {
    (manifest as { applicationSemanticIdentity: string }).applicationSemanticIdentity = 'x';
  });
  assert.throws(() => {
    (manifest.selectedDomainData as unknown as unknown[]).push({});
  });
});

test('V3-004/#328: adoption rejects a foreign/forged manifest object and identity projection fails closed', async () => {
  const manifest = await buildAdoptedManifest();
  assert.ok(!isDacV003ApplicationManifest('not-an-object'));
  assert.throws(
    () => dacV003ManifestIdentityOf({ ...manifest } as never),
    (error: unknown) => error instanceof DacV003ManifestError && error.code === 'NOT_AN_ADOPTED_V003_MANIFEST',
  );
});
