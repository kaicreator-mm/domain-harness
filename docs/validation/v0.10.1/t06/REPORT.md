# T06 — v0.10.1 source-pinned Node24 physical version regression receipt

- Task: #1290 (T06 Validation). Write set of this run: `docs/validation/v0.10.1/t06/**` only.
- Verdict: **PHYSICAL_PASS (Windows Node24 lane)** — every gate below exited 0 with the recorded counts; no Kernel/production code, `main`, `v0.10`, R01 ledger or T05 Host logic touched. NOT release PASS (R01 owns that).
- One complete physical sweep at the admitted candidate; T05 receipts reused, not rerun (see §5).

## 1. Immutable candidate pins (no drift)

| item | value | source |
|---|---|---|
| version branch | `v0.10.1@568a38a4730fdcf29bc8bf461e74bf33a50cbe68` | admission comment `6362310330`; verified in worktree |
| Git tree | `e4a86d690b9b3db069c2ad7731564248ea970bde` | `git rev-parse HEAD^{tree}` — matches admission |
| root `package-lock.json` blob | `c16147cd27d2aa5170b32186a71956cd391035e6` | `git hash-object package-lock.json` — matches admission |
| T05 script blob | `d67e001aee9441282da054e41d85ad80de2bb5f6` | `examples/v0101-agent-improvement/integration/selected-subsets-build.mjs` at candidate — matches admission |
| A01 DAG amendment blob | `757476e9a3da1b2ed19ca140b21195b8bf7ca567` | `docs/tasks/DomainHarness_v0.10.1_TASK_DAG_AMENDMENT_A01.md` at candidate — matches admission |

Candidate ancestry note: `git diff --name-only 0b616d0..568a38a` = exactly 5 files
(`examples/v0101-agent-improvement/**` ×3, `tests/conformance/v0101-sdk-features.test.ts`,
`tests/hosts/node/v0101-feature-suite.test.ts`); **`packages/` and `package-lock.json` are
byte-unchanged between the T05 smoke ref `0b616d0` and the candidate `568a38a`**, so the
T05 receipt tarball digests remain exactly valid for this candidate (cross-checked again in §4).

## 2. Environment (all recorded before any gate; `logs/00-env.log`)

| item | value |
|---|---|
| host | Windows 11 (10.0.26300) x64, Git Bash (MINGW64) |
| node | `v24.21.0` (fnm) |
| npm | `11.19.0` |
| worktree | `domain-harness/dh-i1290-t06-zcode`, branch `task/dh-i1290-t06-zcode`, HEAD = candidate, `git status --porcelain` = empty at start and after every gate |
| native SQLite | `better-sqlite3@12.11.1`, win-x64 prebuilt `build/Release/better_sqlite3.node` loads and round-trips `:memory:` insert/select (`logs/03-native-smoke.log`) |
| install registry | `https://registry.npmmirror.com` (repo `npm ci`); consumer installs `http://localhost:14873` (local Verdaccio pull-through) |

## 3. Physical gates — exact commands and exit codes

