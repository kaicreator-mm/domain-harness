# K02 independent review checklist (exact-HEAD, risk:critical)

Reviewer identity: self-declared logical agent/session distinct from the builder session
(`ai-dev:event:v2`; GitHub account is transport only). Review the exact PR HEAD SHA, not a
local mutation. `request_changes` on any single hard item; approve only with all hard
items PASS.

## Hard items (any FAIL ⇒ request_changes)

- [ ] H1 Same-CAS truth: the original acknowledged receipt of an admitted turn is a field
      of the SAME single document value as the authoritative state CAS (one physical put,
      `mustMatchRevision`); no code path writes state without the receipt or vice versa;
      no best-effort record is presented as the original.
- [ ] H2 Immutability: no code path rewrites or evict-rewrites an existing
      `durableOriginalReceipts[turnId]` entry; re-admission of an admitted turnId refuses
      before any mutation.
- [ ] H3 Changed-input conflict: same messageId + canonically changed input (or changed
      intentType) refuses typed BEFORE any state/journal/effect activity; canonical
      equivalence (key order/whitespace) replays, never conflicts.
- [ ] H4 Liveness: 17+ turns after total derived-archive destruction still admit and
      replay from same-CAS receipts; no global admission block exists on any missing
      derived record; ancients (evicted ring + lost archive) refuse typed for themselves
      only.
- [ ] H5 Namespace injectivity: scope tuple prefix is injective for all doc families;
      two-B test uses the REAL unmodified kernel bytes; no cross-namespace key is
      reachable (list/get/put all scoped).
- [ ] H6 Fail-closed: store fault during receipt CAS leaves zero partial durable state;
      legacy/unknown envelope shapes refuse typed (no migration); non-JSON input refuses
      typed; denials record nothing.
- [ ] H7 Two-process honesty: exactly one winner ACK; loser replays the SAME original
      receipt (byte-equal original fields) with zero new effect; changed-input racer
      refuses typed; children are real stock-node processes over one real SQLite file.
- [ ] H8 K01 boundary respected: `kernel-mechanism-v1.mjs` byte-identical to base blob
      `fa30e1204d47c12f3f5842c497a83a08501d515b` at PR HEAD; K01's test files untouched;
      no fabricated K01→K02 DAG dependency; splice work marked PARTIAL_BLOCKED, not DONE.
- [ ] H9 No scope expansion: no frozen Product/A01/L2/DAG edits; no other DAG node's
      concern; no per-package VM; no speculative Host Port; no pre-1.0 migration; out-of-
      scope SDK provenance checks absent.
- [ ] H10 Evidence honesty: every claimed PASS is backed by a recorded command + real
      exit code at the exact HEAD; unrun/incomplete items say BLOCKED/NOT_RUN; no
      synthetic seam presented as physical proof.

## Soft items (note, non-blocking)

- [ ] S1 ring bound 64 rationale documented; bound is configurable without grammar change.
- [ ] S2 fragment style matches payload discipline (no imports, ports injected, JSON only)
      for a clean post-K01 splice.
- [ ] S3 typed error codes namespaced `K02_*` and distinct from kernel/HOST codes; no
      catch-all swallowing.
- [ ] S4 test files follow repo conventions (node:test, tmpdir SQLite cleanup, data-URL
      kernel import for exact-bytes discipline).
