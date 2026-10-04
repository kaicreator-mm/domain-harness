/**
 * T003A compile-time type fixtures (issue #544).
 *
 * Proof-only fixtures: they are typechecked by
 * `tsc -p tsconfig.test.json --noEmit` but are never executed. `Expect`/`Equal`
 * force compile failures when the additive Tool Component operation contract
 * regresses, and `@ts-expect-error` blocks prove negative boundaries (smuggled
 * implementation/resource identity, non-JSON material, closed-kind drift)
 * stay unrepresentable.
 */
import * as toolComponentModule from '../../src/contracts/tool-component.js';
import type {
  ToolOperationEffect,
  ToolOperationContract,
  ToolOperationsDeclaration,
  validateToolComponent,
} from '../../src/contracts/tool-component.js';
import type {
  CapabilityContractRef,
  ComponentEnvelope,
} from '../../src/contracts/component.js';
import type { HarnessTool, ToolContext, ToolEffect } from '../../src/contracts/tool.js';

type Expect<T extends true> = T;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// F1: the declared effect enum is exactly the frozen L2 minimal enum and is
// mutually assignable with the legacy `ToolEffect` union (identical types in
// both directions) — no re-declaration drift, no case variants.
export type EffectEnumIsFrozenMinimal = Expect<
  Equal<ToolOperationEffect, 'none' | 'idempotent' | 'non-idempotent'>
>;
export type EffectEnumMutuallyAssignableWithLegacyToolEffect = Expect<
  Equal<ToolOperationEffect, ToolEffect>
>;
export const legacyEffectAsDeclared: ToolOperationEffect = 'idempotent';
export const declaredEffectAsLegacy: ToolEffect = legacyEffectAsDeclared;

// F2: the declaration carries exactly the two normative dimensions — no
// implementation/module/provider/resource/digest/activation identity and no
// invocation machinery can be represented on ToolOperationsDeclaration.
export type DeclarationHasOnlyNormativeDimensions = Expect<
  Equal<keyof ToolOperationsDeclaration, 'operations' | 'providesCapabilities'>
>;

// F3: an operation carries exactly the seven normative dimensions.
export type OperationHasOnlyNormativeDimensions = Expect<
  Equal<
    keyof ToolOperationContract,
    | 'operationId'
    | 'inputSchema'
    | 'outputSchema'
    | 'effect'
    | 'declaredFailures'
    | 'declaredExposure'
  >
>;

// F4: effect is required (no default) and exact; ids/schemas are required.
export const operationFixture: ToolOperationContract = {
  operationId: 'lookup.credit-rating',
  inputSchema: {},
  outputSchema: {},
  effect: 'idempotent',
};
// @ts-expect-error effect is required — there is no default effect class
export const operationWithoutEffect: ToolOperationContract = {
  operationId: 'lookup.credit-rating',
  inputSchema: {},
  outputSchema: {},
};
export const operationWithCaseMismatchedEffect: ToolOperationContract = {
  ...operationFixture,
  // @ts-expect-error case-mismatched effect literals are unrepresentable
  effect: 'IDEMPOTENT',
};

// F5: implementation/resource identity is unrepresentable on the declaration
// (excess-property checking on object literals).
export const declarationWithImplementation: ToolOperationsDeclaration = {
  operations: [operationFixture],
  providesCapabilities: [],
  // @ts-expect-error no implementation binding on the declaration
  implementation: 'tool-impl@9',
};
export const declarationWithProvider: ToolOperationsDeclaration = {
  operations: [operationFixture],
  providesCapabilities: [],
  // @ts-expect-error no provider routing identity on the declaration
  provider: 'openai',
};
export const declarationWithResources: ToolOperationsDeclaration = {
  operations: [operationFixture],
  providesCapabilities: [],
  // @ts-expect-error no resource requirement declaration on the declaration
  resources: { memory: '512Mi' },
};
export const declarationWithAssemblyDigest: ToolOperationsDeclaration = {
  operations: [operationFixture],
  providesCapabilities: [],
  // @ts-expect-error no assembly digest on the declaration
  assemblyDigest: 'sha256:abc',
};
export const declarationWithActivation: ToolOperationsDeclaration = {
  operations: [operationFixture],
  providesCapabilities: [],
  // @ts-expect-error no activation identity on the declaration
  activation: 'on-demand',
};
export const declarationWithEndpoint: ToolOperationsDeclaration = {
  operations: [operationFixture],
  providesCapabilities: [],
  // @ts-expect-error no endpoint identity on the declaration
  endpoint: 'https://internal.example',
};
export const declarationWithSecrets: ToolOperationsDeclaration = {
  operations: [operationFixture],
  providesCapabilities: [],
  // @ts-expect-error no secret/credential material on the declaration
  secrets: ['api-key'],
};
export const declarationWithBinding: ToolOperationsDeclaration = {
  operations: [operationFixture],
  providesCapabilities: [],
  // @ts-expect-error no binding identity on the declaration
  binding: 'pin-42',
};
export const declarationWithModule: ToolOperationsDeclaration = {
  operations: [operationFixture],
  providesCapabilities: [],
  // @ts-expect-error no module/package path on the declaration
  module: 'host/modules/tool.js',
};

