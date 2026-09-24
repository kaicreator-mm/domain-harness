// Issue #329 / DAC v0.0.3 V3-005 — the executable C39–C77 applicability
// matrix. One row per DAC v0.0.3 conformance case (spec source:
// domain-application-contract@3322b2152253b3c60f254c23a4f9ab1a14e063d1 /
// tree 163d2a4d9eb5b1659f35df1a0bb73bcaef96cd06, spec/v0.0.3/
// CONFORMANCE_MATRIX.md §1.2 additive cross-lane coverage from #44 §7).
//
// Every row carries its classification (exactly one of PASS /
// NOT_APPLICABLE / NOT_OWNED), a durable reason, and EXECUTABLE evidence
// references (file + exact test name) verified by matrix-closure.test.ts —
// no blank case, no implicit coverage, no "covered by general test".
//
// Ownership vocabulary (frozen by the #329 dispatch):
//   PASS           — the Harness owns the applicable obligation and the
//                    executable evidence proves the required result.
//   NOT_APPLICABLE — the obligation does not apply to any Harness surface.
//   NOT_OWNED      — the obligation belongs to an upstream/external lane
//                    (producer/evolution, promotion/selection authority,
//                    external Business SoR truth, Domain UX semantics);
//                    the row records the Harness-side boundary evidence
//                    (fail-closed at every Harness authority position) and
//                    never claims the non-owned authority.

export interface DacV003ConformanceEvidenceRef {
  readonly file: string;
  readonly test: string;
}

export interface DacV003ConformanceCase {
  readonly id: string;
  readonly group: string;
  readonly obligation: string;
  readonly source: string;
  readonly surface: string;
  readonly ownerBoundary: string;
  readonly expected: string;
  readonly evidence: readonly DacV003ConformanceEvidenceRef[];
  readonly adversarial: readonly DacV003ConformanceEvidenceRef[];
  readonly classification: 'PASS' | 'NOT_APPLICABLE' | 'NOT_OWNED';
  readonly reason: string;
  readonly identityLinkage?: string;
}

export const DAC_V003_CONFORMANCE_FREEZE = {
  contract: 'domain-application-contract',
  version: 'v0.0.3',
  semanticFreezeCommit: '3322b2152253b3c60f254c23a4f9ab1a14e063d1',
  semanticFreezeTree: '163d2a4d9eb5b1659f35df1a0bb73bcaef96cd06',
  matrixSource: 'spec/v0.0.3/CONFORMANCE_MATRIX.md §1.2 (#44 §7)',
} as const;

const SRC = 'DAC v0.0.3 CONFORMANCE_MATRIX.md §1.2 (#44 §7 cross-lane synthesis)';

