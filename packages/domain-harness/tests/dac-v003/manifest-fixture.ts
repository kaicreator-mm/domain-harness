// Issue #328 / DAC v0.0.3 V3-004 shared test fixture: builds a genuine #306
// stage-3 exact-selection verdict whose identity tuples the manifest's
// selected Domain Data entries carry, the standard v0.0.3 compatibility
// declarations (reusing the V3-002 fixture objects so the manifest carries
// the exact objects the single compatibility authority evaluates), and a
// complete adoption input. Every focused test validates the real
// consumption path instead of mocking it.
import {
  DAC_REFERENCE_BASELINE,
  adoptApplicationSelectionRef,
  adoptCompatibilityTargetRef,
  adoptPromotionDecisionRef,
  adoptRuntimeContractRef,
  adoptRuntimeImplementationRef,
  adoptSelectedDomainDataRef,
} from '../../src/dac/index.js';
import {
  validateSelectedComposition,
  type SelectedCompositionRequest,
  type SelectedCompositionValidation,
} from '../../src/composition-intake/index.js';
import {
  DAC_V003_BASELINE,
  adoptDacV003RegistryReference,
} from '../../src/dac-v003/index.js';
import type { DacV003Reference } from '../../src/dac-v003/index.js';
import { buildCompatibleRequest, buildV003Refs, intakeEnvironment } from './compatibility-fixture.js';
import type { V003Refs } from './compatibility-fixture.js';
import { validateDacV003Compatibility } from '../../src/dac-v003-compatibility/index.js';
import type { DacV003CompatibilityValidation } from '../../src/dac-v003-compatibility/index.js';
import { adoptDacV003ExternalAuthorityRef } from '../../src/dac-v003-external/index.js';
import {
  adoptDacV003ApplicationManifest,
  computeDacV003ApplicationManifestDigest,
} from '../../src/dac-v003-manifest/index.js';
import type {
  DacV003ApplicationManifest,
  DacV003ApplicationManifestAdoptionInput,
  DacV003ManifestSelectedDomainDataEntryInput,
} from '../../src/dac-v003-manifest/index.js';
import { createCompiledPackage, createSha256Fake } from '../package/fixture.js';

/** A genuine #306 stage-3 verdict for a specific compiled package revision. */
export async function buildIntakeVerdictFor(
  revision: string,
): Promise<SelectedCompositionValidation> {
  const compiled = await createCompiledPackage(revision);
  const domainId = compiled.manifest.domainId;
  const digest = compiled.manifest.packageId;
  const baseline = { ...DAC_REFERENCE_BASELINE };
  const request: SelectedCompositionRequest = {
    promotionDecision: adoptPromotionDecisionRef({
      baseline,
      semanticIdentity: domainId,
      authorityScope: 'dac://governance/promotion',
      revisionIdentity: revision,
      contentDigest: digest,
    }),
    applicationSelection: adoptApplicationSelectionRef({
      baseline,
      semanticIdentity: domainId,
      authorityScope: 'dac://app-composition/acme',
      revisionIdentity: revision,
      contentDigest: digest,
    }),
    selectedDomainData: adoptSelectedDomainDataRef({
      baseline,
      semanticIdentity: domainId,
      authorityScope: 'dac://app-composition/acme',
      revisionIdentity: revision,
      contentDigest: digest,
    }),
    runtimeContract: adoptRuntimeContractRef({
      baseline,
      semanticIdentity: 'domain-harness/runtime-contract',
      authorityScope: 'domain-harness://runtime',
      revisionIdentity: '2',
    }),
    runtimeImplementation: adoptRuntimeImplementationRef({
      baseline,
      semanticIdentity: 'domain-harness-runtime',
      authorityScope: 'domain-harness://runtime',
      revisionIdentity: '0.3.0',
      contentDigest: 'build-9f2c1',
    }),
    compatibilityTarget: adoptCompatibilityTargetRef({
      baseline,
      semanticIdentity: 'domain-harness/compatibility-target/node-test',
      authorityScope: 'domain-harness://runtime/compatibility',
      revisionIdentity: 'node-test',
    }),
    compiledPackage: compiled,
    environment: intakeEnvironment(),
  };
  return validateSelectedComposition(request);
}

