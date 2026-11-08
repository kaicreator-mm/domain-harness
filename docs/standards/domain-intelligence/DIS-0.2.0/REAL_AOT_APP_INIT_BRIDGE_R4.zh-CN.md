# DIS v0.2.0 — R4 真实 BUILD/KDP/SDK Element / Function / Business App Init 桥接 Demo

**状态：Product/L1 实验性消费方案。不是现有 v0.10 SDK 的正式 DIS v0.2.0 ABI，不是 L2 Freeze。** 权威 Issue #1496 / PR #1497。

## 1. 最新信任边界

根据当前 Product/L1 裁定：在自建、已审核并封闭的 Package 代码闭包内，原生代码是可信构建产物。**不再把任意不可信原生代码的 OS 级隔离作为 DIS 0.2.0 的交付门禁。** R3 F02 中关于任意敌意 Native Addon 的威胁按范围裁定 SUPERSEDED_BY_SCOPE，而不是被证明修复。历史 native-isolation Demo 保留作实验，已从 DIS 专项 CI 必须执行路径移出。业务 Effect 的 KDP 准入、Journal、真实回执、版本及权限边界仍必须保持。

## 2. 现有真实 SDK 接口与限制

真实 BUILD：tooling/build/dist/index.js 的 buildV10App 生成精确 Package/Function route/Target/module source digest 和 V10BuiltApp.subjectDigest。真实 Microkernel SDK：packages/microkernel/dist/index.js 的 load(app,options) 消费已封闭 Build，并由 KDP 执行和治理 Effect。现有测试资源：tests/assembly/helpers-v010.ts 的 basicComposition() 与 PlainCasDocStore。

**重要兼容性缺口：** 现有 v0.10 BUILD 没有原生 Element/Function 及 Business App Init 的通用机器契约。因此本 Demo 使用另外一个可计算 digest 的 DIS Projection Sidecar，并验证它指向实际 BUILD 选中的 Business Function/Intent、Capability Handler、Target 和 Module 字节；不能将 Sidecar 假称为已进入 V10BuiltApp.subjectDigest 的原生字段。

## 3. 桥接步骤（真实构建和激活）

1. 从 basicComposition() 调用真实 buildV10App，生成 selected KDP/SDK/Business/Capability 闭包。
2. DIS Element.Function 声明只映射到已被 BUILD 选中的 Business intent 与明确 Capability route，拒绝缺失 Public Function/未选 Package/静态 Element 依赖环/Target 漂移。
3. 唯一 Business App Init 的源码有独立 SHA256，并绑定到 DIS Projection digest；init 不能伪称是 v0.10 BUILD 已实现的技术 Package init。两者是两个逻辑阶段。
4. 调用真实 Microkernel load 完成技术激活后，运行已声明的唯一 Business Init。READY 才开放必需 ingress；DEGRADED 只能关闭显式 optional ingress；重复 Init、Init 失败或未 READY 时一律拒绝并关闭 facade。
5. 对外 Function 调用转交真实 SDK app.send，沿现有 KDP 执行路径处理业务输入、准入、效果和回执。桥接本身不新增 Effect 权限。

## 4. Demo 命令和验证门槛

npm ci
npm run build
node --import tsx --test examples/dis-v020-real-aot-bridge/aot-bridge.test.mjs

16 项独立测试覆盖：真实 BUILD/SDK、合法绑定和业务入口、KDP 对不满足业务要求的请求、两层初始化、唯一性、必需入口降级拒绝、版本/源码摘要/权限/依赖负例。使用实际 KDP/SDK 和内存 CAS，但不是外部设备或者真实 GitHub 效果。

Woodpecker 专用 dis-v020-integration 流水线增加该 Demo，移除不再符合最新信任边界的强制 OS 权限模型测试。**没有新增 Node 主版本检查**；旧 v0.10 ABI 的 Target Profile 和历史 CI 保持原有身份，不在此次 Demo 里改写。

**诚实状态：** 源码已静态检查，实际 BUILD/SDK 端到端 16 项结果以最终对应 HEAD 的 Woodpecker 回执为准。无回执不能标为 PASS。后续仍需将 Element/Function/App Init 真正纳入下一代 AOT 与 SDK 的正式 Contract/ABI，并验证重启、持久化、真实多 Domain 消费。

## 5. R4.1 Demo 自对抗后直接修复

在最初 16 项真实 BUILD/SDK 桥接测试对应的 Woodpecker PASS（精确 HEAD `59f5fbc1fbe7f8970ba91cafc708d6bff0c0c12f`，pipeline https://ci.kaicreator.com/repos/18/pipeline/2206/1）后，再次检查版本锁定可信性发现：

- **P1：投影内 Route Map 仍可通过其 `.set()` 直接修改。** 单层 `Object.freeze({routes: map})` 不会冻结 Map 内容；修复为无 setter 的只读 Route View，且返回的声明 Manifest 递归冻结。
- **P1：App Init 被当作调用方可替换 callback。** SHA256 虽锁定了原始 Business Init 源码，但调用方仍能传入另一段函数，造成“锁定 A、运行 B”。修复为桥接运行时**仅调用所选 Business Init 模块的固定导出**；拒绝把外部 callback 当作权威。阻塞/降级负例由被锁定模块自身的 Demo 配置触发，保留完整可测性。

原先 16 项测试保留，并新增 2 项负面验证：Route/Manifest 的不可变性，以及尝试注入外部 Business Init callback 无法改变已选源码行为。**R4.1 精确 HEAD 的 18 项测试须重新取得 Woodpecker PASS，不能把 R4 的旧 PASS 继承给变更后代码**。本阶段仍是 Sidecar Bridge 而非已发布 SDK ABI。
