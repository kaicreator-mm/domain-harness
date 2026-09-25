import { createHash } from 'node:crypto';
import type { CandidateValidationResult } from '../../src/candidate/contracts.js';
import { computeCanonicalJsonDigest, type Sha256Port } from '../../src/contracts/identity.js';
import type { JsonValue } from '../../src/contracts/json.js';
import type { GovernanceBaselineAuthorityBinding, GovernanceBaselineIdentity } from '../../src/governance/contracts.js';
import type { GovernanceExecutionPin } from '../../src/governance/execution-binding.js';
import {
  MemoryPromotedArtifactStore,
  PromotedArtifactRegistry,
  type PromotedArtifactBody,
} from '../../src/promoted-artifact/index.js';
import {
  createRegistryPromotedChildArtifactPort,
  MemoryDynamicChildPinStore,
  PromotedChildRuntime,
  type DynamicChildInvocationSlot,
  type PromotedChildArtifactPort,
  type PromotedChildInvokingContext,
} from '../../src/promoted-child/index.js';
import type { CompiledArtifactIdentity, CompiledArtifactKind } from '../../src/contracts/domain-data.js';

export const sha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

export const baseline: GovernanceBaselineIdentity = {
  domainId: 'orders',
  governanceId: 'orders-governance',
  schemaVersion: 'governance-v1',
  version: 'B1',
  contentDigest: 'governance-content-b1',
};

export function authority(overrides: Partial<GovernanceBaselineAuthorityBinding> = {}): GovernanceBaselineAuthorityBinding {
  return {
    domainId: 'orders',
    packageId: 'pkg-orders-b1',
    domainIntelligenceContentDigest: 'cdi-orders-b1',
    governanceBaseline: { ...baseline },
    ...overrides,
  };
}

export function ref<K extends CompiledArtifactKind>(kind: K, artifactId: string, contentDigest = `digest-${artifactId}`) {
  return { kind, artifactId, contentDigest };
}

export interface EnvelopeOverrides {
  readonly bodyNodes?: readonly unknown[];
  readonly control?: unknown;
  readonly tools?: readonly unknown[];
  readonly events?: readonly string[];
  readonly mutation?: unknown;
  readonly applicability?: readonly unknown[];
  readonly references?: readonly unknown[];
  readonly hardInvariants?: readonly unknown[];
  readonly io?: unknown;
  readonly candidateKind?: string;
}

export function makeEnvelope(overrides: EnvelopeOverrides = {}): JsonValue {
  return {
    schemaVersion: 'candidate-envelope-v1',
    candidateKind: overrides.candidateKind ?? 'workflow',
    candidateId: 'candidate:quote-review',
    bodyContract: ref('output-schema', 'schema:quote-decision'),
    body: {
      schemaVersion: 'promoted-child-workflow/v1',
      nodes: overrides.bodyNodes ?? [
        { node: 'fetch', step: { kind: 'query', tool: ref('tool', 'tool:price'), input: { kind: 'input', path: 'sku' } } },
        { node: 'notify', step: { kind: 'emit-event', eventType: 'QUOTE_PREPARED', payload: { kind: 'step-output', node: 'fetch', path: 'price' } } },
        { node: 'finish', step: { kind: 'terminal-output', output: { kind: 'step-output', node: 'fetch', path: 'quote' } } },
      ],
    },
    io: overrides.io ?? {
      inputs: [ref('output-schema', 'schema:quote-request')],
      outputs: [ref('output-schema', 'schema:quote-decision')],
    },
    capabilities: ['query'],
    tools: overrides.tools ?? [{ ...ref('tool', 'tool:price'), capability: 'query' }],
    events: overrides.events ?? ['QUOTE_PREPARED'],
    mutation: overrides.mutation ?? { kind: 'none' },
    references: overrides.references ?? [ref('knowledge', 'knowledge:pricing')],
    applicability: overrides.applicability ?? [ref('knowledge', 'ctx:b2b-quote')],
    hardInvariants: overrides.hardInvariants ?? [ref('rule', 'inv:positive-price')],
    control: overrides.control ?? {
      startNode: 'fetch',
      nodes: ['fetch', 'notify', 'finish'],
      edges: [
        { from: 'fetch', to: 'notify' },
        { from: 'notify', to: 'finish' },
      ],
      maxSteps: 5,
    },
  } as unknown as JsonValue;
}

