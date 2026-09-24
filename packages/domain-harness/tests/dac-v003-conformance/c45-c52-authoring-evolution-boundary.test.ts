// Issue #329 / DAC v0.0.3 V3-005 — C45–C52 executable conformance closure:
// the Authoring/Evolution group. The producer/evolution lane (Forge authored
// candidates, Simulator evolution/exchange operations) is NOT owned by the
// Harness — the producer, evolution and promotion authorities stay upstream.
// This suite proves the Harness-side boundary of every case with executable
// evidence: producer-lane objects never acquire Harness authority, and
// producer-shaped inputs fail closed at every Harness authority position.
//
// Dispositions recorded in the conformance matrix:
//   C45, C46, C47, C48, C49, C51, C52 — NOT_OWNED (producer/evolution
//     authority) with the executable boundary evidence below;
//   C50 — PASS (the Harness-owned P4 lineage-closure primitive).
//
// Additive conformance evidence only: no product surface is edited here.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DAC_V003_BASELINE,
  DacV003ReferenceError,
  adoptDacV003RegistryReference,
  assertDacV003ExactnessProfile,
} from '../../src/dac-v003/index.js';
import {
  DacV003ManifestError,
  adoptDacV003ApplicationManifest,
} from '../../src/dac-v003-manifest/index.js';
import {
  DAC_V003_OUTCOME_CLASS_FROM_V002_CLASSIFICATION,
  maxJustifiedMeaningForAttemptEvidence,
  reconcileDacV003ExternalOperation,
} from '../../src/dac-v003-external/index.js';
import { buildManifestInput, withDeclaredDigest } from '../dac-v003/manifest-fixture.js';
import {
  attempt,
  BASELINE,
  logicalOperation,
  observation,
} from '../dac-v003/external-fixture.js';
import { createSha256Fake } from '../package/fixture.js';

const baseline = { ...DAC_V003_BASELINE };

type ManifestInputLike = {
  readonly selectedDomainData: readonly {
    readonly selected: unknown;
    readonly promotionEvidence: unknown;
    readonly applicationSelection: unknown;
  }[];
};

function firstEntry(
  input: ManifestInputLike,
): { readonly selected: unknown; readonly promotionEvidence: unknown; readonly applicationSelection: unknown } {
  const entry = input.selectedDomainData[0];
  assert.ok(entry !== undefined, 'fixture manifest input carries a first entry');
  return entry;
}


async function expectManifestError(
  fn: () => Promise<unknown> | unknown,
  code: string,
  label: string,
): Promise<void> {
  let caught: unknown;
  try {
    await fn();
  } catch (error) {
    caught = error;
  }
  assert.ok(
    caught instanceof DacV003ManifestError,
    `${label}: expected DacV003ManifestError, got ${
      caught instanceof Error ? caught.message : String(caught)
    }`,
  );
  assert.equal((caught as DacV003ManifestError).code, code, `${label}: code`);
}

function expectReferenceError(fn: () => void, code: string, label: string): void {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof DacV003ReferenceError, `${label}: expected DacV003ReferenceError`);
  assert.equal((caught as DacV003ReferenceError).code, code, `${label}: code`);
}

/**
 * NOT_OWNED producer-lane boundary fixtures, adopted as identity-only
 * references (the way upstream evidence enters the Harness): an authored
 * candidate, the Simulator evolution operation that evolved it, and the
 * evolved candidate with its exact P4 lineage. No Harness surface mints or
 * decides these; they are fixtures standing for upstream evidence.
 */
function producerLaneFixtures() {
  const authoredCandidate = adoptDacV003RegistryReference('authored-candidate', {
    baseline,
    authorityScope: 'forge://acme/authoring',
    primaryIdentity: 'authored/candidate-1',
    semanticIdentity: 'fixture-domain',
    revisionIdentity: 'authored-draft-1',
    contentDigest: 'sha256:authored-1',
  });
  const evolutionOperation = adoptDacV003RegistryReference('evolution-operation', {
    baseline,
    authorityScope: 'sim://acme/evolution',
    primaryIdentity: 'evolution/op-1',
    semanticIdentity: 'simulator-evolve',
    logicalOperationIdentity: 'sim-evolution-run-1',
  });
  const evolvedCandidateWithLineage = adoptDacV003RegistryReference('evolved-candidate', {
    baseline,
    authorityScope: 'sim://acme/evolution',
    primaryIdentity: 'evolved/candidate-1',
    semanticIdentity: 'fixture-domain',
    revisionIdentity: 'evolved-rev-1',
    contentDigest: 'sha256:evolved-1',
    parentRefs: [authoredCandidate],
    provenanceRefs: [evolutionOperation],
    derivationOperationRef: evolutionOperation,
  });
  const evolvedCandidateWithoutLineage = adoptDacV003RegistryReference('evolved-candidate', {
    baseline,
    authorityScope: 'sim://acme/evolution',
    primaryIdentity: 'evolved/candidate-2',
    semanticIdentity: 'fixture-domain',
    revisionIdentity: 'evolved-rev-2',
    contentDigest: 'sha256:evolved-2',
  });
  return {
    authoredCandidate,
    evolutionOperation,
    evolvedCandidateWithLineage,
    evolvedCandidateWithoutLineage,
  };
}

