/**
 * T005A compile-time type fixtures (issue #554).
 *
 * Proof-only fixtures: they are typechecked by
 * `tsc -p tsconfig.test.json --noEmit` but are never executed. `Expect`/`Equal`
 * force compile failures when the additive logical resource requirement
 * declaration contract regresses, and `@ts-expect-error` blocks prove negative
 * boundaries (live values, secrets, endpoints, handles, provider identities,
 * floating selectors, implicit requiredness) stay unrepresentable — there is
 * no free-form JSON bag anywhere in the contract.
 */
import * as resourceRequirementsModule from '../../src/contracts/resource-requirements.js';
import type {
  ResourceContractRef,
  ToolResourceRequirement,
  ToolResourceRequirementsDeclaration,
  validateToolResourceRequirements,
} from '../../src/contracts/resource-requirements.js';
import type {
  ComponentEnvelope,
  ComponentId,
  SemanticContractRef,
} from '../../src/contracts/component.js';

type Expect<T extends true> = T;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// F1: the declaration and requirement carry exactly the normative dimensions —
// no resource-instance identity, no digest, no attachment mechanics, no JSON
// bag field can be represented.
export type DeclarationHasOnlyNormativeDimensions = Expect<
  Equal<keyof ToolResourceRequirementsDeclaration, 'componentId' | 'requirements'>
>;
export type RequirementHasOnlyNormativeDimensions = Expect<
  Equal<keyof ToolResourceRequirement, 'resourceKey' | 'contract' | 'operationId' | 'required'>
>;
export type ContractRefIsExactTwoFieldShape = Expect<
  Equal<keyof ResourceContractRef, 'contractId' | 'version'>
>;

// F2: every requirement field is an identity string, an exact ref object, or a
// boolean — there is no JsonValue-typed field anywhere in the contract.
export type ResourceKeyIsExactIdentityString = Expect<
  Equal<ToolResourceRequirement['resourceKey'], string>
>;
export type OperationIdIsOptionalExactIdentity = Expect<
  Equal<ToolResourceRequirement['operationId'], string | undefined>
>;
export type ContractIsOptionalExactRef = Expect<
  Equal<ToolResourceRequirement['contract'], ResourceContractRef | undefined>
>;
export type RequiredIsExactBoolean = Expect<Equal<ToolResourceRequirement['required'], boolean>>;
export type ComponentIdFieldIsComponentId = Expect<
  Equal<ToolResourceRequirementsDeclaration['componentId'], ComponentId>
>;
export type RequirementsArrayAllowsEmpty = Expect<
  Equal<ToolResourceRequirementsDeclaration['requirements'], readonly ToolResourceRequirement[]>
>;

// F3: the contract ref conventions match the existing exact-ref conventions
// verbatim (identity string ids, exact version strings).
export type ContractRefIdIsExactIdentity = Expect<Equal<ResourceContractRef['contractId'], string>>;
export type ContractRefVersionFollowsSemanticRefConvention = Expect<
  Equal<ResourceContractRef['version'], SemanticContractRef['version']>
>;

// F4: `required` is mandatory, exact, and never defaulted or coerced.
export const requirementFixture: ToolResourceRequirement = {
  resourceKey: 'runtime.postgres.cluster',
  contract: { contractId: 'postgres.cluster.contract', version: '14.2.0' },
  operationId: 'lookup.credit-rating',
  required: true,
};
// @ts-expect-error required is mandatory — there is no default criticality
export const requirementWithoutRequired: ToolResourceRequirement = {
  resourceKey: 'runtime.postgres.cluster',
};
export const requirementWithStringRequired: ToolResourceRequirement = {
  ...requirementFixture,
  // @ts-expect-error 'true' is not a boolean; no coercion
  required: 'true',
};
export const requirementWithNumericRequired: ToolResourceRequirement = {
  ...requirementFixture,
  // @ts-expect-error 1 is not a boolean; no coercion
  required: 1,
};
export const requirementWithNullRequired: ToolResourceRequirement = {
  ...requirementFixture,
  // @ts-expect-error null is not a boolean
  required: null,
};

