# v0.10.2 Tiny / Rich setup guide — PREPARATION DRAFT

**NOT RUN / NOT RELEASED.** T08b #1329 pre-T07b source-only guide. No final public API function names, commands or install success are asserted.

## Tiny — runtime-only composition

Tiny must install selected Contracts, Microkernel, K Basic Primary, S Basic Primary, selected Business and Capability modules only. The external BUILD producer is a **separate** packaging/build process: the Tiny runtime closure must exclude BUILD, legacy Compiler, Host-node/SQLite and unselected S features. The App is immutable BUILD output passed to runtime; no on-device compilation/selection.

Acceptance at T09: create a clean consumer root; install only exact local tarball artifacts at pinned SHA; run selected send/query and message replay/conflict; inspect actual node_modules and npm tarball inventories for forbidden packages; deep-import negative must fail. After T06b, Tiny runs governed subscribe/stop and verifies redacted event + async stop behavior. No result is claimed here.

## Rich — explicit optional Host capabilities

Rich adds Host-node only where the selected workload needs real SQLite CAS, durable memory, shadow/meta/evidence or CT-02. The peer better-sqlite3 is optional at package install and required only at actual physical SQLite activation. The Host supplies physical CAS and currentness, not K State/Admission/Effect policy. Selected packages may contain multiple Business modules, but each scoped query independently checks Host-authenticated authority.

Acceptance at T03b/T09: actual SQLite file, WAL/transaction CAS with conflicting writers, close/restart and same-revision snapshot; typed refusal when optional driver is absent; no forged grant, unauthorized Business or stale K attempt; no unbounded spill of secrets into observer events.

## External producer separation

A producer builds and seals K/S/B/C closure outside the Tiny/Rich process. Treat target name node24-esm/1 as sealed ABI data. Node24 is the single real physical execution profile for this release; newer majors are not forbidden by semver but untested. Negative tests must reject undeclared import/effect authority and deep private entrypoints.

## Finalization checklist

- Confirm exact final npm exports and commands after T07b, not earlier.
- Confirm real emitted package types / dist from a clean Node24 install.
- Link T04 selected BUILD→runtime positive, T03b SQLite physical, T06b subscription negatives, T11 old producer deletion and T09 Tiny/Rich traces.
- Do not claim PR CI success as installed consumer or Release PASS.
