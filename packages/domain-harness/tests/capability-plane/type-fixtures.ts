/**
 * T003D compile-time type fixtures (issue #634).
 *
 * Proof-only fixtures: they are typechecked by
 * `tsc -p tsconfig.test.json --noEmit` but are never executed. `Expect`/`Equal`
 * force compile failures when the capability-plane contract regresses, and
 * `@ts-expect-error` blocks prove negative boundaries (a third provenance
 * plane, a priority/order escape hatch, provider identity on Host-plane
 * evidence, drifting error taxonomy) stay unrepresentable.
 */
import type {
  CapabilityContractRef,
  ComponentId,
} from '../../src/contracts/component.js';
import type { DefinitionGraphEnvelope } from '../../src/contracts/definition-graph.js';
import {
  CapabilityPlaneContractError,
  resolveCapabilityPlane,
  type CapabilityPlaneErrorCode,
  type CapabilityPlaneResolution,
  type CapabilityProvenancePlane,
  type DomainCapabilityPlaneProvision,
  type HostCapabilityPlaneProvision,
} from '../../src/contracts/capability-plane.js';
import type { CapabilityProviderSelection } from '../../src/contracts/capability-provision.js';
import type { Sha256Port } from '../../src/contracts/identity.js';

type Expect<T extends true> = T;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

declare const graph: DefinitionGraphEnvelope;
declare const sha256: Sha256Port;
declare const ref: CapabilityContractRef;
void sha256;

// F1: the provenance plane is exactly the two frozen PACK-A planes — no
// third ontology plane, no Component-family conflation.
export type PlaneIsFrozenBinary = Expect<Equal<CapabilityProvenancePlane, 'domain' | 'host'>>;
// @ts-expect-error a third provenance plane is unrepresentable
export const thirdPlaneFixture: CapabilityProvenancePlane = 'assembly';

// F2: the failure taxonomy is exactly the two T003D codes — collision and
// plane-input validation; missing/ambiguous stay owned by T003B.
export type FailureTaxonomyIsFrozen = Expect<
  Equal<CapabilityPlaneErrorCode, 'CAPABILITY_PLANE_COLLISION' | 'INVALID_PLANE_INPUT'>
>;
export const typedErrorFixture = new CapabilityPlaneContractError(
  'CAPABILITY_PLANE_COLLISION',
  'collision',
  ['tool.a'],
);
// @ts-expect-error codes outside the frozen taxonomy are unrepresentable
export const unknownCodeFixture = new CapabilityPlaneContractError('OTHER_CODE', 'nope');

// F3: Domain-plane provision carries exactly the plane tag plus the
// unchanged T003B selection evidence.
export type DomainProvisionHasOnlyNormativeDimensions = Expect<
  Equal<keyof DomainCapabilityPlaneProvision, 'plane' | 'selection'>
>;
export type DomainProvisionSelectionIsT003BEvidence = Expect<
  Equal<DomainCapabilityPlaneProvision['selection'], CapabilityProviderSelection>
>;

// F4: Host-plane provision carries exactly the plane tag, graph identity and
// the two exact frozen refs — no provider Component, handle, or routing
// identity is representable.
export type HostProvisionHasOnlyNormativeDimensions = Expect<
  Equal<
    keyof HostCapabilityPlaneProvision,
    'plane' | 'graphId' | 'requiredCapability' | 'hostProvidedCapability'
  >
>;
export type HostProvisionRefsAreExact = Expect<
  Equal<
    HostCapabilityPlaneProvision['hostProvidedCapability'],
    CapabilityContractRef
  >
>;
declare const resolution: CapabilityPlaneResolution;
// @ts-expect-error Host-plane evidence must never name a provider Component
export const hostProviderForbidden: undefined = resolution.provider;
// @ts-expect-error Host-plane evidence must never name an implementation handle
export const hostHandleForbidden: undefined = resolution.implementationHandle;
void resolution;

// F5: the resolver takes exactly four positional parameters — graph, host
// declarations, required ref, optional consumer — so no priority/default
// argument can ever order one plane above the other.
export type ResolverParamsAreFrozen = Expect<
  Equal<
    Parameters<typeof resolveCapabilityPlane>,
    [
      graph: DefinitionGraphEnvelope,
      hostCapabilities: readonly CapabilityContractRef[],
      requiredCapability: CapabilityContractRef,
      consumerComponentId?: ComponentId | undefined,
    ]
  >
>;
// @ts-expect-error a fifth priority/override parameter is unrepresentable
resolveCapabilityPlane(graph, [ref], ref, 'consumer.a', { prefer: 'domain' });
