# DomainHarness SDK — v0.10.2 current navigation

**Current released source:** [v0.10.2](https://github.com/kaicreator-mm/domain-harness/tree/v0.10.2), SHA `cee14399d9d0af4e20e34b9111861b16a465b690`. **Release = CONDITIONAL**, not a Full test PASS. See [official closure facts](../release/V0102_RELEASE_STATUS.md).

## Current SDK entry points

- [v0.10.2 public API and ABI map](V0102_PUBLIC_API.md) — normative selected public package roots.
- [Source-backed API cheat sheet](../manual/V0102_API_CHEATSHEET.md) — `load/send/query/subscribe/stop` and producer/Host interfaces.
- [Chinese user guide](../manual/V0102_USER_GUIDE.zh-CN.md) · [English guide](../manual/V0102_USER_GUIDE.en.md).
- [Architecture diagrams](../architecture/V0102_RUNTIME_DIAGRAMS.md).
- [Authoring guide](../guides/V0102_PACKAGE_AUTHORING.md) · [Extension index](../guides/SUPPORTED_EXTENSION_POINTS.md).
- [Node Host guide](../guides/V0102_HOST_INTEGRATION.md) · [Tiny/Rich](../guides/V0102_TINY_RICH.md).
- [Agent migration/implementation playbook](../agents/V0102_PLAYBOOK.md) · [task templates](../agents/V0102_TASK_TEMPLATES.md).
- [Migration v0.10.1 → v0.10.2](../migration/MIGRATING_V0101_TO_V0102.md).

## Selected public roots — not historical Compiler API

`@kaicreator/domain-harness-contracts`, `@kaicreator/domain-harness-build` (**producer-only**), `@kaicreator/domain-harness-microkernel` (**runtime**) and optional `@kaicreator/domain-harness-host-node` (**physical Node Host**). The sole listed `./host-seam` is for trusted Host bootstrap but is **not** a permission token. Private legacy workspaces and deep `src/`/`dist/` paths are **not** public.

**Packages at tagged source still have manifest version `0.10.2-rc.0` and Node `>=24.0.0`.** The Git tag does **not** imply an npm registry publish; use exact installed tarballs/source builds until a real artifact distribution contract exists.

## Legacy references — historical

`DomainHarness_v0.1_*` and `DomainHarness_v0.3_*` files in this directory are retained for archaeological/migration use. Their old `@kaicreator/domain-harness` single-package API, old Compiler exports, Expo/Node host claims, and stale qualification language do **not** override the v0.10.2 Microkernel public API. The old v0.1 Agent migration guide is **not** the first choice for a new v0.10.2 integration.

For real code start from [clean installed authoring app](../../examples/v0102-package-authoring/README.md) rather than placeholder names in API sketches.