/** The exact v0.0.3 selected-entry provenance pair for one revision. */
export interface V003EntryRefs {
  readonly selected: DacV003Reference & { readonly role: 'selected-domain-data' };
  readonly promotionEvidence: DacV003Reference & { readonly role: 'promotion-decision' };
  readonly applicationSelection: DacV003Reference & { readonly role: 'application-selection' };
}

export function buildV003Entry(
  revision: string,
  digest: string,
  domainId = 'fixture-domain',
): V003EntryRefs {
  const baseline = { ...DAC_V003_BASELINE };
  const promotionEvidence = adoptDacV003RegistryReference('promotion-decision', {
    baseline,
    authorityScope: 'dac://governance/promotion',
    primaryIdentity: `promotion/${domainId}@${revision}`,
    semanticIdentity: domainId,
    revisionIdentity: revision,
    contentDigest: digest,
  });
  const applicationSelection = adoptDacV003RegistryReference('application-selection', {
    baseline,
    authorityScope: 'dac://app-composition/acme',
    primaryIdentity: `selection/${domainId}@${revision}`,
    semanticIdentity: domainId,
    revisionIdentity: revision,
    contentDigest: digest,
  });
  const selected = adoptDacV003RegistryReference('selected-domain-data', {
    baseline,
    authorityScope: 'dac://app-composition/acme',
    primaryIdentity: `selected/${domainId}@${revision}`,
    semanticIdentity: domainId,
    revisionIdentity: revision,
    contentDigest: digest,
    lifecycleAuthorityRefs: [promotionEvidence, applicationSelection],
  });
  return {
    selected: selected as V003EntryRefs['selected'],
    promotionEvidence: promotionEvidence as V003EntryRefs['promotionEvidence'],
    applicationSelection: applicationSelection as V003EntryRefs['applicationSelection'],
  };
}

/** The identity tuple of a #306 verdict, as carried by a manifest entry. */
export function entryTuplesFor(verdict: SelectedCompositionValidation): {
  readonly domainId: string;
  readonly revision: string;
  readonly digest: string;
} {
  return {
    domainId: verdict.selectedDomainData.semanticIdentity,
    revision: verdict.selectedDomainData.revisionIdentity,
    digest: verdict.selectedDomainData.contentDigest,
  };
}

/** A genuine #327 external-authority identity declaration. */
export function buildExternalAuthority(authorityId = 'sor://billing/acme-1') {
  return adoptDacV003ExternalAuthorityRef({
    baseline: { ...DAC_V003_BASELINE },
    authorityId,
    authorityScope: 'ext://billing/acme',
    contractProfileIdentity: 'billing-authority/v1',
  });
}

export interface V003ManifestFixture {
  readonly verdict: SelectedCompositionValidation;
  readonly refs: V003Refs;
  readonly entry: V003EntryRefs;
  readonly extraEntry: V003EntryRefs;
  readonly input: DacV003ApplicationManifestAdoptionInput;
}

/**
 * The standard adoption input: one verdict-covered entry plus one additional
 * independently-selected entry (proving 1..n), the exact V3-002 declaration
 * objects, and the APPLICABLE external-authority path.
 */
