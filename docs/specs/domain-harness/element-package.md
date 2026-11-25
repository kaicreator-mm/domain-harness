# DomainHarness · Package 插件、Element 复用与 Standard Library

> [权威目录](./README.md) · 新设计 **CONFIRMED**；旧 Definition/Target/Manifest 执行实现已按 R160 / PR #1694 **SOURCE_REMOVED / MERGED**；新原生业务能力及回归按 R164 / PR #1697 限定验收。

## EL-01 · Package = 插件

Package 以 ESM 模块集合组织能力、资源、依赖和公开入口。插件在生成/安装/编译时由应用显式选择，通常通过 npm 依赖和 `import/export` 使用；不强制 Package Class、独立 npm 工件、运行时 Loader、动态插件系统或特定作者工具。

## EL-02 · Element = 复用 Class

TypeScript 一个 Element 固定映射一个职责内聚 Class，可拥有 0..N 公共方法、静态数据、私有代码和其它 Element 成员。纯知识/规则作为 Element 所拥有的数据，无需强行创造可调用 `run()`；普通私有 helper/文件不必 Element 化。避免巨大综合 Class。

## EL-03 · Function = 原生函数/方法

Package 顶层公开函数直接 `export function`；Element 则通过实例/静态方法提供可用能力。TS `public` 仅说明语言可见性，私有方法适用 `private/#private`；对外模块入口由 `exports` 决定。**Package 函数无需虚构归属 Element 或静态包装 Class**，没有第二套逐函数 Binding/Target 调用链。

## EL-04 · Standard Element

Standard 是 SDK 内置、在 TS/Node/第三方基础能力之上封装的 **Domain App 常用应用能力**。例如 Workflow/XState、领域 Reader 或真实应用中通用的任务协调。Standard 经同一 SDK 已公开的入口使用（当前实现仅公开包根；未来子路径需另行声明并验收），不是所有 Node API 的外壳，不需要强制多 npm 包安装；是否“标准”由稳定、可复用和实际价值决定。

## EL-05 · Business Element

Business 使用普通 TS 代码实现业务；**优先复用 Standard**，不足时再通过组合、继承或自定义 Class 实现。Kernel、SDK 和 Domain App 都可以有 Business 代码；Standard/Business 是用途区别，不是两种类型系统或固定的 K/S/B 技术层。业务代码可以直接使用 TS/Node/第三方库，不强制 Standard 转发。

## EL-06 · 组合自身也是 Element

一个 Class 可以用构造器/字段/方法将多个 Element 组合成业务功能；该 Class 本身是 Element，但 **Package 仍是模块集合而非该 Class**。仅当 Package 需要初始化时才提供可选 Init Element；普通 Standard/Business Plugin 不要求空 Init。

## EL-07 · 生命周期与归属

有 Init 的 Package 使用显式 `Init.start()`；没有则跳过。Exit 使用有需要的 Class `Symbol.asyncDispose`；没有则跳过。重复 Init 与资源拥有权由 Package 决定，KDP 协调实际进入逆序退出。具体约定见 [生命周期](./lifecycle-workflow.md)。旧 `ElementDefinition/FunctionRef/Target/ContentBlock` 的可执行结构仅为历史合同，不应要求普通 TS Class 通过新的自制执行模型调用。

## EL-08 · 激活状态和共享依赖边界

Package 的静态 ESM 模块、可复用 Element Class 与一次 Domain App 激活的可变业务状态是不同层级。业务会话结果、初始化回执、Caller/InitFrom 记录和资源所有权应明确归属到应用上下文或本次创建的 Element 实例；不应默认暴露模块级可变数组/全局注册表来交换激活状态。只需要静态常量的知识/规则数据可以由模块持有；模块常量本身不是 App 全局生命周期状态。

跨 Core/业务传递数据优先使用显式、受 TypeScript 正常类型检查的参数/回调与类组合，不要求框架增加强制 Context 容器、DI 平台或中央信息总线。应用传入的可选回调属于业务协议，不由 SDK Runtime 验证或创建。跨领域抽取 Standard 要依据真实两种用途的可观察复用，而不是仅为了抽象层级数量。

