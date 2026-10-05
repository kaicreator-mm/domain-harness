/**
 * v0.7 T002C atomic activation/execution pin integration (issues #617, #589
 * PACK-B T002C; MICROKERNEL boundary class per #580/#581/#582).
 *
 * This module is the SOLE producer of the assembly activation/execution-pin
 * integration. It extends - never parallels - the existing authoritative
 * activation/occurrence authority of `execution-binding.ts`
 * (`GovernanceExecutionPin` / `DomainActivationBinding` /
 * `GovernanceExecutionCoordinator` / `DurableExecutionStore` /
 * `recoverGovernanceExecutionAuthority`), binding the exact sealed T002B
 * Assembly digest (#587 `SealedRuntimeAssembly.assemblyDigest`) into the
 * existing package/governance/currentness/runtime-occurrence tuple.
 *
 * Frozen invariants (#589 T002C):
 *  - all authority-bearing pin fields are synchronously snapshotted before
 *    any `await` (#617 torn-snapshot discipline): a caller mutating its own
 *    binding, Definition graph or Assembly reference mid-flight can never
 *    produce torn or hybrid activation authority;
 *  - activation is all-or-nothing: a missing/stale/replaced Definition graph,
 *    Assembly, package/CDI or Governance Baseline fails closed BEFORE any
 *    durable pin is bound (no partial authority);
 *  - replay/recovery resolves the same exact Assembly identity, never a
 *    mutable provider alias; an Assembly replacement never overwrites a
 *    pinned occurrence (bind-once);
 *  - a sealed Assembly alone is NOT activation authority - only this
 *    activation path mints an assembly-bound execution pin;
 *  - the pin carries no Tool/Workflow-specific semantics - only the generic
 *    content-addressed Assembly digest.
 *
 * Boundary discipline (inward only): consumes the T002B sealed-Assembly port
 * (`runtime-assembly.ts`), the #555 repaired Definition graph digest seam, and
 * the existing execution-binding authority. No concrete Workflow/XState,
 * ToolRegistry, storage or provider import is permitted here.
 */
import {
  computeDefinitionGraphDigest,
  validateDefinitionGraphEnvelope,
  type DefinitionGraphEnvelope,
} from '../contracts/definition-graph.js';
import type { ContentDigest, Sha256Port } from '../contracts/identity.js';
import {
  isSealedRuntimeAssembly,
  type SealedRuntimeAssembly,
} from '../contracts/runtime-assembly.js';
import type { GovernanceBaselineBody, GovernanceBaselineStore } from './contracts.js';
import {
  GovernanceExecutionBindingError,
  assertDomainActivationBinding,
  cloneActivationBinding,
  createGovernanceExecutionPin,
  recoverGovernanceExecutionAuthority,
  requireExactAssemblyDigest,
  requireExactGovernanceBody,
  requireExactPackageCdi,
  validateGovernanceExecutionPin,
  type DomainActivationBinding,
  type DurableExecutionStore,
  type ExactPackageCdiAuthority,
  type GovernanceBoundSnapshot,
  type GovernanceExecutionPin,
} from './execution-binding.js';

function fail(code: GovernanceExecutionBindingError['code'], message: string): never {
  throw new GovernanceExecutionBindingError(code, message);
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail('INVALID_DOMAIN_ACTIVATION_BINDING', `${field} must be a non-empty string`);
  }
  return value;
}

/** All-or-nothing assembly activation request for one runtime occurrence. */
export interface ActivateAssemblyExecutionRequest {
  /** Exact workflow target (runtime occurrence identity). */
  readonly workflowTarget: string;
  /** Exact workflow instance id (runtime occurrence identity). */
  readonly workflowInstanceId: string;
  /** The exact package/governance/currentness tuple to activate under. */
  readonly binding: DomainActivationBinding;
  /** The sealed T002B Assembly (anti-forgery minted) to bind into the pin. */
  readonly assembly: SealedRuntimeAssembly;
  /** The live Definition graph the Assembly currentness is proven against. */
  readonly currentDefinitionGraph: DefinitionGraphEnvelope;
}

/** Exact assembly-bound execution authority recovered for replay/recovery. */
export interface RecoveredAssemblyExecution {
  readonly pin: GovernanceExecutionPin;
  /** The exact sealed Assembly identity the occurrence was pinned under. */
  readonly assemblyDigest: ContentDigest;
  readonly governanceBaseline: GovernanceBaselineBody;
  readonly snapshot?: GovernanceBoundSnapshot;
}

