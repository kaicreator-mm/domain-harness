import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateComponentEnvelope,
  type CapabilityContractRef,
  type ComponentEnvelope,
} from '../../src/contracts/component.js';
import {
  DefinitionGraphContractError,
  validateDefinitionGraphEnvelope,
  type DefinitionGraphEnvelope,
} from '../../src/contracts/definition-graph.js';
import type { JsonValue } from '../../src/contracts/json.js';
import {
  ToolComponentContractError,
  validateToolComponent,
  type ToolOperationContract,
  type ToolOperationsDeclaration,
} from '../../src/contracts/tool-component.js';
import {
  CapabilityProvisionContractError,
  selectCapabilityProvider,
} from '../../src/contracts/capability-provision.js';
import * as capabilityProvisionModule from '../../src/contracts/capability-provision.js';

const CREDIT_RATING: CapabilityContractRef = {
  capabilityId: 'credit-rating-lookup',
  version: '1.1.0',
};
const AUDIT_TRAIL: CapabilityContractRef = {
  capabilityId: 'audit.trail.emit',
  version: '0.3.0',
};

function operation(): ToolOperationContract {
  return {
    operationId: 'lookup.credit-rating',
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    effect: 'idempotent',
  };
}

function declaration(provides: readonly CapabilityContractRef[]): ToolOperationsDeclaration {
  return { operations: [operation()], providesCapabilities: provides };
}

function toolComponent(overrides?: {
  componentId?: string;
  provides?: readonly CapabilityContractRef[];
  requires?: readonly CapabilityContractRef[];
  semanticBody?: JsonValue;
}): ComponentEnvelope {
  return {
    family: 'tool',
    componentId: overrides?.componentId ?? 'catalog.credit-rating.tool',
    kind: { kindId: 'tool.credit-rating.v1', version: '2.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: overrides?.requires ?? [],
    semanticBody:
      overrides?.semanticBody ??
      (declaration(overrides?.provides ?? [CREDIT_RATING]) as unknown as JsonValue),
  };
}

function semanticComponent(overrides?: {
  componentId?: string;
  requires?: readonly CapabilityContractRef[];
  semanticBody?: JsonValue;
}): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId: overrides?.componentId ?? 'quote.eligibility.rule',
    kind: { kindId: 'decision.rule.v1', version: '1.2.0' },
    requiredSemanticContracts: [{ contractId: 'customer.tier.schema', version: '2.0.0' }],
    requiredCapabilities: overrides?.requires ?? [],
    semanticBody:
      overrides?.semanticBody ?? { threshold: 100, policy: { tier: 'gold', enabled: true } },
  };
}

function graphOf(
  components: readonly ComponentEnvelope[],
  relations: DefinitionGraphEnvelope['relations'] = [],
): DefinitionGraphEnvelope {
  return {
    graphId: 'provision.test.graph',
    components: [...components],
    relations,
  };
}

function permutations<T>(values: readonly T[]): T[][] {
  if (values.length <= 1) return [[...values]];
  const out: T[][] = [];
  for (const [index, value] of values.entries()) {
    const rest = [...values.slice(0, index), ...values.slice(index + 1)];
    for (const tail of permutations(rest)) {
      out.push([value, ...tail]);
    }
  }
  return out;
}

function captureError(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return assert.fail('expected the selection to fail closed');
}

function expectProvisionFailure(
  run: () => unknown,
  code: string,
): CapabilityProvisionContractError {
  const error = captureError(run);
  assert.ok(
    error instanceof CapabilityProvisionContractError,
    'expected CapabilityProvisionContractError',
  );
  assert.equal(error.name, 'CapabilityProvisionContractError');
  assert.equal(error.code, code);
  return error;
}

function expectGraphErrorUnwrapped(run: () => unknown, code: string): void {
  const error = captureError(run);
  assert.ok(error instanceof DefinitionGraphContractError, 'expected DefinitionGraphContractError');
  assert.ok(
    !(error instanceof CapabilityProvisionContractError),
    'graph contract failures must propagate unwrapped, never reclassified',
  );
  assert.equal((error as DefinitionGraphContractError).name, 'DefinitionGraphContractError');
  assert.equal((error as DefinitionGraphContractError).code, code);
}

