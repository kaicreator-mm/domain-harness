import assert from 'node:assert/strict';
import test from 'node:test';
import {
  admitComponent,
  ComponentAdmissionError,
  type ComponentAdmissionErrorCode,
  type ComponentAdmissionFailureClass,
  type UnderstoodKindDeclaration,
  type UnderstoodKindSet,
} from '../../src/contracts/component-admission.js';
import {
  ComponentContractError,
  type ComponentEnvelope,
} from '../../src/contracts/component.js';
import {
  ToolComponentContractError,
  validateToolComponent,
} from '../../src/contracts/tool-component.js';

const EXPECTED_FAILURE_CLASS_BY_CODE: Record<ComponentAdmissionErrorCode, ComponentAdmissionFailureClass> = {
  UNKNOWN_KIND: 'KIND',
  KIND_VERSION_MISMATCH: 'KIND',
  UNKNOWN_SEMANTIC_CONTRACT: 'CONTRACT',
  UNKNOWN_CAPABILITY: 'CAPABILITY',
  INVALID_UNDERSTOOD_KIND_SET: 'INPUT',
};

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

function toolEnvelope(overrides: Partial<ComponentEnvelope> = {}): ComponentEnvelope {
  return {
    family: 'tool',
    componentId: 'tool.search',
    kind: { kindId: 'tool.search.v1', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: {
      operations: [
        {
          operationId: 'search',
          inputSchema: {},
          outputSchema: {},
          effect: 'none',
        },
      ],
      providesCapabilities: [{ capabilityId: 'search', version: '1.0.0' }],
    },
    ...overrides,
  };
}

class SemanticFixtureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SemanticFixtureError';
  }
}

function validateSemanticFixture(envelope: ComponentEnvelope): void {
  if (envelope.family !== 'semantic') throw new SemanticFixtureError('family must be semantic');
  const body = envelope.semanticBody;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new SemanticFixtureError('semantic body must be an object');
  }
  const keys = Object.keys(body).sort();
  assert.deepEqual(keys, ['policy', 'threshold']);
  const threshold = (body as Record<string, unknown>).threshold;
  const policy = (body as Record<string, unknown>).policy;
  if (typeof threshold !== 'number') throw new SemanticFixtureError('threshold must be numeric');
  if (typeof policy !== 'object' || policy === null || Array.isArray(policy)) {
    throw new SemanticFixtureError('policy must be an object');
  }
  const policyKeys = Object.keys(policy).sort();
  assert.deepEqual(policyKeys, ['enabled']);
  if (typeof (policy as Record<string, unknown>).enabled !== 'boolean') {
    throw new SemanticFixtureError('policy.enabled must be boolean');
  }
}

function semanticDeclaration(overrides: Partial<UnderstoodKindDeclaration> = {}): UnderstoodKindDeclaration {
  return {
    kind: { kindId: 'decision.rule.v1', version: '1.2.0' },
    understoodSemanticContracts: [{ contractId: 'customer.tier.schema', version: '2.0.0' }],
    understoodCapabilities: [{ capabilityId: 'semantic-decision', version: '1.0.0' }],
    validateComponent: validateSemanticFixture,
    ...overrides,
  };
}

function toolDeclaration(): UnderstoodKindDeclaration {
  return {
    kind: { kindId: 'tool.search.v1', version: '1.0.0' },
    understoodSemanticContracts: [],
    understoodCapabilities: [],
    validateComponent: validateToolComponent,
  };
}

function expectAdmissionFailure(
  fn: () => unknown,
  code: ComponentAdmissionErrorCode,
): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof ComponentAdmissionError);
    assert.equal(error.code, code);
    assert.equal(error.failureClass, EXPECTED_FAILURE_CLASS_BY_CODE[code]);
    return true;
  });
}