Run order and exit codes (`.exit` files in `logs/`; every command's log is committed):

| # | command (verbatim shape) | exit | evidence |
|---|---|---|---|
| 1 | `npm ci --registry=https://registry.npmmirror.com --no-audit --no-fund` | **0** | `logs/01-npm-ci.log` |
| 2 | `npm install-scripts approve better-sqlite3` + `approve esbuild` + `npm rebuild better-sqlite3 esbuild` (then `git checkout -- package.json`; allowScripts not committed) | **0** | `logs/02-native-rebuild.log` |
| 3 | `npm run build` (all workspaces + `scripts/check-committed-dist.mjs`) | **0** | `logs/04-build.log` — "shipped dist trees present, tracked and fresh"; `git status --porcelain` = 0 modified files after rebuild |
| 4 | `npm run lint` | **0** | `logs/05-lint.log` — 0 errors, 1 pre-existing warning (unused eslint-disable in `packages/domain-harness/tests/t012r/consumer-src/fixture-toolplane.mjs`, unchanged by this task) |
| 5 | `npm run typecheck` | **0** | `logs/06-typecheck.log` |
| 6 | `npm test` (workspaces + `test:root`, official script as frozen; single run, ~7 min) | **0** | `logs/07-full-test.log` — **4310/4310 pass, 0 fail** |
| 7 | `T11_NPM_REGISTRY=http://localhost:14873 T11_EVIDENCE_PATH=… node --import tsx --test tests/integration/v010-clean-consumers/clean-consumers.test.ts` | **0** | `logs/08-t11-clean-consumers.log` — 1/1 pass, 69.9 s |
| 8 | `npm pack -w @kaicreator/domain-harness -w @kaicreator/domain-harness-compiler --json` (cross-check only) | **0** | `logs/09-packcheck*.log/json` |

`npm test` segment breakdown (node --test summaries in `logs/07-full-test.log`):

| segment | tests | pass | fail |
|---|---|---|---|
| `@kaicreator/domain-harness` (runtime, `tests/**` + tail `tsc -p tsconfig.test.json`) | 3326 | 3326 | 0 |
| `@kaicreator/domain-harness-compiler` | 430 | 430 | 0 |
| `@kaicreator/domain-harness-expo` | typecheck-only (no test segment) | — | — |
| `@kaicreator/domain-harness-node` | 227 | 227 | 0 |
| root `test:root` tsx globs | 318 | 318 | 0 |
| root `test:root` `node --test` mjs | 9 | 9 | 0 |
| **total** | **4310** | **4310** | **0** |

Note on `--test-concurrency=4`: the frozen root scripts do not pass runner flags and were
executed unmodified; the run completed bounded (~7 min wall) on the recorded host.

### Focused current-version witness (reused exact execution, not duplicated)

The admission's step-2 files are all inside the `npm test` globs above, so per the admission
their results are cited from that single execution (`logs/07-full-test.log`):

- `tests/conformance/v0101-sdk-features.test.ts` — ✔ "v0.10.1 T05 — BUILD accepts all 16 independently selected Standard Feature subsets", ✔ "…Feature-key collision stays fail-closed" (log lines 4393–4394).
- `tests/hosts/node/v0101-build-skipped-optional-provider.test.ts` — ✔ all 5 `#1296` tests (absent optional does not reserve key; selected collision fails closed; skipped optional Kernel Extension; only-skipped-provided requirement refuses) (log lines 4501–4505).
- `tests/hosts/node/v0101-feature-suite.test.ts` — ✔ all 16 CT-02 data-only invoker tests (4 feature keys × {valid frozen-copy identity, request callable/effect authority refused **before** invocation, dependencies callable refused, accessor refusal never evaluates getter}) (log lines 4506+). These are the in-repo witness that read/evaluation features carry no callable/effect authority — with the T05 physical `effectWriteCount:0` receipt (§5).

## 4. Pack cross-check against the integrated candidate

Independent `npm pack` of the two runtime producers from the candidate worktree
(`logs/09-packcheck-verify.log`):

| artifact | SHA-256 | equals |
|---|---|---|
| `kaicreator-domain-harness-0.2.0.tgz` | `aa069fe7a6c47101c830a1ad74f554c5c8bd0cb3adddb51591470387f5385ad6` | T05 receipt ✔ and T11 run tarball ✔ (byte-identical) |
| `kaicreator-domain-harness-compiler-0.2.0.tgz` | `f31f31c2d112d114a564f25c4f8120b6291430767159849b9e10bed5e4d0715f` | T05 receipt ✔ and T11 run tarball ✔ (byte-identical) |

Content-level check: `git hash-object` of `dist/qualified-package/v10build/build.js`
extracted from the fresh compiler tarball = `2892eaae7c3a0283a83186feaa181af5c13f03c2`
= the committed dist blob at the candidate (= the blob T05 byte-verified inside its own
tarball). The T11 consumers in §Gate 7 loaded exactly these tarballs (`sourceSha`
`568a38a…` in `logs/08-t11-evidence.json`, every scenario asserted
`outsideDeploymentRoot == []`), closing the chain candidate → committed dist → packed
tarball → isolated install → executed module graph.

## 5. Reused (NOT rerun) — T05 receipts

- [#1289 comment 6361903941](https://github.com/kaicreator-mm/domain-harness/issues/1289#issuecomment-6361903941): official current-version pack + physical T05 Activation smoke at `v0.10.1@0b616d0` (Node24.21.0/npm 11.19.0): 16/16 BUILD selection masks with 16 unique subjectDigests, four real CT-02 advisory invocations, `skippedOptionalProbe:'PASS'`, unselected refusal `V10_FEATURE_NOT_SELECTED`, `effectWriteCount:0`, six producer tarball SHA256 recorded. Valid for this candidate because `packages/`+lock are byte-unchanged `0b616d0 → 568a38a` (§1) and the runtime/compiler digests re-verified byte-identical here (§4).
- [#1290 admission comment 6362310330](https://github.com/kaicreator-mm/domain-harness/issues/1290#issuecomment-6362310330) is the authority for this reuse; per it, the T05 16-subset installed path is qualified and was not re-executed by T06.

## 6. T11 clean-packed consumer journeys — see `T11-CLEAN-CONSUMERS.md`

Single physical run (`logs/08-*`): Tiny + Rich independently built in an isolated builder
install, packed, clean-installed into isolated consumer directories (Tiny asserts zero
advanced package bytes), file-backed SQLite, restart/replay, WAIT/RESUME, T08 version pin,
Shadow, two-process K01 race — all PASS with the physical counters recorded
(24 job dispatches, 2 notify dispatches, 28 permits, 13 instances, 32 journals).

## 7. Known open dispositions (explicit, NOT claimed fixed)

- **#1267 (review-P2, OPEN)**: decision-class S Feature dispatch/admission gap — recorded as known-open; no test in this run claims otherwise.
- **#1270 (review-P2, OPEN)**: instance genesis non-atomicity window — recorded as known-open.

## 8. NOT_RUN (honest scope)

- Ubuntu Build Host lane (this session is a Windows Node24 host with real file-backed SQLite; the admission allows the original T11 procedure on the supported Windows Node24 host).
- R01 full hidden/security regression and release qualification (`RELEASE_QUALIFICATION.md` untouched — R01 owns it).
- T09 / T10B optional DAG nodes (not selected).
- JS network sandbox for DENY_N2 (source-review criterion by contract; no claim made).

## 9. Evidence integrity

`logs/SHA256SUMS.txt` covers every log/evidence file in this directory. App tarball digests
in `08-t11-evidence.json` are run-local (`npm pack` embeds mtimes); the reproducible
identities are the sealed BUILD `subjectDigest`/`packageClosureDigest` values recorded there
(Tiny 4 modules / Rich v1 16 / Rich v2 17, three byte-distinct BUILDs).