/**
 * Atomic assembly activation authority. Reuses the ONE existing
 * `DurableExecutionStore` and `GovernanceExecutionPin` shape - it creates no
 * second pin hierarchy, store or effect authority (#537, #582 finding 10).
 */
export class AssemblyExecutionActivator {
  readonly #store: DurableExecutionStore;
  readonly #packageCdiAuthority: ExactPackageCdiAuthority;
  readonly #baselines: GovernanceBaselineStore;
  readonly #sha256: Sha256Port;

  constructor(
    store: DurableExecutionStore,
    packageCdiAuthority: ExactPackageCdiAuthority,
    baselines: GovernanceBaselineStore,
    sha256: Sha256Port,
  ) {
    this.#store = store;
    this.#packageCdiAuthority = packageCdiAuthority;
    this.#baselines = baselines;
    this.#sha256 = sha256;
  }

  /**
   * Atomically activate one runtime occurrence under an exact sealed Assembly.
   *
   * Torn-snapshot discipline (#617): every authority-bearing field is read,
   * validated and snapshotted synchronously in PHASE 1 BEFORE the first
   * `await`; after any suspension only module-owned snapshot material is
   * read, so caller mutation mid-flight cannot produce hybrid authority.
   *
   * All-or-nothing: Definition currentness, package/CDI currentness and
   * Governance Baseline currentness are each proven BEFORE the durable
   * bind-once; any failure leaves the store untouched (fail closed, never a
   * partial pin).
   */
  async activate(request: ActivateAssemblyExecutionRequest): Promise<GovernanceExecutionPin> {
    // ---- PHASE 1 (synchronous): read, validate and snapshot all authority material.
    if (typeof request !== 'object' || request === null) {
      fail('INVALID_DOMAIN_ACTIVATION_BINDING', 'assembly activation request must be an object');
    }
    const workflowTarget = requireNonEmptyString(request.workflowTarget, 'workflowTarget');
    const workflowInstanceId = requireNonEmptyString(request.workflowInstanceId, 'workflowInstanceId');
    const bindingInput: DomainActivationBinding = request.binding;
    const assemblyInput: SealedRuntimeAssembly = request.assembly;
    const graphInput: DefinitionGraphEnvelope = request.currentDefinitionGraph;

    assertDomainActivationBinding(bindingInput);
    const binding = cloneActivationBinding(bindingInput);

    // Anti-forgery (#587/#575): only a genuine sealed Assembly minted by
    // sealRuntimeAssembly can authorize activation; a caller-constructed
    // object never carries the module-private mint registry membership.
    if (!isSealedRuntimeAssembly(assemblyInput)) {
      fail(
        'ASSEMBLY_NOT_SEALED',
        'assembly activation requires a SealedRuntimeAssembly minted by sealRuntimeAssembly; a caller-constructed assembly can never carry the sealed-Assembly brand',
      );
    }
    const assemblyDigest = requireExactAssemblyDigest(assemblyInput.assemblyDigest, 'assembly.assemblyDigest');
    // The sealed Assembly is deeply frozen at mint time, so its record digest
    // is already immutable; capture it synchronously as snapshot material.
    const assemblyDefinitionGraphDigest: ContentDigest = assemblyInput.record.definitionGraphDigest;

    // Synchronous descriptor-safe graph validation (the #555 seam snapshots
    // the admitted graph internally before its first await, so the digest in
    // PHASE 2 is torn-safe).
    validateDefinitionGraphEnvelope(graphInput);

    // ---- PHASE 2 (async): currentness proofs + atomic bind-once. No caller-owned re-read.
    const currentDigest = await computeDefinitionGraphDigest(graphInput, this.#sha256);
    if (currentDigest !== assemblyDefinitionGraphDigest) {
      fail(
        'ASSEMBLY_DEFINITION_CURRENTNESS_MISMATCH',
        'the current Definition graph digest does not match the exact digest the sealed Assembly was bound to; a stale or replaced Definition fails closed before any pin is bound',
      );
    }
    await requireExactPackageCdi(binding, this.#packageCdiAuthority, 'PACKAGE_CDI_BINDING_MISMATCH');
    await requireExactGovernanceBody(
      binding,
      this.#baselines,
      this.#sha256,
      'GOVERNANCE_BASELINE_BINDING_MISMATCH',
    );

    const pin = await createGovernanceExecutionPin(
      { workflowTarget, workflowInstanceId, binding, assemblyDigest },
      this.#sha256,
    );
    const disposition = await this.#store.bindGovernanceExecutionPin(pin);
    if (disposition === 'conflict') {
      fail(
        'GOVERNANCE_EXECUTION_PIN_CONFLICT',
        `workflow instance ${pin.workflowInstanceId} is already bound to different execution authority; an Assembly replacement can never overwrite a pinned occurrence`,
      );
    }
    return this.requireActivatedExecution(workflowInstanceId);
  }

  /**
   * v0.7 activation gate: returns only after the exact assembly-bound pin is
   * already durable. A durable pin that carries no exact `assemblyDigest`
   * (a pre-T002C legacy pin) fails closed here - there is no silent fallback
   * to non-assembly authority.
   */
  async requireActivatedExecution(workflowInstanceId: string): Promise<GovernanceExecutionPin> {
    const id = requireNonEmptyString(workflowInstanceId, 'workflowInstanceId');
    const raw = await this.#store.getGovernanceExecutionPin(id);
    if (raw === undefined || raw === null) {
      fail(
        'GOVERNANCE_EXECUTION_PIN_MISSING',
        `workflow instance ${id} has no durable GovernanceExecutionPin; a sealed Assembly alone is not activation authority`,
      );
    }
    const pin = await validateGovernanceExecutionPin(raw, this.#sha256, id);
    if (pin.assemblyDigest === undefined) {
      fail(
        'MISSING_ASSEMBLY_DIGEST',
        `the durable pin for ${id} carries no exact assemblyDigest; the v0.7 assembly-activation gate requires the exact sealed Assembly identity (no silent fallback)`,
      );
    }
    return pin;
  }

  /**
   * Replay/recovery: resolves the SAME exact Assembly identity the occurrence
   * was pinned under, never a mutable provider alias. Package/CDI and
   * Governance Baseline currentness are re-proven by the existing recovery
   * seam; the recovered pin's `assemblyDigest` must be present and exact, and
   * when an `expectedAssembly` is supplied it must match exactly (a replaced
   * Assembly is never an acceptable replay target for an old pin).
   */
  async recover(request: {
    readonly workflowInstanceId: string;
    readonly expectedAssembly?: SealedRuntimeAssembly;
  }): Promise<RecoveredAssemblyExecution> {
    const workflowInstanceId = requireNonEmptyString(request.workflowInstanceId, 'workflowInstanceId');
    const expectedAssembly: SealedRuntimeAssembly | undefined = request.expectedAssembly;
    if (expectedAssembly !== undefined && !isSealedRuntimeAssembly(expectedAssembly)) {
      fail(
        'ASSEMBLY_NOT_SEALED',
        'expectedAssembly must be a SealedRuntimeAssembly minted by sealRuntimeAssembly',
      );
    }

    const recovered = await recoverGovernanceExecutionAuthority({
      workflowInstanceId,
      store: this.#store,
      packageCdiAuthority: this.#packageCdiAuthority,
      baselines: this.#baselines,
      sha256: this.#sha256,
    });
    const pin = recovered.pin;
    if (pin.assemblyDigest === undefined) {
      fail(
        'MISSING_ASSEMBLY_DIGEST',
        `cannot replay ${workflowInstanceId}: the durable pin carries no exact assemblyDigest; v0.7 replay resolves the exact sealed Assembly identity, never a mutable alias`,
      );
    }
    requireExactAssemblyDigest(pin.assemblyDigest, 'recovered pin assemblyDigest');
    if (expectedAssembly !== undefined && expectedAssembly.assemblyDigest !== pin.assemblyDigest) {
      fail(
        'ASSEMBLY_REPLAY_MISMATCH',
        `replay Assembly ${expectedAssembly.assemblyDigest} does not match the exact assemblyDigest pinned for ${workflowInstanceId}; a replaced Assembly cannot satisfy an old pin`,
      );
    }
    return Object.freeze({
      pin,
      assemblyDigest: pin.assemblyDigest,
      governanceBaseline: recovered.governanceBaseline,
      ...(recovered.snapshot === undefined ? {} : { snapshot: recovered.snapshot }),
    });
  }
}
