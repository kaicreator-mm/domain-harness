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

## 6. R4.2 Demo 自对抗：投影资格与初始化竞态

本轮在 R4.1 的真实 `buildV10App → load → App Init` 成功证据上继续审查，发现两个跨越编译与激活边界的缺陷：

1. **P1：只读路由对象可以被整体伪造或在激活时换用另一份 Built App。** 仅比较 `subjectDigest` 的公开字符串无法证明某个调用方提供的投影确实由编译/验证步骤生成。修复：由 `compileProjection()` 在模块私有 WeakMap 中给原始投影登记可信构建对象及选定 Function/Package/Handler 指纹；`createActivation()` 只接受已登记的原投影与同一 `V10BuiltApp` 实例，`start()` 在真正 `load` 前再次比对选定构建闭包指纹和模块源码摘要。不能从外部输入自颁证据。这个 WeakMap 只是进程内 Demo 的真实性证明，**不是跨进程签名或正式 AOT 发布凭据**。
2. **P1：`stop()` 与异步 `load()` 并发时可能将已停止的 App 重新置为 READY，或未关闭迟到返回的 SDK facade。** 修复：在真实 SDK `load` 完成后及 Business Init 完成后分别检查启动状态；已停止则以 `APP_START_CANCELLED` 拒绝，关闭真实 SDK facade，保持 STOPPED；二次启动也不可重复初始化。

同时修复 `invoke` 未提供参数时抛原生解构 TypeError 的问题，统一为 `INGRESS_INPUT_INVALID`。保留 R4.1 原有 18 项测试，新增 6 项负面/竞态用例，合计 **24 项**。它们在同一 `dis-v020-integration` Woodpecker lane 中通过真实 BUILD/SDK 路径验证。

**验证边界**：在本 R4.2 精确 SHA 对应 CI 得到成功回执之前，只记录 `COMMITTED_PENDING_CI`，不继承前一提交的 PASS。示例中依赖闭包内自建代码仍视为可信；不恢复 OS 级任意敌意原生代码隔离门禁。业务权限、KDP Effect 与回执、Package 源码真实性和失败清理保持强制约束。真实进程重启/持久化投影资格和正式 DIS v0.2.0 SDK 原生 ABI 仍需后续实现。

## 7. R4.3 全 AOT 闭包读回与负面回归

继续对 R4.2 的 selected BUILD fingerprint 做逆向检查，发现只记录部分 module/route 字段会遗漏 `hardBudget`、`loadOrder`、`externalImports` 等重要编译选择。R4.3 改为对**整个选定 `V10BuiltApp` Plain Data** 计算一次编译时指纹，并在调用真实 SDK `load` 前重新计算；所有选定模块源字节摘要与当前已锁定 Business Init 源摘要也再次核对。保留真实 BUILD 自己的 `subjectDigest` 原语义，**没有伪造一个新原生 SDK Digest**。

在 R4.2 的 24 项测试基础上新增 3 项：合格投影构建完成后修改预算、调换选定 Package `loadOrder`、放宽单个 Package 原生导入许可。三者都必须在实际 SDK 激活前返回 `AOT_ACTIVATION_DRIFT`。因此本次桥接 Suite 共 **27 项**，与专用 Woodpecker 现有真实 KDP Effect Gate/C01 回归一起运行。

此处的 `selectedFingerprint` 是对**同一进程中可信、封闭构建产物**的短期一致性校验，不能替代正式的跨进程签发、持久化安装证明及 DIS 0.2.0 原生 AOT/SDK 契约。只在精确提交对应 CI PASS 时记录 `REAL_BRIDGE_DEMO_PASS`。

## 8. R5 Demo-first：可持久化 AOT Projection 恢复及真实 KDP 状态复用

R4.3 的资格基于进程内 `WeakMap`；一旦进程退出，该标记必然消失。**不能将序列化后的 Projection 对象直接当作有执行资格的 Runtime 票据**。本轮补上两个分别受信任的输入：

- **可持久化声明**：`exportProjectionRecord(qualifiedProjection)` 输出仅含已编译 DIS Manifest、Projection Digest 与选定 BUILD 完整指纹的普通 JSON 数据。不是新可执行模块、不是第二 Kernel，也不自带授权。
- **独立安装信任锚**：`restoreProjectionRecord(record,freshBuilt,{expectedProjectionDigest})` 必须从**独立可信安装/部署记录**取得预期 digest；缺失锚点/篡改记录/版本或 BUILD 内容漂移全部拒绝。恢复时重新执行真实 `compileProjection` 对选定 BUILD/Package Function/Resource 进行完整核验并重建**当前进程内部资格**，不得接受从外部恢复的 WeakMap 标记。

新增 7 项 Demo 测试：普通 JSON 往返与新 BUILD 激活、缺独立锚点、修改 Element.Function、安装锚不匹配、重建 BUILD 预算漂移、**同一真实 KDP 内存 CAS 状态下停止并重新激活后验证旧 message idempotent replay**，以及**单独 Node 进程通过已保存 Projection JSON + 真实 BUILD 重建资格并完成 Business App Init**。此测试仍采用 `PlainCasDocStore` 共享进程内存；跨进程持久性只证明 Projection 恢复，**不冒称已经验证物理 SQLite/Journal 重启恢复**。对应后续测试可复用现有 KDP Host SQLite 的实际 Consumer，但本次不再创造新的持久存储或 Host 机制。

这是一项 Demo 用兼容性接口，不等于 v0.10 BUILD 已原生封装 DIS v0.2.0 Projection；生产晋升仍需要正式打包签发/部署信任锚、真实存储与恢复/撤销策略及独立审核。R5 预期桥接测试总数 **34**，实际 PASS 以匹配当前精确 SHA 的 Woodpecker 回执为准，不继承 R4.3 的 27/27 回执。

## 9. R6：两个真正不同的 Business Domain 与物理 SQLite KDP Journal

见 [PHYSICAL_TWO_DOMAIN_R6.zh-CN.md](PHYSICAL_TWO_DOMAIN_R6.zh-CN.md)：在已有 R5 投影恢复机制上，以原有订单审批 Business + 独立库存预留 Business 的同一真实 BUILD，验证不同 Function/Policy/Workflow 受同一 KDP 管理；真实 SQLite CAS 写入、彻底关闭、第二 Node 进程再构建和恢复原始消息与 KDP Journal。所有原生 I/O 限制在临时 SQLite 文件；仍不要求用户已排除的任意敌意 Native 代码 OS 沙箱。