test('#556-R1: authoritative admission validates base envelope, exact contracts/capabilities, then exact Kind closed-world semantics', () => {
  let validatorCalls = 0;
  const declaration = semanticDeclaration({
    validateComponent(envelope) {
      validatorCalls += 1;
      validateSemanticFixture(envelope);
    },
  });
  const envelope = semanticEnvelope();
  const result = admitComponent(envelope, [declaration]);

  assert.equal(validatorCalls, 1);
  assert.equal(result.status, 'ADMITTED');
  assert.equal(result.componentId, envelope.componentId);
  assert.deepEqual(result.admittedKind, envelope.kind);
  assert.deepEqual(result.admittedSemanticContracts, envelope.requiredSemanticContracts);
  assert.deepEqual(result.admittedCapabilities, envelope.requiredCapabilities);
});

test('#556-R2: invalid base ComponentEnvelope is rejected before Kind validation', () => {
  let validatorCalls = 0;
  const invalid = Object.assign(semanticEnvelope(), { implementationId: 'impl@9' }) as unknown as ComponentEnvelope;
  assert.throws(
    () => admitComponent(invalid, [semanticDeclaration({ validateComponent() { validatorCalls += 1; } })]),
    (error: unknown) => error instanceof ComponentContractError && error.code === 'INVALID_COMPONENT_ENVELOPE',
  );
  assert.equal(validatorCalls, 0);
});

test('#556-R3: unknown Kind and exact-version mismatch fail closed with no fallback', () => {
  expectAdmissionFailure(
    () => admitComponent(semanticEnvelope({ kind: { kindId: 'unknown.kind', version: '1.0.0' } }), [semanticDeclaration()]),
    'UNKNOWN_KIND',
  );
  expectAdmissionFailure(
    () => admitComponent(semanticEnvelope({ kind: { kindId: 'decision.rule.v1', version: '9.0.0' } }), [semanticDeclaration()]),
    'KIND_VERSION_MISMATCH',
  );
});

test('#556-R4: unknown required semantic contract fails before Kind validator', () => {
  let validatorCalls = 0;
  const declaration = semanticDeclaration({
    understoodSemanticContracts: [],
    validateComponent() { validatorCalls += 1; },
  });
  expectAdmissionFailure(() => admitComponent(semanticEnvelope(), [declaration]), 'UNKNOWN_SEMANTIC_CONTRACT');
  assert.equal(validatorCalls, 0);
});

test('#556-R5: unknown required capability fails before Kind validator', () => {
  let validatorCalls = 0;
  const declaration = semanticDeclaration({
    understoodCapabilities: [],
    validateComponent() { validatorCalls += 1; },
  });
  expectAdmissionFailure(() => admitComponent(semanticEnvelope(), [declaration]), 'UNKNOWN_CAPABILITY');
  assert.equal(validatorCalls, 0);
});

test('#556-R6: nested invalid Tool effect is rejected by the exact Tool Kind validator', () => {
  const invalid = toolEnvelope({
    semanticBody: {
      operations: [{ operationId: 'search', inputSchema: {}, outputSchema: {}, effect: 'teleport' }],
      providesCapabilities: [],
    },
  });
  assert.throws(
    () => admitComponent(invalid, [toolDeclaration()]),
    (error: unknown) =>
      error instanceof ToolComponentContractError && error.code === 'INVALID_TOOL_OPERATION_EFFECT',
  );
});

test('#556-R7: unknown nested behaviorally material Tool field is rejected closed-world', () => {
  const invalid = toolEnvelope({
    semanticBody: {
      operations: [
        {
          operationId: 'search',
          inputSchema: {},
          outputSchema: {},
          effect: 'none',
          futureBehavior: true,
        },
      ],
      providesCapabilities: [],
    },
  });
  assert.throws(
    () => admitComponent(invalid, [toolDeclaration()]),
    (error: unknown) =>
      error instanceof ToolComponentContractError && error.code === 'INVALID_TOOL_OPERATION',
  );
});

