# DomainHarness 0.11.x — Domain / Harness / SDK 三名称与临时自举种子工具（R34/R35）

> **0.11.x 独立完成 DomainHarness SDK；DomainForge 暂缓。** 本规范与 [SDK 生态、自举和 Forge 暂缓说明](DomainHarness_v0.11.x_SDK_FORGE_ECOSYSTEM_BOOTSTRAP.md) 一起构成最新 Owner 范围。历史 R33/R34 要求“先完成 Forge Domain App 才能验收 DH 0.11.x”已经撤销。唯一 Forge 状态记录：[Forge #218](https://github.com/kaicreator-mm/domain-forge/issues/218)，**不阻塞 DH**。规范不是源码已经完成的证明。

```ini
OUTPUT_LABEL=DH_V011X_R35_THREE_NAMES_SEED_ONLY
MASTER=#1563
FOUNDATION=#1564
GOAL=COMPLETE_DOMAIN_HARNESS_SDK
DOMAIN=BOUNDED_KNOWLEDGE_FACTS_RULES
HARNESS=BOUNDED_TASK_EXECUTION
SDK=REUSABLE_BOOT_PLUS_DOMAIN_PACKAGE_CONTRACT_AND_ASSEMBLY
SEED_TOOL=TEMP_DH_ONLY_NOT_PUBLIC
SEED_TOOL_ISSUE=#1647
FORGE=DEFERRED_FUTURE_CONSUMER
FORGE_BLOCKER=FALSE
SDK_SELF_HOSTING=SEED_SDK_TO_NEXT_SDK_NO_FORGE
```

## 1. 三个名称分别是什么

| 名称 | 定义 | DomainHarness 0.11.x 的落点 |
|---|---|---|
| **Domain** | 有界领域身份、对象、事实、知识、来源、规则、Applicability、业务流程和版本；回答“**在哪个领域、哪些条件与知识有效**” | DomainDefinition、Content/Element、领域知识和规则的普通 Domain Packages |
| **Harness** | 已选 Domain 内 Task/Workflow、确定性状态、受限模型/Tool/Effect、权限、预算、异常与反馈经验；回答“**怎样稳健且可验证地执行领域任务**” | Boot/KDP、各阶段普通/Standard Domain Packages 所提供的任务执行、观测、进化能力 |
| **SDK** | 可被其它应用真实安装、嵌入、选择 Package 并启动 Domain App 的公共合同和 API；回答“**怎样基于统一机制搭建应用**” | 最小 Boot、Package Schema/Assembly/Target/Host、SDK facade、通用 Standard Elements、可安装 Consumer |

**全名**：DomainHarness SDK = Domain-bounded Harness Software Development Kit。0.11.0–0.11.9 是这个 SDK 的**一个完整重写的多个内部阶段**，不包含 DomainForge 产品的开发。**SDK 自身也由同一 Package 协议和 Boot 构成**，仅允许极小可信根/固定种子编译作为第一代运行前提。

## 2. 临时、仅 DH 自用的 Domain Package Builder

为了先用 Domain Packages 构成第一代 DomainHarness SDK，允许项目保留一个**非常小的、临时的种子 Package 生产工具**：

1. **只为 `kaicreator-mm/domain-harness` 自己生成固定集合的基础 Core/SDK/Standard Package**；不能接收外部业务 Domain、生成任意新 Agent/业务规则、调用在线模型、服务其它仓库。
2. 从明确登记的本仓库源码/Manifest/Content/Target 生成标准 Domain Package 与可核对摘要；完成后**仍须由同一 SDK Assembly/Lock/Pin/Boot** 审核，不能让自有产物绕过 Direct Extension/Order/Function/Resource 权限。
3. 作为内部构建脚本/工具放置在 `tooling/bootstrap-seed/` 或 `scripts/bootstrap/`；**不导出到公共 SDK、不成为大型 BUILD 平台，不另建 Compiler/Kernel/Package System/Lock**。
4. 参照已有 `examples/basic-domain-app/consumer.mjs::authoring()` 的最小真实示例，但它当前只是 Demo Fixture，不可冒领为已通过 SDK 自举。
5. 对第一次和后续必要的 **DH 自身** SDK Package 构建均可使用此工具；在 **整个 0.11.x 内不依赖 DomainForge 替换它**。未来 Forge 能基于已完成 SDK 生产同义包后，才将此工具作为参照并视需要移除/冻结。
6. 仅用真实产物与独立 Consumer、固定可追溯源/目标/Pin 和受影响正反例证明完成；当前源码实现和完整自举仍 `NOT_IMPLEMENTED`，有限任务归 [#1647](https://github.com/kaicreator-mm/domain-harness/issues/1647)。

## 3. 现成 Domain Packages 构建多种 SDK App

```text
DH-only Seed Builder ──→ DH 基础 Domain Packages ─┐
其它现成合格 Domain Packages ─────────────────────┤
                                                ↓
                      DomainHarness SDK Assembly/Linking
                                                ↓
                       Boot + 已选 Package + Host/Target
                                    ├─ DomainHarness SDK 自身
                                    ├─ CLI Domain App
                                    ├─ Server/API Domain App
                                    ├─ Client/UI Domain App
                                    ├─ Agent/领域 Harness App
                                    └─ 其它普通领域业务 App
```

应用并不需要实时依赖 DomainForge；DomainForge 是**SDK 完成之后**才能开发的普通 Domain App，今后才使用这个相同机制生产新的 Domain Packages。对各种 Host Target 的能力必须分期实证：已通过 Node ESM 不自动证明 Browser/Mobile 真正支持。

所有 App 共享 ElementRef/FunctionRef、Package/Core.Order、Init/Exit/直接 Extension、已选 Target、可信 ResourceRef 和 Boot/KDP；SDK App 只是在同一 Package 构造基础上进一步**向其它开发者输出可复用 API**，不是一个新的特殊 Package 类型。

## 4. 不经过 Forge 的 SDK 自举

| 阶段 | 可证伪目标 | 所需证明 |
|---|---|---|
| Stage 0 | 最小 Boot 与固定 DH 源，Seed Builder 输出真实 DH 基础 Packages | Package/内容摘要、固定 Target、正确拒绝非法直接依赖 |
| Stage 1 | SDK Assembly 选择、验证、装配这些 Packages，产出可安装且能 Boot 的第一代 SDK | clean-packed Consumer 使用 SDK 真实 API 组装至少一个独立领域 App |
| Stage 2 | 以前一代 SDK 的公共 Assembly 对更新/再生成的 DH 自有 Packages 进行装配，得到**下一代 SDK** | 下一代 SDK 同样可消费自身和代表性领域 App，且合法性/Target/Pin 可复现 |
| Final | SDK 全部 0.11.x 功能与 Stage 0–2 受影响正反例可信 | 独立 Exact-SHA 审核；**不包含 Forge App/Package Producer 的运行 E2E** |

这证明的是 **DomainHarness SDK 自己通过普通 Domain Packages 被构成并能继续装配下一代 SDK**。它不要求 Forge 在当前版本完成，也不意味着 Kernel 可在没有任何固定可信编译器/Boot 的情况下凭空启动。后续 Forge 取代临时种子工具属于 Forge 的后续资格，不影响本版完成。

## 5. 历史 BUILD 的边界和版本规范

现有 `tooling/build/src/build.ts::buildApp` 主要接收已经生成的 `packages/roots/artifacts` 并完成已选资源/依赖闭包、权限/Host/Target/Lock/Pin 的安全组合；它是 SDK 组装能力的历史实现名，不是整个生态的通用新 Package 生成器。

- **SDK 保留**：公共 Contracts/Package Assembly、可信摘要/资源验证、Core.Order/Direct Extension/FuncRef、Boot/KDP/目标执行、所需 Host Adapter。
- **Seed Tool 临时保留**：仅为本项目基础 Domain Package 生成，未来可作为 Forge 生产器实现参照。
- **不必要的历史 BUILD**：重复引擎、双 Lock、为所有领域写通用源码生产器、无产品价值的强制模板/过度编译——不进入 0.11.x 功能目标。
- **未来 Forge**：真正通用的 Domain Package 生产者，**在 SDK 完成后**再根据 [Forge #218](https://github.com/kaicreator-mm/domain-forge/issues/218) 开展；Forge 旧依赖规则的更改也留在那时。关闭且未合并的 Forge PR #217 不影响 DH 继续推进。

**每个 0.11.x 版本的最小检查**：交付对象是否是 Domain/Harness/SDK 的可复用能力？是否通过普通 Package/Boot 复用？是否将 Package 生产错误加入公共 SDK？是否能完全不运行 Forge 进行构建、测试和验收？只有真实证据的内容才能升格为已实现。

**阶段责任**：#1564 负责基础 SDK/最小 Seed，#1612–#1619 负责新增 SDK 能力，#1563 负责统一 SDK 产品和其自身 Package 化/自举合格。此文件不要求 DomainForge 的任何 Task 作为当前阶段前置。
