# T06 Decision Evidence – bounded Execution Contract
Dependency T02 #1169 DONE, PR #1188 merged into v0.10 as 2dc56e9b3690e8aad6934a66b6748f8d41b7fe3e. Parent #1163 frozen DAG + issue #1173. PR target v0.10, not main.
A: model immutable typed DecisionTrace from actual selected Rule/reuse/procedure/Model/Tool resolver outcome. Distinguish denied vs admitted and unknown; do not invent K admission, effect or Model usage.
B: record ObservedDependencySet with exact selected schema/revision/provenance, actual tool/model call and measured/unmeasured status, bounded number and byte size.
C: optional observation persistence adapter (Host-approved write) MUST NOT veto K original receipt, must not change K State/Journal/Fence/Effects. Persistence failure surfaces in evidence status with no fictional durable write; preserve primary result.
D: P/N tests covering 0 model calls under Rule/reuse, unmeasured honest, provenance mismatch, denied/admitted, forbidden effect metadata, optional persistence reject, and no prod K mutation.
Selected Standard feature/host-neutral, separate from C01/T03/T10 writer. Source-only Web slice first; Node24 focus and CI before closure. Single Task PR and no repeated version full regression.


## Current implementation and truth boundary (2026-10-19)
The isolated WEB slice PR #1190 creates a pure, selected S trace *normalizer* with 10 focused P/N test cases. **Caller-supplied resolver output/dependencies cannot attest actual Model calls or an actual K receipt.** It deliberately returns `kernelOutcome:unobserved`, `modelCallStatus:unverified` and `reportedModelCalls` separately until a Host-owned trusted capture is actually wired to selected K+T02. The optional callback return is `callback-reported-success`, not durable storage attestation; the callback is bounded and unknown-timeout is honest.

**Required remaining terminal slice:** bind an actual closed Host observer to selected K02 receipt/disposition and selected S T02 execution, record a truthful admitted/denied/unknown outcome and measured/unmeasured model/tool counts without accepting claimant-controlled `deps.verifiedKernelOutcome` or claimed principals. Optional physical observation storage failure must not veto the K receipt or grant Tool effects. Enforce authorization before observation. Add positive/negative tests. Current C01 Builder has claimed `v10build/activation.ts`; do not edit this shared file until C01 releases it, or explicitly coordinate serial write. Only existing new module/tests are currently owned by T06 Web.
