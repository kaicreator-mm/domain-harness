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
