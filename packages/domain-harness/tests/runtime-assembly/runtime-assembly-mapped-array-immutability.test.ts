/**
 * #641 invariant matrix — sealed mapped-array immutability group.
 *
 * Single concern (one-concern-one-PR): authority-bearing mapped arrays
 * inside sealed RuntimeAssembly bindings must be deeply immutable and
 * non-aliased. Covers:
 *
 *  M1. the mapped `understoodSemanticContracts` / `understoodCapabilities`
 *      arrays minted into each sealed binding are runtime-frozen (the mapped
 *      arrays themselves, not only their per-element refs);
 *  M2. mutation attempts against the RETURNED sealed mapped arrays fail
 *      closed (strict-mode TypeError) and cannot change sealed admission
 *      evidence, currentness or digest behavior;
 *  M3. mutation of CALLER-OWNED input arrays/elements after sealing cannot
 *      change sealed admission evidence or Assembly identity;
 *  M4. directly analogous arrays already owned by RuntimeAssembly
 *      sealing/admission minting stay deeply frozen (record arrays, pins,
 *      admission evidence arrays) — no other module's arrays are touched;
 *  M5. legitimate descriptor-safe inputs keep the exact accepted structure
 *      and byte/semantic identity (identical digest across identical seals).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import type { ComponentEnvelope } from '../../src/contracts/component.js';
import type { DefinitionGraphEnvelope } from '../../src/contracts/definition-graph.js';
import type { Sha256Port } from '../../src/contracts/identity.js';
import {
  admitComponentWithAssembly,
  sealRuntimeAssembly,
  type KindImplementationBindingInput,
  type SealRuntimeAssemblyInput,
  type SealedKindImplementationBinding,
  type SealedRuntimeAssembly,
} from '../../src/contracts/runtime-assembly.js';

const realSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

function component(componentId: string): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId,
    kind: { kindId: 'example.semantic-kind', version: '1.0.0' },
    requiredSemanticContracts: [{ contractId: 'contract.a', version: '1.0.0' }],
    requiredCapabilities: [{ capabilityId: 'cap.a', version: '1.0.0' }],
    semanticBody: { threshold: 10 },
  };
}

function graph(): DefinitionGraphEnvelope {
  return {
    graphId: 'graph.mapped-array-immutability',
    components: [component('component.a')],
    relations: [],
  };
}

type MutableSemanticRef = { contractId: string; version: string };
type MutableCapabilityRef = { capabilityId: string; version: string };

/**
 * Builds one binding input while keeping live references to the caller-owned
 * mapped arrays and their element objects, so tests can mutate them after
 * sealing exactly like a hostile or careless caller would.
 */
function aliasedBindingInput(): {
  input: KindImplementationBindingInput;
  semanticRefs: MutableSemanticRef[];
  capabilityRefs: MutableCapabilityRef[];
} {
  const semanticRefs: MutableSemanticRef[] = [{ contractId: 'contract.a', version: '1.0.0' }];
  const capabilityRefs: MutableCapabilityRef[] = [{ capabilityId: 'cap.a', version: '1.0.0' }];
  const input: KindImplementationBindingInput = {
    pin: {
      kind: { kindId: 'example.semantic-kind', version: '1.0.0' },
      implementation: {
        implementationId: 'impl.semantic-kind.alpha',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:alpha-content',
      },
    },
    understoodSemanticContracts: semanticRefs,
    understoodCapabilities: capabilityRefs,
    validateComponent: () => {},
  };
  return { input, semanticRefs, capabilityRefs };
}

async function seal(input: SealRuntimeAssemblyInput): Promise<SealedRuntimeAssembly> {
  return sealRuntimeAssembly(input, realSha256);
}

/** The single sealed binding of the one-binding test assembly (asserted present). */
function soleBinding(assembly: SealedRuntimeAssembly): SealedKindImplementationBinding {
  const binding = assembly.bindings[0];
  assert.ok(binding, 'sealed assembly must expose exactly the one sealed binding');
  return binding;
}

