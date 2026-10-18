# K02 implementation map — phase-1 independent modules on base 1e6d4be0 (kernel blob
# fa30e1204d47c12f3f5842c497a83a08501d515b). One concern: durable immutable original
# receipt + disposition liveness + changed-input conflict. Phase-1 writes NEW files only;
# the kernel file is K01's accepted single-writer path (#1167@6254163915) and is NOT touched.

## New file 1 — `packages/domain-harness-compiler/src/qualified-package/payload/durable-receipt-carrier-v1.mjs`
Dependency-free .mjs fragment (same payload discipline as the kernel file: zero imports,
Host ports injected, JSON-only documents). Exports:

- `deploymentScopeIdentity(scope)` — validate/freeze `[deployedAppId, tenantId, appId,
  businessPackageId]` (bounded non-empty identifier strings); typed `K02_SCOPE_INVALID`.
- `scopedDocKey(scope, kind, ...parts)` — injective key grammar
  `v010-k02:<app>:<tenant>:<appId>:<pkg>:<kind>:<parts...>` covering every doc family the
  K stack addresses (instance, admission-fence, effect-journal, turn-disposition,
  decision-receipt, receipt-archive).
- `createScopedDocumentStore(scope, baseDocs)` — pure composition adapter over ANY CAS
  docs port (get/put/remove/list): prefixes keys on the way in, strips on the way out;
  `list(prefix)` scans the scoped prefix only. This is the deployable namespace TODAY:
  the REAL unmodified kernel runs over it (K02-N1 proves physically).
- `canonicalJsonStringify(value)` (local copy of the kernel discipline) +
  `canonicalInputDigest(sha256Port, input)` — `sha256:<hex>` over canonical JSON; typed
  `K02_INPUT_NOT_JSON` for non-JSON-representable input.
- `durableTurnReceiptIdentity({scope, target, turn, intentType, inputDigest})` —
  canonical JSON identity WITHOUT module bytes (stable across releases);
  `buildIdentity: { moduleSha256 }` rides the envelope as a separate observable field.
- `ReceiptCarryingEngine` — the same-CAS original-receipt carrier over a docs port:
  - `openInstance({target, correlationId, packageId})` — revision-0 create with empty
    `durableOriginalReceipts` map (`mustBeAbsent`).
  - `admitTurn({target, messageId, intentType, input, decide, dispatch, turnSource?})` —
    the SINGLE-SNAPSHOT occurrence lane: (1) ONE read of the instance document;
    (2) ring adjudication FROM THAT SNAPSHOT (exact-original replay / typed
    changed-input or changed-intent conflict), then archive adjudication for
    ring-evicted turns; (3) pure `decide(current.state, input)` — a denial
    moves nothing and records nothing; (4) compose the ENTIRE next document
    (state fields + append-only `durableOriginalReceipts[turnId]` immutable
    original receipt built against the composed next projection) and commit as
    ONE `put(..., { mustMatchRevision: snapshotRevision })` — a competing
    writer inside the lane makes this CAS lose honestly (raw HOST conflict;
    retry replays the winner's original), never a double admission;
    (5) post-commit best-effort archive copy + winner-only effect dispatch
    (idempotency-keyed, through the same scoped store).
  - ring bound default 64 (≥ 4× the frozen 16-entry history; covers the 17+
    acceptance with margin); eviction from the ring is ARCHIVE-GATED: the
    oldest entry leaves only once its independent durable archive record
    exists (written/retried at eviction time); an archive-write fault keeps
    the entry and the document temporarily grows past the bound (admission
    never blocks, the entry is never dropped while unverified).
  - `readOriginalReceipt({target, messageId, input, intentType, turnSource?})` —
    standalone query lane: ring → archive → typed-refusal ladder; legacy/unknown
    envelope shapes fail closed (`K02_TURN_RECEIPT_LEGACY_UNREADABLE`), no
    pre-1.0 migration; an unreadable archive read fails closed typed for that
    turn.

## New file 2 — `packages/domain-harness-compiler/tests/v08-k02-durable-receipt-carrier.test.ts`
Unit semantics (K02-U1): digest equivalence under key order/whitespace; injectivity under
value/type change; identity stability; build-identity separation; scope validation; key
grammar injectivity across scopes/kinds.

## New file 3 — `packages/domain-harness/tests/v08-host/k02-receipt-cas-physical.test.ts`
Physical SQLite over the REAL `openSqliteCasStore` (K02-P1/P2/P3): same-CAS atomicity
(revision == stateRevision), exact-original replay after later transitions, changed-input/
intent typed conflicts, legacy fail-closed, 17+ turns after destroying every archive
record, close/reopen restart durability, injected store fault fail-closed, archive-fault
ACK survival.

## New file 4 — `packages/domain-harness/tests/v08-host/k02-namespace-two-b-physical.test.ts`
REAL selected kernel (exact payload bytes via data-URL import, kernel blob re-verified in
test) over the scoped adapter, two scopes, colliding workflowId+instanceKey, ONE SQLite
file (K02-N1). Unmodified kernel — proves the namespace needs no kernel edit to deploy.

## New file 5 — `packages/domain-harness/tests/v08-host/k02-receipt-race-multiprocess.test.ts`
+ `children/k02-receipt-worker.mjs` (new dir sibling of K01's children/; disjoint file).
Two REAL stock-node children (built package self-reference `@kaicreator/domain-harness/v8/host`
for the store; fragment imported as plain .mjs) sharing ONE SQLite file (K02-R1):
single-winner original ACK, loser idempotent replay, changed-input race typed conflict,
20-turn sequence across two real child processes.

## Kernel splice anchors — READ-ONLY until K01 releases (PARTIAL_BLOCKED_PENDING_K01_RELEASE)
After explicit K01 release/merge, rebase onto K01's integrated `v0.10` SHA and splice:
1. `turnDispositionIdentity` (~L2926): include canonical input digest + deployment scope
   tuple; move module SHA to envelope `buildIdentity` (identity stable across releases).
2. `commitAcceptedTransitionInLane` (~L2726-2789): extend the committed document value with
   the append-only `durableOriginalReceipts` map (receipt composed against the next
   projection BEFORE the put — the K01 fence precondition `#requireHeldAdmissionFence`
   stays first).
3. `submitOccurrence` (~L5020-5318): consult `readOriginalReceipt` before the
   history/disposition ladder; build the original receipt pre-put; keep the existing
   post-commit observational records as archives only.
4. Eviction gate (~L5047-5063): the same-CAS receipt replaces the missing-disposition
   fail-closed block for history backstop purposes (ring truth is atomic with state);
   MAX history stays as the kernel's crash backstop bound, ring 64 in-doc.
5. Key builders (`instanceDocKey` ~L2518, `admissionFenceDocKey` ~L2541, journal/effect/
   disposition/receipt key sites): route through the scoped grammar (default scope from
   the runtime's deployment identity wiring).
Then run the TRUE combined physical test (kernel-integrated carrier) — never claimed PASS
before that point.

## Ordering discipline
1. This pack + claim (done first). 2. Carrier fragment + unit tests. 3. Physical suites
(red→green against the carrier). 4. task-check. 5. Independent exact-HEAD review. 6. PR →
`v0.10`. 7. Splice phase after K01 release (separate coordination, same issue).
