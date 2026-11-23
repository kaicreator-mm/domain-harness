# Native Domain App 生成期验证

运行入口使用 `@kaicreator/domain-harness` SDK 的原生 ESM Package 和 Class Element。作者/Agent 在生成完成后可以**显式执行**：

```sh
node scripts/validate-native-generation.mjs --manifest examples/native-domain-app/package.json --core examples/native-domain-app/packages/kdp.mjs --core examples/native-domain-app/packages/business.mjs
```

该工具使用 TypeScript AST 读取普通 ESM 代码中的静态 `packageMeta`（id、role、order），检查 KDP Order=0 唯一、所有 Core Order 非负整数互异、直接 npm import 是否列入 App 的直接依赖、相对导入文件存在，检查字面量 `import()` 的直接依赖；不拒绝正常语言语法，计算的 `import()` 目标会标记 `GEN_PARTIAL_REVIEW_REQUIRED` 并要求作者复核 和动态 Order。**不会 import 或执行 Package、不会生成 Package、不会成为 SDK Runtime 的动态插件安全/正确性验证器**。执行前可用 `npm run test:generation` 测正反例。

它只验证此小型静态组合 Profile 的确定条件；正式领域 Function 的 DIS 业务合同、行为、TypeScript 类型、外部真实 npm 安装与版本交付证据仍由生成者分别完成，并不因此被自动标记 PASS。

仅对显式传入的 Core 入口文件中已覆盖的静态条件才可得到 `GEN_VALIDATED`；这**不代表全 App 依赖闭包完整通过**；出现运行时计算的导入时工具报告 `manualReviewPackages`，CLI 返回非零退出码，不将无法静态证明的依赖冒称通过。作者可采用项目适用的 npm/TypeScript/ESLint 工具和代码审查补足证据，这不是一套 JS 语法白名单。

对执行元数据要求纯字面量语义，不允许重复字段、展开或 getter 覆盖 Order；普通 TypeScript 的 `as const`、`satisfies` 及括号表达式合法。检查 `.ts/.mts/.cts` 使用 TypeScript AST，不据此限制普通业务 Class/Function 使用标准语言特性。

## R149 限定静态保证

元数据必须由 `export const packageMeta` 的直接字面量提供。验证器拒绝明显的直接属性赋值、重新赋值、`Object.assign` 改写与非常量绑定；发现简单别名时要求作者复核（`GEN_PARTIAL_REVIEW_REQUIRED`），不将无法证明的动态 Order 冒称确定。此工具**不是通用 JS/TS 数据流证明器**，更不在 SDK Runtime 重做正确性检查。

`import type`、纯 `type` 重导出可使用直接声明的 `devDependencies`；值导入仍需直接运行依赖。相对导入只确认实际文件，TS NodeNext 明确扩展名的 `.js → .ts/.tsx`、`.mjs → .mts`、`.cjs → .cts` 允许源码验证；不是完整 TypeScript 编译器或全图 npm Resolver。对于其他未遍历文件的依赖行为，生成者继续用项目 Typecheck、ESLint 和实际 App 测试验证。

R155 定点修复：对 `const alias=(packageMeta)`、多层括号及 TypeScript 的 `as`、`satisfies`、非空断言、类型断言包装做不改变值语义的 AST 解包。简单别名被识别时，静态检查只返回 `GEN_PARTIAL_REVIEW_REQUIRED`（CLI 退出码 3），绝不宣称动态变更后的 Core.Order 已得到静态证明。这是生成者侧的限定辅助工具，不引入 SDK 运行时正确性校验，也不承诺全程序数据流分析。