test('#641 M1: sealed binding mapped understoodSemanticContracts/understoodCapabilities arrays are runtime-frozen', async () => {
  const { input } = aliasedBindingInput();
  const assembly = await seal({ definitionGraph: graph(), kindImplementations: [input] });
  const binding = soleBinding(assembly);

  assert.ok(Object.isFrozen(assembly.bindings), 'bindings array must be frozen');
  assert.ok(Object.isFrozen(binding), 'each sealed binding must be frozen');
  assert.ok(
    Object.isFrozen(binding.understoodSemanticContracts),
    'the mapped understoodSemanticContracts array minted into a sealed binding must itself be frozen',
  );
  assert.ok(
    Object.isFrozen(binding.understoodCapabilities),
    'the mapped understoodCapabilities array minted into a sealed binding must itself be frozen',
  );
  const semanticRef = binding.understoodSemanticContracts[0];
  const capabilityRef = binding.understoodCapabilities[0];
  assert.ok(semanticRef, 'mapped semantic ref must exist');
  assert.ok(capabilityRef, 'mapped capability ref must exist');
  assert.ok(Object.isFrozen(semanticRef), 'each mapped semantic ref must be frozen');
  assert.ok(Object.isFrozen(capabilityRef), 'each mapped capability ref must be frozen');
});

test('#641 M2: mutating returned sealed mapped arrays fails closed and cannot change admission evidence or digest', async () => {
  const { input } = aliasedBindingInput();
  const assembly = await seal({ definitionGraph: graph(), kindImplementations: [input] });
  const binding = soleBinding(assembly);
  const digestBefore = assembly.assemblyDigest;

  const evidenceBefore = await admitComponentWithAssembly(component('component.a'), assembly, {
    currentDefinitionGraph: graph(),
    sha256: realSha256,
  });

  // Every mutation surface of the returned mapped arrays must fail closed.
  const semanticArray = binding.understoodSemanticContracts as unknown as MutableSemanticRef[];
  const capabilityArray = binding.understoodCapabilities as unknown as MutableCapabilityRef[];
  assert.throws(
    () => semanticArray.push({ contractId: 'contract.late', version: '9.9.9' }),
    TypeError,
    'push onto a sealed binding mapped array must throw',
  );
  assert.throws(
    () => capabilityArray.unshift({ capabilityId: 'cap.late', version: '9.9.9' }),
    TypeError,
    'unshift onto a sealed binding mapped array must throw',
  );
  assert.throws(
    () => {
      semanticArray[0] = { contractId: 'contract.evil', version: '0.0.1' };
    },
    TypeError,
    'element assignment into a sealed binding mapped array must throw',
  );
  assert.throws(
    () => semanticArray.splice(0, 1),
    TypeError,
    'splice on a sealed binding mapped array must throw',
  );
  const semanticElement = binding.understoodSemanticContracts[0] as unknown as MutableSemanticRef;
  assert.throws(
    () => {
      semanticElement.contractId = 'contract.evil';
    },
    TypeError,
    'field mutation of a sealed mapped ref must throw',
  );
  assert.throws(
    () => capabilityArray.pop(),
    TypeError,
    'pop from a sealed binding mapped array must throw',
  );

  // The failed attempts changed nothing: length, contents, digest and the
  // admission evidence minted from the same sealed Assembly are identical.
  assert.equal(binding.understoodSemanticContracts.length, 1);
  assert.equal(binding.understoodCapabilities.length, 1);
  assert.deepEqual(binding.understoodSemanticContracts, [{ contractId: 'contract.a', version: '1.0.0' }]);
  assert.deepEqual(binding.understoodCapabilities, [{ capabilityId: 'cap.a', version: '1.0.0' }]);
  assert.equal(assembly.assemblyDigest, digestBefore);

  const evidenceAfter = await admitComponentWithAssembly(component('component.a'), assembly, {
    currentDefinitionGraph: graph(),
    sha256: realSha256,
  });
  assert.deepEqual(
    evidenceAfter.admittedSemanticContracts,
    evidenceBefore.admittedSemanticContracts,
  );
  assert.deepEqual(evidenceAfter.admittedCapabilities, evidenceBefore.admittedCapabilities);
  assert.equal(evidenceAfter.assemblyDigest, digestBefore);
  assert.equal(evidenceAfter.definitionGraphDigest, evidenceBefore.definitionGraphDigest);
});

