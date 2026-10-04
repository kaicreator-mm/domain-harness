/**
 * T002A compile-time type fixtures (issue #552).
 *
 * Proof-only fixtures: typechecked by `tsc -p tsconfig.test.json --noEmit`
 * but never executed. `Expect`/`Equal` force compile failures when the
 * additive compatibility contract regresses (taxonomy drift, mutable result
 * surfaces, smuggled result dimensions), and `@ts-expect-error` blocks prove
 * negative boundaries stay unrepresentable.
 */
import type {
  decideKindCompatibility,
  KindCompatibilityError,
  KindCompatibilityErrorCode,
  KindCompatibilityFailureClass,
  KindCompatibilityResult,
  SupportedKindSet,
} from '../../src/contracts/kind-compatibility.js';
import type {
  ComponentAdmissionResult,
  UnderstoodKindSet,
} from '../../src/contracts/component-admission.js';
import type { ComponentEnvelope, KindRef } from '../../src/contracts/component.js';

type Expect<T extends true> = T;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// F1: the supported set is a readonly list of exact KindRefs (empty set valid).
export type SupportedSetIsReadonlyKindRefList = Expect<Equal<SupportedKindSet, readonly KindRef[]>>;

// F2: the failure taxonomy is exactly two classes and exactly four codes.
export type FailureClassesExactly = Expect<Equal<KindCompatibilityFailureClass, 'KIND' | 'INPUT'>>;
export type ErrorCodesExactly = Expect<
  Equal<
    KindCompatibilityErrorCode,
    | 'KIND_NOT_SUPPORTED'
    | 'KIND_VERSION_NOT_SUPPORTED'
    | 'INCOMPATIBLE_KIND_REF'
    | 'INVALID_COMPATIBILITY_INPUT'
  >
>;

// F3: the SUPPORTED result carries only the normative dimensions and its
// status is the literal 'SUPPORTED'.
export type ResultStatusIsSupportedLiteral = Expect<Equal<KindCompatibilityResult['status'], 'SUPPORTED'>>;
export type ResultHasOnlyNormativeDimensions = Expect<
  Equal<Exclude<keyof KindCompatibilityResult, 'status' | 'supportedKind'>, never>
>;

// F4: the matched evidence is an exact KindRef and nothing
// implementation-identity-shaped is representable on the result (excess
// property checking rejects smuggled fields on literals).
export type MatchedEvidenceIsExactRef = Expect<Equal<KindCompatibilityResult['supportedKind'], KindRef>>;

export const implementationSmuggling: KindCompatibilityResult = {
  status: 'SUPPORTED',
  supportedKind: { kindId: 'decision.rule.v1', version: '1.2.0' },
  // @ts-expect-error implementation/assembly identity is never part of the
  // compatibility decision result (R9 evidence boundary)
  implementationId: 'rule-engine-impl@9',
};

export const providerSmuggling: KindCompatibilityResult = {
  status: 'SUPPORTED',
  supportedKind: { kindId: 'decision.rule.v1', version: '1.2.0' },
  // @ts-expect-error provider/module/package identity is equally
  // unrepresentable on the result
  provider: 'builtin',
};

// @ts-expect-error the result status is a literal, not a free string
export const freeStringStatus: KindCompatibilityResult['status'] = 'MAYBE';

// F5: decideKindCompatibility is the pure two-argument seam over the
// component.ts KindRef and the caller-supplied supported set.
export type DecideIsTwoArgPureSeam = Expect<
  Equal<
    typeof decideKindCompatibility,
    (requiredKind: KindRef, supportedKinds: SupportedKindSet) => KindCompatibilityResult
  >
>;

// F6: the typed error carries the code plus exactly one failure-class
// discriminator, mirroring the admission-era error pattern.
export type ErrorCodeField = Expect<Equal<KindCompatibilityError['code'], KindCompatibilityErrorCode>>;
export type ErrorFailureClassField = Expect<
  Equal<KindCompatibilityError['failureClass'], KindCompatibilityFailureClass>
>;

// F7 (R12): the decision composes alongside admission-era surfaces — an
// envelope's kind feeds the seam and both results coexist in one scope.
export function composeWithAdmissionTypes(
  envelope: ComponentEnvelope,
  supportedKinds: SupportedKindSet,
  understoodKinds: UnderstoodKindSet,
): { compatibility: KindCompatibilityResult; admission: ComponentAdmissionResult | null } {
  const compatibility = decideKindCompatibility(envelope.kind, supportedKinds);
  void understoodKinds;
  return { compatibility, admission: null };
}

// F8: an empty supported set is structurally valid input.
export const emptySupportedSetFixture: SupportedKindSet = [];
