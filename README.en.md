# DomainHarness 0.11.x — single embedded SDK

A clean Element-First TypeScript monorepo with four **internal** workspaces: Contracts, private Composition implementation, Microkernel, and the sole **public** `@kaicreator/domain-harness` SDK. Consumers do not install an independent BUILD package or Forge. Historical code is in Git history, not the build graph or this source tree. Requires Node.js 22.12.0+. Run `npm ci && npm run verify` for the complete single-domain-app acceptance demo.

Maintainer walkthrough (Chinese): [code architecture and call flow](docs/architecture/DOMAIN_HARNESS_V0110_CODE_AND_CALL_FLOW.md).

The v0.11.1 T11–T14, R53/R58 and [R60 W01–W08 integration #1663](https://github.com/kaicreator-mm/domain-harness/pull/1663) are independently reviewed and merged into `version/v0.11.x`. [R72 ACCEPT_SCOPED P0=0/P1=0/P2=1](https://github.com/kaicreator-mm/domain-harness/pull/1663#pullrequestreview-6012506153) and exact-SHA [Woodpecker #2979 SUCCESS](https://ci.kaicreator.com/repos/18/pipeline/2979/1) cover the implementation. [Task #1656](https://github.com/kaicreator-mm/domain-harness/issues/1656) owns the closeout, not v0.11.2. No public 0.11.x release is claimed.


The v0.11.1 `dh.std.file.json@1.0.0` and `dh.std.file.yaml@1.0.0` (read + write/serialize functions) are now `STANDARD_ACCEPTED` **within the reviewed Node22 ESM selected-Package/Lock scope**. See the [Catalog](docs/architecture/DomainHarness_v0.11.x_STANDARD_ELEMENT_CATALOG.md) for exact evidence, the nonblocking `Object.entries` preallocation caveat, and constraints. Native Node JSON and pinned `yaml@2.9.1` implement formats; serialization grants no arbitrary host filesystem write access.
