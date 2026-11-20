# B01 final — 3 independently versioned rounds, exact-source replay-qualified

**Status:** B01 scoped rounds **3/3 VERIFIED**. DIS v0.2.0 Core remains **9/16 VERIFIED (56.25%) / 7 PARTIAL**, Optional 4 NOT_RUN, Governance 1 NOT_RUN. B01 validation is not a DIS final conformance or Product/L1 Freeze.

## Each round owns its own immutable original Git scope

| Round | First standalone test/round commit | Final source test Blob | Qualification and scope |
| --- | --- | --- | --- |
| [B01-01 / R32](rounds/B01-01/ROUND.md) | [`af2ebeaaa`](https://github.com/kaicreator-mm/domain-harness/commit/af2ebeaaa66c9701a82dd063b6b1d6816a3049a8) | `da74e6d1318f4746da6bc41779b2f591f3b9749a` | real Tally Rule, xDownload Knowledge/Interaction and Orders KDP typed Function contract / Evidence |
| [B01-02 / R33](rounds/B01-02/ROUND.md) | [`0a404d343`](https://github.com/kaicreator-mm/domain-harness/commit/0a404d343827d95ee6c08d962a369dc44c52f98b) | `a460d8a199d735545b3ebb5e1c7c11588d683675` | Runx true source-selected Stateful PROCESS_LOCAL owner, token mismatch, isolation, stop() ingress |
| [B01-03 / R34](rounds/B01-03/ROUND.md) | [`175851591`](https://github.com/kaicreator-mm/domain-harness/commit/175851591eacbc2c5ca2d391e18f1e9adcdd34ba) | `f12549c3edc2f5f79895bcafcd7a402b23959249` | same-major public Function/Element ABI and independent installer old-AOT rejection |

All three were requalified on the **actual final repaired-source full-suite** [`0e0d9ad8b227ed1f1ef90af648e423cd43214563`](https://github.com/kaicreator-mm/domain-harness/commit/0e0d9ad8b227ed1f1ef90af648e423cd43214563) / TREE `707a0b11b9a8691b7dc7efad7c5d91d3e735edda`:

- [Woodpecker #2276/1 DIS native Integration](https://ci.kaicreator.com/repos/18/pipeline/2276/1): **SUCCESS**
- [#2276/2 minimum-node](https://ci.kaicreator.com/repos/18/pipeline/2276/2): **SUCCESS**
- [#2276/3 general verification](https://ci.kaicreator.com/repos/18/pipeline/2276/3): **SUCCESS**

Each round has **its own** `round.json`, `ROUND.md`, original immutable test commit and source Git Blob, plus Git receipts `r32-b01-function-ci.json`, `r33-b01-state-ci.json`, `r34-b01-abi-ci.json` linked by the machine `matrix.json`. A shared final CI suite is **not** evidence that every earlier uncorrected SHA passed: immutable historical CI is preserved.

## Failure → repair → learning

- R32 source [#2273/1](https://ci.kaicreator.com/repos/18/pipeline/2273/1) native **SUCCESS**, but #2273/2 returned **ERROR** and original general Verify remained PENDING at earlier readback. Final replay #2276/1–3 gives exact 3/3 evidence for the **same original R32 test Blob**, without rewriting history.
- R33 original [#2274/1](https://ci.kaicreator.com/repos/18/pipeline/2274/1) native **FAILURE**. Original xDownload `getPolicy()` re-creates callback/function identities each call. A naïve deep equality check on the whole policy object falsely judged the independently re-created callback identity as state drift. The same Writer repaired R33 to compare actual stable business policy data and separately source-owned Effect semantics at [`0e0d9ad8`](https://github.com/kaicreator-mm/domain-harness/commit/0e0d9ad8b227ed1f1ef90af648e423cd43214563). This is source-derived root-cause analysis; exact failed CI step logs were not available, so do not assert this was the only failure.
- R34 original [#2275/1](https://ci.kaicreator.com/repos/18/pipeline/2275/1) native **FAILURE** with the earlier R33 test still in the cumulative suite. R34 own test Git Blob was not changed and replayed at #2276/1–3 **SUCCESS**.

## Semantics of proof and remaining Core obligations

The real native selected Function typing, 12 additional positive+adversarial cases (4 per round), PROCESS_LOCAL Runx instance maps, typed KDP admission, same-major structural compatibility, and old AOT/source refusal are demonstrated. They do **not** prove independent EvidenceRef authentication, accepted SAP/semantic Oracle, complete global cross-Package Function registry, durable business state, remoting/revocation of previously returned process-local handles, or full Function category coverage.

**CORE-003 and CORE-006 remain PARTIAL**, not VERIFIED. C1 remains blocked on original Tally GH 16:24→23:03 source locator repair and independent SAP semantic qualification. C3 Target/Interaction requires Product/L1 applicability. C4 full matrix and C5 independent freeze review follow the dependency DAG. The previous estimate remains about **5–8 further closing rounds** for Core + governance (and **2–4 additional** if all Optional Profiles are in scope), conditional on owner/source decisions.

This batch is completed as a **bounded Demo proof**, not a product Release. No merge, Freeze, publication, new Issue/DAG or special Node major semantic gate.