## EL-09 · 能力先行

先以真实需求识别稳定、可命名、可单独说明/验证的能力，按领域语义、知识/信息专家、共同不变量、资源所有权、变化原因及实际复用划界。相同状态不是唯一合并理由；无状态不是拒绝 Element 的理由。业务以 DDD 适用模型表达，技术能力不伪造领域 Entity。

## EL-10 · 封装粒度

Package=能力族/原生模块集合；Element=承担完整契约的内聚原生 Class，可组合、继承、包含无状态算法及不可变知识；Function=可独立运算/转换/操作；Type/Value=数据语义；Private helper=实现细节。比较独立使用、变动影响、共同不变量、调用者所需知识与依赖后选最简单可用形式；禁止按 Class/行/文件数量设目标，禁止空壳、机械 Class 化或巨大综合类。不同权威/生命周期/变化原因可拆分；同一不变量及原子性不可无故拆散。

## EL-11 · 契约

设计稿明确目的/非职责、输入输出、前后条件与不变量、知识及状态资源所有权、初始化/退出、同步异步、预算、错误/unknown/取消、外部副作用与权限、直接依赖、替换边界和实际验证；不强制每个 Element 都有 Init/Exit/状态或外部授权。生成者负责正确性；SDK 只实现本能力自身合同和 KDP 兜底，不承担 Package/Element 正确性验证。

## EL-12 · 组合/深度

对重复的顺序、配对、状态、错误与资源不变量，比较低级函数、现有 Element 组合、新能力对象；真实稳定通用协议应封装，域的事实、规则、专业求解、授权、业务 reducer/Effect 保留。SDK Standard 新抽取或实质共享能力须由至少两个实际独立用途证明复用价值；单一领域内聚 Business Element 可依据一个真实领域需求成立，普通函数/私有 helper 无此双用途门槛。已有低级独立入口仅在有实际价值时保留。无重复 Runtime/Registry/DSL/强制基类/强制 Context。

## EL-13 · 分类/发现

区别能力族与符号语义类别。公开值分为具体 Standard/Business/KDP Element、抽象 Element 契约、执行支持 Class、Error、公开 Function 等；独立 type/interface 分类并关联能力族。新具体 Element 默认 PascalCase + Element，现有明确语义例外有文档说明；不能按后缀判断。源码 TSDoc/JSDoc 记录类别/能力族与实际职责，生成期与 TS checker 的根公开面及可调用成员/相关公共属性核验；Skill 以需求/场景导航完整能力目录，包含适用/不适用、构造/静态/实例/符号成员和调用限制。继承契约引用一次，标准语言/外部库继承成员不冒充 DH 能力。注释不产生运行时身份/分派。

## EL-14 · 易用及防误用

普通正确路径优先，封装稳定通用协议、隐私、生命周期及必要配对；明确同步/异步、失败结果和未完成不可当成功，提供最小可运行正例及重要反例。不得隐藏业务权威、预算、副作用或必需专业判断；纯低级工具的调用者责任必须明确，不宣称对任意可信业务代码的沙箱。

## EL-15 · 演化

以实际变更原因隔离职责；比较 API/依赖/契约影响、维护局部性和真实消费者迁移；保留有价值公开合同，必要变更经 L2 独审更新独立预期及消费者。不恢复旧0.10.x兼容模型。当前未发布阶段的有理由 API 改变允许，但不能误报历史工件身份或静默删功能。

理论依据：Parnas [信息隐藏](https://doi.org/10.1145/361598.361623)、Evans [DDD](https://www.domainlanguage.com/ddd/reference/)、Larman GRASP、Ousterhout 深模块、Meyer [契约式设计](https://www.eiffel.com/values/design-by-contract/introduction/) 及 [API 学习研究](https://www.microsoft.com/en-us/research/publication/field-study-api-learning-obstacles/)。理论用于职责判定，不代替实际消费验证。
