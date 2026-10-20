# R01 C01 PH-R1 outcome mapping #1211

Base `2752943b1d656b7a1e447efd10c1118dc39ff0f6`; target v0.10 only. ADS v4.13.1.

## Tests
Node24 real file SQLite `tests/hosts/node/v010-c01-external-effect-physical.test.ts` PH-R1 three **consecutive** standalone runs on clean process + existing K01/K02/C01 targeted physical checks. Gather full child outcome, K job-dispatch log, job table, effect-journal and original receipt. Full R01 gate is separate.

## Contract
A non-throwing Kernel `UNKNOWN`/typed refusal must not be a successful admitted child; its code is carried verbatim into the child's failure outcome. Only a genuine `status==='admitted'` receipt is a winner. If an admitted receipt lacks expected effectId, leave the existing assertion FAIL — do not fabricate effect or turn the receipt into an invented rejection. Provider exactly-once and original commit assertions unchanged.

## Implementation
ONLY `tests/hosts/node/v010-c01-child.mjs` test-worker mapping. No Kernel, Effect, receipt runtime, storage, public packages, main or frozen L2 changes.

## Failure Handling
If the after-change child gets `UNKNOWN` without `receipt.code`, or an admitted replay with missing effect, the PH-R1 test must remain FAIL with the real report and prompt a separate actual production fix. Do not waive tests or accept any 3/5; need 3 consecutive PASS and exact-head CI+independent review. Re-pin final R01/Hidden after final version integration.
