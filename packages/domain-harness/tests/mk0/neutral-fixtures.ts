/**
 * MK0 neutral fixtures (#586 Microkernel verification campaign).
 *
 * Entirely test-side material: no Workflow/XState/SQLite/AI/HTTP, no legacy
 * registry, no host resource. Every fixture is expressible through the public
 * v0.7 foundation contracts alone — if admitting/digesting/selecting with
 * these fixtures ever required editing `src/contracts/**`, that would falsify
 * MK0-01/MK0-02 (`MICROKERNEL_SOURCE_DIFF=0`).
 */
import { createHash } from 'node:crypto';
import type {
  CapabilityContractRef,
  ComponentEnvelope,
  KindRef,
  SemanticContractRef,
} from '../../src/contracts/component.js';
import type { DefinitionGraphEnvelope, DefinitionRelation } from '../../src/contracts/definition-graph.js';
import type { Sha256Port } from '../../src/contracts/identity.js';
import type {
  ToolOperationContract,
  ToolOperationsDeclaration,
} from '../../src/contracts/tool-component.js';
import type { UnderstoodKindDeclaration, UnderstoodKindSet } from '../../src/contracts/component-admission.js';

/** The neutral Semantic Kind under falsification. */
export const TEST_SEMANTIC_KIND: KindRef = Object.freeze({
  kindId: 'mk0.test-semantic-kind',
  version: '1.0.0',
});

/** The neutral Tool Kind under falsification. */
export const TEST_TOOL_KIND: KindRef = Object.freeze({
  kindId: 'mk0.test-tool-kind',
  version: '1.0.0',
});

/** The neutral Capability contract: provided by the Tool, required by the Semantic Component. */
export const TEST_CAPABILITY: CapabilityContractRef = Object.freeze({
  capabilityId: 'mk0.test-capability',
  version: '1.0.0',
});

/** A second neutral Capability used to exercise unordered required sets. */
export const TEST_SECOND_CAPABILITY: CapabilityContractRef = Object.freeze({
  capabilityId: 'mk0.test-capability-two',
  version: '1.0.0',
});

/** The neutral behaviorally material semantic contract of TestSemanticKind. */
export const TEST_SEMANTIC_CONTRACT: SemanticContractRef = Object.freeze({
  contractId: 'mk0.test-semantic-contract',
  version: '1.0.0',
});

/** A second neutral semantic contract used to exercise unordered required sets. */
export const TEST_SECOND_SEMANTIC_CONTRACT: SemanticContractRef = Object.freeze({
  contractId: 'mk0.test-semantic-contract-two',
  version: '1.0.0',
});

/** Neutral closed-world validator for TestSemanticKind bodies (fixture-side). */
export function validateTestSemanticKindBody(envelope: ComponentEnvelope): void {
  const body = envelope.semanticBody as { fixtureMarker?: unknown; notes?: unknown };
  if (
    typeof body !== 'object' ||
    body === null ||
    Array.isArray(body) ||
    typeof body.fixtureMarker !== 'string' ||
    body.fixtureMarker.length === 0
  ) {
    throw new Error('TestSemanticKind closed-world violation: semanticBody.fixtureMarker must be a non-empty string');
  }
}

/** Neutral closed-world validator for TestToolKind bodies (fixture-side). */
export function validateTestToolKindBody(envelope: ComponentEnvelope): void {
  const declaration = envelope.semanticBody as unknown as ToolOperationsDeclaration;
  if (!Array.isArray(declaration?.operations) || declaration.operations.length < 1) {
    throw new Error('TestToolKind closed-world violation: at least one operation is required');
  }
}

/** The complete neutral must-understand set: exactly the two test Kinds. */
export function testUnderstoodKinds(): UnderstoodKindSet {
  const declarations: UnderstoodKindDeclaration[] = [
    {
      kind: { ...TEST_SEMANTIC_KIND },
      understoodSemanticContracts: [{ ...TEST_SEMANTIC_CONTRACT }, { ...TEST_SECOND_SEMANTIC_CONTRACT }],
      understoodCapabilities: [{ ...TEST_CAPABILITY }, { ...TEST_SECOND_CAPABILITY }],
      validateComponent: validateTestSemanticKindBody,
    },
    {
      kind: { ...TEST_TOOL_KIND },
      understoodSemanticContracts: [],
      understoodCapabilities: [{ ...TEST_CAPABILITY }, { ...TEST_SECOND_CAPABILITY }],
      validateComponent: validateTestToolKindBody,
    },
  ];
  return declarations;
}

/** Neutral Semantic Component: requires TestCapability, provided by nobody in-core. */
export function testSemanticComponent(
  overrides?: {
    componentId?: string;
    requiredCapabilities?: readonly CapabilityContractRef[];
    requiredSemanticContracts?: readonly SemanticContractRef[];
  },
): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId: overrides?.componentId ?? 'mk0.test.semantic-component',
    kind: { ...TEST_SEMANTIC_KIND },
    requiredSemanticContracts: overrides?.requiredSemanticContracts ?? [{ ...TEST_SEMANTIC_CONTRACT }],
    requiredCapabilities: overrides?.requiredCapabilities ?? [{ ...TEST_CAPABILITY }],
    semanticBody: { fixtureMarker: 'mk0-neutral', notes: ['neutral', 'fixture'] },
  };
}

/** Neutral Tool Component: provides TestCapability through one echo operation. */
export function testToolComponent(
  overrides?: {
    componentId?: string;
    providesCapabilities?: readonly CapabilityContractRef[];
  },
): ComponentEnvelope {
  const echoOperation: ToolOperationContract = {
    operationId: 'mk0.test.echo',
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    effect: 'none',
  };
  const declaration: ToolOperationsDeclaration = {
    operations: [echoOperation],
    providesCapabilities: overrides?.providesCapabilities ?? [{ ...TEST_CAPABILITY }],
  };
  return {
    family: 'tool',
    componentId: overrides?.componentId ?? 'mk0.test.tool-component',
    kind: { ...TEST_TOOL_KIND },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: declaration as unknown as ComponentEnvelope['semanticBody'],
  };
}

/** The neutral Definition graph binding both Components with one typed relation. */
export function testGraph(
  overrides?: {
    graphId?: string;
    components?: readonly ComponentEnvelope[];
    relations?: readonly DefinitionRelation[];
  },
): DefinitionGraphEnvelope {
  return {
    graphId: overrides?.graphId ?? 'mk0.test.graph',
    components: overrides?.components ?? [testSemanticComponent(), testToolComponent()],
    relations:
      overrides?.relations ??
      [
        {
          relationId: 'mk0.test.relation',
          relationKind: 'mk0.test.requires-capability',
          sourceComponentId: 'mk0.test.semantic-component',
          targetComponentId: 'mk0.test.tool-component',
        },
      ],
  };
}

/** Deterministic host-neutral SHA-256 port (same seam contract as production hosts). */
export const sha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

/**
 * Deferred Sha256Port for MK0-10: the digest promise stays pending until the
 * test explicitly resolves it, so caller mutation can be interleaved between
 * the synchronous snapshot and the await resolution.
 */
export class DeferredSha256Port implements Sha256Port {
  private resolveFn!: (digest: string) => void;
  readonly whenDigestRequested: Promise<string>;
  private requested = false;

  constructor() {
    this.whenDigestRequested = new Promise<string>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  async digestUtf8(value: string): Promise<string> {
    this.requested = true;
    const input = value;
    await this.whenDigestRequested;
    return createHash('sha256').update(input, 'utf8').digest('hex');
  }

  release(): void {
    if (this.requested) {
      this.resolveFn('');
    }
  }
}
