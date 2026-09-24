// Issue #328 / DAC v0.0.3 V3-004 focused tests — Manifest-side cardinality
// and closure failure handling: selected-data cardinality, P3 lifecycle
// binding, effective promotion evidence, total ApplicationSelection
// coverage, exactly-one primary runtime/UX closures, requirement-evidence
// closure, and the explicit external-authority applicability decision.
// Structural errors fire before any digest comparison, so the fixture's
// 'pending' digest placeholder is sufficient for every case here.
import assert from 'node:assert/strict';
import test from 'node:test';
import { DAC_V003_BASELINE, adoptDacV003RegistryReference } from '../../src/dac-v003/index.js';
import { adoptDacV003RequirementSatisfactionEvidence } from '../../src/dac-v003-compatibility/index.js';
import {
  DacV003ManifestError,
  adoptDacV003ApplicationManifest,
} from '../../src/dac-v003-manifest/index.js';
import type { DacV003ApplicationManifestAdoptionInput } from '../../src/dac-v003-manifest/index.js';
import { buildV003Entry, buildManifestInput, withDeclaredDigest } from './manifest-fixture.js';
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

/** A selected ref for `revision` binding the given provenance objects. */
function selectedBinding(
  revision: string,
  digest: string,
  promotion: ReturnType<typeof buildV003Entry>['promotionEvidence'],
  selection: ReturnType<typeof buildV003Entry>['applicationSelection'],
) {
  return adoptDacV003RegistryReference('selected-domain-data', {
    baseline: { ...DAC_V003_BASELINE },
    authorityScope: 'dac://app-composition/acme',
    primaryIdentity: `selected/fixture-domain@${revision}`,
    semanticIdentity: 'fixture-domain',
    revisionIdentity: revision,
    contentDigest: digest,
    lifecycleAuthorityRefs: [promotion, selection],
  });
}

test('V3-004/#328: zero selected Domain Data entries fail closed', async () => {
  const fixture = await buildManifestInput();
  await expectManifestError(
    { ...fixture.input, selectedDomainData: [] },
    'SELECTED_DATA_CARDINALITY_ZERO',
  );
});

test('V3-004/#328: selected entry without promotion provenance in the P3 lifecycle closure fails closed', async () => {
  const fixture = await buildManifestInput();
  const orphan = buildV003Entry('rev-000044', 'pkg-orphan');
  const unbound = adoptDacV003RegistryReference('selected-domain-data', {
    baseline: { ...DAC_V003_BASELINE },
    authorityScope: 'dac://app-composition/acme',
    primaryIdentity: 'selected/fixture-domain@rev-000044',
    semanticIdentity: 'fixture-domain',
    revisionIdentity: 'rev-000044',
    contentDigest: 'pkg-orphan',
    lifecycleAuthorityRefs: [orphan.applicationSelection],
  });
  await expectManifestError(
    {
      ...fixture.input,
      selectedDomainData: [
        fixture.entry,
        {
          selected: unbound,
          promotionEvidence: orphan.promotionEvidence,
          applicationSelection: orphan.applicationSelection,
        },
      ],
    },
    'SELECTED_LIFECYCLE_AUTHORITY_UNBOUND',
  );
});

test('V3-004/#328: promotion evidence for a different revision is not effective and fails closed', async () => {
  const fixture = await buildManifestInput();
  const misalignedPromotion = buildV003Entry('rev-000099', 'pkg-other').promotionEvidence;
  const selection = fixture.extraEntry.applicationSelection;
  const selected = selectedBinding('rev-000043', 'pkg-rev-000043', misalignedPromotion, selection);
  await expectManifestError(
    {
      ...fixture.input,
      selectedDomainData: [
        fixture.entry,
        { selected, promotionEvidence: misalignedPromotion, applicationSelection: selection },
      ],
    },
    'SELECTED_PROMOTION_EVIDENCE_NOT_EFFECTIVE',
  );
});

test('V3-004/#328: incomplete ApplicationSelection coverage for one entry fails closed', async () => {
  const fixture = await buildManifestInput();
  const promotion = fixture.extraEntry.promotionEvidence;
  const misalignedSelection = buildV003Entry('rev-000098', 'pkg-other-selection')
    .applicationSelection;
  const selected = selectedBinding('rev-000043', 'pkg-rev-000043', promotion, misalignedSelection);
  await expectManifestError(
    {
      ...fixture.input,
      selectedDomainData: [
        fixture.entry,
        { selected, promotionEvidence: promotion, applicationSelection: misalignedSelection },
      ],
    },
    'SELECTED_APPLICATION_SELECTION_COVERAGE_INCOMPLETE',
  );
});

