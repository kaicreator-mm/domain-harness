// Issue #311 / A2 I-008 FINAL closure: shared fixtures for the final
// adversarial/conformance matrix over ALL landed A2 surfaces (I-002..I-007).
//
// VOLATILE test infrastructure: this module owns no product semantics. It
// stages one coherent composition story through every landed stage so the
// final-matrix files can attack each boundary from a passing, fully-evidenced
// journey instead of forking fixtures per file. The #331 incremental slice
// files (dac-c-series / cross-surface-authority) are intentionally untouched;
// this fixture set extends them.
import {
  DAC_REFERENCE_BASELINE,
  adoptApplicationSelectionRef,
  adoptCompatibilityTargetRef,
  adoptPromotionDecisionRef,
  adoptRuntimeContractRef,
  adoptRuntimeImplementationRef,
  adoptSelectedDomainDataRef,
  type ApplicationSelectionRef,
  type CompatibilityTargetRef,
  type PromotionDecisionRef,
  type RuntimeContractRef,
  type RuntimeImplementationRef,
  type SelectedDomainDataRef,
} from '../../src/dac/index.js';
import type {
  RuntimeCompatibilityEnvironment,
  SelectedCompositionRequest,
} from '../../src/composition-intake/index.js';
import type { ApplicationManifestAdoptionInput } from '../../src/application-manifest/index.js';
import type { TargetCompiledDomainPackage } from '../../src/v2/index.js';
import { createCompiledPackage, createSha256Fake } from '../package/fixture.js';

export const FINAL_BASELINE = { ...DAC_REFERENCE_BASELINE };

/** Concrete runtime compatibility target the whole final journey validates against. */
export const FINAL_ENV = {
  formatVersion: '1',
  runtimeContractMajor: 2,
  executionEngineMajor: 1,
  targetProfileId: 'node-test',
  hostCapabilities: ['tool.host-local@1'],
  implementation: { identity: 'domain-harness-runtime', version: '0.3.0', build: 'build-0d4d51e' },
} as const;

export function finalEnvironment(
  overrides: Partial<RuntimeCompatibilityEnvironment> = {},
): RuntimeCompatibilityEnvironment {
  return {
    formatVersion: FINAL_ENV.formatVersion,
    runtimeContractMajor: FINAL_ENV.runtimeContractMajor,
    executionEngineMajor: FINAL_ENV.executionEngineMajor,
    targetProfileId: FINAL_ENV.targetProfileId,
    hostCapabilities: [...FINAL_ENV.hostCapabilities],
    implementation: { ...FINAL_ENV.implementation },
    sha256: createSha256Fake(),
    ...overrides,
  };
}

/** The six lifecycle refs of the coherent final journey, derived from a package. */
export interface FinalRefs {
  readonly promotionDecision: PromotionDecisionRef;
  readonly applicationSelection: ApplicationSelectionRef;
  readonly selectedDomainData: SelectedDomainDataRef;
  readonly runtimeContract: RuntimeContractRef;
  readonly runtimeImplementation: RuntimeImplementationRef;
  readonly compatibilityTarget: CompatibilityTargetRef;
}

export function finalRefs(
  identity: { readonly domainId: string; readonly domainVersion: string; readonly packageId: string },
  overrides: Partial<FinalRefs> = {},
): FinalRefs {
  return {
    promotionDecision: adoptPromotionDecisionRef({
      baseline: FINAL_BASELINE,
      semanticIdentity: identity.domainId,
      authorityScope: 'dac://governance/promotion',
      revisionIdentity: identity.domainVersion,
      contentDigest: identity.packageId,
    }),
    applicationSelection: adoptApplicationSelectionRef({
      baseline: FINAL_BASELINE,
      semanticIdentity: identity.domainId,
      authorityScope: 'dac://app-composition/acme',
      revisionIdentity: identity.domainVersion,
      contentDigest: identity.packageId,
    }),
    selectedDomainData: adoptSelectedDomainDataRef({
      baseline: FINAL_BASELINE,
      semanticIdentity: identity.domainId,
      authorityScope: 'dac://app-composition/acme',
      revisionIdentity: identity.domainVersion,
      contentDigest: identity.packageId,
    }),
    runtimeContract: adoptRuntimeContractRef({
      baseline: FINAL_BASELINE,
      semanticIdentity: 'domain-harness/runtime-contract',
      authorityScope: 'domain-harness://runtime',
      revisionIdentity: String(FINAL_ENV.runtimeContractMajor),
    }),
    runtimeImplementation: adoptRuntimeImplementationRef({
      baseline: FINAL_BASELINE,
      semanticIdentity: FINAL_ENV.implementation.identity,
      authorityScope: 'domain-harness://runtime',
      revisionIdentity: FINAL_ENV.implementation.version,
      contentDigest: FINAL_ENV.implementation.build,
    }),
    compatibilityTarget: adoptCompatibilityTargetRef({
      baseline: FINAL_BASELINE,
      semanticIdentity: `domain-harness/compatibility-target/${FINAL_ENV.targetProfileId}`,
      authorityScope: 'domain-harness://runtime/compatibility',
      revisionIdentity: FINAL_ENV.targetProfileId,
    }),
    ...overrides,
  };
}

