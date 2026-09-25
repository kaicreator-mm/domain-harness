// Issue #306 / A2 I-003 authority-boundary tests: the intake validates, it
// never selects. Pins the structural and behavioral guarantees behind
// PRD A2 §§3.3/10.4-10.6 and L2 A2 §5.1 forbidden shortcuts — compatibility
// PASS must not manufacture ApplicationSelection (N05), a registry default
// package must never be reclassified as selection provenance (N04), and an
// incompatibility must never resolve to latest/default/another revision
// (N07/C32/C37).
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
  CompositionIntakeError,
  validateSelectedComposition,
  type RuntimeCompatibilityEnvironment,
  type SelectedCompositionRequest,
} from '../../src/composition-intake/index.js';
import { StaticPackageRegistry } from '../../src/package/index.js';
import type { TargetCompiledDomainPackage } from '../../src/v2/contracts/package.js';
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

function refsFor(compiled: TargetCompiledDomainPackage): {
  promotionDecision: ReturnType<typeof adoptPromotionDecisionRef>;
  applicationSelection: ReturnType<typeof adoptApplicationSelectionRef>;
  selectedDomainData: ReturnType<typeof adoptSelectedDomainDataRef>;
  runtimeContract: ReturnType<typeof adoptRuntimeContractRef>;
  runtimeImplementation: ReturnType<typeof adoptRuntimeImplementationRef>;
  compatibilityTarget: ReturnType<typeof adoptCompatibilityTargetRef>;
} {
  const { domainId, domainVersion, packageId } = compiled.manifest;
  return {
    promotionDecision: adoptPromotionDecisionRef({
      baseline,
      semanticIdentity: domainId,
      authorityScope: 'dac://governance/promotion',
      revisionIdentity: domainVersion,
      contentDigest: packageId,
    }),
    applicationSelection: adoptApplicationSelectionRef({
      baseline,
      semanticIdentity: domainId,
      authorityScope: 'dac://app-composition/acme',
      revisionIdentity: domainVersion,
      contentDigest: packageId,
    }),
    selectedDomainData: adoptSelectedDomainDataRef({
      baseline,
      semanticIdentity: domainId,
      authorityScope: 'dac://app-composition/acme',
      revisionIdentity: domainVersion,
      contentDigest: packageId,
    }),
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
  };
}

function requestFor(
  compiled: TargetCompiledDomainPackage,
  refs: ReturnType<typeof refsFor>,
): SelectedCompositionRequest {
  return {
    promotionDecision: refs.promotionDecision,
    applicationSelection: refs.applicationSelection,
    selectedDomainData: refs.selectedDomainData,
    runtimeContract: refs.runtimeContract,
    runtimeImplementation: refs.runtimeImplementation,
    compatibilityTarget: refs.compatibilityTarget,
    compiledPackage: compiled,
    environment: ENV,
  };
}

/** Collects every object reachable from the verdict graph. */
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

test('composition intake boundary: compatibility PASS never manufactures application selection (N05)', async () => {
  const compiled = await createCompiledPackage('rev-000042');
  const refs = refsFor(compiled);
  const verdict = await validateSelectedComposition(requestFor(compiled, refs));

  // The verdict itself is not a DAC reference of any role, let alone selection.
  assert.equal(getDacReferenceRole(verdict), undefined);
  assert.equal(isApplicationSelectionRef(verdict), false);

  // Exactly ONE application-selection ref exists in the whole verdict graph,
  // and it is the pass-through upstream object (=== identity, never reminted).
  const selectionObjects = collectObjects(verdict).filter(isApplicationSelectionRef);
  assert.equal(selectionObjects.length, 1);
  assert.equal(selectionObjects[0], refs.applicationSelection);

  // No new selected-domain-data provenance is minted either.
  const selectedObjects = collectObjects(verdict).filter(
    (value) => getDacReferenceRole(value) === 'selected-domain-data',
  );
  assert.equal(selectedObjects.length, 1);
  assert.equal(selectedObjects[0], refs.selectedDomainData);
});

