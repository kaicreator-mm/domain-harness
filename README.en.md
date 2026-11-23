# DomainHarness 0.11.x — native TypeScript Domain SDK

DomainHarness v0.11.x is a full rewrite, not a compatibility layer for v0.10.x. It uses **one public SDK workspace**, `packages/domain-harness` (`@kaicreator/domain-harness`), and ordinary Node.js/TypeScript ESM classes, functions and static Package modules. Old Contracts/Microkernel/BUILD/PackageSystem/Lock/Pin/FunctionRef/Target execution systems are superseded, not part of the current SDK.

A Package is a group of ordinary ESM plugin files, an Element is a reusable class, and functions are native exported functions or methods. Optional Package Init/Exit is coordinated by a minimal KernelLifecycle. Workflow/Reader elements belong to the reusable SDK Standard library. Static Package/Element correctness is the **author/generator's responsibility**, with optional generation-time tooling, not a runtime SDK validator.

**Node requirements:** SDK consumer >=22.12.0; this repository's development/verification toolchain >=22.13.0 (ESLint 10.11). Use `npm ci && npm run verify` from the repository to build, typecheck, lint, test generation and Standard behavior, run the native Domain App and verify a fresh external npm-installed SDK consumer.

- [Canonical specification](docs/specs/domain-harness/README.md)
- [TypeScript profile](docs/specs/domain-harness/typescript-profile.md)
- [Native Domain App with Reader budget tests](examples/native-domain-app/README.md)
- [SDK public API](packages/domain-harness/README.md)
- [v0.11.1 implementation Task DAG](https://github.com/kaicreator-mm/domain-harness/issues/1682)

The older Reference Domain App and stage-ledger evidence are historical and remain in Git history at [the former reference app revision](https://github.com/kaicreator-mm/domain-harness/tree/62885289f4236051fa9d3d0f67b968004c5259b2/examples/reference-domain-app). They are not the active v0.11.1 program, a release qualification, or compatibility entrypoints. The v0.11.1 native-only implementation is reviewed and merged only after its own Exact-SHA independent review; passing CI alone does not imply a public release.
