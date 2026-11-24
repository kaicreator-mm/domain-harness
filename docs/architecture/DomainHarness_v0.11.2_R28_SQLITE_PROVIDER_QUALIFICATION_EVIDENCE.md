# DomainHarness v0.11.2 · R28 SQLite Provider preflight evidence (Node 22.12.0, Windows/Linux x64)

```ini
OUTPUT_LABEL=DH_V0112_R28_SQLITE_PROVIDER_NODE2212_WINDOWS_LINUX_FINITE_PREFLIGHT_EVIDENCE
REPO=kaicreator-mm/domain-harness
L2_ISSUE=#1703
FEASIBILITY_ISSUE=#1705
DESIGN_PR=#1704
EXECUTION_EXACT_DESIGN_HEAD=342be8e65f252de1ae74ccbebd3b8d27bd2e3cb3
PROVIDER=@photostructure/sqlite@2.5.0
NODE_VERSION=22.12.0
SCOPE=WIN32_X64_AND_LINUX_X64_GLIBC_2_36
FEASIBILITY=2_OF_2_REPORTED_PASS
SDK_SOURCE=NOT_CHANGED
SDK_CLEAN_PACKAGE=NOT_RUN
SDK_CI=NOT_RUN
R29_SCOPED_REVIEW=PENDING
```

