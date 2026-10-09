/**
 * #984 V08-B2-R3-A1 (P1-02 + P1-03): bounded trusted Host bridge successor —
 * physical B package operation onto the ORIGINAL native v0.7 authority chain.
 *
 * Explicitly derived from experiments/v08-gatea-repair-942/authority/
 * native-join.mjs (whole file) at base SHA e11a0510134903d6f05a20dd024f3740429edc33
 * (B2 R2 PR #980 HEAD). Repairs the two P1 findings on that file:
 *
 * P1-02 (trust-preserving projection + trusted Host policy):
 *  - projection is now explicit and fidelity-preserving (see
 *    ./native-projection.mjs): identity, semantic contract, caller/exposure/
 *    failure scope and every consumed capability survive; unsupported shapes
 *    typed-reject; validateComponent is a REAL validator.
 *  - the constant `decideAdmission:()=>({admitted:true})` is replaced by a
 *    trusted Host-ONLY policy port (see ./host-policy.mjs) bound to the exact
 *    current domain/package/occurrence/caller/operation+effect tuple and
 *    consumed through the ORIGINAL T004A `admitToolExposure` owner API.
 *  - the occurrence identity is bound to the REAL physical B package
 *    (./native-occurrence.mjs): no fixture `pkg-orders-1` identity, no fixture
 *    Assembly/implementation pin; effect type is derived from binding facts.
 *
 * P1-03 (no caller override of Host authority):
 *  - the public/trusted Host façade (`facade.invoke`) accepts ONLY a closed
 *    non-authority business input set: exactly `{input, caller}`. Any
 *    authority-bearing selector/port/pin/caller-policy material — `dispatch`,
 *    `admissionPorts`, `effectJournal`, `activator`, `sha256`, `effectType`,
 *    `binding`, `request`, `admissionRequest`, `currentDefinitionGraph`,
 *    `resourceProvider`, `effectAuthority`, `effectTools`, `policy`,
 *    `exposure` — is typed-rejected (E_HOST_BUSINESS_INPUT_ONLY) BEFORE any
 *    admission or dispatch work. The Host injects its trusted ports at
 *    construction; consumers can never reconfigure them per invocation.
 *  - a privileged research escape hatch exists ONLY in the separately
 *    exported `createNativeAuthorityHostForTrustedResearch` constructor and
 *    its returned `trustedResearchPort`; it is NOT reachable from the façade
 *    object (the Domain App API) and exists to run falsifiers against the
 *    underlying ORIGINAL v0.7 seam (which validates injected port shapes and
 *    installs the only verified-binding effect adapter itself).
 *
 * Chain (single authority, no second Runtime/Storage):
 *   selected physical Handler/module SHA (B1-attested bytes)
 *   -> REAL native T003C binding mint over those exact bytes
 *   -> seal-minted T002B successor Assembly (projected graph)
 *   -> T002D PRODUCTION occurrence pin (bind-once, physical package CDI)
 *   -> T004A exposure + invocation-request admission (trusted policy)
 *   -> T004C ORIGINAL Central Admission + its ORIGINAL Journal.
 *
 * Honest security boundary: this is trusted Host glue, NOT a sandbox. data-URL
 * module loading in the physical Host and regexp import filtering are NOT
 * isolation. The original v0.7 Central Admission effect/State/Journal/replay
 * semantics are consumed unchanged; no effect is ever granted through a
 * caller-supplied callback. A1 alone does NOT close #942 (unified Kernel is
 * #983 K1 scope); the K1 integration seam is `bindProjectedPhysicalToNativeAuthority`
 * and `facade.describe()` (marked PARTIAL until #983 lands).
 */