/** The coherent stage-1..3 journey fixture: refs + request for one exact package. */
export interface FinalComposition {
  readonly compiled: TargetCompiledDomainPackage;
  readonly refs: FinalRefs;
  readonly request: SelectedCompositionRequest;
}

export async function finalComposition(
  domainVersion = 'rev-000042',
): Promise<FinalComposition> {
  const compiled = await createCompiledPackage(domainVersion);
  const refs = finalRefs({
    domainId: compiled.manifest.domainId,
    domainVersion: compiled.manifest.domainVersion,
    packageId: compiled.manifest.packageId,
  });
  return {
    compiled,
    refs,
    request: {
      promotionDecision: refs.promotionDecision,
      applicationSelection: refs.applicationSelection,
      selectedDomainData: refs.selectedDomainData,
      runtimeContract: refs.runtimeContract,
      runtimeImplementation: refs.runtimeImplementation,
      compatibilityTarget: refs.compatibilityTarget,
      compiledPackage: compiled,
      environment: finalEnvironment(),
    },
  };
}

/** Manifest identity story for the #307/#310 correlation stages. */
export const MANIFEST_STORY = {
  applicationSemanticIdentity: 'app://acme/invoice-ops',
  applicationRevisionIdentity: 'app-rev-0007',
  manifestIdentityPrefix: 'manifest://acme/invoice-ops/0007',
} as const;

/**
 * The #310 digest registry is process-global (same manifestIdentity can never
 * resolve to two digests within one process), so every adopted manifest in
 * this suite gets its own unique identity unless a test deliberately reuses
 * one to trigger MANIFEST_IDENTITY_DIGEST_CONFLICT.
 */
let manifestIdentityCounter = 0;

export function nextManifestIdentity(): string {
  manifestIdentityCounter += 1;
  return `${MANIFEST_STORY.manifestIdentityPrefix}-${String(manifestIdentityCounter).padStart(4, '0')}`;
}

/**
 * A minimal adoption input for one exact selected entry. The
 * `manifestContentDigest` placeholder is always recomputed/overridden by the
 * caller before adoption (the digest API requires the full input shape).
 */
export function manifestInputFor(
  composition: FinalComposition,
  overrides: Record<string, unknown> = {},
): ApplicationManifestAdoptionInput {
  return {
    baseline: FINAL_BASELINE,
    contractVersion: 'dac-application-manifest/v0.0.2',
    applicationSemanticIdentity: MANIFEST_STORY.applicationSemanticIdentity,
    applicationRevisionIdentity: MANIFEST_STORY.applicationRevisionIdentity,
    manifestIdentity: nextManifestIdentity(),
    manifestContentDigest: 'fixture-pending-recompute',
    selectedDomainData: [
      {
        selected: composition.refs.selectedDomainData,
        promotionDecision: composition.refs.promotionDecision,
        applicationSelection: composition.refs.applicationSelection,
      },
    ],
    runtimeContract: composition.refs.runtimeContract,
    runtimeImplementation: composition.refs.runtimeImplementation,
    compatibilityTarget: composition.refs.compatibilityTarget,
    ...overrides,
  } as ApplicationManifestAdoptionInput;
}

/** Asserts a fail-closed error of the expected class+code; returns it for detail checks. */
export async function assertErrorCode<T extends { readonly code: string }>(
  run: () => Promise<unknown> | unknown,
  klass: new (...args: never[]) => T,
  code: string,
  label: string,
): Promise<T> {
  let caught: unknown;
  try {
    await run();
  } catch (error) {
    caught = error;
  }
  assertErrorInstance(caught, klass, code, label);
  return caught as T;
}

export function assertErrorInstance<T extends { readonly code: string }>(
  caught: unknown,
  klass: new (...args: never[]) => T,
  code: string,
  label: string,
): void {
  if (!(caught instanceof klass)) {
    throw new Error(
      `${label}: expected ${klass.name} with code ${code}, got ${
        caught instanceof Error ? `${caught.name}: ${caught.message}` : String(caught)
      }`,
    );
  }
  if ((caught as T).code !== code) {
    throw new Error(`${label}: expected code ${code}, got ${String((caught as T).code)}`);
  }
}

/** Catches a sync throw into the assert helper. */
export function catchSync(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}