test('V3-004/#328: selected reference without the P3 identity floor fails closed', async () => {
  const fixture = await buildManifestInput();
  const promotion = adoptDacV003RegistryReference('promotion-decision', {
    baseline: { ...DAC_V003_BASELINE },
    authorityScope: 'dac://governance/promotion',
    primaryIdentity: 'promotion/fixture-domain@rev-000045',
    semanticIdentity: 'fixture-domain',
    revisionIdentity: 'rev-000045',
    contentDigest: 'pkg-45',
  });
  const selection = adoptDacV003RegistryReference('application-selection', {
    baseline: { ...DAC_V003_BASELINE },
    authorityScope: 'dac://app-composition/acme',
    primaryIdentity: 'selection/fixture-domain@rev-000045',
    semanticIdentity: 'fixture-domain',
    revisionIdentity: 'rev-000045',
    contentDigest: 'pkg-45',
  });
  const noDigest = adoptDacV003RegistryReference('selected-domain-data', {
    baseline: { ...DAC_V003_BASELINE },
    authorityScope: 'dac://app-composition/acme',
    primaryIdentity: 'selected/fixture-domain@rev-000045',
    semanticIdentity: 'fixture-domain',
    revisionIdentity: 'rev-000045',
    lifecycleAuthorityRefs: [promotion, selection],
  });
  await expectManifestError(
    {
      ...fixture.input,
      selectedDomainData: [
        { selected: noDigest, promotionEvidence: promotion, applicationSelection: selection },
      ],
    },
    'INVALID_MANIFEST_INPUT',
  );
});

test('V3-004/#328: wrong-role/forged references in a selected entry fail closed', async () => {
  const fixture = await buildManifestInput();
  const notSelected = adoptDacV003RegistryReference('domain-data-revision', {
    baseline: { ...DAC_V003_BASELINE },
    authorityScope: 'dac://app-composition/acme',
    primaryIdentity: 'rev/fixture-domain@rev-000042',
  });
  await expectManifestError(
    {
      ...fixture.input,
      selectedDomainData: [{ ...fixture.entry, selected: notSelected as never }],
    },
    'INVALID_MANIFEST_INPUT',
  );
});

test('V3-004/#328: missing or malformed primary runtime closure fails closed', async () => {
  const fixture = await buildManifestInput();
  await expectManifestError(
    { ...fixture.input, primaryRuntime: undefined },
    'PRIMARY_RUNTIME_CARDINALITY',
  );
  const floatingContract = adoptDacV003RegistryReference('runtime-contract', {
    baseline: { ...DAC_V003_BASELINE },
    authorityScope: 'domain-harness://runtime',
    primaryIdentity: 'runtime-contract/current',
    semanticIdentity: 'domain-harness/runtime-contract',
  });
  await expectManifestError(
    {
      ...fixture.input,
      primaryRuntime: {
        ...fixture.input.primaryRuntime,
        runtimeContract: floatingContract as never,
      },
    },
    'INVALID_MANIFEST_INPUT',
  );
  await expectManifestError(
    {
      ...fixture.input,
      primaryRuntime: {
        ...fixture.input.primaryRuntime,
        compatibilityTarget: { role: 'compatibility-target' } as never,
      },
    },
    'PRIMARY_RUNTIME_CARDINALITY',
  );
});

test('V3-004/#328: missing UX closure or UX role-identity collapse fails closed', async () => {
  const fixture = await buildManifestInput();
  await expectManifestError({ ...fixture.input, ux: undefined }, 'UX_CLOSURE_CARDINALITY');
  await expectManifestError(
    {
      ...fixture.input,
      ux: {
        domainUxDefinition: fixture.refs.uxDefinition,
        runtimeInteractionContract: fixture.refs.uxDefinition as never,
      },
    },
    'UX_CLOSURE_CARDINALITY',
  );
});

test('V3-004/#328: satisfaction evidence linking an undeclared requirement fails closed', async () => {
  const fixture = await buildManifestInput();
  const foreignRequirement = adoptDacV003RegistryReference('capability-requirement', {
    baseline: { ...DAC_V003_BASELINE },
    authorityScope: 'dac://app-composition/other',
    primaryIdentity: 'cap-req/foreign-1',
    semanticIdentity: 'capability/foreign',
  });
  const provider = fixture.refs.hostBinding;
  const foreignEvidence = adoptDacV003RequirementSatisfactionEvidence({
    baseline: { ...DAC_V003_BASELINE },
    authorityScope: 'domain-harness://runtime/compatibility',
    primaryIdentity: 'evidence/foreign-cap-1',
    satisfies: foreignRequirement,
    provider,
    validForTargetProfile: 'domain-harness@v0.0.3-profile/node-1',
    provenance: [provider],
  });
  await expectManifestError(
    {
      ...fixture.input,
      satisfactionEvidence: [...(fixture.input.satisfactionEvidence ?? []), foreignEvidence],
    },
    'REQUIREMENT_EVIDENCE_FOREIGN',
  );
});

