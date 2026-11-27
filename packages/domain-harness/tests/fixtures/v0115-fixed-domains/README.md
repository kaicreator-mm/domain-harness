# Fixed D-A / D-B qualification witness

Frozen public data: R23 public HEAD `cc1c53f6dcef436555eb9757990c9c029d824359`, domains.json SHA256 `1d79d98fe8f6f90a95413c2eb0e2edab63be557ea459c13d375dec8f985aaacf`. The byte-identical public fixture is read and checked at execution. No evaluator-only material.

From monorepo root, after build:

```sh
DH_WITNESS_PYTHON=/absolute/path/to/python node --import tsx --test packages/domain-harness/tests/fixtures/v0115-fixed-domains/witness.test.ts
```

Python requires SciPy 1.17.0, as selected in G01-S; the ordinary SDK unit test suite does not require Python. The adapter uses actual MILP and waits for child-process close. The two domain definitions instantiate an actual fixed XState machine and also execute via native TS control flow; neither performs purchases or dispatches. The public objective predicates and business constraints are checked separately from returned solver status. This is a source-tree scoped witness, not installed SDK qualification, independent holdout acceptance, or a full O01–O12 pass. Further model-decision, dynamic, Interaction, Host and cumulative accounting cases remain in their assigned DAG tasks.

### D-C managed Host witness

`host-witness.test.ts` reuses the actual independent loopback Host and SQLite authority, plus the domain-owned managed reservation example. Run with the existing compiled SDK on Node >=22.12.0. The controlled synthetic resources start at stock5/version0 for the new managed cases. The proxy holds or drops ACKs at the actual HTTP boundary; independent SQL readback verifies stock/version/effect counts and command receipts. The managed root owns actual invocation and terminal readback; late stale results never substitute for accepted business results. The conflicting-UNKNOWN guard is deliberately domain-specific and instance-scoped (bounded unresolved resources), not a new SDK service or durable cross-process lock; separate Host processes enforce actual CAS. No live production inventory or complete hidden product oracle is claimed.
