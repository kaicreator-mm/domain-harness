# DIS B12 — original Runx PROCESS_LOCAL vs physically reopened KDP SQLite

B12-01/R58: source `8a518e803db378e2e263527b25c647f6a656936c`, native test Git Blob `076d279acf5654c8ddea42d9e0a25211423bfb47`, process Git Blob `0a5bdb4e157542a55886e3c7e12d6383db49ab10`, **CI_PENDING**. Same physical SQLite KDP file across independent OS processes; honest Runx local-state non-persistence, forged Agent token/Effect negatives. Previously B01–B11 25/25 scoped rounds VERIFIED; B12 0/1 pending; Core 9/16 (56.25%), 7 PARTIAL; Optional 4 NOT_RUN, Governance 1 NOT_RUN; no Freeze/merge/release.

## R58 exact source-scoped qualification

Real original source `67bd90839e3634427845181a406cd32804c75e17` / TREE `2095af677e10efde0c66ecad1c13b342e5c8f633`, test Git Blob `076d279acf5654c8ddea42d9e0a25211423bfb47`, process child Git Blob `0a5bdb4e157542a55886e3c7e12d6383db49ab10`: [Woodpecker #2325/1](https://ci.kaicreator.com/repos/18/pipeline/2325/1), [#2325/2](https://ci.kaicreator.com/repos/18/pipeline/2325/2), [#2325/3](https://ci.kaicreator.com/repos/18/pipeline/2325/3) **3/3 SUCCESS**. Same real physical KDP SQLite across independent OS processes does not automatically persist Runx's source-defined PROCESS_LOCAL business state. No independent SAP, Domain State migration, Effect or complete CORE-006.