export const DAC_V003_C39_C77_MATRIX: readonly DacV003ConformanceCase[] = [
  {
    id: 'C39',
    group: 'Shared Reference',
    obligation:
      'an authoritative reference uses latest/current/head (ambient alias) => FAIL_CLOSED',
    source: SRC,
    surface: 'src/dac-v003 (V3-001 foundation adoption + identity verification)',
    ownerBoundary: 'Harness-owned reference adoption',
    expected: 'FAIL_CLOSED (MUTABLE_ALIAS_REJECTED)',
    evidence: [
      {
        file: 'c39-c44-shared-reference.test.ts',
        test: 'C39: authoritative reference pinned to a latest/current/head alias fails closed at every identity slot',
      },
    ],
    adversarial: [
      {
        file: 'adversarial-shortcuts.test.ts',
        test: 'adversarial 1 (floating identity substitution): mutable aliases are rejected at the exact-identity manifest fields',
      },
    ],
    classification: 'PASS',
    reason:
      'Alias tokens are rejected at every authoritative identity slot (primary/semantic/revision) while locator hints stay non-authoritative discovery metadata; the manifest-level exact-identity fields reject aliases too.',
    identityLinkage: 'identity slots vs locatorHints separation enforced at adoption',
  },
  {
    id: 'C40',
    group: 'Shared Reference',
    obligation:
      'same immutable revision identity + different authoritative digest => FAIL_CLOSED',
    source: SRC,
    surface: 'src/dac-v003 (revision/digest consistency guard) + src/dac-v003-compatibility (closure re-check)',
    ownerBoundary: 'Harness-owned identity/integrity guard',
    expected: 'FAIL_CLOSED (REVISION_DIGEST_CONTRADICTION)',
    evidence: [
      {
        file: 'c39-c44-shared-reference.test.ts',
        test: 'C40: same immutable revision identity with a different authoritative digest fails closed with no identity-preserving reconciliation',
      },
    ],
    adversarial: [
      {
        file: 'adversarial-shortcuts.test.ts',
        test: 'adversarial 2 (same semantic identity, foreign revision/digest): a selected entry covered for its semantic name but a foreign revision is not adopted',
      },
    ],
    classification: 'PASS',
    reason:
      'The consistency guard fails closed per (scope, revision) pair symmetrically, and the compatibility authority re-checks it over the whole evaluated closure.',
    identityLinkage: 'revision/digest pair keyed by authority scope',
  },
  {
    id: 'C41',
    group: 'Shared Reference',
    obligation:
      'same digest under different authority/scope => no authority merge; explicit provenance/adoption required',
    source: SRC,
    surface: 'src/dac-v003 (authority-scoped adoption + identity verification)',
    ownerBoundary: 'Harness-owned authority-scope separation',
    expected: 'no merge; distinct adoptions per scope',
    evidence: [
      {
        file: 'c39-c44-shared-reference.test.ts',
        test: 'C41: the same digest under a different authority/scope never merges authority — explicit adoption is required per scope',
      },
    ],
    adversarial: [
      {
        file: 'adversarial-shortcuts.test.ts',
        test: 'adversarial 4 (scope substitution): a UX closure adopted under a foreign authority scope cannot associate with the exact manifest',
      },
    ],
    classification: 'PASS',
    reason:
      'Byte-identical content under a different scope is two distinct adoptions; scope is part of identity verification, and a foreign-scoped closure cannot associate with an exact manifest.',
    identityLinkage: 'authorityScope participates in identity verification',
  },
  {
    id: 'C42',
    group: 'Shared Reference',
    obligation: 'evidence for exact revision A reused for B => STALE / reject authoritative reuse',
    source: SRC,
    surface: 'src/dac-v003 (exact-identity verification, P6 evidence exactness)',
    ownerBoundary: 'Harness-owned evidence-exactness primitive',
    expected: 'identity mismatch; new evaluation required',
    evidence: [
      {
        file: 'c39-c44-shared-reference.test.ts',
        test: 'C42: evidence recorded for exact revision A is rejected for authoritative reuse against revision B',
      },
    ],
    adversarial: [
      {
        file: 'adversarial-shortcuts.test.ts',
        test: 'adversarial 2 (same semantic identity, foreign revision/digest): a selected entry covered for its semantic name but a foreign revision is not adopted',
      },
    ],
    classification: 'PASS',
    reason:
      'Verification requires every supplied expectation to match exactly; revision, digest and semantic-name-only reuse are all mismatches, and a missing field never passes.',
    identityLinkage: 'exact-expectation verification over adopted slots',
  },
  {
    id: 'C43',
    group: 'Shared Reference',
    obligation: 'required CompatibilityTargetRef absent => FAIL_CLOSED',
    source: SRC,
    surface: 'src/dac-v003 (target-state rule) + src/dac-v003-compatibility (validator)',
    ownerBoundary: 'Harness-owned compatibility precondition',
    expected: 'FAIL_CLOSED',
    evidence: [
      {
        file: 'c39-c44-shared-reference.test.ts',
        test: 'C43: missing required CompatibilityTargetRef fails closed and never infers an ambient runtime',
      },
    ],
    adversarial: [],
    classification: 'PASS',
    reason:
      'Both the frozen rule primitive and the real validator fail closed with a finding naming the missing explicit target; an ambient current runtime is never inferred.',
  },
  {
    id: 'C44',
    group: 'Shared Reference',
    obligation: 'explicit target present but unsupported => INCOMPATIBLE (not missing/unknown)',
    source: SRC,
    surface: 'src/dac-v003 (target-state rule) + src/dac-v003-compatibility (validator)',
    ownerBoundary: 'Harness-owned compatibility evaluation',
    expected: 'INCOMPATIBLE',
    evidence: [
      {
        file: 'c39-c44-shared-reference.test.ts',
        test: 'C44: an explicit but unsupported compatibility target is INCOMPATIBLE, never classified as missing/unknown',
      },
    ],
    adversarial: [
      {
        file: 'adversarial-shortcuts.test.ts',
        test: 'adversarial 7 (wrong subject/target binding): a validation over a different explicit target cannot associate with the exact manifest',
      },
    ],
    classification: 'PASS',
    reason:
      'The two dispositions are distinct frozen values; the validator names the explicit unsupported target in the subject closure and the finding distinguishes unsupported from missing.',
  },
  {
    id: 'C45',
    group: 'Authoring/Evolution',
    obligation:
      'Forge/authored candidate presented as evolved without Simulator lineage => FAIL',
    source: SRC,
    surface:
      'NOT_OWNED producer lane; Harness boundary at src/dac-v003 (P4 lineage) + src/dac-v003-manifest (entry roles)',
    ownerBoundary:
      'producer/evolution authority NOT_OWNED (Forge/Simulator); Harness consumes identity-only boundary fixtures',
    expected: 'FAIL (producer lane); Harness boundary fail-closed',
    evidence: [
      {
        file: 'c45-c52-authoring-evolution-boundary.test.ts',
        test: 'C45: an authored candidate never enters a Harness authority position — production selection requires evolved/promoted/selected stages',
      },
    ],
    adversarial: [
      {
        file: 'adversarial-shortcuts.test.ts',
        test: 'adversarial 3 (role substitution): wrong-role references fail in every manifest authority slot',
      },
    ],
    classification: 'NOT_OWNED',
    reason:
      'Whether a candidate is genuinely evolved with Simulator lineage is decided by the producer lane; the Harness-side boundary is executable: an authored-candidate reference is not P4-complete lineage and fails closed in every production authority position (selected entry role check).',
  },
  {
    id: 'C46',
    group: 'Authoring/Evolution',
    obligation: 'Simulator PASS directly causes promotion => FAIL',
    source: SRC,
    surface:
      'NOT_OWNED promotion authority; Harness boundary at src/dac-v003-manifest (promotion-evidence role)',
    ownerBoundary:
      'promotion decision authority NOT_OWNED; validation evidence never becomes promotion at any Harness surface',
    expected: 'FAIL (promotion lane); Harness boundary fail-closed',
    evidence: [
      {
        file: 'c45-c52-authoring-evolution-boundary.test.ts',
        test: 'C46: a Simulator/validation PASS never becomes promotion evidence at the Harness boundary',
      },
    ],
    adversarial: [],
    classification: 'NOT_OWNED',
    reason:
      'Promotion is an upstream authority; the Harness-side boundary is executable: a simulation-result reference in the promotion-evidence position fails closed, and no Harness surface mints promotion decisions.',
  },
  {
    id: 'C47',
    group: 'Authoring/Evolution',
    obligation:
      'producer identity substituted for EvolutionOperationRef authority => FAIL',
    source: SRC,
    surface:
      'NOT_OWNED evolution authority; Harness boundary at src/dac-v003 (registry roles + P4 derivation ref)',
    ownerBoundary: 'evolution operation authority NOT_OWNED (Simulator)',
    expected: 'FAIL (evolution lane); role separation preserved at the boundary',
    evidence: [
      {
        file: 'c45-c52-authoring-evolution-boundary.test.ts',
        test: 'C47: producer identity never substitutes EvolutionOperationRef authority at the Harness boundary',
      },
    ],
    adversarial: [],
    classification: 'NOT_OWNED',
    reason:
      'Evolution-operation authority stays with the Simulator lane; the boundary evidence proves the authored-candidate and evolution-operation registry roles stay distinct and the derivation authority of an evolved candidate is the exact evolution-operation reference, never a producer artifact.',
  },
  {
    id: 'C48',
    group: 'Authoring/Evolution',
    obligation:
      'capability result ambiguous but evolved candidate fabricated => FAIL',
    source: SRC,
    surface:
      'NOT_OWNED authoring-capability exchange; Harness boundary at src/dac-v003-external (ambiguity preservation)',
    ownerBoundary: 'capability exchange outcomes NOT_OWNED (producer lane)',
    expected: 'FAIL (producer lane); ambiguity preserved at the Harness boundary',
    evidence: [
      {
        file: 'c45-c52-authoring-evolution-boundary.test.ts',
        test: 'C48: an ambiguous capability result is never fabricated into a produced candidate by any Harness surface',
      },
    ],
    adversarial: [],
    classification: 'NOT_OWNED',
    reason:
      'The capability-exchange outcome is produced upstream; the Harness-side ambiguity-preservation primitives (attempt evidence ceiling, reconciliation STILL_UNKNOWN) never fabricate the withheld result.',
  },
  {
    id: 'C49',
    group: 'Authoring/Evolution',
    obligation: 'accepted-for-evaluation treated as produced result => FAIL',
    source: SRC,
    surface:
      'NOT_OWNED exchange semantics; Harness boundary at src/dac-v003-external (outcome-class ceilings)',
    ownerBoundary: 'exchange outcome classes NOT_OWNED (provider lane)',
    expected: 'FAIL (exchange lane); acceptance never produced at the boundary',
    evidence: [
      {
        file: 'c45-c52-authoring-evolution-boundary.test.ts',
        test: 'C49: accepted-for-evaluation is never a produced result — the exchange outcome classes stay ceiling-distinct',
      },
    ],
    adversarial: [],
    classification: 'NOT_OWNED',
    reason:
      'Exchange acceptance semantics belong to the producer/provider lane; the boundary evidence proves the acceptance outcome classes stay strictly below produced/authoritative classes and acceptance-only reconciliation stays unresolved.',
  },
  {
    id: 'C50',
    group: 'Authoring/Evolution',
    obligation:
      'evolved result lacks exact parent/root or owning evolution op => FAIL_CLOSED for authoritative reuse',
    source: SRC,
    surface: 'src/dac-v003 (P4 lineage-closure primitive)',
    ownerBoundary: 'Harness-owned P4 exactness primitive (evolution decision itself NOT_OWNED)',
    expected: 'FAIL_CLOSED for authoritative reuse',
    evidence: [
      {
        file: 'c45-c52-authoring-evolution-boundary.test.ts',
        test: 'C50: an evolved result without exact parent/root lineage or owning evolution op fails closed for authoritative reuse (P4)',
      },
    ],
    adversarial: [],
    classification: 'PASS',
    reason:
      'The Harness-owned applicable obligation is the P4 lineage-closure primitive: a derived result without parentRefs+provenanceRefs fails the P4 assertion (and P3 for production reuse); the promotion/evolution decision that would consume the lineage stays NOT_OWNED upstream.',
    identityLinkage: 'parentRefs/provenanceRefs/derivationOperationRef of the evolved reference',
  },
  {
    id: 'C51',
    group: 'Authoring/Evolution',
    obligation:
      'improvement/non-regression claimed without exact RegressionComparisonRef => FAIL for that claim',
    source: SRC,
    surface:
      'NOT_OWNED evolution-claim semantics; Harness boundary at src/dac-v003 (P6 evidence exactness)',
    ownerBoundary: 'improvement claims NOT_OWNED (evolution lane)',
    expected: 'FAIL for that claim (evolution lane); no qualitative claim accepted at the boundary',
    evidence: [
      {
        file: 'c45-c52-authoring-evolution-boundary.test.ts',
        test: 'C51: improvement/non-regression claims need exact RegressionComparisonRef evidence — no Harness surface accepts a qualitative claim',
      },
    ],
    adversarial: [],
    classification: 'NOT_OWNED',
    reason:
      'Improvement/non-regression judgment belongs to the evolution lane; the boundary evidence proves a regression-comparison claim without P6 exact evidence (exact material inputs + provenance) is not authoritative at any Harness surface.',
  },
  {
    id: 'C52',
    group: 'Authoring/Evolution',
    obligation:
      'exact authored patch from replaceable producer retained only as producer provenance => PASS',
    source: SRC,
    surface:
      'NOT_OWNED producer substitution; Harness boundary at src/dac-v003 (provenance preservation)',
    ownerBoundary: 'producer substitutability NOT_OWNED (Forge lane)',
    expected: 'PASS (producer lane); provenance preserved, authority not transferred',
    evidence: [
      {
        file: 'c45-c52-authoring-evolution-boundary.test.ts',
        test: 'C52: an exact authored patch from a replaceable producer stays producer provenance only and never gains evolution authority',
      },
    ],
    adversarial: [],
    classification: 'NOT_OWNED',
    reason:
      'The substitutable-authoring boundary is the producer lane; the boundary evidence proves an authored patch is retained verbatim as provenance, stays an authored-candidate role, and a producer substitution never transfers evolution authority (derivation stays the evolution operation).',
  },
  {
    id: 'C53',
    group: 'Composition',
    obligation: 'promotion implicitly becomes application selection => FAIL',
    source: SRC,
    surface: 'src/dac-v003-manifest (entry provenance) + src/dac-v003 (role inequality freeze)',
    ownerBoundary: 'Harness-owned manifest entry closure',
    expected: 'FAIL / fail-closed adoption',
    evidence: [
      {
        file: 'c53-c61-composition.test.ts',
        test: 'C53: promotion never implicitly becomes application selection — both authority steps are separately required',
      },
    ],
    adversarial: [
      {
        file: 'adversarial-shortcuts.test.ts',
        test: 'adversarial 5 (promotion without selection) and 6 (selection without effective promotion) both fail',
      },
    ],
    classification: 'PASS',
    reason:
      'Every selected entry requires BOTH a promotion-decision and an application-selection reference bound in the P3 lifecycle closure; either missing/substituted fails closed, and the promotion-decision != application-selection inequality is frozen data.',
  },
  {
    id: 'C54',
    group: 'Composition',
    obligation: 'compatibility PASS implicitly creates binding/activation => FAIL',
    source: SRC,
    surface:
      'src/dac-v003-compatibility (stage separation) + src/dac-v003-manifest (absorption guard)',
    ownerBoundary: 'Harness-owned lifecycle stage separation',
    expected: 'FAIL / fail-closed',
    evidence: [
      {
        file: 'c53-c61-composition.test.ts',
        test: 'C54: a compatibility PASS never creates binding or activation — validation stops before the later lifecycle stages',
      },
    ],
    adversarial: [
      {
        file: 'adversarial-shortcuts.test.ts',
        test: 'adversarial 11 (binding/activation evidence insertion): #307 evidence never enters manifest content',
      },
    ],
    classification: 'PASS',
    reason:
      'The minted validation has no binding/activation surface, lifecycle binding inputs are rejected from the stage-3 path, and binding/activation identity absorbed into manifest content fails closed.',
  },
  {
    id: 'C55',
    group: 'Composition',
    obligation:
      'Runtime contract / target / implementation identities become unrecoverably collapsed => FAIL / FAIL_CLOSED',
    source: SRC,
    surface: 'src/dac-v003-manifest (primary runtime roles) + src/dac-v003 (role inequalities)',
    ownerBoundary: 'Harness-owned composition role separation',
    expected: 'FAIL / FAIL_CLOSED',
    evidence: [
      {
        file: 'c53-c61-composition.test.ts',
        test: 'C55: runtime contract, compatibility target and runtime implementation identities stay separately referrable',
      },
    ],
    adversarial: [
      {
        file: 'adversarial-shortcuts.test.ts',
        test: 'adversarial 3 (role substitution): wrong-role references fail in every manifest authority slot',
      },
    ],
    classification: 'PASS',
    reason:
      'Wrong-role references fail closed in the runtime-contract and compatibility-target positions, and the runtime-contract != runtime-implementation inequality is frozen data.',
  },
  {
    id: 'C56',
    group: 'Composition',
    obligation:
      'RuntimeHostBindingRequirementRef treated as concrete Host Binding or lifecycle binding => FAIL',
    source: SRC,
    surface:
      'src/dac-v003 (unsafe-alias group) + src/dac-v003-compatibility (satisfaction provider roles)',
    ownerBoundary: 'Harness-owned requirement/satisfaction separation',
    expected: 'FAIL / fail-closed',
    evidence: [
      {
        file: 'c53-c61-composition.test.ts',
        test: 'C56: RuntimeHostBindingRequirementRef is never a concrete Host Binding and never a lifecycle binding',
      },
    ],
    adversarial: [],
    classification: 'PASS',
    reason:
      'The requirement/host-binding/runtime-binding unsafe-alias group is frozen; a requirement declaration cannot be satisfaction evidence (provider role), cannot fill a requirement constructor without its own descriptor, and lifecycle binding refs are rejected from the whole compatibility path.',
  },
  {
    id: 'C57',
    group: 'Composition',
    obligation:
      'required capability/Port absent but COMPATIBLE emitted => INCOMPATIBLE; validator behavior FAIL',
    source: SRC,
    surface: 'src/dac-v003-compatibility (requirement-vs-evidence closure)',
    ownerBoundary: 'Harness-owned requirement closure',
    expected: 'INCOMPATIBLE (never COMPATIBLE)',
    evidence: [
      {
        file: 'c53-c61-composition.test.ts',
        test: 'C57: a required capability/port/host-binding without exact satisfaction yields INCOMPATIBLE, never COMPATIBLE',
      },
    ],
    adversarial: [],
    classification: 'PASS',
    reason:
      'Unsatisfied required requirements (no evidence, or evidence bound to a foreign target profile) produce INCOMPATIBLE with named findings; missing evidence can never produce COMPATIBLE.',
  },
  {
    id: 'C58',
    group: 'Composition',
    obligation:
      'selected UX lacks required Runtime interaction semantic contract => INCOMPATIBLE / block later bind/activate',
    source: SRC,
    surface: 'src/dac-v003-compatibility (UX semantic-role coverage closure)',
    ownerBoundary: 'Harness-owned UX interaction closure (UX semantics themselves NOT_OWNED)',
    expected: 'INCOMPATIBLE',
    evidence: [
      {
        file: 'c53-c61-composition.test.ts',
        test: 'C58: selected UX lacking a required runtime interaction semantic contract role is INCOMPATIBLE and blocks later bind/activate',
      },
    ],
    adversarial: [],
    classification: 'PASS',
    reason:
      'A required UX semantic role not covered by the interaction contract yields INCOMPATIBLE with missingRequiredRoles recorded; full coverage of exactly the required roles is COMPATIBLE.',
  },
  {
    id: 'C59',
    group: 'Composition',
    obligation:
      'renderer/DOM/component identity substituted for Domain UX semantic identity => FAIL',
    source: SRC,
    surface:
      'src/dac-v003-compatibility (DomainUXDefinitionRef) + src/dac-v003-manifest (UX closure shape)',
    ownerBoundary: 'Harness-owned UX identity separation (Domain UX semantics NOT_OWNED)',
    expected: 'FAIL / fail-closed',
    evidence: [
      {
        file: 'c53-c61-composition.test.ts',
        test: 'C59: renderer/DOM/component identity never substitutes the Domain UX semantic identity',
      },
    ],
    adversarial: [
      {
        file: 'adversarial-shortcuts.test.ts',
        test: 'adversarial 21 (renderer as UX semantic definition): renderer identity has no UX semantic authority slot',
      },
    ],
    classification: 'PASS',
    reason:
      'A UX semantic definition requires semantic+revision identity; renderer/DOM/component tokens can only ever ride in non-authoritative locator hints, and the manifest UX closure structurally has no renderer slot.',
  },
  {
    id: 'C60',
    group: 'Composition',
    obligation:
      'Runtime implementation identity substituted for external Business SoR identity => FAIL / FAIL_CLOSED',
    source: SRC,
    surface:
      'src/dac-v003-external (identity refutation) + src/dac-v003-manifest (external-authority declaration)',
    ownerBoundary: 'Harness-owned external identity boundary (external truth NOT_OWNED)',
    expected: 'FAIL / FAIL_CLOSED',
    evidence: [
      {
        file: 'c53-c61-composition.test.ts',
        test: 'C60: runtime implementation identity never substitutes external Business SoR identity',
      },
    ],
    adversarial: [
      {
        file: 'adversarial-shortcuts.test.ts',
        test: 'adversarial 20 (runtime identity as external authority): Harness-side identity is refuted in the external lane',
      },
    ],
    classification: 'PASS',
    reason:
      'Harness-side references are refuted as external authority identities (EXTERNAL_IDENTITY_FORBIDDEN), and the manifest external-authority declaration requires a genuine #327 ExternalAuthorityRef (EXTERNAL_IDENTITY_SUBSTITUTION otherwise).',
  },
  {
    id: 'C61',
    group: 'Composition',
    obligation:
      'live external op/attempt/provider job/reconciliation state embedded in immutable Manifest => FAIL',
    source: SRC,
    surface: 'src/dac-v003-manifest (live external state absorption guard)',
    ownerBoundary: 'Harness-owned manifest immutability boundary',
    expected: 'FAIL / LIVE_EXTERNAL_STATE_ABSORPTION',
    evidence: [
      {
        file: 'c53-c61-composition.test.ts',
        test: 'C61: live external operation/attempt/provider-job/reconciliation state embedded in the immutable Manifest fails closed',
      },
    ],
    adversarial: [
      {
        file: 'adversarial-shortcuts.test.ts',
        test: 'adversarial 10 (live-state insertion): recognized instance-state vocabulary inside manifest content fails closed',
      },
    ],
    classification: 'PASS',
    reason:
      'Live attempt/provider-operation/reconciliation records inside digest-covered manifest content fail closed at any depth; recognized instance-state vocabulary fails closed separately (INSTANCE_STATE_LEAKAGE).',
  },
  {
    id: 'C62',
    group: 'External Operation',
    obligation: 'request dispatch treated as authoritative commit => FAIL',
    source: SRC,
    surface: 'src/dac-v003-external (outcome ceilings + reconciliation)',
    ownerBoundary: 'Harness-owned external evidence ceiling (external truth NOT_OWNED)',
    expected: 'FAIL; dispatch keeps truth unresolved',
    evidence: [
      {
        file: 'c62-c70-external-operation.test.ts',
        test: 'C62: request dispatch is never authoritative commit — dispatch-only evidence keeps remote truth unresolved',
      },
    ],
    adversarial: [],
    classification: 'PASS',
    reason:
      'Dispatch-attempted evidence means dispatch-occurred-only; a REQUEST_DISPATCHED observation basis keeps reconciliation STILL_UNKNOWN.',
  },
  {
    id: 'C63',
    group: 'External Operation',
    obligation:
      'provider accepted/queued treated as Business SoR committed => FAIL',
    source: SRC,
    surface: 'src/dac-v003-external (outcome classes + v0.0.2 mapping ceilings)',
    ownerBoundary: 'Harness-owned claim ceiling (SoR commit truth NOT_OWNED)',
    expected: 'FAIL; acceptance/success stay below commit',
    evidence: [
      {
        file: 'c62-c70-external-operation.test.ts',
        test: 'C63: provider acceptance and provider-scope success are never Business SoR commit',
      },
    ],
    adversarial: [
      {
        file: 'adversarial-shortcuts.test.ts',
        test: 'adversarial 12 (accepted mistaken for committed): acceptance evidence cannot drive a commit conclusion anywhere',
      },
    ],
    classification: 'PASS',
    reason:
      'ACCEPTED_FOR_PROCESSING / PENDING_IN_PROGRESS / EFFECT_SUCCEEDED all keep reconciliation STILL_UNKNOWN; the v0.0.2 provider-scope success class maps to EFFECT_SUCCEEDED, never AUTHORITATIVE_COMMITTED; only an AUTHORITATIVE_COMMITTED basis concludes commit.',
  },
  {
    id: 'C64',
    group: 'External Operation',
    obligation:
      'timeout/crash after possible dispatch treated as known non-commit => UNKNOWN/AMBIGUOUS; shortcut FAIL',
    source: SRC,
    surface: 'src/dac-v003-external (ambiguity preservation + local-cause refutation)',
    ownerBoundary: 'Harness-owned ambiguity preservation',
    expected: 'UNKNOWN_AMBIGUOUS; local cause never remote truth',
    evidence: [
      {
        file: 'c62-c70-external-operation.test.ts',
        test: 'C64: timeout/crash after possible dispatch stays UNKNOWN_AMBIGUOUS and never becomes known non-commit',
      },
    ],
    adversarial: [
      {
        file: 'adversarial-shortcuts.test.ts',
        test: 'adversarial 13 (timeout as non-commit): local timeout material cannot claim remote non-commit',
      },
    ],
    classification: 'PASS',
    reason:
      'dispatch-outcome-ambiguous carries exactly ambiguous-preserve-unresolved; local timeout/cancel material is refuted as remote truth (LOCAL_CAUSE_FORBIDDEN); TERMINAL_ABANDONMENT stays a local stop with remote truth unresolved.',
  },
  {
    id: 'C65',
    group: 'External Operation',
    obligation:
      'unresolved prior attempt followed by possibly duplicating retry without proven non-commit/idempotency => FAIL',
    source: SRC,
    surface: 'src/dac-v003-external (§11 safe-retry evaluation)',
    ownerBoundary: 'Harness-owned safe-retry authorization',
    expected: 'NOT_AUTHORIZED_AMBIGUITY_PRESERVED (no new attempt)',
    evidence: [
      {
        file: 'c62-c70-external-operation.test.ts',
        test: 'C65: a duplicating retry after an unresolved attempt is not authorized without proven non-commit/idempotency',
      },
    ],
    adversarial: [
      {
        file: 'adversarial-shortcuts.test.ts',
        test: 'adversarial 19 (query/watch/reconcile creating an effect attempt): effectful semantics fail closed',
      },
    ],
    classification: 'PASS',
    reason:
      'Possible-prior-dispatch without proof denies the retry (no-new-attempt); an unproven locally-recorded idempotency key authorizes nothing, while a proven guarantee authorizes replay — the denial is evidence-driven, not blanket.',
  },
  {
    id: 'C66',
    group: 'External Operation',
    obligation:
      'same idempotency identity reused for semantically different effect => FAIL',
    source: SRC,
    surface: 'src/dac-v003-external (idempotency binding guard)',
    ownerBoundary: 'Harness-owned idempotency equivalence rule',
    expected: 'IDEMPOTENCY_REUSE_FORBIDDEN',
    evidence: [
      {
        file: 'c62-c70-external-operation.test.ts',
        test: 'C66: an idempotency identity reused for a semantically different effect fails closed',
      },
    ],
    adversarial: [
      {
        file: 'adversarial-shortcuts.test.ts',
        test: 'adversarial 16 (idempotency issuer/scope/effect mismatch): every mismatch axis fails',
      },
    ],
    classification: 'PASS',
    reason:
      'Reuse fails closed on the effect-semantics axis and on the issuer/authority-scope axis; the bound semantic identity continues to be accepted.',
  },
  {
    id: 'C67',
    group: 'External Operation',
    obligation:
      'attempt identity collapsed into logical operation where attempts can differ => FAIL',
    source: SRC,
    surface: 'src/dac-v003-external (attempt identity guards)',
    ownerBoundary: 'Harness-owned operation/attempt identity separation',
    expected: 'IDENTITY_MISMATCH / ROLE_MISMATCH',
    evidence: [
      {
        file: 'c62-c70-external-operation.test.ts',
        test: 'C67: attempt identity stays distinct from the logical operation identity and from sibling attempts',
      },
    ],
    adversarial: [
      {
        file: 'adversarial-shortcuts.test.ts',
        test: 'adversarial 15 (same attempt reused when a new attempt is required): replayed attempt identity fails',
      },
      {
        file: 'adversarial-shortcuts.test.ts',
        test: 'adversarial 25 (attempt identity collapse at adoption): an attempt cannot be minted with its operation identity',
      },
    ],
    classification: 'PASS',
    reason:
      'An attempt cannot be minted with its operation identity, a replayed attempt identity fails the distinctness guard, and the AttemptRef cannot substitute the LogicalOperationRef (role mismatch).',
  },
  {
    id: 'C68',
    group: 'External Operation',
    obligation:
      'provider job substituted for authoritative effect/business record => FAIL',
    source: SRC,
    surface: 'src/dac-v003-external (role refutation + reconciliation basis)',
    ownerBoundary: 'Harness-owned provider/record role separation',
    expected: 'ROLE_MISMATCH',
    evidence: [
      {
        file: 'c62-c70-external-operation.test.ts',
        test: 'C68: a provider job identity never substitutes the authoritative effect/business record',
      },
    ],
    adversarial: [
      {
        file: 'adversarial-shortcuts.test.ts',
        test: 'adversarial 23 (provider job as authoritative record): the substitution is refuted everywhere',
      },
    ],
    classification: 'PASS',
    reason:
      'The ProviderOperationRef is refuted as an AuthoritativeEffectRecordRef, and provider-job-only evidence keeps reconciliation unresolved.',
  },
  {
    id: 'C69',
    group: 'External Operation',
    obligation:
      'stale/conflicting observations mutate current truth via last-write-wins => FAIL / reconciliation required',
    source: SRC,
    surface: 'src/dac-v003-external (currentness adjudication)',
    ownerBoundary: 'Harness-owned observation currentness semantics',
    expected: 'STALE/CONFLICTING; requiresReconciliation; no arrival-order winner',
    evidence: [
      {
        file: 'c62-c70-external-operation.test.ts',
        test: 'C69: stale/conflicting observations never mutate current truth by last-write-wins',
      },
    ],
    adversarial: [
      {
        file: 'adversarial-shortcuts.test.ts',
        test: 'adversarial 17 (stale observation): superseded provider operations are STALE for current truth while staying historical evidence',
      },
      {
        file: 'adversarial-shortcuts.test.ts',
        test: 'adversarial 18 (conflicting observations without reconciliation evidence): truth stays unknown',
      },
    ],
    classification: 'PASS',
    reason:
      'Adjudication is by provider currentness semantics in either arrival order; genuine conflicts mark both observations CONFLICTING with requiresReconciliation and the reconciliation keeps truth unknown; observations stay immutable historical evidence.',
  },
  {
    id: 'C70',
    group: 'External Operation',
    obligation:
      'preserved exact identities later reconcile to authoritative committed truth => PASS',
    source: SRC,
    surface: 'src/dac-v003-external (reconciliation episodes)',
    ownerBoundary: 'Harness-owned evidence-backed reconciliation (external truth NOT_OWNED)',
    expected: 'PASS (RECONCILED_COMMITTED on AUTHORITATIVE_COMMITTED basis)',
    evidence: [
      {
        file: 'c62-c70-external-operation.test.ts',
        test: 'C70: preserved exact operation/attempt/provider/observation identities reconcile to authoritative committed truth',
      },
    ],
    adversarial: [],
    classification: 'PASS',
    reason:
      'A reconciliation over the preserved exact attempt/provider/observation/effect-record identities concludes RECONCILED_COMMITTED with the exact basis identities preserved and the older ambiguity retained verbatim as historical evidence.',
  },
  {
    id: 'C71',
    group: 'Cross-lane E2E',
    obligation:
      'authored candidate goes directly into production selection/Manifest => FAIL_CLOSED / FAIL',
    source: SRC,
    surface: 'src/dac-v003-manifest (selected entry role gate)',
    ownerBoundary: 'Harness-owned manifest entry gate (producer lane NOT_OWNED)',
    expected: 'FAIL_CLOSED at adoption',
    evidence: [
      {
        file: 'c71-c77-cross-lane.test.ts',
        test: 'C71: an authored candidate never enters production selection/manifest directly',
      },
    ],
    adversarial: [],
    classification: 'PASS',
    reason:
      'Authored and evolved candidate references both fail closed in the selected position; only a P3 selected-domain-data reference with bound promotion+selection authorities enters a manifest.',
  },
  {
    id: 'C72',
    group: 'Cross-lane E2E',
    obligation:
      'Simulator PASS used as promotion and then implicit selection => FAIL',
    source: SRC,
    surface: 'src/dac-v003-manifest (provenance role gates)',
    ownerBoundary: 'Harness-owned provenance gates (promotion/selection NOT_OWNED)',
    expected: 'FAIL / fail-closed',
    evidence: [
      {
        file: 'c71-c77-cross-lane.test.ts',
        test: 'C72: a Simulator PASS never becomes promotion and then implicit selection',
      },
    ],
    adversarial: [],
    classification: 'PASS',
    reason:
      'A simulation-result reference fails closed in both the promotion-evidence and application-selection positions; one validation event can never drive production composition.',
  },
  {
    id: 'C73',
    group: 'Cross-lane E2E',
    obligation: 'promotion exists but selection inferred rather than separately issued => FAIL',
    source: SRC,
    surface: 'src/dac-v003-manifest (total selection coverage)',
    ownerBoundary: 'Harness-owned selection-coverage gate (selection authority NOT_OWNED)',
    expected: 'FAIL / fail-closed',
    evidence: [
      {
        file: 'c71-c77-cross-lane.test.ts',
        test: 'C73: promotion without a separately issued selection fails closed — selection is never inferred',
      },
    ],
    adversarial: [],
    classification: 'PASS',
    reason:
      'A promotion-only lifecycle closure is unbound, and a selection authority covering a different revision is not total coverage; promotion-backed auto-select does not exist.',
  },
  {
    id: 'C74',
    group: 'Cross-lane E2E',
    obligation: 'compatibility PASS used as implicit Runtime binding/activation => FAIL',
    source: SRC,
    surface:
      'src/dac-v003-compatibility + src/dac-v003-manifest (stage separation + absorption)',
    ownerBoundary: 'Harness-owned stage separation',
    expected: 'FAIL / fail-closed',
    evidence: [
      {
        file: 'c71-c77-cross-lane.test.ts',
        test: 'C74: a compatibility PASS never becomes implicit Runtime binding/activation',
      },
    ],
    adversarial: [
      {
        file: 'adversarial-shortcuts.test.ts',
        test: 'adversarial 11 (binding/activation evidence insertion): #307 evidence never enters manifest content',
      },
    ],
    classification: 'PASS',
    reason:
      'The validation authority scope stays compatibility; activation identity inside manifest provenance fails closed; the separately-encoded result view resolves to the same compatibility authority, never a binding/activation authority.',
  },
  {
    id: 'C75',
    group: 'Cross-lane E2E',
    obligation:
      'provider acceptance becomes Runtime authoritative success and UX success presentation without SoR commit evidence => FAIL',
    source: SRC,
    surface:
      'src/dac-v003-external (Runtime outcome) + src/dac-bridge (UX consequence correlation)',
    ownerBoundary:
      'Harness-owned Runtime outcome ceiling; Domain UX semantics NOT_OWNED (correlation evidence only)',
    expected: 'FAIL; acceptance stays unresolved; UX claim not-claimed',
    evidence: [
      {
        file: 'c71-c77-cross-lane.test.ts',
        test: 'C75: provider acceptance never becomes Runtime authoritative success or UX success without SoR commit evidence',
      },
    ],
    adversarial: [
      {
        file: 'adversarial-shortcuts.test.ts',
        test: 'adversarial 12 (accepted mistaken for committed): acceptance evidence cannot drive a commit conclusion anywhere',
      },
    ],
    classification: 'PASS',
    reason:
      'The Harness-owned Runtime half is executable: acceptance-only reconciliation stays STILL_UNKNOWN; the UX-consequence correlation (UX semantics NOT_OWNED) carries externalAuthorityOutcome not-claimed — no success presentation claim exists without commit evidence.',
  },
  {
    id: 'C76',
    group: 'Cross-lane E2E',
    obligation:
      'exact composition uses renderer identity as UX semantic identity or Runtime identity as external SoR identity => FAIL',
    source: SRC,
    surface:
      'src/dac-v003-manifest (UX closure + external declarations) + src/dac-v003-external (refutation)',
    ownerBoundary:
      'Harness-owned no-cross-authority identity substitution (UX semantics / external truth NOT_OWNED)',
    expected: 'FAIL / fail-closed',
    evidence: [
      {
        file: 'c71-c77-cross-lane.test.ts',
        test: 'C76: an exact composition never substitutes renderer identity for UX semantics or runtime identity for external SoR identity',
      },
    ],
    adversarial: [
      {
        file: 'adversarial-shortcuts.test.ts',
        test: 'adversarial 21 (renderer as UX semantic definition): renderer identity has no UX semantic authority slot',
      },
      {
        file: 'adversarial-shortcuts.test.ts',
        test: 'adversarial 20 (runtime identity as external authority): Harness-side identity is refuted in the external lane',
      },
    ],
    classification: 'PASS',
    reason:
      'The exact adopted composition has no renderer slot on its UX closure, and Harness-side identity is refuted in the external-authority position of the same composition.',
  },
  {
    id: 'C77',
    group: 'Cross-lane E2E',
    obligation:
      'exact authored/evolved lineage -> explicit promotion -> explicit selection -> immutable Manifest -> exact compatibility PASS -> explicit binding -> explicit activation -> external logical op with exact authority -> authoritative observation/reconciliation -> Runtime outcome -> UX consequence => PASS',
    source: SRC,
    surface:
      'all merged surfaces: dac-v003, dac-v003-compatibility, dac-v003-manifest, dac-v003-external + A2 composition-intake/runtime-binding/dac-bridge/external-authority lanes',
    ownerBoundary:
      'Harness-owned segments executed; producer/promotion/selection/external-truth/UX-semantics lanes NOT_OWNED boundary fixtures',
    expected: 'PASS with every authority and exactness boundary preserved',
    evidence: [
      {
        file: 'c77-positive-boundary-path.test.ts',
        test: 'C77: the complete positive boundary path preserves every authority and exactness boundary end to end',
      },
      {
        file: 'c77-positive-boundary-path.test.ts',
        test: 'C77 ownership boundary: no NOT_OWNED lane can be smuggled into a Harness authority position on the path',
      },
      {
        file: 'c71-c77-cross-lane.test.ts',
        test: 'C77 negatives: any single shortcut across the full boundary path fails closed (pointer to the positive suite)',
      },
    ],
    adversarial: [
      {
        file: 'adversarial-shortcuts.test.ts',
        test: 'adversarial 8 (manifest partial selected-set coverage): the multi-entry manifest cannot ride on a single-entry verdict validation',
      },
      {
        file: 'adversarial-shortcuts.test.ts',
        test: 'adversarial 9 (self-referential compatibility result): a validation/result inside manifest content fails closed',
      },
    ],
    classification: 'PASS',
    reason:
      'The complete path is executed with mandatory NOT_OWNED ownership marking (producer, promotion, selection, external truth, UX semantics); every Harness-owned segment is actually asserted; cross-boundary identity correlation (package pin, manifest digest) is preserved; every shortcut variant fails closed in the adversarial suite.',
    identityLinkage: 'compiled package pin + manifest content digest + validation identity correlated end to end',
  },
];

export function dacV003ConformanceCounts(): {
  readonly total: number;
  readonly pass: number;
  readonly notApplicable: number;
  readonly notOwned: number;
} {
  let pass = 0;
  let notApplicable = 0;
  let notOwned = 0;
  for (const row of DAC_V003_C39_C77_MATRIX) {
    if (row.classification === 'PASS') pass += 1;
    else if (row.classification === 'NOT_APPLICABLE') notApplicable += 1;
    else notOwned += 1;
  }
  return {
    total: DAC_V003_C39_C77_MATRIX.length,
    pass,
    notApplicable,
    notOwned,
  };
}