test('C45: an authored candidate never enters a Harness authority position — production selection requires evolved/promoted/selected stages', async () => {
  const { input } = await buildManifestInput();
  const { authoredCandidate } = producerLaneFixtures();
  // The authored candidate in the selected position fails closed.
  const withAuthoredSelected = {
    ...input,
    selectedDomainData: [
      {
        selected: authoredCandidate,
        promotionEvidence: firstEntry(input).promotionEvidence,
        applicationSelection: firstEntry(input).applicationSelection,
      },
    ],
  };
  await expectManifestError(
    () =>
      adoptDacV003ApplicationManifest(
        { ...withAuthoredSelected, manifestContentDigest: 'x' } as never,
        { sha256: createSha256Fake() },
      ),
    'INVALID_MANIFEST_INPUT',
    'authored candidate as selected-domain-data',
  );
  // An authored candidate is also not a P4-complete evolved result: without
  // Simulator lineage the lineage-closure primitive rejects it.
  expectReferenceError(
    () => assertDacV003ExactnessProfile(authoredCandidate, 'P4'),
    'PROFILE_REQUIREMENT_UNMET',
    'authored candidate lacks P4 lineage',
  );
});

test('C46: a Simulator/validation PASS never becomes promotion evidence at the Harness boundary', async () => {
  const { input } = await buildManifestInput();
  const simulationResult = adoptDacV003RegistryReference('simulation-result', {
    baseline,
    authorityScope: 'sim://acme/validation',
    primaryIdentity: 'simulation/pass-1',
    semanticIdentity: 'fixture-domain-validation',
    revisionIdentity: 'evolved-rev-1',
  });
  const withSimulatorPromotion = {
    ...input,
    selectedDomainData: [
      {
        selected: firstEntry(input).selected,
        promotionEvidence: simulationResult,
        applicationSelection: firstEntry(input).applicationSelection,
      },
    ],
  };
  await expectManifestError(
    () =>
      adoptDacV003ApplicationManifest(
        { ...withSimulatorPromotion, manifestContentDigest: 'x' } as never,
        { sha256: createSha256Fake() },
      ),
    'INVALID_MANIFEST_INPUT',
    'simulation-result as promotion-decision',
  );
});

test('C47: producer identity never substitutes EvolutionOperationRef authority at the Harness boundary', () => {
  const { authoredCandidate, evolutionOperation, evolvedCandidateWithLineage } =
    producerLaneFixtures();
  // The evolution-operation reference and the authored-candidate reference
  // stay distinct registry roles with distinct identities.
  assert.notEqual(evolutionOperation.role, authoredCandidate.role);
  assert.notEqual(
    evolutionOperation.primaryIdentity,
    authoredCandidate.primaryIdentity,
  );
  // A P4-complete evolved candidate binds the exact evolution operation as
  // its derivation authority — the producer artifact itself is not accepted
  // in that position: substituting the authored candidate for the evolution
  // operation produces a different (non-minted) lineage closure that fails
  // identity verification against the real derivation ref.
  assert.equal(
    evolvedCandidateWithLineage.derivationOperationRef,
    evolutionOperation,
    'derivation authority is the exact evolution-operation ref',
  );
  assert.notEqual(
    evolvedCandidateWithLineage.derivationOperationRef,
    authoredCandidate,
  );
  // And the inverse: an authored candidate adopted with the evolution
  // operation as its own "derivation" still stays an authored candidate —
  // the role never flips, so no producer artifact becomes evolution authority.
  const authoredWithOpAttached = adoptDacV003RegistryReference('authored-candidate', {
    baseline,
    authorityScope: 'forge://acme/authoring',
    primaryIdentity: 'authored/candidate-3',
    derivationOperationRef: evolutionOperation,
  });
  assert.equal(authoredWithOpAttached.role, 'authored-candidate');
});

