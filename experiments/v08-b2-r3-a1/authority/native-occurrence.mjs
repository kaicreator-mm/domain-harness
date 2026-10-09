/**
 * #984 V08-B2-R3-A1 (P1-02 repair, part 3): fresh native v0.7 occurrence
 * bound to the REAL physical B package identity.
 *
 * Derived from the finding on experiments/v08-gatea-repair-942/authority/
 * native-join.mjs L111-129 at base SHA e11a0510134903d6f05a20dd024f3740429edc33,
 * which consumed the unactivated native fixture's occurrence material and so
 * reused the fixture demo identity (domain `orders`, package `pkg-orders-1`,
 * its CDI digest, workflow target/instance) for a physical-charge join, plus a
 * hardcoded `effect:charge` effect type.
 *
 * This successor binds the occurrence to the exact attested physical package:
 *
 * - domainId/packageId = the attested physical packageId (one bounded research
 *   domain per physical package; explicit derivation rule, refinement by
 *   #983 K1 reserved);
 * - domainIntelligenceContentDigest = the attested physical manifest SHA256
 *   (real physical bytes, not a fixture string);
 * - Governance Baseline minted for that exact domainId via the ORIGINAL
 *   `createGovernanceBaselineBody`;
 * - T002D PRODUCTION activation through the ORIGINAL
 *   `AssemblyExecutionActivator` over ONE `DurableExecutionStore` (bind-once
 *   occurrence pin, assemblyDigest = the native successor Assembly);
 * - the ONE original `VolatileAdmissionEffectJournal` + original
 *   `GovernanceExecutionCoordinator` (Central Admission ports). No second
 *   Runtime, store, journal or admission path exists; the in-memory adapters
 *   are the same accepted v0.7 fixture pattern implementing ORIGINAL v0.7
 *   port interfaces (`DurableExecutionStore`, `ExactPackageCdiAuthority`).
 * - the armed effect intent and effect type are DERIVED FROM BINDING FACTS:
 *   effectType = `effect:<packageId>.<operationId>` and the journaled intent
 *   input is the trusted assembler-armed business intent (per-invocation
 *   input must equal it or the ORIGINAL v0.7 intent-closure gate fails
 *   closed). Nothing is hardcoded per-effect.
 *
 * Research limitation (honest scope): the journal is the original VOLATILE
 * fixture journal. NO durable process-restart recovery is claimed or proven
 * here; that remains NOT_PROVEN for this experiment.
 */

import { createGovernanceBaselineBody } from '../../../packages/domain-harness/src/governance/identity.ts';
import { MemoryGovernanceBaselineStore } from '../../../packages/domain-harness/src/governance/registry.ts';
import { GovernanceExecutionCoordinator } from '../../../packages/domain-harness/src/governance/execution-binding.ts';
import { AssemblyExecutionActivator } from '../../../packages/domain-harness/src/governance/assembly-activation.ts';
import { VolatileAdmissionEffectJournal } from '../../../packages/domain-harness/src/admission/effect-journal.ts';
import { deriveNativeEffectType, stableStringify } from './native-projection.mjs';

export class A1OccurrenceError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'A1OccurrenceError';
  }
}

const deny = (code, message) => {
  throw new A1OccurrenceError(code, message);
};

/** In-memory adapter implementing the ORIGINAL v0.7 DurableExecutionStore port. */
export function createInMemoryDurableExecutionStore() {
  const pins = new Map();
  const snapshots = new Map();
  return {
    async getGovernanceExecutionPin(id) {
      return pins.get(id);
    },
    async bindGovernanceExecutionPin(pin) {
      const existing = pins.get(pin.workflowInstanceId);
      if (existing === undefined) {
        pins.set(pin.workflowInstanceId, pin);
        return 'inserted';
      }
      return stableStringify(existing) === stableStringify(pin) ? 'existing' : 'conflict';
    },
    async getGovernanceBoundSnapshot(id) {
      return snapshots.get(id);
    },
    async putGovernanceBoundSnapshot(snapshot) {
      snapshots.set(snapshot.workflowInstanceId, snapshot);
    },
  };
}

/** In-memory adapter implementing the ORIGINAL v0.7 ExactPackageCdiAuthority port. */
export function createInMemoryExactPackageCdiAuthority() {
  const records = new Map();
  const key = (binding) => binding.domainId + ' ' + binding.packageId + ' ' + binding.domainIntelligenceContentDigest;
  return {
    add(binding) {
      records.set(key(binding), { ...binding });
    },
    async resolveExactPackageCdi(binding) {
      const record = records.get(key(binding));
      return record === undefined ? undefined : { ...record };
    },
  };
}

const snap = (value) => JSON.parse(JSON.stringify(value));

/**
 * Create ONE fresh native occurrence bound to the exact physical package.
 *
 * @param {object} input {physical (attested selection snapshot), graph, assembly
 *   (the native T002B successor Assembly), armedIntentInput (exact journaled
 *   business intent for this occurrence), sha256, instanceOrdinal (fresh
 *   occurrence discriminator — occurrences are bind-once, never reused)}
 */
