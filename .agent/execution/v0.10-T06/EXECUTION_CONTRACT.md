# T06 Decision Evidence – bounded Execution Contract
Dependency T02 #1169 DONE, PR #1188 merged into v0.10 as 2dc56e9b3690e8aad6934a66b6748f8d41b7fe3e. Parent #1163 frozen DAG + issue #1173. PR target v0.10, not main.
A: model immutable typed DecisionTrace from actual selected Rule/reuse/procedure/Model/Tool resolver outcome. Distinguish denied vs admitted and unknown; do not invent K admission, effect or Model usage.
B: record ObservedDependencySet with exact selected schema/revision/provenance, actual tool/model call and measured/unmeasured status, bounded number and byte size.
C: optional observation persistence adapter (Host-approved write) MUST NOT veto K original receipt, must not change K State/Journal/Fence/Effects. Persistence failure surfaces in evidence status with no fictional durable write; preserve primary result.
D: P/N tests covering 0 model calls under Rule/reuse, unmeasured honest, provenance mismatch, denied/admitted, forbidden effect metadata, optional persistence reject, and no prod K mutation.
Selected Standard feature/host-neutral, separate from C01/T03/T10 writer. Source-only Web slice first; Node24 focus and CI before closure. Single Task PR and no repeated version full regression.
