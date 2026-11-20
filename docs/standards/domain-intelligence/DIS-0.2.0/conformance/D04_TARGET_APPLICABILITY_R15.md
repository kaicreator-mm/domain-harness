# DIS v0.2.0 — D04 selected Target / native AOT applicability check (R15 candidate)

**Authority:** Product/L1 #1496; version Demo master #1499; Draft PR #1497. This is a source/CI scope check, not an Owner decision or CI receipt.

## Falsifiable questions and actual observations

| Question | Source/positive | Negative/UNKNOWN | Observed limit |
| --- | --- | --- | --- |
| Is a selected real BUILD + KDP + SDK Function and resource closure consumed? | R9.5 #2223/1 at exact source SHA, R10 #2229/1; existing original Tally/xDownload source and actual SQLite KDP Journal | modified source Blob, unselected route/handler, Effect/Init crossing rejected in native tests | narrow selected-build pass; not proof of all OS/architecture Targets |
| Are distinct target-specific Package variants selected and verified natively? | No second independently pinned Target build/CI receipt in current D04 conformance index | cannot infer Windows/Android correctness from default Woodpecker Node environment | PARTIAL — Product/L1 has not designated the applicable Target set |
| Can AOT metadata alone authorize a selected native Host Effect? | existing installed digest + real KDP authorization, C01, cross-process Journal | fake target/package/provider and stale Journal must fail closed | AOT-selected routes never replace independent KDP authority |

## Minimal further matrix (conditional on #1496 scope decision)

- **Current selected demo BUILD**: already exercised historically; cross-SHA CI does not roll forward automatically.
- **Windows**: NOT PROVEN for DIS v0.2 selected target-specific native package, even if generic Node tests pass on Windows elsewhere.
- **Linux**: NOT PROVEN as a *separately qualified* Target variant; Woodpecker status alone does not identify a formally selected Linux-target closure.
- **Android**: NOT PROVEN; no Android native package/Host integration receipts.

**Stop condition:** enumerate only the applicable Product/L1 Targets, construct real distinct AOT-selected packages for those Targets and reject target mismatch, then record per-target exact-SHA native positive/negative CI or authorized Host receipts. Other Targets need an explicit scope decision, not silent exclusion. No new Task DAG or gratuitous OS sandbox.
