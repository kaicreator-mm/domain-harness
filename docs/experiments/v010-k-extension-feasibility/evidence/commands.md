# Evidence commands — v0.10 K-extension feasibility spike (#1150)

All commands executed from the repository root of the research worktree on
branch `research/v010-k-extension-feasibility`, git HEAD
`0492cf4fd756c952631d7d94f1095c78949a3bdb` (research base
`2c511118821587e9abf1135cbccd3b001caadd87` = product-frozen main).
Environment: Git Bash (MINGW64_NT-10.0-26300), Node v24.21.0, npm 11.19.0.

## 1. Environment capture

```bash
date -u +%Y-%m-%dT%H:%M:%SZ          # 2026-10-18T07:19:21Z
git rev-parse HEAD                    # 0492cf4fd756c952631d7d94f1095c78949a3bdb
git branch --show-current             # research/v010-k-extension-feasibility
node -v                               # v24.21.0
npm -v                                # 11.19.0
uname -s && uname -r                  # MINGW64_NT-10.0-26300 3.6.10-710e5275.x86_64
```

Materialized as `environment.txt`.

## 2. Focused lint gate (research write set)

```bash
npx eslint tests/architecture-v010-k-extensions/
echo EXIT=$?                          # EXIT=0
```

## 3. Executable scenarios R1–R5 (the evidence run)

```bash
V10_EVIDENCE_DIR=docs/experiments/v010-k-extension-feasibility/evidence \
  node --import tsx --test --test-reporter=tap \
  tests/architecture-v010-k-extensions/v010-k-extensions.test.ts \
  > docs/experiments/v010-k-extension-feasibility/evidence/run.tap 2>&1
echo EXIT=$?                          # EXIT=0
```

TAP summary inside `run.tap`:

```text
# tests 19
# pass 19
# fail 0
```

`measurements.json` is materialized by the final test from the SAME run
(counters, K counters, selected module SHA-256 values, typed refusals).

## 4. Standard repository gates (task-check)

`tools/task-check.sh` (workspace gate: deps + lint + typecheck + npm test)
was run green on the final research HEAD; see the closeout section of
`REPORT.md` for the exact final HEAD and gate transcript reference. The
research suite is deliberately NOT wired into the root `test:root` glob: the
issue's narrow write set forbids editing root `package.json`, and no CI
matrix/full regression was requested for this research branch.

## 5. Review R1 repair runs (R6) — P1 code repair + P2 Ubuntu execution

Repair code commit `77216a2aac3595207c5e5bae2d4195900bd3685f` on the same
branch. Focused suite now 23 scenarios (R1–R5 unchanged semantics, R6 added).

### 5.1 Windows (Git Bash, Node v24.21.0, npm 11.19.0)

```bash
git rev-parse HEAD        # 77216a2aac3595207c5e5bae2d4195900bd3685f
npx eslint tests/architecture-v010-k-extensions/ && echo EXIT=$?   # EXIT=0
V10_EVIDENCE_DIR=docs/experiments/v010-k-extension-feasibility/evidence/repair-r1/windows \
  node --import tsx --test --test-reporter=tap \
  tests/architecture-v010-k-extensions/v010-k-extensions.test.ts \
  > docs/experiments/v010-k-extension-feasibility/evidence/repair-r1/windows/run.tap 2>&1
echo EXIT=$?              # EXIT=0
```

TAP summary: `# tests 23 / # pass 23 / # fail 0`. Artifacts:
`repair-r1/windows/{environment.txt, run.tap, run-exit.txt, measurements.json}`.

### 5.2 Ubuntu Build Host (WSL2, focused run at the SAME exact HEAD)

A clean clone of the branch at `77216a2a` was made inside Ubuntu
(`git clone --single-branch --branch research/v010-k-extension-feasibility`
from the local main clone, never the Windows worktree), `tsx` installed with
the npmmirror registry (`npm install --no-save tsx`; lockfile stayed clean),
then:

```bash
V10_EVIDENCE_DIR=<ubuntu-evidence-dir> \
  node --import tsx --test --test-reporter=tap \
  tests/architecture-v010-k-extensions/v010-k-extensions.test.ts \
  > <ubuntu-evidence-dir>/run.tap 2>&1
echo EXIT=$?              # EXIT=0
```

Environment: Ubuntu 26.04.1 LTS, Linux 6.18.54.1-microsoft-standard-WSL2,
Node v22.23.2, npm 10.9.8. TAP summary: `# tests 23 / # pass 23 / # fail 0`.
Artifacts: `repair-r1/ubuntu/{environment.txt, run.tap, run-exit.txt,
measurements.json, clone.log, npm-install.log}` (copied from the Ubuntu
evidence directory).
