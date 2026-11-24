# DomainHarness · 核心规范

> [唯一规范](./README.md) 的根原则。新架构 **CONFIRMED**，v0.11.1 原生 SDK 源码 **SOURCE_ACCEPTED/MERGED（R160 / PR #1694）**；后续内部阶段仍须逐项实现/验收。DIS 跨语言语义不因 TS Profile 改动。

## 核心架构不变量

| ID | 原则 |
|---|---|
| CORE-01 | DomainHarness 是嵌入 Domain App 的 **SDK**，不是自建组件执行平台、第二 Runtime、必须安装的 Forge 或动态插件商店；对外一个 `@kaicreator/domain-harness`。 |
| CORE-02 | **Package = 插件机制**：组织 ESM 模块集合、依赖与公开导出；插件在生成/安装/编译期静态确定，不要求运行期热插拔。 |
| CORE-03 | **Element = 复用机制**：在 TS Profile 中固定为一个内聚 Class，可继承与组合。普通 helpers 不必成为 Element。 |
| CORE-04 | **Function = 原生函数/方法**：Package 导出函数、Element 实例/静态方法都合法，无需强制归属 Element、动态 FunctionRef 与 Adapter。 |
| CORE-05 | SDK 内置 **Standard Elements** 是语言/运行时基础能力之上的常用**应用级复用能力**。**Business** 用普通代码优先复用适用的 Standard，不满足时创建自己的 Element；二者不是两套根类型。 |
| CORE-06 | KDP、SDK 和 Domain App 同用 Package/Element/Function 模型，区别是业务职责。KDP 是唯一生命周期根，Core.Order=0；K/S/B 不再是三套运行时 ABI。 |
| CORE-07 | DomainHarness 与 App 以**静态、可信、拥有者可控**为前提。正确性、安装及依赖在生成/交付阶段完成；Runtime 不做专用 Lock/Pin/InstalledRecord、权限或静态源码校验。 |
| CORE-08 | **Metadata 是代码的一部分，框架和普通代码读取它并执行**（如 Order）；**Skill + TSDoc/JSDoc 供 Agent** 理解、生成和审查。Agent 也可分析代码元数据。 |
| CORE-09 | Core 按唯一 Order 顺序进入；没有 Init/Exit 就跳过，不创建空 Element；实际进入后反序释放。Order 结构合法性在生成期保证。 |
| CORE-10 | 业务自行处理预期业务错误；非业务的代码/结构缺陷在生成期尽可能消除；未捕获异常时 KDP 最终兜底：脱敏日志、实际 Exit Hook、失败退出。 |
| CORE-11 | 一个 Package/Domain App 的直接执行闭包只有同一种语言与 Runtime。不同语言使用 DIS 语义与各自语言 Profile，不建立多语言混合执行 VM。 |
| CORE-12 | GitHub Exact SHA 与实际测试/审核才是交付证据。规范、源码、CI/Review 资格分开；不虚报 PASS，不因旧 SHA 通过就断言新代码已实现。 |

| CORE-13 | **标准实现优先（Standard Implementation First）**：对有明确、可观察的跨用途复用价值的非领域专有重复性应用能力，SDK 应提供真正可直接使用的 Standard 实现，而非仅接口、抽象类、示例或要求每个 Business 重写。让生成者聚焦领域知识、规则、专业计算及业务组合；不重复包装已足够便利的原生语言/运行时能力，不将领域政策硬编码为标准。具体职责见 [EL-04/EL-08](./element-package.md) 与 [QA-09](./engineering-quality.md)。 |
| CORE-14 | **Agent First, Human Compatible**：SDK 的核心设计目标之一是优先降低 LLM/Agent 理解、生成、组合、验证、修改及维护 Domain App 的成本，同时兼顾人类手工编程。采用清晰一致的原生语言 API、明确的类型/语义/边界、可直接复用的实现、可发现的规范与 Skill 导航及真实用例；不为 Agent 另建必需 DSL、执行 Runtime、专用生成器或第二套 API，不把生成者的正确性义务转移给 SDK Runtime。 |

## 基本对象

