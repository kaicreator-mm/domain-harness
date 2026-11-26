# Fixed D-A / D-B qualification witness

Frozen public data: R23 public HEAD `cc1c53f6dcef436555eb9757990c9c029d824359`, domains.json SHA256 `1d79d98fe8f6f90a95413c2eb0e2edab63be557ea459c13d375dec8f985aaacf`. The byte-identical public fixture is read and checked at execution. No evaluator-only material.

From monorepo root, after build:

```sh
DH_WITNESS_PYTHON=/absolute/path/to/python node --import tsx --test packages/domain-harness/tests/fixtures/v0115-fixed-domains/witness.test.ts
```

Python requires SciPy 1.17.0, as selected in G01-S; the ordinary SDK unit test suite does not require Python. The adapter uses actual MILP and waits for child-process close. The two domain definitions instantiate an actual fixed XState machine and also execute via native TS control flow; neither performs purchases or dispatches. The public objective predicates and business constraints are checked separately from returned solver status. This is a source-tree scoped witness, not installed SDK qualification, independent holdout acceptance, or a full O01–O12 pass. Further model-decision, dynamic, Interaction, Host and cumulative accounting cases remain in their assigned DAG tasks.