function expectToolErrorUnwrapped(run: () => unknown, code: string): void {
  const error = captureError(run);
  assert.ok(error instanceof ToolComponentContractError, 'expected ToolComponentContractError');
  assert.ok(
    !(error instanceof CapabilityProvisionContractError),
    'tool declaration failures must propagate unwrapped, never reclassified',
  );
  assert.equal((error as ToolComponentContractError).name, 'ToolComponentContractError');
  assert.equal((error as ToolComponentContractError).code, code);
}

// ---------------------------------------------------------------------------
// R1 (pack test 1): provider evidence — a valid Tool Component declares exact
// versioned CapabilityIds via providesCapabilities and is extractable as
// provider evidence through the T003A validator.
// ---------------------------------------------------------------------------

test('T003B-R1: providesCapabilities of a valid Tool Component are extractable provider evidence', () => {
  const provider = toolComponent({ provides: [CREDIT_RATING, AUDIT_TRAIL] });
  // Fixture validity is proven by the existing T003A validator, unchanged.
  validateToolComponent(provider);
  const selection = selectCapabilityProvider(graphOf([provider]), CREDIT_RATING);
  assert.equal(selection.graphId, 'provision.test.graph');
  assert.deepEqual(selection.requiredCapability, CREDIT_RATING);
  assert.equal(selection.provider.componentId, 'catalog.credit-rating.tool');
  assert.equal(selection.provider.family, 'tool');
  assert.deepEqual(selection.provider.providesCapability, CREDIT_RATING);
});

// ---------------------------------------------------------------------------
// R2 (pack test 2): consumer evidence — refs drawn from the unchanged T001A
// requiredCapabilities (either family) are valid selection inputs.
// ---------------------------------------------------------------------------

test('T003B-R2: required refs drawn from T001A requiredCapabilities are valid selection inputs', () => {
  const provider = toolComponent({ componentId: 'z.catalog.tool' });
  const semanticConsumer = semanticComponent({ requires: [CREDIT_RATING] });
  const toolConsumer = toolComponent({
    componentId: 'quote.compose.tool',
    provides: [],
    requires: [CREDIT_RATING],
  });
  for (const requiring of [semanticConsumer, toolConsumer]) {
    const required = requiring.requiredCapabilities[0] as CapabilityContractRef;
    assert.deepEqual(required, CREDIT_RATING);
    const selection = selectCapabilityProvider(graphOf([requiring, provider]), required);
    assert.deepEqual(selection.requiredCapability, CREDIT_RATING);
    assert.equal(selection.provider.componentId, 'z.catalog.tool');
  }
});

// ---------------------------------------------------------------------------
// R3 (pack test 3): deterministic selection; result carries exact provider
// componentId + exact ref as evidence and never depends on graph relations.
// ---------------------------------------------------------------------------

test('T003B-R3: selection is deterministic and identical with or without a connecting relation', () => {
  const provider = toolComponent({ componentId: 'catalog.credit-rating.tool' });
  const consumer = semanticComponent({ requires: [CREDIT_RATING] });
  const withRelation = graphOf(
    [consumer, provider],
    [
      {
        relationId: 'rel.eligibility-uses-credit',
        relationKind: 'depends-on',
        sourceComponentId: 'quote.eligibility.rule',
        targetComponentId: 'catalog.credit-rating.tool',
      },
    ],
  );
  const withoutRelation = graphOf([consumer, provider], []);
  const withRelationSelection = selectCapabilityProvider(withRelation, CREDIT_RATING);
  const withoutRelationSelection = selectCapabilityProvider(withoutRelation, CREDIT_RATING);
  assert.deepEqual(withRelationSelection, withoutRelationSelection);
  assert.equal(withRelationSelection.provider.componentId, 'catalog.credit-rating.tool');
  assert.deepEqual(withRelationSelection.provider.providesCapability, CREDIT_RATING);
});

