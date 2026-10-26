/**
 * DomainHarness v0.10 C01 (#1177) — the selected K→C external Effect
 * Operation: ONE trusted gate contract shared by EVERY selected external
 * effect adapter.
 * ===========================================================================
 * [v0.10.2 T04 #1324] canonical owner moved from the legacy compiler
 * v10build tree (LEGACY_COMPAT_ONLY there until T11) into the Microkernel,
 * rewired per frozen L2 section 2 (L2-A / O3): the durable authority
 * re-read (permit live / same turn / same business / capability / operation
 * / unexpired; journal `started`; admission fence held by this turn;
 * matching dispatch claim) is NO LONGER interpreted by the Host gate. It is
 * consumed from the loaded selected K module instance through the K-owned
 * additive read-only export `readEffectAuthorityView` — never by a static
 * import of K source and never through a copy in Contracts. The gate keeps
 * only step 1 (the kernel-minted attest claim shape), the physical adapter
 * dispatch, the phase-envelope normalization and the await-policy
 * enforcement of the view's answer.
 *
 * Authority shape (frozen DAG C01):
 *
 *   - ONLY the kernel mints and consumes a live external Effect Permit
 *     document (through the K docs port). The kernel's per-call attest
 *     channel is the only way a dispatch can even CLAIM a permit;
 *     Business/Standard/UX code can neither mint, copy nor replay one into
 *     authority.
 *   - The trusted Host gate (this module, invoked by the activation facade)
 *     validates the attest claim shape, delegates the durable-truth re-read
 *     to the loaded K instance and dispatches ONLY past an
 *     `{ ok: true, ... }` view answer. A selected K that lacks the additive
 *     protocol export refuses typed with ZERO adapter dispatch and the
 *     pre-handler-refusal mark on the attest (reusing code
 *     V10_EFFECT_PERMIT_REQUIRED — no new literal), exactly like a call
 *     that carries no permit claim at all.
 *   - Adapters return ONE phase envelope (`accepted`/`running` are never
 *     terminal; only `terminal` carries an outcome). An
 *     `await: 'terminal'` binding fails closed on any non-terminal
 *     envelope — a fake accepted ACK can never become success.
 */
import { isPlainRecord, V10ExternalEffectError } from '@kaicreator/domain-harness-contracts';

/**
 * The K-issued address context of ONE external effect dispatch: the kernel
 * resolves these EXACT doc keys from its OWN doc-key family — the legacy
 * `v08-kernel:` family OR the K02 scoped
 * `v010-k02:<deployedAppId>:<tenantId>:<appId>:<businessPackageId>:<kind>:`
 * family — and hands them to the trusted gate through the kernel-minted
 * attest channel. The gate never reconstructs a key and never falls back to
 * the unscoped legacy family for a scoped deployment.
 */
export interface ExternalEffectAuthorityKeys {
  readonly permit: string;
  readonly journal: string;
  readonly fence: string;
  readonly dispatchClaim: string;
}

/** The read-only K authority view of one dispatch (L2 section 2 shape). */
export type V10EffectAuthorityView = (options: {
  readonly get: (key: string) => Promise<{ value: unknown; revision: number } | null>;
  readonly attest: unknown;
  readonly capabilityKey: string;
  readonly operationId: string;
  readonly nowIso: string;
}) => Promise<
  | { readonly ok: true; readonly effectId: string; readonly durableControlTurnId: string; readonly attempt: number; readonly awaitPolicy: unknown }
  | { readonly ok: false; readonly code: string; readonly message: string }
>;

/** The selected external Effect Operation's phase envelope. */
export type ExternalEffectEnvelope =
  | { readonly phase: 'accepted'; readonly externalRef: string }
  | { readonly phase: 'running'; readonly externalRef: string }
  | {
    readonly phase: 'terminal';
    readonly externalRef: string;
    readonly outcome: { readonly ok: true; readonly output: unknown } | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } };
  };


