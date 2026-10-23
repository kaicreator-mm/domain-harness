# v0.10 clean-consumer example — Tiny and Rich independently packed Apps

This is the T11 (#1180) physical acceptance recipe: two Domain Apps are
statically BUILT, packed as installable tarballs, installed into separate
clean directories outside the repository, and actually executed as Node24
processes over file-backed SQLite. The monorepo is on the BUILD/review edge
only; no installed process resolves a repository path.

## What is proven

| App | Selected modules | Journey |
|---|---|---|
| **Tiny** | K Primary Basic, S Primary Basic, one Business (`business-order-approval`), its necessary Capability (`capability-quote-tools`) | load → send → authorized scoped query → denied foreign B → restart over the same SQLite file → immutable original-receipt replay (zero new effect) → changed-input typed conflict. Zero K extension / S feature / Agent / model module installed or imported. |
| **Rich** | one K Primary + two physical advisory K extensions, one S Primary + four (v1) / five (v2) physical S features, three C01/Agent Businesses + a WAIT/RESUME Business, four Capabilities (`extjob`, `extnotify`, scoped `memory`, read-only `tool`) | selection and feature invocation, truthful Rule/cache/promoted/Model counts, Agent/Memory/Context with foreign-scope denial, two unrelated external Effect adapters on one K permit contract, permitless typed refusal, duplicate callback, lost-ACK → UNKNOWN → reconcile, 18 turns with a destroyed derived disposition and original-receipt replay, changed-input conflict, two B sharing workflowId+instanceKey with disjoint K02 namespaces and restart, scoped/ambiguous/hidden-B query authority, WAIT across a process restart with single resume and duplicate replay, T08 v2 promotion with the old v1 occurrence pin unchanged, T07 read-only Shadow with zero production writes. |

`rich-race` is the K01 two-real-process competing-writer scenario over ONE
SQLite file: exactly one provider dispatch and one job row.

## Reproducible command list

```sh
# 0. Node 24 + a built repository (npm ci && npm run build)
node --version    # v24.x

# 1. Pack the exact runtime packages (from the repository root)
npm pack -w @kaicreator/domain-harness --pack-destination /tmp/t11-pack
npm pack -w @kaicreator/domain-harness-compiler --pack-destination /tmp/t11-pack

# 2. Isolated BUILD installation (no repository path is imported)
mkdir /tmp/t11-builder && cd /tmp/t11-builder
printf '{"name":"t11-builder","private":true,"type":"module"}\n' > package.json
npm install /tmp/t11-pack/kaicreator-domain-harness-*.tgz \
            /tmp/t11-pack/kaicreator-domain-harness-compiler-*.tgz \
            --registry=http://localhost:14873
cp -r <repo>/examples/v010-clean-consumer ./example   # excluding ./out
node example/build-apps.mjs --out out --source-sha <exact SHA>
npm pack out/tiny --pack-destination /tmp/t11-pack
npm pack out/rich-v1 --pack-destination /tmp/t11-pack
npm pack out/rich-v2 --pack-destination /tmp/t11-pack

# 3. Two ISOLATED clean installations
mkdir /tmp/t11-tiny && cd /tmp/t11-tiny
printf '{"name":"t11-tiny","private":true,"type":"module"}\n' > package.json
npm install <runtime tarballs> <tiny app tarball> better-sqlite3@^12 \
            --registry=http://localhost:14873
npm install-scripts approve better-sqlite3 && npm rebuild better-sqlite3

mkdir /tmp/t11-rich && cd /tmp/t11-rich
printf '{"name":"t11-rich","private":true,"type":"module"}\n' > package.json
npm install <runtime tarballs> <rich v1 tarball> <rich v2 tarball> better-sqlite3@^12 \
            --registry=http://localhost:14873
npm install-scripts approve better-sqlite3 && npm rebuild better-sqlite3

# 4. Execute the App-owned scenarios (each writes a JSON report)
node node_modules/@kaicreator-example/v010-tiny-app/app.mjs \
  --scenario tiny-basic --workdir /tmp/t11-tiny-work
node node_modules/@kaicreator-example/v010-rich-app/app.mjs \
  --scenario rich-main --workdir /tmp/t11-rich-work
# rich-wait-a → rich-wait-b, rich-t08-a → rich-t08-b, rich-shadow,
# and two concurrent rich-race processes complete the suite.
```

The automated equivalent is
`tests/integration/v010-clean-consumers/clean-consumers.test.ts`; run it with

```sh
node --import tsx --test tests/integration/v010-clean-consumers/clean-consumers.test.ts
```

Override the npm registry with `T11_NPM_REGISTRY` when the local Verdaccio
cache is unavailable.

## PACK recipe

`packages/domain-harness-compiler/package.json` exposes the already-built
`./v10build` / `./v10shadow` dist as public subpaths. Since v0.10.2 T01 the sealed
K/S/router/feature payload bytes are no longer compiler subpaths: they ship as the
non-workspace Domain Packages under `domain-packages/**` (`@kaicreator/domain-kernel-basic`,
`@kaicreator/domain-standard-basic`, `@kaicreator/domain-feature-*`), packed by directory
and installed into the builder next to the compiler tarball. Without that, an installed
consumer cannot BUILD or activate a v0.10 App without a deep `dist/` path. No runtime
semantics changed.

## Honest boundaries

- The focused suite ran on the LOCAL Windows Node24 host with real
  `better-sqlite3`-backed SQLite; the Ubuntu Build Host lane is `NOT_RUN`.
- `PR_PASS != RELEASE_PASS`. R01 alone runs the complete regression, hidden
  validation, security and release packaging at one fixed version SHA.
- No JavaScript network sandbox is claimed. The permitless-adapter refusal is
  executable evidence; a private npm/HTTP business-effect bypass remains a
  contract/BUILD/code-review violation (L2 Freeze §3 P2-2).
