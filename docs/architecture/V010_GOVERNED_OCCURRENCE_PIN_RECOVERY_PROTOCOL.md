# v0.10 Governed Occurrence Pin — Reservation & Recovery Protocol (v2, corrected)

Status: **active for #1219**. This document supersedes the RESERVED→ADMITTED
state-machine proposal of #1219@6311949981 in its entirety. That proposal was
adversarially corrected by #1219@6312612203 (counterexamples F1/F2); this v2
incorporates both corrections and is the implemented contract of
`GovernedBuildActivation` in `v10build/deployment.ts`.

## 0. Non-normative (explicitly forbidden)

1. **Snapshot existence is never admission proof (F1).** A durable
   Genesis/instance snapshot survives a process killed after `openInstance`
   and before `submitOccurrence`, with zero admitted turns, receipts or
   effects. No protocol decision may treat `getSnapshot(target) !== null` as
   evidence that anything was admitted.
2. **No unfenced CAS-delete of a RESERVED pin (F2).** A revision-CAS remove
   does not fence a pending Kernel submit: a recovery that deletes a
   still-RESERVED pin while a writer's `submitOccurrence` is in flight lets
   that writer complete an admission onto an unpinned (or successor-pinned)
   occurrence key. Reclamation without a writer fence is forbidden.
3. **No time-based takeover.** Lease timeouts, heartbeat age or wall-clock
   reasoning never authorize reclaiming another writer's reservation.

## 1. Pin record (v2)

The occurrence→BUILD pin (`v10-occ-pin:<...>`) gains, additively:

```
phase:        'RESERVED' | 'ADMITTED'      # absent on pre-v2 pins ⇒ ADMITTED
reservation:  { messageId, inputDigest, reservedAt }   # iff RESERVED
activeAttempt:{ attemptId, holder:'writer' } | null     # iff RESERVED (slot)
admittedAt:   ISO instant                    # set on RESERVED→ADMITTED
```

Ownership binding (correction (a)): a RESERVED pin names the **exact** BUILD
(it already carries subject/closure digests) **and the exact logical
attempt** — `messageId` plus `sha256(canon(input))`. Nothing else may
continue it.

## 2. Writer fence (correction (b)/(d))

Every in-flight submit of a reservation **claims the pin's writer slot**
(`activeAttempt.attemptId`, claimed by exact-revision CAS) before entering
the Kernel; the slot is the durable in-flight marker.

- A send with a **different** messageId/input under a RESERVED pin refuses
  typed `OCCURRENCE_RESERVATION_PENDING` — no second independent active
  submit exists under an unresolved reservation (correction (b)).
- A **same** messageId/input send under a **held** slot proceeds WITHOUT
  claiming (`adopt` mode): the Kernel's own K02 durable `(target, messageId)`
  dedup (same-CAS original-receipt ring, `K02_TURN_RECEIPT_INPUT_CONFLICT`
  on input mismatch) makes the same logical attempt exactly-once. An adopter
  **can never reclaim** the pin — that power exists only under a slot this
  attempt itself holds, which is precisely the F2 fence.
- A crashed attempt leaves its slot held. Held-slot states are fail-closed:
  fresh owner claims are impossible until the holder concludes (or a witness
  heals the pin to ADMITTED). This is honest UNKNOWN, not a leak of the
  redirect guard.

## 3. Admission witness (correction (c)/(e))

The **only** trusted durable admission evidence is the Kernel's own
same-CAS original receipt (K02 anchor 2), read back from the physical store:

- turn id: `turn:<workflowId>:<instanceKey>:message:<messageId>`;
- instance doc `durableOriginalReceipts[turnId]` ring entry, falling back to
  the per-turn `receipt-archive` doc when the bounded ring evicted the entry
  (eviction requires the archive record to exist);
- the envelope counts iff `receipt.status === 'admitted'` **and** the
  receipt's `occurrence.messageId` and `inputDigest` match the reservation
  byte-for-byte.

Because the original receipt is composed before and committed inside the
same physical row write as the admitted state transition, the witness cannot
exist without a real admission — a crash between `openInstance` and
`submitOccurrence` can never fabricate it (F1 closed).

