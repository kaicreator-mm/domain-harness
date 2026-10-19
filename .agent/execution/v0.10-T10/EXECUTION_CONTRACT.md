# T10 selected Multi-B authorized query
Issue #1176; frozen DAG #1163@6252973905; T00 #1166 and K02 #1168 CLOSED. This pack is PREPLANNING only and not a Builder claim: T02 #1169 PR #1188 still owns the v10build/activation.ts facade write set. Never edit that file concurrently. Work on file-disjoint query contract/tests until T02 releases or merges; JIT re-read current v0.10 and pin exact branch SHA before Builder Claim.
A: declare explicit target tuple [deployedAppId, tenantId, appId, businessPackageId, workflowId, instanceKey] and verified principal capability; never infer B by first-match intent.
B: authorize target prior to reading K snapshots/receipts/journals or enumerating candidate target, in selected K02 physical scope.
C: unscoped selectors may enumerate only authorized-visible B candidates, typed AMBIGUOUS iff >1 *visible* B; hidden B presence must not change response.
D: run actual 2-B same-workflow/same-instance-key Node24 SQLite P/N for scoped disjointness, hidden B oracle, concurrent reader, restart and no side-effects.
One concern PR to v0.10; review required, configured CI and physical test; do not add generic SQL/query cross-target bypass or leak.
