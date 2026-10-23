# v0.10.1 T05 — installed SDK Feature BUILD + Activation smoke

**Stage:** Focused T05 executable witness. A prior physical candidate smoke is recorded in [Issue #1289, receipt 6360299440](https://github.com/kaicreator-mm/domain-harness/issues/1289#issuecomment-6360299440); that PASS used a **diagnostically rebuilt** B00 compiler, so it is **not** official exact-B00-distribution PASS. Source PR #1294 and all prerequisites require current SHA confirmation and independent source review. These commands need a real Node24 host.

## Required clean Builder layout

Reuse the existing v0.10 T11 clean-consumer procedure for **packed**, not workspace-linked, `@kaicreator/domain-harness-compiler` (and any of its actual declared local runtime dependencies). Then prepare an **isolated temp directory** containing:

```text
<staging>/
├── package.json                    # {"type":"module", "private":true}
├── node_modules/                   # installed runtime + compiler + 4 feature tarballs + better-sqlite3, NO workspace symlinks
├── examples/
│   ├── v010-clean-consumer/apps/rich/app-definition.mjs
│   ├── v010-clean-consumer/apps/rich/modules/*.mjs
│   └── v0101-agent-improvement/integration/selected-subsets-build.mjs
└── extensions/agent-improvement/host/ct02-data-only-invoker.mjs
```

From the respective **exact PR HEADs**: `npm pack` each C01–C04 producer `extensions/agent-improvement/packages/<name>`; also pack and install the matching `@kaicreator/domain-harness` runtime and `@kaicreator/domain-harness-compiler` compiler from the accepted B00/target version SHA. Install all tarballs in `<staging>` using a verified local/remote npm registry. **The selected Rich App includes `capability-extjob-runx`, which imports native `better-sqlite3`; install a working Node24-compatible `better-sqlite3@^12` as in the existing T11 clean-consumer recipe before Activation.** Do not assume `--ignore-scripts` can build native modules on an unsupported platform; use verified compatible prebuilt binaries or permitted installation scripts in the isolated test environment. Record any native dependency install errors as test/setup FAIL/NOT_RUN, never bypass the required package to make smoke pass. Avoid copying the producer module directly: all four `@kaicreator/domain-feature-*` and `./manifest` exports must resolve from **installed tarballs**. Record the tarball SHA256, npm/Node version, lockfile/repo exact SHAs, the actual install command and exit code. The compiler tarball **must be built from the same accepted exact B00 HEAD whose committed generated `dist` matches `src`** (PR #1298 formerly had an out-of-date dist). Verify `check-committed-dist` and record both source and tarball SHA256. The previous local Windows smoke showed 16 BUILD masks PASS with the old stale dist, but the skipped-optional probe failed `V10_FEATURE_COLLISION`; **only a fresh tarball made from corrected committed B00 dist** is eligible for final T05 PASS.

Invoke only after dependencies and the frozen graph owners are ready:

```bash
cd "<staging>"
node examples/v0101-agent-improvement/integration/selected-subsets-build.mjs
```

The script checks **16/16** actual Feature selection subsets, source-byte/digest BUILD input, skipped optional overlap (#1296), real K/S/B/C + four S Feature Activation/CT-02 advice results, unselected refusal, and zero instrumented DocStore writes on the advisory path. A PASS is valid only with exit code 0 and its structured JSON receipt; a missing npm package, invalid selected Feature lifecycle or invalid input is a FAIL, not a waiver. Do not print private credentials or alter the official Host source to force the test to pass.

This is *T05 smoke only*: it does **not** exercise fully packaged Domain App runtime from the installed application, file-backed SQLite, stateful K effects, restart/replay, Shadow or full v0.10 Tiny/Rich regression. Those belong to T06 #1290 and are `NOT_RUN` until a separate physical report exists. Review the exact T05 PR HEAD after any repair; don't merge the source PR merely because this run passes.
