# v0.10 Governed Occurrence Pin — Reservation & Recovery Protocol (v3, corrected)

Status: **active for #1219**. This document supersedes the RESERVED→ADMITTED
state-machine proposal of #1219@6311949981 in its entirety. That proposal was
adversarially corrected by #1219@6312612203 (counterexamples F1/F2); this v3
also incorporates PR #1263's live-adopter correction and is the implemented contract of
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
   occurrence key. Reclamation without proving that no in-flight submit can
   admit is forbidden; a pin-revision CAS alone is not such a proof.
3. **No time-based takeover.** Lease timeouts, heartbeat age or wall-clock
   reasoning never authorize reclaiming another writer's reservation.

## 1. Pin record (v3)

The occurrence→BUILD pin (`v10-occ-pin:<...>`) gains, additively:

```
phase:        'RESERVED' | 'ADMITTED'      # absent on pre-v2 pins ⇒ ADMITTED
reservation:  { messageId, intentType?, inputDigest, reservedAt }   # iff RESERVED
activeAttempt:{ attemptId, holder:'writer' } | null     # iff RESERVED (slot)
inFlight:     [attemptId, ...]               # iff RESERVED; absent ⇒ untracked (pre-v3)
admittedAt:   ISO instant                    # set on RESERVED→ADMITTED
```

Ownership binding (correction (a)): a RESERVED pin names the **exact** BUILD
(it already carries subject/closure digests) **and the exact logical
attempt** — `messageId`, sealed `intentType` and `sha256(canon(input))`.
New reservations always store `intentType`; older reservations without it
remain readable, but can never authorize compensation after a denial.
A different intent cannot continue an intent-bound reservation even if its
Business/workflow target, messageId and input happen to match.

## 2. Writer fence (correction (b)/(d))

An owner submit claims the pin's writer slot (`activeAttempt.attemptId`,
claimed by exact-revision CAS). Same-message adopters do not claim it.
The slot is an owner marker, **not a fence over all Kernel submits**.

- A send with a **different** messageId/input under a RESERVED pin refuses
  typed `OCCURRENCE_RESERVATION_PENDING` — no second independent active
  submit exists under an unresolved reservation (correction (b)).
- A **same** messageId/input send under a **held** slot proceeds WITHOUT
  claiming (`adopt` mode): the Kernel's own K02 durable `(target, messageId)`
  dedup (same-CAS original-receipt ring, `K02_TURN_RECEIPT_INPUT_CONFLICT`
  on input mismatch) prevents duplicate committed turns. It does not make
  non-admitted evaluations deterministic: dynamic semantic/Guard results may
  differ, and denials are evaluated again rather than durably committed.
  An adopter
  **can never reclaim** the pin — that power exists only under a slot this
  attempt itself holds **and** the admission-impossibility proof in §4.
- A crashed attempt leaves its slot held. Held-slot states are fail-closed:
  fresh owner claims are impossible until the holder concludes (or a witness
  heals the pin to ADMITTED). This is honest UNKNOWN, not a leak of the
  redirect guard.
- **In-flight registration (v3).** Every submit of a tracked pin — owner
  *and* adopter — adds its attemptId to `inFlight` by exact-revision CAS
  BEFORE reaching the Kernel, and removes it when its submit concludes
  (admitted settlement drops the whole set). The set, not the slot, is the
  fence over Kernel submits: a submit that can still admit is always in it,
  unless its process crashed (a stale entry, which only blocks compensation).
  Pre-v3 pins (no `inFlight`) stay untracked; their adopters cannot be
  counted, so they never authorize a dynamic compensation.

## 3. Admission witness (correction (c)/(e))

The **only** trusted durable admission evidence is the Kernel's own
same-CAS original receipt (K02 anchor 2), read back from the physical store:

- turn id: `turn:<workflowId>:<instanceKey>:message:<messageId>`;
- instance doc `durableOriginalReceipts[turnId]` ring entry, falling back to
  the per-turn `receipt-archive` doc when the bounded ring evicted the entry
  (eviction requires the archive record to exist);
