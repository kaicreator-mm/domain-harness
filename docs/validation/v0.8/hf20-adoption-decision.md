# HF20 adoption decision — ordered durable mutation observation cursor (#1063)

```ini
ISSUE=1063
PARENT=1006
SEAM=B
BASE=v0.8@c9b6de229c593b7f0a00658ff7aa4b885ec5e397
STATE=WIRED__SELECTED_PN_EXECUTED (§5 executed after the #1062/#1066 seam-A merge)
NATIVE_PN=11/11 PASS, 0 SKIP (hf20-mutation-observation.test.ts, Node24 + real SQLite)
RELEASE=HOLD (unchanged; 44/44 status rows stay NOT_RUN until the #1006 final gate)
```

This document freezes the **source adoption decision**, the **minimal K/H
contract** reference and the **independent test design** for the HF20
corrective child. The K/H wiring hooks of §5 have now been EXECUTED on
`v0.8@c9b6de2` (the #1062/#1066 seam-A K owner merged and released the
shared K file per #1063@6188137089): the same-envelope window, the
protected read verb, the restart witness (two fresh processes over one
physical SQLite file — the trust channel is one-shot per process, the
NF06 spawned-reader discipline) and the read-scope redaction are in the
selected K bytes and the trusted gateway.

## 1. What HF20 is — and is not

| Concern | Status under this decision |
| --- | --- |
| Ordered records of **committed** K mutations, per exact instance/tenant/app scope | IN SCOPE — same-envelope window (§3) |
| Restart resume from an **opaque K-validated cursor** on the same physical SQLite | IN SCOPE — cursor codec + watermark validation (§4) |
| Effect Journal visibility | OUT — stays an independent surface; `EFFECT_SETTLED` omitted exactly as the reviewed #312 contract omitted it |
| HF17 `observeLatest` | OUT — remains the deliberately NON-durable `Query latest → NEW subscription` session; no durable reinterpretation, no cursor grafted onto it |
| NF06 decision receipts | OUT — remain OBSERVATIONAL_OPTIONAL best-effort appends strictly AFTER the business commit; their failure taxonomy (`not_recorded`) and per-record frozen reader scope are unchanged |
| New public API / UX mutation authority | OUT — one protected H read verb behind the trusted gateway, same discipline as `queryInstance`/`queryDecisionReceipt` |

## 2. Source adoption table (exact pins at `v0.8@6ca9fb6`)

| Role | Adopted source | Why |
| --- | --- | --- |
| **Atomicity carrier** | `kernel-mechanism-v1.mjs` `WorkflowInstanceEngine.commitAcceptedTransitionInLane` (state CAS write, ~L2214–2248) and `PersistentWorkflowInstanceRepository.create` (~L2139–2154) | These are THE authoritative single-document mutation writes every committed turn already performs; the HF20 window rides the same document value |
| **Physical atomicity proof** | `src/host-v8/sqlite-cas-store.ts` `put` (~L86–122, `#transaction` ~L168–174) | ONE row (`key, revision, value`) in ONE IMMEDIATE transaction; `revision = revision + 1` and the whole JSON value land together or not at all; unconditional writes do not exist on this store |
| **Revision-coupling invariant** | K header (~L56–60): doc revision and `snapshot.stateRevision` are the same counter (create → 0, CAS → n+1 both) | Lets the window assert `stateRevisionBefore = stateRevisionAfter − 1` per record and lets readers couple records to the authoritative revision without a second read path |
| **Read-verb discipline** | NF06 `queryDecisionReceipt` triple: K gate (~L3922–3979), facade ops seam (`V8FacadeKernelOps`, `public-v8/microkernel.ts` ~L180–183), gateway verb (`host-v8/kernel-gateway.ts` ~L733–743) | The protected-H-read pattern HF20's gateway verb copies verbatim in discipline: re-authenticate → scope gate → qualified address → K owns validation and record bytes |
| **Semantic reference (NOT runtime dep)** | `src/observation/contracts.ts` (#312 reviewed contract) + `src/observation/recording-store.ts` | Record/cursor/page/gap taxonomy, "sequence is the only ordering authority", RETENTION_TRUNCATED honesty, idempotent-replay rule, atomicity-in-the-store rule; `recording-store.ts` is the decorator-shape reference the 44-row map pins — neither file becomes a v0.8 runtime dependency |
| **Scope carrier** | `qualifiedInstanceKey` = `${tenantId}:${appId}:${instanceKey}` into the physical doc key `v08-kernel:wf-instance:<workflowKey>:<tenant>:<app>:<instanceKey>` (`public-v8/microkernel.ts` ~L1573) | Tenant/app isolation is physical (per-row key), so the observation stream inherits exact-scope isolation by construction |

## 3. Atomicity decision — SAME mutation-committed envelope

**Decision (HF20-A, adopted):** the ordered observation window is stored
INSIDE the instance document that the authoritative state CAS already
writes. `create()` seeds `mutationObservations: newWindow()`; each
`commitAcceptedTransitionInLane` computes the next window via the pure
reducer (`appendHf20MutationObservation`) inside the transition body and
writes it in the SAME `docs.put(..., { mustMatchRevision })` value.

**Why this is real atomicity, not a protocol claim:**

1. Physically, one `SqliteCasStore.put` is one row write in one IMMEDIATE
   transaction — SQLite serializes it across processes; the row either
   carries `(stateRevision n+1, state', window+record)` or still carries
   `(n, state, window)` — no intermediate shape exists, including under
   crash (WAL keeps committed frames across process death).
2. The observation record therefore CANNOT exist without its committed
   stateRevision and vice versa — one row, one counter, one transaction.
   This is the v0.8 equivalent of the #312 rule "atomicity lives in the
   store transaction, not in decorator ordering", transplanted from
   "one host transaction" to "one physical row write".
3. Lost-CAS discipline: a losing concurrent writer takes
   `HOST_CAS_CONFLICT` from `put` BEFORE any durable effect, so its record
   is never written (HF20-N "uncommitted/lost-CAS mutation does NOT yield a
   successful observation" holds by construction).
4. No uncommitted mutation can yield a record: denied turns return before
   the CAS write; the reducer runs only inside the winning write.

**Rejected alternatives (documented, not adopted):**

- **Post-commit append (NF06 shape) as HF20** — explicitly forbidden by the
  Issue; it is best-effort by design and its own K source states why: the
  frozen Host contract is a true-CAS SINGLE-document store with no
  cross-document atomic batch, so state-CAS + separate append cannot be
  proven atomic or crash-recoverable (see the `durable-mandatory` refusal
  in `submitOccurrenceLatched`, ~L4093–4124).
- **Pre-commit pending-record + read-side revision validation
  (HF20-B, "recoverable sequence")** — a pending record keyed by target
  revision, excluded on read when `target > stateRevision`, would leave
  orphan rows after a lost/crashed commit AND has an unresolvable
  collision: a retried DIFFERENT turn reaches the same revision and the
  orphan then looks committed. Resolving it requires per-revision turn
  truth inside the state document — which degenerates to the same-envelope
  decision. Recorded as the only viable future extension if unbounded
  retention is ever required (with a typed spill protocol), NOT claimed now.

**Retention honesty:** the retained tail is bounded
(`HF20_MUTATION_OBSERVATION_RETENTION_LIMIT = 64`) so the carrier document
stays bounded. Eviction surfaces as the explicit `RETENTION_TRUNCATED` gap
(`earliestAvailable` + `highWatermark`) — the reader must not claim a
continuous trace across it; `STORAGE_GAP` has no carrier analogue (one row
cannot be partially stored).

## 4. Minimal K/H contract (frozen in code)

`packages/domain-harness/src/host-v8/hf20-mutation-observation.ts`
(all-new file; no existing file touched):

- `Hf20MutationObservationRecord` — `{sequence, kind, stateRevisionAfter,
  stateRevisionBefore?, sourceMessageId?, committedAt}`; kinds
  `INSTANCE_OPENED` / `MUTATION_COMMITTED`; ordering authority = sequence.
- `Hf20MutationObservationWindow` — `{contractVersion, mutationSequence,
  records}` (retained tail ≤ 64).
- `appendHf20MutationObservation(window, intent, committedAt)` — the PURE
  reducer the K commit path calls INSIDE its CAS write; validates
  `INSTANCE_OPENED → stateRevisionAfter 0` and
  `MUTATION_COMMITTED → before = after − 1`; no separate append entry point
  exists by design.
- `encodeHf20Cursor` / `decodeHf20Cursor` — opaque base64url `{v,s,a}`
  binding the tenant/app-qualified stream; not a MAC — K re-validates
  every field against the CURRENT window (`CURSOR_MALFORMED`,
  `CURSOR_STREAM_MISMATCH`, `CURSOR_BEYOND_WATERMARK` typed refusals).
- `projectHf20ObservationPage(window, request)` — the pure page projection
  answering the read verb: ascending exclusive-after records, `nextCursor`
  iff any record returned, `highWatermark = mutationSequence`, explicit
  gap. Limit clamped to [1, 1000].
- `isHf20MutationObservationWindow` — fail-closed structural guard
  (contiguity, kinds, revision math) used before any projection.

## 5. K/H adaptation points (EXECUTED on `v0.8@c9b6de2`)

The exact small hooks this decision prepared, now executed after the
seam-A merge (each edit minimal; #1062's turn admission/history/eviction
guard and #1067's S05 fix preserved verbatim):

1. `kernel-mechanism-v1.mjs` (K payload — internal semantic twin of the
   §4 contract, no import; cursor codec implemented in pure JS so the
   sealed bytes keep their no-Node-global portability, wire-identical to
   the Host contract's base64url):
   - `PersistentWorkflowInstanceRepository.create`: seeds the window with
     the `INSTANCE_OPENED` record in the SAME mustBeAbsent put.
   - `commitAcceptedTransitionInLane`: the pure reducer appends the
     `MUTATION_COMMITTED` record inside the SAME single-key CAS value.
   - `readMutationObservations(target-derived request)`: cursor decode +
     validation against the qualified stream, window read, page
     projection; `counters.mutationObservationReads`; exposed in
     `getMechanismIdentity().mechanismFunctions`.
   - `outwardInstanceSnapshot`: queryInstance/getSnapshot, the Genesis
     response, occurrence receipts and turn-disposition receipts receive
     the OUTWARD projection — `mutationObservations` and
     `admittedControlTurns` stay internal next-CAS/replay truth.
2. `public-v8/microkernel.ts` `gatewayOps`: `queryMutationObservations(
   principal, {instanceKey, afterCursor?, limit?})` → K read at the
   principal-qualified address.
3. `host-v8/kernel-gateway.ts`: authenticated verb
   `queryMutationObservations(credential, UxTarget & {afterCursor?,
   limit?})` — authenticate → `assertIntentScope` → `requireApp` →
   `requireControlRole` (an ordinary authenticated reader is NOT an HF20
   reader) → ops call.
4. `host-v8/index.ts`: contract module exported through the barrel.

## 6. Independent test design (file:
`packages/domain-harness/tests/v08-integration/hf20-mutation-observation.test.ts`)

- **Part A — contract unit (runs NOW):** cursor round-trip/tamper/stream
  substitution/beyond-watermark refusals; reducer contiguity + eviction
  gap math; fail-closed window guard; page projection semantics
  (exclusive-after, nextCursor-iff-records, limit clamp).
- **Part B — physical carrier witness (runs NOW, real SQLite):**
  1. direct `SqliteCasStore`: state+window document written by ONE CAS put;
     stale-CAS loser gets `HOST_CAS_CONFLICT` and its record is absent;
     fault-injected put leaves the row entirely at the previous revision
     (no partial window) — the same-envelope atomicity witnessed at the
     physical store.
  2. REAL selected closure through `DomainHarness.load` → trusted host →
     gateway: repeated admitted sends keep the physical instance row's
     `revision == snapshot.stateRevision` (carrier invariant HF20 rides);
     two tenants share nothing (row keys are tenant/app-qualified);
     `failNextPutMatching('v08-kernel:wf-instance:')` rejects the send and
     leaves revision, state and any observation truth unchanged.
- **Part C — HF20-P/HF20-N seam driver (STAGED, feature-detected):** the
  full positive/negative flow (observe ordered records → close host →
  reopen same physical SQLite → resume from cursor; forged/stale/cross-
  tenant cursor refusals; replay synthesizes nothing; lost-CAS mutation
  yields no observation; Effect Journal stays distinct) activates only when
  the gateway exposes `queryMutationObservations`; until the seam-A merge
  lands the K hook it reports a typed SKIP with the exact deferral reason —
  it must never fake green, and its RED→GREEN execution is the post-merge
  Node24 physical P/N witness.

## 7. Boundaries re-asserted

- No full CI, no Release PASS claim, no self-merge; 44/44 manifest rows
  stay NOT_RUN until the #1006 final candidate gate.
- NF06 `OBSERVATIONAL_OPTIONAL` receipts and HF17 non-durable sessions are
  untouched and are NOT evidence for HF20.
- The historical `observation/*` modules are semantic references only — no
  hidden legacy runtime dependency is introduced.
