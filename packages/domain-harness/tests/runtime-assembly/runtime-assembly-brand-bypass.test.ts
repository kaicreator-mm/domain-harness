/**
 * T002B adversarial brand-bypass regressions (issues #587, #601; fresh
 * independent review on PR #604, issuecomment-5985955943, finding P1).
 *
 * The independent review confirmed two deterministic forgery paths against
 * the property-style unique-symbol brand check in runtime-assembly.ts at the
 * pinned PR head:
 *
 *  (a) PROTOTYPE-CHAIN FORGERY (review probe P1b): `Object.create(genuine,
 *      { bindings: attacker no-op bindings })` inherits the brand property
 *      through the prototype chain while shadowing the genuine bindings;
 *      record/assemblyDigest are inherited from the genuine sealed Assembly.
 *  (b) SYMBOL-THEFT FORGERY (review probe P1c): `sealRuntimeAssembly` is
 *      exported, so any caller self-seals once, extracts the module-private
 *      brand symbol via `Object.getOwnPropertySymbols`, and forges
 *      `{ record, assemblyDigest, bindings, [stolenBrand]: true }` — the
 *      record/digest are public serializable identity material (#587 §A), so
 *      no secret possession is needed.
 *
 * Both must fail closed with INVALID_ASSEMBLY_INPUT before any validator
 * runs (neither the forged no-op nor the genuine validator executes), and
 * the negative control proves genuine sealed Assemblies — including a test
 * self-built Kind — still admit normally (no over-tightening).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import type { ComponentEnvelope } from '../../src/contracts/component.js';
import type { DefinitionGraphEnvelope } from '../../src/contracts/definition-graph.js';
import type { Sha256Port } from '../../src/contracts/identity.js';
import {
  RuntimeAssemblyError,
  admitComponentWithAssembly,
  sealRuntimeAssembly,
  type KindImplementationBindingInput,
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
    graphId: 'graph.brand-bypass',
    components: [component('component.a')],
    relations: [],
  };
}

const GENUINE_PIN = {
  kind: { kindId: 'example.semantic-kind', version: '1.0.0' },
  implementation: {
    implementationId: 'impl.semantic-kind.alpha',
    implementationVersion: '1.0.0',
    implementationDigest: 'sha256:alpha-content',
  },
} as const;

/**
 * The genuine sealed binding: a validator that deterministically REJECTS the
 * probe component used by the forgery attempts. If a forged assembly ever
 * mints ADMITTED evidence for that probe, the genuine validator provably did
 * not run.
 */
function genuineBinding(genuineCalls: { calls: number }): KindImplementationBindingInput {
  return {
    pin: { ...GENUINE_PIN, kind: { ...GENUINE_PIN.kind }, implementation: { ...GENUINE_PIN.implementation } },
    understoodSemanticContracts: [{ contractId: 'contract.a', version: '1.0.0' }],
    understoodCapabilities: [{ capabilityId: 'cap.a', version: '1.0.0' }],
    validateComponent: (envelope: ComponentEnvelope) => {
      genuineCalls.calls += 1;
      throw new Error(`genuine validator deterministically rejects ${envelope.componentId}`);
    },
  };
}

/** Attacker material: a no-op validator that accepts everything. */
function attackerBinding(attackerCalls: { calls: number }) {
  return {
    pin: { ...GENUINE_PIN, kind: { ...GENUINE_PIN.kind }, implementation: { ...GENUINE_PIN.implementation } },
    understoodSemanticContracts: [{ contractId: 'contract.a', version: '1.0.0' }],
    understoodCapabilities: [{ capabilityId: 'cap.a', version: '1.0.0' }],
    validateComponent: () => {
      attackerCalls.calls += 1;
    },
  };
}

/** The probe component: one the genuine validator always rejects. */
const PROBE = component('component.attacker-probe');

async function genuineSealedAssembly(genuineCalls: { calls: number }): Promise<SealedRuntimeAssembly> {
  return sealRuntimeAssembly(
    { definitionGraph: graph(), kindImplementations: [genuineBinding(genuineCalls)] },
    realSha256,
  );
}

function assertBrandRejection(error: unknown): boolean {
  assert.ok(error instanceof RuntimeAssemblyError);
  assert.equal(error.code, 'INVALID_ASSEMBLY_INPUT');
  return true;
}

test('P1(a) review probe: prototype-chain forgery (Object.create with own no-op bindings) fails closed and no validator runs', async () => {
  const genuineCalls = { calls: 0 };
  const attackerCalls = { calls: 0 };
  const genuine = await genuineSealedAssembly(genuineCalls);

  // Object.create inherits the brand property from the genuine sealed
  // Assembly through the prototype chain while shadowing `bindings` with
  // attacker no-op material; record/assemblyDigest are inherited genuine.
  const forged = Object.create(genuine, {
    bindings: { value: [attackerBinding(attackerCalls)] },
  }) as SealedRuntimeAssembly;

  await assert.rejects(
    admitComponentWithAssembly(PROBE, forged, {
      currentDefinitionGraph: graph(),
      sha256: realSha256,
    }),
    assertBrandRejection,
  );
  assert.equal(attackerCalls.calls, 0, 'the forged no-op validator never ran (no authority minted)');
  assert.equal(genuineCalls.calls, 0, 'the genuine validator never ran for the forged assembly');
});

