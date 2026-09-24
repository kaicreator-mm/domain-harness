// Issue #329 / DAC v0.0.3 V3-005 R2 repair (comment 5816370978, P1-1) —
// journey-local fixture: the C77 connected journey's selected Domain Data is
// a compiled package the EXISTING public Harness Runtime assembly can
// actually execute. The shared manifest fixture package (tests/package/
// fixture.ts) is an identity-only artifact (`workflows: {}`), so the journey
// builds its own genuine #306 stage-3 verdict over a workflow-bearing
// compiled package whose declared environment matches the concrete public
// v0.2 Runtime assembly (formatVersion '0.2', runtimeContractMajor 2,
// executionEngineMajor 2 — exactly what `createDomainRuntime` validates at
// activation preflight). Everything here is additive conformance evidence:
// no production surface is edited; the package shape is the same compiled
// manifest contract the #313 runtime-control conformance suite already
// executes.
import {
  DAC_REFERENCE_BASELINE,
  adoptApplicationSelectionRef,
  adoptCompatibilityTargetRef,
  adoptPromotionDecisionRef,
  adoptRuntimeContractRef,
  adoptRuntimeImplementationRef,
  adoptSelectedDomainDataRef,
} from '../../src/dac/index.js';
import {
  validateSelectedComposition,
  type SelectedCompositionRequest,
  type SelectedCompositionValidation,
} from '../../src/composition-intake/index.js';
import { intakeEnvironment } from '../dac-v003/compatibility-fixture.js';
import { computeCompiledPackageId } from '../../src/package/index.js';
import type { Sha256Port, TargetCompiledDomainPackage } from '../../src/v2/index.js';
import type { CompiledPackageManifest } from '../../src/v2/index.js';

/** The workflow/address/message identities of the C77 journey Runtime leg. */
export const JOURNEY_WORKFLOW_ID = 'wf-invoice';
export const JOURNEY_INSTANCE_KEY = 'inv-001';
export const JOURNEY_ADDRESS = {
  workflowId: JOURNEY_WORKFLOW_ID,
  instanceKey: JOURNEY_INSTANCE_KEY,
} as const;
export const JOURNEY_COMMAND_TYPE = 'charge-order';
/** The state the journey workflow reaches when the charge-order applies. */
export const JOURNEY_TERMINAL_STATE = 'charged';

/**
 * The journey's compiled package: same identity discipline as the shared
 * fixture (domainId/domainVersion carried into the verdict tuples), but it
 * declares the concrete public v0.2 Runtime assembly profile and carries ONE
 * executable workflow that consumes the journey's `charge-order` command and
 * settles it terminally (open -> charged, charged is final => the message
 * disposition commits as `processed` and the instance completes).
 */
export async function createJourneyCompiledPackage(
  revision: string,
  sha256: Sha256Port,
): Promise<TargetCompiledDomainPackage> {
  const manifest: CompiledPackageManifest = {
    formatVersion: '0.2',
    runtimeContractMajor: 2,
    executionEngineMajor: 2,
    domainId: 'fixture-domain',
    domainVersion: revision,
    packageId: 'pending',
    targetProfileId: 'node-test',
    requiredCapabilities: [],
    workflows: {
      [JOURNEY_WORKFLOW_ID]: {
        workflowId: JOURNEY_WORKFLOW_ID,
        definition: {
          initial: 'open',
          states: {
            open: {
              final: false,
              done: [],
              error: [],
              events: {
                [JOURNEY_COMMAND_TYPE]: { routes: [{ target: JOURNEY_TERMINAL_STATE }] },
              },
            },
            [JOURNEY_TERMINAL_STATE]: { final: true, done: [], error: [], events: {} },
          },
          limits: { maxSteps: 32 },
        },
        messageContracts: {
          [JOURNEY_COMMAND_TYPE]: {
            type: JOURNEY_COMMAND_TYPE,
            payloadSchema: {},
          },
        },
      },
    },
    tools: {},
    projections: {},
    schemas: {},
    bindingDigests: {},
  };
  manifest.packageId = await computeCompiledPackageId(manifest, sha256);
  return { manifest, bindings: {} };
}

/**
 * A genuine #306 stage-3 exact-selection verdict over the journey's
 * workflow-bearing compiled package, built exactly like the shared
 * `buildIntakeVerdictFor` fixture except that the declared environment is
 * the one the concrete public v0.2 Runtime assembly validates against, so
 * the journey's activated package pin is executable by that same Runtime.
 */
export async function buildJourneyVerdict(
  revision: string,
  sha256: Sha256Port,
): Promise<SelectedCompositionValidation> {
  const compiled = await createJourneyCompiledPackage(revision, sha256);
  const domainId = compiled.manifest.domainId;
  const digest = compiled.manifest.packageId;
  const baseline = { ...DAC_REFERENCE_BASELINE };
  const request: SelectedCompositionRequest = {
    promotionDecision: adoptPromotionDecisionRef({
      baseline,
      semanticIdentity: domainId,
      authorityScope: 'dac://governance/promotion',
      revisionIdentity: revision,
      contentDigest: digest,
    }),
    applicationSelection: adoptApplicationSelectionRef({
      baseline,
      semanticIdentity: domainId,
      authorityScope: 'dac://app-composition/acme',
      revisionIdentity: revision,
      contentDigest: digest,
    }),
    selectedDomainData: adoptSelectedDomainDataRef({
      baseline,
      semanticIdentity: domainId,
      authorityScope: 'dac://app-composition/acme',
      revisionIdentity: revision,
      contentDigest: digest,
    }),
    runtimeContract: adoptRuntimeContractRef({
      baseline,
      semanticIdentity: 'domain-harness/runtime-contract',
      authorityScope: 'domain-harness://runtime',
      revisionIdentity: '2',
    }),
    runtimeImplementation: adoptRuntimeImplementationRef({
      baseline,
      semanticIdentity: 'domain-harness-runtime',
      authorityScope: 'domain-harness://runtime',
      revisionIdentity: '0.3.0',
      contentDigest: 'build-9f2c1',
    }),
    compatibilityTarget: adoptCompatibilityTargetRef({
      baseline,
      semanticIdentity: 'domain-harness/compatibility-target/node-test',
      authorityScope: 'domain-harness://runtime/compatibility',
      revisionIdentity: 'node-test',
    }),
    compiledPackage: compiled,
    environment: intakeEnvironment({
      formatVersion: '0.2',
      executionEngineMajor: 2,
      sha256,
    }),
  };
  return validateSelectedComposition(request);
}
