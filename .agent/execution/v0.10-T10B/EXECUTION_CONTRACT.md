# T10B: Explicit queryMany across Business scopes

Issue #1179; frozen v0.10 DAG; exact version base `a420807413c33f8dfb9cbc4c1f6628f8f47eb385`; task branch `task/v0.10-t10b-querymany` targets **v0.10**, never main. Optional P1—not prerequisite for T11/R01.

**Behavior:** additive explicit scoped multi-target queryMany, independently authorizing each requested B/target; results correlated per input; partial failures reported, no global transaction assumption.

**Forbidden:** No cross-B atomic transaction, global unscoped listing, first-match package lookup, principal derived from caller query fields, hidden-B existence oracle, K read before authorization. Frozen Product/L2/DAG, K01/K02 authoritative fence/receipt and C01 Effect permit must remain unchanged. One concern, one PR. Before source edit take accepted ADS serialized `DISPATCH_CLAIMED` self-declared builder claim; inspect exact current branch/head, present source and scope an exact file write set; do not treat this planning pack as a passing test or claim.

**Parallel integration:** T11 #1180 owns `examples/v010-clean-consumer/**` and clean-install integration fixtures; do not edit those paths. Avoid concurrent modifications to shared T11 surface; keep this task's P/N tests separately named. On merge into v0.10, refresh any still-running task branch and run focused seam regressions; R01 runs one integrated fixed-SHA closure. If this optional feature is unfinished at R01, do not block the P0 release; defer explicitly rather than half-merging unqualified code.
