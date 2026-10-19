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
      derived record; an ancient turn whose archive record READ fails refuses typed
      for that turn only — an ancient with the archive record physically ABSENT
      (evicted ring + lost/never-written archive) is not identifiable as
      previously-admitted and re-admits as a new turn (honest physical limit, not a
      migration gap).
- [ ] H5 Namespace injectivity: scope tuple prefix is injective for all doc families;
      two-B test uses the REAL unmodified kernel bytes; no cross-namespace key is
      reachable (list/get/put all scoped).
- [ ] H6 Fail-closed: store fault during receipt CAS leaves zero partial durable state;
      legacy/unknown envelope shapes refuse typed (no migration); non-JSON input refuses
      typed; denials record nothing.
- [ ] H7 Two-process honesty: exactly one winner ACK; loser replays the SAME original
      receipt (byte-equal original fields) with zero new effect; changed-input racer
      refuses typed; children are real stock-node processes over one real SQLite file.
- [ ] H8 K01 boundary respected (phase-1 form, historical): kernel byte-identity to the
      pre-splice base blob `fa30e1204d47c12f3f5842c497a83a08501d515b` held through
      phase-1. Phase-2 (after the K01 release #1183 and the v0.10@027f3b74 rebase)
      SPLICES this file by design: the authoritative post-splice blob is recorded in
      IMPLEMENTATION_MAP.md / MANIFEST.yaml (`phase2_integration.kernel_blob`, after
      the R1 repairs: `c164f491efc0047b7654088f8c359cb3fd58ceaf`); K01's test files stay
      untouched; K01 semantics (attest mechanism, zero-effect release, rival-refusal)
      re-proven on the spliced bytes; no fabricated K01→K02 DAG dependency.
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
