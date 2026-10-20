/**
 * DomainHarness v0.10 C01 (#1177) — the selected K→C external Effect
 * Operation: ONE trusted gate contract shared by EVERY selected external
 * effect adapter.
 * ===========================================================================
 *
 * Authority shape (frozen DAG C01 / L2 P2-2):
 *
 *   - ONLY the kernel mints and consumes a live external Effect Permit
 *     document (`v08-kernel:effect-permit:<effectId>` through the K docs
 *     port). The kernel's per-call attest channel is the only way a
 *     dispatch can even CLAIM a permit; Business/Standard/UX code can
 *     neither mint, copy nor replay one into authority.
 *   - The trusted Host gate (this module, invoked by the v0.10 facade)
 *     re-reads the DURABLE truth before ANY adapter invocation: the permit
 *     document must be live, unexpired, scoped to this capability and
 *     operation and this very turn; the effect journal record must be
 *     `started`; and the admission fence must still be held by this turn.
 *     Any missing/expired/drifted authority ⇒ typed refusal with ZERO
 *     adapter dispatch, marked into the kernel-minted attest (the trusted
 *     pre-handler-refusal discipline of #1108 K01) so the dispatch probe
 *     can still prove zero external effect.
 *   - Adapters return ONE phase envelope (`accepted`/`running` are never
 *     terminal; only `terminal` carries an outcome). An `await: 'terminal'`
 *     binding fails closed on any non-terminal envelope — a fake accepted
 *     ACK can never become success.
 *
 * Ordinary private Node/npm clients remain implementation details inside an
 * adapter; they are never authority. This module embeds no runx/Tally
 * business semantics — two unrelated adapters share exactly this contract.
 */
import { isPlainRecord } from './guards.js';
import { V10ActivationError } from './activation.js';

/**
 * The K-issued address context of ONE external effect dispatch (review R1
 * P1-2): the kernel resolves these EXACT doc keys from its OWN doc-key
 * family — the legacy `v08-kernel:` family OR the K02 scoped
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
    throw new V10ActivationError('V10_EXTERNAL_ENVELOPE_INVALID', '[V10_EXTERNAL_ENVELOPE_INVALID] an external effect adapter must return a plain phase-envelope record');
  }
  if (raw.phase !== 'accepted' && raw.phase !== 'running' && raw.phase !== 'terminal') {
    throw new V10ActivationError(
      'V10_EXTERNAL_ENVELOPE_INVALID',
      `an external effect adapter returned the unknown phase ${JSON.stringify(String(raw.phase))}; the grammar is accepted|running|terminal`,
    );
  }
  if (typeof raw.externalRef !== 'string' || raw.externalRef.length === 0 || raw.externalRef.length > 256) {
    throw new V10ActivationError('V10_EXTERNAL_ENVELOPE_INVALID', '[V10_EXTERNAL_ENVELOPE_INVALID] an external effect envelope carries a bounded non-empty externalRef');
  }
  if (raw.phase !== 'terminal') {
    // Accepted/running are honest NON-terminal phases: an outcome riding a
    // non-terminal envelope is exactly the false-terminal-success shape this
    // contract forbids.
    if (raw.outcome !== undefined) {
      throw new V10ActivationError(
        'V10_EXTERNAL_ENVELOPE_INVALID',
        `[V10_EXTERNAL_ENVELOPE_INVALID] a ${String(raw.phase)} envelope must not carry an outcome; only terminal envelopes settle`,
      );
    }
    return { phase: raw.phase, externalRef: raw.externalRef };
  }
  const outcome = raw.outcome;
  if (!isPlainRecord(outcome) || typeof outcome.ok !== 'boolean') {
    throw new V10ActivationError('V10_EXTERNAL_ENVELOPE_INVALID', '[V10_EXTERNAL_ENVELOPE_INVALID] a terminal envelope carries an {ok, ...} outcome record');
  }
  if (outcome.ok === true) {
    return { phase: 'terminal', externalRef: raw.externalRef, outcome: { ok: true, output: outcome.output } };
  }
  const error = outcome.error;
  if (!isPlainRecord(error) || typeof error.code !== 'string' || typeof error.message !== 'string') {
    throw new V10ActivationError('V10_EXTERNAL_ENVELOPE_INVALID', '[V10_EXTERNAL_ENVELOPE_INVALID] a failed terminal outcome carries a typed {code, message} error');
  }
  return { phase: 'terminal', externalRef: raw.externalRef, outcome: { ok: false, error: { code: error.code, message: error.message } } };
}

/** The read-only K docs view the gate needs: scoped by the dispatching business. */
export interface ExternalEffectDocsPort {
  get(businessPackageId: string, key: string): Promise<{ value: unknown; revision: number } | null>;
}

