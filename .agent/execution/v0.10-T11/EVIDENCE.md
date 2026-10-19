# T11 — focused clean-packed consumer evidence (exact SHA)

- Builder claim: [#1180 comment 6275488483](https://github.com/kaicreator-mm/domain-harness/issues/1180#issuecomment-6275488483) (`DISPATCH_CLAIMED`, ADS 4.13.1@f35fcdb, pack `PACK_CURRENT`).
- Base: `v0.10@a420807413c33f8dfb9cbc4c1f6628f8f47eb385` (T08 R2 merge).
- Implementation SHA: the commit carrying this file on `task/v0.10-t11-clean-packed-apps` (PR #1199). The suite records the exact `sourceSha` it built from; re-run at the PR HEAD for exact-HEAD evidence.
- Environment: LOCAL Windows Node `v24.21.0`, real file-backed SQLite (`better-sqlite3@12`), npm 11.19.0, local Verdaccio registry `http://localhost:14873`.
- **Ubuntu Build Host lane: NOT_RUN** (not available in this session). Do not infer it.

## What executed (one command, one process tree)

```
node --import tsx --test tests/integration/v010-clean-consumers/clean-consumers.test.ts
```

Result: `pass 1 / fail 0 / duration 66.8 s`, exact-head CI is the separate gate below.
Evidence JSON (`dh.v10.t11.clean-consumer-evidence/1`) is printed as `T11_EVIDENCE <path>`.

The suite is **out-of-tree by construction**: it packs the runtime
workspace packages, installs them into an isolated BUILDER directory, runs
`examples/v010-clean-consumer/build-apps.mjs` there, packs the three built
Apps, and installs them into two more isolated consumer directories. Every
scenario report carries its physical ESM resolution log; every report asserts
`outsideDeploymentRoot == []`.

## Fixed-SHA BUILD outputs

| App | buildId | modules | subjectDigest | packageClosureDigest |
|---|---|---|---|---|
| Tiny | `tiny-v1` | 4 | `e76ce1f718473d5056155b3dc67479834198ea34b9868cb0e92a9904f2a6cd49` | `199a99de6ca65ac93f048282c0be355cbd7d1240b4e7e07e89c9798b312324b3` |
| Rich v1 | `rich-v1` | 16 | `3999047cf6463f62bfd18edf24e7f4688d97be0289ad395ddeb67bfa0aed1a54` | `0483ec21eef8fe889431f3e19495ec68f67a6170b8e96a26143b33c1f00b4d2f` |
| Rich v2 | `rich-v2` | 17 | `29ae8bd830170702e0f6d48c9eded55200d715564d3e66b6cfdaf4db8485a5a7` | `5df6ea3d4f7a3816310e66abb6d05fbf69c0cd87b31b30bcb3994ee00bdf1f78` |

Rich v2 selects the T06 decision-evidence feature in addition, so both the
subject and the package closure differ from v1 while the stable deployment
identity (`deploy:v010-t05-rich` / `tenant:v010-t05-rich` / `app:v010-t05-rich`)
is unchanged.

Runtime tarball SHA-256 (stable across runs; both installed into every consumer):

| Artifact | SHA-256 |
|---|---|
| `kaicreator-domain-harness-0.2.0.tgz` | `2dac312f3a6041887ad83110ae9bb329b08a307aee61c7c43775691b37e54500` |
| `kaicreator-domain-harness-compiler-0.2.0.tgz` | `2b18fbace5c8fbf15c096f28c88c5b791def31c0791dd2c4bd27cfdb0d827422` |

The three App tarball SHA-256 values are emitted in the run's
`evidence.json`. They are **run-local**: `npm pack` embeds file mtimes, so
the tarball bytes are not byte-reproducible even though the App content is.
The reproducible identities are the sealed BUILD `subjectDigest` /
`packageClosureDigest` above plus the packed module `moduleSha256` roster in
each App's `manifest.json`; those are stable across BUILD runs.

## TEST_MATRIX result

| id | Result | Physical observation |
|---|---|---|
| TINY_P1 | PASS | 4-module Tiny; send → admitted with one executed effect; authorized scoped query; SQLite restart; replay `idempotentReplay=true` with zero new journal/dispatch; changed input typed conflict. |
| TINY_N1 | PASS | Roster roles exactly K-primary/S-primary/B/C; no advanced package id in the installed `node_modules`; no advanced bare specifier in the real resolution log; no advanced marker in Tiny's own sealed bytes. See the scoping note below. |
| RICH_P1 | PASS | `selectedExtensions=2` with distinct provider/hook; `selectedFeatures=4` distinct, all imported once, all `init` ran; every feature actually invoked through the facade. |
| RICH_P2 | PASS | B1/B2 share `workflowId=external-jobs` + `instanceKey`; disjoint K02 prefixes; one instance row each; both survive restart; B1 replay is `idempotentReplay` with zero new dispatch. |
| RICH_P3 | PASS | Explicit scoped query; unscoped two-visible → `QUERY_AMBIGUOUS` with zero reads; one-visible returns that B; hidden-B explicit query → `QUERY_NOT_FOUND` with zero additional physical read (non-oracle). |
| RICH_P4 | PASS | Rule 0 / reuse 0 / promoted procedure 0 Model calls (procedure called once); Model fallback `modelCalls=1, measured`; no-model `unavailable, modelCalls=0, unmeasured`. |
| RICH_P5 | PASS | Agent context read from real scoped Memory + read-only Tool; context feature mints no Host/K authority; commit writes scoped Memory; foreign-tenant probe refused with zero memory row growth; WAIT parks in SQLite, survives a process restart, resumes exactly once, duplicate callback replays with zero dispatch, deadline branch reaches `timedOut`; child-terminal planner correlation accepted and expired deadline refused typed. |
| EX04_P1 | PASS | Job-shaped fake and notifier both dispatched through the SAME selected C01 permit contract; accepted job phase is not terminal; notifier reaches terminal; one permit minted+consumed each; provider consoles show one physical call each. |
| EX04_F1 | PASS | Duplicate callback `duplicate`, conflicting callback `conflict`, exactly one callback row; injected permit-consume CAS fault → `UNKNOWN`, job physically landed, blind retry zero new dispatch, reconcile reports standing truth. |
| K01_P1 | PASS | Two real Node processes, one SQLite K file, identical messageId: exactly ONE provider dispatch, ONE job row, ONE K permit row; the loser either replays the same logical turn or fails closed typed. |
| K02_P1 | PASS | 18 distinct admitted turns on one instance; all derived disposition rows deleted; turn #1 replay answers `idempotentReplay` with the original effect identity and zero new dispatch; changed input refused typed. |
| SHADOW_P1 | PASS | T07 match and difference runs over the installed Rich App: 133 observations, 32 cases; `productionWritesVerifiedZero=true`, physical rows/counters unchanged, `storeMutationMethodsUsed=0`, `canPromote=false`. |
| VERSION_P1 | PASS | v1 CURRENT pins the old occurrence; v2 CURRENT serves a new occurrence with a different BUILD digest; v1 PINNED_ONLY restores the old pin, replays the original receipt with zero dispatch, refuses a fresh occurrence; revoked approval refuses promotion. |
| DENY_N1 | PASS | Permitless Business probe → `ADMISSION_EFFECT_FAILED` naming the missing live K permit; zero provider dispatch; no job row; no fabricated receipt/journal. |
| DENY_N2 | PASS (code review) | The App has no private npm/HTTP business-effect path; all state-changing business effects flow `K admission → sealed C adapter → K permit/journal`. No JS network sandbox is claimed (L2 Freeze §3 P2-2). |
| PACK_P1 | PASS | Three isolated installs (builder, Tiny consumer, Rich consumer); no monorepo file URL resolved; fixed-SHA build manifest + tarball SHAs + npm/native install logs. |

Physical Rich workdir (one SQLite file): 28 permits, 13 occurrence
instances, 32 effect-journal rows, 24 real job submissions, 2 real notify
deliveries. The K01 race workdir independently holds 1 permit / 1 job / 1
dispatch.

### TINY_N1 scoping note (honest installed-bytes boundary)

`@kaicreator/domain-harness-compiler` is the BUILD + activation runtime, so its
tarball deliberately ships the whole selectable `payload/` directory (all S
feature bytes, including ones Tiny does not select). "Advanced module
installed" is therefore scoped to what the Task can meaningfully mean:

1. the **Tiny App artifact** contains exactly four sealed modules (manifest),
2. the **BUILD roster** selects no K extension / S feature / Agent / model,
3. the **real ESM resolution log** of the executed process contains no such
   bare specifier, and
4. the **activation counters** import/init exactly zero advisory modules.

Inert compiler payload bytes that no Tiny process resolves or imports are not
counted as an installed advanced module; if a reviewer wants the stricter
"no such byte on disk anywhere" reading, that would require splitting the
compiler payload into per-App tarballs, which is a packaging change outside
this Task's authority.

## Explicit NOT_RUN (never inferred as PASS)

1. Ubuntu Build Host lane (this host is Windows Node24).
2. `R01` full regression / hidden validation / security / final release packaging — R01 #1181 owns it at the fixed version SHA.
3. Optional T09 / T10B DAG nodes.
4. A JavaScript network sandbox (deliberately not claimed).

## PACK recipe change

`packages/domain-harness-compiler/package.json` now exposes the already-built
`./v10build` and `./v10shadow` dist plus the sealed `./v10payload/*` bytes and
ships the pure `v09/workflow-router.mjs`. Nothing else in `packages/**`
changed; no K/CAS/Effect/receipt/authorization semantics were touched.

## Changed files

- `packages/domain-harness-compiler/package.json` (PACK recipe exports/files).
- `.gitignore` (ignore generated `examples/v010-clean-consumer/out/`).
- `examples/v010-clean-consumer/**` (Tiny + Rich definitions, owned modules, BUILD recipe, runtime, scenarios, Shadow candidates, README/PROVENANCE).
- `tests/integration/v010-clean-consumers/clean-consumers.test.ts` (this suite).
- `.agent/execution/v0.10-T11/EVIDENCE.md`, `MANIFEST.yaml` (evidence write-back).
