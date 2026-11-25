# DomainHarness · 工程质量、日志、配置与证据

> [权威目录](./README.md) · 工程质量 **CONFIRMED**；v0.11.1 已删除旧 Target/Pin 实现及其专属测试，保留适用的行为回归并通过 R160 独立复审。

## QA-01 · 正确性在生成期

人/Agent/工具作为作者负责生成和修改 TS Package/Element/Function、元数据、Order、依赖和业务行为的正确性；可使用 `tsc`、ESLint、测试、正常 npm 工具与实际必要的静态检查器；SDK 运行时不重新证明。

## QA-02 · 提交前验证

代码提交和 PR 前运行适用的语法/Typecheck/Lint/修改相关测试及必要正反例。失败先修复或记录 BLOCKED；不虚报 PASS。当前环境能等价验证就先自身验证；真实外部 Host/Registry/OS 需要时才使用 Woodpecker，不重复无必要 CI。

## QA-03 · GitHub / 独立审核

有限 Task DAG、Exact SHA、独立非 Writer Review、真实 Woodpecker/测试收据。历史审核不自动涵盖新 SHA。遇 CI 失败查实际第一失败步骤、脱敏错误与重现方式；不创建持续运行的本地 Agent 任务。

## QA-04 · 新架构验收样例

必须验证静态 import 的 KDP/Standard/Business；元数据 Order=0 和有序核心链；生成期拒绝 Order 重复/非法依赖；无 Init Package 跳过、有 Init 明确执行；原生 Package Function 与 Element public/static/#private；重复 Init 策略；实际进入逆序 Exit；业务 Workflow 通过 Standard XState 产生成功/UNKNOWN/ASK/WAIT；KDP 未处理异常记录日志、尝试 Exit；真实 npm 安装消费者只直接依赖 SDK。

### QA-04A · R139 的并发与 Workflow 负例 Oracle

须按 [LIFE-10..12](./lifecycle-workflow.md) 增加可复现的测试：Promise 屏障暂停 Init 后关闭、父 Init 并行子依赖一支失败后进入受阻；关闭完成后不允许再启动 Core/Business/未登记资源；同步 Exit Hook 重入及并发 dispose 每实例仅释放一次。保留原始失败对象，并在多个 Exit 抛错时继续清理。

使用真实 XState：带敏感标记的初始 entry 同步异常须以**子进程**证明调用者仅获得一次 FAILED、宿主正常退出、stderr 不含标记；同步/异步 self.stop 均有界返回 WORKFLOW_STOPPED，void done 可以成功，同步和异步 error 不能双重观察。strict TS 编译期负例必须拒绝不兼容的 Actor 输入类型。

