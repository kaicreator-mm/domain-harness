# DomainHarness · 作者期组合、安装信任与安全权限

> **权威**：本文件是 [DomainHarness 规范集](./README.md) 的组成模块；所有模块共同构成**一套**规范，不是独立规范版本。
> **状态**：`CONFIRMED`=已确定原则；`MIGRATION_REQUIRED`=目标明确但机器合同/源码未迁移；`CANDIDATE`=待决策。不得从规范条款推导源码或 CI 已 PASS。
> **条款编号**：保留原 R90 单文件规范的编号以便 GitHub Issue、Review 和旧链接溯源；跨文件引用以目录索引为准。

作者期的 SDK /composition 不要求尚未装配的应用先 Boot；运行期的 /runtime 不产生第二 BUILD/Kernel。

## 6. SDK、作者期组合/BUILD、可信安装 — CONFIRMED 方向 / MIGRATION_REQUIRED 归属

1. SDK 同时服务**作者期**组合已有 Packages（`/composition`）与**运行期**选定 App（`/runtime`）。两个入口属**同一个** SDK 产品与一致的 Contracts/Lock/Target 安全模型，不新增外部 BUILD 依赖、第二 Kernel/Runtime 或独立 Forge 服务。
2. Package 本身是文件，**不需要由 BUILD 生成才合法**；仅在真正组合/发行 Domain App 时，需要按当前 Target 检查 Package ID/Owner/Direct Extensions/Function/资源/Target、生成确定性 Lock/Pin/已选可安装闭包。不把 Package 作者工具或验证脚本变成生产必经阶段。
3. 静态依赖合法性应在组合/BUILD 以及最终生成可执行包/链接结果中得到证明，不能只信 Manifest 声明；无法证明的动态跨包调用、未声明 Extension、错误 Owner/资源/Target、npm lifecycle 执行等按当前封存合同拒绝。运行时不重做版本寻优/静态依赖图编译；Boot 仍做必要可信安装验证。
4. **作者期组合代码也应有 SDK Domain Package + 内聚 Element 实现所有权**（MIGRATION_REQUIRED）。但新 App 尚未组装，不能要求先 Boot 它自身才能执行 `buildApp`；公共 SDK 可以以受已安装 SDK 包版本约束的静态作者期入口调用其 Composition Element，不能让 App Runtime 获得未声明 BUILD 权限。
5. 允许将逻辑 KDP、SDK Packages 物理 bundle/融合发行，前提仍能证明原有逻辑身份、Layer/Order/显式授权/Init/Exit/Target/摘要。**物理一个 tarball 或 ESM bundle 不等于一个逻辑 Package**。
6. 不做通用多语言装载器；当前实际工程为 Node ESM Profile，最低 Node `>=22.12.0`。标准层可描述另一语言的独立 App；不得从 Node 24 CI 推出 Node 22 全 OS 组合已独立 E2E 证明。
7. 不引入 DomainForge、Seed Builder 或自动生成器作为当前 SDK 的前提；可按实际必要写轻量独立 Validator，只负责验证已有文件，不控制谁生成文件。
8. Runtime/Package 的安全声明仅限静态选定、直接访问、受信字节/摘要/权限等真实可测范围，不将此视为任意第三方 JS 代码的通用沙箱。

### 13.4 信任边界、资源与外部 Effect — CONFIRMED

- **可信输入位置不同**：作者期/BUILD 根据被选文件和 Target 封存闭包；Boot 只验证已安装锚点、Pin/Lock/执行前 KDP 字节；KDP 只执行已选能力并进行必需运行时信任与生命周期守护；Function 内的领域判断归 Package。不得在运行期重新进行静态依赖寻优。
- **最小资源原则**：Init/Function 获得的可读资源句柄只应来自其已选 `SelectedFunction.resources` 及明确的直接 Extension 授权，不从整个 Lock 全资源列表隐式派生。HostPort/Effect 必须有专门合同，`effect:'none'` 的纯格式 Parser/Writer 不因此具有 fs/network 写权限。
- **第三方依赖需精确 Target/版本/可重现安装与完整性证据**；当前 Node Profile 通过受审的 SRI/Registry 与 `--ignore-scripts` 安装路径证明必要可信边界，不能将“已有 npm 依赖”理解成支持任意生命周期脚本/任意动态 Import。
- **威胁模型和保证范围必须明示**：对合法被选代码的权限、完整性和资源选定可作有条件的限定验证；当前方案不是通用任意恶意 JS 隔离沙箱，也不保证任意巨型 JS 对象的绝对内存/CPU 上界。
