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
