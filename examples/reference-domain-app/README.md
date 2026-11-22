# DomainHarness Reference Domain App — v0.11.x 累计真实消费者

**目的**：用一个长期演进的普通 Domain App 真实验证 `DomainHarness SDK + 多文件 Domain Packages → Domain App`，每个 0.11.x 内部阶段只扩展当前阶段具有的 Domain/Harness 能力。本目录不是第二 Runtime、BUILD、Forge、Package Generator 或测试代码库。由 [R77 Task #1664](https://github.com/kaicreator-mm/domain-harness/issues/1664) 管理第一次基线。

## 源码构成（都是实际文件）

- `package.json`：**唯一直接公开 SDK 依赖** `@kaicreator/domain-harness@0.11.0`；内部 Contracts、Microkernel 与选定 xstate/yaml 只允许 SDK 按既有 Lock/SRI 规则安装。
- `apps/reference.json`：普通 DomainApp 描述，Node22 ESM，KDP Core.Order=0，SDK Core.Order=1，Business Core.Order=2。
- `packages/r41-kdp`、`packages/r41-sdk-base`：从 v0.11.1 已受审的手写基础 Package 原始文件复制为独立基线。并非对内部 SDK 的源码别名。
- `packages/r60-standard-files`：已受审普通 JSON/YAML File Element 原始文件快照，包含 `readJson/writeYaml`，明确只有纯解析/序列化，没有未授权 Host 写入。
- `packages/reference-business`：此 App **自己编写**的普通 Business Package，有真实 `definitions/app.json`（Workflow + Init/Exit）、`definitions/rule.json`（确定性 Rule）、`manifest.json` 和 `dist/index.mjs`。跨 Package ESM import 必须经过直接依赖和精确 FunctionRef，且有独立摘要/Target/权限合同。
- `main.mjs`：只使用正式公共 SDK `buildApp`；对两次 BUILD 的 Lock/AppPackage 逐字节一致性、缺失声明 import/错误 Target 摘要做拒绝检查；物化已封存 App Package，然后 **npm lock-only → 前置 SRI 验证 → npm ci --ignore-scripts → 安装后验证**，最后启动 `verify-boot.mjs`。
- `verify-boot.mjs`：在独立已安装 App 根目录中使用公共 `@kaicreator/domain-harness/runtime` 调用真实 Boot，验证 Init/Exit 顺序、业务规则 Workflow COMPLETE/UNKNOWN 与未选 Workflow 拒绝。

虚构 `score` 业务只是最小确定性例子，不是模拟 SDK。真正的 Package/Element/Lock/Pin/Init/Exit/Workflow/标准 File 函数和受控安装都实际执行。

## 运行与验收

本 SDK 尚未正式 npm 发布。已有 SDK 的干净 Consumer 先从所选可信 Registry 安装 `@kaicreator/domain-harness@0.11.0`，再把本目录作为其独立子目录（或待发布后从任何独立目录直接执行 `npm ci`）。在 Reference App 根运行：

```sh
node main.mjs
```

运行需要 Node.js >=22.12.0、合法配置的 Registry、可用的锁定 `xstate@5.33.2` / `yaml@2.9.1` npm 归档。发布前仓库验收可通过 `DH_T05_NPM_REGISTRY=... npm run test:registry`：该测试在同一个独立 Registry Consumer 中运行本目录，而**不是**另建 npm clone / CI 作业。产出 `DH_R77_REFERENCE_DOMAIN_APP_PASS` 和可选 `DH_REF_EVIDENCE=<path>/reference-receipt.json` 结构化收据；退出码非零即 FAIL。

环境变量 `DH_REF_KEEP_INSTALL=1` 只用于调试保留临时 App，正常运行自动清理。**不得把仅写在 README 的 PASS 当作真实验证**；需 GitHub Exact-SHA 绑定 CI/独立 Reviewer。

## 各阶段在同一 Reference App 继续扩展

| 阶段 | 本参考 App 增量 | 历史回归 |
|---|---|---|
| 0.11.1 基线 | Package/Lock/Boot/Init/Exit、JSON/YAML、一个真实 Workflow、完整/UNKNOWN/越权 | 保留受审原始 SDK/Package SHA 与 R77 真实收据 |
| 0.11.2 | 领域 Concepts/Knowledge/Rule/Decision 和 UNKNOWN/冲突反例 | 0.11.1 原组合最小 Smoke，受影响旧 Package 检查 |
| 0.11.3 | Intent/Clarification/Interaction | 仅新增和受影响接口 |
| 0.11.4 | 授权 Tool/Effect 真实执行，拒绝越权 | 既有纯规则不可受影响 |
| 0.11.5 | 受限 LLM 推理回退与预算 | 确定性路径仍不依赖 LLM |
| 0.11.6 | Durable Task 暂停/恢复/取消 | Effect 幂等与 UNKNOWN |
| 0.11.7 | 真实执行证据及授权脱敏 | 未获授权内容不采集 |
| 0.11.8 | Client 侧经验适用性与纯结果复用 | 不热替换现存 Package |
| 0.11.9 | Server 端聚合进化候选 | 真实批准/版本封存，不自动发布 |

每阶段保持只读的版本/制品 SHA、Package/Target/Lock Digest、执行日志与非 Writer 审核证据；历史 `SDK[i]+Packages[i]+App[i]` 独立配对复用轻量 Smoke，不强制 0.11.x 内部跨阶段 ABI 兼容。新 SDK 消费旧 Package，符合当前规范则必须正常运行，不适用则要有清晰拒绝或最小迁移实例。不新造永久 Agent 或全量 CI 笛卡尔矩阵。