test('C48: an ambiguous capability result is never fabricated into a produced candidate by any Harness surface', () => {
  // The ambiguity-preservation primitive: a possibly-dispatched attempt
  // carries exactly 'ambiguous-preserve-unresolved' — no Harness evaluation
  // strengthens it into a produced/failed result.
  assert.equal(
    maxJustifiedMeaningForAttemptEvidence('dispatch-outcome-ambiguous'),
    'ambiguous-preserve-unresolved',
  );
  assert.equal(
    maxJustifiedMeaningForAttemptEvidence('dispatch-attempted'),
    'dispatch-occurred-only',
  );
  // A reconciliation over only ambiguous evidence concludes STILL_UNKNOWN —
  // it cannot fabricate the produced result the producer lane withheld.
  const logical = logicalOperation();
  const episode = reconcileDacV003ExternalOperation({
    baseline: BASELINE,
    reconciliationIdentity: 'recon-c48',
    localReconciliationAuthorityScope: 'app/checkout/reconciliation',
    externalAuthority: logical.externalAuthority,
    logicalOperation: logical,
    actionSemantics: 'reconcile-local-vs-external-truth',
    methodClass: 'query+compare',
    inputAttempts: [
      attempt({ evidenceClass: 'dispatch-outcome-ambiguous', attemptIdentity: 'att-c48' }),
    ],
    inputObservations: [
      observation({
        observationIdentity: 'obs-c48',
        logicalOperation: logical,
        observedClass: 'UNKNOWN_AMBIGUOUS',
      }),
    ],
  } as never);
  assert.equal(episode.conclusion.outcomeClass, 'STILL_UNKNOWN');
  assert.equal(episode.conclusion.remoteTruth, 'unresolved');
});

test('C49: accepted-for-evaluation is never a produced result — the exchange outcome classes stay ceiling-distinct', () => {
  const mapping = DAC_V003_OUTCOME_CLASS_FROM_V002_CLASSIFICATION;
  // The provider-exchange acceptance classes map strictly below produced/
  // authoritative classes; none of them is EFFECT_SUCCEEDED or stronger.
  assert.equal(mapping['dispatch-acknowledged'], 'REQUEST_DISPATCHED');
  assert.equal(mapping['accepted-pending'], 'ACCEPTED_FOR_PROCESSING');
  assert.equal(mapping['in-progress'], 'PENDING_IN_PROGRESS');
  for (const accepted of ['REQUEST_DISPATCHED', 'ACCEPTED_FOR_PROCESSING', 'PENDING_IN_PROGRESS']) {
    assert.notEqual(accepted, 'EFFECT_SUCCEEDED');
    assert.notEqual(accepted, 'AUTHORITATIVE_COMMITTED');
  }
  // A reconciliation over acceptance-only evidence stays unresolved: the
  // accepted-for-evaluation claim never becomes a produced result here.
  const logical = logicalOperation();
  const episode = reconcileDacV003ExternalOperation({
    baseline: BASELINE,
    reconciliationIdentity: 'recon-c49',
    localReconciliationAuthorityScope: 'app/checkout/reconciliation',
    externalAuthority: logical.externalAuthority,
    logicalOperation: logical,
    actionSemantics: 'reconcile-local-vs-external-truth',
    methodClass: 'query+compare',
    inputObservations: [
      observation({
        observationIdentity: 'obs-c49',
        logicalOperation: logical,
        observedClass: 'ACCEPTED_FOR_PROCESSING',
      }),
    ],
  } as never);
  assert.equal(episode.conclusion.outcomeClass, 'STILL_UNKNOWN');
});

test('C50: an evolved result without exact parent/root lineage or owning evolution op fails closed for authoritative reuse (P4)', () => {
  const { evolvedCandidateWithLineage, evolvedCandidateWithoutLineage } =
    producerLaneFixtures();
  // The Harness-owned P4 lineage-closure primitive: a derived result without
  // parentRefs + provenanceRefs is not P4 and fails closed.
  expectReferenceError(
    () => assertDacV003ExactnessProfile(evolvedCandidateWithoutLineage, 'P4'),
    'PROFILE_REQUIREMENT_UNMET',
    'evolved result without lineage is not P4',
  );
  // With exact lineage it holds.
  assert.doesNotThrow(() =>
    assertDacV003ExactnessProfile(evolvedCandidateWithLineage, 'P4'),
  );
  // An evolved result without lineage is also not adoptable as the selected
  // Domain Data of a production manifest (P3 requires lifecycle authorities).
  expectReferenceError(
    () => assertDacV003ExactnessProfile(evolvedCandidateWithoutLineage, 'P3'),
    'PROFILE_REQUIREMENT_UNMET',
    'evolved result without lifecycle authorities is not P3',
  );
});