export async function buildManifestInput(): Promise<V003ManifestFixture> {
  const verdict = await buildIntakeVerdictFor('rev-000042');
  const { domainId, revision, digest } = entryTuplesFor(verdict);
  const entry = buildV003Entry(revision, digest, domainId);
  const extraEntry = buildV003Entry('rev-000043', `pkg-${'rev-000043'}`);
  const refs = buildV003Refs();
  const input: DacV003ApplicationManifestAdoptionInput = {
    baseline: { ...DAC_V003_BASELINE },
    contractVersion: 'dac-application-manifest/v0.0.3',
    applicationSemanticIdentity: 'app://acme/tally-ledger',
    applicationRevisionIdentity: 'app-rev-7',
    manifestIdentity: 'manifest://acme/tally-ledger/7',
    manifestContentDigest: 'pending',
    selectedDomainData: [
      entry as DacV003ManifestSelectedDomainDataEntryInput,
      extraEntry as DacV003ManifestSelectedDomainDataEntryInput,
    ],
    primaryRuntime: {
      runtimeContract: adoptDacV003RegistryReference('runtime-contract', {
        baseline: { ...DAC_V003_BASELINE },
        authorityScope: 'domain-harness://runtime',
        primaryIdentity: 'runtime-contract/domain-harness@2',
        semanticIdentity: 'domain-harness/runtime-contract',
        revisionIdentity: '2',
      }) as unknown as DacV003Reference & { readonly role: 'runtime-contract' },
      compatibilityTarget: refs.target,
    },
    ux: {
      domainUxDefinition: refs.uxDefinition,
      runtimeInteractionContract: refs.interactionContract,
    },
    capabilityRequirements: [refs.capabilityRequirement],
    portRequirements: [refs.portRequirement],
    hostBindingRequirements: [refs.hostBindingRequirement],
    satisfactionEvidence: [refs.capabilityEvidence, refs.portEvidence, refs.hostBindingEvidence],
    externalAuthority: {
      applicability: 'APPLICABLE',
      declarations: [
        {
          authority: buildExternalAuthority(),
          capabilityRequirements: { reconciliation: true },
        },
      ],
    },
    compositionProvenance: { composedBy: 'dac://app-composition/acme' },
    opaque: { note: 'v0.0.3 manifest fixture' },
  };
  return { verdict, refs, entry, extraEntry, input };
}

/** Computes the declared digest and fills it into a copy of the input. */
export async function withDeclaredDigest(
  input: DacV003ApplicationManifestAdoptionInput,
): Promise<DacV003ApplicationManifestAdoptionInput> {
  const digest = await computeDacV003ApplicationManifestDigest(input, { sha256: createSha256Fake() });
  return { ...input, manifestContentDigest: digest };
}

/** Adopts the standard fixture manifest. */
export async function buildAdoptedManifest(): Promise<DacV003ApplicationManifest> {
  const fixture = await buildManifestInput();
  return adoptDacV003ApplicationManifest(await withDeclaredDigest(fixture.input), {
    sha256: createSha256Fake(),
  });
}

/**
 * Adopts the standard fixture restricted to the single verdict-covered
 * entry. The standard validation is minted over the rev-000042 #306 verdict,
 * so under the exact multi-entry association semantics (every selected entry
 * must be covered) only this single-entry form associates; the two-entry
 * `buildAdoptedManifest` form is the multi-entry partial-coverage negative.
 */
export async function buildAdoptedSingleEntryManifest(): Promise<DacV003ApplicationManifest> {
  const fixture = await buildManifestInput();
  const input: DacV003ApplicationManifestAdoptionInput = {
    ...fixture.input,
    manifestIdentity: 'manifest://acme/tally-ledger/7-single-entry',
    selectedDomainData: [fixture.entry as DacV003ManifestSelectedDomainDataEntryInput],
  };
  return adoptDacV003ApplicationManifest(await withDeclaredDigest(input), {
    sha256: createSha256Fake(),
  });
}

/** A genuine V3-002 COMPATIBLE validation over the standard fixture refs. */
export async function buildValidationFor(
  overrides: Parameters<typeof buildCompatibleRequest>[0] = {},
): Promise<DacV003CompatibilityValidation> {
  const request = await buildCompatibleRequest(overrides);
  return validateDacV003Compatibility(request);
}