export async function createFreshNativeOccurrence(input) {
  const { physical, graph, assembly, armedIntentInput, sha256, instanceOrdinal } = input ?? {};
  if (!physical || !graph || !assembly || typeof sha256?.digestUtf8 !== 'function' ||
      !Number.isInteger(instanceOrdinal) || instanceOrdinal < 0) {
    deny('E_OCCURRENCE_INPUT', 'occurrence input requires {physical, graph, assembly, sha256, instanceOrdinal}');
  }
  if (armedIntentInput === undefined || typeof armedIntentInput !== 'object' || armedIntentInput === null) {
    deny('E_OCCURRENCE_INPUT', 'armedIntentInput (the exact journaled business intent) is required');
  }
  // Occurrence identity derived ONLY from attested physical facts.
  const domainId = physical.packageId;
  const packageId = physical.packageId;
  const operationId = physical.operation.operationId;
  const workflowTarget = packageId + '.' + operationId;
  const workflowInstanceId = workflowTarget + ':instance:' + instanceOrdinal;
  const effectType = deriveNativeEffectType(physical);

  // Governance baseline for the EXACT physical domain (original v0.7 mint).
  const baseline = await createGovernanceBaselineBody(
    {
      domainId,
      governanceId: domainId + '-governance',
      schemaVersion: '1',
      version: 'B1',
      semantics: { hardInvariants: [], operatorAuthority: 'B1' },
    },
    sha256,
  );
  const baselines = new MemoryGovernanceBaselineStore();
  await baselines.putBody(baseline);

  // CDI authority registers the EXACT physical package bytes (manifest SHA).
  const packageCdi = createInMemoryExactPackageCdiAuthority();
  packageCdi.add({
    domainId,
    packageId,
    domainIntelligenceContentDigest: physical.manifestSha256,
  });

  const store = createInMemoryDurableExecutionStore();
  const activator = new AssemblyExecutionActivator(store, packageCdi, baselines, sha256);
  const activationBinding = {
    domainId,
    packageId,
    domainIntelligenceContentDigest: physical.manifestSha256,
    governanceBaseline: baseline.identity,
  };
  // T002D: PRODUCTION-class, assembly-bearing, bind-once occurrence pin.
  const pin = await activator.activate({
    workflowTarget,
    workflowInstanceId,
    binding: activationBinding,
    assembly,
    authorityClass: 'PRODUCTION',
    currentDefinitionGraph: graph,
  });
  if (pin.assemblyDigest !== assembly.assemblyDigest) {
    deny('E_OCCURRENCE_PIN_DRIFT', 'activated occurrence pin does not carry the exact native successor Assembly digest');
  }

  // The ONE original Central Admission ports + armed request (owner v0.7).
  const coordinator = new GovernanceExecutionCoordinator(store, sha256);
  const journal = new VolatileAdmissionEffectJournal();
  const admissionPorts = { governance: coordinator, baselines, effectJournal: journal };

  const definition = {
    workflowKey: packageId,
    initialState: 'armed',
    initialContext: {},
    guards: [
      {
        guardId: 'guard:amount-at-armed-intent',
        predicate: {
          op: 'lte',
          left: { source: 'event', path: ['payload', 'amount'] },
          right: { source: 'literal', value: armedIntentInput.amount },
        },
      },
    ],
    states: [
      {
        stateKey: 'armed',
        transitions: [
          {
            transitionKey: 'execute-armed-intent',
            trigger: { kind: 'event', eventType: 'PHYSICAL_INTENT_DECIDED' },
            targetState: 'executed',
            guardId: 'guard:amount-at-armed-intent',
            effectIntents: [
              { effectType, input: snap(armedIntentInput), idempotencyKey: workflowInstanceId + ':intent:1' },
            ],
          },
        ],
      },
      { stateKey: 'executed', kind: 'final' },
    ],
  };

  const admissionRequest = {
    target: { workflowId: workflowTarget, instanceKey: 'instance:' + instanceOrdinal },
    turn: { kind: 'message', sourceMessageId: 'msg:' + workflowInstanceId + ':1' },
    trigger: { kind: 'event', eventType: 'PHYSICAL_INTENT_DECIDED' },
    workflowInstanceId,
    definition,
    currentStateKey: 'armed',
    context: {},
    event: { type: 'PHYSICAL_INTENT_DECIDED', payload: snap(armedIntentInput) },
    resolved: {
      source: 'harness-machine',
      structuredDecision: { decision: { outcome: 'execute', data: snap(armedIntentInput) }, event: { type: 'PHYSICAL_INTENT_DECIDED', payload: snap(armedIntentInput) } },
      provenance: {},
      freshModelCallCount: 1,
      llmAvoided: false,
      cacheDisposition: { read: 'disabled' },
      telemetry: [],
    },
    decisionSchema: {
      isValid(value) {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
        const record = value;
        return typeof record['decision'] === 'object' && record['decision'] !== null &&
          typeof record['event'] === 'object' && record['event'] !== null;
      },
    },
    now: '2026-10-09T00:00:00.000Z',
  };

  return Object.freeze({
    domainId, packageId, workflowTarget, workflowInstanceId, effectType,
    armedIntentInput: Object.freeze(snap(armedIntentInput)),
    pin, activator, coordinator, baselines, journal, admissionPorts, admissionRequest, definition,
  });
}