/** Typed normalization of ONE adapter return into the phase envelope. */
export function normalizeExternalEffectEnvelope(raw: unknown): ExternalEffectEnvelope {
  if (!isPlainRecord(raw)) {
    throw new V10ExternalEffectError('V10_EXTERNAL_ENVELOPE_INVALID', '[V10_EXTERNAL_ENVELOPE_INVALID] an external effect adapter must return a plain phase-envelope record');
  }
  if (raw.phase !== 'accepted' && raw.phase !== 'running' && raw.phase !== 'terminal') {
    throw new V10ExternalEffectError(
      'V10_EXTERNAL_ENVELOPE_INVALID',
      `an external effect adapter returned the unknown phase ${JSON.stringify(String(raw.phase))}; the grammar is accepted|running|terminal`,
    );
  }
  if (typeof raw.externalRef !== 'string' || raw.externalRef.length === 0 || raw.externalRef.length > 256) {
    throw new V10ExternalEffectError('V10_EXTERNAL_ENVELOPE_INVALID', '[V10_EXTERNAL_ENVELOPE_INVALID] an external effect envelope carries a bounded non-empty externalRef');
  }
  if (raw.phase !== 'terminal') {
    // Accepted/running are honest NON-terminal phases: an outcome riding a
    // non-terminal envelope is exactly the false-terminal-success shape this
    // contract forbids.
    if (raw.outcome !== undefined) {
      throw new V10ExternalEffectError(
        'V10_EXTERNAL_ENVELOPE_INVALID',
        `[V10_EXTERNAL_ENVELOPE_INVALID] a ${String(raw.phase)} envelope must not carry an outcome; only terminal envelopes settle`,
      );
    }
    return { phase: raw.phase, externalRef: raw.externalRef };
  }
  const outcome = raw.outcome;
  if (!isPlainRecord(outcome) || typeof outcome.ok !== 'boolean') {
    throw new V10ExternalEffectError('V10_EXTERNAL_ENVELOPE_INVALID', '[V10_EXTERNAL_ENVELOPE_INVALID] a terminal envelope carries an {ok, ...} outcome record');
  }
  if (outcome.ok === true) {
    return { phase: 'terminal', externalRef: raw.externalRef, outcome: { ok: true, output: outcome.output } };
  }
  const error = outcome.error;
  if (!isPlainRecord(error) || typeof error.code !== 'string' || typeof error.message !== 'string') {
    throw new V10ExternalEffectError('V10_EXTERNAL_ENVELOPE_INVALID', '[V10_EXTERNAL_ENVELOPE_INVALID] a failed terminal outcome carries a typed {code, message} error');
  }
  return { phase: 'terminal', externalRef: raw.externalRef, outcome: { ok: false, error: { code: error.code, message: error.message } } };
}

/** The read-only K docs view the gate needs: scoped by the dispatching business. */
export interface ExternalEffectDocsPort {
  get(businessPackageId: string, key: string): Promise<{ value: unknown; revision: number } | null>;
}

export interface ExternalEffectGateDeps {
  readonly docs: ExternalEffectDocsPort;
  /**
   * The loaded selected kernel's OWN `readEffectAuthorityView` export,
   * obtained from the K namespace the activation already holds (L2 §2).
   * Absent (a selected K without the T01k additive protocol) refuses typed
   * with ZERO adapter dispatch and the pre-handler-refusal mark, reusing
   * code V10_EFFECT_PERMIT_REQUIRED.
   */
  readonly readAuthorityView: V10EffectAuthorityView | undefined;
  /** The Host wall clock as an ISO string in the kernel's clock grammar. */
  readonly nowIso: () => string;
  /** Observability hooks (never authority). */
  readonly onDispatch?: (capabilityId: string, operationId: string) => void;
  readonly onRefusal?: (code: string) => void;
}

export interface ExternalEffectDispatchRequest {
  readonly capabilityId: string;
  readonly operationId: string;
  readonly payload: Record<string, unknown>;
  /** The kernel-minted per-call attest object (4th resources channel). */
  readonly attest: unknown;
  /** Invoke the sealed adapter handler (reached only past every authority check). */
  readonly invoke: (payload: Record<string, unknown>, dispatchContext: {
    readonly capabilityId: string;
    readonly operationId: string;
    readonly effectPermit: { readonly effectId: string; readonly durableControlTurnId: string; readonly attempt: number };
  }) => Promise<unknown>;
}

/**
 * Refuse typed with ZERO adapter dispatch, marking the trusted pre-handler
 * refusal into the kernel-minted attest (when the caller passed one) so the
 * #1108 K01 dispatch probe can prove zero external effect for this call.
 */
function refuseGate(attest: unknown, onRefusal: ((code: string) => void) | undefined, code: string, message: string): never {
  if (isPlainRecord(attest)) {
    (attest as { preHandlerRefusal: unknown }).preHandlerRefusal = code;
  }
  onRefusal?.(code);
  // The typed code rides IN the message too: the kernel's effect-failure
  // wrapper carries only the message text into the journal record.
  throw new V10ExternalEffectError(code, `[${code}] ${message}`);
}

/**
 * The trusted dispatch gate of the selected K→C external Effect Operation.
 * Validates the kernel-minted attest claim shape, delegates the durable
 * authority re-read to the loaded K instance's read-only view, then invokes
 * the adapter, normalizes the returned phase envelope and enforces the
 * binding's await policy.
 */