import { createHash } from 'node:crypto';
import { computeDefinitionGraphDigest } from '../../../packages/domain-harness/src/contracts/definition-graph.ts';
import { resolveCurrentCapabilityProvider } from '../../../packages/domain-harness/src/contracts/capability-provision.ts';
import { sealRuntimeAssembly } from '../../../packages/domain-harness/src/contracts/runtime-assembly.ts';
import { bindToolImplementation } from '../../../packages/domain-harness/src/contracts/tool-implementation-binding.ts';
import {
  admitToolExposure,
  admitToolInvocationRequest,
} from '../../../packages/domain-harness/src/contracts/invocation-request.ts';
import { invokeWithExistingV07Authority } from './invoke-v07.mjs';
import {
  projectPhysicalComponentToNative,
  deriveNativeEffectType,
} from './native-projection.mjs';
import { createTrustedHostPolicyPort } from './host-policy.mjs';
import { createFreshNativeOccurrence } from './native-occurrence.mjs';

// Attested physical layer: imported from B2 R2 (READ-ONLY, attributed at base
// SHA e11a0510134903d6f05a20dd024f3740429edc33). Provides the B1-attested
// physical seal + byte-verified selected handler + nativeSelection snapshot.
// The K1 unified Kernel (#983) will replace the Kernel side; this import is
// the only R2 code reused and it is never modified.
import { establishTrustedPackageKindHost } from '../../v08-gatea-repair-942/package-kind/host.mjs';

export { establishTrustedPackageKindHost };

const sha256 = {
  async digestUtf8(value) {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

const deny = (code) => {
  throw Object.assign(new Error(code), { code });
};
const snap = (x) => JSON.parse(JSON.stringify(x));

// Authority-bearing material is never expressible on the public façade. The
// closed business input set is exactly these two provenance-free keys.
const BUSINESS_INPUT_KEYS = Object.freeze(['input', 'caller']);

export class A1HostError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
    this.name = 'A1HostError';
  }
}

function requireCoreAssemblerInput(trusted) {
  if (!trusted || typeof trusted !== 'object') deny('E_HOST_TRUSTED_INPUT');
  const { armedIntentInput, authorizedCallers, instanceOrdinal } = trusted;
  if (!armedIntentInput || typeof armedIntentInput !== 'object') deny('E_HOST_TRUSTED_INPUT');
  if (!Array.isArray(authorizedCallers) || authorizedCallers.length === 0) deny('E_HOST_TRUSTED_INPUT');
  if (!Number.isInteger(instanceOrdinal) || instanceOrdinal < 0) deny('E_HOST_TRUSTED_INPUT');
}

/** Public Host constructors additionally need the trusted physical seal. */
function requireHostSelectorInput(trusted) {
  requireCoreAssemblerInput(trusted);
  const { trustedBHost, selector } = trusted;
  if (!trustedBHost || typeof trustedBHost.seal !== 'function' || !selector) {
    deny('E_HOST_TRUSTED_INPUT');
  }
}

/** The join seam additionally requires the trusted physical seal gate. */
function requireSeamInput(trusted) {
  requireCoreAssemblerInput(trusted);
  const { physical, physicalSeal } = trusted;
  if (!physical || typeof physical !== 'object') deny('E_HOST_TRUSTED_INPUT');
  if (!physicalSeal || typeof physicalSeal.requirePhysicalCurrentness !== 'function') {
    deny('E_HOST_TRUSTED_INPUT');
  }
}

/**
 * THE join seam (also the #983 K1 integration point): given ONE attested
 * physical selected-handler snapshot, produce the whole native authority
 * chain and the guarded façade. `createNativeAuthorityHost` feeds it from the
 * trusted B2 physical seal; #983 K1 will feed it from its own physically
 * attested selected handler + one Assembly (same snapshot shape, documented
 * on ./native-projection.mjs).
 */
