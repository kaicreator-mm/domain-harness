# DomainHarness 0.11.x — Boot/KDP/基础设施 Element-First 所有权与自举审计（设计候选）

> **STATUS: ARCHITECTURE_CANDIDATE / NOT_OWNER_FROZEN / NO_SOURCE_IMPLEMENTATION**  
> **审计基线**：`version/v0.11.x@e17c71f12b2f76b6ae321961a899e8ba01cbab9a`，对应 v0.11.1 阶段完成后的 doc-only 收尾。  
> **整改入口**：[Foundation 设计先行 Issue #1668](https://github.com/kaicreator-mm/domain-harness/issues/1668)；不修改 v0.11.2 相关 Issue/PR/源码。  
> **新命名规则**：[DomainHarness 命名规范](../specs/DomainHarness_v0.11.x_NAMING_STANDARD.md)。

## 1. Owner 问题及明确回答

**问题 A：KDP 本身既然是 Package，基础设施为什么不按 Package + Element 归属？**

**设计结论：应当统一归属。** 目前不应该用“底层 TS workspace”解释为可绕过 Element 规范的第二套 Kernel。Kernel Runtime、PackageSystem、Workflow 调度、生命周期管理、SDK 可复用组合/验证功能，应逐一明确拥有它们的 Package 和 Element 接口；Function 仍可调用同 Package 内的普通源码 helper，**不必把每个私有 helper 都做成独立 Element**。

**问题 B：Boot 能否完全变成 KDP.Init，消除额外 App 初始化尾巴？**

- **应当将所有实际 KDP/Domain App 初始化与运行编排归到 KDP Package 的 Init Element。** 不应保留一套并行的 `bootstrap → Kdp bootstrap logic → KDP.Init facade → another app init`。
- **不能连“首次可信加载”一起搬到尚未验证的 KDP Init。** 当前 `boot.ts` 在导入可执行 KDP 代码前验证 Pin、安装记录、Lock 和字节。无此先验基础，`KDP.Init` 不能证明自己合法，或者必须先执行代码才验证该代码，构成自举悖论/安全降级。
- 因此真正的结构是**唯一极薄 Boot（验证 + 选定入口解析 + 调用）→ 真实 KDP Package.Init Element → 其他已选 Core/Extension Init → Workflow**，没有第二次业务 Init。是否让公开 `boot()` 保留这个名字由外部 SDK API 决定；**不应有两个实际负责初始化业务的入口**。

**问题 C：数字轮次命名能否作为永久身份？**

不能。当前 `r41-kdp`、`r41.kdp`、`r60-standard-files` 属于实验/任务阶段身份，缺乏稳定领域语义。新命名必须按语义；已验收 SHA/PackageDigest/LockDigest 不能破坏，新身份迁移必须在新审计版本中完成。

## 2. 实际代码审计：逻辑包装与真实执行不相符

| 组件 | 已有实际源或入口 | 现有状态 | 候选整改后的所有权 |
|---|---|---|---|
| Trusted Boot | `packages/microkernel/src/boot.ts` / `verify.ts`（先验证再 import） | 目前拥有必要信任前置 | **唯一物理可信入口**，只做安装/Pin/Lock/Code Integrity 的最低必要校验及受限跳转 |
| KDP Bootstrap | `packages/microkernel/src/kdp.ts::bootstrap` | 校验 Profile/Descriptor、创建 PackageSystem、预选代码/Hook、runInit、AppStatus、DomainApp、失败 runExit | 归属真实 **Kernel Package** 的 `dh.kernel.lifecycle/init`；Boot 在可信校验后直接调用本已选 Element 的 Target |
| KDP Manifest/Element | `examples/reference-domain-app/packages/r41-kdp/manifest.json` / `definitions/lifecycle.json` | 声明 Core.Order=0 和 Init/Exit Element，**但实测 `dist/index.mjs` Init 只记录事件并调用 nextCore** | Manifest/Element/Function/Target/实现与上述 KDP 实际执行相对应，消除空壳 KDP |
| KDP 二次 Bootstrap 绑定 | `r41-kdp/dist/bootstrap.js` → `@kaicreator/domain-harness-microkernel.bootstrap` | Re-export 绕开上面 KDP Init 的实际执行归属 | 收敛到一个 Lock/Pin 选定的 KDP Init FunctionRef（除必要极薄信任入口，不保留第二执行业务入口） |
| Package System / Workflow Engine | `packages/microkernel/src/package-system.ts`、`workflow-run.ts`、`workflow-execution.ts` | 当前作为裸 TS 模块运行，源代码真实维护者与 Package ID 分离 | Kernel Package 私有实现文件/Function Target，所需操作由其 Element 受限暴露；不复制第二套 XState 引擎 |
| DomainApp Instance/Exit | `packages/microkernel/src/domain-app.ts` / `process-exit.ts` | 由隐藏 microkernel workspace 创建/清理 | 由 KDP Package 的生命周期与受限可用函数实现；AppStatus ≠ Workflow Outcome |
| Contracts/Schema | `packages/contracts/src/*` | 纯类型、Schema、公共协议、校验 helpers | 整体必须有清晰的 **SDK/Kernel Package 归属**；静态 TS type/私有函数可作为 Package 文件，无需每个 type 都是运行 Element，公共运行能力必须标识 Element/Function |
| SDK Composer/BUILD | `tooling/build/src/*` → `packages/domain-harness/src/composition.ts` | 是作者期工具和公开 SDK API，实现当前未表达为选定 Package/Element | **SDK 作者期 Composition Package + Element Function** 拥有 `buildApp` 等可执行能力；可由当前 SDK facade 静态绑定该版本，而非给运行时 Domain App 私自添加 BUILD 权限；不需要另一个构建服务/Forge |
| Standard/Domain | `r60-standard-files`、`reference-business` | Function 真实来自自己的 Manifest/Element/Target；不依赖轮次 ID 才有合法性 | 保留现行语义合同，通过统一命名迁移 Package 层历史实验身份 |

**具体源码反证**：

```js
// examples/reference-domain-app/packages/r41-kdp/dist/bootstrap.js
export { bootstrap } from '@kaicreator/domain-harness-microkernel';
```

```js
// examples/reference-domain-app/packages/r41-kdp/dist/index.mjs
export async function init(context) {
  events.push({ phase: 'init', packageId: 'r41-kdp' });
  return context.nextCore?.init();
}
```

因此，**KDP 的 Init Element 确实被调用了，但真正的 KDP 启动/Domain App 初始化不是由该 Element 实现**。不能仅凭 BUILD/CI 对所有 Package 的身份检查通过，就把“基础设施全面 Element 化/自举一致”标为 PASS。之前 v0.11.1 接受的是原限定功能/真实参考 App，不包含这次 Owner 新提出的实现所有权强化。

## 3. 自举契约：不留第二个 App 初始化系统

### 建议调用时序

```text
Domain App Host 调用 SDK.boot(pin, installedContext)
  |
  v
[极小受信 Boot，唯一 Package 外可执行基础]
  读取可信安装记录/Pin/Lock
  校验 Target、KDP 包/Element/FunctionRef/Target 摘要、代码字节
  未验证即 REFUSED，不导入 KDP 代码
  |
  v
[Kernel Domain Package: dh-kernel]
  Element dh.kernel.lifecycle / Function init
  KDP 本身初始化 PackageSystem/Actor/资源/Hook
  按受选 Core.Order 和直接 Extension 执行一次 Init 链
  业务 Package.Init 选择业务 Workflow
  DomainApp READY/DEGRADED/BLOCKED/FAILED 聚合
  |
  v
DomainApp 实例可使用；最终关闭/未处理致命错误由 KDP
按实际 Init 进入记录逆序调度各 Package 的可选 Exit Element
```

### 不得破坏的安全不变量

1. 执行任何受选 KDP/业务 ESM 之前，Boot 必须证明受信安装、Pin/Lock/摘要。拒绝路径没有可执行模块副作用；检查并消除 TOCTOU。
2. Boot 不拥有 Schema 业务解析、Core/Extension 遍历、Workflow/XState、AppStatus/业务 Route、Package 的第二次 Init 或可选 Exit 实施。
3. KDP `init` 是 **真正的** Element.Function Target，不是只做事件日志的占位函数。所有内部执行辅助文件属于该 Kernel Package 的物理发布/静态选定闭包。
4. BUILD 对直接 Extension/已选 Target/Init/Exit/Core.Order 唯一性做静态证明；Boot 不运行第二次 BUILD，KDP 不重算授权依赖图。
5. KDP 与 SDK/Business 运行期执行边界仍满足单 Package/单 App 单语言 Runtime、现有 Node22 ESM Profile；不为此增加第二个公开 SDK npm 包。
6. 物理代码可以 bundle 或同文件存放；**逻辑归属和选定引用必须一致**。包装成单 tarball ≠ 取消 Package 身份；拆成多个源码文件 ≠ 自动成为多个 Package。
7. `Exit` 仍于程序退出、显式 dispose 或可捕获的致命错误时逆实际 Init 序调用；非每次递归 Init 返回即 Exit；重复 Init/退出策略由 Package 自主，KDP 只保留最低必要技术记录。

## 4. BUILD 在自举中的特殊约束

`buildApp()` 发生在“Domain App 尚未存在，无法先 Boot 该 App”的阶段。把 BUILD 包成普通 SDK Package + Element 解决**实现身份**，但并不自动解决**谁先选择/加载 BUILD Element**。

必须在 L2 单独证明：

- 作者期 SDK 安装物是一个已经发布/安装且受自身版本和完整性约束的 Package 集合；公共 `/composition` facade 可以确定性定位该作者期 Composition Element/Function，不要求新 Domain App 先有 Lock 才能 BUILD 自己。
- 这个**受控作者期调用入口**不是 Domain App 运行期动态服务发现，不得让任意业务 Package 通过未声明 `FunctionRef` 去调用 BUILD；严格区分作者期与 Runtime 信任域。
- BUILD 仍只有一个确定性组合算法；Schema/Lock/Pin/Target/可调用导出均复用同一契约。不能因包装为 Package 而增加另一个 Kernel、运行时 Package Resolver 或必须安装的 Forge。
- 如果 Contract/Schema 本身没有可执行入口，则作为拥有它们的 Package 的静态文件/资源即可，**没有必要强制每个 TS interface 都变为 Element**。

**这里是关键设计风险**：若试图用“尚未组装的 Domain App”去解析自己所需的 BUILD Package，会产生第二次鸡生蛋问题。必须将“SDK 作者期 Package 内实现”与“已组合 Domain App Package 的运行时选定执行”分清，才能同时满足 Owner 的 Package 归属和现有安全性。该边界目前仍需 Owner/L2 冻结，不能先判已实现。

## 5. 实施与验收边界

- **当前仅候选设计**：可讨论 Package 名称与 Boot Pin/ElementRef 形式，但**不修改已验收的生产 Boot/KDP/BUILD 源码或历史 Reference App**。
- **Source ownership 迁移先于物理重命名**：先让 KDP 真正拥有逻辑及调用链，再将旧 `r41-` / `r60-` ID 迁为有语义的 Package 名；避免换了名字仍是旧空壳实现。
- **重新执行的受限真实验收**：同一公开 SDK 安装的 clean-packed Domain App；Boot 拒绝未验字节/错误 KDP Init Target（无模块副作用）；单轮 KDP/Core/Extension Init、已选 Workflow 正/UNKNOWN/拒绝、RunBudget、可选 Exit/中途失败回滚、SRI、防动态依赖；旧源码 SHA/Digest 保留，新身份只记录新收据。
- **审查原则**：先 Owner 功能/架构意图确认，再 L2、精确 Task DAG、实现、changed-seam 测试与非 Writer 独立审查，P0/P1 未归零前不合并；不冒称之前的 Node24 CI 验证了这个新设计。
