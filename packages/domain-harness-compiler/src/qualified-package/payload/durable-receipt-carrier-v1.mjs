// ===========================================================================
// [v0.10 K02 #1168] Durable original-receipt carrier — isolated payload fragment.
// ===========================================================================
//
// Root causes repaired (preflight #1168@6254093346, verified at base 1e6d4be0,
// kernel blob fa30e1204d47c12f3f5842c497a83a08501d515b):
//
//   1. turnDispositionIdentity binds no canonical input digest and no deployment
//      scope: the same messageId under a changed input replayed the first turn's
//      receipt as idempotent (a lie), and identity was not injective across
//      deployments. Pinned build bytes sat INSIDE the identity, conflating
//      stable target identity with build identity.
//   2. The original acknowledged receipt was built AFTER the authoritative state
//      CAS and stored as a separate best-effort record; the replay path
//      re-derived a pseudo-receipt from the newest snapshot, which cannot
//      truthfully recover the original after later transitions.
//   3. A lost derived disposition record blocked ALL new turns forever
//      (bounded 16-entry history + fail-closed eviction gate).
//   4. Physical doc keys carried only workflowId/instanceKey: two deployed B
//      with colliding workflowId+instanceKey cross-read on one store.
//
// This fragment is dependency-free by payload discipline (zero imports; Host
// ports injected; JSON-only documents) so it can be spliced into the selected
// kernel payload verbatim once the K01 single-writer file
// (kernel-mechanism-v1.mjs, claimed at #1167@6254163915) is released. Until
// then it is deployed by COMPOSITION: createScopedDocumentStore works over any
// Host docs port (including the unmodified selected kernel's), and
// ReceiptCarryingEngine carries the same-CAS receipt discipline on its own
// scoped instance lane.
// ===========================================================================

export const K02_CARRIER_VERSION = 1;
export const K02_CARRIER_ID = 'durable-receipt-carrier-v1';

// Bounded identifier grammar for scope components: non-empty, no control
// characters, no key-grammar separator, bounded length. Scope components are
// separator-free so the physical key prefix stays positionally unambiguous.
const IDENTIFIER_MAX_LENGTH = 256;
const KEY_SEPARATOR = ':';

class CarrierAdmissionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CarrierAdmissionError';
    this.code = code;
  }
}

function isJsonRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Percent-encode ONE key component so the positional `:`-joined grammar stays
 * injective even when identifiers legitimately carry the separator (package
 * ids like `pkg:quote@1.0.0`). Escaping is minimal and deterministic: `%`
 * first, then `:`.
 */
function encodeKeyComponent(value) {
  return value.replace(/%/g, '%25').replace(/:/g, '%3A');
}

function requireIdentifier(value, field) {
  if (typeof value !== 'string' || value.length === 0 || value.length > IDENTIFIER_MAX_LENGTH) {
    throw new CarrierAdmissionError(
      'K02_SCOPE_INVALID',
      `${field} must be a bounded non-empty string identifier`,
    );
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(value)) {
    throw new CarrierAdmissionError(
      'K02_SCOPE_INVALID',
      `${field} must not contain control characters`,
    );
  }
  return value;
}

