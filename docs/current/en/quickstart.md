# DomainHarness v0.10.2 — Quick start

[Documentation index](index.md) · [中文版本](../zh-CN/quickstart.md)

## 1. Requirements
Use the **Node24** profile physically qualified for the released source. There is no product requirement for an OS vendor or RAM size. Public workspace manifests remain at `0.10.2-rc.0`; the Git tag does **not** establish npm registry publication.

## 2. Check the smallest source fixture

```sh
git clone https://github.com/kaicreator-mm/domain-harness.git
cd domain-harness
git checkout v0.10.2
node --version            # use Node 24
npm ci
npm run build
node examples/v0102-package-authoring/projection-smoke.mjs
```

This checks **static** Component selection, not a standalone end-user App. For the real installed producer/Tiny/Rich consumer integration fixture use:

```sh
node --import tsx --test tests/integration/v010-clean-consumers/clean-consumers.test.ts
```

These are **commands to run**, not newly executed evidence. Record actual EXIT and failing IDs; do not infer a new RQ PASS. Historical authoring `NOT_RUN` annotations in the old candidate docs are as-of snapshots.

## 3. One honest integration workflow
1. In a **separate BUILD producer**, choose exact K and S primaries, at least one B, plus only needed C/S Features; verify source bytes, ABI, imports and intent/operation routes.
2. Call `buildV10App` to seal a trusted **plain-data** App. Runtime never compiles/reselects packages.
3. An application Host supplies `V10DocStore`, actual caller `queryAuthority` and deployment identity, then calls `load(prebuiltApp, options)`.
4. Use `send`, scoped `query`, async `subscribe` and `stop`; selected K owns durable decisions, replay and effect permits.
5. Select Rich SQLite for physical multi-process CAS; Tiny example file store is single writer.

Proceed to [SDK API](sdk.md), [Package authoring](packages.md) and [Host](host.md). Do not treat snippets with undefined `prebuiltApp` or `options` as turnkey programs.

---

**Version:** immutable tagged runtime `cee14399d9d0af4e20e34b9111861b16a465b690`. RQ **CONDITIONAL** (Full `EXIT1`, root `NOT_RUN` retained). This is post-release explanatory documentation, not a changed ABI.
