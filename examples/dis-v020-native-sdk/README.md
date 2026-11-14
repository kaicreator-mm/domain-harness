# Native DIS 0.2.0 BUILD → SDK with actual Tally, Runx, xDownload source

This suite is the canonical public-subpath integration test, not another implementation of the domain logic. It imports real Tally/Runx/xDownload functions, uses actual `buildV10App` selected Package bytes, and tests `compileDisV020Aot` → `loadDisV020Aot` → Business App Init → KDP/LOCAL Function calls.

Run from monorepo root after dependencies/build:

```sh
node --import tsx --test examples/dis-v020-native-sdk/native-consumer.test.mjs
```

Source/provenance locks, independent installed AOT digest, no native arbitrary-code OS sandbox and actual authority limits: see [R9 contract](../../docs/standards/domain-intelligence/DIS-0.2.0/NATIVE_ELEMENT_FUNCTION_AOT_R9.zh-CN.md). No real download, cloud machine, GitHub write or release is performed.

TypeScript package export/types check:

```sh
./node_modules/.bin/tsc -p examples/dis-v020-native-sdk/tsconfig.json
```

## Runnable bounded engineering Demo (R111, not formal qualification)

After installing dependencies and building from the **monorepo root**, on
the approved **Linux x64 / Node >=24** engineering target:

```sh
npm run build
node --import tsx examples/dis-v020-native-sdk/bounded-engineering-demo.mjs
```

This is an executable CLI, not merely a test assertion. It selects the
original pinned Tally, xDownload and Orders source fixture, compiles and
loads the AOT into the public SDK, then calls these three actual Function
routes in one running app. The returned JSON includes:

- Tally task evidence: `OBSERVATION`, `UNQUALIFIED_INPUT`, no Task Claim
- xDownload policy: `OBSERVATION`, no acquisition execution
- Orders KDP Intent: `KDP_RECEIPT` with `admitted` **admission only**, no proven Effect

The KDP uses an isolated in-memory test document store. The fixture's
`expectedDigest` is test-provided, **not** an independent production trust
anchor. This is not an independently qualified DKE Producer/ECP, certified
SAP/Root, external Host Effect, formal 16-Core Conformance or Release.
Other targets are rejected rather than silently called qualified.

The mandatory Integration job actually runs the CLI in a separate Node
process and checks its machine-readable JSON output:

```sh
node --import tsx --test examples/dis-v020-native-sdk/public-function-contract-coverage.test.mjs
```