// Doc-key PARTS (workflowId, instanceKey, turnId, ...) follow the same
// control-character discipline; the separator is allowed and percent-encoded
// at composition, keeping the full key injective.
function requireKeyPart(value, field) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024) {
    throw new CarrierAdmissionError('K02_SCOPE_INVALID', `${field} must be a bounded non-empty string`);
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(value)) {
    throw new CarrierAdmissionError('K02_SCOPE_INVALID', `${field} must not contain control characters`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Canonical JSON (the kernel's own discipline, restated locally so this
// fragment stays spliceable as-is): sorted object keys, no whitespace, UTF-8
// JSON only. Two inputs that are the same JSON value up to key order or
// whitespace canonicalize to the SAME string.
// ---------------------------------------------------------------------------
export function canonicalJsonStringify(value) {
  if (value === undefined) {
    throw new CarrierAdmissionError('K02_INPUT_NOT_JSON', 'undefined is not a JSON value');
  }
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value) {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (isJsonRecord(value)) {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      const member = value[key];
      if (member === undefined) {
        throw new CarrierAdmissionError(
          'K02_INPUT_NOT_JSON',
          `object member ${JSON.stringify(key)} is undefined; the carrier persists JSON documents only`,
        );
      }
      sorted[key] = sortJsonValue(member);
    }
    return sorted;
  }
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  throw new CarrierAdmissionError(
    'K02_INPUT_NOT_JSON',
    `a value of type ${typeof value} is not JSON-representable; the carrier persists JSON documents only`,
  );
}

/**
 * Canonical input digest of ONE occurrence input: sha256 over the canonical
 * JSON form. Canonically equivalent inputs (same JSON value, any key order or
 * whitespace) digest identically; any semantic difference changes the digest.
 */
export function canonicalInputDigest(sha256Port, input) {
  if (typeof sha256Port?.digestUtf8 !== 'function') {
    throw new CarrierAdmissionError('K02_CARRIER_PORT_INVALID', 'a Host sha256 port { digestUtf8 } is required');
  }
  return `sha256:${sha256Port.digestUtf8(canonicalJsonStringify(input))}`;
}

// ---------------------------------------------------------------------------
// Deployment scope — the injective physical namespace tuple. Every durable
// doc key the K stack addresses is prefixed by the FULL tuple, so two
// deployments (two B) with identical workflowId+instanceKey occupy disjoint
// physical keys on one store.
// ---------------------------------------------------------------------------
const SCOPE_FIELDS = ['deployedAppId', 'tenantId', 'appId', 'businessPackageId'];

export function deploymentScopeIdentity(scope) {
  if (!isJsonRecord(scope)) {
    throw new CarrierAdmissionError('K02_SCOPE_INVALID', 'a deployment scope must be a record {deployedAppId, tenantId, appId, businessPackageId}');
  }
  for (const key of Object.keys(scope)) {
    if (!SCOPE_FIELDS.includes(key)) {
      throw new CarrierAdmissionError(
        'K02_SCOPE_INVALID',
        `a deployment scope carries the unsupported field ${JSON.stringify(key)}`,
      );
    }
  }
  for (const field of SCOPE_FIELDS) {
    requireIdentifier(scope[field], `scope.${field}`);
  }
  return Object.freeze({
    deployedAppId: scope.deployedAppId,
    tenantId: scope.tenantId,
    appId: scope.appId,
    businessPackageId: scope.businessPackageId,
  });
}

function scopePrefix(scope) {
  return [
    'v010-k02',
    encodeKeyComponent(scope.deployedAppId),
    encodeKeyComponent(scope.tenantId),
    encodeKeyComponent(scope.appId),
    encodeKeyComponent(scope.businessPackageId),
  ].join(KEY_SEPARATOR);
}

// Every doc family the K stack addresses. The grammar prefix is positional
// and separator-free, so distinct scopes/kinds never collide; parts after the
// kind are fixed-arity per family.
export const SCOPED_DOC_KINDS = Object.freeze([
  'wf-instance',
  'admission-fence',
  'effect-journal',
  'turn-disposition',
  'decision-receipt',
  'receipt-archive',
]);

export function scopedDocKey(scope, kind, ...parts) {
  const frozen = deploymentScopeIdentity(scope);
  if (!SCOPED_DOC_KINDS.includes(kind)) {
    throw new CarrierAdmissionError(
      'K02_SCOPE_INVALID',
      `unknown scoped doc kind ${JSON.stringify(kind)}; the grammar is closed`,
    );
  }
  for (const part of parts) requireKeyPart(part, 'doc key part');
  return [scopePrefix(frozen), encodeKeyComponent(kind), ...parts.map(encodeKeyComponent)].join(KEY_SEPARATOR);
}

/**
 * The physical namespace prefix of ONE deployment scope (encoded, injective).
 * Consumers that need to address or enumerate a deployment's raw physical
 * keys (evidence, adapters) compose from this.
 */
export function scopedNamespacePrefix(scope) {
  return scopePrefix(deploymentScopeIdentity(scope));
}

/**
 * Namespaced view over ANY Host docs port (get/put/remove/list with true-CAS
 * conditions). Pure composition — the base store keeps its physical CAS
 * discipline untouched; this adapter only routes keys through the scoped
 * grammar. `list(prefix)` scans the scoped namespace only, so one deployment
 * can never enumerate another's keys.
 */
export function createScopedDocumentStore(scope, baseDocs) {
  const frozen = deploymentScopeIdentity(scope);
  if (typeof baseDocs?.get !== 'function' || typeof baseDocs?.put !== 'function') {
    throw new CarrierAdmissionError('K02_CARRIER_PORT_INVALID', 'a Host document-store port { get, put, remove?, list? } is required');
  }
  const prefix = `${scopePrefix(frozen)}${KEY_SEPARATOR}`;
  const toBase = (key) => `${prefix}${key}`;
  const fromBase = (key) => (key.startsWith(prefix) ? key.slice(prefix.length) : null);
  return {
    scope: frozen,
    async get(key) {
      return baseDocs.get(toBase(key));
    },
    async put(key, value, conditions) {
      return baseDocs.put(toBase(key), value, conditions);
    },
    ...(typeof baseDocs.remove === 'function'
      ? {
          async remove(key, conditions) {
            return baseDocs.remove(toBase(key), conditions);
          },
        }
      : {}),
    ...(typeof baseDocs.list === 'function'
      ? {
          async list(prefixFilter) {
            const keys = await baseDocs.list(prefix);
            const local = keys.map(fromBase).filter((key) => key !== null);
            return typeof prefixFilter === 'string' && prefixFilter.length > 0
              ? local.filter((key) => key.startsWith(prefixFilter))
              : local;
          },
        }
      : {}),
    ...(typeof baseDocs.failNextPutMatching === 'function'
      ? { failNextPutMatching(keySubstring, options) { baseDocs.failNextPutMatching(keySubstring, options); } }
      : {}),
    ...(typeof baseDocs.failNextGetMatching === 'function'
      ? { failNextGetMatching(keySubstring, options) { baseDocs.failNextGetMatching(keySubstring, options); } }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Turn receipt identity. Injective over the deployment scope, the workflow
// target, the deterministic turn, the intentType and the CANONICAL INPUT
// DIGEST. Pinned build identity is deliberately OUTSIDE the identity (it
// rides the envelope as buildIdentity) so the target identity is stable
// across releases while the build switch stays observable.
// ---------------------------------------------------------------------------
export function durableTurnReceiptIdentity({ scope, target, turn, intentType, inputDigest }) {
  const frozen = deploymentScopeIdentity(scope);
  if (!isJsonRecord(target) || typeof target.workflowId !== 'string' || typeof target.instanceKey !== 'string') {
    throw new CarrierAdmissionError('K02_SCOPE_INVALID', 'a workflow target { workflowId, instanceKey } is required');
  }
  if (!isJsonRecord(turn) || typeof turn.kind !== 'string') {
    throw new CarrierAdmissionError('K02_SCOPE_INVALID', 'a turn source record with a kind is required');
  }
  if (typeof intentType !== 'string' || intentType.length === 0) {
    throw new CarrierAdmissionError('K02_SCOPE_INVALID', 'intentType must be a non-empty string');
  }
  if (typeof inputDigest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(inputDigest)) {
    throw new CarrierAdmissionError('K02_SCOPE_INVALID', 'inputDigest must be a canonical sha256:<hex> digest');
  }
  return canonicalJsonStringify({
    scope: {
      deployedAppId: frozen.deployedAppId,
      tenantId: frozen.tenantId,
      appId: frozen.appId,
      businessPackageId: frozen.businessPackageId,
    },
    target: { workflowId: target.workflowId, instanceKey: target.instanceKey },
    turn,
    intentType,
    inputDigest,
  });
}

/**
 * Deterministic turn id of an occurrence (the kernel's derive discipline,
 * restated locally): message turns derive from the messageId; the trusted
 * Host seam supplies non-message turn sources.
 */
export function deriveCarrierTurnId(target, source) {
  if (!isJsonRecord(target) || typeof target.workflowId !== 'string' || typeof target.instanceKey !== 'string') {
    throw new CarrierAdmissionError('K02_SCOPE_INVALID', 'a workflow target { workflowId, instanceKey } is required');
  }
  // Components are percent-encoded so the positional turn-id grammar stays
  // injective when identifiers carry the separator.
  const base = `turn:${encodeKeyComponent(target.workflowId)}:${encodeKeyComponent(target.instanceKey)}`;
  if (!isJsonRecord(source) || typeof source.kind !== 'string') {
    throw new CarrierAdmissionError('K02_SCOPE_INVALID', 'a turn source record with a kind is required');
  }
  switch (source.kind) {
    case 'message':
      if (typeof source.sourceMessageId !== 'string' || source.sourceMessageId.length === 0) {
        throw new CarrierAdmissionError('K02_SCOPE_INVALID', 'a message turn requires a non-empty sourceMessageId');
      }
      return `${base}:message:${encodeKeyComponent(source.sourceMessageId)}`;
    case 'timer':
      return `${base}:timer:${encodeKeyComponent(requireIdentifier(source.timerId, 'timerId'))}:${String(requireOrdinal(source.fireOrdinal, 'fireOrdinal'))}`;
    case 'callback':
      return `${base}:callback:${encodeKeyComponent(requireIdentifier(source.externalCorrelationId, 'externalCorrelationId'))}:${String(requireOrdinal(source.callbackOrdinal, 'callbackOrdinal'))}`;
    default:
      throw new CarrierAdmissionError('K02_SCOPE_INVALID', `unsupported turn source kind ${JSON.stringify(source.kind)} in the phase-1 carrier`);
  }
}

function requireOrdinal(value, field) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new CarrierAdmissionError('K02_SCOPE_INVALID', `${field} must be a positive safe integer`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// The same-CAS original-receipt carrier.
//
// The instance document is ONE physical CAS row. Every admitted turn appends
// its IMMUTABLE ORIGINAL RECEIPT into `durableOriginalReceipts` INSIDE the
// very document value that commits the next state — one put with
// mustMatchRevision makes the state transition, the revision and the original
// receipt durable together or not at all. There is no window where the state
// is committed and the original receipt is not.
//
// `durableOriginalReceipts` is an insertion-ordered bounded ring (default 64
// — 4x the frozen 16-entry kernel backstop, covering the 17+ acceptance with
// margin). Eviction is ARCHIVE-GATED WITH FAULT-TOLERANT GROWTH: the oldest
// entry leaves the ring only once its independent durable archive record
// exists (written/retried at eviction time). If that archive write faults,
// the entry STAYS in the ring and the document temporarily grows past the
// bound — admission of new turns is NEVER blocked, and an admitted turn is
// NEVER silently forgotten (no re-admission, no double effect). The next
// admission retries the pending archive, so growth is bounded by the fault
// duration; a store that keeps faulting fails admissions typed anyway.
// ---------------------------------------------------------------------------
const DEFAULT_RECEIPT_RING_BOUND = 64;

function carrierInstanceKey(scope, target) {
  return scopedDocKey(scope, 'wf-instance', target.workflowId, target.instanceKey);
}

function carrierArchiveKey(scope, turnId) {
  return scopedDocKey(scope, 'receipt-archive', turnId);
}

function isHostWriteConflict(error) {
  return typeof error === 'object' && error !== null
    && (error.code === 'HOST_CAS_CONFLICT' || error.code === 'HOST_KEY_EXISTS');
}

/**
 * Validate ONE stored receipt-envelope shape. A legacy/unknown shape (no
 * carrierVersion, no identity-bearing envelope) fails CLOSED — the carrier
 * performs no pre-1.0 migration and never reinterprets an unreadable record
 * as a replay or a conflict.
 */
function requireReadableEnvelope(envelope, turnId, what) {
  if (!isJsonRecord(envelope)
    || envelope.carrierVersion !== K02_CARRIER_VERSION
    || typeof envelope.identity !== 'string'
    || !isJsonRecord(envelope.receipt)) {
    throw new CarrierAdmissionError(
      'K02_TURN_RECEIPT_LEGACY_UNREADABLE',
      `${what} ${turnId} carries no readable v${String(K02_CARRIER_VERSION)} original-receipt envelope; fail closed, no pre-1.0 migration`,
    );
  }
  return envelope;
}

export class ReceiptCarryingEngine {
  #docs;
  #now;
  #sha256;
  #scope;
  #ringBound;
  counters;

  constructor(docs, options = {}) {
    if (!isJsonRecord(options) || !isJsonRecord(options.scope)) {
      throw new CarrierAdmissionError('K02_SCOPE_INVALID', 'the carrier engine requires { scope, sha256, now? }');
    }
    if (typeof options.sha256?.digestUtf8 !== 'function') {
      throw new CarrierAdmissionError('K02_CARRIER_PORT_INVALID', 'the carrier engine requires a Host sha256 port { digestUtf8 }');
    }
    this.#docs = docs;
    this.#scope = deploymentScopeIdentity(options.scope);
    this.#sha256 = options.sha256;
    this.#now = options.now ?? (() => new Date().toISOString());
    const bound = options.receiptRingBound ?? DEFAULT_RECEIPT_RING_BOUND;
    if (!Number.isSafeInteger(bound) || bound < 17) {
      throw new CarrierAdmissionError(
        'K02_SCOPE_INVALID',
        'receiptRingBound must be a safe integer >= 17 (the acceptance floor)',
      );
    }
    this.#ringBound = bound;
    this.counters = {
      instanceCreates: 0,
      turnsAdmitted: 0,
      turnsDenied: 0,
      originalReceiptReplays: 0,
      archiveWrites: 0,
      archiveWriteFailures: 0,
      ringGrowthEvents: 0,
      effectDispatches: 0,
    };
  }

  get scope() {
    return this.#scope;
  }

  async openInstance({ target, correlationId, packageId, initialState }) {
    if (!isJsonRecord(target) || typeof target.workflowId !== 'string' || typeof target.instanceKey !== 'string') {
      throw new CarrierAdmissionError('K02_SCOPE_INVALID', 'openInstance requires a target { workflowId, instanceKey }');
    }
    const timestamp = this.#now();
    const document = {
      scope: { ...this.#scope },
      address: { ...target },
      correlationId: typeof correlationId === 'string' ? correlationId : null,
      packageId: typeof packageId === 'string' ? packageId : null,
      stateRevision: 0,
      state: initialState ?? { stateKey: 'initial', context: {} },
      createdAt: timestamp,
      updatedAt: timestamp,
      durableOriginalReceipts: {},
    };
    this.counters.instanceCreates += 1;
    await this.#docs.put(carrierInstanceKey(this.#scope, target), document, { mustBeAbsent: true });
    return this.#readDocument(target);
  }

  async #readDocument(target) {
    const envelope = await this.#docs.get(carrierInstanceKey(this.#scope, target));
    if (envelope === null) return null;
    if (!isJsonRecord(envelope.value)) {
      throw new CarrierAdmissionError(
        'K02_TURN_RECEIPT_LEGACY_UNREADABLE',
        `the instance document of ${target.workflowId}/${target.instanceKey} carries no readable v${String(K02_CARRIER_VERSION)} shape; fail closed`,
      );
    }
    return envelope;
  }

  async getSnapshot(target) {
    const document = await this.#readDocument(target);
    if (document === null) return null;
    const { durableOriginalReceipts: _receipts, ...outward } = document.value;
    return snapshotJson(outward);
  }

  async readDurableOriginalReceipts(target) {
    const document = await this.#readDocument(target);
    if (document === null) return null;
    return isJsonRecord(document.value.durableOriginalReceipts)
      ? document.value.durableOriginalReceipts
      : {};
  }

  /**
   * Replay/conflict adjudication of ONE occurrence against the durable
   * original-receipt truth: ring (same-CAS, authoritative) → archive
   * (independent durable depth extension) → undefined (not admitted; the
   * caller may admit). A stored entry under the same turnId with a DIFFERENT
   * identity (changed canonical input, changed intentType) refuses typed
   * BEFORE any admission activity. An unreadable archive read fails closed
   * typed for THIS turn (a store fault is not a policy wedge — the store
   * itself is faulting).
   */
  async readOriginalReceipt({ target, messageId, input, intentType, turnSource }) {
    const turn = turnSource === undefined ? { kind: 'message', sourceMessageId: messageId } : turnSource;
    const turnId = deriveCarrierTurnId(target, turn);
    const inputDigest = canonicalInputDigest(this.#sha256, input);
    const identity = durableTurnReceiptIdentity({ scope: this.#scope, target, turn, intentType, inputDigest });
    const document = await this.#readDocument(target);
    if (document !== null && isJsonRecord(document.value.durableOriginalReceipts)) {
      const stored = document.value.durableOriginalReceipts[turnId];
      if (stored !== undefined) {
        requireReadableEnvelope(stored, turnId, 'the same-CAS original receipt of turn');
        return this.#adjudicate(stored, identity, turnId, intentType);
      }
    }
    let archive;
    try {
      archive = await this.#docs.get(carrierArchiveKey(this.#scope, turnId));
    } catch (error) {
      throw new CarrierAdmissionError(
        'K02_TURN_RECEIPT_STORE_FAULT',
        `the archived original receipt of turn ${turnId} is unreadable; fail closed for this turn (${String(error instanceof Error ? error.message : error)})`,
      );
    }
    if (archive !== null) {
      const stored = requireReadableEnvelope(archive.value, turnId, 'the archived original receipt of turn');
      return this.#adjudicate(stored, identity, turnId, intentType);
    }
    return undefined;
  }

  #adjudicate(stored, identity, turnId, intentType) {
    if (stored.identity !== identity) {
      // Same turnId, different truth: changed canonical input or changed
      // intentType. Distinguished honestly from the stored envelope's own
      // recorded intentType.
      const changedIntent = typeof stored.intentType === 'string' && stored.intentType !== intentType;
      throw new CarrierAdmissionError(
        changedIntent ? 'K02_TURN_RECEIPT_INTENT_CONFLICT' : 'K02_TURN_RECEIPT_INPUT_CONFLICT',
        `turn ${turnId} is already durably admitted with a different ${changedIntent ? 'intentType' : 'canonical input'}; one source is exactly one turn — the original receipt stands`,
      );
    }
    this.counters.originalReceiptReplays += 1;
    return {
      status: 'admitted',
      idempotentReplay: true,
      originalReceipt: snapshotJson(stored.receipt),
      turnId,
    };
  }

  /**
   * The occurrence lane. Order is the K02 contract:
   *   1. replay/conflict short-circuit (zero activity on replay),
   *   2. read current document, pure `decide` (a denial moves nothing and
   *      records nothing — denials are not dispositions),
   *   3. compose the ENTIRE next document INCLUDING the immutable original
   *      receipt of this turn (built against the composed next projection),
   *      with archive-gated ring maintenance,
   *   4. ONE physical CAS put (mustMatchRevision at the observed revision),
   *   5. post-commit best-effort archive copy of THIS turn + winner-only
   *      effect dispatch.
   */
  async admitTurn({ target, messageId, intentType, input, decide, dispatch, turnSource }) {
    const replay = await this.readOriginalReceipt({ target, messageId, input, intentType, turnSource });
    if (replay !== undefined) return replay;

    const current = await this.#readDocument(target);
    if (current === null) {
      throw new CarrierAdmissionError(
        'K02_SCOPE_INVALID',
        `instance ${target.workflowId}/${target.instanceKey} does not exist in this deployment scope`,
      );
    }
    const decision = await decide(snapshotJson(current.value.state), input);
    if (!isJsonRecord(decision)) {
      throw new CarrierAdmissionError('K02_SCOPE_INVALID', 'decide must return a record');
    }
    if (decision.status === 'denied') {
      this.counters.turnsDenied += 1;
      return { status: 'denied', denial: decision.denial ?? { reason: 'denied' }, occurrence: { messageId } };
    }
    const turn = turnSource === undefined ? { kind: 'message', sourceMessageId: messageId } : turnSource;
    const turnId = deriveCarrierTurnId(target, turn);
    const inputDigest = canonicalInputDigest(this.#sha256, input);
    const identity = durableTurnReceiptIdentity({ scope: this.#scope, target, turn, intentType, inputDigest });
    const attributedAt = this.#now();

    const nextState = decision.nextState ?? current.value.state;
    const nextDocumentBase = {
      ...current.value,
      stateRevision: current.value.stateRevision + 1,
      state: nextState,
      ...(decision.output === undefined ? {} : { output: decision.output }),
      lastMessageId: messageId,
      updatedAt: attributedAt,
    };
    // The original receipt is composed against the POST-turn projection and
    // rides the SAME single document value as that projection — the ACK bytes
    // acknowledge exactly what this CAS commits.
    const originalReceipt = {
      status: 'admitted',
      turnId,
      intentType,
      inputDigest,
      admitted: snapshotJson(decision.admitted ?? { targetState: nextState?.stateKey ?? null }),
      instance: outwardCarrierSnapshot(nextDocumentBase),
      occurrence: { messageId },
      attributedAt,
      ...(decision.buildIdentity === undefined ? {} : { buildIdentity: snapshotJson(decision.buildIdentity) }),
    };
    const envelope = {
      carrierVersion: K02_CARRIER_VERSION,
      identity,
      intentType,
      turn: snapshotJson(turn),
      receipt: originalReceipt,
    };
    const receipts = await this.#boundedReceipts(current.value, envelope);
    const nextDocument = { ...nextDocumentBase, durableOriginalReceipts: receipts };

    let committedRevision;
    try {
      const written = await this.#docs.put(
        carrierInstanceKey(this.#scope, target),
        nextDocument,
        { mustMatchRevision: current.revision },
      );
      committedRevision = written.revision;
    } catch (error) {
      if (error instanceof CarrierAdmissionError || isHostWriteConflict(error)) {
        // A CAS race loss (or an earlier typed refusal) propagates honestly:
        // the competing winner's commit stands, this attempt moved nothing,
        // and a re-submission replays the winner's original receipt.
        throw error;
      }
      throw new CarrierAdmissionError(
        'K02_TURN_RECEIPT_STORE_FAULT',
        `the receipt-bearing state CAS of instance ${target.workflowId}/${target.instanceKey} failed (${String(error && typeof error === 'object' ? error.code : error instanceof Error ? error.message : String(error))}); zero durable partial state — the state move and the original receipt committed together or not at all`,
      );
    }
    this.counters.turnsAdmitted += 1;

    // Post-commit observational archive of THIS turn: best-effort, extends
    // replay depth immediately, never falsifies the original, never fails
    // the ACK.
    let archive;
    try {
      await this.#docs.put(carrierArchiveKey(this.#scope, turnId), envelope, { mustBeAbsent: true });
      this.counters.archiveWrites += 1;
      archive = { status: 'recorded' };
    } catch {
      this.counters.archiveWriteFailures += 1;
      archive = { status: 'not_recorded' };
    }

    let effects;
    if (typeof dispatch === 'function' && Array.isArray(decision.effects) && decision.effects.length > 0) {
      effects = [];
      for (const effect of decision.effects) {
        effects.push(await dispatch({ effect, turnId, messageId }));
      }
      this.counters.effectDispatches += effects.length;
    }

    return {
      status: 'admitted',
      idempotentReplay: false,
      originalReceipt,
      instance: outwardCarrierSnapshot(nextDocument),
      stateRevision: nextDocument.stateRevision,
      committedRevision,
      turnId,
      archive,
      ...(effects === undefined ? {} : { effects }),
      occurrence: { messageId },
    };
  }

  /**
   * Ring maintenance. The new envelope is appended (insertion order keeps
   * older entries first). While the ring exceeds the bound, the OLDEST entry
   * may leave only once its independent durable archive exists; the eviction
   * moment retries the archive write (mustBeAbsent; a KEY_EXISTS with the
   * same identity counts as archived, a different identity is an honest
   * typed anomaly). On archive-write fault the entry STAYS (fault-tolerant
   * growth; admission proceeds — never blocked, never forgotten).
   */
  async #boundedReceipts(currentValue, envelope) {
    const receipts = { ...(isJsonRecord(currentValue.durableOriginalReceipts) ? currentValue.durableOriginalReceipts : {}) };
    receipts[envelope.receipt.turnId] = envelope;
    let keys = Object.keys(receipts);
    while (keys.length > this.#ringBound) {
      const oldestKey = keys[0];
      const oldest = receipts[oldestKey];
      const archived = await this.#ensureArchived(oldestKey, oldest);
      if (!archived) {
        this.counters.ringGrowthEvents += 1;
        break;
      }
      delete receipts[oldestKey];
      keys = Object.keys(receipts);
    }
    return receipts;
  }

  async #ensureArchived(turnId, envelope) {
    try {
      await this.#docs.put(carrierArchiveKey(this.#scope, turnId), envelope, { mustBeAbsent: true });
      this.counters.archiveWrites += 1;
      return true;
    } catch (error) {
      if (typeof error === 'object' && error !== null && error.code === 'HOST_KEY_EXISTS') {
        const existing = await this.#docs.get(carrierArchiveKey(this.#scope, turnId));
        if (existing !== null && isJsonRecord(existing.value) && existing.value.identity === envelope.identity) {
          return true; // already durably archived by an earlier best-effort write
        }
        throw new CarrierAdmissionError(
          'K02_TURN_RECEIPT_STORE_FAULT',
          `the receipt archive of turn ${turnId} holds a different identity; honest anomaly — fail closed`,
        );
      }
      this.counters.archiveWriteFailures += 1;
      return false; // fault-tolerant growth: keep the ring entry, retry next admission
    }
  }
}

function outwardCarrierSnapshot(document) {
  const { durableOriginalReceipts: _receipts, ...outward } = document;
  return snapshotJson(outward);
}

function snapshotJson(value) {
  return JSON.parse(canonicalJsonStringify(value));
}
