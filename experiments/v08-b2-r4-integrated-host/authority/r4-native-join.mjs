/**
 * #987 V08-B2-R4: successor fork of the A1 trusted Host bridge, binding ONE
 * K1-sealed FOUR-package physical Assembly onto the ORIGINAL native v0.7
 * authority chain.
 *
 * Successor of experiments/v08-b2-r3-a1/authority/native-authority-host.mjs
 * `bindProjectedPhysicalToNativeAuthority` at A1 HEAD
 * 0ef92f9433ba9e2d32260c32961859e1c686a63e (READ_ONLY — the A1 file itself is
 * NOT modified, per #987). Line-level changed-lines justification vs the A1
 * predecessor (every other line is behavior-identical):
 *
 * 1. HANDLER CALL CONVENTION (Controller #983@6083264345 / #984@6083262997
 *    Falsifier 2): the Host dispatch port calls `query.handle({ input:
 *    query.input })` — the K1/D1 selected-callable convention, transferred
 *    exactly as K1 host/native-join.mjs L149-151 does — instead of A1's raw
 *    `query.handle(query.input)`. The bound function IDENTITY is never
 *    replaced: `binding.implementationHandle === physical.handler` stays the
 *    exact attested physical callable (verified below and by the ORIGINAL
 *    T003C mint); only the call convention is adapted at the Host seam.
 * 2. LINEAGE: a Host-only cryptographically checked lineage is captured from
 *    the already-sealed K1 Assembly (digest, four anchored package roots,
 *    graph digest, original D1 kernel.link module pin) through the native
 *    projected graph (T002B successor Assembly digest, definition-graph
 *    digest, T002D PRODUCTION occurrence pin, T004A policy binding
 *    fingerprint, T003C module/implementation pin and handler identity).
 * 3. CURRENTNESS: the FULL K1 whole-Assembly byte currentness
 *    (`k1Seal.requirePhysicalCurrentness()` — re-reads EVERY member package,
 *    unselected D1 Kernel/SDK/Business bytes included) is enforced
 *    immediately before the T004A exposure/request admission and the T004C
 *    dispatch, not only at construction.
 * 4. P1-a INGRESS: the public façade intake is the descriptor-safe
 *    data-only ingress (./r4-ingress.mjs), replacing the A1 `Object.keys` +
 *    `'in'` + `JSON.stringify` intake.
 * 5. P1-b BOUNDARY: this module's public return carries the façade plus
 *    Host-internal material for the CONSTRUCTION side only; the R4 Domain-App
 *    constructor (../host/r4-host.mjs) returns EXACTLY the façade — zero
 *    privileged research transport path. The deliberate well-shaped-dispatch
 *    laboratory lives ONLY in ../lab/trusted-transport-lab.mjs (test-only,
 *    obvious name, explicit acknowledgment), which reuses this same chain.
 *
 * Chain (single authority, no second Runtime/State/Admission/Journal):
 *   K1 sealOperation → adapter eight-key attested selection
 *   → A1 fidelity-preserving projection (READ_ONLY)
 *   → REAL native T003C binding mint over the exact bytes + physical handler
 *   → seal-minted T002B successor Assembly (projected graph)
 *   → T002D PRODUCTION occurrence pin (physical package CDI = RAW manifest SHA)
 *   → T004A exposure + invocation-request admission (trusted Host policy port)
 *   → T004C ORIGINAL Central Admission + ORIGINAL VolatileAdmissionEffectJournal
 *      (via the unchanged A1 invoke-v07 wrapper over the ORIGINAL v0.7 source).
 *
 * Honest inherited-truth record (P1-b, per Fresh Review #984@6084161227): the
 * ORIGINAL v0.7 seam treats a well-shaped in-process dispatch port as TRUSTED
 * transport. A holder of separately exposed privileged Host-internal material
 * CAN therefore inject a well-shaped dispatch that forges a fake output and
 * makes the ORIGINAL journal commit a `completed` row that later replays. R4
 * does NOT claim v0.7 cryptographically rejects all well-shaped Host
 * dispatch — that property is NOT_PROVEN and is recorded as an inherited
 * trusted-transport hazard by the laboratory falsifiers (R4-14). The R4
 * accepted business path exposes no such injection channel.
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
// A1 READ_ONLY modules (predecessor attribution: A1 #985 @ 0ef92f9).
import { invokeWithExistingV07Authority } from '../../v08-b2-r3-a1/authority/invoke-v07.mjs';
import {
  projectPhysicalComponentToNative,
  deriveNativeEffectType,
} from '../../v08-b2-r3-a1/authority/native-projection.mjs';
import { createTrustedHostPolicyPort } from '../../v08-b2-r3-a1/authority/host-policy.mjs';
import { createFreshNativeOccurrence } from '../../v08-b2-r3-a1/authority/native-occurrence.mjs';
// K1 READ_ONLY trust anchor (predecessor attribution: K1 #986 @ 3fde560).
import {
  D1_GENESIS_ROOT_DIGESTS,
  D1_KERNEL_LINK_MODULE_SHA,
} from '../../v08-b2-r3-k1/host/trust-roots.mjs';
import { readTrustedEntries } from '../../v08-b2-r3-k1/host/bootstrap.mjs';
import { parseBusinessRequestDescriptorSafe } from './r4-ingress.mjs';

const sha256 = {
  async digestUtf8(value) {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

const deny = (code, message) => {
  throw Object.assign(new Error(message ?? code), { code });
};
const snap = (x) => JSON.parse(JSON.stringify(x));
const rawSha256Hex = (bytes) => createHash('sha256').update(bytes).digest('hex');

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

function requireTrustedJoinInput(trusted) {
  if (!trusted || typeof trusted !== 'object') deny('E_R4_TRUSTED_INPUT');
  const { k1Host, k1Seal, physical, armedIntentInput, authorizedCallers, instanceOrdinal, k1Root } = trusted;
  if (!k1Host || typeof k1Host.sealOperation !== 'function' || !k1Host.assembly) deny('E_R4_TRUSTED_INPUT');
  if (!k1Seal || k1Seal.assembly !== k1Host.assembly ||
      typeof k1Seal.requirePhysicalCurrentness !== 'function') {
    deny('E_INTEGRATION_BLOCKED', 'the K1 seal must be bound to the exact host Assembly');
  }
  if (!physical || typeof physical !== 'object' || typeof physical.handler !== 'function') {
    deny('E_R4_TRUSTED_INPUT');
  }
  if (!armedIntentInput || typeof armedIntentInput !== 'object') deny('E_R4_TRUSTED_INPUT');
  if (!Array.isArray(authorizedCallers) || authorizedCallers.length === 0) deny('E_R4_TRUSTED_INPUT');
  if (!Number.isInteger(instanceOrdinal) || instanceOrdinal < 0) deny('E_R4_TRUSTED_INPUT');
  if (typeof k1Root !== 'string' || k1Root.length === 0) deny('E_R4_TRUSTED_INPUT', 'k1Root required');
}

/**
 * THE R4 join: given the adapter-produced eight-key attested selection from
 * ONE K1-sealed FOUR-package Assembly, produce the whole native authority
 * chain, the guarded façade, and the Host-internal material (construction
 * side). Only host/r4-host.mjs (façade-only) and lab/trusted-transport-lab.mjs
 * (test-only) consume the internals.
 */
