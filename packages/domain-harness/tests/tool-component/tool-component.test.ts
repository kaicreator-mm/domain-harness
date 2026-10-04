import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ComponentContractError,
  validateComponentEnvelope,
  type CapabilityContractRef,
  type ComponentEnvelope,
} from '../../src/contracts/component.js';
import type { JsonValue } from '../../src/contracts/json.js';
import {
  ToolComponentContractError,
  validateToolComponent,
  type ToolOperationEffect,
  type ToolOperationContract,
  type ToolOperationsDeclaration,
} from '../../src/contracts/tool-component.js';
import type { HarnessTool, ToolContext, ToolEffect } from '../../src/contracts/tool.js';

/** Structural mutable view used only to inject malformed runtime values. */
type MutableEnvelope = { -readonly [K in keyof ComponentEnvelope]: ComponentEnvelope[K] };
type MutableDeclaration = { -readonly [K in keyof ToolOperationsDeclaration]: ToolOperationsDeclaration[K] };
type MutableOperation = { -readonly [K in keyof ToolOperationContract]: ToolOperationContract[K] };

function operation(overrides?: {
  operationId?: string;
  inputSchema?: JsonValue;
  outputSchema?: JsonValue;
  effect?: ToolOperationEffect;
  declaredFailures?: readonly string[];
  declaredExposure?: JsonValue;
}): ToolOperationContract {
  return {
    operationId: overrides?.operationId ?? 'lookup.credit-rating',
    inputSchema: overrides?.inputSchema ?? { type: 'object' },
    outputSchema: overrides?.outputSchema ?? { type: 'object' },
    effect: overrides?.effect ?? 'idempotent',
    ...(overrides?.declaredFailures !== undefined ? { declaredFailures: overrides.declaredFailures } : {}),
    ...(overrides?.declaredExposure !== undefined ? { declaredExposure: overrides.declaredExposure } : {}),
  };
}

function declaration(overrides?: {
  operations?: ToolOperationsDeclaration['operations'];
  providesCapabilities?: readonly CapabilityContractRef[];
}): ToolOperationsDeclaration {
  return {
    operations: overrides?.operations ?? [operation()],
    providesCapabilities: overrides?.providesCapabilities ?? [
      { capabilityId: 'credit-rating-lookup', version: '1.1.0' },
    ],
  };
}

function toolEnvelope(overrides?: {
  family?: ComponentEnvelope['family'];
  componentId?: ComponentEnvelope['componentId'];
  requiredCapabilities?: ComponentEnvelope['requiredCapabilities'];
  semanticBody?: ComponentEnvelope['semanticBody'];
}): ComponentEnvelope {
  return {
    family: overrides?.family ?? 'tool',
    componentId: overrides?.componentId ?? 'credit.rating.tool',
    kind: { kindId: 'tool.credit-rating.v1', version: '2.0.0' },
    requiredSemanticContracts: [{ contractId: 'credit.rating.schema', version: '1.0.0' }],
    requiredCapabilities: overrides?.requiredCapabilities ?? [
      { capabilityId: 'outbound-http', version: '1.4.0' },
    ],
    semanticBody:
      overrides?.semanticBody ??
      (declaration() as unknown as ComponentEnvelope['semanticBody']),
  };
}

function expectToolFailure(
  mutate: (envelope: MutableEnvelope) => void,
  code: string,
): void {
  const envelope = toolEnvelope() as unknown as MutableEnvelope;
  mutate(envelope);
  assert.throws(
    () => validateToolComponent(envelope as unknown as ComponentEnvelope),
    (error: unknown) => {
      assert.ok(error instanceof ToolComponentContractError, 'expected ToolComponentContractError');
      assert.equal(error.code, code);
      assert.equal(error.name, 'ToolComponentContractError');
      return true;
    },
  );
}

function expectDeclarationFailure(
  mutate: (declaration: MutableDeclaration) => void,
  code: string,
): void {
  expectToolFailure((envelope) => {
    const body = envelope.semanticBody as unknown as MutableDeclaration;
    mutate(body);
  }, code);
}

