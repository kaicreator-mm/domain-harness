# v0.8 T-G #1006 — Hidden Validation attestation (non-sensitive; execution NOT_RUN)

> Public-safe record required by `#1006@6189172826`: "private vectors remain in
> permitted private repo, only non-secret attestation publicly". No private scenario,
> fixture value, assertion mapping, checksum-of-private-input or result detail from the
> private pack appears here. Hidden Builder self-run was NOT used and does not count.

## State at the closing of this T-G round

- An independently authored private Hidden PRE-PACK for v0.8 exists in the permitted
  private repository `kaicreator-mm/hidden-validation` at branch
  `task/domain-harness-v0.8-hidden-prepack-53` (worktree `hv-i53-zcode`), pack id
  `DH08-PP-53-01`, revision 3 (HEAD `367e2c0`), authored under the T-G public dispatch
  `#1006@6118662082` and tracker `hidden-validation#53`.
- Authoring independence: the pack was authored by an identity other than the v0.8
  feature Builders (PRs #1055/#1057/#1061/#1065/#1066/#1067/#1068) and other than this
  T-G acceptance executor; it went through two formal independent review rounds that
  returned CHANGES_REQUESTED (P0/P1 findings) and a third-round terminal:
  **independent private pre-pack review terminal PASS at `hidden-validation#55@6128051800`
  (revision 3, P1-04 repair verified on the mint success path)**.
- Coverage surface (public-safe counts only): 34 scenarios across 23 coverage
  dimensions derived from the frozen v0.8 L2 architecture; includes the retained
  function surface (44-row families plus the six new functions), clean package
  consumer, dual real Apps on one sealed K/S cohort, typed UNKNOWN, installer-verified
  code bytes, and the v0.7 functional oracle differential.
- Integrity self-check executed by THIS round (control path only, not execution):
  `prepack-selfcheck.mjs` → PASS on Node `v24.21.0` AND Node `v22.23.3`
  (`authorityIntegrity: PASS`, closed file set PASS, anti-copy vs v0.7 PASS, leak-check
  controls PASS, schema contradiction guards PASS, sandbox mint success-path control
  PASS with 6 read-back negatives rejected). The self-check's sandbox mint is
  `readbackMode='recorded-fixtures'` and is structurally execution-ineligible.

## Why execution is NOT_RUN (structural, not waived)

The pack's own finalization contract (`runner/finalize-pack.mjs`, reviewed PASS) mints
a FINAL pack only when BOTH online gates hold:

1. a `TG_CANDIDATE_FREEZE` act comment on `domain-harness#1006` naming the exact
   candidate SHA/tree, posted by an actor distinct from pack owner and executor —
   **no such act exists on #1006 at closing** (the intake comment
   `#1006@6189172826` is `DH08_TG_REUSE_FIRST_FINAL_CANDIDATE_ACTIVATION`, not a
   `TG_CANDIDATE_FREEZE` act, and this executor may not mint one for itself);
2. pack owner and executor as **distinct GitHub login identities** — every actor in
   this environment (including the review terminal, the intake authority and this
   executor) posts under the single `kaicreator-mm` login, so the distinctness gate
   cannot be satisfied by any legitimate pairing available here.

Faking either gate (self-posted freeze act, sandbox-recorded read-backs) is explicitly
refused by the reviewed runner (`HV08_PACK_RECEIPT_READBACK_NOT_LIVE`) and would not
count as independent. Hidden Validation therefore stays **NOT_RUN** at candidate
`b151320ee6835755ba043e2602c085c180c9c849`; no Hidden PASS/FAIL is claimed in either
direction.

## What unblocks it (for the successor round)

1. The T-G authority (an actor that is neither pack owner nor executor) posts the
   `TG_CANDIDATE_FREEZE` act on #1006 for the frozen candidate SHA/tree.
2. A distinct executor identity (separate GitHub login) is designated by the pack owner
   to run `finalize-pack.mjs` (online gh gates) and then the offline
   `runner/hidden-runner.mjs` against the exact candidate checkout, followed by the
   leak-check before any public posting.
3. If the candidate moves (any source change), the pack binds to the new SHA/tree via
   the same gates; prior mints do not transfer.
