/**
 * T001D/#556 compile-time fixtures for the authoritative must-understand seam.
 */
import type {
  admitComponent,
  ComponentAdmissionError,
  ComponentAdmissionErrorCode,
  ComponentAdmissionFailureClass,
  ComponentAdmissionResult,
  ComponentKindValidator,
  UnderstoodKindDeclaration,
  UnderstoodKindSet,
} from '../../src/contracts/component-admission.js';
import type {
  CapabilityContractRef,
  ComponentEnvelope,
  KindRef,
  SemanticContractRef,
} from '../../src/contracts/component.js';

type Expect<T extends true> = T;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

export type DeclarationDimensions = Expect<
  Equal<
    keyof UnderstoodKindDeclaration,
    'kind' | 'understoodSemanticContracts' | 'understoodCapabilities' | 'validateComponent'
  >
>;

export type UnderstoodSetIsReadonlyList = Expect<
  Equal<UnderstoodKindSet, readonly UnderstoodKindDeclaration[]>
>;

export type ValidatorConsumesWholeEnvelope = Expect<
  Equal<ComponentKindValidator, (envelope: ComponentEnvelope) => void>
>;

export type FailureClassesExactly = Expect<
  Equal<ComponentAdmissionFailureClass, 'KIND' | 'CONTRACT' | 'CAPABILITY' | 'INPUT'>
>;

export type AdmissionErrorCodesExactly = Expect<
  Equal<
    ComponentAdmissionErrorCode,
    | 'UNKNOWN_KIND'
    | 'KIND_VERSION_MISMATCH'
    | 'UNKNOWN_SEMANTIC_CONTRACT'
    | 'UNKNOWN_CAPABILITY'
    | 'INVALID_UNDERSTOOD_KIND_SET'
  >
>;

export type ResultStatusIsAdmittedLiteral = Expect<
  Equal<ComponentAdmissionResult['status'], 'ADMITTED'>
>;

export type ResultDimensions = Expect<
  Equal<
    keyof ComponentAdmissionResult,
    | 'status'
    | 'componentId'
    | 'admittedKind'
    | 'admittedSemanticContracts'
    | 'admittedCapabilities'
    | 'nonMaterialExtensions'
  >
>;

export type AdmittedContractsAreExactRefs = Expect<
  Equal<ComponentAdmissionResult['admittedSemanticContracts'], readonly SemanticContractRef[]>
>;

export type AdmittedCapabilitiesAreExactRefs = Expect<
  Equal<ComponentAdmissionResult['admittedCapabilities'], readonly CapabilityContractRef[]>
>;

export type AdmittedKindIsExactRef = Expect<
  Equal<ComponentAdmissionResult['admittedKind'], KindRef>
>;

export type AdmitIsTwoArgAuthoritativeSeam = Expect<
  Equal<
    typeof admitComponent,
    (envelope: ComponentEnvelope, understoodKinds: UnderstoodKindSet) => ComponentAdmissionResult
  >
>;

export type ErrorCodeField = Expect<
  Equal<ComponentAdmissionError['code'], ComponentAdmissionErrorCode>
>;
export type ErrorFailureClassField = Expect<
  Equal<ComponentAdmissionError['failureClass'], ComponentAdmissionFailureClass>
>;

const validator: ComponentKindValidator = (_envelope) => {};

export const declarationFixture: UnderstoodKindDeclaration = {
  kind: { kindId: 'decision.rule.v1', version: '1.2.0' },
  understoodSemanticContracts: [{ contractId: 'customer.tier.schema', version: '2.0.0' }],
  understoodCapabilities: [{ capabilityId: 'semantic-decision', version: '1.0.0' }],
  validateComponent: validator,
};

// @ts-expect-error validator is mandatory for authoritative admission
export const missingValidator: UnderstoodKindDeclaration = {
  kind: { kindId: 'decision.rule.v1', version: '1.2.0' },
  understoodSemanticContracts: [],
  understoodCapabilities: [],
};

export const wrongValidator: UnderstoodKindDeclaration = {
  ...declarationFixture,
  // @ts-expect-error closed-world validator must consume a ComponentEnvelope
  validateComponent: 'not-a-function',
};

// @ts-expect-error the result status is a literal, not a free string
export const freeStringStatus: ComponentAdmissionResult['status'] = 'MAYBE';

export const resultFixture: ComponentAdmissionResult = {
  status: 'ADMITTED',
  componentId: 'quote.eligibility.rule',
  admittedKind: { kindId: 'decision.rule.v1', version: '1.2.0' },
  admittedSemanticContracts: [],
  admittedCapabilities: [],
};

export const emptyUnderstoodSetFixture: UnderstoodKindSet = [];
