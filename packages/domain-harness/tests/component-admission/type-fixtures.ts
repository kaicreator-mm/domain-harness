/**
 * T001D compile-time type fixtures (issue #543).
 *
 * Proof-only fixtures: typechecked by `tsc -p tsconfig.test.json --noEmit`
 * but never executed. `Expect`/`Equal` force compile failures when the
 * additive admission contract regresses (taxonomy drift, mutable result
 * surfaces, smuggled result dimensions), and `@ts-expect-error` blocks prove
 * negative boundaries stay unrepresentable.
 */
import type {
  admitComponent,
  ComponentAdmissionError,
  ComponentAdmissionErrorCode,
  ComponentAdmissionFailureClass,
  ComponentAdmissionResult,
  UnderstoodKindDeclaration,
  UnderstoodKindSet,
} from '../../src/contracts/component-admission.js';
import type {
  ComponentEnvelope,
  KindRef,
  SemanticContractRef,
} from '../../src/contracts/component.js';

type Expect<T extends true> = T;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// F1: an understood declaration carries exactly the three normative dimensions.
export type DeclarationHasOnlyNormativeDimensions = Expect<
  Equal<
    keyof UnderstoodKindDeclaration,
    'kind' | 'understoodSemanticContracts' | 'materialSemanticBodyFields'
  >
>;

// F2: the understood set is a readonly list of declarations (empty set valid).
export type UnderstoodSetIsReadonlyList = Expect<
  Equal<UnderstoodKindSet, readonly UnderstoodKindDeclaration[]>
>;

// F3: the failure taxonomy is exactly four classes and exactly six codes.
export type FailureClassesExactly = Expect<
  Equal<ComponentAdmissionFailureClass, 'KIND' | 'CONTRACT' | 'FIELD' | 'INPUT'>
>;
export type AdmissionErrorCodesExactly = Expect<
  Equal<
    ComponentAdmissionErrorCode,
    | 'UNKNOWN_KIND'
    | 'KIND_VERSION_MISMATCH'
    | 'UNKNOWN_SEMANTIC_CONTRACT'
    | 'UNKNOWN_MATERIAL_FIELD'
    | 'INVALID_UNDERSTOOD_KIND_SET'
    | 'ADMISSION_INPUT_INVALID'
  >
>;

// F4: the admitted result carries only the normative dimensions and its
// status is the literal 'ADMITTED'.
export type ResultStatusIsAdmittedLiteral = Expect<
  Equal<ComponentAdmissionResult['status'], 'ADMITTED'>
>;
export type ResultHasOnlyNormativeDimensions = Expect<
  Equal<
    Exclude<
      keyof ComponentAdmissionResult,
      | 'status'
      | 'componentId'
      | 'admittedKind'
      | 'admittedSemanticContracts'
      | 'admittedMaterialFields'
      | 'nonMaterialExtensions'
    >,
    never
  >
>;

// F5: admitted material fields are a readonly exact string list; admitted
// contract refs stay exact SemanticContractRefs; the echoed kind stays a KindRef.
export type AdmittedMaterialFieldsAreReadonlyStrings = Expect<
  Equal<ComponentAdmissionResult['admittedMaterialFields'], readonly string[]>
>;
export type AdmittedContractsAreExactRefs = Expect<
  Equal<ComponentAdmissionResult['admittedSemanticContracts'], readonly SemanticContractRef[]>
>;
export type AdmittedKindIsExactRef = Expect<Equal<ComponentAdmissionResult['admittedKind'], KindRef>>;

// F6: admitComponent is the pure two-argument seam over an already-validated
// envelope and the caller-supplied understood set.
export type AdmitIsTwoArgPureSeam = Expect<
  Equal<
    typeof admitComponent,
    (envelope: ComponentEnvelope, understoodKinds: UnderstoodKindSet) => ComponentAdmissionResult
  >
>;

// F7: the typed error carries the code plus exactly one failure-class
// discriminator, mirroring the ComponentContractError pattern.
export type ErrorCodeField = Expect<
  Equal<ComponentAdmissionError['code'], ComponentAdmissionErrorCode>
>;
export type ErrorFailureClassField = Expect<
  Equal<ComponentAdmissionError['failureClass'], ComponentAdmissionFailureClass>
>;

// F8: a fully-populated declaration literal satisfies the contract (excess
// property checking rejects smuggled fields on literals).
export const declarationFixture: UnderstoodKindDeclaration = {
  kind: { kindId: 'decision.rule.v1', version: '1.2.0' },
  understoodSemanticContracts: [{ contractId: 'customer.tier.schema', version: '2.0.0' }],
  materialSemanticBodyFields: ['threshold', 'policy'],
};

// @ts-expect-error material field names must be strings
export const nonStringMaterialField: UnderstoodKindDeclaration = {
  ...declarationFixture,
  materialSemanticBodyFields: [42],
};

// @ts-expect-error the result status is a literal, not a free string
export const freeStringStatus: ComponentAdmissionResult['status'] = 'MAYBE';

// @ts-expect-error capability material is not must-understand and can never be
// represented on the admission result
export const capabilitySmuggling: ComponentAdmissionResult & {
  requiredCapabilities: ComponentEnvelope['requiredCapabilities'];
} = {
  status: 'ADMITTED',
  componentId: 'quote.eligibility.rule',
  admittedKind: { kindId: 'decision.rule.v1', version: '1.2.0' },
  admittedSemanticContracts: [],
  admittedMaterialFields: [],
  requiredCapabilities: [],
};

// F9: an empty understood set is structurally valid input.
export const emptyUnderstoodSetFixture: UnderstoodKindSet = [];
