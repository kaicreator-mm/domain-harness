import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ComponentContractError,
  validateComponentEnvelope,
  type ComponentEnvelope,
  type ComponentId,
} from '../../src/contracts/component.js';
import {
  ToolComponentContractError,
  validateToolComponent,
  type ToolOperationContract,
  type ToolOperationsDeclaration,
} from '../../src/contracts/tool-component.js';
import {
  ResourceRequirementContractError,
  validateToolResourceRequirements,
  type ResourceContractRef,
  type ToolResourceRequirement,
  type ToolResourceRequirementsDeclaration,
} from '../../src/contracts/resource-requirements.js';

/** Structural mutable view used only to inject malformed runtime values. */
type MutableEnvelope = { -readonly [K in keyof ComponentEnvelope]: ComponentEnvelope[K] };
type MutableRequirementsDeclaration = {
  -readonly [K in keyof ToolResourceRequirementsDeclaration]: ToolResourceRequirementsDeclaration[K];
};
type MutableRequirement = { -readonly [K in keyof ToolResourceRequirement]: ToolResourceRequirement[K] };

function operation(overrides?: {
  operationId?: string;
  effect?: ToolOperationContract['effect'];
}): ToolOperationContract {
  return {
    operationId: overrides?.operationId ?? 'lookup.credit-rating',
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    effect: overrides?.effect ?? 'idempotent',
  };
}

function operationsDeclaration(overrides?: {
  operations?: ToolOperationsDeclaration['operations'];
}): ToolOperationsDeclaration {
  return {
    operations:
      overrides?.operations ??
      [
        operation(),
        operation({ operationId: 'submit.credit-freeze', effect: 'non-idempotent' }),
      ],
    providesCapabilities: [{ capabilityId: 'credit-rating-lookup', version: '1.1.0' }],
  };
}

function ownerEnvelope(overrides?: {
  family?: ComponentEnvelope['family'];
  componentId?: ComponentEnvelope['componentId'];
  operations?: ToolOperationsDeclaration['operations'];
}): ComponentEnvelope {
  return {
    family: overrides?.family ?? 'tool',
    componentId: overrides?.componentId ?? 'credit.rating.tool',
    kind: { kindId: 'tool.credit-rating.v1', version: '2.0.0' },
    requiredSemanticContracts: [{ contractId: 'credit.rating.schema', version: '1.0.0' }],
    requiredCapabilities: [{ capabilityId: 'outbound-http', version: '1.4.0' }],
    semanticBody: operationsDeclaration(
      overrides?.operations !== undefined ? { operations: overrides.operations } : undefined,
    ) as unknown as ComponentEnvelope['semanticBody'],
  };
}

function requirement(overrides?: {
  resourceKey?: string;
  contract?: ResourceContractRef;
  operationId?: string;
  required?: boolean;
}): ToolResourceRequirement {
  return {
    resourceKey: overrides?.resourceKey ?? 'runtime.postgres.cluster',
    ...(overrides?.contract !== undefined ? { contract: overrides.contract } : {}),
    ...(overrides?.operationId !== undefined ? { operationId: overrides.operationId } : {}),
    required: overrides?.required ?? true,
  };
}

function requirementsDeclaration(overrides?: {
  componentId?: ComponentId;
  requirements?: readonly ToolResourceRequirement[];
}): ToolResourceRequirementsDeclaration {
  return {
    componentId: overrides?.componentId ?? 'credit.rating.tool',
    requirements: overrides?.requirements ?? [requirement()],
  };
}

function expectResourceFailure(
  mutate: (declaration: MutableRequirementsDeclaration) => void,
  code: string,
): void {
  const declaration = requirementsDeclaration() as unknown as MutableRequirementsDeclaration;
  mutate(declaration);
  assert.throws(
    () =>
      validateToolResourceRequirements(
        ownerEnvelope(),
        declaration as unknown as ToolResourceRequirementsDeclaration,
      ),
    (error: unknown) => {
      assert.ok(error instanceof ResourceRequirementContractError, 'expected ResourceRequirementContractError');
      assert.ok(!(error instanceof ComponentContractError));
      assert.ok(!(error instanceof ToolComponentContractError));
      assert.equal(error.code, code);
      assert.equal(error.name, 'ResourceRequirementContractError');
      return true;
    },
  );
}