test('P1(b) review probe: symbol-theft forgery (self-seal, reflect brand symbol, forge trusted record/digest + attacker bindings) fails closed and no validator runs', async () => {
  const genuineCalls = { calls: 0 };
  const attackerCalls = { calls: 0 };
  const genuine = await genuineSealedAssembly(genuineCalls);

  // The attacker self-seals once over an unrelated throwaway graph, then
  // reflects the module-private brand symbol off their own sealed object.
  const throwaway = await sealRuntimeAssembly(
    {
      definitionGraph: {
        graphId: 'graph.attacker-throwaway',
        components: [
          {
            ...component('component.throwaway'),
            kind: { kindId: 'example.throwaway-kind', version: '1.0.0' },
          },
        ],
        relations: [],
      },
      kindImplementations: [
        {
          pin: {
            kind: { kindId: 'example.throwaway-kind', version: '1.0.0' },
            implementation: {
              implementationId: 'impl.throwaway',
              implementationVersion: '1.0.0',
              implementationDigest: 'sha256:throwaway',
            },
          },
          understoodSemanticContracts: [],
          understoodCapabilities: [],
          validateComponent: () => {},
        },
      ],
    },
    realSha256,
  );
  const stolenBrand = Object.getOwnPropertySymbols(throwaway).find(
    (symbol) => symbol.description === 'kaicreator.runtime-assembly.sealed',
  );
  assert.ok(stolenBrand, 'the attacker could reflect the brand symbol off a self-sealed assembly');

  // Forged plain object: public serializable identity material (record and
  // assemblyDigest are #587 §A public digest material) + attacker bindings +
  // the stolen brand symbol as a computed key.
  const forged = {
    record: genuine.record,
    assemblyDigest: genuine.assemblyDigest,
    bindings: [attackerBinding(attackerCalls)],
    [stolenBrand]: true,
  } as unknown as SealedRuntimeAssembly;

  await assert.rejects(
    admitComponentWithAssembly(PROBE, forged, {
      currentDefinitionGraph: graph(),
      sha256: realSha256,
    }),
    assertBrandRejection,
  );
  assert.equal(attackerCalls.calls, 0, 'the forged no-op validator never ran (no authority minted)');
  assert.equal(genuineCalls.calls, 0, 'the genuine validator never ran for the forged assembly');
});

test('negative control: genuine sealed Assemblies (trusted flow and a test self-built Kind) still admit normally', async () => {
  const trustedCalls = { calls: 0 };
  const genuine = await genuineSealedAssembly(trustedCalls);

  // Trusted flow: the exact component the genuine binding accepts... the
  // genuine validator above rejects everything, so re-seal with an accepting
  // binding for the happy-path control.
  const acceptingCalls = { calls: 0 };
  const accepting = await sealRuntimeAssembly(
    {
      definitionGraph: graph(),
      kindImplementations: [
        {
          pin: { ...GENUINE_PIN, kind: { ...GENUINE_PIN.kind }, implementation: { ...GENUINE_PIN.implementation } },
          understoodSemanticContracts: [{ contractId: 'contract.a', version: '1.0.0' }],
          understoodCapabilities: [{ capabilityId: 'cap.a', version: '1.0.0' }],
          validateComponent: () => {
            acceptingCalls.calls += 1;
          },
        },
      ],
    },
    realSha256,
  );
  const evidence = await admitComponentWithAssembly(component('component.a'), accepting, {
    currentDefinitionGraph: graph(),
    sha256: realSha256,
  });
  assert.equal(acceptingCalls.calls, 1);
  assert.equal(evidence.status, 'ADMITTED');
  assert.equal(evidence.assemblyDigest, accepting.assemblyDigest);
  assert.equal(genuine.assemblyDigest, accepting.assemblyDigest, 'same seal input material mints the same digest');

  // Test self-built Kind (invariant 25 posture): a neutral Kind defined
  // entirely in test space binds end to end through the sealed path.
  const neutralCalls = { calls: 0 };
  const neutralComponent: ComponentEnvelope = {
    ...component('component.neutral'),
    kind: { kindId: 'test.semantic.bypass-control', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
  };
  const neutralGraph: DefinitionGraphEnvelope = {
    graphId: 'graph.bypass-control',
    components: [neutralComponent],
    relations: [],
  };
  const neutralAssembly = await sealRuntimeAssembly(
    {
      definitionGraph: neutralGraph,
      kindImplementations: [
        {
          pin: {
            kind: { kindId: 'test.semantic.bypass-control', version: '1.0.0' },
            implementation: {
              implementationId: 'impl.test.bypass-control',
              implementationVersion: '1.0.0',
              implementationDigest: 'sha256:bypass-control',
            },
          },
          understoodSemanticContracts: [],
          understoodCapabilities: [],
          validateComponent: () => {
            neutralCalls.calls += 1;
          },
        },
      ],
    },
    realSha256,
  );
  const neutralEvidence = await admitComponentWithAssembly(neutralComponent, neutralAssembly, {
    currentDefinitionGraph: neutralGraph,
    sha256: realSha256,
  });
  assert.equal(neutralCalls.calls, 1);
  assert.equal(neutralEvidence.status, 'ADMITTED');
  assert.equal(neutralEvidence.assemblyDigest, neutralAssembly.assemblyDigest);
});
