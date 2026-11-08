# B01-02 / R33 — Stateful Domain ownership and non-authority

**Round state: CI_PENDING**; independently versioned from B01-01 (R32). The initial R32 source `af2ebeaaa66c9701a82dd063b6b1d6816a3049a8` remains on its own immutable CI.

This round tests the **real, source-pinned Runx `EnvironmentAgentPresence`** through the native KDP SDK, not an invented JS object or mock Host. The original Runx source is pinned in `native-fixture.mjs`. The same App invokes original Tally Rule and xDownload Knowledge Functions to confirm state isolation and typed `UNKNOWN`/ `OBSERVED` remain non-authoritative.

**Positive tests:** two separately invoked Stateful handles own separate in-memory presence tables, source identity is Runx, PROCESS_LOCAL handle metadata verified, Tally Rule / xDownload Knowledge unchanged after a Runx observation.

**Adversarial tests:** agent ID/token mismatch leaves the presence table empty; no `execution_authorized`/lease ID is minted; after SDK `stop()`, future Function and Effect ingress fails closed.

**Important negative limitation:** Existing returned in-process handles can still be used by the trusted caller after SDK `stop()`. This experiment does **not** prove external process isolation, global revocation, lease rights or persisted Domain-owned state. It is intentionally not given a new KDP permit.

Actual R33 exact HEAD and CI will be recorded in `round.json` and a separate Git receipt only after actual execution; **CORE-006 remains PARTIAL** pending full Domain state ownership and evidence scope.


## Same-writer R33 repair

At the immutable R33 first source `0a404d343827d95ee6c08d962a369dc44c52f98b`, [Woodpecker #2274/1](https://ci.kaicreator.com/repos/18/pipeline/2274/1) returned **FAILURE**. Independently inspecting the original selected xDownload policy implementation revealed that its `getPolicy()` creates new `decisionSchema.isValid` and Effect handler callback functions each time. Comparing the **whole policy object** with `assert.deepEqual` thus tested those new callback identities rather than the stable Domain Knowledge outcome. The R33 same-writer repair compares the stable package, policy, domain, workflow and intent fields and separately `effectBindings['effect:acquire'].semantics`, without invoking the non-idempotent handler. This is a source-level plausible root cause, **not** a quoted CI log; actual repair SHA and new CI must independently qualify.

Original failed SHA preserved in Git; no retroactive PASS.


## Final exact-SHA qualification (supersedes initial CI_PENDING)

**VERIFIED — R33 Domain Stateful ownership**. Its own originally committed tests, immutable source Git blob, positive/negative cases and findings remain attached to original round SHA `0a404d343827d95ee6c08d962a369dc44c52f98b`. After the R33 source-specific test repair, the complete three-round native suite was qualified at **`0e0d9ad8b227ed1f1ef90af648e423cd43214563`** / TREE `707a0b11b9a8691b7dc7efad7c5d91d3e735edda` with [Woodpecker #2276/1](https://ci.kaicreator.com/repos/18/pipeline/2276/1) native Integration **SUCCESS**, [#2276/2](https://ci.kaicreator.com/repos/18/pipeline/2276/2) minimum-node compatibility **SUCCESS**, and [#2276/3](https://ci.kaicreator.com/repos/18/pipeline/2276/3) general Verify **SUCCESS**. This requalifies the actual committed round test Blob, rather than falsifying the original earlier pipeline.

[Independent round receipt](../../../../receipts/r33-b01-state-ci.json) / [round.json](round.json) preserve the exact linked source, original SHA and qualifying CI. R33 original native CI FAILURE and repaired callback-identity test remain traceable. Core 003 and 006 remain **PARTIAL** because the source-limited technical tests do not prove all normative ABI/state/Oracle obligations. No merged/frozen/released claims.