export async function bindProjectedPhysicalToNativeAuthority(trusted) {
  requireSeamInput(trusted);
  const { physical, physicalSeal, armedIntentInput, authorizedCallers, instanceOrdinal } = trusted;

  // ---- P1-02: explicit fidelity-preserving projection (typed rejects).
  const projected = projectPhysicalComponentToNative(physical);
  const operationId = projected.attested.operationId;
  const effectType = deriveNativeEffectType(physical);

  // ---- T002B: seal-mint the successor Assembly over the projected graph.
  const baseAssembly = await sealRuntimeAssembly(
    { definitionGraph: projected.graph, kindImplementations: [projected.kindImplementation] },
    sha256,
  );
  const definitionGraphDigest = await computeDefinitionGraphDigest(projected.graph, sha256);

  // ---- Consumed physical capabilities must resolve in the native graph or
  // the join fails closed BEFORE any binding/admission/dispatch (never a
  // silent widening of capability scope).
  for (const capability of projected.consumedCapabilities) {
    try {
      await resolveCurrentCapabilityProvider(
        projected.graph,
        { capabilityId: capability.capabilityId, version: capability.version },
        projected.nativeTool.componentId,
        definitionGraphDigest,
        sha256,
      );
    } catch {
      deny('E_PROJECTION_CONSUMED_CAPABILITY_UNRESOLVED');
    }
  }

  const consumerCapability = projected.consumer.requiredCapabilities[0];
  const selected = await resolveCurrentCapabilityProvider(
    projected.graph,
    { capabilityId: consumerCapability.capabilityId, version: consumerCapability.version },
    projected.consumer.componentId,
    definitionGraphDigest,
    sha256,
  );

  // ---- T003C: REAL binding mint over the exact attested physical handler
  // and the exact attested implementation pin (never a fixture handle).
  const pin = {
    implementationId: physical.implementation.implementationId,
    implementationVersion: '1.0.0',
    implementationDigest: 'sha256:' + physical.moduleSha256,
  };
  const binding = await bindToolImplementation({
    assembly: baseAssembly,
    selection: snap(selected),
    currentDefinitionGraph: projected.graph,
    implementations: [{
      implementation: pin,
      supportedOperations: [operationId],
      handle: physical.handler,
    }],
    exactPin: pin,
    sha256,
  });
  if (
    binding.implementationHandle !== physical.handler ||
    binding.evidence.implementation.implementationDigest !== 'sha256:' + physical.moduleSha256 ||
    binding.evidence.implementation.implementationId !== physical.implementation.implementationId
  ) {
    deny('E_HOST_BINDING_DRIFT');
  }

  // ---- T002D: ONE fresh PRODUCTION occurrence bound to the REAL physical
  // package identity (no fixture identity/pin reuse) over the successor Assembly.
  const occurrence = await createFreshNativeOccurrence({
    physical, graph: projected.graph, assembly: binding.successorAssembly,
    armedIntentInput, sha256, instanceOrdinal,
  });

  // ---- Trusted Host-ONLY policy port, bound to the exact attested tuple and
  // consumed through the ORIGINAL T004A owner API. Constructed once here;
  // never expressible by callers.
  const policy = createTrustedHostPolicyPort({
    domainId: occurrence.domainId,
    packageId: occurrence.packageId,
    occurrenceId: occurrence.workflowInstanceId,
    workflowTarget: occurrence.workflowTarget,
    operationId,
    effectType,
    effectClass: projected.attested.effectClass,
    callerScope: projected.attested.callerScope,
    authorizedCallers,
  });
  if (policy.expected.occurrenceId !== occurrence.pin.workflowInstanceId ||
      occurrence.pin.assemblyDigest !== binding.successorAssembly.assemblyDigest) {
    deny('E_HOST_OCCURRENCE_DRIFT');
  }

  // ---- Host-owned dispatch port: dispatches ONLY the exact verified handle,
  // exact operation and the exact binding-derived effect type. Never exposed
  // to consumers; never replaceable per invocation.
  let dispatchCount = 0;
  const dispatch = Object.freeze({
    async dispatch(query) {
      if (query.handle !== physical.handler || query.operationId !== operationId ||
          query.effectType !== effectType) {
        deny('E_NATIVE_DISPATCH_HANDLE');
      }
      dispatchCount += 1;
      return query.handle(query.input);
    },
  });

  const admitFor = async (input, caller) => {
    const exposure = await admitToolExposure(
      {
        toolComponentId: projected.attested.componentId,
        operationId,
        caller,
        assembly: binding.successorAssembly,
        currentDefinitionGraph: projected.graph,
        policy,
      },
      sha256,
    );
    const admitted = await admitToolInvocationRequest(
      {
        toolComponentId: projected.attested.componentId,
        operationId,
        input,
        caller,
        definitionGraphDigest: binding.successorAssembly.record.definitionGraphDigest,
        assemblyDigest: binding.successorAssembly.assemblyDigest,
        exposure,
      },
      { assembly: binding.successorAssembly, currentDefinitionGraph: projected.graph },
      sha256,
    );
    return { exposure, admitted };
  };

  const baseRequest = Object.freeze({
    request: null, // per-invocation admitted request (never a shared mutable)
    binding,
    currentDefinitionGraph: projected.graph,
    activator: occurrence.activator,
    admissionRequest: occurrence.admissionRequest,
    admissionPorts: occurrence.admissionPorts,
    effectType,
    dispatch,
    sha256,
  });

  const describe = () => Object.freeze({
    experiment: 'v08-b2-r3-a1',
    derivedFromBase: 'e11a0510134903d6f05a20dd024f3740429edc33',
    domainId: occurrence.domainId,
    packageId: occurrence.packageId,
    occurrenceId: occurrence.workflowInstanceId,
    workflowTarget: occurrence.workflowTarget,
    componentId: projected.attested.componentId,
    implementationId: projected.attested.implementationId,
    operationId,
    manifestSha256: physical.manifestSha256,
    moduleSha256: 'sha256:' + physical.moduleSha256,
    kindRef: snap(projected.attested.kindRef),
    effectType,
    effectClass: projected.attested.effectClass,
    callerScope: snap(projected.attested.callerScope),
    assemblyDigest: binding.successorAssembly.assemblyDigest,
    definitionGraphDigest: binding.successorAssembly.record.definitionGraphDigest,
    occurrencePin: Object.freeze({
      workflowInstanceId: occurrence.pin.workflowInstanceId,
      authorityClass: occurrence.pin.authorityClass,
      pinBindingDigest: occurrence.pin.bindingDigest,
      assemblyDigest: occurrence.pin.assemblyDigest,
    }),
    policyBindingFingerprint: policy.bindingFingerprint(),
    k1Interface: Object.freeze({
      seam: 'bindProjectedPhysicalToNativeAuthority',
      status: 'PARTIAL — awaiting #983 physical selected handler + one Assembly',
      physicalSelectionShape: 'see experiments/v08-b2-r3-a1/authority/native-projection.mjs',
    }),
  });

  const journalRecords = () => occurrence.journal.getRecords().map((record) => snap(record));

  // ---- P1-03: closed non-authority business input parsing. Authority-bearing
  // material is typed-rejected BEFORE any admission/dispatch work.
  function parseBusinessRequest(businessRequest) {
    if (businessRequest === undefined || businessRequest === null) {
      deny('E_HOST_BUSINESS_INPUT');
    }
    if (typeof businessRequest !== 'object' || Array.isArray(businessRequest)) {
      deny('E_HOST_BUSINESS_INPUT_ONLY');
    }
    for (const key of Object.keys(businessRequest)) {
      if (!BUSINESS_INPUT_KEYS.includes(key)) {
        deny('E_HOST_BUSINESS_INPUT_ONLY');
      }
    }
    if (!('input' in businessRequest) || !('caller' in businessRequest)) {
      deny('E_HOST_BUSINESS_INPUT');
    }
    let input;
    try {
      input = JSON.parse(JSON.stringify(businessRequest.input));
    } catch {
      deny('E_HOST_BUSINESS_INPUT');
    }
    if (input === null || typeof input !== 'object') {
      deny('E_HOST_BUSINESS_INPUT');
    }
    const caller = businessRequest.caller;
    if (!caller || typeof caller !== 'object' || Array.isArray(caller)) {
      deny('E_HOST_BUSINESS_INPUT');
    }
    return { input, caller };
  }

  const invokeAdmitted = async (input, caller) => {
    const { admitted } = await admitFor(input, caller);
    return invokeWithExistingV07Authority({ ...baseRequest, request: admitted });
  };

  // ---- The public/trusted Host façade (the Domain App API). Frozen; carries
  // no authority material and no path to reconfigure Host-owned ports.
  const facade = Object.freeze({
    /** Business-only invocation: exactly {input, caller}. */
    async invoke(businessRequest) {
      await physicalSeal.requirePhysicalCurrentness(); // Host byte-currentness gate
      const { input, caller } = parseBusinessRequest(businessRequest);
      return invokeAdmitted(input, caller);
    },
    /** Exact provenance export (also the #983 K1 consumption contract). */
    describe,
    /** Read-only ORIGINAL journal evidence export. */
    journalRecords,
    journalCompletedCount() {
      return journalRecords().filter((record) => record.status === 'completed').length;
    },
    getDispatchCount() {
      return dispatchCount;
    },
    policyStats() {
      return policy.policyStats();
    },
    async requirePhysicalCurrentness() {
      return physicalSeal.requirePhysicalCurrentness();
    },
    rebind() {
      deny('E_HOST_REBIND_FORBIDDEN');
    },
  });

  const internals = Object.freeze({
    physicalSeal,
    physical: Object.freeze(snap({
      packageId: physical.packageId,
      manifestSha256: physical.manifestSha256,
      moduleSha256: physical.moduleSha256,
      kindRef: physical.kindRef,
      component: physical.component,
      implementation: physical.implementation,
      operation: physical.operation,
    })),
    handler: physical.handler,
    projected,
    graph: projected.graph,
    binding,
    occurrence,
    policy,
    dispatch,
    sha256,
    armedIntentInput: Object.freeze(snap(armedIntentInput)),
    armedCaller: Object.freeze(snap(authorizedCallers[0])),
    baseRequest,
    admitFor,
  });

  return Object.freeze({ facade, internals });
}