// F6: implementation/resource identity is unrepresentable on an operation.
export const operationWithImplementation: ToolOperationContract = {
  ...operationFixture,
  // @ts-expect-error no implementation binding on an operation
  implementation: 'tool-impl@9',
};
export const operationWithEndpoint: ToolOperationContract = {
  ...operationFixture,
  // @ts-expect-error no endpoint identity on an operation
  endpoint: 'https://internal.example',
};
export const operationWithResources: ToolOperationContract = {
  ...operationFixture,
  // @ts-expect-error no resource requirement on an operation
  resources: { memory: '512Mi' },
};
export const operationWithProvider: ToolOperationContract = {
  ...operationFixture,
  // @ts-expect-error no provider routing identity on an operation
  provider: 'openai',
};
export const operationWithSecrets: ToolOperationContract = {
  ...operationFixture,
  // @ts-expect-error no secret material on an operation
  secrets: ['api-key'],
};

// F7: input/output schemas and declaredExposure only accept portable JSON
// material.
// @ts-expect-error functions are not portable JSON material
export const nonJsonInputSchema: ToolOperationContract['inputSchema'] = () => 1;
// @ts-expect-error bigints are not portable JSON material
export const nonJsonOutputSchema: ToolOperationContract['outputSchema'] = 1n;
// @ts-expect-error symbols are not portable JSON material
export const nonJsonExposure: ToolOperationContract['declaredExposure'] = Symbol('x');

// F8: providesCapabilities may be empty (provides nothing); refs stay exact
// {capabilityId, version} identity only.
export const providesNothingFixture: ToolOperationsDeclaration = {
  operations: [operationFixture],
  providesCapabilities: [],
};
export type ProvidesRefIsExactCapabilityRef = Expect<
  Equal<ToolOperationsDeclaration['providesCapabilities'], readonly CapabilityContractRef[]>
>;

// F9: the Tool validator consumes the existing ComponentEnvelope — no
// Tool-specific envelope interface and no second envelope family exist.
export type ValidatorConsumesExistingEnvelope = Expect<
  Equal<Parameters<typeof validateToolComponent>[0], ComponentEnvelope>
>;

// F10: the module's runtime surface is declaration material only — a class
// and a validator. No exported predicate/resolver/gate exists that could read
// declaredExposure and produce an authority decision.
export type ModuleValueExportsAreDeclarationMaterialOnly = Expect<
  Equal<keyof typeof toolComponentModule, 'ToolComponentContractError' | 'validateToolComponent'>
>;

// F11: the legacy tool surface is untouched — exact legacy shapes keep
// compiling and the new module neither replaces nor wraps them.
export const legacyToolFixture: HarnessTool<{ rating: string }, { tier: string }> = {
  input: { type: 'object' },
  output: { type: 'object' },
  effect: 'idempotent',
  async execute(input: { rating: string }, _ctx: ToolContext): Promise<{ tier: string }> {
    return { tier: input.rating };
  },
};
export type LegacyToolEffectUnchanged = Expect<
  Equal<ToolEffect, 'none' | 'idempotent' | 'non-idempotent'>
>;
export type LegacyToolContextShapeUnchanged = Expect<
  Equal<ToolContext['idempotencyKey'], string>
>;
