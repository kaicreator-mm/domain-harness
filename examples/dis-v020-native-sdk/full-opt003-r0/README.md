# full-opt003-r0 — OPT-003 本地 data-only Evolution Slot 激活生命周期（R211 Lane O3）

Lane 写集内唯一新增能力：在选中 AOT/SDK 本地进程内，对一个 **data-only rule slot** 执行
完整激活生命周期正例链，并锁定全部必备负例。前序 `o3-*`（bounded shadow interpreter、
shadow rule、task pin、epoch preflight、revocation negative）**不重写**，本目录仅补
Full 范围的激活语义。

## 文件

- `evolution-slot.mjs` — 主模块（稳定 ABI，供 O4 lane 消费，见文件头注释）。
- `evolution-slot.test.mjs` — 13 个结构/负例测试（typed mock app；伪造代码零执行、
  cancel 竞态、wrong-task、stale epoch、rollback、restart 失效、深度/步数预算）。
- `full-opt003-native.test.mjs` — 真实选中 xDownload AOT→public SDK 上的完整生命周期
  正例链 + native 负例（2 个 test，内部多断言）。

## 正例链（native 全绿）

1. `loadSlot()`：data-only slot 位于 AOT 锁定候选集内（functionId 被选中、digest 重算一致）。
2. `activateForTask()`：**原子**激活——装载校验、epoch 发布、task pin 一步同步完成，
   无中间可见态。
3. `executeTask(token)`：激活后真实 SDK 观察被 rule 数据驱动改变（未激活拒绝
   `OPT003_SLOT_NOT_ACTIVE` → 激活后 `RULE_MATCH`/`ALLOW_DATA_ONLY_SHADOW`；
   数据不匹配则 `DENY_RULE_MISS`）。
4. `revokeSlot()`：吊销立即失效（同形态再执行走 `OPT003_SLOT_REVOKED` 拒绝路径）。
5. `rollbackTo(epoch)`：回滚到激活前状态，`state()` 可验证（`activeDigest===null`）。
6. 重启语义（测试锁定）：激活态 **process-local，重启后显式失效**——新协调器实例
   持有旧 pin 直接 `OPT003_PIN_NOT_ISSUED`，不接受调用方重放的激活声明。

## 负例（全部 fail-closed，含测试）

- forged code：slot 内塞可执行代码（`(function(){...})`、`import("fs")`、`eval(...)`、
  箭头函数字符串、额外 `code/run/exec/import` 键、函数值、Proxy/accessor 载体）→ 解释器
  拒绝装载，**零代码执行证据**（全局无副作用标志、native invoke 计数为 0、SDK 无
  `activateLocalRule` 热装载入口）。
- 未授权 slot（AOT 候选集外 functionId）→ 在 prepare 阶段即拒绝。
- restart 后 stale pin / 过期 epoch → `OPT003_PIN_NOT_ISSUED` / `OPT003_STALE_EPOCH`。
- cancel 竞态：取消后到达的执行、以及 native 观察在途期间到达的取消 →
  `OPT003_TASK_CANCELLED(_DURING_EXECUTION)`。
- wrong-task：被后继激活取代的 epoch 的 pin、跨协调器 pin 重放 → 拒绝。
- bounded 解释器：白名单 op 集（仅 `eq`）、深度/步数预算，超限显式拒绝且 fail-closed。

## 诚实边界

本 lane 的一切激活均为**本地、进程内、data-only**。不是 Host 认证激活 ABI、不是
已安装/已资格 Rule、不发 Experience、不 dispatch Effect；所有 outcome 携带
`authority:'NONE'`、`hostAttested:false`、`effectDispatched:false`。无静默 SKIP；
native 权威证据仅来自 `full-opt003-native.test.mjs` 对真实选中 BUILD/SDK 的执行。
