// Issue #307 / A2 I-004 authority-boundary tests: binding and activation are
// separately referrable technical evidence and can never manufacture
// application selection (PRD A2 §§3.3/4, L2 A2 §5.1/§6.3). Pins the structural
// guarantees behind N04/N05/N06/C22/C31/C36: exactly one selection ref exists
// in any evidence graph (the upstream pass-through), compatibility PASS alone
// mints no binding/activation, and the module surface exposes no selection /
// substitution / adoption path at all.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DAC_REFERENCE_BASELINE,
  adoptApplicationSelectionRef,
  adoptCompatibilityTargetRef,
  adoptPromotionDecisionRef,
  adoptRuntimeContractRef,
  adoptRuntimeImplementationRef,
  adoptSelectedDomainDataRef,
  getDacReferenceRole,
  isApplicationSelectionRef,
} from '../../src/dac/index.js';
import {
  validateSelectedComposition,
  type RuntimeCompatibilityEnvironment,
  type SelectedCompositionRequest,
  type SelectedCompositionValidation,
} from '../../src/composition-intake/index.js';
import {
  activateRuntimeBinding,
  bindValidatedComposition,
} from '../../src/runtime-binding/index.js';
import { createCompiledPackage, createSha256Fake } from '../package/fixture.js';

const baseline = { ...DAC_REFERENCE_BASELINE };

const ENV: RuntimeCompatibilityEnvironment = {
  formatVersion: '1',
  runtimeContractMajor: 2,
  executionEngineMajor: 1,
  targetProfileId: 'node-test',
  hostCapabilities: [],
  implementation: { identity: 'domain-harness-runtime', version: '0.3.0', build: 'build-1' },
  sha256: createSha256Fake(),
};

async function verdictFixture(): Promise<{
  verdict: SelectedCompositionValidation;
  applicationSelection: ReturnType<typeof adoptApplicationSelectionRef>;
  selectedDomainData: ReturnType<typeof adoptSelectedDomainDataRef>;
}> {
  const compiled = await createCompiledPackage('rev-000042');
  const { domainId, domainVersion, packageId } = compiled.manifest;
  const applicationSelection = adoptApplicationSelectionRef({
    baseline,
    semanticIdentity: domainId,
    authorityScope: 'dac://app-composition/acme',
    revisionIdentity: domainVersion,
    contentDigest: packageId,
  });
  const selectedDomainData = adoptSelectedDomainDataRef({
    baseline,
    semanticIdentity: domainId,
    authorityScope: 'dac://app-composition/acme',
    revisionIdentity: domainVersion,
    contentDigest: packageId,
  });
  const request: SelectedCompositionRequest = {
    promotionDecision: adoptPromotionDecisionRef({
      baseline,
      semanticIdentity: domainId,
      authorityScope: 'dac://governance/promotion',
      revisionIdentity: domainVersion,
      contentDigest: packageId,
    }),
    applicationSelection,
    selectedDomainData,
    runtimeContract: adoptRuntimeContractRef({
      baseline,
      semanticIdentity: 'domain-harness/runtime-contract',
      authorityScope: 'domain-harness://runtime',
      revisionIdentity: String(ENV.runtimeContractMajor),
    }),
    runtimeImplementation: adoptRuntimeImplementationRef({
      baseline,
      semanticIdentity: ENV.implementation.identity,
      authorityScope: 'domain-harness://runtime',
      revisionIdentity: ENV.implementation.version,
      contentDigest: ENV.implementation.build,
    }),
    compatibilityTarget: adoptCompatibilityTargetRef({
      baseline,
      semanticIdentity: `domain-harness/compatibility-target/${ENV.targetProfileId}`,
      authorityScope: 'domain-harness://runtime/compatibility',
      revisionIdentity: ENV.targetProfileId,
    }),
    compiledPackage: compiled,
    environment: ENV,
  };
  return {
    verdict: await validateSelectedComposition(request),
    applicationSelection,
    selectedDomainData,
  };
}

/** Collects every object reachable from an evidence graph. */
function collectObjects(root: object): object[] {
  const seen = new Set<object>();
  const queue: object[] = [root];
  while (queue.length > 0) {
    const current = queue.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const value of Object.values(current as Record<string, unknown>)) {
      if (value !== null && typeof value === 'object' && !seen.has(value)) {
        queue.push(value);
      }
    }
  }
  return [...seen];
}

test('runtime binding boundary: compatibility PASS alone mints no binding or activation (N05/N06)', async () => {
  const { verdict } = await verdictFixture();

  // The stage-3 verdict graph contains zero binding/activation references:
  // passing compatibility creates neither stage-4 nor stage-5 evidence.
  const roles = collectObjects(verdict).map(getDacReferenceRole);
  assert.equal(roles.filter((role) => role === 'runtime-binding').length, 0);
  assert.equal(roles.filter((role) => role === 'runtime-activation').length, 0);
});

