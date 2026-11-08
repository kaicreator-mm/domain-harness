# Batch B01 — C2 Function/Domain state validation

**Status:** VERIFIED (three scoped rounds, not full DIS Core qualification). [Machine-readable batch manifest](manifest.json) is the authoritative queue. Per-round evidence directories are created upon actual execution, **not in advance**. Batch scope: CORE-003 and CORE-006; no premature Core promotion.

| Stable batch round | Goal | Independent evidence gate |
| --- | --- | --- |
| B01-01 | Source-grounded Function I/O Schema, typed outcomes and Evidence | Native positive+adversarial tests + exact HEAD/TREE/CI + receipt |
| B01-02 | Domain-owned Knowledge/Rule/Stateful lifecycle | Selected source, actual KDP/SDK instance and negative state/Effect boundary + receipt |
| B01-03 | Compatibility and C2 regression/closure | Prior two scopes source-qualified, full native CI plus fail-closed ABI tests + receipt |

Starting PR HEAD snapshot: `4d3e52bc1a14a7c6d1557fd0589f8de3afe600c8`; R30 Woodpecker #2271/1, /2, /3 **SUCCESS** for this immutable pre-policy reference. Later HEADs must be rebound. Each actual round's `ROUND.md` and `round.json` are committed separately along with its executable tests and CI record, not saved only at batch conclusion.

Do not spin up additional Issue/Task DAG. The same writer repairs the chosen write set; independent audit only when evidence requires it. Disjoint prework may be parallel, overlapping source commits must be serial with HEAD refresh.

**Batch-level closure:** `BATCH_SUMMARY.md` added only after round-by-round outcomes are known. An external semantic approval is never assumed. If a remaining normative obligation needs a separate reviewer or Product/L1 decision, record it as **BLOCKED**, retain its source-pinned Unknown outcome, and move to a non-overlapping approved scope rather than endlessly looping on scripts.


**Closure:** [B01 final summary](BATCH_SUMMARY.md) and all three [source-pinned round receipts](../../receipts/r32-b01-function-ci.json), 3/3 SUCCESS on #2276 replay; previous errors recorded. Core still 9/16.
