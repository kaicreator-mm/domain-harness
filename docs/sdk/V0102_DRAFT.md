# DomainHarness v0.10.2 SDK ownership — T08b draft

**DRAFT / NOT QUALIFIED.** This is a pre-T07b planning aid, not final exports or verified installation commands. Task #1329, adopted A6 exact disjoint draft scope.

## Workspace / authority table

| Workspace | Responsibility | Forbidden authority |
| --- | --- | --- |
| @kaicreator/domain-harness-contracts | ABI/digests, plain shared types, errors | K policy, native storage, BUILD execution |
| @kaicreator/domain-harness-build | Offline selected K/S/B/C assembly, role/cardinality, import allowlist, sealed App, Acorn pin | Microkernel and Host runtime |
| @kaicreator/domain-harness-microkernel | Load trusted prebuilt App, lifecycle, facade delegation, K protocol consumption | BUILD/parser, Host-native SQLite, duplicate admission/journal/effect |
| @kaicreator/domain-harness-host-node | Optional Node CAS/SQLite, memory/durable controls and governed Host seams | K-owned business effect authorization, BUILD compilation |

K Primary and S Primary (plus selected extensions) are **Domain Packages**.
Only K Primary owns State, Admission, CAS/Fence, Journal, Effect, UNKNOWN and Replay. S Primary owns interpretation/dispatch. Microkernel loads/binds but does not duplicate their semantics.

## Producer → Runtime → business turn

1. A trusted external BUILD producer chooses exact selected modules and seals a plain-data App with exact subject identity. The legacy Compiler is temporary compatibility evidence, not the canonical new selected producer.
2. Microkernel/Host receive the built plain App through Contracts; neither package imports BUILD, even as a type. Runtime may not compile or dynamically select packages.
3. Selected K Primary controls send, idempotent original receipt, conflict and governed effect admission. Host stores physical bytes and applies CAS; it is not the K policy decision maker.
4. Scoped query receives only selectors. The Host-verified principal and grant are not public parameters. Each selected Business target must be independently authorized.
5. Planned subscription: process-local best-effort, deep-frozen {kind, occurrenceId, target, snapshot?}, never raw receipt fields. Post-await auth recheck, unsubscribe/stop and bounded queue remain T06b live acceptance, not a T06a pure-projection PASS.

## Public interface precautions

No source/deep dist imports, legacy Compiler/v10build exports or unpublished helper symbols are promised. T07b must lock actual public JS and TypeScript declaration names and tarball inventory before this document becomes final. Node engine minimum >=24.0.0 has no upper ceiling; Node24 is the only physically qualified selected runtime in this version, and node24-esm/1 is a BUILD target identity string rather than an exact Node major guard.

## Pending release evidence

- T04 Node24 selected BUILD producer → Contracts plain App → Microkernel/Host activation and negative import-direction test: NOT_RUN.
- T03b Node24 real SQLite CAS/restart/UNKNOWN and Host guarded invocation: NOT_RUN.
- T06b governed observation, N1–N7, asynchronous race and stop: NOT_RUN.
- T11 remove old Compiler selected imports; T07b installed legacy export/packlist negative and CI status migration: NOT_RUN.
- T09 installed Tiny/Rich + separate external producer, forbidden imports: NOT_RUN.
- R01 exact-source Full, Hidden, Critical Journeys and Release: NOT_RUN.

This draft is not a final API specification or a release qualification.
