# B12-01/R58 — original Runx domain Stateful lifetime vs real reopened KDP SQLite

**Status: CI_PENDING.** Candidate original source `8a518e803db378e2e263527b25c647f6a656936c`, TREE `7ba22353207b0e4488cd002c18cc7d4dd10f0382`, native test original Git Blob `076d279acf5654c8ddea42d9e0a25211423bfb47`. Real child executable source Git Blob `0a5bdb4e157542a55886e3c7e12d6383db49ab10`.

## Actual new verification

Original Runx `EnvironmentAgentPresence` instance is selected as `runx.createPresenceObserver` in the real DIS AOT and invoked through `loadDisV020Aot`; original `kaicreator-mm/runx` source and `PROCESS_LOCAL` handle ABI are unchanged. B01 R33 had proved two handles were isolated inside one process, while B05 had proven selected Runx plus Tally/xDownload interoperability. B12 now adds actual OS process and physical persistence boundary.

An independent child Node process opens `openPhysicalStore(dbFile)`, which is a real file-backed SQLite KDP `V10DocStore`, and selects the same original Runx Stateful Function with the same tenant. In first process, Runx observes agent incarnation A, latest=A; the process stops and closes the SQLite file. In a **second real OS process, reopening the same SQLite file**, source-original Runx local presence remains empty (no automatic persisted Domain State). A third fresh child observing incarnation B retains only its own new local map, not an invented restoration of A. The database magic is checked as a real SQLite file.

Negative cases: a forged `agent_id` token cannot mutate Runx presence or create execution lease, and invalid child CLI modes/authorization injections are rejected before opening a store. `runx.createPresenceObserver` continues to return OBSERVATION/NONE rather than a verified KDP execution receipt; no external Effect or business domain owner approval.

**Non-claim:** KDP durable SQLite infrastructure working does not imply arbitrary Domain Stateful class persistence or migration. A future Domain-owned durable State Element must explicitly define storage, ownership, time/version semantics, consistency and replay. This R58 proves the present bound `PROCESS_LOCAL` contract and no hidden promotion; it does not provide a generic durable state engine or qualify independent semantic Oracle. CORE-006 remains PARTIAL.

Full mandatory native + compatibility + general Woodpecker contexts must succeed on final exact source before R58 is marked VERIFIED.
## R58 exact source-scoped qualification

Real original source `67bd90839e3634427845181a406cd32804c75e17` / TREE `2095af677e10efde0c66ecad1c13b342e5c8f633`, test Git Blob `076d279acf5654c8ddea42d9e0a25211423bfb47`, process child Git Blob `0a5bdb4e157542a55886e3c7e12d6383db49ab10`: [Woodpecker #2325/1](https://ci.kaicreator.com/repos/18/pipeline/2325/1), [#2325/2](https://ci.kaicreator.com/repos/18/pipeline/2325/2), [#2325/3](https://ci.kaicreator.com/repos/18/pipeline/2325/3) **3/3 SUCCESS**. Same real physical KDP SQLite across independent OS processes does not automatically persist Runx's source-defined PROCESS_LOCAL business state. No independent SAP, Domain State migration, Effect or complete CORE-006.