// ---------------------------------------------------------------------------
// R4 (pack test 4): zero providers fail closed — no fallback, no closest
// version, and no silent self-provision from requiredCapabilities.
// ---------------------------------------------------------------------------

test('T003B-R4: a required ref no bound tool provides fails CAPABILITY_PROVIDER_NOT_FOUND', () => {
  const graph = graphOf([
    toolComponent({ provides: [{ capabilityId: 'other.capability', version: '1.0.0' }] }),
    semanticComponent(),
  ]);
  const failure = expectProvisionFailure(
    () => selectCapabilityProvider(graph, CREDIT_RATING),
    'CAPABILITY_PROVIDER_NOT_FOUND',
  );
  assert.deepEqual(failure.conflictingProviderComponentIds, []);
});

test("T003B-R4: a component's own requiredCapabilities is never provider evidence (no silent self-provision)", () => {
  const selfRequirer = toolComponent({
    componentId: 'self.requirer.tool',
    provides: [],
    requires: [CREDIT_RATING],
  });
  validateToolComponent(selfRequirer);
  expectProvisionFailure(
    () => selectCapabilityProvider(graphOf([selfRequirer]), CREDIT_RATING),
    'CAPABILITY_PROVIDER_NOT_FOUND',
  );
});

// ---------------------------------------------------------------------------
// R5 (pack test 5): ambiguous providers fail closed with deterministic,
// componentId-sorted diagnostics — no first-wins, no ordering, no priority.
// ---------------------------------------------------------------------------

test('T003B-R5: two providers of the same exact ref fail CAPABILITY_PROVIDER_AMBIGUOUS with sorted diagnostics', () => {
  const late = toolComponent({ componentId: 'bbb.credit.tool' });
  const early = toolComponent({ componentId: 'aaa.credit.tool' });
  for (const order of [
    [late, early],
    [early, late],
  ]) {
    const failure = expectProvisionFailure(
      () => selectCapabilityProvider(graphOf([...order, semanticComponent()]), CREDIT_RATING),
      'CAPABILITY_PROVIDER_AMBIGUOUS',
    );
    assert.deepEqual(failure.conflictingProviderComponentIds, ['aaa.credit.tool', 'bbb.credit.tool']);
  }
});

// ---------------------------------------------------------------------------
// R6 (pack test 6): exactness — both ref fields must match exactly; version
// mismatch yields NOT_FOUND, never nearest/range/floating matching.
// ---------------------------------------------------------------------------

test('T003B-R6: same capabilityId at a different exact version is NOT_FOUND (no nearest version)', () => {
  const provider = toolComponent({
    provides: [{ capabilityId: 'credit-rating-lookup', version: '2.0.0' }],
  });
  expectProvisionFailure(
    () => selectCapabilityProvider(graphOf([provider]), CREDIT_RATING),
    'CAPABILITY_PROVIDER_NOT_FOUND',
  );
});

test('T003B-R6: same version under a different capabilityId is NOT_FOUND', () => {
  const provider = toolComponent({ provides: [AUDIT_TRAIL] });
  expectProvisionFailure(
    () => selectCapabilityProvider(graphOf([provider]), CREDIT_RATING),
    'CAPABILITY_PROVIDER_NOT_FOUND',
  );
});

// ---------------------------------------------------------------------------
// R7 (pack test 7): only the TOOL family provides — a semantic component whose
// semanticBody mimics a Tool declaration shape is never a candidate
// (compile-time proof in type-fixtures.ts).
// ---------------------------------------------------------------------------

test('T003B-R7: a semantic-family component mimicking a tool declaration is never a provider', () => {
  const impostor = semanticComponent({
    componentId: 'impostor.credit.tool',
    semanticBody: declaration([CREDIT_RATING]) as unknown as JsonValue,
  });
  validateComponentEnvelope(impostor);
  expectProvisionFailure(
    () => selectCapabilityProvider(graphOf([impostor]), CREDIT_RATING),
    'CAPABILITY_PROVIDER_NOT_FOUND',
  );
  // Even alongside a real Tool provider, the semantic mimic is never chosen.
  const provider = toolComponent({ componentId: 'real.credit.tool' });
  const selection = selectCapabilityProvider(graphOf([impostor, provider]), CREDIT_RATING);
  assert.equal(selection.provider.componentId, 'real.credit.tool');
});

