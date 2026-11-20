---
name: typescript-quality
description: DomainHarness 的 TypeScript 源码设计、重构、审查、中文注释及质量检查约束。
---

# TypeScript 编码规范 Skill

参考 Apache-2.0 的 [TypeScript Best Practices](https://github.com/gohypergiant/agent-skills/blob/main/skills/accelint-ts-best-practices/SKILL.md) 和 [typescript-eslint 官方规则](https://typescript-eslint.com/users/configs/)。本 Skill 为本仓库自行编写的具体要求。

- **架构**：仅 Contracts/BUILD/Microkernel/SDK 一套职责和公共入口。旧源码通过 Git 历史追溯，不在当前源码树中保留兼容或二次实现。
- **命名**：领域含义命名 `Element`、`BuildInput`、`buildApp`；不得出现 `V10ScopedSubscriptionEvent`、`V011BuildInput`、`buildV011App`、`src/v011`、`./legacy`。npm 版本号和机器序列化 schemaVersion 不属于版本化标识符禁令。
- **类型**：严格 TypeScript；`unknown` 收敛输入，尽量采用只读数据、判别联合、确定性错误码；不得通过 `any`、粗暴断言或默认成功掩盖未知条件。
- **边界**：BUILD 负责编译与封存，Runtime 只读取 Pin/Lock 中选定资源；禁止运行期二次构建和未声明资源执行。
- **注释**：全部新代码、改动代码的注释和 JSDoc 必须为中文。解释不变量、生命周期与失败理由；不能保留与当前实现不符的旧版本注释。编译器指令 `@ts-expect-error` 保持语法，说明文字使用中文。
- **日志**：固定事件名、分级、有限状态；不得记录 Token、凭据、原始错误和未验证的用户字段。
- **验证**：`npm ci && npm run build && npm run typecheck && npm run lint && npm test && npm run test:demo`。对真实外部安装包执行同一个 Demo；发现失败修复根因，不弱化测试。
- **审核**：只有完整独立重构模块完成并验证时，或者遇到真实高风险阻塞时，才做一次必要的独立审核。


## 实际重构反例与审核清单

参见 [0.11.0 重构过程与工程经验](../../../docs/engineering/DOMAIN_HARNESS_V0110_REFACTOR_LESSONS.md)。在代码迁移和大规模清理时，还须落实以下要求：

1. **批量改名先检验语义**：不得把 `V011Error` 简单替换成 `Error` 造成 `class Error extends Error` 自继承；标准错误以 `globalThis.Error` 作为基类，领域错误使用不混淆的 `DomainHarnessError`。
2. **生产和测试各自类型检查**：测试 Fixture 与静态非法类型负例留在 `tests/`，不能作为 SDK 根出口发布；NodeNext 对第三方导入和测试相对路径的解析必须单独通过。
3. **版本字符串分类**：仅清除版本化内部路径、TS 标识符与旧版兼容导出；协议 `schemaVersion`、npm SemVer、被锁定的 Target profile 不得机械重写。
4. **代码注释采用中文并描述真实机制**；删除旧版注释后，应补回关键方法的职责、不变量与回滚原因，而非统一贴一行没有信息量的模板注释。
5. **切勿为通过 lint 弱化契约**：`Promise.resolve` 保持异步接口、Unicode 字符串按码点计数、`globalThis.structuredClone` 显式表达 Node 环境；忽略清理异常必须说明保留原始异常的理由。
6. **真实 Node.js 包导出检查**：具备 `exports` 的包拒绝未公开路径时通常是 `ERR_PACKAGE_PATH_NOT_EXPORTED`，不能强行要求 `ERR_MODULE_NOT_FOUND` 或通过开放兼容出口来通过测试。
7. **完整验证链**：`npm ci`、四包 build、源码与测试 typecheck、lint、必要单测、单一四 tarball clean-install Demo 对应不同关口。失败时记录首个真实失败和 NOT_RUN 的依赖项，禁止把前置失败变成虚假下游失败。
8. **单独模块一次最终独审**：源码质量的 ACCEPT 只能由完整闭环与适当独立审核得出；CI 重复触发、历史 Demo 成功或删除文件数量都不足以授予资格。
