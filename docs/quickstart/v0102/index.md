# DomainHarness v0.10.2 Quickstart — external clean consumer

> Language: English. Chinese companion: `index.zh-CN.md`.

Audience: a consumer organization installing the released DomainHarness v0.10.2 for the first time. Everything here uses **documented public exports only** — the four package roots below; there is no supported deep `src/`/`dist/` import.

Release status: v0.10.2 is merged to `main` and tagged `refs/tags/v0.10.2`; its release qualification is **CONDITIONAL** — see `../../validation/v0.10.2/RELEASE_QUALIFICATION.md` before depending on it.

## 1. Install the exact artifact

There is no npm release; consume exact-SHA git dependencies with the `&path:` subdirectory form (pnpm resolves it — npm does not support git subdirectory dependencies). Real Node24 (packages declare `engines.node >=24.0.0`; Node24 is the only physically qualified lane).

```sh
pin=cee14399d9d0af4e20e34b9111861b16a465b690   # refs/tags/v0.10.2 resolves to this commit

pnpm add "github:kaicreator-mm/domain-harness#$pin&path:packages/contracts" \
          "github:kaicreator-mm/domain-harness#$pin&path:tooling/build" \
          "github:kaicreator-mm/domain-harness#$pin&path:packages/microkernel"
# optional Rich Host (real SQLite CAS / durable ports):
pnpm add "github:kaicreator-mm/domain-harness#$pin&path:packages/host-node"
```

Record the exact SHA (and the four tarball/lock provenance) in your own integration evidence. `better-sqlite3` is an optional peer dependency of the Host package, required only for the real SQLite path.

## 2. Know the two published surfaces

```ts
// Producer process — BUILD only. Tiny/Rich runtimes NEVER import BUILD:
import { buildV10App, projectSelectedComponents } from '@kaicreator/domain-harness-build';
const prebuiltApp = buildV10App({
  // sealed K/S/B/C module bytes/digests, routes, hardBudget — see the authoring guide
}); // emit as a trusted immutable plain-data App

// Runtime process — consumes the prebuilt App:
import { load } from '@kaicreator/domain-harness-microkernel';
const runtime = await load(prebuiltApp, { store /* V10DocStore */ });
const receipt = await runtime.send(intent);
const snapshot = await runtime.query(selector);
const subscription = await runtime.subscribe(selector, event => observe(event)); // async
subscription.unsubscribe();
runtime.stop(); // synchronous, idempotent
```

- `./host-seam` (`@kaicreator/domain-harness-microkernel/host-seam`) is the single additional public subpath — a trusted Host bootstrap API for operator processes, **not** a security capability.
- `buildOptions`, `store`, `queryAuthority`, `intent` and selectors are **your application's** explicitly supplied inputs, never SDK globals.

## 3. The process model

1. **External producer** (offline): install selected BUILD + Contracts plus your exact Domain Package payloads; seal the App with `buildV10App`; serialize the plain-data App to an installed App package.
2. **Tiny** runtime: Contracts + Microkernel + the exact selected K/S/B/C payloads; an application-selected `V10DocStore` (in-memory or your own).
3. **Rich** runtime: additionally `@kaicreator/domain-harness-host-node` for real SQLite CAS/durable ports.

The runtime never discovers, compiles or reselects packages. For several Businesses, every selector must identify and authorize its target.

## 4. Things that will refuse you (by design)

- A caller-forged principal/grant as runtime authority — only the Kernel Primary decides admission/effect eligibility.
- Any deep `src/`/`dist/` import, or the private legacy `domain-harness{,-compiler,-node,-expo}` shims.
- Unselected packages/features; generic Business event Hooks; implicit helper→Tool conversion.
- The same `messageId` re-sent with conflicting intent/input (typed conflict, effect never applied twice).
- Node22 or another unqualified Node major.

Typed refusal literals are cataloged in `docs/architecture/V010_TYPED_REFUSAL_LITERAL_CATALOG.json`; BUILD-side families include `BUILD_INPUT_INVALID`, `BUILD_GRAPH_INVALID` and `V10_EXPORT_CONTRACT_REFUSED`.

## 5. Run the worked examples

- `examples/v0102-package-authoring/authoring-template-check.mjs` — the minimal authoring template (S non-Tool Feature + private B helper + read-only/external-effect C modules) sealed, packed, clean-installed and executed from public tarballs, with typed negatives.
- `examples/v0102-external-producer/producer.mjs` — a physically executed external producer over published roots.
- `examples/v010-clean-consumer/` — the Tiny/Rich clean-consumer fixture (its old compiler-oriented install commands are superseded by this page).

## 6. Where to read next

1. `../../sdk/V0102_PUBLIC_API.md` — exact public API and Package/ABI map.
2. `../../guides/V0102_PACKAGE_AUTHORING.md` and `../../guides/SUPPORTED_EXTENSION_POINTS.md` — authoring rules.
3. `../../migration/MIGRATING_V0101_TO_V0102.md` — coming from v0.10.1.
4. `../../validation/v0.10.2/RELEASE_QUALIFICATION.md` — what "CONDITIONAL" qualification means for this release.
