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
