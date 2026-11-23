# DomainHarness · Language-Native SDK 架构

> [权威目录](./README.md) · 新设计 **CONFIRMED**；旧 microkernel/PackageSystem/Boot/Workflow 所有权 **SOURCE_REPLACED / MERGED**（PR #1694，R160 限定验收）；完整旧功能场景回归由 #1696 跟踪。

## ARCH-01 · 总体架构

```text
应用拥有者 / Agent / 生成期与可信交付
  └─ TypeScript / Node.js / npm（模块、函数、Class、依赖）
       ├─ DomainHarness SDK（一个公开产品）
       │    ├─ KDP（唯一 Order=0 生命周期根与最后错误兜底）
       │    └─ Standard Element Library（Workflow/XState、Reader、其它应用级能力）
       └─ Domain App / Kernel Business / SDK Business
            ├─ 普通 TypeScript 业务代码与自定义 Element
            └─ 优先 import / 组合适用的 Standard Elements
```

此图描述组件复用，不意味着所有调用必须逐层转发。

## ARCH-02 · Package 插件

Package = ESM 模块集合，由原生 `import/export`、npm `dependencies/exports` 实现静态插件组织。App 显式 import 选定插件/Core 集合，不在运行时发现下载插件，也不构建另一套 Package Loader/Dependency Resolver。

## ARCH-03 · Element 与 Function

Element = 内聚 Class，可组合、继承；组合其它 Element 的 Class 自身也是 Element；Package 不是 Class。Function = 模块函数/实例方法/静态方法，原生直接调用，不强制包装成可反射分派的运行时对象。

## ARCH-04 · Standard 与 Business

Standard 是 SDK 内置的、在语言/运行时之上的应用级通用能力。Business 是 Kernel/SDK/Domain App 的具体需求代码，优先复用 Standard，不够再自定义 Element。二者不是专用根类或固定的 K/S/B 三层；不强制 Node API 全面 Element 化。

## ARCH-05 · KDP 最小职责

KDP 是特殊 Core 根、Order=0；框架读取已显式静态组合的 Core 元数据，按 Order 启动，跟踪真实生命周期进入，逆序执行可选 Exit，最终处理未捕获异常。KDP 不拥有所有 Standard Elements、尤其不垄断 Workflow/XState 引擎；不为普通业务方法做中央派发；不承担代码正确性和安装安全证明。

## ARCH-06 · 启动入口不再做 Pin 动态选型

静态 App 入口直接 import SDK/KDP/业务模块，并按确定的 Core 集合启动；不保留依赖 `boot(pin, context)`、`kdp-host-init/1`、动态 Target 验证的第二自举系统。这些旧 ABI 通过 v0.11.1 重构替换，不建立新 runtime Lock/Pin/InstalledRecord。

## ARCH-07 · Workflow 解耦

Workflow 的接口由抽象 Class 定义，执行由 SDK Standard `XStateWorkflowElement` Class 实现；业务 Workflow 定义可被 Kernel、SDK 和 Domain App 复用。KDP 可以使用它，但不提供独占的 XState 控制引擎，不重建第二个 Workflow VM。

## ARCH-08 · 生命周期与兜底

没有 Init/Exit 则跳过；唯一 KDP 按 Order 协调真实生命周期，逆序退出；业务自己处理业务错误，框架未捕获异常只做日志、Exit 和失败退出。框架读取 Code Metadata，不读取 Skill/TSDoc 作为执行规则。

## ARCH-09 · 禁止的重复系统

禁止专用 `FunctionRef → Binding → Target` 动态执行层、旧 App Lock/Boot Pin/InstalledRecord 及运行时校验、Extension 权限 DAG/PackageSystem 插件 Loader、KDP 独占 Workflow 引擎、所有 Package 强制空 Init、全部 helper Element 化、Package 函数强制归属 Class、独立 Agent-only 执行元数据或 docs-only 假冒代码 PASS。
