# full-opt001-r0 — real AOT-selected bounded DeepSeek Provider (R211 Lane O1)

DIS 0.2.0 Full Conformance R211, requirement **DIS020-OPT-001** (matrix row
currently PARTIAL: prior evidence was fixture-only). This directory adds the
missing aspect: a **real** bounded LLM Provider call chain on the selected
DIS v0.2 AOT, plus executable bounded-behavior and fail-closed negatives.
Issue: kaicreator-mm/domain-harness#1547 (DAG #1544, parent Draft PR #1497).

## What is real vs structural vs fixture-injected

- **REAL (live suite, `opt001-live-provider.test.mjs`)**: the selected
  Function `xdownload.describePolicy` is invoked through the real
  byte-pinned AOT/SDK (`loadDisV020Aot` over the canonical cross-project
  BUILD), and the bounded Provider performs **actual HTTPS calls to
  `https://api.deepseek.com/chat/completions`** with the `DEEPSEEK_API_KEY`
  credential read from the environment (reference `env:DEEPSEEK_API_KEY`,
  never a value in any file). Real positive advisory, real 401 (wrong
  credential), real 1ms-deadline abort, real cancel abort. Verified locally
  (shell env) and expected to run in Woodpecker via the repo secret
  (`.woodpecker/dis-v020-full-opt001-r0.yaml`, step `opt001-live-provider`).
- **STRUCTURAL (contract suite, `opt001-bounded-contract.test.mjs`, no
  network)**: binding pinning/immutability, hot-swap rejection, budget
  reservation, truncation marking, concurrency queue/overflow, deadline and
  cancel machinery, credential fail-closed admission, hostile-output
  defense — all executed against the real AOT harness with **test-only
  injected `fetchImpl`**.
- **FIXTURE-INJECTED DEFENSE (part of the contract suite)**: hostile model
  outputs (`GRANT_PERMISSION`, pseudo `{"status":"PASS",...}` receipts) are
  injected via the test transport to prove the consumer ignores them and no
  Effect/permission/state fact is minted. This is defense testing, not a
  model-behavior claim.

## Invariants (asserted on every path)

- AOT-selected binding: deep-frozen manifest pinned to the exact artifact
  digest, target Function/contract version, source provenance
  (`xdownload-business` git blob), pinned endpoint/model; unknown
  constructor keys, forged manifests and runtime `replaceBinding` are
  rejected (`OPT001_HOT_SWAP_REJECTED`).
- Credential: reference-only in the manifest; absent → explicit
  `OPT001_NO_CREDENTIAL` (loud red in CI when the secret is missing, never
  a silent skip); malformed → `OPT001_CREDENTIAL_INVALID`; invalid key →
  HTTP 401/403 mapped to `CREDENTIAL_REJECTED` without body leakage; the
  credential never appears in any outcome, trace, error or manifest.
- Bounded invocation: per-request `max_tokens` + total request budget
  (reserved before await — concurrent calls cannot overspend) with explicit
  `BUDGET_EXHAUSTED`; per-call deadline (AbortController) with explicit
  `TIMEOUT`; `cancelAll` yields clean `CANCELED` (in-flight and queued);
  concurrency cap with bounded FIFO queue, overflow `CONCURRENCY_REJECTED`;
  over-bound model text is hard-capped at 160 chars with an explicit
  `truncated` flag.
- Model output is DATA ONLY: every outcome (success included) carries
  hardcoded `disposition:'UNKNOWN'`, `authority:'NONE'`,
  `effectDispatched:false`, `qualified:false`, `dataOnly:true`. Directive
  markers found in model text are recorded as `ignoredDirectives` and never
  interpreted. The O1 harness (`../o1-bounded-harness.mjs`) consumes only a
  single-line advisory suggestion and labels it
  `MODEL_PROPOSAL_NOT_DOMAIN_TRUTH`.

No qualification/Effect/Release/Experience is minted anywhere. Matrix row
promotion is decided by the central Integrator, not this lane.

## Files

- `opt001-aot-bounded-provider.mjs` — binding factory, credential resolver,
  bounded Provider (real transport by default, test-only injection).
- `opt001-bounded-contract.test.mjs` — 16 structural/negative tests (offline).
- `opt001-live-provider.test.mjs` — 5 live tests (real DeepSeek; missing
  key → explicit red).
- `../..`+`.woodpecker/dis-v020-full-opt001-r0.yaml` — CI: contract step
  (always) + live step (repo secret `DEEPSEEK_API_KEY`).

## Run

```bash
node --import tsx --test examples/dis-v020-native-sdk/full-opt001-r0/opt001-bounded-contract.test.mjs
DEEPSEEK_API_KEY=... node --import tsx --test examples/dis-v020-native-sdk/full-opt001-r0/opt001-live-provider.test.mjs
```