/**
 * Public trusted Host constructor: seals the physical package through the
 * trusted B2 Host (B1-attested bytes) and returns ONLY the frozen façade.
 * No privileged material is reachable from the returned object.
 */
export async function createNativeAuthorityHost(trusted) {
  requireHostSelectorInput(trusted);
  const { trustedBHost, selector } = trusted;
  const physicalSeal = await trustedBHost.seal(selector);
  const physical = physicalSeal.nativeSelection();
  const { facade } = await bindProjectedPhysicalToNativeAuthority({
    ...trusted,
    physical,
    physicalSeal,
  });
  return facade;
}

/**
 * PRIVILEGED RESEARCH CONSTRUCTOR (clearly fenced, NOT a production API):
 * returns the façade PLUS `trustedResearchPort` so adversarial tests can
 * present forged authority material to the underlying ORIGINAL v0.7 seam and
 * prove it fail-closes. The façade object itself carries NO such port and no
 * override path — a Domain App consumer can never reach this material. The
 * underlying v0.7 module additionally validates every injected port shape and
 * installs the ONLY verified-binding effect adapter, so even this privileged
 * channel cannot substitute effect authority (proven by the A3 negatives).
 */
export async function createNativeAuthorityHostForTrustedResearch(trusted) {
  requireHostSelectorInput(trusted);
  const { trustedBHost, selector } = trusted;
  const physicalSeal = await trustedBHost.seal(selector);
  const physical = physicalSeal.nativeSelection();
  const { facade, internals } = await bindProjectedPhysicalToNativeAuthority({
    ...trusted,
    physical,
    physicalSeal,
  });
  const trustedResearchPort = Object.freeze({
    /** Fresh exposure + admitted request through the REAL trusted policy. */
    async admitArmed() {
      return internals.admitFor(internals.armedIntentInput, internals.armedCaller);
    },
    /**
     * R2-style overrides channel — deliberately KEPT OUT of the public façade.
     * Every A3 negative injected here must be typed-rejected by the ORIGINAL
     * v0.7 seam itself with 0 unauthorized dispatch and 0 journal effect rows.
     */
    async invokeWithMaterial(overrides = {}) {
      await physicalSeal.requirePhysicalCurrentness();
      const { admitted } = await internals.admitFor(internals.armedIntentInput, internals.armedCaller);
      return invokeWithExistingV07Authority({ ...internals.baseRequest, request: admitted, ...overrides });
    },
    internals,
  });
  return Object.freeze({ facade, trustedResearchPort });
}
