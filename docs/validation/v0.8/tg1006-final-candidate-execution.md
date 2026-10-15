# v0.8 T-G #1006 — final frozen-candidate execution record (one full run + one targeted gap batch)

> Evidence-only successor to `v08-retained-44-web-source-evidence-map.md` under the
> reuse-first intake `#1006@6189172826` (`DH08_TG_REUSE_FIRST_FINAL_CANDIDATE_ACTIVATION`).
> The frozen manifest `docs/implementation/DomainHarness_v0.8_RETAINED_FUNCTION_MANIFEST.json`
> is preserved byte-for-byte; per-row outcomes live in
> `tg1006-44-row-successor-outcome-ledger.md`. Nothing here claims Release PASS.

## Frozen candidate

| Field | Value |
|---|---|
| Candidate SHA | `b151320ee6835755ba043e2602c085c180c9c849` (= `v0.8` branch HEAD, PR #1068 merge) |
| Candidate tree | `a8135b2a217edff395da0a4f31dd7955d3b3db5a` |
| Intake authorization | `#1006@6189172826` `INTEGRATION_HEAD=b151320ee6835755ba043e2602c085c180c9c849` |
| Build host | Windows 10.0.26300 x86_64 (MINGW64/Git Bash), real machine |
| Node | `v24.21.0` (fnm), npm `11.19.0` |
| Worktree | `domain-harness/dh-i1006-zcode` on branch `task/dh-i1006-zcode`, base = candidate SHA |

Environment note (honesty): during the pinned run the only working-tree delta was a
local 4-line `allowScripts` entry in `package.json` (npm 11.19 install-scripts approval
for `better-sqlite3`/`esbuild`, required for `npm ci` to build the native binaries; not
committed, reverted after the run; `git status` clean at commit time). No source file
differed from the candidate.

## The ONE full run — `npm ci && npm run build && npm run lint && npm run typecheck && npm test`

Executed once, 2026-10-15T09:54:12Z→10:04:56Z UTC. Per-step logs with real exit codes
(archived at the executing workspace evidence dir; summary):

| Step | Exit |
|---|---|
| `npm ci --registry=https://registry.npmmirror.com` | 0 |
| `npm run build` | 0 |
| `npm run lint` | 0 |
| `npm run typecheck` | 0 |
| `npm test` | 0 |

Test counts (node:test summaries per workspace, zero fail, zero skip):

| Suite | tests | pass | fail | skip |
|---|---|---|---|---|
| `@kaicreator/domain-harness` (incl. `tsc -p tsconfig.test.json`) | 3145 | 3145 | 0 | 0 |
| `@kaicreator/domain-harness-compiler` | 374 | 374 | 0 | 0 |
| `@kaicreator/domain-harness-node` | 196 | 196 | 0 | 0 |
| root `test:root` | 62 + 9 | 62 + 9 | 0 | 0 |
| `@kaicreator/domain-harness-expo` | typecheck-only per its script | — | 0 | 0 |

**No `test.skip` was present or exercised anywhere in the run** (0 skipped across all
suites) — nothing silently degraded to NOT_RUN inside the suite.

## Version-level consolidation carried by the same run log

Per the intake, the same run log supports multiple gates where the assertions actually
cover the requested semantics; no suite was re-run for a second gate:

- **Clean packed consumer (genuine, not skipped):** `T-F E2E: both REAL #1012 Apps on
  one REAL SQLite via the npm-packed authenticated Host` — PASS (33 884 ms). It
  `npm pack`s the core+node tarballs, installs them into a fresh temp consumer (no
  workspace links, no repo src, real registry install), and drives the journeys on
  stock Node. The `npm ping` SKIP guard did not trip (0 skipped in the whole run).
  Additional packed-consumer witnesses in the same run: `#1013 R2 packed consumer
  deep-import refused`, `S04-C1 clean stock-Node packed consumer`,
  `S05-C1 restart + clean stock-Node packed consumer`, `N18 clean packed consumer
  (public entries, real SQLite, successor journey)`.
- **Two real compiled Domain Apps, critical journeys:** the same T-F E2E — D2 Approval
  golden quote + D3 Engineering review/validation/release lineage on one kernel
  attribution, cross-source negatives with zero residue, restart stage on a NEW process
  over the SAME SQLite file (lineage durable, committed replays refused).
- **Node24 real SQLite restart / cross-process true CAS / UNKNOWN:** in the same run —
  `HF18-P-RESTART` (fresh process reopens the physical store, bound callback exactly
  once), `HF20-P` (restart resume from the opaque K-validated cursor; forged/foreign/
  failed-CAS negatives), `HF18-N` crash-window/dual-fault legs, `S01-N2-restart`,
  `KPK-07 [sqlite only] durable restart`, plus the T-F E2E restart stage.

## Targeted gap batch (only still-unproven material counterexamples)

Base = the same candidate SHA; the batch adds exactly four test files (three test
files + one negative-only SDK stub fixture, listed below) and nothing else. Run:
`node --import tsx --test <three files>` → **6/6 pass, exit 0** (2026-10-15T10:20:33Z,
Node v24.21.0). These close the four intake gap roots:

1. **#1057 load gate (WeakMap count)** — `fr08-load-cache-fault-negatives.test.ts`
   leg 1 + `fixtures/sdk-no-decision-source.mjs`: a decision-source-declaring policy
   sealed against a well-formed SDK without the three retained endpoints refuses the
   load typed through the explicit WeakMap-carried rule count (pre-R2 `.size`-off-a-
   WeakMap could never fire). Assertion: `ACTIVATION_FAILED` wrapping the
   `DECISION_SOURCE_SDK_ENDPOINT_UNAVAILABLE` refusal text; app never registers.
2. **#1057 post-commit cache re-read fault** — same file leg 2: after the authoritative
   business commit of a turn whose exact-cache record already exists, a physically
   faulted CAS re-read (`failNextGetMatching('v08-kernel:decision-cache:', {skip: 1})`
   on the real SQLite store) is swallowed: the admitted ACK returns with its one
   effect (`admitted.effects` length 1, journal +1, ledger +1) and the producing
   turns' durable cache rows are byte-identical after the failed maintenance.
3. **#1061 HF23 same-operationId across capabilities** —
   `hf23-shared-operationid-negative.test.ts`: two BUILD-approved capability packages
   (`cap:agent-surface` / `cap:agent-surface-b`, the sibling anchor-modified from the
   shared fixture) both expose `agent.order-summary` under disjoint Business role sets.
   Discovery returns BOTH composite entries for a dual-role principal; each single-role
   principal discovers only its own capability's entry; the undiscoverable sibling
   refuses the pure OperationCall (`PRINCIPAL_ROLE_NOT_BOUND`) while the caller's own
   composite still serves.
4. **#1066 17th-turn eviction guard** — `hf18-history-eviction-physical.test.ts`: 16
   self-loop control turns on one instance with the OLDEST caught in the crash window
   (state CAS committed; disposition create and heal marker both faulted on the real
   store). The 17th control turn fails typed `ADMISSION_TURN_HISTORY_EVICTION_BLOCKED`
   with zero state revision / zero effect delta; caller-driven recovery re-submits the
   two settled-unsubmitted sources — the oldest replays from the committed history and
   HEALS its disposition (no second revision), the pending 17th completes exactly one
   admission (revision +1, disposition recorded, redelivery = typed duplicate); a
   fresh 18th turn admits again post-heal.

The fourth intake root, **#1067 S05**, needed no new test: the #1067 test-oracle fix
(derive app A's physical key from the first actual dispatch, not sorted
`resourceKeys()`) is in the candidate tree and executed green in the pinned full run —
`S05-P1/P2/N1/P3: dual-app same-logical-key physical handler isolation on one real
Host` plus `S05-N2/N3/C1/R1` in the same file.

## Reused owner evidence (not re-executed, per intake)

PR #1065 owner HF20 11/11 + 111/111 adjacent, PR #1066 owner HF18 13/13 + HF32 8/8 +
shared K 7/7 + compiler 374/374 + ABI 39/39, PR #1061 prior selected 10/10, PR #1057
prior selected 5/5, PR #1055 NF06 physical set: these remain source/provenance
evidence for their authoring rounds. The candidate-scope status of every function is
carried by THIS record (full run + gap batch at `b151320`) and the successor outcome
ledger — a PR-source PASS at a predecessor SHA never masquerades as candidate PASS.

## Exact-SHA CI

`.woodpecker/verify.yaml` triggers on `pull_request` (push allowlist is
main/v0.2/v0.3/v0.4, so no v0.8 push CI exists or is claimed). The evidence PR that
carries this document runs Woodpecker on its pull_request event at the PR head; the
head equals the frozen candidate plus ONLY these evidence files (tests + docs — no
`packages/**` production change; `git diff --stat b151320..<head>` is recorded in the
PR description). The pipeline URL and step exits are appended to
`tg1006-44-row-successor-outcome-ledger.md` once the run settles.