## 4. State machine

`GovernedBuildActivation.send`:

1. `preflightIntentRouting` (unchanged, #1251) — pure route refusal before
   any durable write.
2. `#beginOccurrenceAttempt` — mint RESERVED+slot (create-CAS), pass through
   an ADMITTED pin of the same BUILD, claim a free slot, or adopt under a
   held one; everything else refuses typed before any Kernel access.
3. `facade.send` (Kernel admission, unchanged).
4. Settlement:
   - receipt `admitted` → CAS the pin to ADMITTED (drop reservation+slot).
   - receipt `UNKNOWN` → release slot, keep RESERVED (honest UNKNOWN).
   - other **concluded** receipts (deny / terminated) → read the witness:
     - witness present and matching → settle ADMITTED, then surface typed
       `OCCURRENCE_RESERVATION_INDETERMINATE` (durable admission contradicts
       the receipt; reconcile via the original messageId);
     - witness absent and this attempt holds the slot (`owner`) → **guarded
       compensation**: exact-revision `remove` of its own RESERVED pin. The
       held slot proves no concurrent submit; the concluded receipt plus the
       absent witness prove this attempt can never admit. A CAS conflict
       retains the pin and refuses typed INDETERMINATE; a store without the
       conditional-remove seam refuses typed INDETERMINATE and retains the
       pin (fail-closed, never a fake success);
     - witness absent and `adopt` mode → release nothing, keep RESERVED
       (a possibly-live writer exists; fail-closed).
   - **thrown** failures → release slot, keep RESERVED, rethrow. A throw is
     never proven pre-write; no delete ever happens on this path.

`recoverReservation(intent)` (any live activation of the owning BUILD):
`ABSENT` | `ADMITTED` (directly, or healed from RESERVED via a matching
witness — the crash-after-admission-before-commit window) | `PENDING`.
`PENDING` never deletes and never mutates: absent proof, the pin stays
(correction (d)); the owner continues the exact reserved messageId and the
K02 replay reconciles the outcome.

## 5. Honest residuals

- A writer that crashes mid-`submitOccurrence` with an outcome the witness
  can never show (e.g. the Kernel itself lost the race and admitted nothing)
  leaves the pin RESERVED with a held slot forever **by design**. No
  protocol-visible takeover exists; resolution is the owner re-sending the
  exact reserved messageId (K02 replay is idempotent) or a future Product
  amendment introducing a store-level transaction covering reservation
  release and admission impossibility in ONE physical transaction.
- Pre-v2 pins normalize to ADMITTED: the historical orphan window stays
  pinned (conservative, auditable via `readPin`).
- The governed layer is the only writer this protocol fences; a raw
  (ungoverned) `activateV10App` facade over the same store is outside its
  authority, as before.

## 6. Verification matrix (Node24, physical SQLite; two real processes where marked)

1. Deterministic typed deny before any K write ⇒ guarded compensation
   removes the pin; a successor BUILD serves the same instanceKey.
2. Admitted occurrence keeps its original BUILD pin across successor
   activation (`OCCURRENCE_REDIRECTED_TO_NEW_BUILD` unchanged).
3. Different messageId (or different BUILD) under RESERVED ⇒ typed
   `OCCURRENCE_RESERVATION_PENDING`; nothing is deleted.
4. **F1**: RESERVED + existing instance state but witness absent ⇒
   `recoverReservation` returns PENDING and does not classify ADMITTED.
5. Crash-after-admission-before-commit (durable state: RESERVED + admitted
   witness) ⇒ `recoverReservation` heals to ADMITTED under the original
   BUILD.
6. **F2 two processes**: a held-slot RESERVED state (the durable footprint
   of a stalled writer) survives another process's recovery attempt
   (PENDING, no delete); the same-message send in the second process then
   admits and settles ADMITTED — no window in which a delete raced an
   admission.
7. Store without the conditional-remove seam ⇒ typed INDETERMINATE, pin
   retained.
8. Regressions: the T08 governed trio (activation/decision/pinned-restore),
   T00/C01 assembly witnesses and the packed consumers stay green.
