# DomainHarness · 工程质量、日志、配置与证据

> [权威目录](./README.md) · 工程质量 **CONFIRMED**，旧 Target/Pin 框架相关历史测试待迁移。

## QA-01 · 正确性在生成期

人/Agent/工具作为作者负责生成和修改 TS Package/Element/Function、元数据、Order、依赖和业务行为的正确性；可使用 `tsc`、ESLint、测试、正常 npm 工具与实际必要的静态检查器；SDK 运行时不重新证明。

## QA-02 · 提交前验证

代码提交和 PR 前运行适用的语法/Typecheck/Lint/修改相关测试及必要正反例。失败先修复或记录 BLOCKED；不虚报 PASS。当前环境能等价验证就先自身验证；真实外部 Host/Registry/OS 需要时才使用 Woodpecker，不重复无必要 CI。

## QA-03 · GitHub / 独立审核

有限 Task DAG、Exact SHA、独立非 Writer Review、真实 Woodpecker/测试收据。历史审核不自动涵盖新 SHA。遇 CI 失败查实际第一失败步骤、脱敏错误与重现方式；不创建持续运行的本地 Agent 任务。

## QA-04 · 新架构验收样例

必须验证静态 import 的 KDP/Standard/Business；元数据 Order=0 和有序核心链；生成期拒绝 Order 重复/非法依赖；无 Init Package 跳过、有 Init 明确执行；原生 Package Function 与 Element public/static/#private；重复 Init 策略；实际进入逆序 Exit；业务 Workflow 通过 Standard XState 产生成功/UNKNOWN/ASK/WAIT；KDP 未处理异常记录日志、尝试 Exit；真实 npm 安装消费者只直接依赖 SDK。

## QA-05 · 旧执行模型清理

迁移后删除/重写旧 `FunctionRef/ImplementationBinding/SelectedFunction/Target`、`PackageSystem` 动态调用、`Lock/Pin` 自定义安装校验和静态 JS 子集运行时门禁对应的代码/测试。不能为了旧系统限制 TypeScript 正常语法；npm 供应链/可控 lifecycle scripts 等仍可作为交付政策。

## QA-06 · 日志与错误兜底

业务预期错误由 Element 处理；框架最终未捕获异常提供结构化脱敏日志和真实 Exit Hooks，原始根因可诊断；退出失败继续尝试其它清理，不假定强杀或断电必然执行退出。

## QA-07 · 配置

交互式应用可先以受限配置界面启动，配置完成再允许业务操作；CLI/服务/容器遵守自己的启动参数/环境约定。SDK 不强制具体 UI 或配置文件格式。

## QA-08 · 版本与质量边界

v0.11.x 是完全重写，不提供 0.10.x 运行时兼容桥；现有 Workflow/Reader/Outcome 有用能力迁移新 Class，不因删除旧 Adapter 丢失业务功能。性能和业务资源预算按具体标准组件需求验证，不虚构普适恶意输入沙箱承诺。