> 本页是**现存真实测试回执的来源索引**，并非另一次独立执行或第三方二进制验证。证据唯一来源是 [Issue #1705 测试 Agent 的完整回执、可重放脚本、环境与文件 SHA256](https://github.com/kaicreator-mm/domain-harness/issues/1705#issuecomment-7117468436)（2026-11-24 07:44–07:56 +08:00）。[PR #1704 的原始回执同步](https://github.com/kaicreator-mm/domain-harness/pull/1704#issuecomment-7117469487)。**R27 审核 P1-01 尚待 R29 独立正式裁定是否关闭**，不能将外部 preflight PASS 直接标为 SDK 完成。

## 1. 已实际见证的两个环境

| 环境 | Node / npm | 见证结果与范围 |
|---|---|---|
| Windows NT 10.0.26300 原生 PowerShell / x64 | Node `v22.12.0`, npm `10.9.0` | `npm install --save-exact --ignore-scripts`、删除 node_modules、`npm ci --ignore-scripts`、无 Node flags 载入预构建二进制、真实 DB 创建/rollback/reopen、**两个独立 Node 进程**同资源/版本条件更新和最终 `version=1,effect_count=1`，全 PASS |
| Linux Debian 12 bookworm / Docker `node:22.12.0-bookworm-slim`, x64 / glibc **2.36** | Node `v22.12.0`, npm `10.9.0` | 与 Windows **字节相同**的 project manifest/lockfile/probe；`npm ci --ignore-scripts`、无 Node flags、真实 DB rollback/reopen、双进程 CAS 效果计数=1，PASS |

同一 `@photostructure/sqlite@2.5.0` 的 tarball 预构建二进制直接加载。manifest **确实含** `install: node-gyp-build`；**本次安装通过 `--ignore-scripts` 禁止其执行**，不等于依赖不存在 lifecycle 脚本。实际没有编译/额外安装产物，tarball 安装文件覆盖 57/57；npm audit 在这些具体执行环境中 0 advisories（非未来安全承诺）。测试 Node `execArgv=[]` 与 `NODE_OPTIONS` 未设。

## 2. 可独立比对的字节证据

| 证据项 | SHA256 / 原始值 |
|---|---|
| npm tarball SHA1 | `dd5ca65afb569d755fd89db23d300d8bc2a1580f` |
| npm tarball integrity | `sha512-ptFPi+81nkacAOi/IDn1K2KNnIgBABkG4qdbQIT1yeIjtCm96ofct+79iyqZm/Uc8Dz7q+kH7JZY5zu2C/ggcA==` |
| `package-lock.json` (Windows/Linux 同字节) | `4c280a9dfb436656e769afa4a69d865356f54d91884209552683f88705d85c4f` |
| `package.json` (Windows/Linux 同字节) | `4a317a2096ac9f1424cce7704545e12436d288913eb718d103f7d9fbb4b060a9` |
| `probe.mjs` (Windows/Linux 同字节) | `4d85c0f7bc2822449394e49c8a97c215fdef62e19779bcc6853ae4b3cfd9ca19` |
| `scan-manifest.mjs` | `cb7e2b88d9304334a2284ea2ffba73c39e8a7f5518bb97e0da0de1e63227ecb7` |
| win32-x64 loaded `.node` | `347497ec0ab88484af279e223f8ee7d087d07804ab29021df3ddddd2b47b5a6d` |
| linux-x64 glibc loaded `.node` | `80c4a04266731d1bbf9b8ca1ca7b8b6d6dabb2663a0a06a4561607183687349f` |
| Linux Docker image digest | `sha256:35531c52ce27b6575d69755c73e65d4468dba93a25644eed56dc12879cae9213` |

**可重放**：#1705 回执包括完整 `probe.mjs`、`scan-manifest.mjs`、`run-phase-a.ps1`、`run-phase-b.sh` 源文和 Windows/Linux 命令、每一步日志位置/exit 与完整预构建文件目录。Reviewer 应对照这份原文验证 CAS 业务逻辑和安装阶段确实包含 `npm ci`，不要凭本页摘要单独签字。

## 3. 诚实保留的失败尝试与未知项

- Linux 第一次装配误用不含 dependencies 的模板 `package.json`，`npm ci` 空转并出现 `ERR_MODULE_NOT_FOUND`；修正为与 Windows **字节相同**的 manifest/lock/probe 后重新执行 PASS。两次日志均由 Agent 声称保留；此类失效应在审核记录中呈现，不得删除历史。
- Win32 ARM64、Linux ARM64/musl、旧 glibc、macOS **没有本次运行证据**。尽管 tarball 内有这些平台的预编译文件及哈希，不能从文件存在推导可加载/可用。
- **本次 preflight 不是正式 SDK 的 `npm pack` / clean SDK-only Consumer**，也没有验证真实 Business App 的配置后首启、已编译 SDK 的 DLL/模块分发、T02 SDK 类型/事务 API、T06 独立外部远程 Host 权威 Effect、lost ACK 和真实 PER_CALL/SESSION。它只证明指定 x64 平台 Node22.12 + ignore-scripts 的 SQLite driver 可运行，以及在**同一个 file-backed SQLite 数据库**上原子条件版本争用。
- `Node >=22.12.0` 的普遍兼容不从这两个精确 Node22.12.0 运行中自动推导，未来其它 Node/ABI 平台需要额外兼容证据；已正式冻结最低 Node 约束**没有改变**。
- 不将 SQLite 本地多进程 CAS 归纳为“独立远程 Host Effect”也享有跨系统原子事务。真实外部 Host 需要各自资源所有者保证条件准入/幂等和 readback。

## 4. 对 L2 决策的精确影响

- **R27 P1-01**（不存在可交付的明确 Node22.12 Windows/Linux Provider witness）：`@photostructure/sqlite@2.5.0` 在上述两平台的可行性门具有真实 PASS 回执，因而**设计层可行性证据已补齐**；由 R29 只读 Reviewer 决定 `CLOSED` 或 `REWORK`，且要求真正 SDK `npm pack` / `npm ci --ignore-scripts` 在实施验收时照合同验证，禁止装依赖时暗中执行 install script。
- **R27 P1-02**：只审 [R28 L2 §6](./DomainHarness_v0.11.2_R26_NATIVE_DOMAIN_INTELLIGENCE_L2_DESIGN.md) 新选择的有限纯 JSON AST 表达式，不以此 Provider 资格 PASS 代替表达式的独立实现。
- **R27 P2-01/P2-02**：只审同份 R28 L2 中同步事务 thenable 回滚/tx 失活与 BoundedQuery 完整性/边界。代码、类型检查、CI 均未运行。
- R29 通过前 **SDK 源码实施 HOLD**；R25 Product/L1 不因本轮证据修改。
