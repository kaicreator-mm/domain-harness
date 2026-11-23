# Native Domain App 生成期验证

运行入口使用 `@kaicreator/domain-harness` SDK 的原生 ESM Package 和 Class Element。作者/Agent 在生成完成后可以**显式执行**：

```sh
node scripts/validate-native-generation.mjs --manifest examples/native-domain-app/package.json --core examples/native-domain-app/packages/kdp.mjs --core examples/native-domain-app/packages/business.mjs
```

该工具使用 TypeScript AST 读取普通 ESM 代码中的静态 `packageMeta`（id、role、order），检查 KDP Order=0 唯一、所有 Core Order 非负整数互异、直接 npm import 是否列入 App 的直接依赖、相对导入文件存在，拒绝动态 import 和动态 Order。**不会 import 或执行 Package、不会生成 Package、不会成为 SDK Runtime 的动态插件安全/正确性验证器**。执行前可用 `npm run test:generation` 测正反例。

它只验证此小型静态组合 Profile 的确定条件；正式领域 Function 的 DIS 业务合同、行为、TypeScript 类型、外部真实 npm 安装与版本交付证据仍由生成者分别完成，并不因此被自动标记 PASS。
