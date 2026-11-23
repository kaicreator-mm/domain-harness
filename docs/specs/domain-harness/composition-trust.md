# DomainHarness · 生成期、静态组合与交付

> [权威目录](./README.md) · 静态可信设计 **CONFIRMED**，旧 Lock/Pin/安装 Record 机器实现 **MIGRATION_REQUIRED**。

## GEN-01 · 信任前提

DomainHarness SDK 与 Domain App 是**静态、可信、开发者拥有与可控**的应用。Package 为构建/安装时确定的插件，不承担运行时未知代码热加载、恶意 Package 沙箱或动态安全证明。

## GEN-02 · 生成者负责正确性

人、Agent、工具均可编写/修改普通 TS 模块、Class、Function 和代码元数据；生成者承担结构、业务行为、Order、直接依赖、API、资源、适用类型与测试的正确性，必要时用独立 Validator/ESLint/tsc/测试。**SDK 不做这些正确性检查，不强制 Forge 或生成器。**

## GEN-03 · 静态插件与依赖

Domain App 显式 import 需要的 Package、标准 Element/业务 Class，使用 `package.json#dependencies` 与 `exports` 管理直接引用。不得依靠传递依赖提升来隐性访问第三方包；这由生成期工程检查发现。普通调用是 TS 原生方法/函数，没有额外 Extension Registry/PackageSystem/FunctionRef 动态调用链。

## GEN-04 · 交付机制

使用 Node/npm 标准依赖解析、`package-lock.json`、`npm ci`、类型/单测、可信发行和必要软件供应链证据。**取消 DomainHarness 专用 App Lock、Boot Pin、InstalledRecord、SelectedFunction/Target、运行时 Digest/权限校验**，不是取消常规版本控制、依赖锁和交付质量保证。

## GEN-05 · 运行期责任

框架只读取执行所需代码元数据（如 Order）、调用已组装的生命周期/业务功能、最终错误 Exit；不解析 TS/JS 源码、重算依赖图/权限、检验安装字节/Pin、修复生成缺陷。业务输入与业务鉴权仍照常由业务处理。

## GEN-06 · 故障边界

静态可信仅表示代码/依赖/安装由拥有者管理，**不保证运行永不出错**；网络/磁盘故障和未处理异常可能发生，KDP 最终兜底记录日志并尽力清理。恶意改写安装文件后的安全性不属于本 SDK 的运行时保证。

## GEN-07 · 不引入新强制工具

不因新映射而建立独立 Package Assembly 服务器、Forge、第二语言 Runtime、强制 Manifest 生成器或生成期专用自制 JS 子集解析器。静态质量可用成熟 TS/npm 工具与具体场景需要的轻量检查；修改规范不得将工作转移到 v0.11.2。
