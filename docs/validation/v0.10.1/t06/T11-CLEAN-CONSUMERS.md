# T06 §6 — T11 clean-packed consumer receipt (v0.10.1 candidate, physical)

One command, one process tree, at the admitted candidate:

```
T11_NPM_REGISTRY=http://localhost:14873 \
T11_EVIDENCE_PATH=logs/08-t11-evidence.json \
node --import tsx --test tests/integration/v010-clean-consumers/clean-consumers.test.ts
```

- exit **0**, `tests 1 / pass 1 / fail 0`, duration 69.9 s (`logs/08-t11-clean-consumers.log`).
- `sourceSha` sealed inside the run: `568a38a4730fdcf29bc8bf461e74bf33a50cbe68` (= candidate).
- Out-of-tree by construction: runtime+compiler packed from the candidate worktree, installed
  into an isolated BUILDER dir, `examples/v010-clean-consumer/build-apps.mjs` BUILDs Tiny/Rich
  v1/Rich v2 there, the three Apps are packed and installed into two more isolated consumer
  dirs with real `better-sqlite3@12.11.1` (win-x64 prebuilt); every scenario report asserts
  `outsideDeploymentRoot == []` (no repository path on any runtime resolution edge).
- T11_SUMMARY: `{"tiny":true,"richMain":true,"wait":true,"t08":true,"shadow":true,"race":true,"jobDispatches":24,"notifyDispatches":2,"permits":28}`.

## Fixed-SHA BUILD outputs (from `logs/08-t11-evidence.json`)

| App | buildId | modules | subjectDigest | packageClosureDigest |
|---|---|---|---|---|
| Tiny | `tiny-v1` | 4 | `657db54844ccf9e5bd5adf816d3fd66edd6bea1e0431febe861aafbf9d414298` | `b4a986248e4d93925403b216776339213e1ffb588709bfd1bb8bce8f4ac7aca5` |
| Rich v1 | `rich-v1` | 16 | `486122135a4d048787b4781243ab8290e2419727c36a4c5d5f31da4960da8911` | `e945fa94bdfaaacbf01bb92341213c4ee6a606b7a5d05c137f5525dd4327e6aa` |
| Rich v2 | `rich-v2` | 17 | `63d68e3f675fbf06644d5e2297e63f37340ef7d47514cd54847149b113b58bda` | `a9b40cfe358d176a3afe1ac6f9e5a87a9b8e1a5b6405d2e67375304b59040f2b` |

Runtime tarballs installed into both consumers (SHA-256 byte-identical to the T05 receipt
and to the independent pack in REPORT §4): core `aa069fe7a6c47101c830a1ad74f554c5c8bd0cb3adddb51591470387f5385ad6`,
compiler `f31f31c2d112d114a564f25c4f8120b6291430767159849b9e10bed5e4d0715f`.
App tarball digests are run-local (mtime-embedding) and are recorded in the evidence JSON:
Tiny `3c8bc55a…`, Rich v1 `f8dbb074…`, Rich v2 `ec3b1ae1…`.

## Locked v0.10 T11 matrix — result on the v0.10.1 candidate

| matrix id | result | physical observation (this run) |
|---|---|---|
| TINY_P1 | PASS | 4-module Tiny (K/S/B/C only); `send.basic` admitted with executed effect; authorized `query.scoped`; SQLite `restart.reopen`; `replay.originalReceipt` idempotent; `replay.changedInputConflict` typed conflict. |
| TINY_N1 | PASS | Tiny `node_modules` contains no advanced package (`sfeature-`/`kext-`/agent/extjob/extnotify markers absent), no Rich App leak; resolution log has no advanced bare specifier. |
| RICH_P1 | PASS | `RICH_P1.selection` + `invokeFeatures`: physically separate selected extensions/features, every feature actually invoked through the facade. |
| RICH_P2 (two-B disjointness) | PASS | `RICH_P2.twoBIsolation` + `RICH_P2.restart`: same workflowId+instanceKey, disjoint K02 durable tuples, both survive restart. |
| RICH_P3 (query authority / out-of-scope reads) | PASS | `RICH_P3.queryAuthority` (scoped visible, unscoped ambiguous, hidden-B non-oracle denial) + Tiny `query.deniedForeignB`. |
| RICH_P4 (Rule/Model truth) | PASS | `RICH_P4.modelCallTruth`: truthful Rule/cache/promoted/fallback model-call accounting. |
| RICH_P5 (Memory/Context/Agent) | PASS | `RICH_P5.agentMemoryContext`: isolated Memory/Context/Agent state; no K authority injection. |
| EX04_P1 | PASS | `EX04_P1.twoAdapters`: job-shaped + unrelated effect adapters on the same C01 permit contract, distinct provider receipts. |
| EX04_F1 (UNKNOWN reconciliation) | PASS | `EX04_F1.duplicateCallbackAndLostAck`: accepted→lost reply→UNKNOWN→reconcile, duplicate callback, missing derived disposition. |
| K01_P1 (CAS race) | PASS | Two REAL competing Node processes on one file-backed SQLite: worker A admitted (`effectId turn:external-jobs:race-inst-1:…/effect/1`), worker B failed closed typed `ADMISSION_EFFECT_AMBIGUOUS` (status UNKNOWN); exactly-once physically verified: `job_dispatch_log`=1, `jobs`=1, race permit=1. |
| K02_P1 (original-receipt replay) | PASS | `K02_P1.eighteenTurnsOriginalReceipt`: 18-turn journey, immutable original atomic receipt, replay no-new-effect; plus Tiny replay/conflict steps. |
| SHADOW_P1 (Shadow zero production writes) | PASS | `rich-shadow`: 32 cases / 140 observations, `match` and `difference` paths both exercised, `SHADOW_P1.zeroProductionWrites` ok, `canPromote:false`. |
| VERSION_P1 (stale target / version pin) | PASS | `rich-t08-a` old-occurrence replay + `rich-t08-b` new-BUILD activation with old-pin restore after restart and revoked-candidate refusal; `v1`/`v2` subjectDigests distinct. |
| DENY_N1 (permitless denial) | PASS | `DENY_N1.permitlessAdapter`: credentialed adapter without live K permit → typed refusal, zero provider calls/journal/receipt. |
| DENY_N2 (network bypass) | NOT_RUN (by contract) | Source-review criterion; no JS network sandbox claimed. |
| PACK_P1 (clean install, no monorepo fallback) | PASS | Isolated builder/consumer installs from packed tarballs only; `outsideDeploymentRoot == []` in every report; digests above. |

WAIT/RESUME (child deadline + callback): `wait-b` = `state:"resumed"`, `timedOut`,
duplicate callback detected, `childResume:"submit"`, `WORKFLOW_DEADLINE_EXCEEDED`, 2 notify
dispatches across the journeys.

Physical SQLite witnesses on the SAME installed files: `richPermits:28`, `richInstances:13`,
`richJournals:32`, `jobDispatches:24` (main + two-B + 18 K02 turns + lost-ACK + T08 old/new),
`notifyDispatches:2`.

Coverage gaps identified: **none** for the negatives the T06 admission enumerated (CAS race,
stale target, original-receipt replay, K UNKNOWN, two-B disjointness, permitless denial,
out-of-scope reads, Rule/Agent/Context, Shadow zero production writes) — each is asserted by
an executed step above; DENY_N2 remains a source-review criterion by contract.
