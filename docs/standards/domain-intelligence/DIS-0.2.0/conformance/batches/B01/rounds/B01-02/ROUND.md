# B01-02 / R33 — Stateful Domain ownership and non-authority

**Round state: CI_PENDING**; independently versioned from B01-01 (R32). The initial R32 source `af2ebeaaa66c9701a82dd063b6b1d6816a3049a8` remains on its own immutable CI.

This round tests the **real, source-pinned Runx `EnvironmentAgentPresence`** through the native KDP SDK, not an invented JS object or mock Host. The original Runx source is pinned in `native-fixture.mjs`. The same App invokes original Tally Rule and xDownload Knowledge Functions to confirm state isolation and typed `UNKNOWN`/ `OBSERVED` remain non-authoritative.

**Positive tests:** two separately invoked Stateful handles own separate in-memory presence tables, source identity is Runx, PROCESS_LOCAL handle metadata verified, Tally Rule / xDownload Knowledge unchanged after a Runx observation.

**Adversarial tests:** agent ID/token mismatch leaves the presence table empty; no `execution_authorized`/lease ID is minted; after SDK `stop()`, future Function and Effect ingress fails closed.

**Important negative limitation:** Existing returned in-process handles can still be used by the trusted caller after SDK `stop()`. This experiment does **not** prove external process isolation, global revocation, lease rights or persisted Domain-owned state. It is intentionally not given a new KDP permit.

Actual R33 exact HEAD and CI will be recorded in `round.json` and a separate Git receipt only after actual execution; **CORE-006 remains PARTIAL** pending full Domain state ownership and evidence scope.