旧 [#1605 F09/AC12–20](https://github.com/kaicreator-mm/domain-harness/issues/1605) 根预算共享、祖先深度、多 JSON/YAML Reader 复用、异步 Hook end 等待、具名 Switch UNKNOWN/FAILED 路由必须在新 Standard/Business 中保留。未运行项标记 NOT_RUN，不以单节点成功替代完整业务覆盖。

### QA-04B · 单一 SDK 公开 API 与 npm 消费者

新语言原生 L2 必须独立列出 SDK Root/子路径、明确的运行时导出名称和类型入口。测试期望集合不能根据被测的 `export *` 模块本身 `Object.keys` 动态推导，以免新泄露的内部 helper 被自动接纳。真实干净 npm 消费者项目**只直接声明 `@kaicreator/domain-harness`**，通过 npm 安装 SDK 内部传递依赖；测试公开入口类型、真实模块调用以及未承诺内部入口拒绝。业务若自行直接 import xstate，应在业务 package.json 直接声明 xstate。不能把 SDK/Contracts/Microkernel 三包均列作消费者直接依赖并声称满足单一 SDK 验收。

## QA-05 · 旧执行模型清理

迁移后删除/重写旧 `FunctionRef/ImplementationBinding/SelectedFunction/Target`、`PackageSystem` 动态调用、`Lock/Pin` 自定义安装校验和静态 JS 子集运行时门禁对应的代码/测试。不能为了旧系统限制 TypeScript 正常语法；npm 供应链/可控 lifecycle scripts 等仍可作为交付政策。

## QA-06 · 日志与错误兜底

业务预期错误由 Element 处理；框架最终未捕获异常提供结构化脱敏日志和真实 Exit Hooks，原始根因可诊断；退出失败继续尝试其它清理，不假定强杀或断电必然执行退出。Exit 失败日志至少包含受控组件标识或进入序号、错误阶段和脱敏原因类别；两个资源退出失败必须可区分，不能输出敏感异常原文。嵌入式 SDK 将失败交给宿主处理，CLI 根据自身协议映射退出码，SDK 不代替宿主擅自调用 process.exit。

## QA-07 · 配置

交互式应用可先以受限配置界面启动，配置完成再允许业务操作；CLI/服务/容器遵守自己的启动参数/环境约定。SDK 不强制具体 UI 或配置文件格式。

## QA-08 · 版本与质量边界

v0.11.x 是完全重写，不提供 0.10.x 运行时兼容桥；现有 Workflow/Reader/Outcome 有用能力迁移新 Class，不因删除旧 Adapter 丢失业务功能。性能和业务资源预算按具体标准组件需求验证，不虚构普适恶意输入沙箱承诺。

## QA-09 · SDK 标准实现与 Agent 优先消费

依据 [CORE-13/14](./core.md)，新能力或 API 的设计与交付应明确：

- 以真实领域需求识别非领域专有重复职责；对有实际复用价值的候选，按 [EL-08](./element-package.md) 证明两个用途的可观察复用，提供具有行为和测试的 Standard 默认实现或原生函数，不以抽象接口、空壳、复制示例、强制业务重写替代。可由 Business 提供领域规则/数据/专业计算、通过原生组合或继承扩展；原生基础能力已足够时无需另造封装。没有证据的抽象保持候选，不强制提前实现。
- 面向 LLM/Agent 优先考虑公开入口可发现、命名一致、类型明确、调用前置条件/结果/失败/副作用/资源归属可理解、默认路径短且可组合。以同一公开 API 支持人手工编写和维护；不要求额外 DSL、代码生成器或隐藏项目上下文。规范原文唯一；Skill 导航、TSDoc/JSDoc 和可运行示例服务生成者，不构成第二套规范。
- 新增或实质改变的 Standard 能力，应使用真实消费者验证通用实现而非各领域独立重写。按变更范围验证陌生生成者（LLM/Agent）凭公开 SDK、规范、Skill 和必要的领域需求生成/修改应用；检查实际生成代码、真实业务正反例、依赖闭包与重写通用机制的情况；人类手工使用路径通过同一公开 API、原生工具及示例验证。交互/代码量等可作为比较证据，不以少行数、少调用或单次模型成功代替业务正确性。未验证项明确 NOT_RUN，不因规范更新宣称历史实现已经满足。

上述是 SDK 设计/生成/交付质量原则，不新增 Kernel 运行期校验、不改变既有静态可信模型或阶段范围；生成者仍负责 Package、Element、领域实现的正确性。具体新能力在其归属版本定义和验收，不自动启动后续版本。

### QA-09A · 版本收口的组件抽象与质量检查

在新增能力进入真实领域消费后，按实际源码、领域用例和独立缺陷证据进行一次版本级有限工程复核：组件责任/命名、直接依赖和循环、公开类型及错误/副作用语义、同步/异步边界、可复用的重复逻辑、测试可判别性、规范/README/Skill 与实际安装入口。优先抽取已证实的相同实现为非公开原生函数；保留领域专有知识、选择 reducer、权限、外部业务及资源所有权，不为统一外形增设 Element、Registry、Runtime 或公共 ABI。公开面不得因内部重构扩大；独立期望集合、安装包实际内部依赖存在及未承诺子路径拒绝继续验证。实际缺陷在所属版本整改，受影响行为、边界/负对照、Exact SHA 和适用 CI 记录；不以行数或测试数量推定质量，也不重复无关版本全面审核。真实复用和未适用项仍按 QA-09 和冻结产品 Oracle 裁定。

R48 #1750 是 0.11.3 的具体应用：内部语义数据/有限拓扑函数收敛、同一取消信号在分析和处理中可用，两域业务仍独立拥有实际专业操作/授权；R49/R51/R53/R59/R62 已完成 T32–T34 与相关有限整改；T35 按本条再次复核，#1759 修正候选待独立验收。本条不新增运行期 Package/Element 正确性检查。
