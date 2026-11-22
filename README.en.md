# DomainHarness 0.11.x — single embedded SDK

A clean Element-First TypeScript monorepo with four **internal** workspaces: Contracts, private Composition implementation, Microkernel, and the sole **public** `@kaicreator/domain-harness` SDK. Consumers do not install an independent BUILD package or Forge. Historical code is in Git history, not the build graph or this source tree. Requires Node.js 22.12.0+. Run `npm ci && npm run verify` for the complete single-domain-app acceptance demo.

Maintainer walkthrough (Chinese): [code architecture and call flow](docs/architecture/DOMAIN_HARNESS_V0110_CODE_AND_CALL_FLOW.md).

The v0.11.1 T11–T14 and R53/R58 scoped architecture fixes are reviewed and integrated. [R60 #1656](https://github.com/kaicreator-mm/domain-harness/issues/1656) owns all remaining v0.11.1 optimization work, including standard JSON/YAML Reader extraction; none of it is deferred into v0.11.2. No public 0.11.x release is claimed.
