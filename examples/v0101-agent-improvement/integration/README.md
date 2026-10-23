# v0.10.1 T05 — installed SDK Feature BUILD + Activation smoke

**Stage:** Focused T05 executable witness, **NOT a recorded test run**; source PR #1294 is Draft. These commands require a real Node24 host; do not claim successful installation or invoke results from this document.

## Required clean Builder layout

Reuse the existing v0.10 T11 clean-consumer procedure for **packed**, not workspace-linked, `@kaicreator/domain-harness-compiler` (and any of its actual declared local runtime dependencies). Then prepare an **isolated temp directory** containing:

```text
<staging>/
├── package.json                    # {"type":"module", "private":true}
├── node_modules/                   # installed compiler + 4 feature tarballs, NO workspace symlinks
├── examples/
│   ├── v010-clean-consumer/apps/rich/app-definition.mjs
│   ├── v010-clean-consumer/apps/rich/modules/*.mjs
│   └── v0101-agent-improvement/integration/selected-subsets-build.mjs
└── extensions/agent-improvement/host/ct02-data-only-invoker.mjs
```

From the respective **exact PR HEADs**: `npm pack` each C01–C04 producer `extensions/agent-improvement/packages/<name>`, and `npm install --no-save --ignore-scripts <absolute-tarball-paths...>` inside `<staging>`. Avoid copying the producer module directly: all four `@kaicreator/domain-feature-*` and `./manifest` exports must resolve from **installed tarballs**. Record the tarball SHA256, npm/Node version, lockfile/repo exact SHAs, the actual install command and exit code. The compiler tarball must be version-current and, for optional collision checks, contain the accepted #1296 B00 BUILD patch + committed `dist`.

Invoke only after dependencies and the frozen graph owners are ready:

```bash
cd "<staging>"
node examples/v0101-agent-improvement/integration/selected-subsets-build.mjs
```

The script checks **16/16** actual Feature selection subsets, source-byte/digest BUILD input, skipped optional overlap (#1296), real K/S/B/C + four S Feature Activation/CT-02 advice results, unselected refusal, and zero instrumented DocStore writes on the advisory path. A PASS is valid only with exit code 0 and its structured JSON receipt; a missing npm package, invalid selected Feature lifecycle or invalid input is a FAIL, not a waiver. Do not print private credentials or alter the official Host source to force the test to pass.

This is *T05 smoke only*: it does **not** exercise fully packaged Domain App runtime from the installed application, file-backed SQLite, stateful K effects, restart/replay, Shadow or full v0.10 Tiny/Rich regression. Those belong to T06 #1290 and are `NOT_RUN` until a separate physical report exists. Review the exact T05 PR HEAD after any repair; don't merge the source PR merely because this run passes.
