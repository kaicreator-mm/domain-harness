# R01 R2 Kernel witness repair #1207

Base: 7cbfaf5ab8e21a0e2ff0e98625694132d7d21bb4; target version branch v0.10, not main. ADS 4.13.1.
Tests: four exact-Git-blob witnesses re-pinned to current selected kernel db7a8f16de2b26d2fdb10e6ca7f8e90b3f1daf30 (prior 1a6a1394a505f4727306208d588fcab841e72980), direct-engine R02-b canonical turnIdentity with read-only fence revision, real K02 CB-R1 two-live-process one original State/receipt/Effect+changed input conflict. Frozen old baseline provenance remains in comments.
Contract: K01 live holder retains exact fence revision; a second identical claimant cannot displace it and cannot dispatch duplicate non-idempotent effect. Old test expecting original holder CAS failure is no longer valid.
Implementation: tests only, no Kernel/Effect/receipt ABI/source modification.
Failure handling: targeted Node24 + file SQLite tests first; build/lint/typecheck, npm test, CI exact HEAD; if new code bugs surface do not weaken assertions. T11 occasional missing outcome tracked separately, not falsely marked PASS. R01/Hidden must rerun at any new version SHA.
