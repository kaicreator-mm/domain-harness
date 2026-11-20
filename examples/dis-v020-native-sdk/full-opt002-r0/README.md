# DIS 0.2.0 R211 O2 / OPT-002 full conformance — engineering layer R0

Lane writer: O2 (single exclusive writer for this directory).
Requirement: `DIS020-OPT-002` (matrix row stays **PARTIAL** after this lane; see
Authority gap below). Parent Draft PR #1497, base branch
`dis/0.2.0-element-intelligence-r1`, baseline HEAD
`ea12163301e2be629ccf4bb6914f19b33177913b` (Woodpecker #2636 18/18).

## What this directory delivers

Executable **engineering layer** evidence for OPT-002, composing the existing
bounded O2 building blocks (nothing is re-implemented):

| File | Role |
| --- | --- |
| `opt002-trace-receipt.mjs` | Authentic trace -> full OPT-002 receipt envelope. `captureOpt002Trace` drives the unchanged Host-owned Ed25519 issuer on the real selected AOT/SDK; `verifyOpt002Trace` re-consumes the tamper-evident chain through the pinned verifier and checks the envelope. The receipt carries an explicit **validator slot** (`status:'PENDING'`, `reason:'EXTERNAL_AUTHORITY_MISSING'`). `evaluateOpt002Experience` reports the unchanged bounded gate as explicit `NOT_ELIGIBLE`. |
| `opt002-holdout-policy.mjs` | Holdout registry: source/holdout/negative disjointness enforced across calls (cohort and case/run lineage), permanent no-second-use, holdout-as-source refusal. `evaluateOpt002Reuse` executes the METHOD policy (re-execute + revalidate only) and the RESULT policy (requires a structurally verified holdout record bound to holdout cohort + input digest). |
| `opt002-consent-boundary.mjs` | Consent ledger + two fail-closed gates: independent Validator trace access is denied without a consent record (`VALIDATOR_ACCESS_DENIED_NO_CONSENT`); export is denied without consent, denied when unsanitized, and with consent + sanitized only becomes a reviewable submission candidate (`exportAllowed` stays false). |
| `opt002-validator-admission.mjs` | Validator admission against a Host-provisioned identity pin. A receipt carrying its own self-signed identity claim is flagged **FORGERY** (`VALIDATOR_IDENTITY_SELF_ASSERTED` / `VALIDATOR_IDENTITY_CLAIM_UNVERIFIABLE`). A verdict that passes the unchanged two-key evidence gate is `ADMITTED_TECHNICAL` with `EXTERNAL_AUTHORITY_MISSING` while the pin is `LOCAL_TEST_PIN`. |
| `full-opt002-r0.test.mjs` | Native test: 9 tests (positive + fail-closed negatives) on the real selected AOT/SDK. |

## Positive evidence (real execution)

1. Real selected AOT/SDK xDownload execution -> `ISSUED_TRACE_ONLY` ->
   `RECEIPT_VERIFIED_STRUCTURAL`; receipt content digests equal the signed
   trace payload digests; validator slot explicitly PENDING.
2. Disjoint synthesis/holdout/negative partition registers; source cohort
   usage registers exactly once.
3. METHOD reuse policy returns the re-execute/revalidate path.
4. Consent record releases validator access **local-only** and creates a
   reviewable (never direct) export candidate.
5. RESULT reuse with a structurally verified holdout record reaches the
   distinct, executable `RESULT_REUSE_BLOCKED_INDEPENDENT_BUSINESS_VALIDATION_MISSING`
   decision (`structuralHoldoutVerified:true`).
6. Full pipeline (trace + consent + holdout + METHOD reuse) composes with
   `authority:'NONE'` everywhere.

## Negative evidence (fail-closed)

1. Tampered trace payload / mutated observation / forged signature ->
   `UNKNOWN`, `receiptVerified:false` (chain re-consumption also prevents
   burning a good trace).
2. Envelope claiming a pre-endorsed validator slot ->
   `OPT002_VALIDATOR_SLOT_CLAIMS_AUTHORITY`.
3. Second use of an already-used cohort -> `SOURCE_DATA_SECOND_USE_REFUSED`;
   holdout cohort claimed as source -> `HOLDOUT_DATA_USE_AS_SOURCE_REFUSED`;
   cross-set cohort or case/run lineage -> `LEAKED`.
4. RESULT reuse without holdout verification -> blocked; forged holdout
   signature -> `HOLDOUT_VERIFICATION_SIGNATURE_INVALID`; unregistered
   holdout cohort -> `HOLDOUT_COHORT_NOT_REGISTERED`.
5. Validator access / export without consent -> `DENIED`; consent without
   sanitization -> `EXPORT_DENIED_UNSANITIZED`.
6. Self-signed "independent" validator identity -> `FORGERY`; wrong-key
   verdict -> `REJECTED` without consuming the legitimate trace.
7. Experience stays `NOT_ELIGIBLE` even with trace + validator receipts;
   a caller flipping `evidence.attested` stays `NOT_ELIGIBLE`.

## Authority gap — EXTERNAL_AUTHORITY_MISSING (precise)

- **What is missing**: a genuinely independent business Validator — an
  external business party with a Host-provisioned identity pin
  (`provisionedBy:'EXTERNAL_BUSINESS_VALIDATOR'`) that signs a verdict
  authorizing validation of the captured trace (and, for RESULT reuse, the
  holdout cohort verification).
- **Responsible party**: the DIS product owner / external business Validator
  onboarding (DIE #155 F channel is BLOCKED; see also matrix row
  `DIS020-OPT-002` = PARTIAL and validation-summary).
- **Unlock condition**: external Validator identity is provisioned
  out-of-band and pinned by the trusted Host; its endorsement is admitted via
  `admitOpt002Validator` (returns `ADMITTED` + `validatorSlot.status:'ENDORSED'`).
- **What this lane refuses to do**: fill the slot with a test key, a
  self-signed identity, or any same-owner signature. Such attempts are
  executable negatives above (FORGERY / EXTERNAL_AUTHORITY_MISSING).

## Minimal seam once the real external Validator exists

1. `provisionOpt002ValidatorPin({validatorId, publicKey, provisionedBy:'EXTERNAL_BUSINESS_VALIDATOR'})`
   with the externally attested Ed25519 public key (Host-provisioned only).
2. Capture + verify a trace (`captureOpt002Trace` / `verifyOpt002Trace`).
3. `admitOpt002Validator({pin, validatorReceipt, evidenceGate, ...})` — the
   returned `validatorSlot` (`status:'ENDORSED'`, endorsement bound to
   validatorId + spki + verdict + runId) is the exact value to place into
   `receipt.validatorSlot`.
4. Only then may RESULT reuse authorization and Experience eligibility be
   re-assessed — by the Integrator/Owner with the business authority on
   record, never by this engineering layer.

## Reuse inventory (no re-implementation)

- `o2-controlled-execution-trace.mjs` (issuer/verifier chain, replay nonce)
- `o2-independent-validator-evidence.mjs` (two-key technical evidence gate)
- `o2-experience-gate.mjs` (`assessExperience`, unchanged)
- `native-fixture.mjs` + selected AOT build (real xDownload execution)
- Existing no-authority composition tests (`o2-o3-o4-no-authority-composition.test.mjs`)
  remain the authority model; this lane adds the OPT-002 requirement-specific
  structure on top.