// ---------------------------------------------------------------------------
// R8 (pack test 8): purity — no input mutation, no ambient state, no I/O.
// ---------------------------------------------------------------------------

test('T003B-R8: selection does not mutate the input envelope (success and failure paths)', () => {
  const provider = toolComponent({ componentId: 'catalog.credit-rating.tool' });
  const consumer = semanticComponent({ requires: [CREDIT_RATING] });
  const graph = graphOf(
    [provider, consumer],
    [
      {
        relationId: 'rel.eligibility-uses-credit',
        relationKind: 'depends-on',
        sourceComponentId: 'quote.eligibility.rule',
        targetComponentId: 'catalog.credit-rating.tool',
      },
    ],
  );
  const snapshot = structuredClone(graph);
  selectCapabilityProvider(graph, CREDIT_RATING);
  expectProvisionFailure(
    () => selectCapabilityProvider(graph, { capabilityId: 'missing.capability', version: '9.9.9' }),
    'CAPABILITY_PROVIDER_NOT_FOUND',
  );
  expectProvisionFailure(
    () => selectCapabilityProvider(graph, CREDIT_RATING, 'catalog.credit-rating.tool'),
    'CAPABILITY_PROVIDER_NOT_FOUND',
  );
  assert.deepEqual(graph, snapshot);
});

// ---------------------------------------------------------------------------
// R9 (pack test 9): permutation determinism over component order and
// providesCapabilities order.
// ---------------------------------------------------------------------------

test('T003B-R9: every component-order permutation yields the identical evidence', () => {
  const provider = toolComponent({
    componentId: 'catalog.credit-rating.tool',
    provides: [AUDIT_TRAIL, CREDIT_RATING],
  });
  const neutralA = semanticComponent({ componentId: 'aaa.neutral.rule' });
  const neutralB = semanticComponent({ componentId: 'quote.eligibility.rule' });
  const baseline = selectCapabilityProvider(
    graphOf([provider, neutralA, neutralB]),
    CREDIT_RATING,
  );
  for (const permutation of permutations([provider, neutralA, neutralB])) {
    assert.deepEqual(selectCapabilityProvider(graphOf(permutation), CREDIT_RATING), baseline);
  }
  // The same holds when the providesCapabilities entries of one declaration
  // are permuted.
  const flipped = toolComponent({
    componentId: 'catalog.credit-rating.tool',
    provides: [CREDIT_RATING, AUDIT_TRAIL],
  });
  assert.deepEqual(
    selectCapabilityProvider(graphOf([flipped, neutralA, neutralB]), CREDIT_RATING),
    baseline,
  );
});

test('T003B-R9: ambiguous failure is permutation-invariant as well', () => {
  const early = toolComponent({ componentId: 'aaa.credit.tool' });
  const late = toolComponent({ componentId: 'zzz.credit.tool' });
  const neutral = semanticComponent({ componentId: 'quote.eligibility.rule' });
  const expected = expectProvisionFailure(
    () => selectCapabilityProvider(graphOf([early, late, neutral]), CREDIT_RATING),
    'CAPABILITY_PROVIDER_AMBIGUOUS',
  );
  for (const permutation of permutations([early, late, neutral])) {
    const failure = expectProvisionFailure(
      () => selectCapabilityProvider(graphOf(permutation), CREDIT_RATING),
      'CAPABILITY_PROVIDER_AMBIGUOUS',
    );
    assert.deepEqual(failure.conflictingProviderComponentIds, expected.conflictingProviderComponentIds);
  }
});

// ---------------------------------------------------------------------------
// R10 (pack test 10): invalid graphs surface the original
// DefinitionGraphContractError unwrapped — no wrapping, no reclassification.
// ---------------------------------------------------------------------------

