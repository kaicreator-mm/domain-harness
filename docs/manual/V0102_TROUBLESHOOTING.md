# v0.10.2 — troubleshooting, diagnostic matrix and FAQ / 故障排查

**When a focused investigation suggests a genuine SDK issue, use the [GitHub bug report and integration feedback process](../feedback/SDK_USAGE_FEEDBACK.md).** An Agent may prepare an Issue draft from redacted evidence, but should not publish downstream source/logs without consent. Avoid duplicates and don't turn OS-only runner failures into product bugs.

Prefer **error code + exact source SHA + selected package graph + minimal reproducible input**. Do not expose private K documents, credentials, raw effect permits, private Hidden fixtures or personal data. Source of truth is the released v0.10.2 code, not a historical v0.1/v0.3 note.

| Symptom / 现象 | Likely owner / 首先检查 | Safe next step |
| --- | --- | --- |
| `ERR_MODULE_NOT_FOUND` for the four public packages | Install/distribution | Are you in a **clean installed tarball root**? No assumption of npm registry publication; check `0.10.2-rc.0` manifest and package-lock |
| Legacy `domain-harness-compiler/v10build` cannot import | Intended API retirement | Move producer to `domain-harness-build` and runtime to `domain-harness-microkernel`; no deep aliases |
| Invalid Build graph / hash / route | BUILD producer | Check selected K/S/B/C cardinalities, `moduleSha256`, ABI, handler and route; do not weaken typed negatives |
| `V10_APP_INVALID` during `load` | External producer/Host integration | Confirm trusted sealed `V10BuiltApp` and supplied `V10DocStore`; do **not** build dynamically in runtime |
| Query/subscribe denied or ambiguous multi-B | Host query authority and explicit selector | Include scoped workflow + instance + Business target as required; derive real caller authority from trusted Host |
| Effect refused or UNKNOWN | K/Host effect governance | Check declared module-wide `externalEffect` and actual K permit; preserve UNKNOWN, **never blindly retry external effect** |
| SQLite driver not available | Optional Host dependency | Install/select compatible `better-sqlite3` **only** for Rich SQLite path; it is not compulsory for Tiny |
| Cross-process conflict with Tiny plain-file store | Unsupported fixture scenario | Tiny example is **single-writer only**; use transactional SQLite CAS in Rich when cross-process writers are required |
| `FACADE_CLOSED` | Lifecycle | Don't send/query/subscribe after `stop()`; acquire a fresh activation |
| Child-spawn out-of-memory in large test run | OS/test-runner execution environment | Separate from DomainHarness product correctness; don't modify K/CAS logic solely to mask OS commit exhaustion |
| Code compiles but clean installed app fails | Distribution/export mismatch | Compare installed `exports`/`node_modules`/lockfile/packed digest; never substitute source deep imports |

## Minimal reproduction checklist

1. Report `git rev-parse HEAD` and whether the build is the tag `v0.10.2` or later docs-only main.
2. Report Node major, npm version and **which** public package tarballs/manifests were actually installed (not registry speculation).
3. Identify producer BUILD or runtime Host stage, selected K/S/B/C Package identities and API involved.
4. Capture safe error `name`/`code`, literal exit code for the **specific failed command**, and failing test IDs. `NOT_RUN` is not PASS.
5. Check smallest relevant existing proof first: `projection-smoke.mjs` for Component declaration; `authoring-template-check.mjs` for pack/BUILD/gov effects; `clean-consumers.test.ts` for Tiny/Rich boundary. Do not launch full repository regression per tiny docs change.
6. Classify **Product / BUILD / Host integration / Test harness / OS environment / Documentation** before opening a bug; only product-defect evidence should change the runtime.

## FAQ

**Can I use an ordinary computer?** Yes. No OS vendor or 128GB memory mandate was part of the v0.10.2 product. Actual runtime depends on the App you choose; Node24 is the qualified version line.

**Does DomainHarness bring its own AI agent/model?** No mandatory provider. Model, Memory and Agent semantics are independent selected Domain Packages/Capabilities and their Host adapters, not hardcoded into the Microkernel.

**Does load(package) compile TypeScript and select dependencies?** No. The public method consumes the **prebuilt trusted App data**; source selection and validation happen in the external producer's BUILD phase.

**Does Tag v0.10.2 mean all tests passed?** No. Independent RQ was **CONDITIONAL**, with an owner-approved exact-SHA exception. The Full command actually exited 1 due to OS child-process exhaustion, and `test:root` was not reached in that run. The facts and independent composite-coverage rationale are recorded in [release status](../release/V0102_RELEASE_STATUS.md).

**Is this release's exception a policy for the next release?** No. `EX-v0.10.2-R01-FULL-OS-01` applies solely to the reviewed tagged SHA. Do not copy it as a waiver for another version.
