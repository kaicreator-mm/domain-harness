# DomainHarness

**Released line: v0.10.2 — Domain Package runtime SDK (Node24; RQ CONDITIONAL).** [Git tag](https://github.com/kaicreator-mm/domain-harness/tree/v0.10.2) is pinned to `cee14399d9d0af4e20e34b9111861b16a465b690`. Source was integrated into `main` via [PR #1387](https://github.com/kaicreator-mm/domain-harness/pull/1387) with identical Git Tree. The **one-release Full exception** and actual test status are explained in [release notes](docs/release/V0102_RELEASE_STATUS.md). Post-tag docs enhancements on `main` do **not** change the tagged implementation.

## Start here / 文档入口

- **[v0.10.2 documentation hub / 文档总入口](docs/v0.10.2/README.md)**
- [中文用户手册](docs/manual/V0102_USER_GUIDE.zh-CN.md) · [English User Guide](docs/manual/V0102_USER_GUIDE.en.md)
- [Architecture diagrams / 架构图](docs/architecture/V0102_RUNTIME_DIAGRAMS.md)
- [Public API cheat sheet](docs/manual/V0102_API_CHEATSHEET.md) · [Package authoring](docs/guides/V0102_PACKAGE_AUTHORING.md)
- [Agent playbook](docs/agents/V0102_PLAYBOOK.md) · [Agent task prompts](docs/agents/V0102_TASK_TEMPLATES.md)
- [Tiny/Rich](docs/guides/V0102_TINY_RICH.md) · [Host integration](docs/guides/V0102_HOST_INTEGRATION.md) · [Troubleshooting](docs/manual/V0102_TROUBLESHOOTING.md)

## Runtime model

**External trusted producer** selects/seals Domain Packages using `@kaicreator/domain-harness-build`; a different **consumer runtime** calls `@kaicreator/domain-harness-microkernel.load(prebuiltApp, {store,...})`. Runtime never imports BUILD or compiles package source. Selected K Primary owns durable State, Admission, Journal, effects, UNKNOWN and Replay. S/B/C implement selected semantics and domain capability behavior. Optional Node Host supplies physical CAS/SQLite and external adapters; it does not replace K authority.

~~~mermaid
flowchart LR
  KSB["Selected K/S/B/C Domain Packages"] --> B["BUILD only: buildV10App"]
  B --> A["Trusted sealed plain-data App"]
  A --> M["Microkernel.load(App, Host options)"]
  M --> F["send / query / subscribe / stop"]
  M --> K["K Primary: state + permits"]
  M --> S["S / B / C: semantics and capabilities"]
  K --> H["Optional Node Host: CAS / SQLite / adapters"]
~~~

## Public packages

| Workspace | Package specifier | Responsibility |
| --- | --- | --- |
| `packages/contracts` | `@kaicreator/domain-harness-contracts` | Shared ABI, types, errors |
| `tooling/build` | `@kaicreator/domain-harness-build` | External static BUILD / projection |
| `packages/microkernel` | `@kaicreator/domain-harness-microkernel` | `load`, facade methods |
| `packages/host-node` | `@kaicreator/domain-harness-host-node` | Optional Node Host and CAS |

At the tagged source, public `package.json` version remains `0.10.2-rc.0`, `engines.node >=24.0.0`; **Git Tag does not equal npm registry publication**. The four historical `domain-harness` / `domain-harness-compiler` / `domain-harness-node` / `domain-harness-expo` workspaces are private references, not new public consumer entries.

## Quick local start on a fixed source checkout

~~~sh
node --version        # use Node 24 (physically qualified)
npm ci
npm run build
node examples/v0102-package-authoring/projection-smoke.mjs
node --import tsx --test tests/integration/v010-clean-consumers/clean-consumers.test.ts
~~~

Commands are recipes and must report **actual exit codes** when executed. For an independently authored consumer use local selected tarballs, not presumed registry packages; see [full guide](docs/manual/V0102_USER_GUIDE.zh-CN.md).

**Release truth:** RQ **CONDITIONAL**, Product 8/8 P0 + 2/2 P1 accepted, owner-held Hidden 7/7 PASS, R01 closed; Full `npm test EXIT1` and `test:root NOT_RUN` preserved under a reviewed **exact-source-only** exception. This is **not** a product OS/RAM requirement or a future blanket waiver.