test('runtime binding boundary: binding evidence never manufactures selection (N04/N05)', async () => {
  const { verdict, applicationSelection, selectedDomainData } = await verdictFixture();
  const binding = await bindValidatedComposition(verdict, { sha256: createSha256Fake() });
  const graph = collectObjects(binding);

  // Exactly ONE application-selection ref in the whole binding graph, and it
  // is the pass-through upstream object (=== identity, never reminted).
  const selections = graph.filter(isApplicationSelectionRef);
  assert.equal(selections.length, 1);
  assert.equal(selections[0], applicationSelection);
  // Exactly ONE selected-domain-data ref — the upstream pass-through.
  const selected = graph.filter((value) => getDacReferenceRole(value) === 'selected-domain-data');
  assert.equal(selected.length, 1);
  assert.equal(selected[0], selectedDomainData);
  // Exactly ONE binding ref — the one this module minted; zero activation refs.
  const bindingRefs = graph.filter((value) => getDacReferenceRole(value) === 'runtime-binding');
  assert.equal(bindingRefs.length, 1);
  assert.equal(bindingRefs[0], binding.bindingRef);
  assert.equal(graph.filter((value) => getDacReferenceRole(value) === 'runtime-activation').length, 0);
});

test('runtime binding boundary: activation evidence preserves stage separation (C22/C31)', async () => {
  const { verdict, applicationSelection } = await verdictFixture();
  const binding = await bindValidatedComposition(verdict, { sha256: createSha256Fake() });
  const activation = await activateRuntimeBinding(binding, {
    sha256: createSha256Fake(),
    activationInstanceId: 'activation-boundary-1',
  });
  const graph = collectObjects(activation);

  // Still exactly one selection ref (the upstream pass-through, unchanged).
  const selections = graph.filter(isApplicationSelectionRef);
  assert.equal(selections.length, 1);
  assert.equal(selections[0], applicationSelection);
  // Exactly one binding ref (the bound evidence) and one activation ref (the
  // minted one) — never collapsed into a shared object or role.
  const bindingRefs = graph.filter((value) => getDacReferenceRole(value) === 'runtime-binding');
  assert.equal(bindingRefs.length, 1);
  assert.equal(bindingRefs[0], binding.bindingRef);
  const activationRefs = graph.filter((value) => getDacReferenceRole(value) === 'runtime-activation');
  assert.equal(activationRefs.length, 1);
  assert.equal(activationRefs[0], activation.activationRef);
});

test('runtime binding boundary: module surface exposes no selection or substitution path', async () => {
  const surface = await import('../../src/runtime-binding/index.js');
  const names = Object.keys(surface).sort();

  // Frozen exact allowlist: any added name (a substitution helper, a selection
  // manufacturer, an adoption passthrough) fails this snapshot.
  assert.deepEqual(names, [
    'RUNTIME_ACTIVATION_ADAPTER_VERSION',
    'RUNTIME_BINDING_ADAPTER_VERSION',
    'RuntimeBindingError',
    'activateRuntimeBinding',
    'bindValidatedComposition',
    'isRuntimeBindingEvidence',
  ]);

  for (const forbidden of [
    'adoptApplicationSelectionRef',
    'adoptPromotionDecisionRef',
    'adoptSelectedDomainDataRef',
    'adoptRuntimeBindingRef',
    'adoptRuntimeActivationRef',
    'validateSelectedComposition',
    'defaultPackageId',
    'latestPackageId',
    'resolveBinding',
    'selectComposition',
  ]) {
    assert.ok(!names.includes(forbidden), `runtime-binding surface must not expose ${forbidden}`);
  }
});

test('runtime binding boundary: evidence is immutable pass-through truth', async () => {
  const { verdict } = await verdictFixture();
  const binding = await bindValidatedComposition(verdict, { sha256: createSha256Fake() });
  const activation = await activateRuntimeBinding(binding, {
    sha256: createSha256Fake(),
    activationInstanceId: 'activation-boundary-2',
  });

  assert.ok(Object.isFrozen(binding));
  assert.ok(Object.isFrozen(binding.bindingRef));
  assert.ok(Object.isFrozen(activation));
  assert.ok(Object.isFrozen(activation.activationRef));
  assert.equal(binding.validation, verdict);
  assert.equal(activation.binding, binding);
  assert.throws(() => {
    (activation as { activatedPackageId?: string }).activatedPackageId = 'mutated';
  });
  assert.throws(() => {
    (binding.bindingRef as { contentDigest?: string }).contentDigest = 'mutated';
  });
});