function expectOperationFailure(
  mutate: (op: MutableOperation) => void,
  code: string,
): void {
  expectDeclarationFailure((declaration) => {
    mutate(declaration.operations[0] as unknown as MutableOperation);
  }, code);
}

/**
 * Non-portable JSON injected inside `semanticBody` is rejected by the
 * envelope-first composition: `validateComponentEnvelope` runs first and its
 * `INVALID_SEMANTIC_BODY` failure surfaces unchanged as
 * `ComponentContractError` before any Tool-specific check runs.
 */
function expectEnvelopeSurfacedFailure(
  mutate: (op: MutableOperation) => void,
  code: string,
): void {
  const envelope = toolEnvelope() as unknown as MutableEnvelope;
  const op = ((envelope.semanticBody as unknown as MutableDeclaration)
    .operations[0]) as unknown as MutableOperation;
  mutate(op);
  assert.throws(
    () => validateToolComponent(envelope as unknown as ComponentEnvelope),
    (error: unknown) => {
      assert.ok(error instanceof ComponentContractError, 'expected ComponentContractError');
      assert.ok(!(error instanceof ToolComponentContractError));
      assert.equal(error.code, code);
      return true;
    },
  );
}

// ---------------------------------------------------------------------------
// R1: a valid Tool Component is the existing ComponentEnvelope with
// family 'tool' whose semanticBody is exactly one Tool operations declaration;
// the same object passes validateComponentEnvelope unchanged.
// ---------------------------------------------------------------------------

test('T003A-R1: valid TOOL component envelope integrates the T001A envelope unchanged', () => {
  const envelope = toolEnvelope();
  validateComponentEnvelope(envelope);
  validateToolComponent(envelope);
  assert.equal(envelope.family, 'tool');
  assert.deepEqual(envelope.kind, { kindId: 'tool.credit-rating.v1', version: '2.0.0' });
  const body = envelope.semanticBody as unknown as ToolOperationsDeclaration;
  assert.deepEqual(body.operations, [operation()]);
  assert.deepEqual(body.providesCapabilities, [
    { capabilityId: 'credit-rating-lookup', version: '1.1.0' },
  ]);
});

test('T003A-R1: open Kind refs stay valid on a tool envelope (no closed tool-kind union)', () => {
  const envelope = toolEnvelope({
    componentId: 'com.kaicreator.example.brand-new-tool',
  });
  (envelope as { kind: ComponentEnvelope['kind'] }).kind = {
    kindId: 'com.kaicreator.example.brand-new-tool-kind',
    version: '0.1.0',
  };
  validateToolComponent(envelope);
});

// ---------------------------------------------------------------------------
// R2: operation id is a stable exact identity.
// ---------------------------------------------------------------------------

test('T003A-R2: empty, blank, or non-string operation ids are rejected', () => {
  expectOperationFailure((op) => {
    op.operationId = '';
  }, 'INVALID_TOOL_OPERATION_ID');
  expectOperationFailure((op) => {
    op.operationId = '   ';
  }, 'INVALID_TOOL_OPERATION_ID');
  expectOperationFailure((op) => {
    op.operationId = 42 as unknown as string;
  }, 'INVALID_TOOL_OPERATION_ID');
});

test('T003A-R2: embedded `id@selector` operation ids are rejected, never normalized', () => {
  expectOperationFailure((op) => {
    op.operationId = 'lookup.credit-rating@1.0.0';
  }, 'INVALID_TOOL_OPERATION_ID');
  expectOperationFailure((op) => {
    op.operationId = 'lookup.credit-rating@latest';
  }, 'INVALID_TOOL_OPERATION_ID');
});