export interface ExternalEffectGateDeps {
  readonly docs: ExternalEffectDocsPort;
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
  throw new V10ActivationError(code, `[${code}] ${message}`);
}

/**
 * The trusted dispatch gate of the selected K→C external Effect Operation.
 * Validates the LIVE K-issued authority chain (permit doc + journal record +
 * held admission fence) before invoking the adapter, then normalizes the
 * returned phase envelope and enforces the binding's await policy.
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
  const keys = { permit: '', journal: '', fence: '', dispatchClaim: '' };
  for (const name of ['permit', 'journal', 'fence', 'dispatchClaim'] as const) {
    const value = claim.keys[name];
    if (typeof value !== 'string' || value.length === 0) {
      refuseGate(attest, deps.onRefusal, 'V10_EFFECT_PERMIT_REQUIRED',
        `the K-issued permit claim for ${claim.effectId} carries no ${name} document address; the gate refuses an address-less dispatch`);
    }
    keys[name] = value;
  }

  // (2) The durable permit document is the authority (a claim alone proves
  // nothing): live, unexpired, this very turn/business, this capability+operation.
  const permitDoc = await deps.docs.get(claim.businessPackageId, keys.permit);
  if (permitDoc === null) {
    refuseGate(attest, deps.onRefusal, 'V10_EFFECT_PERMIT_UNKNOWN',
      `no K-issued effect permit ${claim.effectId} exists at its kernel-issued address (business ${claim.businessPackageId})`);
  }
  const permit = isPlainRecord(permitDoc.value) ? permitDoc.value : null;
  if (permit === null || permit.state !== 'live') {
    refuseGate(attest, deps.onRefusal, 'V10_EFFECT_PERMIT_CONSUMED',
      `K-issued effect permit ${claim.effectId} is not live (state ${JSON.stringify(String(permit?.state))}); a settled or foreign permit never dispatches again`);
  }
  if (permit.durableControlTurnId !== claim.durableControlTurnId) {
    refuseGate(attest, deps.onRefusal, 'V10_EFFECT_PERMIT_SCOPE',
      `K-issued effect permit ${claim.effectId} belongs to turn ${JSON.stringify(String(permit.durableControlTurnId))}, not ${claim.durableControlTurnId}`);
  }
  if (permit.businessPackageId !== claim.businessPackageId) {
    // The scoped B identity is part of the authority tuple: a foreign B can
    // never consume another B's live permit, even if it somehow named it.
    refuseGate(attest, deps.onRefusal, 'V10_EFFECT_PERMIT_SCOPE',
      `K-issued effect permit ${claim.effectId} belongs to business ${JSON.stringify(String(permit.businessPackageId))}, not the dispatching ${claim.businessPackageId}`);
  }
  if (permit.capabilityKey !== request.capabilityId) {
    refuseGate(attest, deps.onRefusal, 'V10_EFFECT_PERMIT_SCOPE',
      `K-issued effect permit ${claim.effectId} authorizes capability ${JSON.stringify(String(permit.capabilityKey))}, not ${request.capabilityId}`);
  }
  const operations = Array.isArray(permit.operations) ? permit.operations : [];
  if (!operations.includes(request.operationId)) {
    refuseGate(attest, deps.onRefusal, 'V10_EFFECT_PERMIT_SCOPE',
      `K-issued effect permit ${claim.effectId} does not authorize operation ${request.operationId}`);
  }
  const nowIso = deps.nowIso();
  if (typeof permit.expiresAt !== 'string' || nowIso > permit.expiresAt) {
    refuseGate(attest, deps.onRefusal, 'V10_EFFECT_PERMIT_EXPIRED',
      `K-issued effect permit ${claim.effectId} expired at ${JSON.stringify(String(permit.expiresAt))} (now ${nowIso}); expired live authority dispatches nothing`);
  }

  // (3) The journal cross-check: the effect this permit opens must be durably
  // `started` right now — completed/failed/missing records never dispatch.
  const journalDoc = await deps.docs.get(claim.businessPackageId, keys.journal);
  const journalRecord = journalDoc !== null && isPlainRecord(journalDoc.value) && isPlainRecord(journalDoc.value.record)
    ? journalDoc.value.record
    : null;
  if (journalRecord === null || journalRecord.effectId !== claim.effectId || journalRecord.status !== 'started') {
    refuseGate(attest, deps.onRefusal, 'V10_EFFECT_PERMIT_JOURNAL',
      `effect journal record for ${claim.effectId} is not an in-flight started record (status ${JSON.stringify(String(journalRecord?.status))}); a replayed or foreign effect never dispatches`);
  }

  // (4) The admission-fence cross-check: the turn must still hold the
  // instance's admission fence — the LIVE K admission authority itself.
  const target = isPlainRecord(permit.target) ? permit.target : null;
  if (target === null || typeof target.workflowId !== 'string' || typeof target.instanceKey !== 'string') {
    refuseGate(attest, deps.onRefusal, 'V10_EFFECT_PERMIT_SCOPE',
      `K-issued effect permit ${claim.effectId} carries no scoped target identity`);
  }
  const fenceDoc = await deps.docs.get(claim.businessPackageId, keys.fence);
  const fence = fenceDoc !== null && isPlainRecord(fenceDoc.value) ? fenceDoc.value : null;
  if (fence === null || fence.turnId !== claim.durableControlTurnId) {
    refuseGate(attest, deps.onRefusal, 'V10_EFFECT_PERMIT_FENCE',
      `the admission fence of ${target.workflowId}/${target.instanceKey} is not held by turn ${claim.durableControlTurnId}; no live admission authority, zero dispatch`);
  }

  // (5) The physical dispatch claim is the final durable link. A key
  // appearing in the attest is only an address, not proof that K wrote a
  // claim for THIS effect/turn/attempt before the adapter was reached.
  const attempt = typeof permit.attempt === 'number' ? permit.attempt : 1;
  const claimDoc = await deps.docs.get(claim.businessPackageId, keys.dispatchClaim);
  const dispatchClaim = claimDoc !== null && isPlainRecord(claimDoc.value) ? claimDoc.value : null;
  if (dispatchClaim === null
    || dispatchClaim.effectId !== claim.effectId
    || dispatchClaim.durableControlTurnId !== claim.durableControlTurnId
    || dispatchClaim.businessPackageId !== claim.businessPackageId
    || dispatchClaim.attempt !== attempt) {
    refuseGate(attest, deps.onRefusal, 'V10_EFFECT_DISPATCH_CLAIM_INVALID',
      `no matching K dispatch claim exists for effect ${claim.effectId} attempt ${attempt}; zero external dispatch`);
  }

  // Every durable authority check held: dispatch to the sealed adapter.
  deps.onDispatch?.(request.capabilityId, request.operationId);
  const raw = await request.invoke(request.payload, {
    capabilityId: request.capabilityId,
    operationId: request.operationId,
    effectPermit: { effectId: claim.effectId, durableControlTurnId: claim.durableControlTurnId, attempt },
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
  if (permit.awaitPolicy === 'terminal' && envelope.phase !== 'terminal') {
    // Fail closed: the executor surfaces this as an honest effect failure —
    // a fake accepted/running ACK can never become terminal success.
    deps.onRefusal?.('V10_EXTERNAL_PENDING');
    throw new V10ActivationError(
      'V10_EXTERNAL_PENDING',
      `[V10_EXTERNAL_PENDING] external effect ${claim.effectId} is bound await:terminal but the adapter reported phase '${envelope.phase}' (externalRef ${envelope.externalRef}); pending is not success`,
    );
  }
  return envelope;
}
