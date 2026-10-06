/**
 * #642 invariant matrix — Workflow Kind adapter mapped-array immutability
 * group (same shape as the #641/#748 RuntimeAssembly matrix, scoped to the
 * T007A adapter).
 *
 * Single concern (one-concern-one-PR): authority-relevant mapped arrays
 * minted by `createWorkflowKindImplementation` must be immutable/non-aliased
 * BEFORE they enter sealed binding material. Covers:
 *
 *  M1. the mapped `understoodSemanticContracts` / `understoodCapabilities`
 *      arrays on the returned binding are runtime-frozen (the mapped arrays
 *      themselves, not only their per-element refs);
 *  M2. mutation attempts against the RETURNED mapped arrays fail closed
 *      (strict-mode TypeError) and cannot change binding evidence, the
 *      accepted structure or the validator identity;
 *  M3. mutation of CALLER-OWNED descriptor arrays/elements after the adapter
 *      returns cannot change the returned binding (snapshot isolation);
 *  M4. directly analogous T007A-owned frozen material stays frozen (default
 *      empty arrays, pin records, the exact Workflow KindRef) — no other
 *      module's arrays are touched;
 *  M5. legitimate descriptors keep the exact accepted structure and
 *      byte/semantic identity (stable JSON binding evidence, identical
 *      validator identity across calls).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WORKFLOW_KIND_REF,
  createWorkflowKindImplementation,
  validateWorkflowComponent,
  type WorkflowKindImplementationDescriptor,
} from '../../src/adapters/workflow-kind.js';

type MutableSemanticRef = { contractId: string; version: string };
type MutableCapabilityRef = { capabilityId: string; version: string };

/** One legitimate, minimal two-ref descriptor (nothing exotic). */
function descriptorWithRefs(): WorkflowKindImplementationDescriptor {
  return {
    implementation: {
      implementationId: 'impl.workflow.xstate-bridge',
      implementationVersion: '1.0.0',
      implementationDigest: 'sha256:workflow-implementation-content',
    },
    understoodSemanticContracts: [{ contractId: 'contract.a', version: '1.0.0' }],
    understoodCapabilities: [{ capabilityId: 'cap.a', version: '1.0.0' }],
  };
}

test('#642 M1: adapter mapped understoodSemanticContracts/understoodCapabilities arrays are runtime-frozen', () => {
  const binding = createWorkflowKindImplementation(descriptorWithRefs());

  assert.ok(
    Object.isFrozen(binding.understoodSemanticContracts),
    'the mapped understoodSemanticContracts array on the returned binding must itself be frozen',
  );
  assert.ok(
    Object.isFrozen(binding.understoodCapabilities),
    'the mapped understoodCapabilities array on the returned binding must itself be frozen',
  );
  const semanticRef = binding.understoodSemanticContracts[0];
  const capabilityRef = binding.understoodCapabilities[0];
  assert.ok(semanticRef, 'mapped semantic ref must exist');
  assert.ok(capabilityRef, 'mapped capability ref must exist');
  assert.ok(Object.isFrozen(semanticRef), 'each mapped semantic ref must be frozen');
  assert.ok(Object.isFrozen(capabilityRef), 'each mapped capability ref must be frozen');
});

test('#642 M2: mutating returned adapter mapped arrays fails closed and cannot change binding evidence', () => {
  const control = createWorkflowKindImplementation(descriptorWithRefs());
  const binding = createWorkflowKindImplementation(descriptorWithRefs());
  const evidenceBefore = JSON.stringify(binding);

  // Every mutation surface of the returned mapped arrays must fail closed.
  const semanticArray = binding.understoodSemanticContracts as unknown as MutableSemanticRef[];
  const capabilityArray = binding.understoodCapabilities as unknown as MutableCapabilityRef[];
  assert.throws(
    () => semanticArray.push({ contractId: 'contract.late', version: '9.9.9' }),
    TypeError,
    'push onto an adapter mapped array must throw (pre-seal aliasing hole)',
  );
  assert.throws(
    () => capabilityArray.unshift({ capabilityId: 'cap.late', version: '9.9.9' }),
    TypeError,
    'unshift onto an adapter mapped array must throw',
  );
  assert.throws(
    () => {
      semanticArray[0] = { contractId: 'contract.evil', version: '0.0.1' };
    },
    TypeError,
    'element assignment into an adapter mapped array must throw',
  );
  assert.throws(
    () => semanticArray.splice(0, 1),
    TypeError,
    'splice on an adapter mapped array must throw',
  );
  assert.throws(
    () => capabilityArray.pop(),
    TypeError,
    'pop from an adapter mapped array must throw',
  );
  const semanticElement = binding.understoodSemanticContracts[0] as unknown as MutableSemanticRef;
  assert.throws(
    () => {
      semanticElement.contractId = 'contract.evil';
    },
    TypeError,
    'field mutation of a mapped ref must throw',
  );

  // The failed attempts changed nothing: contents, structure and the
  // binding evidence minted from the same descriptor are identical.
  assert.deepEqual(
    binding.understoodSemanticContracts,
    [{ contractId: 'contract.a', version: '1.0.0' }],
  );
  assert.deepEqual(
    binding.understoodCapabilities,
    [{ capabilityId: 'cap.a', version: '1.0.0' }],
  );
  assert.equal(JSON.stringify(binding), evidenceBefore);
  assert.equal(JSON.stringify(binding), JSON.stringify(control));
  assert.equal(binding.validateComponent, control.validateComponent);
});