export async function bindR4IntegratedAuthority(trusted) {
  requireTrustedJoinInput(trusted);
  const { k1Host, k1Seal, physical, armedIntentInput, authorizedCallers, instanceOrdinal, k1Root } = trusted;

  // Re-assert the K1 Assembly anchoring at bind time (defense in depth: the
  // adapter verified it, the join re-verifies the lineage root).
  if (k1Host.assembly.packages.length !== 4) deny('E_INTEGRATION_BLOCKED', 'not the four-package K1 Assembly');

  // Independent physical re-verification BEFORE T002B/T003C: re-read every
  // member package through the frozen K1 trust anchor and recompute the RAW
  // manifest/module digests. A forged manifest SHA or module SHA carried by a
  // doctored eight-key snapshot is rejected here, before any native mint,
  // dispatch or journaling (R4-09). Handler FUNCTION identity cannot be
  // re-derived from bytes; it is anchored instead to the genuine K1 seal's
  // own selection below and enforced by the T003C mint + the dispatch
  // identity assertion (E_HOST_BINDING_DRIFT / E_NATIVE_DISPATCH_HANDLE).
  const entries = await readTrustedEntries(k1Root);
  if (entries.length !== 4) deny('E_INTEGRATION_BLOCKED', 'not the four-package physical root');
  const selectedEntry = entries.find((entry) => entry.id === physical.packageId);
  if (!selectedEntry) deny('E_INTEGRATION_BLOCKED', 'selected package is not an Assembly member');
  if (rawSha256Hex(selectedEntry.raw) !== physical.manifestSha256) {
    deny('E_INTEGRATION_BLOCKED', 'forged manifest SHA: physically recomputed manifest bytes disagree');
  }
  const moduleText = selectedEntry.artifacts[physical.implementation.path];
  if (typeof moduleText !== 'string' ||
      rawSha256Hex(Buffer.from(moduleText, 'utf8')) !== physical.moduleSha256) {
    deny('E_INTEGRATION_BLOCKED', 'forged module SHA: physically recomputed module bytes disagree');
  }
  // Cross-check the eight-key snapshot against the genuine K1 seal selection:
  // owner, operation, module SHA and the exact handler FUNCTION must be the
  // seal's own (a wrong-but-real handler from elsewhere in the Assembly can
  // never stand in for the selected callable).
  const sealSelection = k1Seal.nativeSelection();
  if (sealSelection.packageId !== physical.packageId ||
      sealSelection.componentId !== physical.implementation.componentId ||
      sealSelection.componentId !== physical.component.componentId ||
      sealSelection.operationId !== physical.operation.operationId ||
      sealSelection.moduleSha256 !== physical.moduleSha256 ||
      sealSelection.handler !== physical.handler) {
    deny('E_INTEGRATION_BLOCKED',
      'the eight-key selection does not match the genuine K1 seal identity (forged handler/owner rejected)');
  }

  // ---- A1 fidelity-preserving projection (READ_ONLY, typed rejects).
  const projected = projectPhysicalComponentToNative(physical);
  const operationId = projected.attested.operationId;
  const effectType = deriveNativeEffectType(physical);

  // ---- T002B: seal-mint the successor Assembly over the projected graph.
  const baseAssembly = await sealRuntimeAssembly(
    { definitionGraph: projected.graph, kindImplementations: [projected.kindImplementation] },
    sha256,
  );
  const definitionGraphDigest = await computeDefinitionGraphDigest(projected.graph, sha256);

  // ---- Consumed physical capabilities must resolve in the native graph.
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

  // ---- T003C: REAL binding mint over the exact attested physical handler.
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
  // package identity (CDI = RAW manifest SHA of the genuine K1 package bytes).
  const occurrence = await createFreshNativeOccurrence({
    physical, graph: projected.graph, assembly: binding.successorAssembly,
    armedIntentInput, sha256, instanceOrdinal,
  });

  // ---- Trusted Host-ONLY policy port (A1 READ_ONLY), bound to the exact
  // attested tuple and consumed through the ORIGINAL T004A owner API.
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
  // exact operation, exact binding-derived effect type — under the K1/D1
  // selected-callable convention (adaptation #1 in the module doc).
  let dispatchCount = 0;
  const dispatch = Object.freeze({
    async dispatch(query) {
      if (query.handle !== physical.handler || query.operationId !== operationId ||
          query.effectType !== effectType) {
        deny('E_NATIVE_DISPATCH_HANDLE');
      }
      dispatchCount += 1;
      return query.handle({ input: query.input });
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

  // ---- Host-only cryptographically checked lineage (adaptation #2).
  const lineage = deepFreeze({
    concern: 'V08_B2_R4_K1_TO_A1_TRUSTED_NATIVE_INTEGRATION',
    predecessors: {
      k1: 'PR#986@3fde560baaf36da89a9de9cd1327be3a88a77570',
      a1: 'PR#985@0ef92f9433ba9e2d32260c32961859e1c686a63e',
    },
    k1AssemblyDigest: k1Host.assembly.digest,
    k1GraphDigest: k1Host.assembly.graphDigest,
    k1Packages: snap(k1Host.assembly.packages),
    d1KernelRoot: D1_GENESIS_ROOT_DIGESTS.kernel,
    d1SdkRoot: D1_GENESIS_ROOT_DIGESTS.sdk,
    d1KernelLinkModuleSha256: D1_KERNEL_LINK_MODULE_SHA,
    domainId: occurrence.domainId,
    packageId: physical.packageId,
    componentId: projected.attested.componentId,
    implementationId: physical.implementation.implementationId,
    operationId,
    effectType,
    effectClass: projected.attested.effectClass,
    manifestSha256: physical.manifestSha256,
    moduleSha256Hex: physical.moduleSha256,
    nativeAssemblyDigest: binding.successorAssembly.assemblyDigest,
    nativeDefinitionGraphDigest: binding.successorAssembly.record.definitionGraphDigest,
    occurrence: {
      workflowInstanceId: occurrence.workflowInstanceId,
      workflowTarget: occurrence.workflowTarget,
      authorityClass: occurrence.pin.authorityClass,
      pinAssemblyDigest: occurrence.pin.assemblyDigest,
      pinBindingDigest: occurrence.pin.bindingDigest,
    },
    t004aPolicyBindingFingerprint: policy.bindingFingerprint(),
    t003cHandlerIdentityPreserved: binding.implementationHandle === physical.handler,
  });

  const describe = () => Object.freeze({
    experiment: 'v08-b2-r4-integrated-host',
    derivedFromPredecessors: {
      k1: 'PR#986@3fde560baaf36da89a9de9cd1327be3a88a77570',
      a1: 'PR#985@0ef92f9433ba9e2d32260c32961859e1c686a63e',
    },
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
    k1AssemblyDigest: k1Host.assembly.digest,
    callerAuthentication: 'NOT_PROVEN — Host must supply authenticated provenance; user-claimed caller is not a verified identity (#972 D2 ingress prerequisite)',
  });

  const journalRecords = () => occurrence.journal.getRecords().map((record) => snap(record));

  const invokeAdmitted = async (input, caller) => {
    // FULL K1 whole-Assembly currentness immediately before T004A/T004C
    // (adaptation #3): unselected Kernel/SDK/Business bytes re-read too.
    await k1Seal.requirePhysicalCurrentness();
    const { admitted } = await admitFor(input, caller);
    return invokeWithExistingV07Authority({ ...baseRequest, request: admitted });
  };

  // ---- The public/trusted R4 façade (adaptation #4: descriptor-safe ingress;
  // adaptation #5: zero privileged research transport path).
  const facade = Object.freeze({
    /** Business-only invocation: exactly {input, caller}, descriptor-safe. */
    async invoke(businessRequest) {
      const { input, caller } = parseBusinessRequestDescriptorSafe(businessRequest);
      return invokeAdmitted(input, caller);
    },
    /** Exact provenance export (K1 lineage + native chain identity). */
    describe,
    /** Host-only cryptographically checked lineage export. */
    assemblyLineage() {
      return snap(lineage);
    },
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
      await k1Seal.requirePhysicalCurrentness();
      return true;
    },
    rebind() {
      deny('E_HOST_REBIND_FORBIDDEN');
    },
  });

  const internals = Object.freeze({
    k1Host, k1Seal,
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
    lineage,
  });

  return Object.freeze({ facade, internals });
}