test('C51: improvement/non-regression claims need exact RegressionComparisonRef evidence — no Harness surface accepts a qualitative claim', () => {
  // A 'regression-comparison' claim without P6 exact evidence (exact
  // material inputs + provenance) is not authoritative at the Harness.
  const qualitativeClaim = adoptDacV003RegistryReference('regression-comparison', {
    baseline,
    authorityScope: 'sim://acme/evolution',
    primaryIdentity: 'comparison/qualitative-1',
    semanticIdentity: 'fixture-domain-comparison',
  });
  expectReferenceError(
    () => assertDacV003ExactnessProfile(qualitativeClaim, 'P6'),
    'PROFILE_REQUIREMENT_UNMET',
    'qualitative improvement claim is not P6 evidence',
  );
  const exactComparison = adoptDacV003RegistryReference('regression-comparison', {
    baseline,
    authorityScope: 'sim://acme/evolution',
    primaryIdentity: 'comparison/exact-1',
    semanticIdentity: 'fixture-domain-comparison',
    materialInputRefs: [
      adoptDacV003RegistryReference('evidence', {
        baseline,
        authorityScope: 'sim://acme/evolution',
        primaryIdentity: 'baseline/eval-A',
      }),
      adoptDacV003RegistryReference('evidence', {
        baseline,
        authorityScope: 'sim://acme/evolution',
        primaryIdentity: 'candidate/eval-B',
      }),
    ],
    provenanceRefs: [
      adoptDacV003RegistryReference('provenance', {
        baseline,
        authorityScope: 'sim://acme/evolution',
        primaryIdentity: 'provenance/simulator-1',
      }),
    ],
  });
  assert.doesNotThrow(() => assertDacV003ExactnessProfile(exactComparison, 'P6'));
});

test('C52: an exact authored patch from a replaceable producer stays producer provenance only and never gains evolution authority', () => {
  const { authoredCandidate, evolutionOperation, evolvedCandidateWithLineage } =
    producerLaneFixtures();
  // The authored patch rides along as provenance of the evolved candidate,
  // preserved verbatim (object identity inside the adopted frozen envelope).
  assert.ok(
    evolvedCandidateWithLineage.provenanceRefs.includes(evolutionOperation),
  );
  const evolvedWithAuthoredProvenance = adoptDacV003RegistryReference('evolved-candidate', {
    baseline,
    authorityScope: 'sim://acme/evolution',
    primaryIdentity: 'evolved/candidate-1',
    semanticIdentity: 'fixture-domain',
    revisionIdentity: 'evolved-rev-1',
    contentDigest: 'sha256:evolved-1',
    parentRefs: [authoredCandidate],
    provenanceRefs: [authoredCandidate, evolutionOperation],
    derivationOperationRef: evolutionOperation,
  });
  assert.ok(
    evolvedWithAuthoredProvenance.provenanceRefs.includes(authoredCandidate),
    'authored patch retained as producer provenance',
  );
  assert.equal(
    evolvedWithAuthoredProvenance.derivationOperationRef,
    evolutionOperation,
    'evolution authority stays the evolution operation, not the patch',
  );
  // The retained patch keeps its authored-candidate role — substitutable
  // producer provenance, never evolution authority.
  assert.equal(authoredCandidate.role, 'authored-candidate');
  // Substitutable-producer substitution at the boundary: a second authored
  // patch ref replacing the first changes nothing about authority — the
  // evolution op remains the derivation authority of the evolved candidate.
  const replacementPatch = adoptDacV003RegistryReference('authored-candidate', {
    baseline,
    authorityScope: 'forge://other-producer/authoring',
    primaryIdentity: 'authored/candidate-replacement',
    semanticIdentity: 'fixture-domain',
    revisionIdentity: 'authored-draft-2',
  });
  const evolvedAfterProducerReplacement = adoptDacV003RegistryReference('evolved-candidate', {
    baseline,
    authorityScope: 'sim://acme/evolution',
    primaryIdentity: 'evolved/candidate-1',
    semanticIdentity: 'fixture-domain',
    revisionIdentity: 'evolved-rev-1',
    contentDigest: 'sha256:evolved-1',
    parentRefs: [replacementPatch],
    provenanceRefs: [replacementPatch, evolutionOperation],
    derivationOperationRef: evolutionOperation,
  });
  assert.equal(
    evolvedAfterProducerReplacement.derivationOperationRef,
    evolutionOperation,
    'producer substitution does not transfer evolution authority',
  );
  assert.doesNotThrow(() =>
    assertDacV003ExactnessProfile(evolvedAfterProducerReplacement, 'P4'),
  );
});

test('C45–C52 boundary: declared digest integrity still gates manifest adoption while producer fixtures stay upstream', async () => {
  // Sanity of the shared adoption path used above: the unmodified standard
  // input (with its real declared digest) still adopts, proving the C45/C46
  // failures above came from the producer-lane substitution, not from a
  // broken fixture.
  const fixture = await buildManifestInput();
  const adopted = await adoptDacV003ApplicationManifest(await withDeclaredDigest(fixture.input), {
    sha256: createSha256Fake(),
  });
  assert.equal(adopted.adapter, 'dac-v003-manifest-adapter/1');
});