- the envelope counts iff `receipt.status === 'admitted'` **and** the
  receipt's `occurrence.messageId` and `inputDigest` match the reservation
  byte-for-byte (after removing the receipt digest's `sha256:` prefix).
  For intent-bound reservations, `receipt.intentType` must also match.
- both the turn id and the reservation `inputDigest` come from the
  **selected kernel's own** exported `deriveDurableControlTurnId` and
  `canonicalJsonStringify` — never a compiler re-implementation (the
  compiler's sorted `canonicalJson` orders integer-like keys differently, so a
  re-implemented digest silently never matches; RES7 fences this).

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
     - witness absent, this attempt holds the slot (`owner`), the reservation
       binds its exact intent, and the receipt is `denied` specifically by
       the Kernel's **fixed `business-caller-role` gate** for that Business,
       intent and facade caller role → **guarded compensation**:
       exact-revision `remove` of its own RESERVED pin. This gate depends
       only on the immutable selected intent's allowed roles and the facade's
       fixed role, before Standard evaluation or admission. Every submit of
       that bound intent fails the same gate, including a live adopter. This
       is the admission-impossibility proof; the slot and turnId alone are
       not such a proof. A CAS conflict
       retains the pin and refuses typed INDETERMINATE; a store without the
       conditional-remove seam refuses typed INDETERMINATE and retains the
       pin (fail-closed, never a fake success);
     - witness absent, any other concluded non-admission (`terminated`,
       dynamic Guard/schema/policy denial), owner or adopter: **last
       in-flight compensation** — if this registered attempt is the ONLY
       entry of a tracked pin's `inFlight` set and no foreign slot holder
       exists, the pin is removed by exact-revision CAS. Every other submit
       has concluded (or was declared terminated by the Host), so no
       evaluation remains that could still admit; the exact revision fences a
       concurrent registration. Otherwise the attempt only deregisters and the
       pin stays RESERVED: another registered evaluation may still admit
       (RES9), and it settles or compensates when IT concludes (RES13).
       Untracked (pre-v3) pins never compensate on this path.
   - **thrown** failures → deregister (slot + in-flight entry), keep
     RESERVED, rethrow. A throw is never proven pre-write; no delete ever
     happens on this path.

`recoverReservation(intent)` (any live activation of the owning BUILD):
`ABSENT` | `ADMITTED` (directly, or healed from RESERVED via a matching
witness — the crash-after-admission-before-commit window) | `PENDING`.
`PENDING` never deletes and never mutates: absent proof, the pin stays
(correction (d)); the owner continues the exact reserved messageId and the
K02 replay reconciles the outcome.

`recoverReservation(intent, { priorWriterTerminated: true })` is the one
explicit exit for a crashed owner. It is the Host's trusted assertion that no
process which could hold the writer slot is alive (e.g. the single writer
process restarted); the protocol cannot prove liveness itself. With no
matching witness it frees the held slot by exact-revision CAS — never a
delete — and still returns `PENDING`. The next same-message send then runs as
**owner**. Only the intent-bound fixed caller-role denial described above
can then compensate the pin (RES8); other results keep RESERVED. The Host
must establish the prior slot holder's death rather than infer it from age.
Even a false assertion, or a live adopter left after that holder died, must
not allow a dynamic non-admission to delete the pin of a submit that can
still admit (RES9): slot release leaves every `inFlight` entry in place.

`recoverReservation(intent, { allAttemptsTerminated: true })` is the exit for
**crashed registered submits**, whose stale `inFlight` entries would
otherwise block compensation forever. It is the Host's stronger assertion
that EVERY attempt ever registered on this reservation has terminated (e.g.
all writer processes restarted). It empties `inFlight` and the slot by
exact-revision CAS (a pre-v3 pin becomes tracked), never deletes, and
returns `PENDING`; the next concluded non-admission of the reserved message
then compensates as the last in-flight submit (RES14). **Its safety rests
entirely on the assertion being true**: if a registered submit is in fact
still live, a later compensation may delete the pin before that submit
admits — the exact P1 interleaving the in-flight set otherwise prevents.

`OCCURRENCE_RESERVATION_PENDING` refusals of `send` (different message, or
another BUILD, under an unresolved RESERVED pin), and foreign-BUILD refusals
of `recoverReservation`, carry
`detail.retryable === true`: first admission of one occurrence is serialized,
so concurrent distinct messages to a brand-new instance get this transient
refusal and should be retried after the reserved message settles. The
reserved messageId re-sent with a different input or bound intent is a caller
conflict and carries `retryable: false`.

## 5. Honest residuals

- A writer that crashes mid-`submitOccurrence` with an outcome the witness
  can never show (e.g. the Kernel itself lost the race and admitted nothing)
  leaves the pin RESERVED with a held slot until resolved. No
  protocol-visible (time-based) takeover exists; resolution is the owner
  re-sending the exact reserved messageId (K02 replay is idempotent), the
  Host's explicit `priorWriterTerminated` slot release or
  `allAttemptsTerminated` in-flight reset (§4), or a future Product
  amendment introducing a store-level transaction covering reservation
  release and admission impossibility in ONE physical transaction.
- Pre-v2 pins normalize to ADMITTED: the historical orphan window stays
  pinned (conservative, auditable via `readPin`).
- A dynamic non-admission retains the RESERVED pin while any OTHER
  registered submit remains in flight; the last one to conclude compensates
  (or settles ADMITTED). A crashed registered submit therefore blocks
  compensation until the Host's `allAttemptsTerminated` assertion. Pre-v3
  (untracked) pins and old unbound-intent pins cannot be compensated after a
  dynamic non-admission; no intent is inferred or migrated from a retry.
- `allAttemptsTerminated` is trusted Host input: a false assertion forfeits
  the no-orphan-admission guarantee for that occurrence (see §4).
- Legacy compiler-digest RESERVED pins whose canonical bytes differ from
  the Kernel's cannot heal or resend through these APIs. Slot release never
  changes their digest. See the post-release compatibility notes §3.
- The governed layer is the only writer this protocol fences; a raw
  (ungoverned) `activateV10App` facade over the same store is outside its
  authority, as before. Raw-facade writes violate this deployment boundary;
  the governed protocol does not claim to fence them. Non-deterministic
  Standard/Guard outcomes within the governed path are supported by retaining
  the reservation, not by accepting an orphan admission and a later error.

## 6. Verification matrix (Node24, physical SQLite; two real processes where marked)

1. Intent-bound fixed caller-role deny before any K admission ⇒ guarded compensation
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
8a. Integer-like input keys: the crash heal still matches (kernel digest
   parity, RES7).
8b. Crashed owner + adopter deny stays RESERVED; after the Host's
   `priorWriterTerminated` release the same-message owner deny compensates
   and the instanceKey is free again, for the fixed role gate only (RES8).
8c. Two activations + real SQLite: a live owner, or a live adopter of a dead
   owner, pauses in Standard evaluation; Host slot release and another
   evaluation's semantic-unavailable terminal or dynamic Guard denial never
   delete the pin; the paused submit admits and settles it ADMITTED (RES9).
8d. Legacy compiler-digest mismatch stays RESERVED across exact resend and
   Host release (RES10); an old pin without intent binding cannot compensate
   a role denial (RES11).
8e. A lone dynamic Guard denial (the last in-flight submit) compensates its
   pin, and the same BUILD then admits a different message on that instance
   (RES13).
8f. A crashed registered submit keeps a retry's Guard denial RESERVED, even
   after `priorWriterTerminated`; after `allAttemptsTerminated` the next
   denial compensates and the instance admits a new message (RES14).
8. Regressions: the T08 governed trio (activation/decision/pinned-restore),
   T00/C01 assembly witnesses and the packed consumers stay green.
