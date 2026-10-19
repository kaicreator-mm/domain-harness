# T09: Recurring Meta Feedback Workflow

Issue #1178; frozen v0.10 DAG; exact version base `a420807413c33f8dfb9cbc4c1f6628f8f47eb385`; task branch `task/v0.10-t09-meta-feedback-workflow` targets **v0.10**, never main. Optional P1—not prerequisite for T11/R01.

**Behavior:** ordinary selected Business Workflow consuming durable Decision Evidence / Candidate / Shadow observations, creating proposal-only feedback.

**Forbidden:** No direct BUILD/deployment activation, auto-approval, package hot swap, live external Effect, independent Agent runtime or synthetic K permission. Frozen Product/L2/DAG, K01/K02 authoritative fence/receipt and C01 Effect permit must remain unchanged. One concern, one PR. Before source edit take accepted ADS serialized `DISPATCH_CLAIMED` self-declared builder claim; inspect exact current branch/head, present source and scope an exact file write set; do not treat this planning pack as a passing test or claim.

**Parallel integration:** T11 #1180 owns `examples/v010-clean-consumer/**` and clean-install integration fixtures; do not edit those paths. Avoid concurrent modifications to shared T11 surface; keep this task's P/N tests separately named. On merge into v0.10, refresh any still-running task branch and run focused seam regressions; R01 runs one integrated fixed-SHA closure. If this optional feature is unfinished at R01, do not block the P0 release; defer explicitly rather than half-merging unqualified code.
