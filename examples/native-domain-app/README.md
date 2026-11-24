# v0.11.1 原生 Domain App 与仓外 SDK 消费者

> **S04 · #1724 标准双角色组合候选**：T05 repair/AQI、T07 book/water 与 T06 Reservation 客户端共五个模块改用 SDK 根入口 `runRecognitionHandling(limits, recognize, handle)`。它复用既有 Session/Context，完整路径仍为 calls=2/steps=5/depth=1，只有识别 COMPLETE 才进入处理；业务自己的证据、知识、授权、数据库、命令身份、首次提交/恢复和 readback 均不改变。下文 T05/T06/T07 “没有 SDK 变更”等是历史收据，旧工件不含新增函数。本轮完整新工件与业务验收待 #1724，不能沿用旧哈希。

`node examples/native-domain-app/main.mjs` 通过唯一公开的 `@kaicreator/domain-harness` SDK 入口静态导入两个 ESM Core Package：KDP Order=0（有 Init）与 Business Order=2（无占位 Init）。业务 Module Function 和 Class Element 均由原生 JS 调用，不涉及旧 FunctionRef/Target。

同一个 OrderService 内复用一个 JsonReader 读取两份 JSON、一个 YamlReader 读取两份 YAML。**四次解析都通过实际 `NativeWorkflowContext.invoke()` 计入同一根 calls/steps 额度**，与父 Guard、子 Workflow、异步 start/run/end Hook 共享根预算。

验收包括正例及两个关键负例：
- calls=8/steps=10：Guard + 4 Reader + 子业务 Hook 完整成功，count=4、total=10
- calls=3：第三次 Reader 必须在执行前拒绝，前两次 Reader 的执行记录保留，理由 `WORKFLOW_CALL_BUDGET`
- calls=6：四次 Reader 执行后，子叶子 Hook 的 3 次调用额度无法预留，任何 start/run/end 副作用都不得发生
- steps=5：第三次 Reader 必须在执行前以 `WORKFLOW_STEP_BUDGET` 拒绝

真实仓外安装由 `npm run test:consumer` 执行：使用 `npm pack` SDK tarball，在临时独立 npm 项目中**只直接声明 SDK 一个依赖**并 `npm ci`，运行上述 App、编译 SDK .d.ts 并拒绝私有子路径。CI #3149 是旧示例修复前的历史收据；后续新 HEAD CI 才覆盖这些真实根预算正反例。

生成期可选检查工具 `scripts/validate-native-generation.mjs` 只读取指定 Core 入口的源码 AST 和直接依赖，不执行业务，不将 Package/Element 正确性校验移入 SDK Runtime。

## v0.11.2 T05：两个静态 Business 插件及双 Workflow

`intent/repair-quote.ts` 与 `intent/air-quality.ts` 是同一示例 App 中独立静态选定的业务 ESM 模块，使用不同领域的类型与只读知识；`repair-quote-revised.ts` 演示另选新知识修订。按原生 Package 插件规范，不要求每个局部插件独立发布 npm 包，没有生命周期需求也不生成空 Init。全部 SDK 调用只来自公开包根；不修改 SDK、旧 App 或 KDP。