function expectRequirementFailure(
  mutate: (requirement: MutableRequirement) => void,
  code: string,
): void {
  expectResourceFailure((declaration) => {
    mutate(declaration.requirements[0] as unknown as MutableRequirement);
  }, code);
}

function expectThrownCode(
  thunk: () => void,
  errorType: abstract new (...args: never[]) => Error,
  code: string,
): void {
  assert.throws(
    thunk,
    (error: unknown) => {
      assert.ok(error instanceof errorType, `expected ${errorType.name}`);
      assert.equal((error as Error & { code?: string }).code, code);
      return true;
    },
  );
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

/** The exact fail-closed smuggle-field list from the task pack. */
const SMUGGLED_LIVE_VALUE_FIELDS = [
  'value',
  'secret',
  'credentials',
  'endpoint',
  'uri',
  'url',
  'handle',
  'connectionString',
  'dsn',
  'provider',
  'model',
  'region',
  'binding',
  'resources',
];

// ---------------------------------------------------------------------------
// R1: a valid logical resource requirement declaration validates, composed
// with a Tool Component envelope that passes validateToolComponent unchanged;
// an empty requirements array is valid (= declares no requirements).
// ---------------------------------------------------------------------------

test('T005A-R1: a valid declaration validates against an unchanged valid Tool Component envelope', () => {
  const owner = ownerEnvelope();
  validateComponentEnvelope(owner);
  validateToolComponent(owner);

  validateToolResourceRequirements(
    owner,
    requirementsDeclaration({
      requirements: [
        requirement({
          resourceKey: 'runtime.postgres.cluster',
          contract: { contractId: 'postgres.cluster.contract', version: '14.2.0' },
          required: true,
        }),
        requirement({
          resourceKey: 'runtime.credit.schema',
          operationId: 'lookup.credit-rating',
          required: false,
        }),
      ],
    }),
  );
});

test('T005A-R1: an empty requirements array is valid (declares no requirements)', () => {
  validateToolResourceRequirements(
    ownerEnvelope(),
    requirementsDeclaration({ requirements: [] }),
  );
});

test('T005A-R1: component-scope and operation-scope requirements coexist in one declaration', () => {
  validateToolResourceRequirements(
    ownerEnvelope(),
    requirementsDeclaration({
      requirements: [
        requirement({ resourceKey: 'runtime.postgres.cluster' }),
        requirement({
          resourceKey: 'runtime.credit.schema',
          contract: { contractId: 'credit.schema.contract', version: '1.0.0' },
          operationId: 'lookup.credit-rating',
          required: false,
        }),
      ],
    }),
  );
});

// ---------------------------------------------------------------------------
// R2: owner keying by exact identity — the declaration is keyed to its owner
// by exact componentId; mismatched/missing/malformed is never silently rebound.
// ---------------------------------------------------------------------------

test('T005A-R2: mismatched componentId is typed-rejected and never silently rebound', () => {
  const declaration = requirementsDeclaration({ componentId: 'other.rating.tool' });
  expectThrownCode(
    () => validateToolResourceRequirements(ownerEnvelope(), declaration),
    ResourceRequirementContractError,
    'INVALID_RESOURCE_REQUIREMENT_OWNER',
  );
  assert.equal(declaration.componentId, 'other.rating.tool', 'componentId must never be rebound');
});

test('T005A-R2: missing, non-string, or blank componentId is typed-rejected', () => {
  const absent = requirementsDeclaration() as unknown as Record<string, unknown>;
  delete absent.componentId;
  expectThrownCode(
    () =>
      validateToolResourceRequirements(
        ownerEnvelope(),
        absent as unknown as ToolResourceRequirementsDeclaration,
      ),
    ResourceRequirementContractError,
    'INVALID_RESOURCE_REQUIREMENT_OWNER',
  );
  expectResourceFailure((declaration) => {
    declaration.componentId = 42 as unknown as ComponentId;
  }, 'INVALID_RESOURCE_REQUIREMENT_OWNER');
  expectResourceFailure((declaration) => {
    declaration.componentId = '';
  }, 'INVALID_RESOURCE_REQUIREMENT_OWNER');
  expectResourceFailure((declaration) => {
    declaration.componentId = '   ';
  }, 'INVALID_RESOURCE_REQUIREMENT_OWNER');
  expectResourceFailure((declaration) => {
    declaration.componentId = 'credit.rating.tool@2.0.0';
  }, 'INVALID_RESOURCE_REQUIREMENT_OWNER');
});

test('T005A-R2: floating componentId selectors are rejected with the floating-reference code', () => {
  expectResourceFailure((declaration) => {
    declaration.componentId = 'latest';
  }, 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN');
});

// ---------------------------------------------------------------------------
// R3: operation narrowing — operationId must reference an operation actually
// present in the owner's ToolOperationsDeclaration (composition, not
// re-implemented operation parsing).
// ---------------------------------------------------------------------------

test('T005A-R3: operationId must reference an operation present in the owner declaration', () => {
  validateToolResourceRequirements(
    ownerEnvelope(),
    requirementsDeclaration({
      requirements: [requirement({ operationId: 'submit.credit-freeze' })],
    }),
  );
  expectRequirementFailure((req) => {
    req.operationId = 'purge.cache';
  }, 'INVALID_RESOURCE_REQUIREMENT_OPERATION');
});

test('T005A-R3: malformed operation identity is typed-rejected', () => {
  expectRequirementFailure((req) => {
    req.operationId = '';
  }, 'INVALID_RESOURCE_REQUIREMENT_OPERATION');
  expectRequirementFailure((req) => {
    req.operationId = 42 as unknown as string;
  }, 'INVALID_RESOURCE_REQUIREMENT_OPERATION');
  expectRequirementFailure((req) => {
    req.operationId = 'submit.credit-freeze@2.0.0';
  }, 'INVALID_RESOURCE_REQUIREMENT_OPERATION');
});

test('T005A-R3: narrowing composes against the actual owner passed in', () => {
  const ownerA = ownerEnvelope({ componentId: 'a.rating.tool' });
  const ownerB = ownerEnvelope({
    componentId: 'b.rating.tool',
    operations: [operation()],
  });
  const scoped = (componentId: ComponentId) =>
    requirementsDeclaration({
      componentId,
      requirements: [requirement({ operationId: 'submit.credit-freeze' })],
    });
  validateToolResourceRequirements(ownerA, scoped('a.rating.tool'));
  expectThrownCode(
    () => validateToolResourceRequirements(ownerB, scoped('b.rating.tool')),
    ResourceRequirementContractError,
    'INVALID_RESOURCE_REQUIREMENT_OPERATION',
  );
});

// ---------------------------------------------------------------------------
// R4: duplicate resourceKey rejection — same scope or across component and
// operation scopes.
// ---------------------------------------------------------------------------

test('T005A-R4: the same resourceKey twice at component scope is typed-rejected', () => {
  expectResourceFailure((declaration) => {
    declaration.requirements = [
      requirement({ resourceKey: 'runtime.postgres.cluster' }),
      requirement({
        resourceKey: 'runtime.postgres.cluster',
        contract: { contractId: 'postgres.cluster.contract', version: '15.0.0' },
        required: false,
      }),
    ];
  }, 'INVALID_RESOURCE_REQUIREMENT_DUPLICATE');
});

test('T005A-R4: the same resourceKey across component and operation scopes is typed-rejected', () => {
  expectResourceFailure((declaration) => {
    declaration.requirements = [
      requirement({ resourceKey: 'runtime.postgres.cluster' }),
      requirement({
        resourceKey: 'runtime.postgres.cluster',
        operationId: 'lookup.credit-rating',
      }),
    ];
  }, 'INVALID_RESOURCE_REQUIREMENT_DUPLICATE');
});

test('T005A-R4: the same resourceKey on two different operations is typed-rejected', () => {
  expectResourceFailure((declaration) => {
    declaration.requirements = [
      requirement({ resourceKey: 'runtime.credit.schema', operationId: 'lookup.credit-rating' }),
      requirement({ resourceKey: 'runtime.credit.schema', operationId: 'submit.credit-freeze' }),
    ];
  }, 'INVALID_RESOURCE_REQUIREMENT_DUPLICATE');
});

// ---------------------------------------------------------------------------
// R5: fail-closed unknown fields — live-value-bearing field names are rejected
// as unknown fields with the module's typed error.
// ---------------------------------------------------------------------------

test('T005A-R5: live-value-bearing field names are fail-closed rejected on the declaration', () => {
  for (const smuggled of SMUGGLED_LIVE_VALUE_FIELDS) {
    expectResourceFailure((declaration) => {
      Object.assign(declaration, { [smuggled]: 'injected' });
    }, 'INVALID_RESOURCE_REQUIREMENTS_DECLARATION');
  }
  expectResourceFailure((declaration) => {
    Object.assign(declaration, { totallyUnknown: 1 });
  }, 'INVALID_RESOURCE_REQUIREMENTS_DECLARATION');
});

test('T005A-R5: live-value-bearing field names are fail-closed rejected on a requirement', () => {
  for (const smuggled of SMUGGLED_LIVE_VALUE_FIELDS) {
    expectRequirementFailure((req) => {
      Object.assign(req, { [smuggled]: 'injected' });
    }, 'INVALID_RESOURCE_REQUIREMENT');
  }
  expectRequirementFailure((req) => {
    Object.assign(req, { material: { password: 'hunter2' } });
  }, 'INVALID_RESOURCE_REQUIREMENT');
});

// ---------------------------------------------------------------------------
// R6: floating selectors rejected — resourceKey, contractId, version and
// operationId never accept a floating/range/embedded-selector form.
// ---------------------------------------------------------------------------

test('T005A-R6: floating resourceKey selectors are rejected, never normalized', () => {
  for (const floating of ['latest', 'current', 'active', 'default', '*', 'LATEST', ' latest ']) {
    expectRequirementFailure((req) => {
      req.resourceKey = floating;
    }, 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN');
  }
  for (const ranged of ['runtime.*', 'db^2', '~db', 'db<1', 'db>0', 'a|b']) {
    expectRequirementFailure((req) => {
      req.resourceKey = ranged;
    }, 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN');
  }
  expectRequirementFailure((req) => {
    req.resourceKey = 'runtime.postgres.cluster@14.2.0';
  }, 'INVALID_RESOURCE_KEY');
});

test('T005A-R6: floating contractId/version selectors are rejected, never normalized', () => {
  expectRequirementFailure((req) => {
    req.contract = { contractId: 'latest', version: '14.2.0' };
  }, 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN');
  expectRequirementFailure((req) => {
    req.contract = { contractId: 'postgres.cluster.contract', version: 'latest' };
  }, 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN');
  expectRequirementFailure((req) => {
    req.contract = { contractId: 'postgres.cluster.contract', version: '^14.0.0' };
  }, 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN');
  expectRequirementFailure((req) => {
    req.contract = { contractId: 'postgres.cluster.contract', version: '14.2.0@rc1' };
  }, 'INVALID_RESOURCE_CONTRACT_REF');
});

test('T005A-R6: floating operationId selectors are rejected, never normalized', () => {
  for (const floating of ['latest', 'current', 'default', '*']) {
    expectRequirementFailure((req) => {
      req.operationId = floating;
    }, 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN');
  }
});

// ---------------------------------------------------------------------------
// R7: exact contract ref shape — ResourceContractRef contains exactly
// {contractId, version}; extra or missing fields rejected.
// ---------------------------------------------------------------------------

test('T005A-R7: ResourceContractRef must contain exactly {contractId, version}', () => {
  expectRequirementFailure((req) => {
    req.contract = { contractId: 'postgres.cluster.contract' } as unknown as ResourceContractRef;
  }, 'INVALID_RESOURCE_CONTRACT_REF');
  expectRequirementFailure((req) => {
    req.contract = { version: '14.2.0' } as unknown as ResourceContractRef;
  }, 'INVALID_RESOURCE_CONTRACT_REF');
  expectRequirementFailure((req) => {
    req.contract = {
      contractId: 'postgres.cluster.contract',
      version: '14.2.0',
      providerId: 'neon',
    } as unknown as ResourceContractRef;
  }, 'INVALID_RESOURCE_CONTRACT_REF');
  expectRequirementFailure((req) => {
    req.contract = {
      contractId: 'postgres.cluster.contract',
      version: '14.2.0',
      endpoint: 'https://db.internal',
    } as unknown as ResourceContractRef;
  }, 'INVALID_RESOURCE_CONTRACT_REF');
  expectRequirementFailure((req) => {
    req.contract = 'postgres.cluster.contract@14.2.0' as unknown as ResourceContractRef;
  }, 'INVALID_RESOURCE_CONTRACT_REF');
});

// ---------------------------------------------------------------------------
// R8: secrets/live values are structurally unrepresentable — every requirement
// field is an identity string, an exact ref object, or a boolean; no free-form
// JSON bag exists anywhere (runtime companion of the type fixtures).
// ---------------------------------------------------------------------------

test('T005A-R8: a requirement carries only identity/ref/boolean fields — no JSON bag is expressible', () => {
  const plain = requirement();
  assert.deepEqual(Object.keys(plain).sort(), ['required', 'resourceKey']);

  const full = requirement({
    contract: { contractId: 'postgres.cluster.contract', version: '14.2.0' },
    operationId: 'lookup.credit-rating',
  });
  assert.deepEqual(Object.keys(full).sort(), ['contract', 'operationId', 'required', 'resourceKey']);

  const declaration = requirementsDeclaration({ requirements: [] });
  assert.deepEqual(Object.keys(declaration).sort(), ['componentId', 'requirements']);
});

// ---------------------------------------------------------------------------
// R9: explicit requiredness — `required` is a mandatory exact boolean; no
// default, no coercion; no resolution consequence implemented.
// ---------------------------------------------------------------------------

test('T005A-R9: required is mandatory — missing or coercible-looking values are rejected', () => {
  expectRequirementFailure((req) => {
    delete (req as { required?: unknown }).required;
  }, 'INVALID_RESOURCE_REQUIREMENT');
  expectRequirementFailure((req) => {
    req.required = 'true' as unknown as boolean;
  }, 'INVALID_RESOURCE_REQUIREMENT');
  expectRequirementFailure((req) => {
    req.required = 1 as unknown as boolean;
  }, 'INVALID_RESOURCE_REQUIREMENT');
  expectRequirementFailure((req) => {
    req.required = null as unknown as boolean;
  }, 'INVALID_RESOURCE_REQUIREMENT');
  expectRequirementFailure((req) => {
    req.required = undefined as unknown as boolean;
  }, 'INVALID_RESOURCE_REQUIREMENT');
});

test('T005A-R9: explicit true and false both validate; declared values are preserved verbatim', () => {
  const mandatory = requirementsDeclaration({
    requirements: [requirement({ required: true })],
  });
  validateToolResourceRequirements(ownerEnvelope(), mandatory);
  assert.equal((mandatory.requirements[0] as ToolResourceRequirement).required, true);

  const optional = requirementsDeclaration({
    requirements: [requirement({ resourceKey: 'runtime.credit.schema', required: false })],
  });
  validateToolResourceRequirements(ownerEnvelope(), optional);
  assert.equal((optional.requirements[0] as ToolResourceRequirement).required, false);
});

// ---------------------------------------------------------------------------
// R10: no runtime resolution/injection semantics — the module exports
// declaration types and one pure validator only.
// ---------------------------------------------------------------------------

test('T005A-R10: module surface is declaration types and one pure validator', async () => {
  const module = await import('../../src/contracts/resource-requirements.js');
  assert.deepEqual(Object.keys(module).sort(), [
    'ResourceRequirementContractError',
    'validateToolResourceRequirements',
  ]);
  // Exactly two parameters (owner, declaration): no environment/host/provider
  // parameter exists, and the validator is a plain synchronous function.
  assert.equal(validateToolResourceRequirements.length, 2);
  assert.equal(validateToolResourceRequirements.constructor.name, 'Function');
  assert.equal(validateToolResourceRequirements(ownerEnvelope(), requirementsDeclaration({ requirements: [] })), undefined);
});

test('T005A-R10: validation is pure — no mutation of inputs and no resource needs to exist', () => {
  const owner = ownerEnvelope();
  const declaration = requirementsDeclaration({
    requirements: [
      requirement({ resourceKey: 'runtime.postgres.cluster', required: true }),
      requirement({
        resourceKey: 'runtime.credit.schema',
        contract: { contractId: 'credit.schema.contract', version: '1.0.0' },
        operationId: 'lookup.credit-rating',
        required: false,
      }),
    ],
  });
  const ownerBefore = JSON.parse(JSON.stringify(owner));
  const declarationBefore = JSON.parse(JSON.stringify(declaration));
  // Frozen inputs prove no mutation: any write attempt throws in strict mode.
  const result = validateToolResourceRequirements(deepFreeze(owner), deepFreeze(declaration));
  assert.equal(result, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(owner)), ownerBefore);
  assert.deepEqual(JSON.parse(JSON.stringify(declaration)), declarationBefore);
});

// ---------------------------------------------------------------------------
// R11: validation composition — validateToolComponent(owner) runs first;
// its failures surface unchanged with their original error types.
// ---------------------------------------------------------------------------

test('T005A-R11: an invalid owner surfaces ComponentContractError unchanged', () => {
  const badOwner = ownerEnvelope() as unknown as MutableEnvelope;
  badOwner.componentId = '';
  expectThrownCode(
    () => validateToolResourceRequirements(badOwner, requirementsDeclaration()),
    ComponentContractError,
    'INVALID_COMPONENT_ID',
  );

  const smuggledOwner = ownerEnvelope() as unknown as MutableEnvelope;
  Object.assign(smuggledOwner, { assemblyDigest: 'sha256:abc' });
  expectThrownCode(
    () => validateToolResourceRequirements(smuggledOwner, requirementsDeclaration()),
    ComponentContractError,
    'INVALID_COMPONENT_ENVELOPE',
  );
});

test('T005A-R11: an owner with an invalid operations declaration surfaces ToolComponentContractError unchanged', () => {
  const badBodyOwner = ownerEnvelope() as unknown as MutableEnvelope;
  Object.assign(badBodyOwner.semanticBody as unknown as Record<string, unknown>, {
    resourceRequirements: [],
  });
  expectThrownCode(
    () => validateToolResourceRequirements(badBodyOwner, requirementsDeclaration()),
    ToolComponentContractError,
    'INVALID_TOOL_OPERATIONS',
  );
});

test('T005A-R11: a well-formed semantic-family owner is rejected via the composed Tool validator', () => {
  const semanticOwner = ownerEnvelope({ family: 'semantic' });
  validateComponentEnvelope(semanticOwner);
  expectThrownCode(
    () => validateToolResourceRequirements(semanticOwner, requirementsDeclaration()),
    ToolComponentContractError,
    'INVALID_TOOL_COMPONENT_FAMILY',
  );
});

test('T005A-R11: owner validation runs first — owner failures win over declaration failures', () => {
  const badOwner = ownerEnvelope() as unknown as MutableEnvelope;
  Object.assign(badOwner, { implementationId: 'tool-impl@9' });
  const badDeclaration = requirementsDeclaration() as unknown as MutableRequirementsDeclaration;
  Object.assign(badDeclaration, { totallyUnknown: 1 });
  expectThrownCode(
    () =>
      validateToolResourceRequirements(
        badOwner,
        badDeclaration as unknown as ToolResourceRequirementsDeclaration,
      ),
    ComponentContractError,
    'INVALID_COMPONENT_ENVELOPE',
  );
});

// ---------------------------------------------------------------------------
// R12: legacy isolation and T003A boundary intact — the separate declaration
// placement must not leak requirement material back into the operation
// contract, and legacy surfaces remain byte-identical and un-re-exported.
// ---------------------------------------------------------------------------

test('T005A-R12: validateToolComponent still rejects resources/resourceRequirements inside ToolOperationsDeclaration', () => {
  for (const smuggled of ['resources', 'resourceRequirements']) {
    const envelope = ownerEnvelope() as unknown as MutableEnvelope;
    Object.assign(envelope.semanticBody as unknown as Record<string, unknown>, {
      [smuggled]: [{ resourceKey: 'runtime.postgres.cluster', required: true }],
    });
    expectThrownCode(
      () => validateToolComponent(envelope as unknown as ComponentEnvelope),
      ToolComponentContractError,
      'INVALID_TOOL_OPERATIONS',
    );
  }
});

test('T005A-R12: legacy contract modules keep their exact runtime surfaces; the new module re-exports nothing', async () => {
  const componentModule = await import('../../src/contracts/component.js');
  assert.deepEqual(Object.keys(componentModule).sort(), [
    'COMPONENT_FAMILIES',
    'ComponentContractError',
    'validateComponentEnvelope',
  ]);
  const toolComponentModule = await import('../../src/contracts/tool-component.js');
  assert.deepEqual(Object.keys(toolComponentModule).sort(), [
    'ToolComponentContractError',
    'validateToolComponent',
  ]);
  const legacyToolModule = await import('../../src/contracts/tool.js');
  assert.deepEqual(Object.keys(legacyToolModule).sort(), []);

  const resourceModule = await import('../../src/contracts/resource-requirements.js');
  for (const legacyName of [
    'validateComponentEnvelope',
    'validateToolComponent',
    'ComponentContractError',
    'ToolComponentContractError',
    'COMPONENT_FAMILIES',
  ]) {
    assert.equal(legacyName in resourceModule, false, `unexpected re-export of ${legacyName}`);
  }
});