// F5: live values, secrets, endpoints, credentials, handles, and provider/
// model identities are unrepresentable on a requirement (excess-property
// checking on object literals).
export const requirementWithValue: ToolResourceRequirement = {
  ...requirementFixture,
  // @ts-expect-error no live value material on a requirement
  value: 'postgres://user:pass@host:5432/db',
};
export const requirementWithSecret: ToolResourceRequirement = {
  ...requirementFixture,
  // @ts-expect-error no secret material on a requirement
  secret: 'hunter2',
};
export const requirementWithCredentials: ToolResourceRequirement = {
  ...requirementFixture,
  // @ts-expect-error no credentials material on a requirement
  credentials: { username: 'app', password: 'hunter2' },
};
export const requirementWithEndpoint: ToolResourceRequirement = {
  ...requirementFixture,
  // @ts-expect-error no endpoint identity on a requirement
  endpoint: 'https://db.internal:5432',
};
export const requirementWithUri: ToolResourceRequirement = {
  ...requirementFixture,
  // @ts-expect-error no uri identity on a requirement
  uri: 'postgres://db.internal/app',
};
export const requirementWithUrl: ToolResourceRequirement = {
  ...requirementFixture,
  // @ts-expect-error no url identity on a requirement
  url: 'https://api.internal/v1',
};
export const requirementWithHandle: ToolResourceRequirement = {
  ...requirementFixture,
  // @ts-expect-error no live handle on a requirement
  handle: 'fd://42',
};
export const requirementWithConnectionString: ToolResourceRequirement = {
  ...requirementFixture,
  // @ts-expect-error no connection string on a requirement
  connectionString: 'Server=db;Database=app;Uid=app;Pwd=hunter2;',
};
export const requirementWithDsn: ToolResourceRequirement = {
  ...requirementFixture,
  // @ts-expect-error no dsn on a requirement
  dsn: 'postgres://app:hunter2@db.internal:5432/app',
};
export const requirementWithProvider: ToolResourceRequirement = {
  ...requirementFixture,
  // @ts-expect-error no provider identity on a requirement
  provider: 'neon',
};
export const requirementWithModel: ToolResourceRequirement = {
  ...requirementFixture,
  // @ts-expect-error no model identity on a requirement
  model: 'gpt-x',
};
export const requirementWithRegion: ToolResourceRequirement = {
  ...requirementFixture,
  // @ts-expect-error no region identity on a requirement
  region: 'eu-central-1',
};
export const requirementWithBinding: ToolResourceRequirement = {
  ...requirementFixture,
  // @ts-expect-error no binding identity on a requirement
  binding: 'pin-42',
};
export const requirementWithJsonBag: ToolResourceRequirement = {
  ...requirementFixture,
  // @ts-expect-error no free-form JSON bag exists anywhere on a requirement
  material: { anything: 'live' },
};

// F6: live values and smuggled requirement material are unrepresentable on the
// declaration itself.
export const declarationWithSecrets: ToolResourceRequirementsDeclaration = {
  componentId: 'credit.rating.tool',
  requirements: [requirementFixture],
  // @ts-expect-error no secret material on the declaration
  secrets: ['api-key'],
};
export const declarationWithValue: ToolResourceRequirementsDeclaration = {
  componentId: 'credit.rating.tool',
  requirements: [requirementFixture],
  // @ts-expect-error no live value material on the declaration
  value: 'postgres://user:pass@host:5432/db',
};
export const declarationWithEndpoint: ToolResourceRequirementsDeclaration = {
  componentId: 'credit.rating.tool',
  requirements: [requirementFixture],
  // @ts-expect-error no endpoint identity on the declaration
  endpoint: 'https://db.internal:5432',
};
export const declarationWithCredentials: ToolResourceRequirementsDeclaration = {
  componentId: 'credit.rating.tool',
  requirements: [requirementFixture],
  // @ts-expect-error no credentials material on the declaration
  credentials: { username: 'app', password: 'hunter2' },
};
export const declarationWithProvider: ToolResourceRequirementsDeclaration = {
  componentId: 'credit.rating.tool',
  requirements: [requirementFixture],
  // @ts-expect-error no provider identity on the declaration
  provider: 'neon',
};
export const declarationWithModel: ToolResourceRequirementsDeclaration = {
  componentId: 'credit.rating.tool',
  requirements: [requirementFixture],
  // @ts-expect-error no model identity on the declaration
  model: 'gpt-x',
};
export const declarationWithBinding: ToolResourceRequirementsDeclaration = {
  componentId: 'credit.rating.tool',
  requirements: [requirementFixture],
  // @ts-expect-error no binding identity on the declaration
  binding: 'pin-42',
};
export const declarationWithJsonBag: ToolResourceRequirementsDeclaration = {
  componentId: 'credit.rating.tool',
  requirements: [requirementFixture],
  // @ts-expect-error no free-form JSON bag exists anywhere on the declaration
  material: { anything: 'live' },
};

// F7: the validator composes with the existing Tool Component contract — it
// consumes the existing ComponentEnvelope plus the declaration, returns void
// (not a Promise), and takes no environment/host/provider parameter.
export type ValidatorTakesOwnerAndDeclaration = Expect<
  Equal<
    Parameters<typeof validateToolResourceRequirements>,
    [ComponentEnvelope, ToolResourceRequirementsDeclaration]
  >
>;
export type OwnerParamIsExistingEnvelope = Expect<
  Equal<Parameters<typeof validateToolResourceRequirements>[0], ComponentEnvelope>
>;
export type ValidatorReturnsVoidNotPromise = Expect<
  Equal<ReturnType<typeof validateToolResourceRequirements>, void>
>;

// F8: the module's runtime surface is declaration material only — the typed
// error class and one pure validator. No resolver, reader, accessor, or
// admission gate exists that could bind a requirement to a live resource.
export type ModuleValueExportsAreDeclarationMaterialOnly = Expect<
  Equal<
    keyof typeof resourceRequirementsModule,
    'ResourceRequirementContractError' | 'validateToolResourceRequirements'
  >
>;

// F9: an empty requirements array is a valid declaration (= declares no
// requirements); component-scope and operation-scope requirements coexist.
export const declaresNothingFixture: ToolResourceRequirementsDeclaration = {
  componentId: 'credit.rating.tool',
  requirements: [],
};
export const mixedScopesFixture: ToolResourceRequirementsDeclaration = {
  componentId: 'credit.rating.tool',
  requirements: [
    requirementFixture,
    {
      resourceKey: 'runtime.credit.schema',
      operationId: 'lookup.credit-rating',
      required: false,
    },
  ],
};