test('V3-004/#328 review repair P2-1 regression: malformed requirement/evidence inputs fail closed as INVALID_MANIFEST_INPUT, never native errors or string splitting', async () => {
  const fixture = await buildManifestInput();
  // A string is not an array of descriptors: rejected by shape BEFORE any
  // spread/iteration could split it into characters.
  await expectManifestError(
    { ...fixture.input, capabilityRequirements: 'cap-req-1' as never },
    'INVALID_MANIFEST_INPUT',
  );
  // A non-iterable primitive: rejected by shape instead of a native
  // TypeError from the spread.
  await expectManifestError(
    { ...fixture.input, portRequirements: 7 as never },
    'INVALID_MANIFEST_INPUT',
  );
  // A record where an array is required.
  await expectManifestError(
    { ...fixture.input, satisfactionEvidence: { evidence: 'cap-1' } as never },
    'INVALID_MANIFEST_INPUT',
  );
  await expectManifestError(
    { ...fixture.input, hostBindingRequirements: 'hb-req-1' as never },
    'INVALID_MANIFEST_INPUT',
  );
  // Absent (undefined) and explicit null both stay "no declarations" — the
  // pre-repair `?? []` semantics for genuinely absent input are unchanged.
  // (This case adopts successfully, so it needs a real declared digest; the
  // cast exists only because exactOptionalPropertyTypes rejects an explicit
  // `undefined` in the literal while the runtime must handle it.)
  const absentInput = {
    ...fixture.input,
    manifestIdentity: 'manifest://acme/tally-ledger/7-no-requirements',
    capabilityRequirements: undefined,
    portRequirements: null,
    hostBindingRequirements: undefined,
    satisfactionEvidence: null,
  } as unknown as Parameters<typeof withDeclaredDigest>[0];
  const manifest = await adopt(await withDeclaredDigest(absentInput));
  assert.ok(manifest);
});

test('V3-004/#328: undecided external-authority applicability fails closed', async () => {
  const fixture = await buildManifestInput();
  await expectManifestError(
    { ...fixture.input, externalAuthority: undefined },
    'EXTERNAL_AUTHORITY_APPLICABILITY_UNDECIDED',
  );
  await expectManifestError(
    { ...fixture.input, externalAuthority: { applicability: 'MAYBE' } },
    'EXTERNAL_AUTHORITY_APPLICABILITY_UNDECIDED',
  );
  await expectManifestError(
    {
      ...fixture.input,
      externalAuthority: { applicability: 'NOT_APPLICABLE', applicabilityEvidence: '  ' },
    },
    'EXTERNAL_AUTHORITY_APPLICABILITY_UNDECIDED',
  );
  await expectManifestError(
    { ...fixture.input, externalAuthority: { applicability: 'APPLICABLE', declarations: [] } },
    'EXTERNAL_AUTHORITY_APPLICABILITY_UNDECIDED',
  );
});

test('V3-004/#328: non-#327 external authority identity substitution fails closed', async () => {
  const fixture = await buildManifestInput();
  await expectManifestError(
    {
      ...fixture.input,
      externalAuthority: {
        applicability: 'APPLICABLE',
        declarations: [
          {
            authority: {
              adapter: 'dac-v003-external-operation/1',
              reference: { role: 'external-authority' },
            },
          },
        ],
      },
    },
    'EXTERNAL_IDENTITY_SUBSTITUTION',
  );
});

test('V3-004/#328: unsupported baseline and contract version fail closed', async () => {
  const fixture = await buildManifestInput();
  await expectManifestError(
    { ...fixture.input, baseline: { ...DAC_V003_BASELINE, semanticFreezeCommit: '0000' } },
    'UNSUPPORTED_MANIFEST_BASELINE',
  );
  await expectManifestError(
    { ...fixture.input, contractVersion: 'dac-application-manifest/v0.0.2' },
    'UNSUPPORTED_MANIFEST_CONTRACT_VERSION',
  );
});

test('V3-004/#328: mutable alias identities fail closed', async () => {
  const fixture = await buildManifestInput();
  await expectManifestError(
    { ...fixture.input, manifestIdentity: 'latest' },
    'MUTABLE_ALIAS_REJECTED',
  );
  await expectManifestError(
    { ...fixture.input, applicationRevisionIdentity: 'current' },
    'MUTABLE_ALIAS_REJECTED',
  );
});
