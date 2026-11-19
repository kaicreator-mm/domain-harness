# full-host-admission-r0 — ONE selected trusted Rule/Host admission (DIE #4 R209 / #1527 Phase B)

Closes the #1527 Phase B admission `ONE_SELECTED_TRUSTED_RULE_HOST_ADMISSION` for the
selected Function `dke.ev16.d02.vv.r188.observe` under the #1527 R209 owner grant
(comment 7007585312). One same call:

SAP/ECP(owner-attested) → real `compileDisV020Aot`/`loadDisV020Aot` SDK → installed
Rule bytes/digest → pinned issuer trust root → tenant/deployment/scope → durable
nonce fence → **Ed25519-signed Host receipt** (durable, replay-denied).

## Trust model — owner-attested, structural

Single-owner ecosystem: the project+Host owner exercised all four R206 blocker rows
(source rightsholder, installer-operator, tenant/deployment operator, Host key
custody). Issuer and Host Ed25519 keys were generated **outside the repository**
(`run-live-same-call.mjs gen-keys`); only public SPKI halves, fingerprints, the
signed installer grant and live receipts are committed here. Independence is
**structural** (separate key material, separate code path, caller never holds
issuer/Host private keys), not inter-personal. Receipts must not claim third-party
independence.

## Files

- `full-host-admission.mjs` — trust-registry loader (pinned roots), pinned-root
  installer-grant verifier, unsigned admission-chain verifier, signed same-call
  Host, Host-receipt verifier. The trust root is the committed registry — a
  receipt-supplied SPKI is never trusted (`o2-installed-rule-trust-preflight.mjs`
  stays untouched and still hard-stops untrusted receipts).
- `run-live-same-call.mjs` — provisioning + live same-call driver. NEVER runs in
  CI; owner key files stay outside the repo.
- `trust/registry-r209.json`, `trust/issuer-r209.spki.b64u`, `trust/host-r209.spki.b64u`,
  `trust/installer-grant-r209.json` — committed public trust artifacts.
- `receipts/live-same-call-r209.json`, `receipts/live-restart-replay-r209.json` —
  durable live evidence (real same-call receipt; fresh-process replay denial).
- `full-host-admission-r0.test.mjs` — the gate. Re-derives AOT/SDK/rule digests
  from exact HEAD bytes, cryptographically verifies the committed grant and live
  receipt against pinned keys, and runs the adversarial negatives (forged issuer,
  tampered bytes, registry drift, replay, revocation, expiry, missing SAP/ECP
  fail-closed, cross-process restart denial).

## Honesty boundaries

- The selected Function stays `OBSERVATION` / `UNKNOWN` / authority `NONE`;
  `claimAttested` and `effectDispatched` stay false everywhere.
- No conformance promotion: DIS matrix stays 13/21; CORE-002/005/016, Optional,
  GOV untouched; no SAP/Effect/L2/Release promotion; Draft #1497 not affected
  beyond this write set.
- R50 historical Host bytes are untouched; this is a new versioned module.
- The committed grant/registry pins bind this exact tree (AOT digest, reader
  bytes, SDK module bytes). Any later change to those files invalidates the pins
  fail-closed and requires re-provisioning under a new record (expected behavior).
- Grant validity is 180 days; after expiry the pinned-root freshness check denies
  (fail-closed) until re-provisioned.