test('T003B-R10: graph validation failures propagate DefinitionGraphContractError unwrapped', () => {
  const dangling = graphOf(
    [toolComponent()],
    [
      {
        relationId: 'rel.dangling',
        relationKind: 'depends-on',
        sourceComponentId: 'catalog.credit-rating.tool',
        targetComponentId: 'not.bound.component',
      },
    ],
  );
  expectGraphErrorUnwrapped(
    () => selectCapabilityProvider(dangling, CREDIT_RATING),
    'DANGLING_COMPONENT_REF',
  );

  // A structurally malformed graph argument is the graph validator's own
  // failure, surfaced unchanged.
  expectGraphErrorUnwrapped(
    () => selectCapabilityProvider(null as unknown as DefinitionGraphEnvelope, CREDIT_RATING),
    'INVALID_GRAPH_ENVELOPE',
  );

  // The propagated message is byte-identical to a direct validator throw.
  let directMessage = '';
  try {
    validateDefinitionGraphEnvelope(dangling);
  } catch (error) {
    directMessage = (error as Error).message;
  }
  const propagated = captureError(() => selectCapabilityProvider(dangling, CREDIT_RATING)) as Error;
  assert.equal(propagated.message, directMessage);
});

// ---------------------------------------------------------------------------
// R11 (pack test 11): a malformed tool declaration surfaces the original
// ToolComponentContractError unwrapped — a broken tool body never silently
// "provides nothing".
// ---------------------------------------------------------------------------

test('T003B-R11: a broken tool body surfaces ToolComponentContractError unwrapped', () => {
  const broken = toolComponent({
    componentId: 'broken.credit.tool',
    semanticBody: { operations: [] } as unknown as JsonValue,
  });
  expectToolErrorUnwrapped(
    () => selectCapabilityProvider(graphOf([broken]), CREDIT_RATING),
    'INVALID_TOOL_OPERATIONS',
  );

  // Even when a healthy tool would satisfy the exact ref, the broken tool
  // body fails the whole selection closed.
  const healthy = toolComponent({ componentId: 'aaa.healthy.tool' });
  expectToolErrorUnwrapped(
    () => selectCapabilityProvider(graphOf([healthy, broken]), CREDIT_RATING),
    'INVALID_TOOL_OPERATIONS',
  );

  // A non-object tool semanticBody fails the same way (declaration-level code).
  const notADeclaration = toolComponent({
    componentId: 'zzz.not-a-declaration.tool',
    semanticBody: 'not-a-declaration' as unknown as JsonValue,
  });
  expectToolErrorUnwrapped(
    () => selectCapabilityProvider(graphOf([notADeclaration]), CREDIT_RATING),
    'INVALID_TOOL_COMPONENT_ENVELOPE',
  );
});

// ---------------------------------------------------------------------------
// R12 (pack test 12): invalid selection input — malformed refs and unbound
// consumer ids fail INVALID_SELECTION_INPUT; floating/range selectors fail
// FLOATING_AUTHORITY_REFERENCE_FORBIDDEN per the house convention.
// ---------------------------------------------------------------------------

test('T003B-R12: malformed required refs fail INVALID_SELECTION_INPUT, never guessed', () => {
  const graph = graphOf([toolComponent()]);
  for (const malformed of [
    null,
    'credit-rating-lookup',
    { capabilityId: 'credit-rating-lookup' },
    { version: '1.1.0' },
    { capabilityId: 'credit-rating-lookup', version: '1.1.0', extra: 'field' },
  ]) {
    expectProvisionFailure(
      () => selectCapabilityProvider(graph, malformed as unknown as CapabilityContractRef),
      'INVALID_SELECTION_INPUT',
    );
  }
  // An embedded `id@version` selector is an invalid exact identity (component
  // contract convention), never parsed or normalized.
  expectProvisionFailure(
    () =>
      selectCapabilityProvider(graph, {
        capabilityId: 'credit-rating-lookup@1.1.0',
        version: '1.1.0',
      }),
    'INVALID_SELECTION_INPUT',
  );
});