export async function dispatchThroughExternalEffectGate(
  deps: ExternalEffectGateDeps,
  request: ExternalEffectDispatchRequest,
): Promise<ExternalEffectEnvelope> {
  const { attest } = request;

  // (1) The claim channel: only the kernel's wrapper hands a permit claim to
  // the raw resources port. The claim carries the kernel-issued ADDRESS
  // CONTEXT (exact document keys + business identity) — a scoped deployment
  // is addressed under its own K02 grammar, never a legacy fallback. No
  // claim ⇒ no K-issued live permit ⇒ typed refusal with zero dispatch.
  if (!isPlainRecord(attest) || !isPlainRecord(attest.effectPermit)
    || typeof attest.effectPermit.effectId !== 'string' || attest.effectPermit.effectId.length === 0
    || typeof attest.effectPermit.durableControlTurnId !== 'string' || attest.effectPermit.durableControlTurnId.length === 0
    || typeof attest.effectPermit.businessPackageId !== 'string' || attest.effectPermit.businessPackageId.length === 0
    || !isPlainRecord(attest.effectPermit.keys)) {
    refuseGate(attest, deps.onRefusal, 'V10_EFFECT_PERMIT_REQUIRED',
      `external effect capability ${request.capabilityId} dispatches only under a live K-issued effect permit; this call carries none`);
  }
  const claim = attest.effectPermit as {
    effectId: string;
    durableControlTurnId: string;
    businessPackageId: string;
    keys: Record<string, unknown>;
  };
  for (const name of ['permit', 'journal', 'fence', 'dispatchClaim'] as const) {
    const value = claim.keys[name];
    if (typeof value !== 'string' || value.length === 0) {
      refuseGate(attest, deps.onRefusal, 'V10_EFFECT_PERMIT_REQUIRED',
        `the K-issued permit claim for ${claim.effectId} carries no ${name} document address; the gate refuses an address-less dispatch`);
    }
  }

  // (2) The durable authority re-read belongs to the loaded selected kernel
  // (L2 §2): a K instance without the additive read-only protocol export can
  // never authorize a dispatch — typed refusal, zero adapter dispatch, the
  // trusted pre-handler-refusal mark, no new literal.
  if (typeof deps.readAuthorityView !== 'function') {
    refuseGate(attest, deps.onRefusal, 'V10_EFFECT_PERMIT_REQUIRED',
      `the selected kernel exposes no read-only effect authority view; external effect capability ${request.capabilityId} refuses to re-read durable K truth through any Host-side mirror`);
  }
  const view = await deps.readAuthorityView({
    get: async (key: string) => await deps.docs.get(claim.businessPackageId, key),
    attest,
    capabilityKey: request.capabilityId,
    operationId: request.operationId,
    nowIso: deps.nowIso(),
  });
  if (view.ok !== true) {
    refuseGate(attest, deps.onRefusal, view.code, view.message);
  }

  // Every durable authority check held (inside the loaded K instance):
  // dispatch to the sealed adapter.
  deps.onDispatch?.(request.capabilityId, request.operationId);
  const raw = await request.invoke(request.payload, {
    capabilityId: request.capabilityId,
    operationId: request.operationId,
    effectPermit: { effectId: view.effectId, durableControlTurnId: view.durableControlTurnId, attempt: view.attempt },
  });

  // Post-dispatch failures (below) deliberately do NOT mark the attest: the
  // adapter HAS run, so a pre-handler-refusal mark here would forge a
  // zero-external-effect proof the #1108 K01 fence policy could act on.
  // These surface as honest effect failures with NO proof attached.
  const envelope = ((): ExternalEffectEnvelope => {
    try {
      return normalizeExternalEffectEnvelope(raw);
    } catch (error) {
      deps.onRefusal?.('V10_EXTERNAL_ENVELOPE_INVALID');
      throw error;
    }
  })();
  if (view.awaitPolicy === 'terminal' && envelope.phase !== 'terminal') {
    // Fail closed: the executor surfaces this as an honest effect failure —
    // a fake accepted/running ACK can never become terminal success.
    deps.onRefusal?.('V10_EXTERNAL_PENDING');
    throw new V10ExternalEffectError(
      'V10_EXTERNAL_PENDING',
      `[V10_EXTERNAL_PENDING] external effect ${view.effectId} is bound await:terminal but the adapter reported phase '${envelope.phase}' (externalRef ${envelope.externalRef}); pending is not success`,
    );
  }
  return envelope;
}
