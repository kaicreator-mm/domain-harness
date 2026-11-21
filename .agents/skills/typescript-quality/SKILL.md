---
name: typescript-quality
description: DomainHarness 的 TypeScript 源码设计、重构、审查、中文注释及质量检查约束。
---

# TypeScript 编码规范 Skill

参考 Apache-2.0 的 [TypeScript Best Practices](https://github.com/gohypergiant/agent-skills/blob/main/skills/accelint-ts-best-practices/SKILL.md) 和 [typescript-eslint 官方规则](https://typescript-eslint.com/users/configs/)。本 Skill 为本仓库自行编写的具体要求。

- **架构**：仅 Contracts/BUILD/Microkernel/SDK 一套职责和公共入口。旧源码通过 Git 历史追溯，不在当前源码树中保留兼容或二次实现。
- **命名**：领域含义命名 `Element`、`BuildInput`、`buildApp`；不得出现 `V10ScopedSubscriptionEvent`、`V011BuildInput`、`buildV011App`、`src/v011`、`./legacy`。npm 版本号和机器序列化 schemaVersion 不属于版本化标识符禁令。
- **类型**：严格 TypeScript；`unknown` 收敛输入，尽量采用只读数据、判别联合、确定性错误码；不得通过 `any`、粗暴断言或默认成功掩盖未知条件。
- **选型与复用**：先用 Node.js/JavaScript 原生能力和仓库现有可信依赖，再评估成熟、维护活跃、许可证合适且兼容 Node 22/ESM 的库；不自行实现通用解析器、加密、Schema 验证或状态机来替代合适的成熟方案。新依赖与自实现均遵循 [防回归手册 §1.1](../../../docs/engineering/DOMAIN_HARNESS_V011X_DELIVERY_QUALITY_PLAYBOOK.md) 的取舍和验证要求，避免不必要的依赖/框架。
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

## 0.11.x 增量交付：从 0.11.0 R12/R15 复盘继承的强制工程做法

先阅读 [增量交付质量防回归手册](../../../docs/engineering/DOMAIN_HARNESS_V011X_DELIVERY_QUALITY_PLAYBOOK.md)。进入 0.11.1+ 实施前，在**原有 Task Issue** 简要列出当前改动的职责所有者、信任边界、资源/Effect 权限、状态副作用以及必测 POS/NEG/ERR；不要把这个步骤扩展成额外审批链。

1. **先证伪，再提交**：新增 Schema/Hook/Function、资源授权、入口 ID、Pin/Lock、生命周期、对外 Snapshot 等边界，必须同时具备该边界的拒绝或 UNKNOWN 反例。输入未验证、重复 ID、越权资源、非规范 JSON/错误 Digest、恶意修改共享引用属于真实历史反例，不可只测 READY/SUCCEEDED。
2. **防止类型/Fixture 旧路径回归**：修改 exports、ESM 构建产物或第三方依赖时，同改真实包根 Consumer 和测试 Fixture；测试非法值仅在 tests 局部构造，公共 ABI 继续 readonly。四包测试 Typecheck 已由 `npm test` 和 lint 静态结构闸门覆盖；不得删除步骤或手动跳过。
3. **运行时不替 BUILD 选实现**：BUILD 校验所有被选 Schema 的 inline/ref、依赖/唯一性和 Resource Digest；App Init 权限来自 `SelectedFunction.resources`，不返回全 Lock；Boot 先拒绝再 import，App 失败保持清理/UNKNOWN/FAILED 语义。
4. **提交前验证优先**：本地能执行等价检查时先验证受影响代码、测试和质量扫描；跨包/安装改动再用一次 `npm run verify`，不要先推 PR 跑多轮昂贵 CI。不要为每个 TypeScript 小修复单独安排独立审查。
5. **失败时一批闭环**：真实 CI FAIL 从 GitHub Exact SHA 和 Drive Logs 取第一失败步骤，收集同批问题去重；需本地环境时单次委派 Agent 完成诊断、必要修复、验证和提交，限轮次停止。其它会话独立审核只复核新增/变更边界，合并前检查当前 HEAD、base、CI、Review。
6. **P2 只在触及风险时带入**：RV-5～RV-9 为 0.11.0 已知未解决限制，不得静默写为 PASS；未触及的内容不额外阻断新功能。

具体命令、反例证据和 Issue 输出字段均以防回归手册为准，避免在多个 Skill 中维护两份易漂移的完整清单。