test('T003B-R12: floating/range selectors in the required ref fail FLOATING_AUTHORITY_REFERENCE_FORBIDDEN', () => {
  const graph = graphOf([toolComponent()]);
  for (const floating of [
    { capabilityId: 'credit-rating-lookup', version: 'latest' },
    { capabilityId: 'credit-rating-lookup', version: '^1.0.0' },
    { capabilityId: 'credit-rating-lookup', version: '~1.0.0' },
    { capabilityId: '*', version: '1.1.0' },
    { capabilityId: 'CURRENT', version: '1.1.0' },
  ]) {
    expectProvisionFailure(
      () => selectCapabilityProvider(graph, floating as unknown as CapabilityContractRef),
      'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN',
    );
  }
});

test('T003B-R12: a supplied consumer id that is not a bound component fails INVALID_SELECTION_INPUT', () => {
  const graph = graphOf([toolComponent()]);
  expectProvisionFailure(
    () => selectCapabilityProvider(graph, CREDIT_RATING, 'not.bound.component'),
    'INVALID_SELECTION_INPUT',
  );
  expectProvisionFailure(
    () => selectCapabilityProvider(graph, CREDIT_RATING, 42 as unknown as string),
    'INVALID_SELECTION_INPUT',
  );
});

// ---------------------------------------------------------------------------
// R13 (pack test 13): the consumerComponentId seam excludes that bound
// component from candidacy — never satisfied-by-self.
// ---------------------------------------------------------------------------

test('T003B-R13: an exact consumerComponentId is excluded — the sole self-provider is not enough', () => {
  const selfProvider = toolComponent({
    componentId: 'self.sufficient.tool',
    provides: [CREDIT_RATING],
    requires: [CREDIT_RATING],
  });
  validateToolComponent(selfProvider);
  expectProvisionFailure(
    () => selectCapabilityProvider(graphOf([selfProvider]), CREDIT_RATING, 'self.sufficient.tool'),
    'CAPABILITY_PROVIDER_NOT_FOUND',
  );

  // The exclusion is targeted: any other eligible provider remains selectable.
  const other = toolComponent({ componentId: 'aaa.other.tool', provides: [CREDIT_RATING] });
  const selection = selectCapabilityProvider(
    graphOf([selfProvider, other]),
    CREDIT_RATING,
    'self.sufficient.tool',
  );
  assert.equal(selection.provider.componentId, 'aaa.other.tool');

  // A bound semantic consumer id is also a valid (inert) exclusion input.
  const semanticConsumer = semanticComponent({ requires: [CREDIT_RATING] });
  const inert = selectCapabilityProvider(
    graphOf([semanticConsumer, other]),
    CREDIT_RATING,
    'quote.eligibility.rule',
  );
  assert.equal(inert.provider.componentId, 'aaa.other.tool');
});

// ---------------------------------------------------------------------------
// R14 (pack test 14): no implementation identity anywhere in the result
// (compile-time proof in type-fixtures.ts).
// ---------------------------------------------------------------------------

test('T003B-R14: selection evidence carries component identity + capability ref only', () => {
  const selection = selectCapabilityProvider(
    graphOf([toolComponent(), semanticComponent({ requires: [CREDIT_RATING] })]),
    CREDIT_RATING,
  );
  assert.deepEqual(Object.keys(selection).sort(), ['graphId', 'provider', 'requiredCapability']);
  assert.deepEqual(Object.keys(selection.provider).sort(), [
    'componentId',
    'family',
    'providesCapability',
  ]);
  const serialized = JSON.stringify(selection);
  for (const banned of [
    'implementation',
    'module',
    'binding',
    'pin',
    'endpoint',
    'digest',
    'route',
    'runtime',
    'package',
    'registry',
  ]) {
    assert.equal(
      serialized.includes(banned),
      false,
      `unexpected implementation identity "${banned}" in selection evidence`,
    );
  }
});

// ---------------------------------------------------------------------------
// Module surface: only the typed error and the pure selection function.
// ---------------------------------------------------------------------------

test('T003B: the module exposes only the typed error and the selection function', () => {
  assert.deepEqual(Object.keys(capabilityProvisionModule).sort(), [
    'CapabilityProvisionContractError',
    'selectCapabilityProvider',
  ]);
});
