# B02-01 / R35 — Selected Business/Capability vs Target applicability

**State CI_PENDING**. Exact parent baseline `8ad01592e6f3d4ccc533be12b170a957e0da99ab`, Woodpecker #2277/1–3 SUCCESS.

Real selected BUILD source is the original pinned Tally Business `54015fb...` and xDownload Business `a7dba9...`; SDK binds their selected source IDs and KDP route. Native tests reject altered module bytes, domain-repository cross-binding and unsupported `program.target` injection before boot. They also load the actual selected KDP to produce a Tally UNKNOWN observation (not an Effect).

**Important limitation:** the native DIS v0.2 Draft program has no Target selection field/registry. Passing a Node execution cannot demonstrate multiple supported Windows/Linux/Android package variants. CORE-008 remains PARTIAL until Product/L1 defines applicable targets and selection identity, or explicitly narrows the profile. No physical Host or LLM code execution. [Round JSON](round.json) and independent CI receipt added after exact result.


## Exact-source qualification (independent round receipt)

**VERIFIED at the final cumulative native requalification SHA `1a803ac452348dc73afea1483a9283cfe527abfc`** / TREE `8a478066e61e304c77b9515ee6e92712734b61f4`. The original round was independently committed at `2181072c1a5101366b90ec8aa2c65dde9c571b15` and its Git test Blob remains unchanged. [Woodpecker #2280/1 native](https://ci.kaicreator.com/repos/18/pipeline/2280/1) **SUCCESS**, [#2280/2 compatibility](https://ci.kaicreator.com/repos/18/pipeline/2280/2) **SUCCESS**, [#2280/3 verify](https://ci.kaicreator.com/repos/18/pipeline/2280/3) **SUCCESS**. [Independent receipt](../../../../receipts/r35-b02-selected-target-ci.json) and [machine round record](round.json).

Original separate [#2278/1](https://ci.kaicreator.com/repos/18/pipeline/2278/1) returned **ERROR** and remains historical, not a retroactive PASS for that old SHA. The unchanged round test Blob was re-executed within the #2280 full suite.

**Scope is bounded:** Target-OS package variants and deployed Chat/Form/CLI transports are not independently validated; no KDP Effect permit or semantic Oracle is inferred. Core 008 and 014 remain PARTIAL; do not promote other requirements or freeze.
