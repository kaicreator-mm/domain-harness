/**
 * T007A descriptor + closed-world semantic validator matrix (issue #610,
 * fine-grained DAG T007A, authority #589 PACK-A).
 *
 * The Workflow Kind adapter (`src/adapters/workflow-kind.ts`) is an ADAPTER,
 * not Microkernel semantics: Workflow is one ordinary Semantic Kind
 * implementation behind the generic Kind port. These tests pin the
 * adapter-owned half of the PACK-A T007A checklist:
 *
 * - exact Workflow KindRef/KindImplementation descriptor (frozen exact
 *   identity, exact implementation pin, no floating/range/embedded-selector
 *   identity anywhere);
 * - closed-world Workflow semantic validator: the material `semanticBody` is
 *   validated as exactly {initial, states, transitions} with unique exact
 *   identities and declared-state-referencing transition endpoints; every
 *   unknown material Workflow semantic fails closed, never guesses;
 * - XState/compiler/runtime types are absent from this adapter entirely
 *   (T007A does not execute; T007B owns the bridge into the concrete engine).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { ComponentEnvelope } from '../../src/contracts/component.js';
import {
  WORKFLOW_KIND_REF,
  WORKFLOW_KIND_VERSION,
  WorkflowKindAdapterError,
  createWorkflowKindImplementation,
  validateWorkflowComponent,
  type WorkflowKindImplementationDescriptor,
} from '../../src/adapters/workflow-kind.js';

function workflowComponent(overrides: Partial<ComponentEnvelope> = {}): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId: 'component.workflow.alpha',
    kind: { kindId: WORKFLOW_KIND_REF.kindId, version: WORKFLOW_KIND_VERSION },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: {
      initial: 'start',
      states: [{ stateId: 'start' }, { stateId: 'done' }],
      transitions: [{ transitionId: 't1', from: 'start', to: 'done', event: 'finish' }],
    },
    ...overrides,
  };
}

function descriptor(
  overrides: Partial<WorkflowKindImplementationDescriptor['implementation']> = {},
): WorkflowKindImplementationDescriptor {
  return {
    implementation: {
      implementationId: 'impl.workflow.xstate-bridge',
      implementationVersion: '1.0.0',
      implementationDigest: 'sha256:workflow-implementation-content',
      ...overrides,
    },
  };
}

// ---------------------------------------------------------------------------
// Exact Workflow KindRef / KindImplementation descriptor
// ---------------------------------------------------------------------------

test('PACK-A T007A: the Workflow KindRef is one exact frozen identity', () => {
  assert.deepEqual(WORKFLOW_KIND_REF, { kindId: 'kaicreator.workflow', version: '1.0.0' });
  assert.ok(Object.isFrozen(WORKFLOW_KIND_REF));
});

test('PACK-A T007A: the descriptor binds the exact KindRef to the exact implementation pin', () => {
  const binding = createWorkflowKindImplementation(descriptor());

  assert.deepEqual(binding.pin.kind, { kindId: 'kaicreator.workflow', version: '1.0.0' });
  assert.equal(binding.pin.implementation.implementationId, 'impl.workflow.xstate-bridge');
  assert.equal(binding.pin.implementation.implementationVersion, '1.0.0');
  assert.equal(
    binding.pin.implementation.implementationDigest,
    'sha256:workflow-implementation-content',
  );
  assert.deepEqual(binding.understoodSemanticContracts, []);
  assert.deepEqual(binding.understoodCapabilities, []);
  assert.equal(binding.validateComponent, validateWorkflowComponent);
});

test('PACK-A T007A: the descriptor output is fully frozen and non-aliasing', () => {
  const contract = { contractId: 'kaicreator.workflow.graph', version: '1.0.0' };
  const capability = { capabilityId: 'kaicreator.capability.timers', version: '1.0.0' };
  const binding = createWorkflowKindImplementation({
    ...descriptor(),
    understoodSemanticContracts: [contract],
    understoodCapabilities: [capability],
  });

  assert.ok(Object.isFrozen(binding));
  assert.ok(Object.isFrozen(binding.pin));
  assert.ok(Object.isFrozen(binding.pin.kind));
  assert.ok(Object.isFrozen(binding.pin.implementation));
  assert.notEqual(binding.understoodSemanticContracts[0], contract);
  assert.notEqual(binding.understoodCapabilities[0], capability);
});

test('PACK-A T007A: descriptor identity is exact — floating/range/embedded-selector forms fail closed', () => {
  const rejections: Array<[string, Record<string, unknown>]> = [
    ['floating implementationId', { implementationId: 'latest' }],
    ['range implementationVersion', { implementationVersion: '^1.0.0' }],
    ['x-range implementationVersion', { implementationVersion: '1.x' }],
    ['embedded selector implementationId', { implementationId: 'impl@1.0.0' }],
    ['empty implementationId', { implementationId: '' }],
    ['empty digest', { implementationDigest: '' }],
    ['selector-looking digest', { implementationDigest: 'latest' }],
  ];
  for (const [label, implementationOverrides] of rejections) {
    assert.throws(
      () =>
        createWorkflowKindImplementation(
          descriptor(implementationOverrides) as WorkflowKindImplementationDescriptor,
        ),
      (error: unknown) => {
        assert.ok(error instanceof WorkflowKindAdapterError, `${label} must fail typed`);
        assert.equal(error.code, 'INVALID_WORKFLOW_IMPLEMENTATION_DESCRIPTOR', `${label}`);
        return true;
      },
    );
  }
});

test('PACK-A T007A: descriptor structural defects (extra fields, non-record) fail typed', () => {
  assert.throws(
    () =>
      createWorkflowKindImplementation({
        ...descriptor(),
        provider: 'acme',
      } as unknown as WorkflowKindImplementationDescriptor),
    (error: unknown) => {
      assert.ok(error instanceof WorkflowKindAdapterError);
      assert.equal(error.code, 'INVALID_WORKFLOW_IMPLEMENTATION_DESCRIPTOR');
      return true;
    },
  );
  assert.throws(
    () =>
      createWorkflowKindImplementation({
        implementation: null,
      } as unknown as WorkflowKindImplementationDescriptor),
    (error: unknown) => {
      assert.ok(error instanceof WorkflowKindAdapterError);
      assert.equal(error.code, 'INVALID_WORKFLOW_IMPLEMENTATION_DESCRIPTOR');
      return true;
    },
  );
  // Accessor-backed descriptor material is descriptor-unsafe and fails closed
  // without executing the getter through the authority path.
  const accessorBacked = {};
  Object.defineProperty(accessorBacked, 'implementation', {
    enumerable: true,
    get() {
      throw new Error('getter must never execute during descriptor validation');
    },
  });
  assert.throws(
    () =>
      createWorkflowKindImplementation(
        accessorBacked as WorkflowKindImplementationDescriptor,
      ),
    (error: unknown) => {
      assert.ok(error instanceof WorkflowKindAdapterError);
      assert.equal(error.code, 'INVALID_WORKFLOW_IMPLEMENTATION_DESCRIPTOR');
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// Closed-world Workflow semantic validator
// ---------------------------------------------------------------------------

test('PACK-A T007A: the closed-world validator accepts a well-formed Workflow semantic body', () => {
  assert.doesNotThrow(() => validateWorkflowComponent(workflowComponent()));
  // Minimal closed-world body: one state, no transitions.
  assert.doesNotThrow(() =>
    validateWorkflowComponent(
      workflowComponent({
        semanticBody: { initial: 'only', states: [{ stateId: 'only' }], transitions: [] },
      }),
    ),
  );
});

test('PACK-A T007A: the validator only serves its own exact Kind — family and KindRef mismatch fail closed', () => {
  assert.throws(
    () => validateWorkflowComponent(workflowComponent({ family: 'tool' })),
    (error: unknown) => {
      assert.ok(error instanceof WorkflowKindAdapterError);
      assert.equal(error.code, 'INVALID_WORKFLOW_COMPONENT_FAMILY');
      return true;
    },
  );
  assert.throws(
    () =>
      validateWorkflowComponent(
        workflowComponent({ kind: { kindId: 'kaicreator.workflow', version: '0.9.0' } }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof WorkflowKindAdapterError);
      assert.equal(error.code, 'WORKFLOW_KIND_MISMATCH');
      return true;
    },
  );
  assert.throws(
    () =>
      validateWorkflowComponent(
        workflowComponent({ kind: { kindId: 'test.semantic.neutral', version: '1.0.0' } }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof WorkflowKindAdapterError);
      assert.equal(error.code, 'WORKFLOW_KIND_MISMATCH');
      return true;
    },
  );
});

test('PACK-A T007A: unknown material Workflow semantics fail closed (unknown body/state/transition fields)', () => {
  // Unknown top-level material field — never silently preserved as semantics.
  assert.throws(
    () =>
      validateWorkflowComponent(
        workflowComponent({
          semanticBody: {
            initial: 'start',
            states: [{ stateId: 'start' }],
            transitions: [],
            onError: 'escalate',
          },
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof WorkflowKindAdapterError);
      assert.equal(error.code, 'UNKNOWN_WORKFLOW_SEMANTIC_FIELD');
      return true;
    },
  );
  // Unknown state field.
  assert.throws(
    () =>
      validateWorkflowComponent(
        workflowComponent({
          semanticBody: {
            initial: 'start',
            states: [{ stateId: 'start', invoke: 'tool.alpha' }],
            transitions: [],
          },
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof WorkflowKindAdapterError);
      assert.equal(error.code, 'INVALID_WORKFLOW_STATE');
      return true;
    },
  );
  // Unknown transition field.
  assert.throws(
    () =>
      validateWorkflowComponent(
        workflowComponent({
          semanticBody: {
            initial: 'start',
            states: [{ stateId: 'start' }, { stateId: 'done' }],
            transitions: [{ transitionId: 't1', from: 'start', to: 'done', guard: 'expr' }],
          },
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof WorkflowKindAdapterError);
      assert.equal(error.code, 'INVALID_WORKFLOW_TRANSITION');
      return true;
    },
  );
});

test('PACK-A T007A: closed-world structural failures (empty/duplicate states, duplicates, dangling endpoints)', () => {
  // Empty state set — a Workflow declares at least one state.
  assert.throws(
    () =>
      validateWorkflowComponent(
        workflowComponent({ semanticBody: { initial: 'start', states: [], transitions: [] } }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof WorkflowKindAdapterError);
      assert.equal(error.code, 'INVALID_WORKFLOW_STATES');
      return true;
    },
  );
  // Duplicate state identities are never deduplicated.
  assert.throws(
    () =>
      validateWorkflowComponent(
        workflowComponent({
          semanticBody: { initial: 'start', states: [{ stateId: 'start' }, { stateId: 'start' }], transitions: [] },
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof WorkflowKindAdapterError);
      assert.equal(error.code, 'INVALID_WORKFLOW_STATES');
      return true;
    },
  );
  // Duplicate transition identities.
  assert.throws(
    () =>
      validateWorkflowComponent(
        workflowComponent({
          semanticBody: {
            initial: 'start',
            states: [{ stateId: 'start' }, { stateId: 'done' }],
            transitions: [
              { transitionId: 't1', from: 'start', to: 'done' },
              { transitionId: 't1', from: 'start', to: 'done' },
            ],
          },
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof WorkflowKindAdapterError);
      assert.equal(error.code, 'INVALID_WORKFLOW_TRANSITIONS');
      return true;
    },
  );
  // Transition endpoints must reference declared states — no implicit creation.
  for (const endpoint of ['from', 'to'] as const) {
    assert.throws(
      () =>
        validateWorkflowComponent(
          workflowComponent({
            semanticBody: {
              initial: 'start',
              states: [{ stateId: 'start' }],
              transitions: [{ transitionId: 't1', from: 'start', to: 'start', [endpoint]: 'ghost' }],
            },
          }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof WorkflowKindAdapterError);
        assert.equal(error.code, 'UNKNOWN_WORKFLOW_STATE_REFERENCE');
        return true;
      },
    );
  }
  // Initial state must reference a declared state.
  assert.throws(
    () =>
      validateWorkflowComponent(
        workflowComponent({
          semanticBody: { initial: 'ghost', states: [{ stateId: 'start' }], transitions: [] },
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof WorkflowKindAdapterError);
      assert.equal(error.code, 'UNKNOWN_WORKFLOW_STATE_REFERENCE');
      return true;
    },
  );
});

test('PACK-A T007A: non-record and accessor-backed semantic bodies fail descriptor-safe', () => {
  assert.throws(
    () => validateWorkflowComponent(workflowComponent({ semanticBody: ['start'] })),
    (error: unknown) => {
      assert.ok(error instanceof WorkflowKindAdapterError);
      assert.equal(error.code, 'INVALID_WORKFLOW_SEMANTIC_BODY');
      return true;
    },
  );
  // Accessor-backed body material is descriptor-unsafe: the base envelope
  // contract rejects it (its getter never executes through the authority
  // path) before the Kind validator runs.
  const accessorBacked = { initial: 'start', transitions: [] };
  Object.defineProperty(accessorBacked, 'states', {
    enumerable: true,
    get() {
      throw new Error('getter must never execute during semantic validation');
    },
  });
  assert.throws(
    () =>
      validateWorkflowComponent(
        workflowComponent({
          semanticBody: accessorBacked,
        }),
      ),
    (error: unknown) => {
      assert.equal(
        (error as { name?: string }).name,
        'ComponentContractError',
        'base envelope validation rejects accessor-backed material first',
      );
      return true;
    },
  );
});