test('#556-R8: valid Tool Component uses the same generic open-Kind admission seam', () => {
  const result = admitComponent(toolEnvelope(), [toolDeclaration()]);
  assert.equal(result.status, 'ADMITTED');
  assert.deepEqual(result.admittedKind, { kindId: 'tool.search.v1', version: '1.0.0' });
});

test('#556-R9: non-material extensions remain opaque pass-through and do not become comprehension fields', () => {
  const extension = { display: { label: 'Search' } } as const;
  const envelope = toolEnvelope({ nonMaterialExtensions: extension });
  const result = admitComponent(envelope, [toolDeclaration()]);
  assert.strictEqual(result.nonMaterialExtensions, extension);
});

test('#556-R10: a non-Tool Semantic Kind can supply an independent closed-world validator', () => {
  const envelope = semanticEnvelope();
  assert.equal(admitComponent(envelope, [semanticDeclaration()]).status, 'ADMITTED');

  const futureNested = semanticEnvelope({
    semanticBody: { threshold: 100, policy: { enabled: true, futureBehavior: 'material' } },
  });
  assert.throws(() => admitComponent(futureNested, [semanticDeclaration()]), SemanticFixtureError);
});

test('#556-R11: understood set itself is exact, duplicate-free, and requires a validator', () => {
  const floating = semanticDeclaration({ kind: { kindId: 'decision.rule.v1', version: '1.x' } });
  expectAdmissionFailure(() => admitComponent(semanticEnvelope(), [floating]), 'INVALID_UNDERSTOOD_KIND_SET');

  const duplicateContracts = semanticDeclaration({
    understoodSemanticContracts: [
      { contractId: 'customer.tier.schema', version: '2.0.0' },
      { contractId: 'customer.tier.schema', version: '3.0.0' },
    ],
  });
  expectAdmissionFailure(() => admitComponent(semanticEnvelope(), [duplicateContracts]), 'INVALID_UNDERSTOOD_KIND_SET');

  const missingValidator = {
    kind: { kindId: 'decision.rule.v1', version: '1.2.0' },
    understoodSemanticContracts: [],
    understoodCapabilities: [],
  } as unknown as UnderstoodKindDeclaration;
  expectAdmissionFailure(() => admitComponent(semanticEnvelope(), [missingValidator]), 'INVALID_UNDERSTOOD_KIND_SET');
});

test('#556-R12: admission is pure over envelope and support declarations', () => {
  const envelope = semanticEnvelope();
  const declaration = semanticDeclaration();
  const beforeEnvelope = structuredClone(envelope);
  const beforeKind = declaration.kind;
  const beforeContracts = structuredClone(declaration.understoodSemanticContracts);
  const beforeCapabilities = structuredClone(declaration.understoodCapabilities);

  admitComponent(envelope, [declaration]);

  assert.deepEqual(envelope, beforeEnvelope);
  assert.strictEqual(declaration.kind, beforeKind);
  assert.deepEqual(declaration.understoodSemanticContracts, beforeContracts);
  assert.deepEqual(declaration.understoodCapabilities, beforeCapabilities);
});

test('#556-R13: failure taxonomy is total and deterministic', () => {
  const codes = Object.keys(EXPECTED_FAILURE_CLASS_BY_CODE).sort();
  assert.deepEqual(codes, [
    'INVALID_UNDERSTOOD_KIND_SET',
    'KIND_VERSION_MISMATCH',
    'UNKNOWN_CAPABILITY',
    'UNKNOWN_KIND',
    'UNKNOWN_SEMANTIC_CONTRACT',
  ]);
  const classes = new Set(Object.values(EXPECTED_FAILURE_CLASS_BY_CODE));
  assert.deepEqual([...classes].sort(), ['CAPABILITY', 'CONTRACT', 'INPUT', 'KIND']);
});

test('#556-R14: empty understood set is structurally valid and admits nothing', () => {
  const empty: UnderstoodKindSet = [];
  expectAdmissionFailure(() => admitComponent(semanticEnvelope(), empty), 'UNKNOWN_KIND');
});
