# DomainHarness · 作者期组合、安装信任与安全权限

> **权威**：本文件是 [DomainHarness 规范集](./README.md) 的组成模块；所有模块共同构成**一套**规范，不是独立规范版本。
> **状态**：`CONFIRMED`=已确定原则；`MIGRATION_REQUIRED`=目标明确但机器合同/源码未迁移；`CANDIDATE`=待决策。不得从规范条款推导源码或 CI 已 PASS。
> **条款编号**：保留原 R90 单文件规范的编号以便 GitHub Issue、Review 和旧链接溯源；跨文件引用以目录索引为准。

已合格的 Package/Element 可以由任何作者生成；作者期 SDK /composition 只负责 App 组合与封存，不要求待创建的 App 先 Boot；运行期 /runtime 不产生第二套生成或组合机制。

## 6. 生成、作者期组合与封存、可信安装 — CONFIRMED 方向 / MIGRATION_REQUIRED 归属

1. SDK 同时服务**作者期**组合已有 Packages（`/composition`）与**运行期**选定 App（`/runtime`）。两个入口属**同一个** SDK 产品与一致的 Contracts/Lock/Target 安全模型，不新增外部强制生成器/组合服务、第二 Kernel/Runtime 或独立 Forge 服务。
2. Package 本身是文件，**不需要由特定工具生成才合法**。Package/Element 正确性（结构、语义、声明、依赖、实现、Schema、测试）由其**生成者/作者在生成或修改阶段**负责；可以自选独立 Validator、编译和测试工具，不强制自动生成器。真正组合/发行 Domain App 时，应消费已经合格的产物，按选定 Target 形成确定性 Lock/Pin/安装闭包；**组合成功不代表 SDK 证明了 Package/Element 正确性**。
3. 生成者/作者应在**生成、修改及发布前的静态验证链**证明依赖、Owner、资源和 Target 合法，不能只相信 Manifest 声明；无法证明的动态跨包调用、未声明 Extension、错误 Owner/资源/Target、npm lifecycle 执行均应**在产物交付前失败**。App 组合与封存可以消费证明并做必要的确定性闭包与封存一致性检查，但不能把领域正确性责任转给 SDK。运行时**不得解析源码来重做静态导入图、Schema/依赖合法性或 Package/Element 正确性**；Boot 只对可信锚点及已封存的身份/字节实施最小验证。
4. **作者期组合代码若属于同一 SDK，应有 SDK Domain Package + 内聚 Element 实现所有权**（MIGRATION_REQUIRED）；但它仅负责**组合与封存**的已定义技术行为，不承担候选 Package/Element 的正确性证明。新 App 尚未组装，不能要求先 Boot 它自身才能执行 `buildApp`；公共 SDK 可以通过已安装 SDK 的静态作者期入口调用 Composition Element，不能让 App Runtime 获得 App 组合/生成期特权。独立的生成/验证工具可以完成候选正确性验证，SDK 不得强制绑定某个生成者。
5. 允许将逻辑 KDP、SDK Packages 物理 bundle/融合发行，前提仍能证明原有逻辑身份、Layer/Order/显式授权/Init/Exit/Target/摘要。**物理一个 tarball 或 ESM bundle 不等于一个逻辑 Package**。
6. 不做通用多语言装载器；当前实际工程为 Node ESM Profile，最低 Node `>=22.12.0`。标准层可描述另一语言的独立 App；不得从 Node 24 CI 推出 Node 22 全 OS 组合已独立 E2E 证明。
7. 不引入 DomainForge、Seed Builder 或自动生成器作为当前 SDK 的前提；可按实际必要写轻量独立 Validator，只负责验证已有文件，不控制谁生成文件。
8. Runtime/Package 的安全声明仅限静态选定、直接访问、受信字节/摘要/权限等真实可测范围，不将此视为任意第三方 JS 代码的通用沙箱。

### 13.4 信任边界、资源与外部 Effect — CONFIRMED

- **生成期负责正确性，运行期只兜底**：创建/修改 Package、Element 的主体在生成期完成 Schema/依赖/实现/测试与必要静态证明；App 组合与封存阶段消费合格产物并确定性封存已选闭包。Boot 仅验证受信安装锚点、Pin/Lock/选定 KDP 字节的必要完整性；KDP 运行已选能力并对技术故障、Exit 作最后兜底；领域行为归各自 Package。**SDK 禁止运行期重扫 JS/ESM 实际源码、重构依赖图、解释静态规则或证明 Package/Element 正确性**。
- **最小资源原则**：Init/Function 获得的可读资源句柄只应来自其已选 `SelectedFunction.resources` 及明确的直接 Extension 授权，不从整个 Lock 全资源列表隐式派生。HostPort/Effect 必须有专门合同，`effect:'none'` 的纯格式 Parser/Writer 不因此具有 fs/network 写权限。
- **第三方依赖需精确 Target/版本/可重现安装与完整性证据**；当前 Node Profile 通过受审的 SRI/Registry 与 `--ignore-scripts` 安装路径证明必要可信边界，不能将“已有 npm 依赖”理解成支持任意生命周期脚本/任意动态 Import。
- **威胁模型和保证范围必须明示**：对合法被选代码的权限、完整性和资源选定可作有条件的限定验证；当前方案不是通用任意恶意 JS 隔离沙箱，也不保证任意巨型 JS 对象的绝对内存/CPU 上界。

### 13.4.1 可审计的“正确性 vs 完整性”判据（R118）

| 阶段 | Owner | 允许/必须 | 禁止以此替代 |
|---|---|---|---|
| 生成/修改 | Package/Element 作者、Agent、生成者及其验证流程 | 合同/Schema/功能、依赖与资源静态分析、Target 证明、单测/用例、产物摘要与可追溯证明 | 运行期 SDK 自检 |
| App 组合与交付 | 组合/发行主体（可使用 SDK /composition 或独立工具） | 选择既有合格产物、受限技术一致性检查、生成/封存 Lock、Pin、记录、明确安装来源 | 把组合结果当领域语义正确性证明 |
| SDK Boot | 最小可信入口 | 以受信安装/发行来源为锚，比较已封存身份、必要摘要、边界和入口；拒绝异常 | 在每次启动时用 AST/lexer 重新证明完整 JS import/Package DAG |
| KDP/Package Runtime | 各自职责 Owner | 精确执行已选函数、必要授权/生命周期/故障处理及最后 Exit | 自动修复非法 Package、Domain Rule 审核、重新生成 App/Package 或静态验证 |

**重要**：`closureDigest`、`recordDigest` 是一致性/完整性摘要，不是数字签名或受信来源。若 Lock/Pin/Record 可被同一攻击者同步改写，仅增加一套 SDK 源码解析器无法建立生成者身份信任，应当在生成交付侧提供真实的受信锚/不可变安装证据，并界定安装/本地攻击者威胁模型。允许有限的启动时字节检查；**不允许把它扩大为运行期正确性验证引擎**。
