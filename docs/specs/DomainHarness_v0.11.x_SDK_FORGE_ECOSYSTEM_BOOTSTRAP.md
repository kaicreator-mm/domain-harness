# DomainHarness 0.11.x — DomainHarness SDK、Package 生态与独立自举（R33/R35）

> **Owner 2026-11-22 最新优先级**：0.11.x 唯一目标是完成 **DomainHarness SDK**；**DomainForge 当前不可用、暂停开发，绝不作为 0.11.x 的依赖、实现任务或 Release Gate**。DomainForge 未来基于已完成的 SDK 开发，唯一待恢复说明见 [DomainForge #218](https://github.com/kaicreator-mm/domain-forge/issues/218)。此前 R33/R34 中要求在 DH 0.11.x 完成 Forge App、Forge 生产 DH 包与 Forge→DH 跨代闭环才能发布的表述，**一律撤销**。历史 0.11.0/0.11.1 受审源码与安全规则不因定位澄清自动失效。

```ini
OUTPUT_LABEL=DH_V011X_R35_SDK_FIRST_FORGE_DEFERRED
MASTER=#1563
FOUNDATION=#1564
PRODUCT=DOMAIN_HARNESS_SDK
DOMAIN=BOUNDED_DOMAIN_SEMANTICS
HARNESS=DOMAIN_TASK_EXECUTION_CONTROL
SDK=PUBLIC_BOOT_PLUS_DOMAIN_PACKAGES_ASSEMBLY_AND_EXECUTION
FORGE=FUTURE_DOMAIN_APP_AFTER_DH_SDK_COMPLETE
FORGE_STATUS=DEFERRED_NOT_USABLE
FORGE_ISSUE=kaicreator-mm/domain-forge#218
FORGE_POLICY_PR_217=CLOSED_UNMERGED
DH_TEMP_BUILDER=#1647_DH_ONLY
SDK_SELF_HOSTING=DH_ONLY_SEED_TO_SDK_AND_SDK_TO_NEXT_SDK
FORGE_REQUIRED_FOR_DH_011X=NO
CODE_STATUS=DESIGN_NOT_IMPLEMENTED
```

## 1. 三个名称与 DomainHarness 的产品位置

**DomainHarness 是基于 Boot + Domain Packages 组装、可嵌入不同领域应用的领域 Harness SDK。**

| 名称 | 在 DomainHarness SDK 内的精确含义 |
|---|---|
| **Domain** | 有边界的领域事实、知识、对象、规则、适用条件、来源与版本语义，表示“**理解和处理哪个领域**” |
| **Harness** | 面向已选 Domain 的任务/Workflow、状态、受限决策、授权执行、反馈与经验闭环，表示“**如何在该领域内可靠地完成任务**” |
| **SDK** | 可安装、可复用、提供公开 Contracts + Boot + Package Assembly/Linking + KDP/Execution API、标准 Domain Packages 与 Target/Host 适配的开发工具包，表示“**如何构建不同 Domain Apps**” |

0.11.0–0.11.9 是同一 **DomainHarness SDK** 的内部增量阶段；不是多套 Compiler、Agent 或普通领域 App 产品。SDK 自身也由受统一合同约束的基础 Domain Packages 组成，唯一极小 Boot/可信 Seed 可作为启动锚点，不要求凭空自己生成第一条代码。

## 2. Domain Packages 如何形成不同 SDK App / Domain App

```text
固定的自有 Package 源 --(临时、仅 DH 自用 Seed Builder)--> 已有 DH 基础 Domain Packages
                                                       │
任意已存在并合格的 Domain Packages ----------------------┤
                                                       ↓
             DomainHarness SDK 公共 Package Assembly / Linking
                       （校验直接 Extension/Export/Target/摘要/Pin）
                                                       ↓
                        Boot + 已选 Domain Packages + Host/Target
                               ├─ DomainHarness SDK 自身
                               ├─ 普通业务 Domain App
                               ├─ CLI Domain App
                               ├─ Server/API Domain App
                               ├─ Client/UI Domain App
                               └─ Agent / 领域 Harness App
```

不同 Target 的 Host 适配可以渐进实施，Node ESM 已有证明不自动代表 Browser/Mobile 也能交付。SDK 自身与其它 Apps 使用**同一** Element/Function/Package/Init/Exit/Core.Order/Direct Extension/资源合同和受信装配；SDK App 与普通 App 的区别只在对外提供可复用的接口/能力。

**Package Production（生成新领域 Package）与 Package Assembly（装配现成 Package）不是一个“大 BUILD”。**
- **DomainHarness SDK** 必须提供现成 Packages 的最小可信 Assembly/Linking/Boot/Execution，封存版本/摘要/必要 Lock/Pin 并静态拒绝未声明 Extension、缺失 Target/导出等。现有 `tooling/build/buildApp` 是历史实现名称，不因此变成整个产品。
- **临时 DH-only Seed Builder** 只生成 DomainHarness 自身的基础/SDK Packages，用于第一次及必要的内部 SDK 重构/自举。参照现存 Demo 固定 Package 生成脚本，未来归入 `tooling/bootstrap-seed/` 或 `scripts/bootstrap/`；不得加入公共 SDK、服务任意外部业务 Domain 或创建独立 Kernel/Lock。
- **DomainForge（将来）** 在 DomainHarness SDK 完成后作为一个普通 Domain App，负责从 Domain Data/需求/来源生产新的 Domain Packages。**目前没有可用集成**，不得开始 Forge 工作，不得让该生产者成为 DH SDK 的建构/验收前置。

## 3. DomainHarness 0.11.x 自举验收——完全不依赖 Forge

1. **Stage 0 / Seed**：固定、可审的 Boot + Package Schema/基础源码，使用 **DH 自己的临时 Seed Builder** 产生真实基础 Domain Packages；Seed 不是永久通用 Compiler。
2. **Stage 1 / SDK**：通过唯一 SDK Assembly 校验并组装 Packages，获得可安装、可 Boot、可对外暴露公共 API 的首代 DomainHarness SDK。用独立 Consumer 验证它能组装并启动普通 Domain App。
3. **Stage 2 / SDK 构建下一代 SDK**：更新/重生产 DH 自身 Packages（允许仍使用固定的临时 Seed Builder），通过上一代公开 SDK 的同一 Assembly + Boot 产生下一代 DomainHarness SDK；下一代也可独立组装代表性 Consumer/自身。需要能证明完整依赖、摘要、版本/Host 符合要求，不能凭文档就宣布 `SELF_HOSTED`。
4. **关闭门槛**：真实 Stage 0→Stage 1→Stage 2 E2E、受影响正反例、可复现 Pin/ABI 及必要独立审核。**不包含 Forge 的运行或 Package 生产**；没有 Forge 不阻塞 DomainHarness 0.11.x 完成。

**分代工件流 ≠ 代码循环依赖**：以旧 SDK 装配新 SDK，旧 SDK 不依赖新 SDK 或 Forge；可信最小 Seed 是最终产品自己可维护的必要源工件。未来 Forge 实现之后可以替代临时 Seed Builder、用相同公共 Package Schema 再做生态级闭环，但这是 Forge 后续阶段的资格，不倒填为 DH 0.11.x 的必要 Gate。

## 4. DomainForge 的仅存边界说明

历史 DomainForge Core v0.0.3 R-005 禁止所有 Harness import 是旧技术策略，不符合最终生态定位；**但当前 Forge 尚不可用，Owner 要求暂缓**。这时不修改它的代码/门禁：之前过早准备的 [Forge PR #217](https://github.com/kaicreator-mm/domain-forge/pull/217) 已**关闭且未合并**。将来使用公开 `@kaicreator/domain-harness` SDK 时再调整当前产品依赖政策，旧冻结历史不回写；继续禁止 Forge 越过公开 API 调用私有 KDP/Compiler/Runtime。

**唯一状态 Issue**：[DomainForge #218 — 待 DomainHarness SDK 完成](https://github.com/kaicreator-mm/domain-forge/issues/218)。在这之前不分配 Forge L2、实施 PR、CI/独审或实时 SDK 消费任务。未来 Forge 的停滞、依赖修改、Package Producer 和通用领域内容生产等**不列入** DomainHarness 的 Release 必需条件。

## 5. 0.11.x 的职责及验收

- **#1564（Foundation）**：唯一 Package/Element/Init/Exit/Core.Order/Direct Extension/Boot/KDP/SDK Assembly 基础，必要的仅 DH 自用 Seed Builder（[#1647](https://github.com/kaicreator-mm/domain-harness/issues/1647)）。保留既有已接受安全限制；禁止扩张通用 BUILD 平台。
- **#1605（0.11.1）**：在同一 SDK Package/Boot 基础上实现 Workflow/Task Execution Loop，已通过范围复用，若未变则不重复验证。
- **#1612（0.11.2）至 #1619（0.11.9）**：Domain Intelligence、交互、授权、推理、持久执行、执行证据、客户端/服务器反馈等新增 SDK/Standard Element 资产；**均不等待 DomainForge**，不造第二种 Harness/Build。新 Domain Package 从现成输入与 DH-only seed/示例获得，不能因没有 Forge 生产器而中断当前 SDK 开发。
- **#1563（总控）**：最终验收 **DomainHarness SDK 的 Domain/Harness/SDK 能力及 DH-only Seed→SDK→后继 SDK 的自举证据**，而非 Forge Domain App 的 E2E。无可信证明则显式 NOT_RUN；不得伪造 Release PASS。
- **跨版本校验**：新增内容究竟是 SDK 基础机制、普通 Standard Domain Package、临时 DH-only Seed Tool、还是将来的 Forge 生产？**只有前三类属于当前 0.11.x**。没有 Forge，Package 合同、安全 Pin、版本/Target、运行期权限和真实 Consumer 验收仍必须成立。

本文件是产品归属和实施范围的权威候选；实际 TypeScript 源码迁移、临时 Seed 实现、自举 E2E 仍需有限任务和同 SHA 证据。不得把以前 R31/R32 巨型 BUILD 规划或 Forge 跨仓集成作为前置阻塞。