test('composition intake boundary: registry default package is never reclassified as selection (N04)', async () => {
  // The validated package ALSO happens to be a StaticPackageRegistry default.
  // The intake has no registry input at all; the verdict still carries only the
  // upstream selection provenance, so defaultness can never leak into it.
  const compiled = await createCompiledPackage('rev-000042');
  const registry = new StaticPackageRegistry([compiled], compiled.manifest.packageId);
  assert.equal(registry.defaultPackageId, compiled.manifest.packageId);

  const refs = refsFor(registry.get(registry.defaultPackageId)!);
  const verdict = await validateSelectedComposition(
    requestFor(registry.get(registry.defaultPackageId)!, refs),
  );

  assert.equal(verdict.validatedPackageId, registry.defaultPackageId);
  assert.equal(verdict.provenance.applicationSelection, refs.applicationSelection);
  assert.equal(verdict.validatedPackage.manifest.packageId, registry.defaultPackageId);
  assert.equal(
    collectObjects(verdict).filter(isApplicationSelectionRef).length,
    1,
    'only the pass-through upstream selection ref',
  );
});

test('composition intake boundary: incompatibility never resolves to another registry package (N07/C32/C37)', async () => {
  // A registry holds a compatible package AND a default. The composition pins
  // a DIFFERENT (incompatible) revision. Validation must fail closed on the
  // pinned revision — never return, suggest, or fall back to the other one.
  const pinned = await createCompiledPackage('rev-pinned', {
    runtimeContractMajor: ENV.runtimeContractMajor + 1,
  });
  const alternative = await createCompiledPackage('rev-compatible');
  const registry = new StaticPackageRegistry(
    [pinned, alternative],
    alternative.manifest.packageId,
  );
  // The tempting substitute exists and is the registry default, exactly the
  // configuration a silent fallback would exploit.
  assert.ok(registry.has(pinned.manifest.packageId));
  assert.equal(registry.defaultPackageId, alternative.manifest.packageId);

  const refs = refsFor(pinned);
  let caught: unknown;
  try {
    await validateSelectedComposition(requestFor(pinned, refs));
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof CompositionIntakeError);
  const error = caught as CompositionIntakeError;
  assert.equal(error.code, 'INCOMPATIBLE_SELECTED_COMPOSITION');

  // No error detail names any alternative/default/latest package.
  for (const detail of error.details) {
    assert.ok(
      !detail.includes(alternative.manifest.packageId),
      `detail must not reference the alternative package: ${detail}`,
    );
    assert.doesNotMatch(detail, /latest|default|fallback/i);
  }
  assert.match(error.message, /explicit (upstream )?reselection/i);
});

test('composition intake boundary: module surface exposes no selection-manufacturing path', async () => {
  const surface = await import('../../src/composition-intake/index.js');
  const names = Object.keys(surface);

  assert.ok(names.includes('validateSelectedComposition'));
  assert.ok(names.includes('computeCompatibilityTargetDigest'));
  assert.ok(names.includes('CompositionIntakeError'));

  // The intake must never re-export or define an adoption/minting surface for
  // the upstream lifecycle roles it only consumes (promotion/selection/
  // selected/binding/activation). Emitting compatibility-target evidence is
  // its own stage-3 authority and stays internal to validate.
  for (const forbidden of [
    'adoptApplicationSelectionRef',
    'adoptPromotionDecisionRef',
    'adoptSelectedDomainDataRef',
    'adoptRuntimeBindingRef',
    'adoptRuntimeActivationRef',
    'adoptRuntimeContractRef',
    'adoptRuntimeImplementationRef',
    'adoptCompatibilityTargetRef',
  ]) {
    assert.ok(!names.includes(forbidden), `intake surface must not expose ${forbidden}`);
  }
});

test('composition intake boundary: verdict is immutable pass-through evidence', async () => {
  const compiled = await createCompiledPackage('rev-000042');
  const refs = refsFor(compiled);
  const verdict = await validateSelectedComposition(requestFor(compiled, refs));

  assert.ok(Object.isFrozen(verdict));
  assert.ok(Object.isFrozen(verdict.provenance));
  assert.ok(Object.isFrozen(verdict.declared));
  assert.ok(Object.isFrozen(verdict.compatibility));
  assert.throws(() => {
    (verdict as { validatedPackageId?: string }).validatedPackageId = 'mutated';
  });
});
