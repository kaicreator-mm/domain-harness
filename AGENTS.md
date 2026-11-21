# DomainHarness 代码规范

唯一当前实现版本为 0.11.0。旧版本源码仅通过 Git 历史参考，不保留兼容入口。

1. 修改 TypeScript 前必读 [TypeScript 编码质量 Skill](.agents/skills/typescript-quality/SKILL.md)。
2. 源码放入 `src/`，公共 TS 标识符和路径不得携带版本号；代码注释和 JSDoc 必须为中文。
3. 四个核心工作空间各司其职，不另建重复 Runtime、Kernel、BUILD 或私有 SDK。
4. 按照 `docs/product` 的 0.11.0 PRD 和 `docs/architecture` L2；旧代码不是兼容要求。
5. 每个完整模块执行 `npm run verify` 后再进行必要独立审核，禁止以 Demo Scoped PASS 代替源码质量审核。