- 维修规则为明确的合成示例（逻辑日、整数报价），按租户、业务、来源、修订、有效期查找，重叠冲突或不完整结果返回 UNKNOWN。旧 v1 与新 v2 通过各自固定的知识选择并存，嵌套对象和数组不可变，不运行时热更新。
- AQI 规则来源为 [AirNow AQI Basics](https://www.airnow.gov/aqi/aqi-basics/) 与 [AirNow National Maps](https://www.airnow.gov/national-maps/)（采集日期 2026-11-24）。六个整数分类区间为 0–50、51–100、101–150、151–200、201–300、301–500；本例仅接受 US EPA AQI 0–500，超过示例范围返回 UNKNOWN。输入观测是合成 fixture，不计算污染物浓度、不获取实时观测、不提供健康建议；规则来源与观测来源分别保留。
- 每个连续请求只建立一个 StandardWorkflowSession，Recognition 与 Handling 为两个静态子角色；通过 invokeOutcome 传播终态，完整识别后方可调用 Handling。精确正常额度 calls=2/steps=5/depth=1；额度不足时没有 Handling 入口调用。实例计数仅供示例见证，不是实际持久状态、权限或 Host Effect；T06 另行完成真实授权动作。
- `intent/verify.ts` 的八组验证由仓内 node:test 与仓外已安装 SDK Consumer 共用。Consumer 复制实际 TS 源码、严格编译成 ESM、运行相同验证，无新增直接 npm 依赖或私有 SDK 路径。T05 不冒称 T07 独立双领域生成/双平台完整 E2E。

## v0.11.2 T06：真实库存资源授权动作

`action/authority.ts` 是业务拥有的 SQLite 库存权威方；`action/host.ts` 仅监听 loopback，以独立 Node 进程提供实际 HTTP reserve/原尝试 readback；`action/client.ts` 是同一公开 SDK 的业务 Workflow/Tool 组合，独立持久 attempt DB。没有 SDK 变更、动态 Tool Registry 或中央 KDP Permit。库存实际扣减、版本递增、Effect 计数和权威 Receipt 均可从 SQLite 文件读回；这是业务示例的真实数据变更，不是生产商业系统。

- Owner 可信管理入口直接设置资源策略、凭据范围、批准和撤销，不对 HTTP 客户端暴露管理操作。Host 按真实 bearer 凭据哈希、主体、租户、资源及当前有效访问授权决定；请求不能选择 PREAUTHORIZED。PER_CALL 批准与固定 reserve 参数摘要匹配，原子绑定一个 command ID；SESSION 批准仅覆盖主体/租户/资源、单次数量上限、有效期及未撤销状态。批准不替代 Host 访问授权。缺批准返回 ASK，批准后是新的待提交命令 ID；原 ID 与原摘要仅返回原处置。
- Host 在同一真实 `BEGIN IMMEDIATE` 事务中检查权限/批准和资源版本，绑定批准、执行条件库存扣减，然后写 Effect 及 attempt/receipt；任一步失败不宣称 COMPLETE。同 ID/同摘要返回原处置，同 ID/异摘要拒绝。不同客户端、独立 Host 进程可竞争同一个 DB 资源；不是本地进程锁或事后 CAS。
- 客户端 Recognition/Handling 共享一根 Workflow 预算。R58 明确要求可信业务调用者使用 `ReservationElement.run(input, limits, 'FIRST_SUBMIT' | 'RECOVER')`：只有明确的新逻辑命令（新 ID）才选择 FIRST_SUBMIT；缺失或非法模式在 Recognition 拒绝且无网络请求。同一账本已记录的 ID/摘要永远只读回；RECOVER 即使账本丢失/为空也预记后仅发送 readback，未观察到原尝试保持 UNKNOWN。空账本不能证明这是首次提交；错误地向全新账本声明 FIRST_SUBMIT 不在恢复保证之内。Host 对已观察的重复首次交付仍去重，不宣称能从未观察到的 ID 推断历史。若响应丢失、记录失败或无法读回，返回 UNKNOWN，不盲目重播。当前权限或协议拒绝（HOST_ACCESS_DENIED / READBACK_NOT_AUTHORIZED / HOST_REQUEST_DENIED / HOST_INPUT_INVALID）仅说明本次请求被拒绝且无法确认历史处置，不能当作逻辑命令已 REJECT，也不泄露历史是否存在。已证明的 Receipt 不被后续 UNKNOWN 覆盖；同主体重新获得当前访问权后可恢复精确历史 Receipt，批准撤销阻止新动作但不阻止有当前访问权的历史读回。真正的权威拒绝/ASK 和命令身份冲突仍保留。两个库不具备分布式 ACID，不提供全局识别错误重投意图或自动重试未知动作。
- `action/verify.ts` 八组实际进程/网络/SQLite 负例和正例由仓内 node:test 与真实仓外 SDK-only Consumer 共用；故障代理只在测试中转发实际 HTTP 后断开 ACK 或转发前断开，亦通过关闭真实客户端连接触发本地记录失败。正式 Host 无故障注入入口。Consumer 编译所需 Node 类型来自仓库开发工具链，运行依赖仍只有 SDK；T05 原 SDK 声明门不变。
- 边界：可信 Owner 管理接口与本地 loopback HTTP 仅作最小真实授权/资源协议，生产部署需 TLS、可信身份/批准 UI、运维与长期恢复机制。未实现第三方不可事务化 Effect 的原子性，不承诺通用分布式 exactly-once、任意恶意进程沙箱或真实物理故障注入。T07 才做完整双平台和陌生领域生成验收。

## v0.11.2 T07：同一 SDK 的新领域组合验收

`combined/book-catalog.ts`、`combined/water-hardness.ts` 是两个新 Business Package 的静态模块入口，原生 TS Class 与普通 Function；不引入 Loader、Registry、空 Init、额外 npm 依赖或 SDK 内领域 Schema。生成依据见 [T07 generation and acceptance record](./combined/GENERATION.md)。`combined/verify.ts` 使用同一外部安装的 SDK，同时运行两个领域的 Recognition/Handling 与真实 SQL 目录、Top-K、有向关系图、有界 Expression；独立租户/网络范围、来源修订、时点、缺失/冲突、预算和不可变规则均有断言。

图书计划以 ISBN 校验与当前目录报价选择合成资源和数量；只有可信调用者明确发出另一逻辑命令且 owner 批准后才由未改动的 T06 Host 提交。先创建权威资源和实际独立 Host，验证只读计划与失败路径零 Effect；未批准 ASK，批准后真实库存 5→3、版本 0→1、Effect 恰好 1 次，RECOVER 返回同一 Receipt；另一个领域分类结果不变。两个独立逻辑根不构成同一请求预算重置。组合应用不声称真实图书出版/目录或水体观测，也不提供真实饮水安全结论。

`npm run test:consumer` 仍然在开发工具链 Node >=22.13 中执行编译和 pack，但可显式指定 **实际消费者** 的 Node 可执行文件 `DH_NATIVE_CONSUMER_NODE` 与其兼容的 `DH_NATIVE_CONSUMER_NPM_CLI`（npm CLI JS 文件绝对路径）。未指定使用当前 Node 和 npm；指定不同 Node 时从其发行目录寻找 npm CLI，也可显式指定。锁和 clean install 使用选定消费者 Node/npm，所有 ESM/Host 探针使用消费者 Node，TypeScript 编译继续使用开发工具链。无 Node 额外启动 flag 或 NODE_PATH 注入；输出记录实际 Node/platform/arch、npm 版本、包版本、tarball SHA256 与通过的门禁。Windows/Linux Node22.12.0 最低版本资格必须另取真实执行证据；CI 不能冒充双平台 PASS。SDK 版本标识在本内部阶段候选更新为 0.11.2，不等同正式发布。