export async function validationFor(
  targetAuthority: GovernanceBaselineAuthorityBinding,
  material: JsonValue,
): Promise<CandidateValidationResult> {
  return {
    ok: true,
    identity: {
      candidateKind: 'workflow',
      candidateId: 'candidate:quote-review',
      candidateContentDigest: await computeCanonicalJsonDigest(material, sha256),
      validatorContractVersion: 'candidate-validator-v1',
      governanceBaseline: { ...targetAuthority.governanceBaseline },
    },
    grantsExecutionPermission: false,
  };
}

export interface PromotedFixture {
  readonly store: MemoryPromotedArtifactStore;
  readonly registry: PromotedArtifactRegistry;
  readonly port: PromotedChildArtifactPort;
  readonly pinStore: MemoryDynamicChildPinStore;
  readonly runtime: PromotedChildRuntime;
  readonly body: PromotedArtifactBody;
  readonly semanticMaterial: JsonValue;
}

export async function promotedFixture(
  overrides: EnvelopeOverrides = {},
  authorityOverrides: Partial<GovernanceBaselineAuthorityBinding> = {},
): Promise<PromotedFixture> {
  const semanticMaterial = makeEnvelope(overrides);
  const targetAuthority = authority(authorityOverrides);
  const store = new MemoryPromotedArtifactStore();
  const registry = new PromotedArtifactRegistry(store, sha256);
  const result = await registry.promote({
    artifactId: 'subworkflow:quote-review',
    version: '1.0.0',
    validation: await validationFor(targetAuthority, semanticMaterial),
    authorityBinding: targetAuthority,
    semanticMaterial,
    promotion: {
      recordId: 'promotion:quote-review:1',
      authorityRef: 'audit://promotion/quote-review/1',
      recordedAt: '2026-09-21T03:00:00.000Z',
    },
  });
  const port = createRegistryPromotedChildArtifactPort(registry);
  const pinStore = new MemoryDynamicChildPinStore();
  const runtime = new PromotedChildRuntime(port, pinStore, sha256);
  return { store, registry, port, pinStore, runtime, body: result.body, semanticMaterial };
}

export function allAvailableArtifacts(): readonly CompiledArtifactIdentity[] {
  return [
    ref('output-schema', 'schema:quote-request'),
    ref('output-schema', 'schema:quote-decision'),
    { kind: 'tool', artifactId: 'tool:price', contentDigest: 'digest-tool:price' },
    ref('knowledge', 'knowledge:pricing'),
    ref('rule', 'inv:positive-price'),
  ] as readonly CompiledArtifactIdentity[];
}

export function invokingContext(overrides: Partial<PromotedChildInvokingContext> = {}): PromotedChildInvokingContext {
  return {
    target: { workflowId: 'order-quote', instanceKey: 'instance:42' },
    packageId: 'pkg-orders-b1',
    domainIntelligenceContentDigest: 'cdi-orders-b1',
    governanceBaseline: {
      domainId: baseline.domainId,
      governanceId: baseline.governanceId,
      schemaVersion: baseline.schemaVersion,
      contentDigest: baseline.contentDigest,
    },
    availableArtifacts: allAvailableArtifacts(),
    applicabilityFacts: [ref('knowledge', 'ctx:b2b-quote')] as readonly CompiledArtifactIdentity[],
    ...overrides,
  };
}

export function makeSlot(ordinal = 1): DynamicChildInvocationSlot {
  return {
    target: { workflowId: 'order-quote', instanceKey: 'instance:42' },
    parentActorId: 'decision:quote',
    childActorId: `child:quote-review:${ordinal}`,
    invocationOrdinal: ordinal,
  };
}

export function governancePin(overrides: Partial<GovernanceExecutionPin> = {}): GovernanceExecutionPin {
  return {
    domainId: 'orders',
    packageId: 'pkg-orders-b1',
    domainIntelligenceContentDigest: 'cdi-orders-b1',
    governanceBaseline: { ...baseline },
    workflowTarget: 'order-quote',
    workflowInstanceId: 'instance:42',
    bindingDigest: 'binding-digest-1',
    ...overrides,
  };
}

export const exactSelector = (fixture: PromotedFixture) => ({
  kind: 'exact-digest' as const,
  artifact: fixture.body.identity,
});