- **Package**：插件，是一个或多个 ESM 模块和资源。使用原生 npm 依赖、`import/export`；不要求 Package Class、独立 Manifest 生成器或 SDK Package Loader。
- **Element**：复用单元，普通 TypeScript Class；可有零或多个公开方法、私有代码和资源。组合其它 Element 的 Class 自己也属于 Element，Package 本身不是 Class。
- **Function**：模块公开函数或 Class 方法；直接原生调用，Package 级函数不强制包装成 Element。
- **Standard/Business**：可复用应用能力与具体业务实现/组合。KDP 与 SDK 自身亦可有 Business 代码；调用 Standard 无需经 KDP 中央转发。
- **Workflow**：SDK Standard Element，抽象 Class 定义接口、XState Class 提供实现，业务可直接复用，KDP 不独占。
- **Metadata**：`packageMeta`、Class `static metadata` 等实际可读取的 TS 代码；不维护一套 Agent-only Runtime Schema。

## 三个责任阶段

1. **生成、修改、生成期验证**：人/Agent/工具编写 TS Class/函数与元数据，对依赖、类型、Order、代码行为、测试负责。可以用独立 Validator，不强制生成器或 Forge。
2. **静态组合、编译、安装、交付**：App 明确导入 Package；使用 TS/Node/npm 的标准依赖、`package-lock.json`、`npm ci` 和可信发行流程。没有 DH 专用 App Lock/Boot Pin。
3. **运行**：框架读取执行元数据，按 Order 启动并在退出时清理，业务调用 Elements/Workflow；框架只处理最后未捕获故障。运行期不重扫源码、不动态选择 Function、不审查权限/安装证据。

原 `FunctionRef → ImplementationBinding → Target`、自有 PackageSystem 分派、Boot Pin、App Lock/InstalledRecord 属于 **HISTORICAL 旧执行系统**。历史实现和审计可继续追溯，不再作为新版 Runtime 的要求。术语使用准确的“生成”“生成期验证”“静态组合”“编译打包”“运行”，不以含糊 BUILD 一词替代全部阶段。

## DIS 语义与 TS Profile 的适用边界（R139 P1-5）

DIS v0.2.0 当前引用的是**候选研究文本**；下表是 DomainHarness 0.11.x 的限定采用和差异声明，**并不构成 DIS FULL_CONFORMANCE**。不能将 TypeScript 实现反向宣布为 DIS 语言中立定义的唯一形态。

| 对象/责任 | 沿用的 DIS 领域语义 | 本版 TypeScript 限定实施及验证 |
|---|---|---|
| Package / Element | 职责内聚、领域能力和资源复用；DIS-LANG-01..03 的单语言/Runtime 执行闭包 | Package=静态 ESM 插件模块集合，Element=Class，Standard/Business=用途类别；直接依赖与行为由生成期验证 |
| Function | 正式领域 Function 的输入/输出、结果、兼容性及可验证义务，见 DIS v0.2.0 候选 §§3–5 | 普通 TS `export function` **不自动满足全部 DIS 领域 Function 合同**。确实要发布领域 Function 时，作者应明确业务输入/输出/结果、版本兼容与测试；无需将所有函数包装 Class/FunctionRef |
| 启动 | 有单根入口与可选业务 Init/Exit 的语义 | **只按 KDP Order=0 开始执行一轮 Core Init 链**；不机械照搬 DIS 候选 §6 中 Package 链之后的第二轮 Business App Init |
| 可信组成 | 依赖和交付可审计 | 以静态可信 npm/ESM、生成期检查和交付证据实现；取消 DH 特有运行时 Lock/Pin/Target 证明 |
| 多语言 | 可针对不同语言 Profile 表达同一领域含义 | 一个 Package/Domain App 直接执行闭包使用同一种语言和 Runtime；异语言通过 FFI/进程边界明确隔离 |

Owner [#1685](https://github.com/kaicreator-mm/domain-harness/issues/1685) 为本版适用裁决来源；DIS 仍有独立候选/裁定程序。不要以本映射跳过 DIS 原始领域合同验证，也不因“DIS 兼容”恢复两轮 Init 或动态函数装载平台。
