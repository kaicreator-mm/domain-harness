/**
 * #588 required adversarial matrix — descriptor-safe consumption across the
 * six v0.7 contract modules (issues #557 + #578).
 *
 * Each test maps to one row of the #588 required matrix:
 *   1. ComponentEnvelope accessor `kind`/`semanticBody` drift -> rejected before authority use;
 *   2. ToolOperationsDeclaration accessor `operations`/`providesCapabilities` -> rejected;
 *   3. DefinitionGraphEnvelope accessor `components`/`relations` -> rejected;
 *   4. ToolResourceRequirementsDeclaration accessor fields -> rejected;
 *   5. symbol-keyed / non-enumerable hidden props on closed-world contracts -> rejected;
 *   6. exotic/class prototypes -> rejected per declared posture (null-prototype accepted);
 *   7. validation-to-use TOCTOU: getter drift is impossible (zero hidden reads by construction);
 *   8. all existing valid plain-object fixtures remain green (canonical fixtures re-asserted here;
 *      the full pre-existing suites are the authoritative proof).
 *
 * Also pins the #557 canonical matrix upgrade: version strings previously
 * accepted by laxer seams (`1.x`, `x`, `1.`) are now typed floating-selector
 * rejections in every seam.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ComponentContractError,
  validateComponentEnvelope,
  type CapabilityContractRef,
  type ComponentEnvelope,
  type KindRef,
  type SemanticContractRef,
} from '../../src/contracts/component.js';
import {
  admitComponent,
  ComponentAdmissionError,
  type UnderstoodKindDeclaration,
} from '../../src/contracts/component-admission.js';
import {
  ToolComponentContractError,
  validateToolComponent,
} from '../../src/contracts/tool-component.js';
import {
  decideKindCompatibility,
  KindCompatibilityError,
} from '../../src/contracts/kind-compatibility.js';
import {
  ResourceRequirementContractError,
  validateToolResourceRequirements,
  type ToolResourceRequirementsDeclaration,
} from '../../src/contracts/resource-requirements.js';
import {
  DefinitionGraphContractError,
  validateDefinitionGraphEnvelope,
  type DefinitionGraphEnvelope,
  type DefinitionRelation,
} from '../../src/contracts/definition-graph.js';

function semanticEnvelope(overrides: Partial<ComponentEnvelope> = {}): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId: 'quote.eligibility.rule',
    kind: { kindId: 'decision.rule.v1', version: '1.2.0' },
    requiredSemanticContracts: [{ contractId: 'customer.tier.schema', version: '2.0.0' }],
    requiredCapabilities: [{ capabilityId: 'semantic-decision', version: '1.0.0' }],
    semanticBody: { threshold: 100, policy: { enabled: true } },
    ...overrides,
  };
}

function toolEnvelope(): ComponentEnvelope {
  return {
    family: 'tool',
    componentId: 'tool.search',
    kind: { kindId: 'tool.search.v1', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: {
      operations: [
        { operationId: 'search', inputSchema: {}, outputSchema: {}, effect: 'none' },
      ],
      providesCapabilities: [{ capabilityId: 'search', version: '1.0.0' }],
    },
  };
}

function understoodDeclaration(): UnderstoodKindDeclaration {
  return {
    kind: { kindId: 'decision.rule.v1', version: '1.2.0' },
    understoodSemanticContracts: [{ contractId: 'customer.tier.schema', version: '2.0.0' }],
    understoodCapabilities: [{ capabilityId: 'semantic-decision', version: '1.0.0' }],
    validateComponent() {},
  };
}

function graphEnvelope(overrides: Partial<DefinitionGraphEnvelope> = {}): DefinitionGraphEnvelope {
  return {
    graphId: 'quote.domain.graph',
    components: [semanticEnvelope()],
    relations: [
      {
        relationId: 'rel.self',
        relationKind: 'depends-on',
        sourceComponentId: 'quote.eligibility.rule',
        targetComponentId: 'quote.eligibility.rule',
      } satisfies DefinitionRelation,
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Matrix 1 — ComponentEnvelope accessor `kind` / `semanticBody` drift.
// ---------------------------------------------------------------------------

test('#588-M1: ComponentEnvelope accessor kind is rejected before any authority use (zero getter executions)', () => {
  let kindReads = 0;
  const envelope = semanticEnvelope() as Record<string, unknown>;
  delete envelope.kind;
  Object.defineProperty(envelope, 'kind', {
    enumerable: true,
    get(): KindRef {
      kindReads += 1;
      // Would-be drift: valid on the first read, poisoned afterwards.
      return kindReads === 1
        ? { kindId: 'decision.rule.v1', version: '1.2.0' }
        : { kindId: 'decision.rule.v1', version: 'latest' };
    },
  });

  assert.throws(
    () => validateComponentEnvelope(envelope as unknown as ComponentEnvelope),
    (error: unknown) =>
      error instanceof ComponentContractError && error.code === 'INVALID_COMPONENT_ENVELOPE',
  );
  assert.equal(kindReads, 0, 'descriptor validation must never execute the accessor');
});

test('#588-M1: ComponentEnvelope accessor semanticBody is rejected as an envelope descriptor violation', () => {
  let bodyReads = 0;
  const envelope = semanticEnvelope() as Record<string, unknown>;
  delete envelope.semanticBody;
  Object.defineProperty(envelope, 'semanticBody', {
    enumerable: true,
    get() {
      bodyReads += 1;
      return { threshold: 100 };
    },
  });

  assert.throws(
    () => validateComponentEnvelope(envelope as unknown as ComponentEnvelope),
    (error: unknown) =>
      error instanceof ComponentContractError && error.code === 'INVALID_COMPONENT_ENVELOPE',
  );
  assert.equal(bodyReads, 0);
});

// ---------------------------------------------------------------------------
// Matrix 2 — ToolOperationsDeclaration accessor operations/providesCapabilities.
// ---------------------------------------------------------------------------

test('#588-M2: ToolOperationsDeclaration accessor operations is rejected before Tool authority use', () => {
  let reads = 0;
  const declaration = {
    get operations() {
      reads += 1;
      return [{ operationId: 'search', inputSchema: {}, outputSchema: {}, effect: 'none' }];
    },
    providesCapabilities: [],
  };
  const envelope = toolEnvelope();
  (envelope as { semanticBody: unknown }).semanticBody = declaration;

  // Envelope-first composition: the hardened canonical-JSON seam rejects the
  // accessor inside `semanticBody` (INVALID_SEMANTIC_BODY) before any
  // Tool-specific authority use — without executing the getter.
  assert.throws(
    () => validateToolComponent(envelope),
    (error: unknown) =>
      error instanceof ComponentContractError && error.code === 'INVALID_SEMANTIC_BODY',
  );
  assert.equal(reads, 0);
});

test('#588-M2: ToolOperationsDeclaration accessor providesCapabilities is rejected', () => {
  let reads = 0;
  const declaration = {
    operations: [{ operationId: 'search', inputSchema: {}, outputSchema: {}, effect: 'none' }],
    get providesCapabilities(): CapabilityContractRef[] {
      reads += 1;
      return [{ capabilityId: 'search', version: '1.0.0' }];
    },
  };
  const envelope = toolEnvelope();
  (envelope as { semanticBody: unknown }).semanticBody = declaration;

  assert.throws(
    () => validateToolComponent(envelope),
    (error: unknown) =>
      error instanceof ComponentContractError && error.code === 'INVALID_SEMANTIC_BODY',
  );
  assert.equal(reads, 0);
});

// ---------------------------------------------------------------------------
// Matrix 3 — DefinitionGraphEnvelope accessor components/relations.
// ---------------------------------------------------------------------------

test('#588-M3: DefinitionGraphEnvelope accessor components/relations are rejected before graph authority use', () => {
  for (const field of ['components', 'relations'] as const) {
    let reads = 0;
    const graph = graphEnvelope() as Record<string, unknown>;
    delete graph[field];
    Object.defineProperty(graph, field, {
      enumerable: true,
      get() {
        reads += 1;
        return [];
      },
    });
    assert.throws(
      () => validateDefinitionGraphEnvelope(graph as unknown as DefinitionGraphEnvelope),
      (error: unknown) =>
        error instanceof DefinitionGraphContractError &&
        error.code === 'INVALID_GRAPH_ENVELOPE',
    );
    assert.equal(reads, 0, `${field} accessor must never execute`);
  }
});

test('#588-M3: an accessor-backed relation entry is a typed relation rejection', () => {
  let reads = 0;
  const relation: Record<string, unknown> = {};
  for (const [key, value] of Object.entries({
    relationId: 'rel.self',
    relationKind: 'depends-on',
    sourceComponentId: 'quote.eligibility.rule',
    targetComponentId: 'quote.eligibility.rule',
  })) {
    Object.defineProperty(relation, key, {
      enumerable: true,
      get() {
        reads += 1;
        return value;
      },
    });
  }
  assert.throws(
    () => validateDefinitionGraphEnvelope(graphEnvelope({ relations: [relation as DefinitionRelation] })),
    (error: unknown) =>
      error instanceof DefinitionGraphContractError && error.code === 'INVALID_RELATION',
  );
  assert.equal(reads, 0);
});

// ---------------------------------------------------------------------------
// Matrix 4 — ToolResourceRequirementsDeclaration accessor fields.
// ---------------------------------------------------------------------------

test('#588-M4: accessor-backed declaration fields are rejected before resource authority use', () => {
  let componentIdReads = 0;
  let requirementsReads = 0;
  const declaration: Record<string, unknown> = {};
  Object.defineProperty(declaration, 'componentId', {
    enumerable: true,
    get() {
      componentIdReads += 1;
      return 'tool.search';
    },
  });
  Object.defineProperty(declaration, 'requirements', {
    enumerable: true,
    get() {
      requirementsReads += 1;
      return [];
    },
  });

  assert.throws(
    () =>
      validateToolResourceRequirements(
        toolEnvelope(),
        declaration as unknown as ToolResourceRequirementsDeclaration,
      ),
    (error: unknown) =>
      error instanceof ResourceRequirementContractError &&
      error.code === 'INVALID_RESOURCE_REQUIREMENTS_DECLARATION',
  );
  assert.equal(componentIdReads, 0);
  assert.equal(requirementsReads, 0);
});

test('#588-M4: an accessor-backed requirement entry is a typed requirement rejection', () => {
  let reads = 0;
  const requirement: Record<string, unknown> = {};
  for (const [key, value] of Object.entries({
    resourceKey: 'runtime.postgres.cluster',
    required: true,
  })) {
    Object.defineProperty(requirement, key, {
      enumerable: true,
      get() {
        reads += 1;
        return value;
      },
    });
  }
  assert.throws(
    () =>
      validateToolResourceRequirements(toolEnvelope(), {
        componentId: 'tool.search',
        requirements: [requirement as ToolResourceRequirementsDeclaration['requirements'][number]],
      }),
    (error: unknown) =>
      error instanceof ResourceRequirementContractError &&
      error.code === 'INVALID_RESOURCE_REQUIREMENT',
  );
  assert.equal(reads, 0);
});

// ---------------------------------------------------------------------------
// Matrix 5 — symbol-keyed / non-enumerable hidden props on closed-world contracts.
// ---------------------------------------------------------------------------

test('#588-M5: symbol-keyed and non-enumerable hidden props are rejected on closed-world contracts', () => {
  const symbolKeyed = semanticEnvelope() as Record<string, unknown>;
  Object.defineProperty(symbolKeyed, Symbol('hiddenAuthority'), {
    value: 'smuggled',
    enumerable: true,
  });
  assert.throws(
    () => validateComponentEnvelope(symbolKeyed as unknown as ComponentEnvelope),
    (error: unknown) =>
      error instanceof ComponentContractError && error.code === 'INVALID_COMPONENT_ENVELOPE',
  );

  const nonEnumerable = semanticEnvelope() as Record<string, unknown>;
  Object.defineProperty(nonEnumerable, 'hiddenAuthority', {
    value: 'smuggled',
    enumerable: false,
  });
  assert.throws(
    () => validateComponentEnvelope(nonEnumerable as unknown as ComponentEnvelope),
    (error: unknown) =>
      error instanceof ComponentContractError && error.code === 'INVALID_COMPONENT_ENVELOPE',
  );

  // Hidden material on the caller-supplied supported set is equally rejected.
  const supported: unknown[] = [{ kindId: 'decision.rule.v1', version: '1.2.0' }];
  Object.defineProperty(supported, Symbol('hidden'), { value: 1, enumerable: true });
  assert.throws(
    () =>
      decideKindCompatibility(
        { kindId: 'decision.rule.v1', version: '1.2.0' },
        supported as readonly KindRef[],
      ),
    (error: unknown) =>
      error instanceof KindCompatibilityError &&
      error.code === 'INVALID_COMPATIBILITY_INPUT',
  );
});

// ---------------------------------------------------------------------------
// Matrix 6 — exotic/class prototypes rejected; null-prototype accepted.
// ---------------------------------------------------------------------------

test('#588-M6: class-prototype contract records are rejected per the declared posture', () => {
  class ClassEnvelope {
    family = 'semantic';
    componentId = 'quote.eligibility.rule';
    kind = { kindId: 'decision.rule.v1', version: '1.2.0' };
    requiredSemanticContracts: SemanticContractRef[] = [
      { contractId: 'customer.tier.schema', version: '2.0.0' },
    ];
    requiredCapabilities: CapabilityContractRef[] = [
      { capabilityId: 'semantic-decision', version: '1.0.0' },
    ];
    semanticBody = { threshold: 100 };
  }
  assert.throws(
    () => validateComponentEnvelope(new ClassEnvelope() as unknown as ComponentEnvelope),
    (error: unknown) =>
      error instanceof ComponentContractError && error.code === 'INVALID_COMPONENT_ENVELOPE',
  );

  class ClassKindRef {
    kindId = 'decision.rule.v1';
    version = '1.2.0';
  }
  assert.throws(
    () =>
      decideKindCompatibility(new ClassKindRef() as unknown as KindRef, [
        { kindId: 'decision.rule.v1', version: '1.2.0' },
      ]),
    (error: unknown) =>
      error instanceof KindCompatibilityError && error.code === 'INVALID_COMPATIBILITY_INPUT',
  );

  const declaration = understoodDeclaration();
  (declaration as Record<string, unknown>).kind = new ClassKindRef();
  assert.throws(
    () => admitComponent(semanticEnvelope(), [declaration]),
    (error: unknown) =>
      error instanceof ComponentAdmissionError &&
      error.code === 'INVALID_UNDERSTOOD_KIND_SET',
  );
});

test('#588-M6: intended null-prototype records are accepted and stay digest-valid', () => {
  const nullProtoEnvelope = Object.assign(Object.create(null), {
    family: 'semantic',
    componentId: 'quote.eligibility.rule',
    kind: Object.assign(Object.create(null), {
      kindId: 'decision.rule.v1',
      version: '1.2.0',
    }),
    requiredSemanticContracts: [
      Object.assign(Object.create(null), { contractId: 'customer.tier.schema', version: '2.0.0' }),
    ],
    requiredCapabilities: [
      Object.assign(Object.create(null), { capabilityId: 'semantic-decision', version: '1.0.0' }),
    ],
    semanticBody: { threshold: 100 },
  }) as unknown as ComponentEnvelope;
  validateComponentEnvelope(nullProtoEnvelope);

  const result = decideKindCompatibility(
    Object.assign(Object.create(null), {
      kindId: 'decision.rule.v1',
      version: '1.2.0',
    }) as KindRef,
    [
      Object.assign(Object.create(null), {
        kindId: 'decision.rule.v1',
        version: '1.2.0',
      }) as KindRef,
    ],
  );
  assert.equal(result.status, 'SUPPORTED');
});

// ---------------------------------------------------------------------------
// Matrix 7 — validation-to-use TOCTOU: impossible by construction.
// ---------------------------------------------------------------------------

test('#588-M7: a getter that would drift between validation and use is never read, so drift cannot occur', () => {
  // The admission seam reads the understood set only through descriptor-safe
  // snapshots; a hostile getter on the declaration kind cannot influence
  // either validation or the admission decision.
  let reads = 0;
  const declaration = understoodDeclaration() as Record<string, unknown>;
  delete declaration.kind;
  Object.defineProperty(declaration, 'kind', {
    enumerable: true,
    get(): KindRef {
      reads += 1;
      return { kindId: 'decision.rule.v1', version: reads === 1 ? '1.2.0' : '9.9.9' };
    },
  });
  assert.throws(
    () => admitComponent(semanticEnvelope(), [declaration as unknown as UnderstoodKindDeclaration]),
    (error: unknown) =>
      error instanceof ComponentAdmissionError &&
      error.code === 'INVALID_UNDERSTOOD_KIND_SET',
  );
  assert.equal(reads, 0, 'zero reads: no validation-to-use window exists');
});

test('#588-M7: mutating the caller graph after validation cannot tear an in-flight digest decision seam', () => {
  // The validator never retains caller aliases: relation evidence for the
  // dangling/duplicate/conflict phases comes from validated snapshots.
  const relation = {
    relationId: 'rel.self',
    relationKind: 'depends-on',
    sourceComponentId: 'quote.eligibility.rule',
    targetComponentId: 'quote.eligibility.rule',
  };
  const graph = graphEnvelope({ relations: [relation] });
  validateDefinitionGraphEnvelope(graph);
  // Post-validation caller mutation does not retroactively affect the
  // already-completed validation (and a re-validation observes the mutation
  // deterministically — never a torn hybrid).
  relation.targetComponentId = 'not.bound.anymore';
  assert.throws(
    () => validateDefinitionGraphEnvelope(graph),
    (error: unknown) =>
      error instanceof DefinitionGraphContractError &&
      error.code === 'DANGLING_COMPONENT_REF',
  );
});

// ---------------------------------------------------------------------------
// Matrix 8 — canonical valid fixtures remain green (existing suites are the
// authoritative proof; re-asserted here as the matrix requires).
// ---------------------------------------------------------------------------

test('#588-M8: canonical plain-object fixtures validate across all six seams', () => {
  const envelope = semanticEnvelope();
  validateComponentEnvelope(envelope);
  validateToolComponent(toolEnvelope());
  assert.equal(
    admitComponent(envelope, [understoodDeclaration()]).status,
    'ADMITTED',
  );
  assert.equal(
    decideKindCompatibility(
      { kindId: 'decision.rule.v1', version: '1.2.0' },
      [{ kindId: 'decision.rule.v1', version: '1.2.0' }],
    ).status,
    'SUPPORTED',
  );
  validateDefinitionGraphEnvelope(graphEnvelope());
  validateToolResourceRequirements(toolEnvelope(), {
    componentId: 'tool.search',
    requirements: [
      {
        resourceKey: 'runtime.postgres.cluster',
        contract: { contractId: 'postgres.cluster.contract', version: '14.2.0' },
        required: true,
      },
    ],
  });
});

// ---------------------------------------------------------------------------
// #557 canonical matrix upgrade — previously-lax seams now reject x-range
// and partial versions with the typed floating-selector failure.
// ---------------------------------------------------------------------------

test('#557-M9: x-range/partial versions are now rejected in every previously-lax seam', () => {
  for (const version of ['1.x', 'x', '1.', '1.X']) {
    assert.throws(
      () =>
        validateComponentEnvelope(
          semanticEnvelope({ kind: { kindId: 'decision.rule.v1', version } }),
        ),
      (error: unknown) =>
        error instanceof ComponentContractError &&
        error.code === 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN',
      `component.ts must reject version ${version}`,
    );

    const tool = toolEnvelope();
    (tool.semanticBody as { providesCapabilities: CapabilityContractRef[] }).providesCapabilities =
      [{ capabilityId: 'search', version }];
    assert.throws(
      () => validateToolComponent(tool),
      (error: unknown) =>
        error instanceof ToolComponentContractError &&
        error.code === 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN',
      `tool-component.ts must reject version ${version}`,
    );

    assert.throws(
      () =>
        validateToolResourceRequirements(toolEnvelope(), {
          componentId: 'tool.search',
          requirements: [
            {
              resourceKey: 'runtime.postgres.cluster',
              contract: { contractId: 'postgres.cluster.contract', version },
              required: true,
            },
          ],
        }),
      (error: unknown) =>
        error instanceof ResourceRequirementContractError &&
        error.code === 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN',
      `resource-requirements.ts must reject version ${version}`,
    );
  }
});
