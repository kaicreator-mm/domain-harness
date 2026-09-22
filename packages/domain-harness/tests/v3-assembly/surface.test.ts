import assert from 'node:assert/strict';
import test from 'node:test';
import * as root from '../../src/index.js';
import * as v3 from '../../src/public-v3/index.js';

const EXPECTED_V3_NAMES = [
  'createDomainRuntimeV3',
  'DomainRuntimeV3Error',
  'admissionEffectToolPort',
  'admitCentralDecision',
  'CentralAdmissionError',
  'VolatileAdmissionEffectJournal',
  'resolveDecision',
  'createXStateHarnessMachineRunner',
  'GovernanceExecutionCoordinator',
  'DomainActivationBindingCoordinator',
  'MemoryGovernanceBaselineStore',
  'GovernanceBaselineRegistry',
  'RuntimeEvidenceCapture',
  'VolatileRuntimeEvidenceStore',
  'runShadowEvaluation',
  'requestExperimentalRollback',
  'assertEvidenceUsableForGovernedEvaluation',
  'assertRuntimeEvidenceUsable',
  'createHostLocalDomainToolExecutor',
  'HostLocalDomainToolBindingError',
  'DurableControlCoordinator',
  'DurableControlError',
  'deriveCommandOutcome',
  'APP_CONTRACT_SOURCE_FORMAT',
  'evaluateDomainWorkflowGuard',
  'PredicateContractViolation',
  // #312 durable ordered Runtime Observation Stream surface.
  'ObservationRecordingRuntimeStore',
  'isRuntimeObservationStore',
  'RuntimeObservationError',
  'RUNTIME_OBSERVATION_CONTRACT_VERSION',
  'RUNTIME_OBSERVATION_EVENT_FAMILIES',
  'runtimePackageIdentityFromManifest',
  'runtimeObservationStreamKey',
  'encodeRuntimeObservationCursor',
] as const;

const FORBIDDEN_NAMES = [
  'createDomainHarness', // v0.1 Node-bound legacy surface
  'SqliteStore',
  'HarnessMachine', // XState engine internals (ADR-01: internal dependency)
  'BusinessHarnessMachine',
  'createActor',
  'setup',
] as const;

test('v3 surface: package root exposes the assembled v0.3 authorities', () => {
  for (const name of EXPECTED_V3_NAMES) {
    assert.ok(name in root, `root is missing ${name}`);
  }
  assert.equal(root.DOMAIN_HARNESS_VERSION, '0.2.0');
  assert.equal(typeof root.createDomainRuntime, 'function', 'v0.2 composition root stays');
  assert.equal(typeof root.StaticPackageRegistry, 'function', 'v0.2 registry stays');
});

test('v3 surface: no XState internals or Node-bound legacy surface leaks into the root', () => {
  for (const name of FORBIDDEN_NAMES) {
    assert.ok(!(name in root), `root must not expose ${name}`);
  }
});

test('v3 surface: the explicit ./v3 module matches the additive root surface', () => {
  for (const name of EXPECTED_V3_NAMES) {
    assert.ok(name in v3, `public-v3 is missing ${name}`);
  }
  for (const name of FORBIDDEN_NAMES) {
    assert.ok(!(name in v3), `public-v3 must not expose ${name}`);
  }
});
