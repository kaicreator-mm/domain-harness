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

## Kernel splice anchors — EXECUTED (phase-2; rebased onto integrated v0.10)
K01 released its single-writer file at #1183 head 36f068e3fd6531c71138d67250fd56c2eb675c44
(dispatch attest mechanism + docs.remove seam included; merged into `v0.10` as
`027f3b74`). The splice was first executed on `integration/k02-splice-on-k01`
(merge of the K01 head into the phase-1 branch, conflict-free); the task branch
`task/v0.10-k02-durable-receipt` was then rebuilt LINEARLY on `v0.10@027f3b74`
(= t016 oracle #1186 `5a9683cf` + T00 #1184 `87de82d8` + K01 #1183): the six
phase-1 commits cherry-picked conflict-free, the splice re-applied as `24747e39`
(kernel bytes identical — blob unchanged across the rebase), plus tests-dir
typecheck repair `d0992d57` (`CasGetResult.value` is `unknown`; the combined
suite's four raw row reads now cast exactly like the phase-1 suites — caught
ONLY by the domain-harness test-chain tail `tsc -p tsconfig.test.json`, which
targeted gates bypass). Integrated kernel blob (git SHA-1, final after lint fix):
**d7909b8ff8071e1f15d8b55fe6f967d883f6b4ac**
(the file is byte-frozen from here).

1. `turnDispositionIdentity` (~L3433 post-merge): identity is now canonical JSON of
   `{deploymentScope?, target, turn, intentType, inputDigest}` — the canonical input
   digest (`sha256(canonicalJson(input))`, absent input normalized to null exactly like
   the Host gateway) and the deployment scope tuple joined; the pinned module SHA left
   the identity and rides the envelope as `buildIdentity` (disposition envelope and
   same-CAS receipt envelope; the 16-entry history stays identity-only). The
   unscoped compatibility wiring omits the `deploymentScope` member.
2. `commitAcceptedTransitionInLane` (~L3160): the committed document value now carries
   the append-only `durableOriginalReceipts` map. The ORIGINAL receipt envelope
   (`{carrierVersion: 1, identity, intentType, turn, buildIdentity, receipt}`) is
   composed by the engine AGAINST THE NEXT PROJECTION (receipt.instance =
   outwardInstanceSnapshot of the next value) BEFORE the put, and commits with
   mustMatchRevision at the snapshot revision — state, revision and original receipt
   are ONE physical row write. The K01 fence precondition `#requireHeldAdmissionFence`
   stays first. An existing ring entry under the same turnId refuses typed
   (K02_TURN_RECEIPT_INPUT_CONFLICT) — the map is append-only, never rewritten.
3. `submitOccurrence` (~L5722): the occurrence lane computes the input digest ONCE and
   consults the same-CAS receipt ladder (`readDurableOriginalReceiptOrReplay`: the
   snapshot's own ring -> the independent `receipt-archive` doc -> undefined) BEFORE
   the history/disposition ladders. Identity match replays the EXACT ORIGINAL receipt
   (never a re-derived pseudo-receipt) and best-effort heals the observational
   disposition; identity mismatch refuses typed `K02_TURN_RECEIPT_INPUT_CONFLICT` /
   `K02_TURN_RECEIPT_INTENT_CONFLICT`; a legacy/unreadable envelope fails closed
   `K02_TURN_RECEIPT_LEGACY_UNREADABLE`; an archive READ fault fails closed
   `K02_TURN_RECEIPT_STORE_FAULT` for that turn. Non-JSON input refuses typed
   `K02_INPUT_NOT_JSON`. The post-commit decision-receipt and turn-disposition
   writes remain best-effort observations (archive-only role).
4. Eviction gate: the former missing-disposition fail-closed block
   (ADMISSION_TURN_HISTORY_EVICTION_BLOCKED at 16+ turns) is REPLACED by the ring —
   `MAX_ADMITTED_CONTROL_TURN_HISTORY` (16) stays the crash-backstop history bound;
   the in-doc receipt ring (default 64, `durableReceiptRingBound` option, floor 17)
   evicts its oldest entry ONLY once its independent durable archive record exists
   (`#ensureDurableReceiptArchived`, mustBeAbsent; KEY_EXISTS with the same identity
   counts as archived; a different identity is a typed anomaly; any other fault keeps
   the entry — fault-tolerant growth, admission NEVER blocks). `outwardInstanceSnapshot`
   redacts `durableOriginalReceipts` alongside the existing carrier fields. hf18 was
   rewritten to the new witness (17th turn ADMITS; the crash-window turn's original
   receipt is physically in the ring and its replay carries the original projection).
5. Key builders: the six durable doc families (wf-instance, admission-fence,
   effect-journal, turn-disposition, decision-receipt, receipt-archive) route through
   per-runtime `docKeys` chosen ONCE at the runtime wiring boundary. A wired
   `deploymentScope` option (validated by the in-kernel restatement of the carrier's
   bounded-identifier grammar) switches every family to the injective scoped grammar
   `v010-k02:<app>:<tenant>:<appId>:<pkg>:<kind>:<parts...>` (percent-encoded
   components); without it the historical `v08-kernel:` keys are kept BYTE-FOR-BYTE
   (compatibility mode — 49 existing files depend on those bytes, including the K01
   regression surfaces tg5/k01-worker). journal keys route through the journal class
   and the K01 held-fence scan; the continuation query read threads `docKeys`;
   governance-pin/baseline/decision-cache/promoted-pin families stay unscoped (not in
   the closed grammar).

K01 semantics preserved: the dispatch-attest mechanism, `probeProvesZeroExternalEffect`,
`releaseAdmissionFence`/`#docs.remove` CAS, same-revision rival refusal and the
trusted-seam recovery supersede are untouched; k01-fence-race-multiprocess (8/8,
K01-N4 both tagged falsifiers) and tg5-hf16 poison (1/1) rerun green on the spliced
bytes.

## TRUE combined physical verification (never claimed PASS before the splice)
`tests/v08-host/k02-combined-splice-physical.test.ts` +
`children/k02-splice-worker.mjs` (real stock-node children) — real spliced kernel by
exact bytes (data-URL, blob pinned in-file), real `openSqliteCasStore`, scoped wiring:
- CB-P1 same-CAS atomicity: doc revision == stateRevision; the original receipt
  (input-complete + scope-joined identity, buildIdentity on the envelope) rides the
  SAME physical row; close/reopen durability; late replay carries the ORIGINAL
  projection with zero new dispatch; canonically-equivalent input replays.
- CB-N1 changed-input -> `K02_TURN_RECEIPT_INPUT_CONFLICT`, changed-intent ->
  `K02_TURN_RECEIPT_INTENT_CONFLICT`, zero dispatch/state (root-cause-1 repair).
- CB-F1 fence/receipt coordination under the K01 attest contract: adapter-thrown
  tagged code after the real dispatch -> fence held + NO receipt; the trusted
  dispatcher's attested pre-handler refusal (HOST_RESOURCE_UNKNOWN) -> provable zero
  effect -> fence RELEASED via the docs.remove seam -> the follower admits and its
  original receipt lands; the poison turn never gains one.
- CB-R1 REAL two-process same-turn race over ONE SQLite file (scoped keys): the
  concurrent same-turn duplicate is an honest `ADMISSION_EFFECT_AMBIGUOUS`; the
  in-flight holder loses its stolen fence honestly at commit
  (ADMISSION_STATE_CAS_CONFLICT); the reconciling retry replays the completed journal
  (exactly-once effect, one ledger line) and lands the ORIGINAL receipt; a
  changed-input re-send refuses typed cross-process.

## Combined-verification evidence table (targeted runs, real exit codes)
| suite | command (package dir) | result |
| --- | --- | --- |
| K02-U1 carrier unit | node --import tsx --test tests/v08-k02-durable-receipt-carrier.test.ts (compiler) | EXIT=0, 6/6 |
| K02-P1..P3 + K02-R1 | node --import tsx --test tests/v08-host/k02-receipt-cas-physical.test.ts tests/v08-host/k02-receipt-race-multiprocess.test.ts (domain-harness) | EXIT=0, 14/14 |
| K02-N1 namespace (spliced blob pin) | node --import tsx --test tests/v08-host/k02-namespace-two-b-physical.test.ts (domain-harness) | EXIT=0, 2/2 |
| combined (new) | node --import tsx --test tests/v08-host/k02-combined-splice-physical.test.ts (domain-harness) | EXIT=0, 4/4 |
| K01 regression | node --import tsx --test tests/v08-host/k01-fence-race-multiprocess.test.ts (domain-harness) | EXIT=0, 8/8 (K01-N4 both variants) |
| K01 tg5 poison | node --import tsx --test tests/v08-integration/tg5-hf16-poison-selected-physical.test.ts (domain-harness) | EXIT=0, 1/1 |
| kernel semantics | turn-source / message-dedup individually; c01 + d3 + fr02-sdk batch (compiler) | EXIT=0, 48/48 (batch) |
| hf18 (rewritten to anchor-4) | node --import tsx --test tests/v08-integration/hf18-history-eviction-physical.test.ts (domain-harness) | EXIT=0, 1/1 |
| tg5-kernel-taxonomy (conflict code) | node --import tsx --test tests/v08-integration/tg5-kernel-taxonomy-selected-physical.test.ts (domain-harness) | EXIT=0, 6/6 |
| oracle rebind | node --import tsx --test tests/v08-tf-oracle-fr02-fr07.test.ts (compiler) | EXIT=0, 15/15 |
| gates | build (both pkgs) / typecheck (both pkgs) / targeted eslint | EXIT=0; committed dist byte-identical (no src change under domain-harness/src) |
| full gate on rebased HEAD `d0992d57` | tools/task-check.sh (lint → workspaces typecheck → workspaces test + test:root), Node v24.21.0 | EXIT=0 **全绿: 4070 pass / 0 fail** (t016 fixed on base by #1186; two transient work-tree-only repairs were needed first: the tests-dir typecheck row above, and building the untracked local expo/node dist inputs that tests/tools/script consumes) |

## Ordering discipline
1. This pack + claim (done first). 2. Carrier fragment + unit tests. 3. Physical suites
(red→green against the carrier). 4. task-check. 5. Independent exact-HEAD review. 6. PR →
`v0.10`. 7. Splice phase after K01 release (separate coordination, same issue).
