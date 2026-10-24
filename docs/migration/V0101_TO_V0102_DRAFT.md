# v0.10.1 → v0.10.2 migration checklist — T08b draft

**SOURCE PREPARATION ONLY.** Actual public exports/commands must be reconciled after T07b, then verified in T09 on Node24. This file is not released documentation. The older draft MIGRATING_V0101_TO_V0102.md remains on this same unmerged T08b branch and is not an independent approved API.

## What changes for app authors

| v0.10.1 / legacy concern | v0.10.2 responsibility | What to do once T07b exports are frozen |
| --- | --- | --- |
| Monolithic Compiler v10build plus runtime activation | External canonical BUILD producer + independent Microkernel | Move build time off runtime; submit sealed plain-data App |
| Compiler copies of K/S payload modules | Independently owned K/S Domain Packages | Pin exact selected module bytes and ABI; no runtime recompilation |
| Compiler v10build TypeScript types and deep imports | Contracts package shared types | Import stable declarations from actual published Contracts exports |
| Host-v8 direct storage adapters | Host-node optional native adapters | Inject physical CAS only when required; keep K policy in K |
| Legacy direct scoped Business query | Microkernel/Host governed scoped query | Supply only selector fields; Host verifies caller/target |
| No governed observation public facade | Planned subscribe/stop (T06b) | Do not treat bare K receipts as subscriber events |
| Legacy public aliases and tracked dist | T11 deletion / T07b public export pruning | Do not rely on private Compiler/dist paths or stale npm files |

## Non-negotiable invariants

- One selected K Primary authority for Admission/CAS/Fence/Journal/Effect/Replay. No Host/Microkernel rewrite of K state transitions.
- Current messageId same input replays original receipt; conflicting duplicate must refuse, no second external effect.
- Builder cannot supply public grants/principal to query or force unselected Business target.
- BUILD validates sealed import edges and capability authority; runtime never imports BUILD (not even type-only).
- Tiny install must be free of Compiler/BUILD/Host SQLite closure. Rich Host selection is opt-in; better-sqlite3 is an optional peer.
- Node engine minimum >=24.0.0 without artificial upper bound. Only real Node24 is a qualified execution profile at this stage.

## Verified vs pending

Known source facts: independent A5 R7 selected/legacy evidence distinction adopted, T05 BUILD source R2 PASS, T01/T01k packages migrated with K byte parity. This is not T04/T03b/T06b/T09/R01 completed evidence.

Pending: T04 selected BUILD producer→runtime positive; T03b SQLite port; T06b observer, T11 46 old import flips and K02 fragment, T07b public export/CI/node finalization, T08b final runnable examples, T09 actual installed Tiny/Rich, R01 whole-candidate qualification.

No semantic guarantee of compatibility for pre-1.0 obsolete public surface. Keep migrations source-pinned and avoid copying version-unqualified examples.