test('T003A-R2: floating operation-id selectors are rejected, never normalized', () => {
  for (const floating of ['latest', 'current', 'active', 'default', '*', 'LATEST', ' latest ']) {
    expectOperationFailure((op) => {
      op.operationId = floating;
    }, 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN');
  }
});

test('T003A-R2: range/wildcard characters are rejected in operation ids', () => {
  for (const ranged of ['lookup.*', 'lookup^2', '~lookup', 'lookup<1', 'lookup>0', 'a|b']) {
    expectOperationFailure((op) => {
      op.operationId = ranged;
    }, 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN');
  }
});

// ---------------------------------------------------------------------------
// R3: operation input/output are portable JSON material declarations.
// ---------------------------------------------------------------------------

test('T003A-R3: input/output schemas are required portable JSON; {} is unconstrained', () => {
  const unconstrained = declaration({
    operations: [
      operation({ inputSchema: {}, outputSchema: {} }),
    ],
  });
  const envelope = toolEnvelope({ semanticBody: unconstrained as unknown as JsonValue });
  validateToolComponent(envelope);

  const rich = declaration({
    operations: [
      operation({
        inputSchema: { type: 'object', properties: { rating: { type: 'string' } }, required: ['rating'] },
        outputSchema: { type: 'object', properties: { tier: { type: 'string' } } },
      }),
    ],
  });
  validateToolComponent(toolEnvelope({ semanticBody: rich as unknown as JsonValue }));
});

test('T003A-R3: absent input/output schemas are Tool-typed rejections; undefined values are non-portable JSON', () => {
  // Absent required material is portable JSON as a whole, so the Tool-level
  // field validation rejects it with the typed field code.
  expectOperationFailure((op) => {
    delete (op as { inputSchema?: unknown }).inputSchema;
  }, 'INVALID_TOOL_OPERATION_INPUT');
  expectOperationFailure((op) => {
    delete (op as { outputSchema?: unknown }).outputSchema;
  }, 'INVALID_TOOL_OPERATION_OUTPUT');
  // An explicitly-undefined value makes the whole semanticBody non-portable,
  // so the envelope-first composition rejects it unchanged at the envelope
  // layer before Tool-specific validation runs.
  expectEnvelopeSurfacedFailure((op) => {
    op.inputSchema = undefined as unknown as JsonValue;
  }, 'INVALID_SEMANTIC_BODY');
  expectEnvelopeSurfacedFailure((op) => {
    op.outputSchema = undefined as unknown as JsonValue;
  }, 'INVALID_SEMANTIC_BODY');
});

test('T003A-R3: non-portable input/output values are rejected (envelope-first composition)', () => {
  expectEnvelopeSurfacedFailure((op) => {
    op.inputSchema = Number.NaN as unknown as JsonValue;
  }, 'INVALID_SEMANTIC_BODY');
  expectEnvelopeSurfacedFailure((op) => {
    op.inputSchema = (() => 'x') as unknown as JsonValue;
  }, 'INVALID_SEMANTIC_BODY');
  expectEnvelopeSurfacedFailure((op) => {
    op.outputSchema = new Date('2024-01-01T00:00:00Z') as unknown as JsonValue;
  }, 'INVALID_SEMANTIC_BODY');
  const circular: unknown[] = [];
  circular.push(circular);
  expectEnvelopeSurfacedFailure((op) => {
    op.outputSchema = circular as unknown as JsonValue;
  }, 'INVALID_SEMANTIC_BODY');
});

// ---------------------------------------------------------------------------
// R4: typed operation failure declarations.
// ---------------------------------------------------------------------------

test('T003A-R4: declaredFailures accepts absent and exact unique failure codes', () => {
  const withoutFailures = declaration({ operations: [operation()] });
  validateToolComponent(toolEnvelope({ semanticBody: withoutFailures as unknown as JsonValue }));

  const withFailures = declaration({
    operations: [
      operation({ declaredFailures: ['QUOTE_LIMIT_EXCEEDED', 'PROVIDER_TIMEOUT'] }),
    ],
  });
  validateToolComponent(toolEnvelope({ semanticBody: withFailures as unknown as JsonValue }));

  const emptyFailures = declaration({
    operations: [operation({ declaredFailures: [] })],
  });
  validateToolComponent(toolEnvelope({ semanticBody: emptyFailures as unknown as JsonValue }));
});

test('T003A-R4: empty/blank/non-string declared failure codes are rejected', () => {
  expectOperationFailure((op) => {
    op.declaredFailures = [''];
  }, 'INVALID_TOOL_OPERATION_FAILURE');
  expectOperationFailure((op) => {
    op.declaredFailures = ['   '];
  }, 'INVALID_TOOL_OPERATION_FAILURE');
  expectOperationFailure((op) => {
    op.declaredFailures = [42 as unknown as string];
  }, 'INVALID_TOOL_OPERATION_FAILURE');
  expectOperationFailure((op) => {
    op.declaredFailures = 'QUOTE_LIMIT_EXCEEDED' as unknown as string[];
  }, 'INVALID_TOOL_OPERATION_FAILURE');
});

test('T003A-R4: duplicate declared failure codes are rejected', () => {
  expectOperationFailure((op) => {
    op.declaredFailures = ['QUOTE_LIMIT_EXCEEDED', 'QUOTE_LIMIT_EXCEEDED'];
  }, 'INVALID_TOOL_OPERATION_FAILURE');
});

test('T003A-R4: floating or embedded-selector failure codes are rejected', () => {
  expectOperationFailure((op) => {
    op.declaredFailures = ['latest'];
  }, 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN');
  expectOperationFailure((op) => {
    op.declaredFailures = ['*'];
  }, 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN');
  expectOperationFailure((op) => {
    op.declaredFailures = ['QUOTE_LIMIT@1'];
  }, 'INVALID_TOOL_OPERATION_FAILURE');
});

// ---------------------------------------------------------------------------
// R5: effect class per operation — frozen minimal enum, no default.
// ---------------------------------------------------------------------------

test('T003A-R5: all three exact lowercase effect values validate', () => {
  for (const effect of ['none', 'idempotent', 'non-idempotent'] as const) {
    const decl = declaration({ operations: [operation({ effect })] });
    validateToolComponent(toolEnvelope({ semanticBody: decl as unknown as JsonValue }));
  }
});

test('T003A-R5: missing, unknown, or case-mismatched effect values are rejected without normalization', () => {
  expectOperationFailure((op) => {
    delete (op as { effect?: unknown }).effect;
  }, 'INVALID_TOOL_OPERATION_EFFECT');
  // An undefined effect makes the whole semanticBody non-portable JSON — the
  // envelope-first composition rejects it before Tool-specific validation.
  expectEnvelopeSurfacedFailure((op) => {
    op.effect = undefined as unknown as ToolOperationEffect;
  }, 'INVALID_SEMANTIC_BODY');
  expectOperationFailure((op) => {
    op.effect = 'read-only' as unknown as ToolOperationEffect;
  }, 'INVALID_TOOL_OPERATION_EFFECT');
  expectOperationFailure((op) => {
    op.effect = 'None' as unknown as ToolOperationEffect;
  }, 'INVALID_TOOL_OPERATION_EFFECT');
  expectOperationFailure((op) => {
    op.effect = 'IDEMPOTENT' as unknown as ToolOperationEffect;
  }, 'INVALID_TOOL_OPERATION_EFFECT');
  expectOperationFailure((op) => {
    op.effect = 42 as unknown as ToolOperationEffect;
  }, 'INVALID_TOOL_OPERATION_EFFECT');
});

test('T003A-R5: the module carries no invocation/anchoring machinery', async () => {
  const module = await import('../../src/contracts/tool-component.js');
  assert.deepEqual(Object.keys(module).sort(), [
    'ToolComponentContractError',
    'validateToolComponent',
  ]);
});

// ---------------------------------------------------------------------------
// R6: provides/requires Capability refs are exact/versioned.
// ---------------------------------------------------------------------------

test('T003A-R6: providesCapabilities may be empty (provides nothing) or exact/versioned', () => {
  const providesNothing = declaration({ providesCapabilities: [] });
  validateToolComponent(toolEnvelope({ semanticBody: providesNothing as unknown as JsonValue }));

  const provides = declaration({
    providesCapabilities: [
      { capabilityId: 'credit-rating-lookup', version: '1.1.0' },
      { capabilityId: 'audit.trail.emit', version: '0.3.0' },
    ],
  });
  validateToolComponent(toolEnvelope({ semanticBody: provides as unknown as JsonValue }));
});

test('T003A-R6: malformed, duplicate, or missing providesCapabilities are rejected', () => {
  expectDeclarationFailure((decl) => {
    delete (decl as { providesCapabilities?: unknown }).providesCapabilities;
  }, 'INVALID_TOOL_CAPABILITY_PROVIDES');
  expectDeclarationFailure((decl) => {
    decl.providesCapabilities = [{ capabilityId: 'credit-rating-lookup' }] as unknown as readonly CapabilityContractRef[];
  }, 'INVALID_TOOL_CAPABILITY_PROVIDES');
  expectDeclarationFailure((decl) => {
    decl.providesCapabilities = [
      { capabilityId: 'credit-rating-lookup', version: '1.1.0' },
      { capabilityId: 'credit-rating-lookup', version: '1.1.0' },
    ];
  }, 'INVALID_TOOL_CAPABILITY_PROVIDES');
  expectDeclarationFailure((decl) => {
    decl.providesCapabilities = [
      { capabilityId: 'credit-rating-lookup', version: '1.1.0' },
      { capabilityId: 'credit-rating-lookup', version: '2.0.0' },
    ];
  }, 'INVALID_TOOL_CAPABILITY_PROVIDES');
  expectDeclarationFailure((decl) => {
    decl.providesCapabilities = 'credit-rating-lookup' as unknown as readonly CapabilityContractRef[];
  }, 'INVALID_TOOL_CAPABILITY_PROVIDES');
});

test('T003A-R6: floating provides refs are rejected, never normalized', () => {
  expectDeclarationFailure((decl) => {
    decl.providesCapabilities = [
      { capabilityId: 'credit-rating-lookup', version: 'latest' },
    ];
  }, 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN');
  expectDeclarationFailure((decl) => {
    decl.providesCapabilities = [
      { capabilityId: 'current', version: '1.0.0' },
    ];
  }, 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN');
});

test('T003A-R6: requires stays the envelope requiredCapabilities with unchanged T001A rules', () => {
  // Malformed requires surfaces as the existing ComponentContractError.
  const envelope = toolEnvelope() as unknown as MutableEnvelope;
  envelope.requiredCapabilities = [{ capabilityId: 'outbound-http' }] as unknown as ComponentEnvelope['requiredCapabilities'];
  assert.throws(
    () => validateToolComponent(envelope as unknown as ComponentEnvelope),
    (error: unknown) => {
      assert.ok(error instanceof ComponentContractError, 'expected ComponentContractError');
      assert.ok(!(error instanceof ToolComponentContractError));
      assert.equal(error.code, 'INVALID_CAPABILITY_REF');
      return true;
    },
  );

  const floatingRequires = toolEnvelope() as unknown as MutableEnvelope;
  floatingRequires.requiredCapabilities = [
    { capabilityId: 'outbound-http', version: 'latest' },
  ] as unknown as ComponentEnvelope['requiredCapabilities'];
  assert.throws(
    () => validateToolComponent(floatingRequires as unknown as ComponentEnvelope),
    (error: unknown) => {
      assert.ok(error instanceof ComponentContractError);
      assert.equal(error.code, 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN');
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// R7: exposure metadata is declarative-only.
// ---------------------------------------------------------------------------

test('T003A-R7: validation outcome is identical for any portable declaredExposure content', () => {
  const visible = declaration({
    operations: [operation({ declaredExposure: { agentVisible: true } })],
  });
  validateToolComponent(toolEnvelope({ semanticBody: visible as unknown as JsonValue }));

  const hidden = declaration({
    operations: [operation({ declaredExposure: { agentVisible: false } })],
  });
  validateToolComponent(toolEnvelope({ semanticBody: hidden as unknown as JsonValue }));

  const exotic = declaration({
    operations: [operation({ declaredExposure: { audiences: ['agent', 'user'], notes: null, limit: 3 } })],
  });
  validateToolComponent(toolEnvelope({ semanticBody: exotic as unknown as JsonValue }));
});

test('T003A-R7: non-portable declaredExposure is rejected (envelope-first composition)', () => {
  expectEnvelopeSurfacedFailure((op) => {
    op.declaredExposure = (() => 'authorize') as unknown as JsonValue;
  }, 'INVALID_SEMANTIC_BODY');
  expectEnvelopeSurfacedFailure((op) => {
    op.declaredExposure = new Map([['agentVisible', true]]) as unknown as JsonValue;
  }, 'INVALID_SEMANTIC_BODY');
  expectEnvelopeSurfacedFailure((op) => {
    op.declaredExposure = Number.POSITIVE_INFINITY as unknown as JsonValue;
  }, 'INVALID_SEMANTIC_BODY');
});

// ---------------------------------------------------------------------------
// R8: multi-operation Tools.
// ---------------------------------------------------------------------------

test('T003A-R8: two or more operations validate; shape is independent of operation count', () => {
  const twoOps = declaration({
    operations: [
      operation({ operationId: 'lookup.credit-rating', effect: 'idempotent' }),
      operation({
        operationId: 'submit.credit-freeze',
        effect: 'non-idempotent',
        declaredFailures: ['ALREADY_FROZEN'],
        declaredExposure: { agentVisible: false },
      }),
      operation({
        operationId: 'purge.cache',
        effect: 'none',
        inputSchema: {},
        outputSchema: {},
      }),
    ],
  });
  const envelope = toolEnvelope({ semanticBody: twoOps as unknown as JsonValue });
  validateComponentEnvelope(envelope);
  validateToolComponent(envelope);
  const body = envelope.semanticBody as unknown as ToolOperationsDeclaration;
  assert.equal(body.operations.length, 3);
});

// ---------------------------------------------------------------------------
// R9: operation ids are unique within one Tool Component.
// ---------------------------------------------------------------------------

test('T003A-R9: duplicate operation ids are typed-rejected', () => {
  expectDeclarationFailure((decl) => {
    decl.operations = [
      operation({ operationId: 'lookup.credit-rating' }),
      operation({ operationId: 'lookup.credit-rating', effect: 'none' }),
    ];
  }, 'INVALID_TOOL_OPERATION_ID');
});

// ---------------------------------------------------------------------------
// R10: TOOL family integration negative.
// ---------------------------------------------------------------------------

test('T003A-R10: a well-formed semantic-family envelope fails the Tool validator with a typed family error', () => {
  const envelope = toolEnvelope({ family: 'semantic' });
  validateComponentEnvelope(envelope);
  assert.throws(
    () => validateToolComponent(envelope),
    (error: unknown) => {
      assert.ok(error instanceof ToolComponentContractError);
      assert.ok(!(error instanceof ComponentContractError));
      assert.equal(error.code, 'INVALID_TOOL_COMPONENT_FAMILY');
      return true;
    },
  );
});

test('T003A-R10: envelope-level failures re-surface unchanged as ComponentContractError', () => {
  const envelope = toolEnvelope() as unknown as MutableEnvelope;
  envelope.componentId = '';
  assert.throws(
    () => validateToolComponent(envelope as unknown as ComponentEnvelope),
    (error: unknown) => {
      assert.ok(error instanceof ComponentContractError);
      assert.ok(!(error instanceof ToolComponentContractError));
      assert.equal(error.code, 'INVALID_COMPONENT_ID');
      return true;
    },
  );

  const smuggled = toolEnvelope() as unknown as MutableEnvelope;
  Object.assign(smuggled, { implementationId: 'tool-impl@9' });
  assert.throws(
    () => validateToolComponent(smuggled as unknown as ComponentEnvelope),
    (error: unknown) => {
      assert.ok(error instanceof ComponentContractError);
      assert.equal(error.code, 'INVALID_COMPONENT_ENVELOPE');
      return true;
    },
  );

  const badBody = toolEnvelope({ semanticBody: 'not-a-declaration' });
  assert.throws(
    () => validateToolComponent(badBody),
    (error: unknown) => {
      assert.ok(error instanceof ToolComponentContractError);
      assert.equal(error.code, 'INVALID_TOOL_COMPONENT_ENVELOPE');
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// R11: legacy contracts/tool.ts public surface unchanged.
// ---------------------------------------------------------------------------

test('T003A-R11: legacy HarnessTool/ToolContext/ToolEffect shapes and imports remain usable', async () => {
  const legacyEffect: ToolEffect = 'non-idempotent';
  const legacyTool: HarnessTool<{ rating: string }, { tier: string }> = {
    input: { type: 'object' },
    output: { type: 'object' },
    effect: legacyEffect,
    async execute(input: { rating: string }, _ctx: ToolContext): Promise<{ tier: string }> {
      return { tier: input.rating === 'gold' ? 'gold' : 'standard' };
    },
  };
  assert.equal(legacyTool.effect, 'non-idempotent');
  assert.deepEqual(await legacyTool.execute({ rating: 'gold' }, {} as ToolContext), { tier: 'gold' });

  // The declared Tool effect enum is mutually assignable with the legacy
  // ToolEffect union at runtime in both directions.
  const declaredEffect: ToolOperationEffect = legacyEffect;
  const roundTripped: ToolEffect = declaredEffect;
  assert.equal(roundTripped, 'non-idempotent');
});

test('T003A-R11: the legacy tool module gains no runtime surface from the new contract', async () => {
  const legacyModule = await import('../../src/contracts/tool.js');
  assert.deepEqual(Object.keys(legacyModule).sort(), []);

  const newModule = await import('../../src/contracts/tool-component.js');
  for (const legacyName of ['HarnessTool', 'ToolContext', 'ToolEffect']) {
    assert.equal(legacyName in newModule, false, `unexpected re-export of ${legacyName}`);
  }
});

// ---------------------------------------------------------------------------
// R12: no implementation/resource identity in the definition-plane contract.
// ---------------------------------------------------------------------------

test('T003A-R12: implementation/resource identity fields are fail-closed rejected on the declaration', () => {
  for (const smuggled of [
    'implementation',
    'binding',
    'endpoint',
    'module',
    'provider',
    'resources',
    'secrets',
    'assemblyDigest',
    'activation',
  ]) {
    expectDeclarationFailure((decl) => {
      Object.assign(decl, { [smuggled]: 'injected' });
    }, 'INVALID_TOOL_OPERATIONS');
  }
});

test('T003A-R12: implementation/resource identity fields are fail-closed rejected on an operation', () => {
  for (const smuggled of [
    'implementation',
    'binding',
    'endpoint',
    'module',
    'provider',
    'resources',
    'secrets',
    'assemblyDigest',
    'activation',
  ]) {
    expectOperationFailure((op) => {
      Object.assign(op, { [smuggled]: 'injected' });
    }, 'INVALID_TOOL_OPERATION');
  }
});

test('T003A-R12: unknown non-identity fields on the declaration or operations are also rejected', () => {
  expectDeclarationFailure((decl) => {
    Object.assign(decl, { totallyUnknown: 1 });
  }, 'INVALID_TOOL_OPERATIONS');
  expectOperationFailure((op) => {
    Object.assign(op, { alsoUnknown: true });
  }, 'INVALID_TOOL_OPERATION');
});

test('T003A-R12: operations must be a non-empty array of plain objects', () => {
  expectDeclarationFailure((decl) => {
    delete (decl as { operations?: unknown }).operations;
  }, 'INVALID_TOOL_OPERATIONS');
  expectDeclarationFailure((decl) => {
    decl.operations = [] as unknown as MutableDeclaration['operations'];
  }, 'INVALID_TOOL_OPERATIONS');
  expectDeclarationFailure((decl) => {
    decl.operations = 'lookup.credit-rating' as unknown as MutableDeclaration['operations'];
  }, 'INVALID_TOOL_OPERATIONS');
  expectDeclarationFailure((decl) => {
    decl.operations = [null as unknown as ToolOperationContract];
  }, 'INVALID_TOOL_OPERATION');
  expectDeclarationFailure((decl) => {
    decl.operations = [{ operationId: 'lookup.credit-rating' } as unknown as ToolOperationContract];
  }, 'INVALID_TOOL_OPERATION_INPUT');
});