test('#641 M3: mutating caller-owned mapped arrays/elements after sealing cannot change sealed evidence or identity', async () => {
  const aliased = aliasedBindingInput();
  const control = await seal({
    definitionGraph: graph(),
    kindImplementations: [aliasedBindingInput().input],
  });

  const assembly = await seal({ definitionGraph: graph(), kindImplementations: [aliased.input] });
  assert.equal(assembly.assemblyDigest, control.assemblyDigest);
  const binding = soleBinding(assembly);

  // Hostile post-seal caller mutations of the ORIGINAL arrays and elements.
  aliased.semanticRefs.push({ contractId: 'contract.late', version: '9.9.9' });
  const aliasedSemanticElement = aliased.semanticRefs[0];
  assert.ok(aliasedSemanticElement, 'caller-owned semantic ref must exist');
  aliasedSemanticElement.contractId = 'contract.evil';
  aliased.capabilityRefs.pop();
  (aliased.input.understoodCapabilities as unknown as MutableCapabilityRef[]).push({ capabilityId: 'cap.late', version: '9.9.9' });

  assert.equal(assembly.assemblyDigest, control.assemblyDigest, 'Assembly identity must not track caller-owned arrays');
  assert.deepEqual(
    binding.understoodSemanticContracts,
    [{ contractId: 'contract.a', version: '1.0.0' }],
    'sealed mapped arrays must reflect only the sealing-time snapshot',
  );
  assert.deepEqual(
    binding.understoodCapabilities,
    [{ capabilityId: 'cap.a', version: '1.0.0' }],
  );

  const evidence = await admitComponentWithAssembly(component('component.a'), assembly, {
    currentDefinitionGraph: graph(),
    sha256: realSha256,
  });
  assert.deepEqual(evidence.admittedSemanticContracts, [{ contractId: 'contract.a', version: '1.0.0' }]);
  assert.deepEqual(evidence.admittedCapabilities, [{ capabilityId: 'cap.a', version: '1.0.0' }]);
  assert.equal(evidence.assemblyDigest, control.assemblyDigest);
});

test('#641 M4: directly analogous RuntimeAssembly-owned arrays stay deeply frozen', async () => {
  const { input } = aliasedBindingInput();
  const assembly = await seal({
    definitionGraph: graph(),
    kindImplementations: [input],
    resourceRequirements: [],
    implementationBindingEvidence: [
      { subject: 'subject.alpha', bindingDigest: 'sha256:evidence-alpha' },
    ],
  });
  const pin = assembly.record.kindImplementations[0];
  const evidenceSlot = assembly.record.implementationBindingEvidence[0];
  assert.ok(pin, 'record pin must exist');
  assert.ok(evidenceSlot, 'evidence slot must exist');

  assert.ok(Object.isFrozen(assembly.record));
  assert.ok(Object.isFrozen(assembly.record.kindImplementations));
  assert.ok(Object.isFrozen(pin));
  assert.ok(Object.isFrozen(pin.kind));
  assert.ok(Object.isFrozen(pin.implementation));
  assert.ok(Object.isFrozen(assembly.record.resourceRequirements));
  assert.ok(Object.isFrozen(assembly.record.implementationBindingEvidence));
  assert.ok(Object.isFrozen(evidenceSlot));

  const evidence = await admitComponentWithAssembly(component('component.a'), assembly, {
    currentDefinitionGraph: graph(),
    sha256: realSha256,
  });
  assert.ok(Object.isFrozen(evidence));
  assert.ok(Object.isFrozen(evidence.admittedSemanticContracts));
  assert.ok(Object.isFrozen(evidence.admittedSemanticContracts[0]));
  assert.ok(Object.isFrozen(evidence.admittedCapabilities));
  assert.ok(Object.isFrozen(evidence.admittedCapabilities[0]));
  assert.throws(
    () => (evidence.admittedSemanticContracts as unknown as MutableSemanticRef[]).push({ contractId: 'contract.late', version: '9.9.9' }),
    TypeError,
    'admission evidence mapped arrays must reject mutation',
  );
});

test('#641 M5: legitimate inputs keep exact structure and byte/semantic identity across seals', async () => {
  const first = await seal({
    definitionGraph: graph(),
    kindImplementations: [aliasedBindingInput().input],
  });
  const second = await seal({
    definitionGraph: graph(),
    kindImplementations: [aliasedBindingInput().input],
  });
  const firstBinding = soleBinding(first);
  const secondBinding = soleBinding(second);

  assert.equal(first.assemblyDigest, second.assemblyDigest);
  assert.equal(JSON.stringify(first.record), JSON.stringify(second.record));
  assert.equal(first.record.digestDomain, 'kaicreator.runtime-assembly.digest.v1');
  assert.deepEqual(Object.keys(first.record).sort(), [
    'definitionGraphDigest',
    'digestDomain',
    'implementationBindingEvidence',
    'kindImplementations',
    'resourceRequirements',
  ]);
  assert.deepEqual(
    Object.keys(firstBinding).sort(),
    ['pin', 'understoodCapabilities', 'understoodSemanticContracts', 'validateComponent'],
    'sealed binding structure must remain exactly the accepted shape',
  );
  assert.deepEqual(
    Object.keys(secondBinding).sort(),
    ['pin', 'understoodCapabilities', 'understoodSemanticContracts', 'validateComponent'],
  );
});
