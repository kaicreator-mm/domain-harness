# B02-01 / R35 — Selected Business/Capability vs Target applicability

**State CI_PENDING**. Exact parent baseline `8ad01592e6f3d4ccc533be12b170a957e0da99ab`, Woodpecker #2277/1–3 SUCCESS.

Real selected BUILD source is the original pinned Tally Business `54015fb...` and xDownload Business `a7dba9...`; SDK binds their selected source IDs and KDP route. Native tests reject altered module bytes, domain-repository cross-binding and unsupported `program.target` injection before boot. They also load the actual selected KDP to produce a Tally UNKNOWN observation (not an Effect).

**Important limitation:** the native DIS v0.2 Draft program has no Target selection field/registry. Passing a Node execution cannot demonstrate multiple supported Windows/Linux/Android package variants. CORE-008 remains PARTIAL until Product/L1 defines applicable targets and selection identity, or explicitly narrows the profile. No physical Host or LLM code execution. [Round JSON](round.json) and independent CI receipt added after exact result.