test('#642 M3: mutating caller-owned descriptor arrays/elements after adapter return cannot change the binding', () => {
  const descriptor = descriptorWithRefs();
  const semanticRefs = descriptor.understoodSemanticContracts as MutableSemanticRef[];
  const capabilityRefs = descriptor.understoodCapabilities as MutableCapabilityRef[];
  const binding = createWorkflowKindImplementation(descriptor);

  // Hostile post-return caller mutations of the ORIGINAL arrays/elements.
  semanticRefs.push({ contractId: 'contract.late', version: '9.9.9' });
  const semanticElement = semanticRefs[0];
  assert.ok(semanticElement, 'caller-owned semantic ref must exist');
  semanticElement.contractId = 'contract.evil';
  capabilityRefs.pop();
  capabilityRefs.push({ capabilityId: 'cap.late', version: '9.9.9' });

  assert.deepEqual(
    binding.understoodSemanticContracts,
    [{ contractId: 'contract.a', version: '1.0.0' }],
    'the binding must reflect only the adapter-time snapshot',
  );
  assert.deepEqual(
    binding.understoodCapabilities,
    [{ capabilityId: 'cap.a', version: '1.0.0' }],
  );
});

test('#642 M4: directly analogous T007A-owned material stays frozen (defaults, pin, KindRef)', () => {
  // Descriptor WITHOUT understood* arrays: the minted default empties.
  const emptyBinding = createWorkflowKindImplementation({
    implementation: {
      implementationId: 'impl.workflow.xstate-bridge',
      implementationVersion: '1.0.0',
      implementationDigest: 'sha256:workflow-implementation-content',
    },
  });
  assert.ok(
    Object.isFrozen(emptyBinding.understoodSemanticContracts),
    'the default understoodSemanticContracts array must be frozen',
  );
  assert.ok(
    Object.isFrozen(emptyBinding.understoodCapabilities),
    'the default understoodCapabilities array must be frozen',
  );
  assert.equal(emptyBinding.understoodSemanticContracts.length, 0);
  assert.equal(emptyBinding.understoodCapabilities.length, 0);

  // The pin records and the exact KindRef.
  const binding = createWorkflowKindImplementation(descriptorWithRefs());
  assert.ok(Object.isFrozen(binding.pin), 'the binding pin must be frozen');
  assert.ok(Object.isFrozen(binding.pin.kind), 'the pin kind must be frozen');
  assert.ok(Object.isFrozen(binding.pin.implementation), 'the pin implementation must be frozen');
  assert.ok(Object.isFrozen(binding), 'the returned binding itself must be frozen');
  assert.ok(Object.isFrozen(WORKFLOW_KIND_REF), 'the exact Workflow KindRef must be frozen');
  assert.equal(WORKFLOW_KIND_REF.kindId, 'kaicreator.workflow');
  assert.equal(WORKFLOW_KIND_REF.version, '1.0.0');
});

test('#642 M5: legitimate descriptors keep the exact accepted structure and semantic identity', () => {
  const first = createWorkflowKindImplementation(descriptorWithRefs());
  const second = createWorkflowKindImplementation(descriptorWithRefs());

  assert.deepEqual(Object.keys(first), [
    'pin',
    'understoodSemanticContracts',
    'understoodCapabilities',
    'validateComponent',
  ]);
  assert.deepEqual(Object.keys(second), Object.keys(first));
  assert.deepEqual(
    Object.keys(first.understoodSemanticContracts[0] as object),
    ['contractId', 'version'],
    'mapped semantic refs keep the exact accepted ref shape',
  );
  assert.deepEqual(
    Object.keys(first.understoodCapabilities[0] as object),
    ['capabilityId', 'version'],
    'mapped capability refs keep the exact accepted ref shape',
  );
  assert.equal(JSON.stringify(first), JSON.stringify(second), 'identical descriptors mint byte-identical binding evidence');
  assert.equal(first.validateComponent, validateWorkflowComponent, 'validator identity is the adapter-owned closed-world validator');
  assert.equal(second.validateComponent, validateWorkflowComponent);
});
