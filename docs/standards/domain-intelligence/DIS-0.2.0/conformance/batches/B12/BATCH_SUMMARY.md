# B12 R58 — original Runx Stateful lifetime vs physical KDP SQLite

**B12-01/R58 1/1 scoped round VERIFIED**, with immutable native test Git Blob `076d279acf5654c8ddea42d9e0a25211423bfb47` and child-process script Git Blob `0a5bdb4e157542a55886e3c7e12d6383db49ab10`. Qualifying source `67bd90839e3634427845181a406cd32804c75e17`, TREE `2095af677e10efde0c66ecad1c13b342e5c8f633`, Woodpecker #2325/1–3 **ALL SUCCESS**.

This is a distinct original source-bound lifecycle test beyond R33: selected original Runx `EnvironmentAgentPresence` creates a `PROCESS_LOCAL` Stateful handle; an actual OS Node child writes a Runx presence observation, closes its KDP SQLite physical CAS store, and a second Node child reopens the same DB with the same tenant and sees a **fresh empty Runx handle**. A third child observes a new incarnation with no fabricated predecessor. Forged agent tokens, invalid modes and forged execution permissions fail closed. Native app is DIS AOT/SDK/KDP; no substitute implementation of Runx, Effect permit, independent semantic Oracle or production persistence.

**Limit:** KDP physical storage and Domain-owned State have different authority and lifetime semantics. This verified negative boundary is NOT proof of a generic durable Domain State engine/restore contract. CORE-006 remains PARTIAL.

**Totals:** B01–B12 **26/26 bounded Demo rounds VERIFIED**; Core **9/16 VERIFIED (56.25%), 7 PARTIAL**, Optional 4 NOT_RUN, Governance 1 NOT_RUN; no merge/Freeze/release.